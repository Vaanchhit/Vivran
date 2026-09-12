"""Supabase JWT validation (§48).

Validates access tokens issued by Supabase Auth and exposes a ``CurrentUser``
identity. Supabase tokens carry the following claims:

    sub   -> user UUID (the FK used by teacher_profiles.user_id / workspaces.owner_id)
    email -> verified email address
    aud   -> "authenticated"
    role  -> "authenticated"

Supabase projects sign tokens one of two ways, and this validates both:
- Legacy projects: HS256, signed with a shared secret (``SUPABASE_JWT_SECRET``).
  Used for offline tests (see tests/conftest.py) with no live Supabase project.
- Current projects: an asymmetric algorithm (typically ES256), verified
  against the project's public JWKS endpoint — no shared secret exists for
  these, so SUPABASE_JWT_SECRET is unused for them.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict

import httpx
import jwt

from app.core.config import settings

_JWKS_TTL_SECONDS = 300
_jwks_cache: Dict[str, Any] = {"keys": {}, "fetched_at": 0.0}


def _get_signing_key(kid: str | None) -> Any:
    """Fetches (and caches) Supabase's public signing keys, keyed by `kid`.

    Fetched with httpx rather than PyJWT's built-in PyJWKClient, which uses
    urllib and can hit local SSL cert-bundle issues on some machines.
    """
    now = time.time()
    if now - _jwks_cache["fetched_at"] > _JWKS_TTL_SECONDS or kid not in _jwks_cache["keys"]:
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        with httpx.Client(timeout=10.0) as client:
            r = client.get(jwks_url)
            r.raise_for_status()
        _jwks_cache["keys"] = {k["kid"]: jwt.PyJWK(k).key for k in r.json()["keys"]}
        _jwks_cache["fetched_at"] = now

    if kid not in _jwks_cache["keys"]:
        raise jwt.InvalidTokenError(f"No matching signing key for kid={kid}")
    return _jwks_cache["keys"][kid]


@dataclass
class CurrentUser:
    user_id: str
    email: str | None = None
    username: str | None = None
    full_name: str | None = None
    avatar_url: str | None = None
    role: str = "teacher"
    # Set during provisioning; used by require_workspace_id for scoping.
    workspace_id: str | None = None

    @classmethod
    def from_token_payload(cls, payload: Dict[str, Any]) -> "CurrentUser":
        user_meta = payload.get("user_metadata") or {}
        app_meta = payload.get("app_metadata") or {}
        return cls(
            user_id=payload["sub"],
            email=payload.get("email"),
            username=payload.get("email") or user_meta.get("username") or payload.get("sub"),
            full_name=user_meta.get("full_name") or app_meta.get("full_name"),
            avatar_url=user_meta.get("avatar_url") or app_meta.get("avatar_url"),
            role=app_meta.get("vivran_role", "teacher"),
        )


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode + verify a Supabase Auth access token.

    Raises ``jwt.ExpiredSignatureError`` / ``jwt.InvalidTokenError`` on failure.
    """
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", settings.jwt_algorithm)

    if alg == "HS256":
        signing_key: Any = settings.supabase_jwt_secret
    else:
        signing_key = _get_signing_key(header.get("kid"))

    return jwt.decode(
        token,
        signing_key,
        algorithms=[alg],
        audience="authenticated",
        options={"verify_aud": True, "require": ["sub", "exp"]},
    )