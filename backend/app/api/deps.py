"""FastAPI auth & authorization dependencies (§48)."""
from __future__ import annotations

from typing import Any, Dict, Optional

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.auth import CurrentUser, SigningKeyUnavailable, decode_access_token
from app.services.provisioning import ensure_teacher_session

bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(status_code=401, detail="Not authenticated")
_INVALID_TOKEN = HTTPException(status_code=401, detail="Invalid or expired token")
_FORBIDDEN = HTTPException(status_code=403, detail="Workspace access denied")
_UNVERIFIED = HTTPException(
    status_code=403,
    detail="Vivran is invite-only during beta. Enter your referral code to unlock your workspace.",
)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> CurrentUser:
    """Resolves the authenticated teacher from the ``Authorization: Bearer`` token."""
    if credentials is None or not credentials.credentials:
        raise _UNAUTHORIZED
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise _INVALID_TOKEN
    except SigningKeyUnavailable as exc:
        # We couldn't reach Supabase's JWKS endpoint and have no cached key.
        # 503 (not 401, which would make the frontend sign the teacher out,
        # and not an unhandled 500) — the token is probably fine, we just
        # can't check it this second, so the client should retry.
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return CurrentUser.from_token_payload(payload)


def require_teacher(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Ensures the authenticated user is a teacher (role gate)."""
    if user.role and user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Teacher role required")
    return user


def teacher_session(user: CurrentUser = Depends(get_current_user)) -> Dict[str, Any]:
    """The single per-request profile+workspace lookup.

    Exists so ``require_workspace_id`` and ``require_verified_teacher`` share
    one Supabase round-trip: FastAPI caches a sub-dependency's result for the
    duration of a request, so declaring both of them on a route resolves this
    exactly once.
    """
    try:
        session = ensure_teacher_session(user)
    except RuntimeError as exc:
        # Provisioning genuinely failed (Supabase down, workspace insert
        # rejected). Surfacing 502 is the point: the previous behaviour was to
        # invent a workspace id that no row matched, after which every write
        # failed on the foreign key while the API still answered 200.
        raise HTTPException(status_code=502, detail=f"Workspace provisioning failed: {exc}") from exc
    user.workspace_id = session["workspace_id"]
    return session


def require_workspace_id(
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
) -> str:
    """Validates that the request targets a workspace owned by the user.

    On first authenticated request, the user's default workspace is provisioned
    (upsert teacher_profiles + workspaces). Requests must scope to the user's
    own workspace id; any other value is rejected.
    """
    if not workspace_id:
        raise HTTPException(status_code=400, detail="Workspace-Id header is required")
    if workspace_id != session["workspace_id"]:
        raise _FORBIDDEN
    return workspace_id


def require_verified_teacher(
    user: CurrentUser = Depends(require_teacher),
    session: Dict[str, Any] = Depends(teacher_session),
) -> CurrentUser:
    """Beta gate, enforced server-side against the persisted profile flag.

    The referral gate used to live only in TeacherLayout (see
    frontend/app/(app)/teacher/layout.tsx). React deciding which component to
    render is not an authorization boundary: a Google sign-in mints a valid
    JWT *before* the gate ever paints, so a bearer token copied out of
    devtools could drive the paid-generation endpoints directly, with no code
    ever entered. Every router except the auth routes needed to *pass* the
    gate now depends on this.

    Fails OPEN when the flag can't be read — mirrors _profile_state() in
    app/services/provisioning.py, so a project where migration 0005 hasn't
    been applied keeps working instead of locking out every teacher.
    """
    if not session["referral_verified"]:
        raise _UNVERIFIED
    return user
