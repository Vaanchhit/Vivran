"""Interactive Coursework Block-Based Generation (§28).

Supported block types: text, explanation, image, question, quiz, activity, scenario, recap.
(Video/audio blocks are produced separately by the media pillar — see app/media/ —
since they require a distinct generation call with its own provider/cost.)
"""
import json
from typing import Any, Dict, List, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.ai.prompt_snippets import LEVEL_INSTRUCTION
from app.ai.validators import validate_coursework
from app.core.errors import FailureClass, mask
from app.core.logging import logger
from app.generation.loop import run_validated
from app.retrieval.context import format_sources, sources_payload
from app.retrieval.search import search_many

_SYSTEM_PROMPT = """You are Vivran's interactive coursework engine (§28).
Return JSON only: {
  "title": string,
  "blocks": [
    {"type": "introduction"|"explanation"|"activity"|"scenario"|"question"|"quiz"|"recap", "position": int, "content": object}
  ]
}
Content shape per type: introduction/explanation/recap -> {"text": string}; activity/scenario -> {"text": string, "instructions": string};
question -> {"text": string, "answer": string}; quiz -> {"question_count": int, "questions": [{"text": string, "answer": string}]}.
Sequence blocks so the lesson builds understanding progressively within the given duration.
""" + LEVEL_INSTRUCTION


def generate_interactive_coursework(
    topic: str,
    duration_minutes: int = 15,
    grade: Optional[str] = None,
    subject: Optional[str] = None,
    workspace_id: Optional[str] = None,
    style_lines: Optional[List[str]] = None,
) -> Dict[str, Any]:
    context: List[Dict[str, Any]] = []
    if workspace_id:
        try:
            queries = [topic] + ([f"{subject} {topic}"] if subject else [])
            context = search_many(queries, workspace_id, limit=5)
        except Exception as e:
            logger.warning("Retrieval for interactive coursework failed (continuing ungrounded): %s", e)

    lines = [f"Topic: {topic}", f"Duration: {duration_minutes} minutes"]
    if grade:
        lines.append(f"Grade: {grade}")
    if subject:
        lines.append(f"Subject: {subject}")
    if context:
        lines.append("\nGround this in the teacher's uploaded materials:")
        lines.extend(format_sources(context, topic))
    lines.extend(style_lines or [])
    prompt = "\n".join(lines)

    def failed(error: str) -> Dict[str, Any]:
        return {
            "title": f"Interactive Lesson — {topic}", "duration_minutes": duration_minutes, "blocks": [],
            "grounded_on": len(context), "error": error,
        }

    # The "error" here is rendered straight into the UI, so it carries the
    # translated message; the raw upstream detail is logged by mask().
    def call(feedback: str) -> Dict[str, Any]:
        result = generate_cheap_cloud(prompt + feedback, task="interactive_coursework", system_prompt=_SYSTEM_PROMPT, json_mode=True)
        if not result.get("success"):
            return failed(mask(result.get("failure") or FailureClass.UPSTREAM_ERROR, context="interactive coursework", detail=str(result.get("error", ""))))
        try:
            data = json.loads(result["content"])
        except ValueError as e:
            return failed(mask(FailureClass.UPSTREAM_ERROR, context="interactive coursework", detail=f"invalid JSON: {e}"))
        return data if isinstance(data, dict) else failed(mask(FailureClass.UPSTREAM_ERROR, context="interactive coursework", detail="not an object"))

    data, errors, meta = run_validated(call, validate_coursework, label="interactive_coursework")
    if data.get("error"):
        return data
    return {
        "duration_minutes": duration_minutes,
        "grounded_on": len(context),
        "sources": sources_payload(context),
        **data,
        "guardrail_warnings": errors,
        "generation": meta.public(),
    }
