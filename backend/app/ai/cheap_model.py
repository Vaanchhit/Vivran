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
from app.core.config import settings
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


def _gemini_fallback_for(model_name: str) -> Optional[str]:
    for candidate in (m.strip() for m in settings.gemini_fallback_models.split(",")):
        if candidate and candidate != model_name:
            return candidate
    return None


def _try_groq(
    prompt: str,
    *,
    tier: ModelTier,
    task: str,
    system_prompt: str,
    json_mode: bool,
) -> Optional[Dict[str, Any]]:
    """Second-provider attempt. Returns None when it is unavailable or fails.

    With no GROQ_API_KEY set, ``is_configured()`` is False and this returns None
    before doing anything, so the caller reports the original Gemini failure.

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
    model_override: str = "",
) -> Dict[str, Any]:
    """One generation call on `tier`, with the dormant second-provider seam.

    `model_override` pins a specific model while keeping the tier's behaviour
    (pacing, retry, failover policy, usage accounting). Used by exam-paper
    generation so that repinning the authoring model cannot silently change
    which model writes a marks-constrained paper.
    """
    model_name = model_override or model_for_tier(tier)

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
            first_error = e

        busy = first_error.failure in _FAILOVER_CLASSES
        if busy:
            fallback_model = _gemini_fallback_for(model_name)
            if fallback_model:
                logger.info("%s busy for %s; trying %s", model_name, task, fallback_model)
                try:
                    content = generate_text(
                        prompt,
                        system_prompt=system_prompt,
                        model=fallback_model,
                        json_mode=json_mode,
                        temperature=temperature,
                    )
                    return _envelope(
                        success=True,
                        tier=tier,
                        model_name=fallback_model,
                        provider="gemini",
                        task=task,
                        content=content,
                        usage=usage,
                    )
                except GeminiError as e2:
                    # Reported, not surfaced: the teacher-facing failure stays
                    # the primary model's. A spent quota or a refusal here still
                    # rules out shopping the prompt to Groq.
                    logger.warning("Fallback %s also failed (%s): %s", fallback_model, e2.failure.value, e2)
                    busy = e2.failure in _FAILOVER_CLASSES

            if busy:
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
            error=str(first_error),
            failure=first_error.failure,
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


def generate_planner(prompt: str, *, system_prompt: str, task: str = "planning") -> Dict[str, Any]:
    """The plan-before-produce call: decides structure, which the teacher then approves.

    Groq's gpt-oss-120b first (settings.planner_model). Unlike the failover
    above, ANY Groq failure except a refusal falls back to the Gemini authoring
    model: a plan is cheap, the teacher reviews it before anything is produced,
    and Groq's free-tier limit is per minute, so a 429 here is a busy signal,
    not a spent allowance worth surfacing. A refusal reproduces on any model.
    """
    if groq_client.is_configured():
        with usage_scope() as usage:
            try:
                completion = groq_client.generate_text(
                    prompt, system_prompt=system_prompt, model=settings.planner_model,
                    json_mode=True, temperature=0.3,
                )
                record(completion.usage)
                return _envelope(
                    success=True, tier=ModelTier.CHEAP_CLOUD, model_name=completion.model,
                    provider="groq", task=task, content=completion.text, usage=usage,
                )
            except groq_client.GroqError as e:
                if e.failure is FailureClass.CONTENT_BLOCKED:
                    return _envelope(
                        success=False, tier=ModelTier.CHEAP_CLOUD, model_name=settings.planner_model,
                        provider="groq", task=task, usage=usage, error=str(e), failure=e.failure,
                    )
                logger.warning("Planner on Groq failed (%s); planning on Gemini instead: %s", e.failure.value, e)
    return generate_cloud(prompt, tier=ModelTier.CHEAP_CLOUD, task=task, system_prompt=system_prompt, json_mode=True, temperature=0.3)


def generate_assessment_cloud(
    prompt: str, task: str = "assessment_creation", system_prompt: str = "", json_mode: bool = False
) -> Dict[str, Any]:
    """Exam papers, on their own explicitly-pinned model.

    Separate from the authoring tier so that changing which model writes slides
    never silently changes which model writes a marks-constrained paper. See
    settings.assessment_model for the measurement behind the current pin.
    """
    return generate_cloud(
        prompt,
        tier=ModelTier.CHEAP_CLOUD,
        task=task,
        system_prompt=system_prompt,
        json_mode=json_mode,
        model_override=settings.assessment_model,
    )
