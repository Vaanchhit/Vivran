"""Supabase JWT validation (§48).

Validates the access tokens issued by Supabase Auth (HS256, signed with the
project's JWT secret) and exposes a ``CurrentUser`` identity. Supabase tokens
carry the following claims:

    sub   -> user UUID (the FK used by teacher_profiles.user_id / workspaces.owner_id)
    email -> verified email address
    aud   -> "authenticated"
    role  -> "authenticated"
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

import jwt

from app.core.config import settings


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
    return jwt.decode(
        token,
        settings.supabase_jwt_secret,
        algorithms=[settings.jwt_algorithm],
        audience="authenticated",
        options={"verify_aud": True, "require": ["sub", "exp"]},
    )