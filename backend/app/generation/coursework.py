"""Interactive Coursework Block-Based Generation (§28).

Supported block types: text, explanation, image, question, quiz, activity, scenario, recap.
(Video/audio blocks are produced separately by the media pillar — see app/media/ —
since they require a distinct generation call with its own provider/cost.)
"""
import json
from typing import Any, Dict, List, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.ai.prompt_snippets import LEVEL_INSTRUCTION
from app.core.logging import logger
from app.retrieval.search import search_knowledge_base

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
    topic: str, duration_minutes: int = 15, grade: Optional[str] = None, subject: Optional[str] = None, workspace_id: Optional[str] = None
) -> Dict[str, Any]:
    context: List[Dict[str, Any]] = []
    if workspace_id:
        try:
            context = search_knowledge_base(topic, workspace_id, limit=5)
        except Exception as e:
            logger.warning("Retrieval for interactive coursework failed (continuing ungrounded): %s", e)

    lines = [f"Topic: {topic}", f"Duration: {duration_minutes} minutes"]
    if grade:
        lines.append(f"Grade: {grade}")
    if subject:
        lines.append(f"Subject: {subject}")
    if context:
        lines.append("\nGround this in the teacher's uploaded materials:")
        for c in context:
            lines.append(f"- ({c.get('source_material', 'source')}) {c['content'][:500]}")

    result = generate_cheap_cloud("\n".join(lines), task="interactive_coursework", system_prompt=_SYSTEM_PROMPT, json_mode=True)
    if not result.get("success"):
        return {"title": f"Interactive Lesson — {topic}", "duration_minutes": duration_minutes, "blocks": [], "grounded_on": len(context), "error": result.get("error")}

    try:
        data = json.loads(result["content"])
    except ValueError as e:
        return {"title": f"Interactive Lesson — {topic}", "duration_minutes": duration_minutes, "blocks": [], "grounded_on": len(context), "error": f"AI returned invalid JSON: {e}"}

    sources = [
        {"chunk_id": c["chunk_id"], "source_material": c.get("source_material"), "page_number": c.get("page_number"), "excerpt": c["content"][:200]}
        for c in context
    ]
    return {"duration_minutes": duration_minutes, "grounded_on": len(context), "sources": sources, **data}
