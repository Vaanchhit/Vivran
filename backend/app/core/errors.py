"""Central upstream-failure -> user-facing message mapping.

Every third-party failure (Gemini, ElevenLabs, Cartesia, Tally) is translated
here and ONLY here, so there is exactly one place to read, tune, or audit what
a teacher is told when something upstream breaks.

Why a translation layer at all:
  Raw upstream text is useless-to-harmful in the UI. "This model is currently
  experiencing high demand ... (status UNAVAILABLE)" tells a teacher nothing
  they can act on, and leaking provider names/quotas out of a paid API is a
  small information disclosure on top.

Why NOT a single blunt message:
  The obvious implementation — map every failure to "your free tier is over,
  contact the admin" — is actively worse than leaking. It would:
    * be a lie for Google-side capacity blips (503 UNAVAILABLE), which have
      nothing to do with the teacher's usage, and would generate a support
      queue the founder cannot action because there is nothing to fix;
    * swallow genuine input errors ("unsupported file type") that the teacher
      *could* have fixed themselves in five seconds.
  So failures are classified first, and each class gets an honest message.

The rule for our OWN validation errors (FastAPI 422, IngestionError -> 400,
"Workspace access denied" -> 403, the rate limiter's 429): they never come
through this module. They are already specific and actionable and must stay
verbatim. This module only handles *upstream* failures.

In every masked case the real status and body are logged server-side at
WARNING/ERROR before the message is swapped in. The user-facing string is a
translation, never a loss of information.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Optional

from fastapi import HTTPException

from app.core.logging import logger


class FailureClass(str, Enum):
    """What actually went wrong upstream, as far as the teacher is concerned."""

    #: We are out of paid capacity on a provider (billing/quota/plan). The only
    #: fix is on the founder's side, so "contact the admin" is the right ask.
    QUOTA_EXHAUSTED = "quota_exhausted"
    #: The provider is temporarily overloaded or unreachable. Retrying later
    #: genuinely works; this is NOT the teacher's quota.
    UPSTREAM_BUSY = "upstream_busy"
    #: The model refused to generate (safety filter, no candidates). The
    #: teacher can act on this by rephrasing, so say so.
    CONTENT_BLOCKED = "content_blocked"
    #: An API key for this feature isn't set on the server at all.
    NOT_CONFIGURED = "not_configured"
    #: Anything else upstream — a bug on our side or theirs.
    UPSTREAM_ERROR = "upstream_error"


# ---------------------------------------------------------------------------
# The user-facing strings. This dict is the whole contract with the UI — change
# copy here, nowhere else.
# ---------------------------------------------------------------------------
USER_MESSAGES: dict[FailureClass, str] = {
    FailureClass.QUOTA_EXHAUSTED: (
        "Your free tier limit has been reached — contact the admin for continued access."
    ),
    FailureClass.UPSTREAM_BUSY: (
        "Vivran is busy right now — please try that again in a moment."
    ),
    FailureClass.CONTENT_BLOCKED: (
        "Vivran couldn't generate that one — try rephrasing the topic or making it more specific."
    ),
    FailureClass.NOT_CONFIGURED: (
        "This feature isn't switched on for your account yet — contact the admin for access."
    ),
    FailureClass.UPSTREAM_ERROR: (
        "Something went wrong generating that — please try again. "
        "If it keeps happening, contact the admin."
    ),
}

# HTTP status per class. Kept distinct so the founder can tell the classes apart
# in Render's request logs / metrics without reading bodies.
#   402 - we are out of paid capacity (semantically exact, and impossible to
#         confuse with our own 429 rate limiter)
#   503 - upstream temporarily unavailable; a retry is expected to work
#   422 - the model declined the content
#   502 - anything else upstream
HTTP_STATUS: dict[FailureClass, int] = {
    FailureClass.QUOTA_EXHAUSTED: 402,
    FailureClass.UPSTREAM_BUSY: 503,
    FailureClass.CONTENT_BLOCKED: 422,
    FailureClass.NOT_CONFIGURED: 402,
    FailureClass.UPSTREAM_ERROR: 502,
}


# Substrings that mean "you have run out of paid allowance", as opposed to
# "you are going too fast right now". Both arrive as HTTP 429 from Gemini, and
# they need opposite messages, so the body text is the only discriminator.
# Matched case-insensitively against the response body.
_QUOTA_MARKERS = (
    "quota",
    "billing",
    "exceeded your current",
    "free tier",
    "free_tier",
    "insufficient credit",
    "insufficient_credit",
    "payment required",
    "upgrade your plan",
    "subscription",
    "out of credits",
    "credits remaining",
)

# Substrings that mean "temporarily overloaded" even when the status code is
# ambiguous. Google's 503 body is the one live in the founder's logs today.
_BUSY_MARKERS = (
    "unavailable",
    "high demand",
    "overloaded",
    "try again later",
    "temporarily",
    "deadline exceeded",
    "timeout",
    "timed out",
)


def _looks_like(body: str, markers: tuple[str, ...]) -> bool:
    lowered = (body or "").lower()
    return any(m in lowered for m in markers)


# Gemini's free-tier 429 says "Please retry in 25.4s" and also carries a
# structured RetryInfo {"retryDelay": "25s"}. Either form gives us seconds.
_RETRY_HINT_RE = re.compile(
    r"(?:please\s+)?retry(?:\s+in|delay\"?\s*:\s*\"?)\s*([0-9]+(?:\.[0-9]+)?)\s*s",
    re.IGNORECASE,
)

# A transient limit replenishes in seconds; a spent daily/billing allowance
# either gives no retry hint at all or one measured in hours. Five minutes is
# comfortably above any per-minute window and far below a daily reset.
_TRANSIENT_RETRY_CEILING_SECONDS = 300.0


def retry_hint_seconds(body: str) -> Optional[float]:
    """Seconds the provider asked us to wait, if it said so."""
    m = _RETRY_HINT_RE.search(body or "")
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def classify_upstream_status(status_code: Optional[int], body: str = "") -> FailureClass:
    """Maps an upstream HTTP status + body to a FailureClass.

    Shared by every provider: Gemini's REST errors and ElevenLabs/Cartesia/Tally
    all use the same status semantics, and the body markers above are generic
    enough to cover all of them.
    """
    body = body or ""

    # No status at all means the request never completed — a connect/read
    # timeout or DNS failure. Transient by nature.
    if status_code is None:
        return FailureClass.UPSTREAM_BUSY

    if status_code == 402:
        return FailureClass.QUOTA_EXHAUSTED

    if status_code == 429:
        # The fork that matters most. A per-minute rate limit is transient and
        # must NOT be reported as "your free tier is over"; a daily/project
        # quota or billing cap genuinely is.
        #
        # The body markers alone CANNOT tell these apart on Gemini, which was a
        # live bug: its free-tier per-minute limit returns
        #   "You exceeded your current quota ... generate_content_free_tier_requests,
        #    limit: 20 ... Please retry in 25.4s"
        # — every quota marker we look for, on an error that clears in 25
        # seconds. Teachers were told to contact the admin because they
        # generated twenty things in a minute.
        #
        # So the retry hint wins when it is present: nothing that asks you back
        # in half a minute is a spent allowance. A hint measured in hours, or
        # no hint at all alongside quota wording, still means genuinely out.
        hint = retry_hint_seconds(body)
        if hint is not None:
            return (
                FailureClass.UPSTREAM_BUSY
                if hint <= _TRANSIENT_RETRY_CEILING_SECONDS
                else FailureClass.QUOTA_EXHAUSTED
            )
        return (
            FailureClass.QUOTA_EXHAUSTED
            if _looks_like(body, _QUOTA_MARKERS)
            else FailureClass.UPSTREAM_BUSY
        )

    if status_code in (401, 403):
        # For media providers a 401/403 is the documented free-plan response
        # (see app/media/elevenlabs.py's docstring — image/video need Pro), and
        # for Gemini a 403 is usually "billing not enabled". Either way the fix
        # is the founder's, so "contact the admin" is correct; we only split on
        # whether the body admits it is about money, to pick the better wording.
        return (
            FailureClass.QUOTA_EXHAUSTED
            if _looks_like(body, _QUOTA_MARKERS)
            else FailureClass.NOT_CONFIGURED
        )

    if status_code == 503 or (status_code >= 500 and _looks_like(body, _BUSY_MARKERS)):
        return FailureClass.UPSTREAM_BUSY

    # 400/404/422 and any other 5xx: deterministic or unknown. Never retried,
    # never dressed up as a quota problem.
    return FailureClass.UPSTREAM_ERROR


def user_message(failure: FailureClass) -> str:
    return USER_MESSAGES[failure]


def mask(
    failure: FailureClass,
    *,
    context: str,
    detail: str = "",
) -> str:
    """Logs the real upstream detail, returns the user-safe replacement.

    `context` should say what the user was trying to do ("video generation",
    "slides") so a log line is self-explanatory without the surrounding code.
    """
    log = logger.error if failure is FailureClass.UPSTREAM_ERROR else logger.warning
    log("Masking %s failure in %s -> %r | upstream detail: %s",
        failure.value, context, USER_MESSAGES[failure], (detail or "")[:600])
    return USER_MESSAGES[failure]


def http_error(
    failure: FailureClass,
    *,
    context: str,
    detail: str = "",
) -> HTTPException:
    """Builds the HTTPException to raise, logging the real failure first."""
    return HTTPException(
        status_code=HTTP_STATUS[failure],
        detail=mask(failure, context=context, detail=detail),
    )


def service_result_message(result: dict, *, context: str) -> Optional[str]:
    """Non-raising classifier for a media/export service envelope.

    Returns ``None`` when the service succeeded, otherwise the exact string a
    teacher should be shown — already logged with the real upstream detail.

    Exists because the same envelope now has two destinations: an HTTP response
    (``raise_for_service_result`` below) and a background job's stored ``error``
    column (app/services/jobs.py), which has no status code to carry and cannot
    raise. Both go through this one function so a failure can never be worded
    one way in a synchronous call and another way in the async job — and so
    there is still exactly one place to audit what gets said, as this module's
    docstring promises.
    """
    status = result.get("status")
    if status == "ready":
        return None

    if result.get("user_facing"):
        # The service produced a specific, teacher-actionable message itself
        # ("this paper has no multiple-choice questions"). Passed through
        # verbatim — masking it would leave the teacher with no way to
        # understand or fix what happened.
        return str(result.get("error", ""))

    failure = result.get("failure")
    if not isinstance(failure, FailureClass):
        # A service that forgot to classify. Default to the generic upstream
        # message rather than guessing at quota — never invent a billing claim.
        failure = FailureClass.NOT_CONFIGURED if status == "not_configured" else FailureClass.UPSTREAM_ERROR

    return mask(failure, context=context, detail=str(result.get("error", "")))


def raise_for_service_result(result: dict, *, context: str) -> dict:
    """The single entry point the API layer uses for a media/export service result.

    Media services (app/media/*.py) return an envelope:
        {"status": "ready" | "failed" | "not_configured",
         "error": <raw upstream detail, for the log only>,
         "failure": <FailureClass>,          # set by the service
         "user_facing": True                 # optional, see above
        }

    Returns the result unchanged when it succeeded, so call sites read as
    ``return raise_for_service_result(result, context="video")``.
    """
    if result.get("status") == "ready":
        return result

    detail = service_result_message(result, context=context)

    if result.get("user_facing"):
        raise HTTPException(status_code=400, detail=detail or "")

    failure = result.get("failure")
    if not isinstance(failure, FailureClass):
        failure = (
            FailureClass.NOT_CONFIGURED
            if result.get("status") == "not_configured"
            else FailureClass.UPSTREAM_ERROR
        )

    # service_result_message() already logged the real upstream detail; this
    # only needs the status code and the string it produced.
    raise HTTPException(status_code=HTTP_STATUS[failure], detail=detail or "")
