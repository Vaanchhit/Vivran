"""FastAPI auth & authorization dependencies (§48)."""
from __future__ import annotations

from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.auth import CurrentUser, decode_access_token
from app.services.provisioning import ensure_teacher_workspace

bearer_scheme = HTTPBearer(auto_error=False)

_UNAUTHORIZED = HTTPException(status_code=401, detail="Not authenticated")
_INVALID_TOKEN = HTTPException(status_code=401, detail="Invalid or expired token")
_FORBIDDEN = HTTPException(status_code=403, detail="Workspace access denied")


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
    return CurrentUser.from_token_payload(payload)


def require_teacher(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    """Ensures the authenticated user is a teacher (role gate)."""
    if user.role and user.role not in {"teacher", "admin"}:
        raise HTTPException(status_code=403, detail="Teacher role required")
    return user


def require_workspace_id(
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    user: CurrentUser = Depends(get_current_user),
) -> str:
    """Validates that the request targets a workspace owned by the user.

    On first authenticated request, the user's default workspace is provisioned
    (upsert teacher_profiles + workspaces). Requests must scope to the user's
    own workspace id; any other value is rejected.
    """
    if not workspace_id:
        raise HTTPException(status_code=400, detail="Workspace-Id header is required")
    user.workspace_id = ensure_teacher_workspace(user)
    if workspace_id != user.workspace_id:
        raise _FORBIDDEN
    return workspace_id