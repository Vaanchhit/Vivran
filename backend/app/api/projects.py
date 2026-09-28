"""Projects API (§47) — Create, List projects (shared architecture for all 4 pillars).

Protected: requires a valid Supabase JWT and a ``Workspace-Id`` header scoped to
the authenticated teacher's own workspace.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.api.deps import require_teacher, require_workspace_id
from app.api.jobs import ASYNC_JOB_QUERY, dispatch_generation
from app.core.auth import CurrentUser
from app.core.logging import logger
from app.core.rate_limit import limit
from app.generation.planning import generate_course_plan
from app.services import library
from app.services.supabase_service import SupabaseError, is_configured, table_insert, table_select

router = APIRouter(prefix="/projects", tags=["projects"])

# Project creation runs a full course-plan generation against Gemini — same
# metered-quota reasoning as app/api/content.py.
_GEN_LIMIT = "30/minute;300/hour"


class ProjectCreateRequest(BaseModel):
    title: str
    type: str
    grade: str
    subject: str
    topics: List[str]
    duration_weeks: int = 3


@router.post("")
@limit(_GEN_LIMIT)
def create_project(
    request: Request,
    payload: ProjectCreateRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    def _create():
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
                # Same row, not a second one: the plan is listed once and reopens
                # through the library like everything else.
                if library.save_item(
                    workspace_id=workspace_id, user_id=user.user_id, kind="course_plan",
                    title=payload.title, content=course_plan, project_id=row["id"],
                ):
                    response["library_id"] = row["id"]
            except SupabaseError as e:
                # Previously swallowed. A 200 carrying a project id that no row
                # matches is the worst outcome: the teacher's generated course
                # plan is gone the moment they navigate away, and the UI has no
                # way to know. Surface it so a retry is possible.
                logger.error("Persisting project '%s' failed: %s", payload.title, e)
                raise HTTPException(status_code=502, detail=f"Could not save the project: {e}")

        return response

    # Generation AND the insert both happen inside _create, so the async job
    # either produces a saved project or fails — it can never hand back a
    # project id that has no row, which is the failure the comment above is
    # about.
    return dispatch_generation(
        async_job=async_job,
        task_type="course_plan",
        workspace_id=workspace_id,
        user=user,
        params=payload.model_dump(),
        run=_create,
    )


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
