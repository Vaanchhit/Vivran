"""Teaching memory API: upload past files, see what Vivran noticed, decide what it uses.

Everything here is scoped to the caller's own workspace (require_workspace_id)
and behind the beta gate (app/main.py). Files are read in the request, in a
worker thread: reading is pattern matching over text, so it takes well under
a second for a typical paper and needs no background job. The file itself is
discarded once read (app/memory/store.py).
"""
# No `from __future__ import annotations`: slowapi's @limit() and FastAPI's
# annotation resolution don't mix with it (see app/api/auth.py).
from typing import Any, Dict, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser
from app.core.rate_limit import limit
from app.memory import store
from app.memory.classify import KINDS
from app.memory.text import UnreadableFile
from app.services.supabase_service import SupabaseError

router = APIRouter(prefix="/memory", tags=["memory"])

_NOT_READY = HTTPException(
    status_code=503,
    detail="Teaching style isn't set up on this server yet (database migration 0008). Nothing you upload is lost; try again once it is.",
)


def _guard(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except store.MemoryNotReady as e:
        raise _NOT_READY from e
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail="Couldn't reach the database. Please try again.") from e


@router.get("")
def get_memory(workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)) -> Dict[str, Any]:
    return {
        "documents": _guard(store.list_documents, workspace_id),
        "traits": _guard(store.list_traits, workspace_id),
    }


@router.post("/documents")
@limit("20/minute;200/hour")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    confirm_no_student_data: bool = Form(...),
    title: Optional[str] = Form(None),
    subject: Optional[str] = Form(None),
    grade: Optional[str] = Form(None),
    kind: str = Form("auto"),
    authored_by_me: bool = Form(True),
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    if not confirm_no_student_data:
        raise HTTPException(status_code=400, detail="Please confirm the file has no student work or student names in it.")
    if kind != "auto" and kind not in KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be 'auto' or one of {list(KINDS)}")
    data = await file.read(store.MAX_UPLOAD_BYTES + 1)

    def _add():
        return store.add_document(
            workspace_id=workspace_id,
            user_id=user.user_id,
            filename=file.filename or "upload",
            data=data,
            title=title,
            subject=subject,
            grade=grade,
            kind_hint=None if kind == "auto" else kind,
            authored_by_me=authored_by_me,
        )

    try:
        return await run_in_threadpool(_guard, _add)
    except (UnreadableFile, store.StudentWorkRefused) as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    if not _guard(store.delete_document, workspace_id, document_id):
        raise HTTPException(status_code=404, detail="File not found")
    return {"deleted": True}


class TraitDecision(BaseModel):
    action: Literal["use", "dismiss"]


@router.post("/traits/{trait_id}")
def decide_trait(
    trait_id: str,
    payload: TraitDecision,
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    trait = _guard(store.decide, workspace_id, trait_id, payload.action)
    if trait is None:
        raise HTTPException(status_code=404, detail="Not found")
    return trait


@router.delete("")
def forget_everything(workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    _guard(store.forget_all, workspace_id)
    return {"deleted": True}
