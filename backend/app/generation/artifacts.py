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
    validate_lesson_notes,
    validate_slides,
    validate_worksheet,
)
from app.core.errors import FailureClass, mask
from app.core.logging import logger
from app.generation.loop import LoopMeta, run_validated
from app.retrieval.context import format_sources, resolve_tags, sources_payload, support_level, tag_map
from app.retrieval.search import search_many


def _ground(topic: str, subject: Optional[str], workspace_id: Optional[str], limit: int = 6) -> List[Dict[str, Any]]:
    """Passages from the teacher's materials that actually bear on the topic (maybe none)."""
    if not workspace_id:
        return []
    queries = [topic] + ([f"{subject} {topic}"] if subject else [])
    try:
        return search_many(queries, workspace_id, limit=limit)
    except Exception as e:
        logger.warning("Retrieval for artifact generation failed (continuing ungrounded): %s", e)
        return []


def _grounded_prompt(
    topic: str,
    grade: Optional[str],
    subject: Optional[str],
    workspace_id: Optional[str],
    extra: str,
    style_lines: Optional[List[str]] = None,
) -> tuple[str, List[Dict[str, Any]]]:
    lines = [f"Topic: {topic}"]
    if grade:
        lines.append(f"Grade: {grade}")
    if subject:
        lines.append(f"Subject: {subject}")
    lines.append(extra)

    context = _ground(topic, subject, workspace_id)
    if context:
        lines.append(
            "\nGround this in the teacher's own materials. Cite the tag of each passage you draw on "
            'in "source_ids" (for example ["S1","S3"]); use [] where none applies. Never invent a tag:'
        )
        lines.extend(format_sources(context, topic))
    lines.extend(style_lines or [])
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
        data = json.loads(result["content"])
    except ValueError as e:
        return {
            **fallback,
            "error": mask(FailureClass.UPSTREAM_ERROR, context=context_label, detail=f"invalid JSON: {e}"),
        }
    if not isinstance(data, dict):
        return {**fallback, "error": mask(FailureClass.UPSTREAM_ERROR, context=context_label, detail="not an object")}
    return data


