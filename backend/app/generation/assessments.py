"""Assessment Generation Engine (§14) & Question Regeneration (§15)."""
from typing import Any, Dict, List, Optional, Tuple

from pydantic import ValidationError

from app.ai.cheap_model import generate_assessment_cloud, generate_cheap_cloud
from app.ai.premium_model import generate_premium_cloud
from app.ai.prompt_snippets import LEVEL_INSTRUCTION
from app.ai.schemas import AssessmentSchema
from app.ai.validators import validate_assessment
from app.core.config import settings
from app.core.errors import FailureClass, mask
from app.core.logging import logger
from app.memory import store as memory_store
from app.memory import style as memory_style
from app.generation.loop import LoopMeta
from app.retrieval.context import format_sources, resolve_tags, sources_payload, support_level, tag_map
from app.retrieval.search import search_many
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
          "question_type": "mcq" | "true_false" | "fill_blank" | "short_answer" | "long_answer" | "numerical" | "case_based",
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
Every question needs a correct, non-empty "answer". Do not repeat a question.
Keep "solution" brief: one sentence for objective questions, at most three short marking points otherwise.
Return JSON only.
""" + LEVEL_INSTRUCTION


# Share of the paper given to 1-mark MCQs, by difficulty; 2-mark short answers
# take ~30% and the rest goes to long answers.
_MCQ_SHARE = {"easy": 0.3, "medium": 0.2, "hard": 0.1}


def marks_blueprint(total_marks: int, difficulty: str) -> List[Tuple[str, str, int, int]]:
    """A section plan whose marks sum to total_marks exactly, decided in code.

    Measured: small models miss the total on roughly half of papers even with
    a feedback retry, while they follow a fixed count-and-marks structure. So
    the arithmetic is done here and the model only writes the questions.
    Returns (section name, question_type, count, marks each).
    """
    if total_marks < 6:
        return [("Section A", "mcq", total_marks, 1)]
    long_each = 5 if total_marks >= 30 else 3
    mcq = max(2, round(total_marks * _MCQ_SHARE.get(difficulty, 0.2)))
    short = max(1, round(total_marks * 0.3) // 2)
    remaining = total_marks - mcq - short * 2
    long_count, leftover = divmod(remaining, long_each)
    mcq += leftover
    plan = [("Section A", "mcq", mcq, 1), ("Section B", "short_answer", short, 2)]
    if long_count:
        plan.append(("Section C", "long_answer", long_count, long_each))
    return plan


# Question types a teacher can ask for, in the order a paper presents them,
# with the marks each carries when the teacher doesn't say. Objective types
# first, then the written ones, then the long and case-based ones.
QUESTION_TYPES: Dict[str, Tuple[str, int]] = {
    "mcq": ("Multiple choice", 1),
    "true_false": ("True or false", 1),
    "fill_blank": ("Fill in the blank", 1),
    "short_answer": ("Short answer", 2),
    "numerical": ("Numerical", 3),
    "long_answer": ("Long answer", 5),
    "case_based": ("Case-based", 4),
}

# What each type needs from the model beyond the shared JSON shape. Only the
# lines for types in the paper are sent.
_TYPE_RULES = {
    "mcq": 'mcq: exactly 4 "options"; "answer" is the text of the correct option.',
    "true_false": 'true_false: a statement to judge; "options" ["True", "False"]; "answer" is "True" or "False".',
    "fill_blank": 'fill_blank: "question_text" contains exactly one blank written as ____ ; "answer" is only the missing word or phrase.',
    "short_answer": "short_answer: answerable in two to four sentences.",
    "numerical": 'numerical: gives every value needed; "answer" is the final value with its unit.',
    "long_answer": "long_answer: needs a developed answer; \"solution\" lists the marking points.",
    "case_based": "case_based: open with a short case or data set (3-5 sentences) built only from the excerpts or the topic, then ask about it.",
}


def blueprint_from_plan(plan: List[Dict[str, Any]]) -> List[Tuple[str, str, int, int]]:
    """A teacher's chosen question types and counts -> the paper's fixed structure.

    One section per type, in QUESTION_TYPES order whatever order they were
    picked in, so the paper reads objective-first like a set paper does.
    """
    order = list(QUESTION_TYPES)
    items = sorted((p for p in plan if p["type"] in QUESTION_TYPES and p["count"] > 0), key=lambda p: order.index(p["type"]))
    return [
        (f"Section {chr(ord('A') + i)}", p["type"], int(p["count"]), int(p.get("marks_each") or QUESTION_TYPES[p["type"]][1]))
        for i, p in enumerate(items)
    ]


def _apply_blueprint_marks(data: Dict[str, Any], blueprint: List[Tuple[str, str, int, int]], total_marks: int) -> None:
    """Stamps each question's marks, type, section and number from its slot.

    The slot a question fills defines all four, so a model that wrote the
    right questions but mislabelled one is corrected here rather than paid to
    write the paper again. A paper with a different shape (a section short, a
    question extra) is left alone for the shape check to reject.
    """
    sections = data.get("sections")
    if not isinstance(sections, list) or len(sections) != len(blueprint):
        return
    for sec, (_, _, count, each) in zip(sections, blueprint):
        if not isinstance(sec, dict) or len(sec.get("questions") or []) != count:
            return
    number = 0
    for sec, (name, qtype, _, each) in zip(sections, blueprint):
        sec["name"] = name
        for q in sec["questions"]:
            if not isinstance(q, dict):
                continue
            number += 1
            q.update(marks=each, question_type=qtype, section=name, question_number=number)
            if qtype == "true_false":
                q["options"] = ["True", "False"]
            elif qtype != "mcq":
                q["options"] = None
    data["total_marks"] = total_marks


def _build_prompt(
    grade: str,
    subject: str,
    topics: List[str],
    total_marks: int,
    difficulty: str,
    context: List[Dict[str, Any]],
    blueprint: Optional[List[Tuple[str, str, int, int]]] = None,
    case_section_names: Optional[List[str]] = None,
    style_lines: Optional[List[str]] = None,
    source_chars: Optional[int] = None,
) -> str:
    lines = [
        f"Grade: {grade}",
        f"Subject: {subject}",
        f"Topics: {', '.join(topics)}",
        f"Total marks required: {total_marks} (must match exactly)",
        f"Overall difficulty: {difficulty}",
        "\nPaper structure (fixed — use exactly these sections, question counts and marks):",
    ]
    for name, qtype, count, each in blueprint or marks_blueprint(total_marks, difficulty):
        case = " (case-based)" if name in (case_section_names or []) else ""
        lines.append(f"- {name}: {count} {qtype} question(s) x {each} mark(s) = {count * each} marks{case}")
    if context:
        lines.append("\nGround the questions in these excerpts from the teacher's own uploaded materials. Cite by their tag (S1, S2, ...) in \"source_ids\":")
        lines.extend(format_sources(context, f"{subject} {' '.join(topics)}", total_chars=source_chars))
    types = [t for t in QUESTION_TYPES if any(qtype == t for _, qtype, _, _ in (blueprint or marks_blueprint(total_marks, difficulty)))]
    lines.append("\nRules for the question types in this paper:")
    lines.extend(f"- {_TYPE_RULES[t]}" for t in types)
    lines.extend(style_lines or [])
    return "\n".join(lines)


def _teacher_style(workspace_id: Optional[str], subject: str, total_marks: int, shape_chosen: bool = False) -> Dict[str, Any]:
    """The teacher's accepted style for papers in this subject, ready to use.

    Empty (and the default paper) when they have accepted nothing, have no
    workspace, or turned it off for this paper. When they chose this paper's
    question types themselves (``shape_chosen``), that choice wins: their
    usual structure and case-based share are set aside, and only the
    phrasing traits (thinking balance, command words, timing) still apply.
    """
    if not workspace_id:
        return {"blueprint": None, "case_sections": [], "lines": [], "applied": []}
    traits = memory_store.active_traits(workspace_id, subject, "exam_paper")
    blueprint = None
    case_names: List[str] = []
    if shape_chosen:
        traits = {k: v for k, v in traits.items() if k not in ("structure", "case_based")}
    structure = (traits.get("structure") or {}).get("value")
    if structure:
        blueprint = memory_style.blueprint_from_structure(total_marks, structure["sections"])
        if blueprint:
            case_names = [blueprint[i][0] for i in memory_style.case_sections(structure["sections"])]
    return {
        "blueprint": blueprint,
        "case_sections": case_names,
        "lines": memory_style.prompt_lines(traits, total_marks),
        "applied": memory_style.applied(traits, used_structure=blueprint is not None),
    }


def _retrieval_plan(subject: str, topics: List[str], total_marks: int) -> Tuple[List[str], int, int]:
    """(queries, passages to retrieve, characters of source text the prompt may carry).

    One query per topic: a paper on "Demand, Supply, Elasticity" must draw on all
    three, not on the cluster that sits nearest the others. And the budget grows
    with the paper: a 100-mark exam needs breadth a 10-mark quiz does not, where
    one fixed six passages starved the big paper and padded the small one.
    """
    queries = [f"{subject} {t}" for t in topics[:3]] or [subject]
    limit = max(6, min(12, 4 + total_marks // 12))
    chars = settings.retrieval_prompt_chars + max(0, limit - 6) * 500
    return queries, limit, chars


def _parse_paper(content: str, blueprint, total_marks: int, created_by: str, workspace_id: Optional[str]) -> Tuple[Optional[AssessmentSchema], Optional[str]]:
    import json

    try:
        data = json.loads(content)
        _apply_blueprint_marks(data, blueprint, total_marks)
        data["created_by"] = created_by
        data["workspace_id"] = workspace_id
        return AssessmentSchema(**data), None
    except (ValueError, TypeError, ValidationError) as e:
        return None, f"invalid JSON/schema: {e}"


def _failing_sections(assessment: AssessmentSchema, blueprint) -> List[Tuple[int, str]]:
    """(section index, what is wrong) for the sections that break their own rules.

    A paper whose section count itself is wrong has no salvageable sections:
    that returns every index, which the caller treats as "write it again".
    """
    if len(assessment.sections) != len(blueprint):
        return [(i, "the paper's sections are wrong") for i in range(len(blueprint))]
    failing: List[Tuple[int, str]] = []
    for i, (sec, (name, qtype, count, _each)) in enumerate(zip(assessment.sections, blueprint)):
        if len(sec.questions) != count:
            failing.append((i, f"it has {len(sec.questions)} questions, not {count}"))
        elif qtype == "mcq" and any(len([o for o in (q.options or []) if str(o).strip()]) < 3 for q in sec.questions):
            failing.append((i, "a multiple-choice question has fewer than 3 options"))
        elif qtype == "fill_blank" and any("___" not in q.question_text for q in sec.questions):
            failing.append((i, "a fill-in-the-blank question has no blank (____)"))
    return failing


def _repair_sections(
    assessment: AssessmentSchema,
    failing: List[Tuple[int, str]],
    blueprint,
    prompt: str,
    total_marks: int,
    created_by: str,
    workspace_id: Optional[str],
) -> Tuple[Optional[AssessmentSchema], Dict[str, Any]]:
    """Rewrites only the failing sections and splices them into the paper.

    Writing two bad sections of five costs a fifth of writing the paper again,
    and keeps every question that was already right. Returns (paper, the raw
    envelope) so the caller can account for the call; None when the splice
    could not be made.
    """
    import json

    keep = [q.question_text[:100] for i, sec in enumerate(assessment.sections) if i not in {f for f, _ in failing} for q in sec.questions]
    asks = "\n".join(
        f"- {blueprint[i][0]}: exactly {blueprint[i][2]} {blueprint[i][1]} question(s) x {blueprint[i][3]} mark(s) (was wrong: {why})"
        for i, why in failing
    )
    targeted = (
        f"{prompt}\n\nThe rest of the paper is already fine. Rewrite ONLY these sections and return JSON "
        f'{{"sections": [ ... ]}} holding just them, each with its "name", "instructions" and "questions":\n{asks}'
        + ("\nDo not repeat any of these existing questions:\n" + "\n".join(f"- {k}" for k in keep[:25]) if keep else "")
    )
    result = generate_assessment_cloud(targeted, task="assessment_creation", system_prompt=_SYSTEM_PROMPT, json_mode=True)
    if not result.get("success"):
        return None, result
    try:
        redone = json.loads(result["content"]).get("sections") or []
        base = assessment.model_dump()
        by_name = {str(f.get("name", "")).strip().lower(): f for f in redone if isinstance(f, dict)}
        in_order = redone if len(redone) == len(failing) else []
        for n, (i, _why) in enumerate(failing):
            fresh = by_name.get(blueprint[i][0].lower()) or (in_order[n] if in_order else None)
            if not isinstance(fresh, dict):
                return None, result
            fresh["name"] = blueprint[i][0]
            base["sections"][i] = fresh
        _apply_blueprint_marks(base, blueprint, total_marks)
        base["created_by"], base["workspace_id"] = created_by, workspace_id
        return AssessmentSchema(**base), result
    except (ValueError, TypeError, AttributeError, ValidationError) as e:
        logger.warning("Section repair could not be spliced into the paper: %s", e)
        return None, result


def generate_assessment(
    grade: str,
    subject: str,
    topics: List[str],
    total_marks: int = 40,
    difficulty: str = "medium",
    created_by: str = "system",
    workspace_id: Optional[str] = None,
    material_id: Optional[str] = None,
    use_style: bool = True,
    question_plan: Optional[List[Dict[str, Any]]] = None,
    habit_lines: Optional[List[str]] = None,
) -> Dict[str, Any]:
    # The teacher's own choice of question types and counts is the paper's
    # shape, ahead of their saved style and of Vivran's default; the total
    # then follows from it rather than being asked for separately.
    chosen = blueprint_from_plan(question_plan) if question_plan else None
    if chosen:
        total_marks = sum(count * each for _, _, count, each in chosen)
    style = _teacher_style(workspace_id if use_style else None, subject, total_marks, shape_chosen=bool(chosen))
    blueprint = chosen or style["blueprint"] or marks_blueprint(total_marks, difficulty)
    enforced_shape = chosen or style["blueprint"]

    queries, limit, source_chars = _retrieval_plan(subject, topics, total_marks)
    context: List[Dict[str, Any]] = []
    if workspace_id:
        try:
            context = search_many(queries, workspace_id, material_id=material_id, limit=limit)
        except Exception as e:
            logger.warning("Retrieval for assessment generation failed (continuing ungrounded): %s", e)

    prompt = _build_prompt(
        grade, subject, topics, total_marks, difficulty, context,
        blueprint=blueprint, case_section_names=style["case_sections"], style_lines=style["lines"] + (habit_lines or []),
        source_chars=source_chars,
    )
    # Gated OFF by default (settings.premium_tier_enabled).
    #
    # This condition — hard, or 60+ marks — describes most real exam papers, and
    # on the current key every Pro-tier model answers 429. So the common case
    # was: spend a request to be refused, log "falling back", spend a second
    # request on the cheap tier, and produce precisely the paper the cheap tier
    # would have produced immediately.
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
    meta = LoopMeta(label="assessment")
    mode = "full"
    previous_errors: Optional[List[str]] = None

    for attempt in (1, 2):
        meta.attempts = attempt
        repaired: Optional[AssessmentSchema] = None
        result: Optional[Dict[str, Any]] = None

        # Attempt 2 rewrites only the sections that failed, when most of the
        # paper was right. Otherwise (or if that splice fails) it writes it again.
        if attempt == 2 and assessment is not None and validation is not None and enforced_shape:
            failing = _failing_sections(assessment, blueprint)
            if failing and len(failing) <= max(1, len(blueprint) // 2):
                mode = "sections"
                repaired, result = _repair_sections(assessment, failing, blueprint, prompt, total_marks, created_by, workspace_id)
                if repaired is None and result is not None and not result.get("success"):
                    last_error = result.get("error")
                    last_upstream_failure = result.get("failure") or FailureClass.UPSTREAM_ERROR
                    continue
        if repaired is not None:
            assessment = repaired
            last_upstream_failure = None
        else:
            mode = "full"
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
            parsed, err = _parse_paper(result["content"], blueprint, total_marks, created_by, workspace_id)
            if parsed is None:
                last_error = err
                continue
            assessment = parsed

        # The exact shape is enforced when the teacher chose it (this paper's
        # question types, or their accepted style). Vivran's own default keeps
        # the looser total-marks check, so it costs no extra retries.
        validation = validate_assessment(assessment, target_marks=total_marks, blueprint=enforced_shape)
        if attempt == 1:
            meta.first_pass_valid = validation.valid
        if validation.valid:
            meta.stopped = "valid"
            break
        last_error = "; ".join(validation.errors)
        # The same rules failing twice in a row means the retry changed nothing.
        if previous_errors is not None and sorted(previous_errors) == sorted(validation.errors):
            meta.stopped = "no_progress"
            break
        previous_errors = list(validation.errors)
    else:
        meta.stopped = "max_attempts" if assessment is not None else "upstream_error"

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
    meta.errors = [] if validation is None else list(validation.errors)

    # Resolve the model's "S1"/"S2" citation tags back to real source chunks, so
    # a teacher can see exactly which uploaded material backs each question, and
    # rate how well that material backs it. Tags that were never issued are
    # counted, not silently dropped.
    mapping = tag_map(context)
    invented = 0
    for sec in assessment.sections:
        for q in sec.questions:
            real, bad = resolve_tags(q.source_ids, mapping)
            invented += len(bad)
            q.source_ids = real
            cited = [c for c in context if str(c["chunk_id"]) in real]
            q.support = support_level(f"{q.question_text} {q.answer}", cited) if context else None
    if invented:
        logger.warning("Paper cited %s passage tag(s) that were never provided", invented)

    response: Dict[str, Any] = {
        "assessment": assessment.model_dump(),
        "validation": validation.to_dict(),
        "grounded_on": len(context),
        "style_applied": style["applied"],
        "sources": sources_payload(context),
        "generation": {**meta.public(), "mode": mode, "invented_citations": invented},
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
Keep the original marks and question_type. For multiple choice give exactly 4 options and make "answer" the text of the correct one;
for fill_blank the question contains one blank written as ____ . Return JSON only."""


