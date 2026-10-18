"""Ask Vivran API (app/generation/assistant.py): a cheap guide with a daily allowance per teacher."""
# No `from __future__ import annotations`: slowapi's @limit() and FastAPI's
# annotation resolution don't mix with it (see app/api/auth.py).
import datetime as _dt
import threading
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from app.api.deps import require_teacher, teacher_session
from app.core.auth import CurrentUser
from app.core.rate_limit import limit
from app.generation.assistant import ask

router = APIRouter(prefix="/assistant", tags=["assistant"])

# Questions per teacher per day. In process, like the rate limiter: accurate on
# one instance, and the page falls back to local search when it is spent.
DAILY_ALLOWANCE = 40
_used: Dict[str, int] = {}
_used_day = ""
_lock = threading.Lock()


def _spend(workspace_id: str) -> Optional[int]:
    """Counts one question; returns how many are left, or None when the day's allowance is spent."""
    global _used_day
    today = _dt.date.today().isoformat()
    with _lock:
        if today != _used_day:
            _used.clear()
            _used_day = today
        n = _used.get(workspace_id, 0)
        if n >= DAILY_ALLOWANCE:
            return None
        _used[workspace_id] = n + 1
        return DAILY_ALLOWANCE - n - 1


def reset_allowance() -> None:
    with _lock:
        _used.clear()


class Turn(BaseModel):
    role: Literal["user", "guide"]
    text: str = Field(max_length=400)


class Entry(BaseModel):
    id: str = Field(max_length=60)
    q: str = Field(max_length=200)
    a: str = Field(max_length=500)
    steps: List[str] = Field(default_factory=list, max_length=8)
    points: List[str] = Field(default_factory=list, max_length=8)


class AskRequest(BaseModel):
    message: str = Field(min_length=2, max_length=400)
    page: str = Field(default="", max_length=80)
    history: List[Turn] = Field(default_factory=list, max_length=6)
    # The help entries the browser's own search found, so the model reads
    # five short answers instead of searching anything itself.
    entries: List[Entry] = Field(default_factory=list, max_length=5)


@router.post("/ask")
@limit("10/minute;60/hour")
async def api_ask(
    request: Request,
    payload: AskRequest,
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    left = _spend(session["workspace_id"])
    if left is None:
        raise HTTPException(status_code=429, detail="You've used today's questions to the guide. The help search still works, and it resets tomorrow.")
    reply = await run_in_threadpool(
        ask, payload.message, payload.page, [t.model_dump() for t in payload.history], [e.model_dump() for e in payload.entries]
    )
    if reply.get("error"):
        raise HTTPException(status_code=502, detail=reply["error"])
    reply["left_today"] = left
    return reply
