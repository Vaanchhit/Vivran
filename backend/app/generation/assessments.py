"""Assessment Generation Engine (§14) & Question Regeneration (§15)."""
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from app.ai.cheap_model import generate_assessment_cloud, generate_cheap_cloud
from app.ai.premium_model import generate_premium_cloud
from app.ai.prompt_snippets import LEVEL_INSTRUCTION
from app.ai.schemas import AssessmentSchema
from app.ai.validators import validate_assessment
from app.core.config import settings
from app.core.errors import FailureClass, mask
from app.core.logging import logger
from app.retrieval.search import search_knowledge_base
from app.services.supabase_service import SupabaseError, is_configured, table_insert, table_insert_many, table_select

_SYSTEM_PROMPT = """You are Vivran's assessment generation engine for Indian school teachers and college professors (§14).
Produce a complete question paper as JSON matching exactly this shape:
{
  "title": string, "subject": string, "grade": string,
  "total_marks": integer, "duration_minutes": integer,
  "sections": [
    {
      "name": string, "instructions": string,
      "questions": [
        {
          "question_number": integer, "section": string,
          "question_type": "mcq" | "true_false" | "short_answer" | "long_answer" | "numerical",
          "question_text": string, "marks": integer,
          "difficulty": "easy" | "medium" | "hard", "bloom_level": string,
          "options": string[] or null (required for mcq, null otherwise),
          "answer": string, "solution": string,
          "source_ids": string[] (the exact chunk-id values, e.g. "S2", of any source excerpts this question draws on — [] if none apply)
        }
      ]
    }
  ]
}
The sum of every question's "marks" across all sections MUST equal the requested total_marks exactly.
Ground questions in the provided source excerpts when given, and cite them via "source_ids"; otherwise use
sound subject-matter knowledge and leave "source_ids" empty — never fabricate a citation.
Every question needs a correct, non-empty "answer". Do not repeat a question. Return JSON only.
""" + LEVEL_INSTRUCTION


def _build_prompt(grade: str, subject: str, topics: List[str], total_marks: int, difficulty: str, context: List[Dict[str, Any]]) -> str:
    lines = [
        f"Grade: {grade}",
        f"Subject: {subject}",
        f"Topics: {', '.join(topics)}",
        f"Total marks required: {total_marks} (must match exactly)",
        f"Overall difficulty: {difficulty}",
    ]
    if context:
        lines.append("\nGround the questions in these excerpts from the teacher's own uploaded materials. Cite by their tag (S1, S2, ...) in \"source_ids\":")
        for i, c in enumerate(context, start=1):
            lines.append(f"[S{i}] ({c.get('source_material', 'source')}) {c['content'][:600]}")
    return "\n".join(lines)


