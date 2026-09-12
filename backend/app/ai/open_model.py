"""Tier 1 Open / Local AI Interface (§22 & §59).

Tries a local Ollama runtime first (cheap for local dev); if unset or
unreachable, falls back to Gemini's cheapest/fastest model so the tier still
does real work in any environment (including production, where no Ollama
host exists).
"""
from typing import Any, Dict

import httpx

from app.ai.gemini_client import GeminiError, generate_text
from app.core.config import settings
from app.core.logging import logger


def generate_open_local(prompt: str, system_prompt: str = "") -> Dict[str, Any]:
    if settings.ollama_host:
        try:
            url = f"{settings.ollama_host}/api/generate"
            payload = {
                "model": settings.ollama_model,
                "prompt": prompt,
                "system": system_prompt,
                "stream": False,
            }
            with httpx.Client(timeout=10.0) as client:
                r = client.post(url, json=payload)
                if r.status_code == 200:
                    return {"success": True, "provider": "ollama", "response": r.json().get("response", "")}
                logger.warning("Ollama returned status %s", r.status_code)
        except Exception as e:
            logger.warning("Ollama unavailable (%s); falling back to Gemini", e)

    try:
        text = generate_text(prompt, system_prompt=system_prompt, model=settings.open_model, temperature=0.2)
        return {"success": True, "provider": "gemini", "response": text}
    except GeminiError as e:
        logger.warning("Tier 1 Gemini fallback failed: %s", e)
        return {"success": False, "provider": "none", "response": "", "error": str(e)}
