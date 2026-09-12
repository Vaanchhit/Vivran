"""Thin client for the Gemini API (generateContent + embedContent).

Every AI tier in app/ai/*.py routes through here. Raises GeminiError on any
failure (missing key, network error, non-2xx response) so callers can decide
how to degrade — never fabricate a response here.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.logging import logger

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class GeminiError(RuntimeError):
    pass


def _require_key() -> str:
    if not settings.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not configured")
    return settings.gemini_api_key


def generate_text(
    prompt: str,
    system_prompt: str = "",
    model: Optional[str] = None,
    json_mode: bool = False,
    temperature: float = 0.4,
) -> str:
    """Calls Gemini generateContent and returns the text of the first candidate."""
    api_key = _require_key()
    model_name = model or settings.cheap_model

    payload: Dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    if system_prompt:
        payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    url = f"{BASE_URL}/models/{model_name}:generateContent"
    try:
        with httpx.Client(timeout=60.0) as client:
            r = client.post(url, params={"key": api_key}, json=payload)
    except httpx.HTTPError as e:
        raise GeminiError(f"Gemini request failed: {e}") from e

    if r.status_code != 200:
        logger.warning("Gemini %s returned %s: %s", model_name, r.status_code, r.text[:500])
        raise GeminiError(f"Gemini returned status {r.status_code}: {r.text[:300]}")

    data = r.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise GeminiError(f"Gemini returned no candidates (finish reason likely blocked): {data}")

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    if not text:
        raise GeminiError("Gemini returned an empty response")
    return text


def generate_json(
    prompt: str,
    system_prompt: str = "",
    model: Optional[str] = None,
    temperature: float = 0.4,
) -> Dict[str, Any]:
    """Calls Gemini in JSON mode and parses the result. Raises GeminiError on
    a non-JSON response so callers never silently proceed with garbage."""
    raw = generate_text(prompt, system_prompt=system_prompt, model=model, json_mode=True, temperature=temperature)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise GeminiError(f"Gemini returned invalid JSON: {e}. Raw: {raw[:300]}") from e


def embed_text(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
    """Embeds a single text chunk using the configured Gemini embedding model."""
    api_key = _require_key()
    url = f"{BASE_URL}/models/{settings.embedding_model}:embedContent"
    payload = {
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
        "outputDimensionality": settings.embedding_dimensions,
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(url, params={"key": api_key}, json=payload)
    except httpx.HTTPError as e:
        raise GeminiError(f"Gemini embedding request failed: {e}") from e

    if r.status_code != 200:
        raise GeminiError(f"Gemini embedding returned status {r.status_code}: {r.text[:300]}")

    values = r.json().get("embedding", {}).get("values")
    if not values:
        raise GeminiError("Gemini embedding response missing values")
    return values