def generate_assessment(
    grade: str,
    subject: str,
    topics: List[str],
    total_marks: int = 40,
    difficulty: str = "medium",
    created_by: str = "system",
    workspace_id: Optional[str] = None,
    material_id: Optional[str] = None,
) -> Dict[str, Any]:
    context: List[Dict[str, Any]] = []
    if workspace_id:
        try:
            context = search_knowledge_base(f"{subject} {' '.join(topics)}", workspace_id, material_id=material_id, limit=6)
        except Exception as e:
            logger.warning("Retrieval for assessment generation failed (continuing ungrounded): %s", e)

    prompt = _build_prompt(grade, subject, topics, total_marks, difficulty, context)
    # Gated OFF by default (settings.premium_tier_enabled).
    #
    # This condition — hard, or 60+ marks — describes most real exam papers, and
    # on the current key every Pro-tier model answers 429. So the common case
    # was: spend a request to be refused, log "falling back", spend a second
    # request on the cheap tier, and produce precisely the paper the cheap tier
    # would have produced immediately. With the validate-and-regenerate loop
    # that is 1-2 wasted requests per paper out of the twenty available in that
    # minute — the same twenty the teacher's slides and worksheets need.
    #
    # The routing is kept, not deleted: the day Pro-tier quota exists on the key,
    # set PREMIUM_TIER_ENABLED=true and hard papers start using it again.
    wants_premium = settings.premium_tier_enabled and (difficulty == "hard" or total_marks >= 60)

    assessment: Optional[AssessmentSchema] = None
    validation = None
    last_error = None
    # Set only when the *upstream call itself* failed, as opposed to the model
    # returning content that failed validation. The two need opposite handling:
    # validation errors are useful feedback for the teacher and are shown
    # verbatim, while an upstream error is translated (app/core/errors.py) so
    # raw provider text never reaches the UI.
    last_upstream_failure: Optional[FailureClass] = None

    for _attempt in range(2):
        feedback = f"\n\nYour previous attempt was invalid: {last_error}. Fix it." if last_error else ""
        result = None
        if wants_premium:
            result = generate_premium_cloud(prompt + feedback, task="assessment_creation", system_prompt=_SYSTEM_PROMPT, json_mode=True)
            if not result.get("success"):
                logger.warning("Premium tier unavailable (%s); falling back to cheap tier", result.get("error"))
                result = None
        if result is None:
            # Stays on the authoring tier, NOT the SLM tier, and that is a
            # deliberate line rather than an oversight. The binding constraint
            # on a question paper is that every question's marks sum to the
            # requested total exactly, and arithmetic under a constraint is the
            # classic small-model failure. It would also be a false economy: a
            # paper that misses the total is fed back and regenerated by this
            # very loop, so one cheap call that fails validation costs two
            # calls, and the second is at the same price as the one we skipped.
            result = generate_assessment_cloud(prompt + feedback, task="assessment_creation", system_prompt=_SYSTEM_PROMPT, json_mode=True)
        if not result.get("success"):
            last_error = result.get("error")
            last_upstream_failure = result.get("failure") or FailureClass.UPSTREAM_ERROR
            continue
        last_upstream_failure = None
        try:
            import json

            data = json.loads(result["content"])
            data["created_by"] = created_by
            data["workspace_id"] = workspace_id
            assessment = AssessmentSchema(**data)
        except (ValueError, ValidationError) as e:
            last_error = f"invalid JSON/schema: {e}"
            continue

        validation = validate_assessment(assessment, target_marks=total_marks)
        if validation.valid:
            break
        last_error = "; ".join(validation.errors)

    if assessment is None:
        if last_upstream_failure is not None:
            message = mask(last_upstream_failure, context="assessment generation", detail=str(last_error or ""))
        else:
            # Schema/validation failure — the model produced something, it was
            # just wrong. That detail is genuinely useful to the teacher ("the
            # marks don't add to 40"), so it is NOT masked.
            message = last_error or "AI generation failed"
        return {
            "assessment": None,
            "validation": {"valid": False, "errors": [message]},
            "grounded_on": len(context),
        }

    # Resolve the model's "S1"/"S2" citation tags back to real source chunks,
    # so a teacher can see exactly which uploaded material backs each question.
    tag_to_chunk = {f"S{i}": c for i, c in enumerate(context, start=1)}
    for sec in assessment.sections:
        for q in sec.questions:
            q.source_ids = [str(tag_to_chunk[tag]["chunk_id"]) for tag in (q.source_ids or []) if tag in tag_to_chunk]

    response: Dict[str, Any] = {
        "assessment": assessment.model_dump(),
        "validation": validation.to_dict(),
        "grounded_on": len(context),
        "sources": [
            {
                "chunk_id": c["chunk_id"],
                "source_material": c.get("source_material"),
                "page_number": c.get("page_number"),
                "excerpt": c["content"][:200],
            }
            for c in context
        ],
    }

    if workspace_id and is_configured():
        try:
            row = table_insert(
                "assessments",
                {
                    "workspace_id": workspace_id,
                    "created_by": created_by,
                    "title": assessment.title,
                    "type": "assessment",
                    "specification_json": {"topics": topics, "difficulty": difficulty},
                    "status": "draft",
                    "total_marks": assessment.total_marks,
                    "duration_minutes": assessment.duration_minutes,
                },
            )
            questions_rows = [
                {
                    "assessment_id": row["id"],
                    "question_number": q.question_number,
                    "section": q.section,
                    "question_type": q.question_type,
                    "question_text": q.question_text,
                    "marks": q.marks,
                    "difficulty": q.difficulty,
                    "bloom_level": q.bloom_level,
                    "options_json": q.options,
                    "answer": q.answer,
                    "solution": q.solution,
                    "source_ids": q.source_ids,
                }
                for sec in assessment.sections
                for q in sec.questions
            ]
            inserted_questions = table_insert_many("questions", questions_rows)
            response["assessment_id"] = row["id"]
            response["question_ids"] = [q["id"] for q in inserted_questions]
        except SupabaseError as e:
            logger.warning("Persisting assessment failed (returning generated content anyway): %s", e)

    return response


