"""Creative Prompt Enhancement — elaborates a short video/image request into
a richer prompt with concrete illustration/animation suggestions, so a
one-line request like "create a video on Porter's Five Forces" turns into
something an image/video model can actually render well.
"""
import json
from typing import Any, Dict, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.retrieval.search import search_knowledge_base
from app.core.logging import logger

_SYSTEM_PROMPT = """You are Vivran's creative prompt enhancement engine.
A teacher/professor gave a short request for an AI-generated {artifact_type}. Elaborate it into
something that will render well, and explain your suggestions so they can accept or edit them.
Return JSON only, matching exactly:
{{
  "enhanced_prompt": string (a single rewritten prompt ready to submit — specific, visual, concrete),
  "illustration_suggestions": string[] (3-5 concrete visual elements/icons/diagram parts to include),
  "animation_suggestions": string[] (2-4 ideas for motion/sequencing — empty array if artifact_type is "image"),
  "reasoning": string (one sentence on what you added and why)
}}
Keep the enhanced_prompt to 2-4 sentences, concrete and renderable — not vague ("make it engaging"),
but specific ("show a central company icon surrounded by five labeled arrows for each competitive force,
appearing one at a time with a brief on-screen label"). Ground it in the original topic; don't invent an
unrelated scenario."""


def enhance_creative_prompt(
    raw_prompt: str,
    artifact_type: str,
    workspace_id: Optional[str] = None,
) -> Dict[str, Any]:
    context_note = ""
    if workspace_id:
        try:
            chunks = search_knowledge_base(raw_prompt, workspace_id, limit=3)
            if chunks:
                context_note = "\n\nRelevant excerpts from the teacher's uploaded materials:\n" + "\n".join(
                    f"- {c['content'][:300]}" for c in chunks
                )
        except Exception as e:
            logger.warning("Retrieval for prompt enhancement failed (continuing without it): %s", e)

    prompt = f'Artifact type: {artifact_type}\nOriginal request: "{raw_prompt}"{context_note}'
    system_prompt = _SYSTEM_PROMPT.format(artifact_type=artifact_type)

    result = generate_cheap_cloud(prompt, task="prompt_enhancement", system_prompt=system_prompt, json_mode=True)
    if not result.get("success"):
        return {"enhanced_prompt": raw_prompt, "illustration_suggestions": [], "animation_suggestions": [], "error": result.get("error")}

    try:
        data = json.loads(result["content"])
    except ValueError as e:
        return {"enhanced_prompt": raw_prompt, "illustration_suggestions": [], "animation_suggestions": [], "error": f"AI returned invalid JSON: {e}"}

    data.setdefault("illustration_suggestions", [])
    data.setdefault("animation_suggestions", [])
    data.setdefault("enhanced_prompt", raw_prompt)
    return data
