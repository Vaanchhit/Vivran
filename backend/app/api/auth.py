"""Auth API — session provisioning for authenticated teachers."""
from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, require_teacher
from app.core.auth import CurrentUser
from app.services.provisioning import ensure_teacher_workspace

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/provision")
def provision_workspace(user: CurrentUser = Depends(require_teacher)) -> dict:
    """Upsert teacher_profile + default workspace on first login.

    Call this once after the frontend receives a session; the returned
    workspace_id must be sent as the ``Workspace-Id`` header on protected calls.
    """
    workspace_id = ensure_teacher_workspace(user)
    return {
        "status": "provisioned",
        "user_id": user.user_id,
        "email": user.email,
        "full_name": user.full_name,
        "workspace_id": workspace_id,
    }


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    """Return the authenticated user payload (token already validated)."""
    return {
        "user_id": user.user_id,
        "email": user.email,
        "full_name": user.full_name,
        "username": user.username,
        "role": user.role,
        "workspace_id": user.workspace_id,
    }