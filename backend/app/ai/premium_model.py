"""Tier 3 Premium Cloud AI Interface (§22)."""
from typing import Any, Dict

from app.ai.gemini_client import GeminiError, generate_text
from app.core.config import settings


def generate_premium_cloud(
    prompt: str, task: str = "complex_reasoning", system_prompt: str = "", json_mode: bool = False
) -> Dict[str, Any]:
    try:
        content = generate_text(
            prompt, system_prompt=system_prompt, model=settings.premium_model, temperature=0.5, json_mode=json_mode
        )
        return {
            "success": True,
            "model_tier": "premium",
            "model_name": settings.premium_model,
            "task": task,
            "content": content,
        }
    except GeminiError as e:
        return {
            "success": False,
            "model_tier": "premium",
            "model_name": settings.premium_model,
            "task": task,
            "content": "",
            "error": str(e),
        }
