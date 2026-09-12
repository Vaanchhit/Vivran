"""Assessment Generation Engine (§14) & Question Regeneration (§15)."""
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from app.ai.cheap_model import generate_cheap_cloud
from app.ai.premium_model import generate_premium_cloud
from app.ai.schemas import AssessmentSchema
from app.ai.validators import validate_assessment
from app.core.logging import logger
from app.retrieval.search import search_knowledge_base
from app.services.supabase_service import SupabaseError, is_configured, table_insert, table_insert_many, table_select

_SYSTEM_PROMPT = """You are Vivran's assessment generation engine for Indian school teachers (§14).
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
          "answer": string, "solution": string
        }
      ]
    }
  ]
}
The sum of every question's "marks" across all sections MUST equal the requested total_marks exactly.
Ground questions in the provided source excerpts when given; otherwise use sound subject-matter knowledge.
Every question needs a correct, non-empty "answer". Do not repeat a question. Return JSON only."""


def _build_prompt(grade: str, subject: str, topics: List[str], total_marks: int, difficulty: str, context: List[Dict[str, Any]]) -> str:
    lines = [
        f"Grade: {grade}",
        f"Subject: {subject}",
        f"Topics: {', '.join(topics)}",
        f"Total marks required: {total_marks} (must match exactly)",
        f"Overall difficulty: {difficulty}",
    ]
    if context:
        lines.append("\nGround the questions in these excerpts from the teacher's own uploaded materials:")
        for c in context:
            lines.append(f"- ({c.get('source_material', 'source')}) {c['content'][:600]}")
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
    generator = generate_premium_cloud if (difficulty == "hard" or total_marks >= 60) else generate_cheap_cloud

    assessment: Optional[AssessmentSchema] = None
    validation = None
    last_error = None

    for _attempt in range(2):
        feedback = f"\n\nYour previous attempt was invalid: {last_error}. Fix it." if last_error else ""
        result = generator(prompt + feedback, task="assessment_creation", system_prompt=_SYSTEM_PROMPT, json_mode=True)
        if not result.get("success"):
            last_error = result.get("error")
            continue
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
        return {
            "assessment": None,
            "validation": {"valid": False, "errors": [last_error or "AI generation failed"]},
            "grounded_on": len(context),
        }

    response: Dict[str, Any] = {
        "assessment": assessment.model_dump(),
        "validation": validation.to_dict(),
        "grounded_on": len(context),
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
    created_by: str = "system",
) -> Dict[str, Any]:
    if not is_configured():
        raise SupabaseError("Supabase is not configured; cannot look up the original question")

    rows = table_select("questions", {"id": f"eq.{question_id}", "limit": "1"})
    if not rows:
        raise SupabaseError(f"Question {question_id} not found")
    original = rows[0]

    prompt = (
        f"Original question ({original['question_type']}, {original['marks']} marks): {original['question_text']}\n"
        f"Original answer: {original['answer']}\n"
        f"Requested variation: make it {option}."
    )
    result = generate_cheap_cloud(prompt, task="question_regen", system_prompt=_REGEN_SYSTEM_PROMPT, json_mode=True)
    if not result.get("success"):
        raise RuntimeError(result.get("error", "Regeneration failed"))

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