def _regen_problems(new: Any, original: Dict[str, Any], others: List[str]) -> List[str]:
    """Why a regenerated question is not an acceptable replacement (empty = fine)."""
    if not isinstance(new, dict):
        return ["Return a JSON object."]
    problems: List[str] = []
    text = str(new.get("question_text", "")).strip()
    if not text or not str(new.get("answer", "")).strip():
        problems.append("Give both a question and a non-empty answer.")
    key = " ".join(text.lower().split())
    if key and key == " ".join(str(original.get("question_text", "")).lower().split()):
        problems.append("This is the same question as before; write a genuinely different one.")
    elif key and key in others:
        problems.append("This repeats another question in the paper.")
    if original.get("question_type") == "mcq" and len([o for o in (new.get("options") or []) if str(o).strip()]) < 3:
        problems.append("A multiple-choice question needs 4 options.")
    if original.get("question_type") == "fill_blank" and "___" not in text:
        problems.append("A fill-in-the-blank question needs a blank written as ____ .")
    return problems


def regenerate_single_question(
    question_id: str,
    option: str,  # harder, easier, application, conceptual, case
    workspace_id: str,
    created_by: str = "system",
) -> Dict[str, Any]:
    import json

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

    # The rest of the paper, so the replacement can't repeat it.
    try:
        siblings = table_select("questions", {"assessment_id": f"eq.{original['assessment_id']}", "select": "id,question_text"})
    except SupabaseError:
        siblings = []
    others = [" ".join(str(q["question_text"]).lower().split()) for q in siblings if q["id"] != question_id]

    # Grounded like the paper was: the replacement is written from the same
    # materials, with passages chosen for THIS question.
    context: List[Dict[str, Any]] = []
    try:
        context = search_many([str(original["question_text"])[:300]], workspace_id, limit=3)
    except Exception as e:
        logger.warning("Retrieval for question regeneration failed (continuing ungrounded): %s", e)

    base = (
        f"Original question ({original['question_type']}, {original['marks']} marks): {original['question_text']}\n"
        f"Original answer: {original['answer']}\n"
        f"Requested variation: make it {option}."
    )
    if context:
        base += "\n\nWrite it from these excerpts of the teacher's materials:\n" + "\n".join(
            format_sources(context, str(original["question_text"]), total_chars=2400)
        )

    new_question: Dict[str, Any] = {}
    result: Dict[str, Any] = {}
    feedback = ""
    for attempt in (1, 2):
        result = generate_cheap_cloud(base + feedback, task="question_regen", system_prompt=_REGEN_SYSTEM_PROMPT, json_mode=True)
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
        try:
            new_question = json.loads(result["content"])
        except ValueError:
            new_question = {}
        problems = _regen_problems(new_question, original, others)
        if not problems:
            break
        feedback = "\n\nYour previous attempt was not acceptable:\n- " + "\n- ".join(problems) + "\nWrite it again."
    else:
        # Two tries and still unusable: say so, rather than store or show a
        # question that repeats another or has no answer.
        raise RuntimeError("Vivran couldn't write a good replacement for that question. Please try again, or choose a different option.")

    # What the model may change is the wording; the slot's type and marks are fixed.
    new_question["question_type"] = original["question_type"]
    new_question["marks"] = original["marks"]
    if original["question_type"] != "mcq":
        new_question["options"] = None
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
