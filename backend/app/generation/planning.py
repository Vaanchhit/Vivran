"""Course & Lesson Planning Generation Engine (§12)."""
import json
from typing import Any, Dict, List, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.ai.prompt_snippets import LEVEL_INSTRUCTION
from app.ai.validators import validate_course_plan
from app.core.errors import FailureClass, mask
from app.core.logging import logger
from app.generation.loop import run_validated
from app.retrieval.context import format_sources, resolve_tags, sources_payload, tag_map
from app.retrieval.search import search_many

_SYSTEM_PROMPT = """You are Vivran's course & lesson planning engine (§12) for school teachers and college professors.
Produce a multi-week course plan as JSON matching exactly this shape:
{
  "title": string, "grade": string, "subject": string, "duration_weeks": integer,
  "weekly_structure": [
    {
      "week": integer, "topic": string,
      "lessons": string[] (short lesson titles, one per class session),
      "objectives": string[] (learning objectives for the week, Bloom's-aligned),
      "source_ids": string[] (tags of the provided passages this week draws on, [] if none)
    }
  ]
}
Sequence topics logically, building on prior weeks. Return JSON only.
""" + LEVEL_INSTRUCTION


def _repair_plan(plan: Dict[str, Any], weeks: int) -> Dict[str, Any]:
    """Renumbers weeks 1..n and trims extras. A plan short of weeks stays short (reported, not invented)."""
    structure = [w for w in (plan.get("weekly_structure") or []) if isinstance(w, dict) and str(w.get("topic", "")).strip()]
    structure = structure[:weeks]
    for i, w in enumerate(structure, start=1):
        w["week"] = i
        w["lessons"] = [str(x) for x in (w.get("lessons") or [])]
        w["objectives"] = [str(x) for x in (w.get("objectives") or [])]
    return {**plan, "weekly_structure": structure, "duration_weeks": weeks if len(structure) == weeks else len(structure)}


def generate_course_plan(
    grade: str,
    subject: str,
    topics: List[str],
    duration_weeks: int = 3,
    workspace_id: Optional[str] = None,
    style_lines: Optional[List[str]] = None,
) -> Dict[str, Any]:
    context: List[Dict[str, Any]] = []
    if workspace_id:
        try:
            # One search per topic (a term plan spans several), so a plan for
            # "Demand, Supply, Elasticity" draws on all three, not the one that
            # happens to sit closest to the others in vector space.
            queries = [f"{subject} {t}" for t in topics] or [subject]
            context = search_many(queries, workspace_id, limit=min(10, 4 + 2 * max(1, len(topics))))
        except Exception as e:
            logger.warning("Retrieval for course plan failed (continuing ungrounded): %s", e)

    prompt_lines = [
        f"Grade: {grade}",
        f"Subject: {subject}",
        f"Topics to cover: {', '.join(topics) if topics else 'teacher has not specified — infer a reasonable syllabus slice'}",
        f"Duration: {duration_weeks} weeks",
    ]
    if context:
        prompt_lines.append(
            "\nGround the plan in the teacher's own materials. Cite the tag of the passage behind each week "
            'in that week\'s "source_ids" (for example ["S2"]); use [] where none applies:'
        )
        prompt_lines.extend(format_sources(context, f"{subject} {' '.join(topics)}"))
    prompt_lines.extend(style_lines or [])
    prompt = "\n".join(prompt_lines)

    def failed(error: str) -> Dict[str, Any]:
        return {
            "title": f"{grade} {subject} — {', '.join(topics) if topics else 'Course'} Plan",
            "grade": grade, "subject": subject, "duration_weeks": duration_weeks,
            "weekly_structure": [], "error": error,
        }

    def call(feedback: str) -> Dict[str, Any]:
        result = generate_cheap_cloud(prompt + feedback, task="coursework_planning", system_prompt=_SYSTEM_PROMPT, json_mode=True)
        if not result.get("success"):
            return failed(mask(result.get("failure") or FailureClass.UPSTREAM_ERROR, context="course_plan", detail=str(result.get("error", ""))))
        try:
            data = json.loads(result["content"])
        except ValueError as e:
            return failed(mask(FailureClass.UPSTREAM_ERROR, context="course_plan", detail=f"invalid JSON: {e}"))
        return data if isinstance(data, dict) else failed(mask(FailureClass.UPSTREAM_ERROR, context="course_plan", detail="not an object"))

    plan, errors, meta = run_validated(call, lambda d: validate_course_plan(d, duration_weeks), label="course_plan")
    if plan.get("error"):
        return plan
    plan = _repair_plan(plan, duration_weeks)
    _attach = tag_map(context)
    invented = 0
    for week in plan["weekly_structure"]:
        real, bad = resolve_tags(week.get("source_ids"), _attach)
        week["source_ids"] = real
        invented += len(bad)
    warnings = [e for e in errors if not e.startswith("The plan must cover")] if len(plan["weekly_structure"]) == duration_weeks else list(errors)
    if invented:
        warnings.append(f"{invented} citation(s) pointed at passages that were never provided and were ignored.")
    plan["grounded_on"] = len(context)
    plan["sources"] = sources_payload(context)
    plan["guardrail_warnings"] = warnings
    plan["generation"] = meta.public()
    return plan
