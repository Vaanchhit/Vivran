"""Course & Lesson Planning Generation Engine (§12)."""
import json
from typing import Any, Dict, List, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.core.logging import logger
from app.retrieval.search import search_knowledge_base

_SYSTEM_PROMPT = """You are Vivran's course & lesson planning engine (§12) for Indian school teachers.
Produce a multi-week course plan as JSON matching exactly this shape:
{
  "title": string, "grade": string, "subject": string, "duration_weeks": integer,
  "weekly_structure": [
    {
      "week": integer, "topic": string,
      "lessons": string[] (short lesson titles, one per class session),
      "objectives": string[] (learning objectives for the week, Bloom's-aligned)
    }
  ]
}
Sequence topics logically, building on prior weeks. Return JSON only."""


def generate_course_plan(
    grade: str,
    subject: str,
    topics: List[str],
    duration_weeks: int = 3,
    workspace_id: Optional[str] = None,
) -> Dict[str, Any]:
    context: List[Dict[str, Any]] = []
    if workspace_id:
        try:
            context = search_knowledge_base(f"{subject} {' '.join(topics)}", workspace_id, limit=6)
        except Exception as e:
            logger.warning("Retrieval for course plan failed (continuing ungrounded): %s", e)

    prompt_lines = [
        f"Grade: {grade}",
        f"Subject: {subject}",
        f"Topics to cover: {', '.join(topics) if topics else 'teacher has not specified — infer a reasonable syllabus slice'}",
        f"Duration: {duration_weeks} weeks",
    ]
    if context:
        prompt_lines.append("\nGround the plan in these excerpts from the teacher's uploaded materials:")
        for c in context:
            prompt_lines.append(f"- ({c.get('source_material', 'source')}) {c['content'][:600]}")
    prompt = "\n".join(prompt_lines)

    result = generate_cheap_cloud(prompt, task="coursework_planning", system_prompt=_SYSTEM_PROMPT, json_mode=True)
    if not result.get("success"):
        return {
            "title": f"{grade} {subject} — {', '.join(topics) if topics else 'Course'} Plan",
            "grade": grade,
            "subject": subject,
            "duration_weeks": duration_weeks,
            "weekly_structure": [],
            "error": result.get("error"),
        }

    try:
        plan = json.loads(result["content"])
    except ValueError as e:
        return {
            "title": f"{grade} {subject} Plan",
            "grade": grade,
            "subject": subject,
            "duration_weeks": duration_weeks,
            "weekly_structure": [],
            "error": f"AI returned invalid JSON: {e}",
        }

    plan["grounded_on"] = len(context)
    return plan
