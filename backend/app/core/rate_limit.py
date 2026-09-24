"""Per-IP rate limiting for the endpoints that are cheap to call and costly to serve.

Two classes of endpoint need this:

- ``/auth/verify-referral*`` — an unauthenticated (and an authenticated)
  valid/invalid oracle over a short numeric code. Unthrottled, the whole
  keyspace is walkable in minutes from one machine.
- the generation endpoints — every call spends real Gemini / ElevenLabs /
  Cartesia quota, billed to us.

Deliberately built to degrade rather than fail:

- ``slowapi`` is imported optionally. If the dependency isn't installed (a
  Render build that ran before requirements.txt picked it up, an old local
  venv), ``limit()`` becomes a pass-through decorator and the app boots and
  serves exactly as it does today, just unthrottled. A missing rate limiter
  must never be the reason the product is down.
- Limits are disabled under APP_ENV=test: the whole suite runs from a single
  client address, so a shared per-IP budget would make tests fail depending on
  how many of them happened to run in the same minute.

Storage is in-process memory. Render's free plan runs a single instance, so
that is accurate today; if the service is ever scaled past one instance the
effective limit becomes (limit x instances) and this should move to the
Key Value / Redis backend slowapi already supports.
"""
from __future__ import annotations

from typing import Any, Callable

from fastapi import FastAPI, Request

from app.core.config import settings
from app.core.logging import logger

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded

    _SLOWAPI_AVAILABLE = True
except ImportError:  # pragma: no cover - only hit when the dep is missing
    _SLOWAPI_AVAILABLE = False


def _client_key(request: Request) -> str:
    """Rate-limit key: the real client IP, not Render's load balancer.

    Behind Render every request arrives from the platform proxy, so
    slowapi's default ``get_remote_address`` would bucket *all* traffic under
    one key and throttle everyone at once. The left-most X-Forwarded-For entry
    is the originating client. It is client-controlled and therefore spoofable,
    which makes this a speed bump against casual brute force rather than a
    hard guarantee — the gate itself is enforced elsewhere.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


if _SLOWAPI_AVAILABLE:
    limiter = Limiter(key_func=_client_key, enabled=settings.app_env != "test")

    def limit(spec: str) -> Callable[[Any], Any]:
        return limiter.limit(spec)

    def install_rate_limiting(app: FastAPI) -> None:
        # Decorator-only setup: no SlowAPIMiddleware and no default_limits, so
        # a route is throttled only where @limit() says so. Nothing that isn't
        # explicitly decorated changes behaviour.
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

else:
    limiter = None

    def limit(spec: str) -> Callable[[Any], Any]:
        def _passthrough(func: Any) -> Any:
            return func

        return _passthrough

    def install_rate_limiting(app: FastAPI) -> None:
        logger.warning(
            "slowapi is not installed — rate limiting is DISABLED. "
            "Add `slowapi` to backend/requirements.txt and redeploy."
        )
