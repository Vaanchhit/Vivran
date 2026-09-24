"""Tier 2 Cheap Cloud AI Interface (§22)."""
from typing import Any, Dict

from app.ai.gemini_client import GeminiError, generate_text
from app.core.config import settings


def generate_cheap_cloud(
    prompt: str, task: str = "content_generation", system_prompt: str = "", json_mode: bool = False
) -> Dict[str, Any]:
    try:
        content = generate_text(prompt, system_prompt=system_prompt, model=settings.cheap_model, json_mode=json_mode)
        return {
            "success": True,
            "model_tier": "cheap_cloud",
            "model_name": settings.cheap_model,
            "task": task,
            "content": content,
        }
    except GeminiError as e:
        return {
            # "error" stays the raw upstream string: it is what gets LOGGED.
            # "failure" is the classified form the API layer uses to pick the
            # user-facing message (app/core/errors.py) — callers must never put
            # "error" in front of a teacher.
            "success": False,
            "model_tier": "cheap_cloud",
            "model_name": settings.cheap_model,
            "task": task,
            "content": "",
            "error": str(e),
            "failure": e.failure,
        }
