"""Intuitive examples API: explain a hard concept with something familiar (app/generation/examples.py)."""
# No `from __future__ import annotations`: slowapi's @limit() and FastAPI's
# annotation resolution don't mix with it (see app/api/auth.py).
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.api.deps import require_teacher, teacher_session
from app.api.jobs import ASYNC_JOB_QUERY, dispatch_generation
from app.core.auth import CurrentUser
from app.core.errors import raise_for_service_result
from app.core.rate_limit import limit
from app.generation.examples import generate_example
from app.media.napkin import NapkinService
from app.memory import events as memory_events
from app.memory import store as memory_store

router = APIRouter(prefix="/examples", tags=["examples"])

_LIMIT = "20/minute;200/hour"
_VISUAL_LIMIT = "6/minute;30/hour"


class ExampleRequest(BaseModel):
    concept: str = Field(min_length=2, max_length=200)
    grade: Optional[str] = Field(default=None, max_length=40)
    subject: Optional[str] = Field(default=None, max_length=80)
    # "auto" or a setting the teacher named ("cricket", "a kirana shop").
    setting: Optional[str] = Field(default=None, max_length=60)
    # Settings already shown, so "try another" really is another.
    avoid_settings: List[str] = Field(default_factory=list, max_length=6)
    material_id: Optional[str] = None
    language: Optional[str] = Field(default=None, max_length=30)
    # The concept card from an earlier answer: re-rolling the analogy reuses it,
    # so the definition stays put and only one model call is spent.
    card: Optional[Dict[str, Any]] = None


@router.post("")
@limit(_LIMIT)
def api_generate_example(
    request: Request,
    payload: ExampleRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    if workspace_id and workspace_id != session["workspace_id"]:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    ws = session["workspace_id"]
    # A re-roll is the same request again, not a new habit.
    if payload.card is None:
        memory_events.record_generation(ws, "example", payload.subject, payload.grade, {"setting": payload.setting if payload.setting and payload.setting != "auto" else None})
    habits = memory_store.habit_lines(ws, payload.subject)
    return dispatch_generation(
        async_job=async_job,
        task_type="intuitive_example",
        save_as="example" if payload.card is None else None,
        workspace_id=ws,
        user=user,
        params=payload.model_dump(exclude={"card"}),
        run=lambda: generate_example(
            payload.concept,
            grade=payload.grade,
            subject=payload.subject,
            setting=payload.setting,
            avoid_settings=payload.avoid_settings,
            workspace_id=ws,
            material_id=payload.material_id,
            language=payload.language,
            card=payload.card,
            style_lines=habits,
        ),
    )


class VisualRequest(BaseModel):
    # The text turned into a picture: the story and the mapping, nothing else.
    story: str = Field(min_length=10, max_length=1200)
    mapping: List[Dict[str, str]] = Field(default_factory=list, max_length=8)
    language: Optional[str] = Field(default=None, max_length=30)


@router.post("/visual")
@limit(_VISUAL_LIMIT)
async def api_example_visual(
    request: Request,
    payload: VisualRequest,
    user: CurrentUser = Depends(require_teacher),
):
    """A designed picture from Napkin, on request. Off unless NAPKIN_API_KEY is set."""
    napkin = NapkinService()
    if not napkin.is_configured():
        raise HTTPException(status_code=501, detail="Designed visuals aren't switched on for this deployment.")
    lines = [payload.story.strip(), ""]
    lines += [f"{m.get('term', '')}: {m.get('in_story', '')}" for m in payload.mapping if m.get("term")]
    result = await run_in_threadpool(napkin.make_visual, "\n".join(lines), payload.language)
    raise_for_service_result(result, context="designed visual")
    return {"image": result["image"], "format": result["format"]}
