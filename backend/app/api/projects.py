"""Projects API (§47) — Create, List projects (shared architecture for all 4 pillars).

Protected: requires a valid Supabase JWT and a ``Workspace-Id`` header scoped to
the authenticated teacher's own workspace.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser
from app.generation.planning import generate_course_plan
from app.services.supabase_service import SupabaseError, is_configured, table_insert, table_select

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    title: str
    type: str
    grade: str
    subject: str
    topics: List[str]
    duration_weeks: int = 3


@router.post("")
def create_project(
    payload: ProjectCreateRequest,
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    course_plan = generate_course_plan(
        payload.grade, payload.subject, payload.topics, payload.duration_weeks, workspace_id=workspace_id
    )

    project_id = str(uuid.uuid4())
    response = {
        "id": project_id,
        "workspace_id": workspace_id,
        "created_by": user.user_id,
        "title": payload.title,
        "type": payload.type,
        "status": "active",
        "course_plan": course_plan,
    }

    if is_configured():
        try:
            row = table_insert(
                "projects",
                {
                    "id": project_id,
                    "workspace_id": workspace_id,
                    "created_by": user.user_id,
                    "title": payload.title,
                    "type": payload.type,
                    "specification_json": {
                        "grade": payload.grade,
                        "subject": payload.subject,
                        "topics": payload.topics,
                        "course_plan": course_plan,
                    },
                    "status": "active",
                },
            )
            response["id"] = row["id"]
        except SupabaseError:
            pass  # generated content still returned; persistence is best-effort

    return response


@router.get("")
def list_projects(
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    """Projects are scoped to the requesting workspace."""
    if not is_configured():
        return []
    try:
        return table_select("projects", {"workspace_id": f"eq.{workspace_id}", "order": "created_at.desc"})
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=str(e))
