"""Creative Prompt Enhancement — elaborates a short video/image request into
a richer prompt with concrete illustration/animation suggestions, so a
one-line request like "create a video on Porter's Five Forces" turns into
something an image/video model can actually render well.
"""
import json
from typing import Any, Dict, Optional

from app.ai.cheap_model import generate_cheap_cloud
from app.retrieval.search import search_knowledge_base
from app.core.errors import FailureClass, mask
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
    chunks: list = []
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
    # On failure the teacher's original prompt is returned unchanged and still
    # usable, so "error" here is advisory, not fatal — but it is rendered
    # verbatim in the UI (create/page.tsx), so it carries the translated
    # message and the raw upstream detail goes to the log via mask().
    if not result.get("success"):
        failure = result.get("failure") or FailureClass.UPSTREAM_ERROR
        return {
            "enhanced_prompt": raw_prompt, "illustration_suggestions": [], "animation_suggestions": [],
            "error": mask(failure, context="prompt enhancement", detail=str(result.get("error", ""))),
        }

    try:
        data = json.loads(result["content"])
    except ValueError as e:
        return {
            "enhanced_prompt": raw_prompt, "illustration_suggestions": [], "animation_suggestions": [],
            "error": mask(FailureClass.UPSTREAM_ERROR, context="prompt enhancement", detail=f"invalid JSON: {e}"),
        }

    data.setdefault("illustration_suggestions", [])
    data.setdefault("animation_suggestions", [])
    data.setdefault("enhanced_prompt", raw_prompt)

    # Minimum viable instrumentation for "is enhancement worth it?".
    #
    # Everything here is deterministic and free — no judge model, no labels. It
    # is deliberately NOT a quality score: the only honest quality signal is
    # whether the teacher kept the enhanced prompt or edited it back, and that
    # is a frontend event we don't have yet (see the notes handed to the
    # founder). What this does give, from day one, is the denominator: how often
    # enhancement runs, how much it expands the prompt, how often it had any
    # grounding to work with, and how often it degenerates (returns the raw
    # prompt, or no concrete suggestions at all) — which is the failure mode
    # that makes the feature not worth its call.
    enhanced = str(data.get("enhanced_prompt") or "")
    logger.info(
        "prompt_enhancement artifact_type=%s raw_chars=%s enhanced_chars=%s expansion=%.2f "
        "grounded_chunks=%s illustrations=%s animations=%s unchanged=%s",
        artifact_type,
        len(raw_prompt),
        len(enhanced),
        (len(enhanced) / len(raw_prompt)) if raw_prompt else 0.0,
        len(chunks),
        len(data["illustration_suggestions"]),
        len(data["animation_suggestions"]),
        enhanced.strip() == raw_prompt.strip(),
    )

    data["grounded_on"] = len(chunks)
    return data
