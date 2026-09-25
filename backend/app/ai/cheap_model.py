"""Cloud generation tiers (§22) — the envelope every generation call returns.

Two tiers live here because they differ only by which model they name: the SLM
tier for extraction/rewriting and the cheap-cloud tier for authoring (see
app/ai/router.py for which is which and why). Sharing one body also means the
provider-failover branch below exists exactly once.

THE ENVELOPE
    {"success", "model_tier", "model_name", "provider", "task", "content",
     "usage", and on failure "error" + "failure"}
``provider`` and ``model_name`` record what actually produced the bytes, not
what we intended to use, so a bad artifact can be traced back to a model months
later. ``usage`` carries the token counts Google/Groq returned (app/ai/usage.py).
"""
from typing import Any, Dict, Optional

from app.ai import groq_client
from app.ai.gemini_client import GeminiError, generate_text
from app.ai.router import ModelTier, model_for_tier
from app.ai.usage import TokenUsage, record, usage_scope
from app.core.errors import FailureClass
from app.core.logging import logger

# The ONLY failure class that may cross to a second provider.
#
#   UPSTREAM_BUSY     Google is overloaded or unreachable. Nothing about the
#                     request is wrong, so another provider is a real chance at
#                     the same answer. This is the whole case for failover.
#   QUOTA_EXHAUSTED   Must NOT fail over. A spent allowance is information the
#                     founder needs to see, immediately and unambiguously;
#                     papering over it with a second provider means discovering
#                     the bill instead of the limit.
#   CONTENT_BLOCKED   Must NOT fail over. A safety refusal is a property of the
#                     prompt, not the vendor — it reproduces elsewhere, and
#                     shopping for a provider that will generate what another
#                     declined is not a behaviour to build in.
#   NOT_CONFIGURED    Must NOT fail over. The Gemini key is missing; that is a
#                     deployment fault to fix, not to route around.
_FAILOVER_CLASSES = frozenset({FailureClass.UPSTREAM_BUSY})


def _envelope(
    *,
    success: bool,
    tier: ModelTier,
    model_name: str,
    provider: str,
    task: str,
    content: str = "",
    usage: Optional[TokenUsage] = None,
    error: Optional[str] = None,
    failure: Optional[FailureClass] = None,
) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "success": success,
        "model_tier": tier.value,
        "model_name": model_name,
        "provider": provider,
        "task": task,
        "content": content,
        "usage": (usage or TokenUsage()).to_dict(),
    }
    if not success:
        # "error" stays the raw upstream string: it is what gets LOGGED.
        # "failure" is the classified form the API layer uses to pick the
        # user-facing message (app/core/errors.py) — callers must never put
        # "error" in front of a teacher.
        out["error"] = error or ""
        out["failure"] = failure or FailureClass.UPSTREAM_ERROR
    return out


def _try_groq(
    prompt: str,
    *,
    tier: ModelTier,
    task: str,
    system_prompt: str,
    json_mode: bool,
) -> Optional[Dict[str, Any]]:
    """Second-provider attempt. Returns None when it is unavailable or fails.

    DORMANT: with no GROQ_API_KEY set — which is the case everywhere today —
    ``is_configured()`` is False and this returns None before doing anything, so
    the caller falls through to the original Gemini failure exactly as it did
    before this existed. See app/ai/groq_client.py.

    A Groq failure is swallowed rather than surfaced: the teacher's problem is
    that Gemini is busy, and replacing that honest, already-classified failure
    with a message about a provider they have never heard of would make the
    logs and the UI harder to read, not easier.
    """
    if not groq_client.is_configured():
        return None

    try:
        completion = groq_client.generate_text(
            prompt, system_prompt=system_prompt, json_mode=json_mode
        )
    except groq_client.GroqError as e:
        logger.warning("Groq failover also failed (%s) — reporting the original Gemini failure: %s", e.failure.value, e)
        return None

    record(completion.usage)
    logger.info("Groq failover produced the %s result after Gemini reported busy", task)
    return _envelope(
        success=True,
        tier=tier,
        model_name=completion.model,
        provider="groq",
        task=task,
        content=completion.text,
        usage=completion.usage,
    )


def generate_cloud(
    prompt: str,
    *,
    tier: ModelTier = ModelTier.CHEAP_CLOUD,
    task: str = "content_generation",
    system_prompt: str = "",
    json_mode: bool = False,
    temperature: float = 0.4,
) -> Dict[str, Any]:
    """One generation call on `tier`, with the dormant second-provider seam."""
    model_name = model_for_tier(tier)

    # The scope collects what gemini_client recorded for this call — including
    # any retried attempt, which a return value would miss. It nests, so a
    # job-level scope (app/services/jobs.py) still gets the sum, and it wraps
    # the failover too so a Groq answer is billed rather than invisible.
    with usage_scope() as usage:
        try:
            content = generate_text(
                prompt,
                system_prompt=system_prompt,
                model=model_name,
                json_mode=json_mode,
                temperature=temperature,
            )
            return _envelope(
                success=True,
                tier=tier,
                model_name=model_name,
                provider="gemini",
                task=task,
                content=content,
                usage=usage,
            )
        except GeminiError as e:
            if e.failure in _FAILOVER_CLASSES:
                failed_over = _try_groq(
                    prompt, tier=tier, task=task, system_prompt=system_prompt, json_mode=json_mode
                )
                if failed_over is not None:
                    return failed_over
            # A failed call still spent input tokens (and, on a safety block,
            # output ones), so the envelope reports them rather than pretending
            # it was free.
            return _envelope(
                success=False,
                tier=tier,
                model_name=model_name,
                provider="gemini",
                task=task,
                usage=usage,
                error=str(e),
                failure=e.failure,
            )


def generate_cheap_cloud(
    prompt: str, task: str = "content_generation", system_prompt: str = "", json_mode: bool = False
) -> Dict[str, Any]:
    """Authoring tier. Signature unchanged — every existing call site still fits."""
    return generate_cloud(
        prompt, tier=ModelTier.CHEAP_CLOUD, task=task, system_prompt=system_prompt, json_mode=json_mode
    )


def generate_slm(
    prompt: str,
    task: str = "extraction",
    system_prompt: str = "",
    json_mode: bool = False,
    temperature: float = 0.4,
) -> Dict[str, Any]:
    """SLM tier: extraction and rewriting only. See app/ai/router.py."""
    return generate_cloud(
        prompt,
        tier=ModelTier.SLM,
        task=task,
        system_prompt=system_prompt,
        json_mode=json_mode,
        temperature=temperature,
    )
