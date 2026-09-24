"""Background generation jobs API — "what is running for me right now".

The client stores nothing. It asks ``GET /api/jobs`` on load and gets back
whatever is still running plus whatever finished recently, so a generation
started on one page is still there after a refresh, a navigation, or a phone
being put in a pocket for five minutes.

Backwards compatibility: every generation route keeps its existing synchronous
behaviour byte-for-byte. Async is opt-in per call via ``?async_job=true``,
which answers 202 with a job id instead of blocking. See
``dispatch_generation``.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser
from app.core.errors import raise_for_service_result
from app.services import jobs
from app.services.supabase_service import SupabaseError

router = APIRouter(prefix="/jobs", tags=["jobs"])


# ---------------------------------------------------------------------------
# The opt-in async wrapper used by the generation routes.
# ---------------------------------------------------------------------------


def dispatch_generation(
    *,
    async_job: bool,
    task_type: str,
    workspace_id: str,
    user: CurrentUser,
    params: Dict[str, Any],
    run: Callable[[], Dict[str, Any]],
    service_context: Optional[str] = None,
    model_tier: str = "cheap_cloud",
    model_name: Optional[str] = None,
):
    """Run ``run`` inline (today's contract) or hand it to a background job.

    Why a parameter on the existing routes rather than a parallel ``/async``
    route for each: the auth stack, the beta gate, the rate limit, the request
    model and the workspace validation are all already correct on these routes,
    and duplicating seven of them is seven places for the next security fix to
    be applied to only one. With ``async_job`` absent, the code path below is
    literally the same two lines it was before, so nothing the frontend does
    today can change behaviour.

    ``service_context`` is set for the media routes, whose services report
    failure by returning an envelope instead of raising. Both modes classify
    that envelope through app/core/errors.py, so a teacher gets the same
    sentence either way.
    """
    if not async_job:
        result = run()
        return raise_for_service_result(result, context=service_context) if service_context else result

    try:
        row = jobs.enqueue(
            workspace_id=workspace_id,
            user_id=user.user_id,
            task_type=task_type,
            params=params,
            run=run,
            service_context=service_context,
            model_tier=model_tier,
            model_name=model_name,
        )
    except jobs.JobQueueFull as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except SupabaseError as exc:
        # The job row could not be written, so the work would be invisible and
        # unrecoverable. Better to say so than to start it anyway: the teacher
        # can retry synchronously.
        raise HTTPException(status_code=502, detail=f"Could not start that job: {exc}") from exc

    return JSONResponse(status_code=202, content=jobs.public_job(row, include_result=False))


# A shared description so the ``?async_job=`` flag documents itself identically
# on every route that offers it.
ASYNC_JOB_QUERY = Query(
    False,
    description=(
        "Run this generation as a background job. Returns 202 with a job id "
        "immediately; poll GET /api/jobs/{id} or GET /api/jobs?active=true. "
        "Omit it (the default) for the original blocking behaviour."
    ),
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("")
def api_list_jobs(
    active: bool = Query(False, description="Only jobs that are still queued or running."),
    recent_minutes: Optional[int] = Query(
        None, ge=0, le=1440, description="How far back to include already-finished jobs."
    ),
    limit: int = Query(20, ge=1, le=100),
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    """Everything in flight for this workspace, plus what recently finished.

    This is the endpoint that makes the feature work: no job ids are kept
    anywhere on the client, so a fresh tab can recover the full picture with
    one call.
    """
    try:
        rows = jobs.list_jobs(
            workspace_id, active_only=active, recent_minutes=recent_minutes, limit=limit
        )
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [jobs.public_job(r, include_result=False) for r in rows]


@router.get("/{job_id}")
def api_get_job(
    job_id: str,
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    """Status, progress and the result (or the masked error) for one job.

    A job belonging to someone else answers 404, not 403. 403 would confirm the
    id exists, which is an existence oracle over another teacher's workspace;
    this route must not be able to tell those two cases apart.
    """
    try:
        row = jobs.get_job(job_id, workspace_id)
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs.public_job(row, include_result=True)
