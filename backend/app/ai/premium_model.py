"""Tier 3 Premium Cloud AI Interface (§22).

Gated by ``settings.premium_tier_enabled``, which is OFF. Call sites must check
it before calling — see app/generation/assessments.py — because on this key
every Pro-tier model answers 429 and the only thing an ungated attempt buys is
one spent request out of the twenty available that minute.

No Groq failover here on purpose: this tier exists precisely because the caller
wanted a *more* capable model than the cheap tier, and a free-tier OSS model is
not that. When premium fails, falling back to the cheap tier — which the caller
already does — is the honest degradation.
"""
from typing import Any, Dict

from app.ai.gemini_client import GeminiError, generate_text
from app.ai.router import ModelTier
from app.ai.usage import usage_scope
from app.core.config import settings


def generate_premium_cloud(
    prompt: str, task: str = "complex_reasoning", system_prompt: str = "", json_mode: bool = False
) -> Dict[str, Any]:
    with usage_scope() as usage:
        try:
            content = generate_text(
                prompt, system_prompt=system_prompt, model=settings.premium_model, temperature=0.5, json_mode=json_mode
            )
            return {
                "success": True,
                "model_tier": ModelTier.PREMIUM.value,
                "model_name": settings.premium_model,
                "provider": "gemini",
                "task": task,
                "content": content,
                "usage": usage.to_dict(),
            }
        except GeminiError as e:
            return {
                "success": False,
                "model_tier": ModelTier.PREMIUM.value,
                "model_name": settings.premium_model,
                "provider": "gemini",
                "task": task,
                "content": "",
                "usage": usage.to_dict(),
                "error": str(e),
                # Classified failure for app/core/errors.py — see cheap_model.py.
                "failure": e.failure,
            }
