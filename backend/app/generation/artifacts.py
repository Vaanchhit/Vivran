"""Classroom Artifact Generation Engine (§13) — Slides, Worksheets, Lesson Notes."""
import json
from typing import Any, Dict, List, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.ai.prompt_snippets import LEVEL_INSTRUCTION
from app.ai.validators import (
    MAX_BULLETS_PER_SLIDE,
    MAX_BULLET_CHARS,
    MAX_SLIDE_BODY_CHARS,
    MAX_TITLE_CHARS,
    MIN_BULLETS_PER_SLIDE,
    repair_slides,
    validate_slides,
)
from app.core.errors import FailureClass, mask
from app.core.logging import logger
from app.retrieval.search import search_knowledge_base


def _sources_payload(context: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {"chunk_id": c["chunk_id"], "source_material": c.get("source_material"), "page_number": c.get("page_number"), "excerpt": c["content"][:200]}
        for c in context
    ]


def _grounded_prompt(topic: str, grade: Optional[str], subject: Optional[str], workspace_id: Optional[str], extra: str) -> tuple[str, List[Dict[str, Any]]]:
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
    return "\n".join(lines), context


def _call(prompt: str, system_prompt: str, fallback: Dict[str, Any], context_label: str) -> Dict[str, Any]:
    """Runs one generation call and returns parsed JSON, or the fallback shape
    carrying a USER-SAFE error.

    These functions return 200 with an "error" field that the UI renders
    directly (see SlidesResult.error in frontend/services/api.ts), so the raw
    upstream string — "Gemini returned status 503 ... high demand" — must never
    land in it. It is logged by mask() instead. See app/core/errors.py.
    """
    result = generate_cheap_cloud(prompt, task="content_generation", system_prompt=system_prompt, json_mode=True)
    if not result.get("success"):
        failure = result.get("failure") or FailureClass.UPSTREAM_ERROR
        return {**fallback, "error": mask(failure, context=context_label, detail=str(result.get("error", "")))}
    try:
        return json.loads(result["content"])
    except ValueError as e:
        return {
            **fallback,
            "error": mask(FailureClass.UPSTREAM_ERROR, context=context_label, detail=f"invalid JSON: {e}"),
        }


# The content-shape rules are stated in the prompt AND enforced in code
# afterwards. The prompt gets us a good first draft cheaply; the code is what
# makes the guarantee, because a cheap model ignores counting instructions
# often enough that "we asked nicely" is not a guardrail.
_SLIDE_SHAPE_RULES = f"""
Content rules (strict):
- Every slide: a title of at most {MAX_TITLE_CHARS} characters.
- Every slide: between {MIN_BULLETS_PER_SLIDE} and {MAX_BULLETS_PER_SLIDE} bullet points.
- Every bullet: at most {MAX_BULLET_CHARS} characters, and at most {MAX_SLIDE_BODY_CHARS} characters of
  bullet text per slide in total. Bullets are phrases, not paragraphs or full sentences.
- Every slide: non-empty speaker_notes — what the teacher says aloud, which is where the
  detail belongs instead of on the slide.
- No two slides share a title. No slide is empty.
"""

_SLIDES_SYSTEM_PROMPT = """You are Vivran's presentation generation engine (§13).
Return JSON only: {"title": string, "slides": [{"slide_number": int, "title": string, "bullet_points": string[], "speaker_notes": string}]}
""" + _SLIDE_SHAPE_RULES + LEVEL_INSTRUCTION


def generate_slides(topic: str, slide_count: int = 12, grade: Optional[str] = None, subject: Optional[str] = None, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    """Generates a deck and forces it into a renderable shape.

    Mirrors the assessment engine's validate -> feed-the-errors-back -> retry
    loop (app/generation/assessments.py): one targeted regeneration that is told
    exactly what was wrong, then deterministic repair for whatever is left. The
    deck is rendered by a fixed template (app/generation/slide_html.py), so the
    only thing that can make a deck look broken is content that doesn't fit —
    which is what this loop removes.
    """
    prompt, context = _grounded_prompt(topic, grade, subject, workspace_id, f"Generate exactly {slide_count} slides.")

    data: Dict[str, Any] = {}
    validation = None
    for attempt in range(2):
        feedback = ""
        if validation is not None:
            feedback = (
                "\n\nYour previous attempt broke these rules — fix every one of them and return "
                "the full deck again:\n- " + "\n- ".join(validation.errors)
            )
        data = _call(prompt + feedback, _SLIDES_SYSTEM_PROMPT, {"title": f"Presentation on {topic}", "slides": []}, "slides")
        if data.get("error"):
            break  # generation itself failed; retrying here would just re-burn quota

        validation = validate_slides(data, slide_count)
        if validation.valid:
            break
        logger.warning(
            "Slide guardrails failed on attempt %s/2 for %r: %s",
            attempt + 1, topic, "; ".join(validation.errors[:5]),
        )

    # Last line of defence: truncate/renumber/drop whatever the model still got
    # wrong, so a teacher never receives a slide that overflows its box.
    data = repair_slides(data, slide_count)
    final_validation = validate_slides(data, slide_count) if data.get("slides") else None

    return {
        **data,
        "artifact_type": "slides",
        # The ACTUAL number of slides in the deck, not the number requested.
        # These diverge often (ask for 12, a cheap model returns 9) and
        # reporting the request made the UI lie about its own output. Placed
        # AFTER **data so a stray "slide_count" from the model can't win.
        "slide_count": len(data.get("slides") or []),
        "requested_slide_count": slide_count,
        "grounded_on": len(context),
        "sources": _sources_payload(context),
        # Reported, not raised: a deck that is 9 slides instead of 12, or has a
        # slide missing speaker notes, is still worth shipping — the teacher can
        # see the gap and fill it. Shipping it silently would not be.
        "guardrail_warnings": (final_validation.errors if final_validation and not final_validation.valid else []),
    }


_WORKSHEET_SYSTEM_PROMPT = """You are Vivran's worksheet generation engine (§13).
Return JSON only: {"title": string, "instructions": string, "questions": [{"question_text": string, "answer": string}]}
""" + LEVEL_INSTRUCTION


def generate_worksheet(topic: str, question_count: int = 10, grade: Optional[str] = None, subject: Optional[str] = None, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    prompt, context = _grounded_prompt(topic, grade, subject, workspace_id, f"Generate exactly {question_count} practice questions with answer keys.")
    data = _call(prompt, _WORKSHEET_SYSTEM_PROMPT, {"title": f"Worksheet — {topic}", "instructions": "", "questions": []}, "worksheet")
    return {"artifact_type": "worksheet", "question_count": question_count, "grounded_on": len(context), "sources": _sources_payload(context), **data}


_LESSON_NOTES_SYSTEM_PROMPT = """You are Vivran's lesson notes generation engine (§13).
Return JSON only: {"title": string, "sections": [{"heading": string, "content": string}], "real_life_examples": string[], "recap": string}
""" + LEVEL_INSTRUCTION


def generate_lesson_notes(topic: str, grade: Optional[str] = None, subject: Optional[str] = None, workspace_id: Optional[str] = None) -> Dict[str, Any]:
    prompt, context = _grounded_prompt(topic, grade, subject, workspace_id, "Generate structured teaching notes with clear explanations.")
    data = _call(prompt, _LESSON_NOTES_SYSTEM_PROMPT, {"title": f"Lesson Notes — {topic}", "sections": [], "real_life_examples": [], "recap": ""}, "lesson notes")
    return {"artifact_type": "lesson_notes", "grounded_on": len(context), "sources": _sources_payload(context), **data}
