"""Dormant second provider: Groq's OpenAI-compatible chat completions API.

STATUS: THIS CODE HAS NEVER RUN AGAINST THE REAL SERVICE.
--------------------------------------------------------
There is no GROQ_API_KEY on this machine or in the deployed environment, so
nothing here has been exercised beyond its unit tests with a mocked transport.
It is therefore built to be *inert*: ``is_configured()`` is False without a key,
every caller checks that first, and with no key set the behaviour of this
backend is byte-for-byte what it was before this module existed. Switching it on
is one environment variable — and the first real call will also be the first
test of this file, so watch the logs when you do.

WHERE THE FAILOVER DECISION LIVES
---------------------------------
Not here, and not in app/ai/gemini_client.py's retry loop. That loop is
provider-specific and has no idea what the call was for; the tier wrapper in
app/ai/cheap_model.py has the classified failure in hand and knows whether a
different provider could plausibly do the job. See the comment there for which
failure classes may fail over and, more importantly, which must not.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.errors import FailureClass, classify_upstream_status
from app.core.logging import logger
from app.ai.usage import TokenUsage, usage_from_openai_compatible

ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"


class GroqError(RuntimeError):
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


@dataclass
class GroqCompletion:
    text: str
    model: str
    usage: TokenUsage


def is_configured() -> bool:
    """True only when a key is actually set. The single switch for this module."""
    return bool(settings.groq_api_key)


def generate_text(
    prompt: str,
    *,
    system_prompt: str = "",
    model: Optional[str] = None,
    json_mode: bool = False,
    temperature: float = 0.4,
    timeout: float = 60.0,
) -> GroqCompletion:
    """One chat completion. Raises GroqError on anything that is not a usable answer.

    No retry loop: this is only ever reached because Gemini was already busy, so
    the caller is on its second provider and its third-or-later attempt overall.
    Spending more wall-clock here would push a teacher's generation past the
    point where they read it as broken.
    """
    if not is_configured():
        raise GroqError("GROQ_API_KEY is not configured", failure=FailureClass.NOT_CONFIGURED)

    model_name = model or settings.groq_model
    messages: List[Dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload: Dict[str, Any] = {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        # OpenAI-compatible JSON mode. Gemini's json_mode needs no instruction
        # in the prompt; this one is documented to require the word "JSON" to
        # appear in the conversation, which every json_mode system prompt in
        # this codebase already satisfies ("Return JSON only").
        payload["response_format"] = {"type": "json_object"}

    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.post(
                ENDPOINT,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json=payload,
            )
    except httpx.HTTPError as e:
        raise GroqError(
            f"Groq request failed: {e}",
            failure=classify_upstream_status(None),
            body=str(e),
        ) from e

    if r.status_code != 200:
        failure = classify_upstream_status(r.status_code, r.text)
        logger.warning("Groq %s returned %s: %s", model_name, r.status_code, r.text[:500])
        raise GroqError(
            f"Groq returned status {r.status_code}: {r.text[:300]}",
            failure=failure,
            status_code=r.status_code,
            body=r.text,
        )

    try:
        data = r.json()
    except (ValueError, json.JSONDecodeError) as e:
        raise GroqError(f"Groq returned a non-JSON body: {e}", failure=FailureClass.UPSTREAM_ERROR) from e

    choices = data.get("choices") or []
    text = ""
    if choices:
        text = (choices[0].get("message") or {}).get("content") or ""
    if not text:
        # Same reasoning as the Gemini path: an empty completion is a refusal or
        # a filter, and it reproduces on a retry.
        raise GroqError(
            "Groq returned an empty completion",
            failure=FailureClass.CONTENT_BLOCKED,
            body=str(data)[:600],
        )

    return GroqCompletion(text=text, model=model_name, usage=usage_from_openai_compatible(data))