_REGEN_SYSTEM_PROMPT = """You are Vivran's single-question regeneration engine (§15).
Given one existing question and a requested variation, produce ONE replacement question as JSON:
{"question_text": string, "question_type": string, "marks": integer, "options": string[] or null, "answer": string, "solution": string}
Preserve the original marks and question_type unless the variation explicitly implies otherwise. Return JSON only."""


def regenerate_single_question(
    question_id: str,
    option: str,  # harder, easier, application, conceptual, case
    workspace_id: str,
    created_by: str = "system",
) -> Dict[str, Any]:
    if not is_configured():
        raise SupabaseError("Supabase is not configured; cannot look up the original question")

    # `questions` has no workspace_id of its own (see migrations/0001) — it is
    # owned transitively via questions.assessment_id -> assessments.workspace_id.
    # This runs on the service-role key, which bypasses RLS, so the tenancy
    # check has to happen HERE: an unfiltered lookup by id would hand any
    # authenticated teacher another teacher's question text and answer key,
    # and let them append a question_versions row to it.
    # `assessments!inner` makes the embed an INNER JOIN so a non-matching
    # workspace yields no row at all rather than a row with a null embed.
    rows = table_select(
        "questions",
        {
            "id": f"eq.{question_id}",
            "select": "*,assessments!inner(workspace_id)",
            "assessments.workspace_id": f"eq.{workspace_id}",
            "limit": "1",
        },
    )
    if not rows:
        # Deliberately the same message whether the question doesn't exist or
        # belongs to someone else — don't turn this into an id-existence oracle.
        raise SupabaseError(f"Question {question_id} not found")
    original = rows[0]

    prompt = (
        f"Original question ({original['question_type']}, {original['marks']} marks): {original['question_text']}\n"
        f"Original answer: {original['answer']}\n"
        f"Requested variation: make it {option}."
    )
    result = generate_cheap_cloud(prompt, task="question_regen", system_prompt=_REGEN_SYSTEM_PROMPT, json_mode=True)
    if not result.get("success"):
        # The API layer turns this into a 502 with the message verbatim, so it
        # must already be the translated one (app/core/errors.py).
        raise RuntimeError(
            mask(
                result.get("failure") or FailureClass.UPSTREAM_ERROR,
                context="question regeneration",
                detail=str(result.get("error", "")),
            )
        )

    import json

    new_question = json.loads(result["content"])
    table_insert(
        "question_versions",
        {
            "question_id": question_id,
            "question_text": new_question.get("question_text", ""),
            "answer": new_question.get("answer", ""),
            "solution": new_question.get("solution"),
            "model_tier": "cheap_cloud",
            "model_name": result["model_name"],
        },
    )

    return {
        "status": "regenerated",
        "question_id": question_id,
        "option_applied": option,
        "requested_by": created_by,
        "new_question": new_question,
    }