def _attach_sources(items: List[Any], context: List[Dict[str, Any]], claim_keys: tuple[str, ...] = ()) -> int:
    """Turns each item's "S1"-style tags into real chunk ids, and rates how well the sources back it.

    Returns how many invented tags were seen (reported by the caller, never hidden).
    """
    mapping = tag_map(context)
    invented_total = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        real, invented = resolve_tags(item.get("source_ids"), mapping)
        invented_total += len(invented)
        item["source_ids"] = real
        if claim_keys:
            cited = [c for c in context if str(c["chunk_id"]) in real]
            claim = " ".join(str(item.get(k, "")) for k in claim_keys)
            item["support"] = support_level(claim, cited)
    return invented_total


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

    One targeted regeneration that is told exactly what was wrong (the shared
    loop, app/generation/loop.py), then deterministic repair for whatever is
    left. The deck is rendered by a fixed template (app/generation/slide_html.py),
    so the only thing that can make a deck look broken is content that doesn't
    fit, which is what this removes.
    """
    prompt, context = _grounded_prompt(topic, grade, subject, workspace_id, f"Generate exactly {slide_count} slides.")
    fallback = {"title": f"Presentation on {topic}", "slides": []}

    data, _errors, meta = run_validated(
        lambda feedback: _call(prompt + feedback, _SLIDES_SYSTEM_PROMPT, fallback, "slides"),
        lambda d: validate_slides(d, slide_count).errors,
        label="slides",
    )

    # Last line of defence: truncate/renumber/drop whatever the model still got
    # wrong, so a teacher never receives a slide that overflows its box.
    data = repair_slides(data, slide_count)
    final_validation = validate_slides(data, slide_count) if data.get("slides") else None

    return {
        **data,
        "artifact_type": "slides",
        # The ACTUAL number of slides in the deck, not the number requested.
        # Placed AFTER **data so a stray "slide_count" from the model can't win.
        "slide_count": len(data.get("slides") or []),
        "requested_slide_count": slide_count,
        "grounded_on": len(context),
        "sources": sources_payload(context),
        # Reported, not raised: a deck that is 9 slides instead of 12 is still
        # worth shipping — the teacher can see the gap and fill it.
        "guardrail_warnings": (final_validation.errors if final_validation and not final_validation.valid else []),
        "generation": meta.public(),
    }


_WORKSHEET_SYSTEM_PROMPT = """You are Vivran's worksheet generation engine (§13).
Return JSON only: {"title": string, "instructions": string, "questions": [{"question_text": string, "answer": string, "source_ids": string[]}]}
Every question needs a correct, non-empty answer. Do not repeat a question.
""" + LEVEL_INSTRUCTION


def _clean_questions(qs: Any) -> List[Dict[str, Any]]:
    """Drops empty and repeated questions; what remains is safe to count."""
    out: List[Dict[str, Any]] = []
    seen: set = set()
    for q in qs if isinstance(qs, list) else []:
        if not isinstance(q, dict) or not str(q.get("question_text", "")).strip():
            continue
        key = " ".join(str(q["question_text"]).lower().split())
        if key in seen:
            continue
        seen.add(key)
        out.append(q)
    return out


def generate_worksheet(
    topic: str,
    question_count: int = 10,
    grade: Optional[str] = None,
    subject: Optional[str] = None,
    workspace_id: Optional[str] = None,
    style_lines: Optional[List[str]] = None,
) -> Dict[str, Any]:
    prompt, context = _grounded_prompt(
        topic, grade, subject, workspace_id,
        f"Generate exactly {question_count} practice questions with answer keys.", style_lines,
    )
    fallback = {"title": f"Worksheet — {topic}", "instructions": "", "questions": []}
    data = _call(prompt, _WORKSHEET_SYSTEM_PROMPT, fallback, "worksheet")
    meta = LoopMeta(label="worksheet", attempts=1)
    warnings: List[str] = []

    if not data.get("error"):
        questions = _clean_questions(data.get("questions"))
        meta.first_pass_valid = not validate_worksheet({**data, "questions": questions}, question_count)
        # Short? Ask only for the shortfall, shown what already exists. Writing
        # three more questions costs a fraction of writing all ten again.
        missing = question_count - len(questions)
        if missing > 0 and questions:
            meta.attempts = 2
            have = "\n".join(f"- {str(q['question_text'])[:120]}" for q in questions)
            more = _call(
                f"{prompt}\n\nThese questions already exist:\n{have}\n\nWrite exactly {missing} MORE, each different "
                "from all of them, in the same JSON shape.",
                _WORKSHEET_SYSTEM_PROMPT, fallback, "worksheet",
            )
            if not more.get("error"):
                questions = _clean_questions(questions + (more.get("questions") or []))
        questions = questions[:question_count]
        if len(questions) < question_count:
            warnings.append(f"Asked for {question_count} questions; {len(questions)} could be written. Add the rest by hand or generate again.")
        invented = _attach_sources(questions, context, claim_keys=("question_text", "answer"))
        data["questions"] = questions
        meta.stopped = "valid" if not warnings else "max_attempts"
        if invented:
            warnings.append(f"{invented} citation(s) pointed at passages that were never provided and were ignored.")
    else:
        meta.stopped = "upstream_error"

    return {
        "artifact_type": "worksheet",
        # The REAL count, like slides: reporting the request made the UI lie about its own output.
        "requested_question_count": question_count,
        "grounded_on": len(context),
        "sources": sources_payload(context),
        **data,
        "question_count": len(data.get("questions") or []),
        "guardrail_warnings": warnings,
        "generation": meta.public(),
    }


_LESSON_NOTES_SYSTEM_PROMPT = """You are Vivran's lesson notes generation engine (§13).
Return JSON only: {"title": string, "sections": [{"heading": string, "content": string, "source_ids": string[]}], "real_life_examples": string[], "recap": string}
""" + LEVEL_INSTRUCTION


def generate_lesson_notes(
    topic: str,
    grade: Optional[str] = None,
    subject: Optional[str] = None,
    workspace_id: Optional[str] = None,
    style_lines: Optional[List[str]] = None,
) -> Dict[str, Any]:
    prompt, context = _grounded_prompt(
        topic, grade, subject, workspace_id, "Generate structured teaching notes with clear explanations.", style_lines
    )
    fallback = {"title": f"Lesson Notes — {topic}", "sections": [], "real_life_examples": [], "recap": ""}
    data, errors, meta = run_validated(
        lambda feedback: _call(prompt + feedback, _LESSON_NOTES_SYSTEM_PROMPT, fallback, "lesson notes"),
        validate_lesson_notes,
        label="lesson_notes",
    )
    invented = _attach_sources(data.get("sections") or [], context, claim_keys=("content",))
    warnings = list(errors)
    if invented:
        warnings.append(f"{invented} citation(s) pointed at passages that were never provided and were ignored.")
    return {
        "artifact_type": "lesson_notes",
        "grounded_on": len(context),
        "sources": sources_payload(context),
        **data,
        "guardrail_warnings": warnings,
        "generation": meta.public(),
    }
