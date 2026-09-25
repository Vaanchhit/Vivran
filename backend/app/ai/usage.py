"""Token accounting for model calls.

WHY
---
Gemini returns ``usageMetadata: {promptTokenCount, candidatesTokenCount, ...}``
in the same response body as the generated text, at no extra cost and with no
extra call. We were parsing ``candidates`` and throwing the rest away, which
meant every statement about what a generation costs — per teacher, per artifact
type, per tier — was a guess derived from character counts. Reading two integers
that are already on the wire replaces the guess with a measurement.

TWO DESTINATIONS, ONE SOURCE
----------------------------
1. The per-call envelope (``app/ai/cheap_model.py`` and friends) carries the
   usage of that one call, because the caller that made it is the only thing
   that knows which artifact it was for.
2. ``generation_jobs.input_tokens`` / ``output_tokens`` want the total for a
   whole job, which is usually several calls: a validate-and-regenerate loop,
   a retry, plus the embedding call retrieval made first. Threading a running
   total through every generation function would touch a dozen call sites and
   still miss the ones nested inside retrieval, so a job instead opens a
   ``usage_scope()`` and every model call inside it adds itself.

The scope is thread-local because app/services/jobs.py runs jobs on a
ThreadPoolExecutor: two concurrent generations must not bill each other, and a
job thread must not see tokens spent by the request path.
"""
from __future__ import annotations

import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Dict, Iterator, Optional


@dataclass
class TokenUsage:
    """Tokens spent. ``calls`` counts model round-trips, not retries avoided."""

    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0

    def __add__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            calls=self.calls + other.calls,
        )

    def add(self, other: "TokenUsage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.calls += other.calls

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens

    def to_dict(self) -> Dict[str, int]:
        return {
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "calls": self.calls,
        }


def usage_from_gemini(data: Dict[str, Any]) -> TokenUsage:
    """Reads ``usageMetadata`` off a generateContent response body.

    Absent or malformed metadata yields zeros rather than raising — a missing
    counter must never be able to fail a generation that otherwise worked.
    """
    meta = data.get("usageMetadata") or {}

    def _int(key: str) -> int:
        try:
            return max(0, int(meta.get(key) or 0))
        except (TypeError, ValueError):
            return 0

    # thoughtsTokenCount is billed as output on reasoning models and is absent
    # elsewhere, so it is folded in rather than silently dropped.
    return TokenUsage(
        input_tokens=_int("promptTokenCount"),
        output_tokens=_int("candidatesTokenCount") + _int("thoughtsTokenCount"),
        calls=1,
    )


def usage_from_openai_compatible(data: Dict[str, Any]) -> TokenUsage:
    """Reads the ``usage`` block of an OpenAI-shaped response (Groq)."""
    meta = data.get("usage") or {}

    def _int(key: str) -> int:
        try:
            return max(0, int(meta.get(key) or 0))
        except (TypeError, ValueError):
            return 0

    return TokenUsage(
        input_tokens=_int("prompt_tokens"),
        output_tokens=_int("completion_tokens"),
        calls=1,
    )


# ---------------------------------------------------------------------------
# Per-job accumulation
# ---------------------------------------------------------------------------
_local = threading.local()


def _current() -> Optional[TokenUsage]:
    return getattr(_local, "accumulator", None)


def record(usage: TokenUsage) -> None:
    """Adds a call's usage to the enclosing ``usage_scope``, if there is one.

    A no-op outside a scope on purpose: the synchronous request path has nowhere
    to persist a total, and silently dropping it there is better than making
    every call site care whether a scope is open.
    """
    acc = _current()
    if acc is not None:
        acc.add(usage)


@contextmanager
def usage_scope() -> Iterator[TokenUsage]:
    """Collects the usage of every model call made on this thread inside the block.

    Nested scopes are supported (the inner one shadows, then folds its total
    into the outer) so a job that calls a helper which opens its own scope still
    bills the job for everything.
    """
    outer = _current()
    acc = TokenUsage()
    _local.accumulator = acc
    try:
        yield acc
    finally:
        _local.accumulator = outer
        if outer is not None:
            outer.add(acc)


# ---------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------
# USD per million tokens, (input, output), keyed by model name.
#
# DELIBERATELY EMPTY. Everything this key runs on today is on the free tier,
# where the real cost is exactly zero, and inventing a per-token price for a
# model we are not being billed for would put a fabricated number in a column
# whose whole purpose is to be trustworthy. When billing is enabled, paste the
# real figures from Google's price sheet here (and Groq's, if that ever wakes
# up) and every completed job starts carrying a real cost with no other change.
PRICE_PER_MILLION_TOKENS: Dict[str, tuple[float, float]] = {}


def estimated_cost(model_name: str, usage: TokenUsage) -> Optional[float]:
    """USD for this usage, or ``None`` when we have no price for the model.

    ``None`` — not ``0.0`` — because "free tier, cost genuinely zero" and "we
    have not configured a price" are different claims, and the column should not
    assert the first when it only knows the second.
    """
    price = PRICE_PER_MILLION_TOKENS.get(model_name)
    if price is None:
        return None
    input_price, output_price = price
    return round(
        (usage.input_tokens * input_price + usage.output_tokens * output_price) / 1_000_000.0,
        6,
    )
