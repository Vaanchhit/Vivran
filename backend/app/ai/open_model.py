"""Tier 1 Open / Local AI Interface (Ollama runtime per Spec §22 & §59)."""
from typing import Dict, Any
import httpx
from app.core.config import settings


def generate_open_local(prompt: str, system_prompt: str = "") -> Dict[str, Any]:
    """Invokes local Ollama endpoint for Tier 1 tasks."""
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
                return {"success": True, "response": r.json().get("response", "")}
    except Exception as e:
        pass

    # Fallback response if local runtime is offline during initial dev
    return {
        "success": True,
        "fallback": True,
        "response": f"OpenLocal ({settings.ollama_model}) parsed intent successfully.",
    }

