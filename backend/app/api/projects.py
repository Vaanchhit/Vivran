"""Projects API (§47) — Create, List, Retrieve, Interpret & Generate projects.

Protected: requires a valid Supabase JWT and a ``Workspace-Id`` header scoped to
the authenticated teacher's own workspace.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser
from app.generation.planning import generate_course_plan

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    title: str
    type: str
    grade: str
    subject: str
    topics: List[str]


@router.post("")
def create_project(
    payload: ProjectCreateRequest,
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    course_plan = generate_course_plan(payload.grade, payload.subject, payload.topics)
    return {
        "id": "proj-101",
        "workspace_id": workspace_id,
        "created_by": user.user_id,
        "title": payload.title,
        "type": payload.type,
        "status": "active",
        "course_plan": course_plan,
    }


@router.get("")
def list_projects(
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    """Projects are scoped to the requesting workspace."""
    return [
        {
            "id": "proj-101",
            "workspace_id": workspace_id,
            "created_by": user.user_id,
            "title": "Class 10 Biology — Tissues",
            "type": "classroom_pack",
            "status": "active",
        }
    ]