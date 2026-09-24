"""Thin client for the Gemini API (generateContent + embedContent).

Every AI tier in app/ai/*.py routes through here. Raises GeminiError on any
failure (missing key, network error, non-2xx response) so callers can decide
how to degrade — never fabricate a response here.

GeminiError carries a machine-readable `failure` (app/core/errors.FailureClass)
alongside the human string, so the API layer can pick the right user-facing
message without regex-ing an exception message.

Transient failures are retried here rather than at each call site: a single
Google-side 503 used to be enough to drop the whole request onto its degraded
path (e.g. prompt_compiler's keyword heuristic), which silently made the
teacher's result worse for a blip that clears in under a second.
"""
from __future__ import annotations

import json
import random
import time
from typing import Any, Callable, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.errors import FailureClass, classify_upstream_status
from app.core.logging import logger

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# --- Retry policy -----------------------------------------------------------
# These calls already take 10-40s, so the retry budget is deliberately small:
# a generous policy would turn a 40s generation into a two-minute hang that the
# teacher reads as "broken" long before it succeeds. Two retries at ~0.8s and
# ~1.6s recover the overwhelmingly common case (a momentary UNAVAILABLE spike)
# for at most ~3.5s of added wall-clock, and give up quickly when Google is
# genuinely down.
_MAX_ATTEMPTS = 3               # 1 initial try + 2 retries
_BACKOFF_BASE_SECONDS = 0.8
_BACKOFF_FACTOR = 2.0
_BACKOFF_JITTER = 0.4           # +/- fraction, spreads concurrent retries out
_RETRY_BUDGET_SECONDS = 3.5     # hard cap on total *added* sleep time

# Only these classes are ever retried. Everything else (400 bad request, 401/403
# auth, a quota cap, invalid JSON from the model, a safety block) is
# deterministic: retrying spends quota to get the identical failure back.
_RETRYABLE = (FailureClass.UPSTREAM_BUSY,)


class GeminiError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        failure: FailureClass = FailureClass.UPSTREAM_ERROR,
        status_code: Optional[int] = None,
        body: str = "",
    ):
        super().__init__(message)
        self.failure = failure
        self.status_code = status_code
        self.body = body


def _require_key() -> str:
    if not settings.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not configured", failure=FailureClass.NOT_CONFIGURED)
    return settings.gemini_api_key


def _backoff_delay(attempt: int) -> float:
    """Exponential backoff with symmetric jitter. `attempt` is 1-based."""
    base = _BACKOFF_BASE_SECONDS * (_BACKOFF_FACTOR ** (attempt - 1))
    return base * (1.0 + random.uniform(-_BACKOFF_JITTER, _BACKOFF_JITTER))


def _post_with_retry(
    label: str,
    send: Callable[[], httpx.Response],
) -> httpx.Response:
    """Runs `send`, retrying only genuinely transient failures.

    Returns the first 2xx response, or raises GeminiError classified from the
    last failure. `label` names the call for the log line (model or "embedding").
    """
    spent = 0.0
    last: Optional[GeminiError] = None

    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            r = send()
        except httpx.HTTPError as e:
            # Connection refused / read timeout / DNS: no status at all, which
            # classify_upstream_status treats as transient.
            last = GeminiError(
                f"Gemini request failed: {e}",
                failure=classify_upstream_status(None),
                status_code=None,
                body=str(e),
            )
        else:
            if r.status_code == 200:
                return r
            failure = classify_upstream_status(r.status_code, r.text)
            logger.warning("Gemini %s returned %s: %s", label, r.status_code, r.text[:500])
            last = GeminiError(
                f"Gemini returned status {r.status_code}: {r.text[:300]}",
                failure=failure,
                status_code=r.status_code,
                body=r.text,
            )

        if last.failure not in _RETRYABLE or attempt == _MAX_ATTEMPTS:
            break

        delay = _backoff_delay(attempt)
        if spent + delay > _RETRY_BUDGET_SECONDS:
            logger.warning(
                "Gemini %s: transient failure on attempt %s/%s but the %.1fs retry budget is "
                "spent — giving up (%s)",
                label, attempt, _MAX_ATTEMPTS, _RETRY_BUDGET_SECONDS, last,
            )
            break

        logger.warning(
            "Gemini %s: transient failure on attempt %s/%s (%s) — retrying in %.2fs",
            label, attempt, _MAX_ATTEMPTS, last.failure.value, delay,
        )
        time.sleep(delay)
        spent += delay

    assert last is not None
    raise last


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

    def _send() -> httpx.Response:
        with httpx.Client(timeout=60.0) as client:
            return client.post(url, params={"key": api_key}, json=payload)

    r = _post_with_retry(model_name, _send)

    data = r.json()
    candidates = data.get("candidates") or []
    if not candidates:
        # Almost always a safety filter. Deterministic — retrying the identical
        # prompt reproduces it, so this is raised, not retried.
        raise GeminiError(
            f"Gemini returned no candidates (finish reason likely blocked): {data}",
            failure=FailureClass.CONTENT_BLOCKED,
            body=str(data)[:600],
        )

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    if not text:
        raise GeminiError("Gemini returned an empty response", failure=FailureClass.CONTENT_BLOCKED)
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
        # Not retried here: the callers that care (assessments, slides) already
        # run a validate -> feed-the-error-back -> regenerate loop, which is a
        # strictly better recovery than blindly re-sending the same prompt.
        raise GeminiError(
            f"Gemini returned invalid JSON: {e}. Raw: {raw[:300]}",
            failure=FailureClass.UPSTREAM_ERROR,
            body=raw[:600],
        ) from e


def embed_text(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
    """Embeds a single text chunk using the configured Gemini embedding model."""
    api_key = _require_key()
    url = f"{BASE_URL}/models/{settings.embedding_model}:embedContent"
    payload = {
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
        "outputDimensionality": settings.embedding_dimensions,
    }

    def _send() -> httpx.Response:
        with httpx.Client(timeout=30.0) as client:
            return client.post(url, params={"key": api_key}, json=payload)

    r = _post_with_retry(f"embedding/{settings.embedding_model}", _send)

    values = r.json().get("embedding", {}).get("values")
    if not values:
        raise GeminiError("Gemini embedding response missing values", failure=FailureClass.UPSTREAM_ERROR)
    return values
