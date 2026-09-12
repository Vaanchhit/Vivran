"""Classroom Artifact Generation Engine (§13) — Slides, Worksheets, Lesson Notes."""
import json
from typing import Any, Dict, List, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.core.logging import logger
from app.retrieval.search import search_knowledge_base


def _grounded_prompt(topic: str, grade: Optional[str], subject: Optional[str], workspace_id: Optional[str], extra: str) -> tuple[str, int]:
    lines = [f"Topic: {topic}"]
    if grade:
        lines.append(f"Grade: {grade}")
    if subject:
        lines.append(f"Subject: {subject}")
    lines.append(extra)

    context: List[Dict[str, Any]] = []
    if workspace_id:
        try:
            context = search_knowledge_base(topic, workspace_id, limit=5)
        except Exception as e:
            logger.warning("Retrieval for artifact generation failed (continuing ungrounded): %s", e)
    if context:
        lines.append("\nGround this in the teacher's uploaded materials:")
        for c in context:
            lines.append(f"- ({c.get('source_material', 'source')}) {c['content'][:500]}")
    return "\n".join(lines), len(context)


def _call(prompt: str, system_prompt: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    result = generate_cheap_cloud(prompt, task="content_generation", system_prompt=system_prompt, json_mode=True)
    if not result.get("success"):
        return {**fallback, "error": result.get("error")}
    try:
        return json.loads(result["content"])
    except ValueError as e:
        return {**fallback, "error": f"AI returned invalid JSON: {e}"}


_SLIDES_SYSTEM_PROMPT = """You are Vivran's presentation generation engine (§13).
Return JSON only: {"title": string, "slides": [{"slide_number": int, "title": string, "bullet_points": string[], "speaker_notes": string}]}"""


def generate_slides(topic: str, slide_count: int = 12, grade: Optional[str] = None, subject: Optional[str] = None, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    prompt, grounded_on = _grounded_prompt(topic, grade, subject, workspace_id, f"Generate exactly {slide_count} slides.")
    data = _call(prompt, _SLIDES_SYSTEM_PROMPT, {"title": f"Presentation on {topic}", "slides": []})
    return {"artifact_type": "slides", "slide_count": slide_count, "grounded_on": grounded_on, **data}


_WORKSHEET_SYSTEM_PROMPT = """You are Vivran's worksheet generation engine (§13).
Return JSON only: {"title": string, "instructions": string, "questions": [{"question_text": string, "answer": string}]}"""


def generate_worksheet(topic: str, question_count: int = 10, grade: Optional[str] = None, subject: Optional[str] = None, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    prompt, grounded_on = _grounded_prompt(topic, grade, subject, workspace_id, f"Generate exactly {question_count} practice questions with answer keys.")
    data = _call(prompt, _WORKSHEET_SYSTEM_PROMPT, {"title": f"Worksheet — {topic}", "instructions": "", "questions": []})
    return {"artifact_type": "worksheet", "question_count": question_count, "grounded_on": grounded_on, **data}


_LESSON_NOTES_SYSTEM_PROMPT = """You are Vivran's lesson notes generation engine (§13).
Return JSON only: {"title": string, "sections": [{"heading": string, "content": string}], "real_life_examples": string[], "recap": string}"""


def generate_lesson_notes(topic: str, grade: Optional[str] = None, subject: Optional[str] = None, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    prompt, grounded_on = _grounded_prompt(topic, grade, subject, workspace_id, "Generate structured teaching notes with clear explanations.")
    data = _call(prompt, _LESSON_NOTES_SYSTEM_PROMPT, {"title": f"Lesson Notes — {topic}", "sections": [], "real_life_examples": [], "recap": ""})
    return {"artifact_type": "lesson_notes", "grounded_on": grounded_on, **data}
