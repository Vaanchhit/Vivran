"""Library API: the teacher's saved work (app/services/library.py).

Every route is scoped to the caller's own workspace; an id from another
workspace answers 404, never 403, so ids cannot be probed.
"""
import json
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser
from app.services import library
from app.services.supabase_service import SupabaseError, is_configured

router = APIRouter(prefix="/library", tags=["library"])

# A deck's laid-out slides are the largest thing saved; this is well above one.
_MAX_CONTENT_BYTES = 2_000_000


class SaveRequest(BaseModel):
    kind: str
    title: str = Field(min_length=1, max_length=300)
    content: Dict[str, Any]
    params: Optional[Dict[str, Any]] = None


class RenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)


def _db_error(e: SupabaseError) -> HTTPException:
    return HTTPException(status_code=502, detail="Your saved work could not be reached just now. Please try again.")


@router.get("")
def list_items(workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    if not is_configured():
        return []
    try:
        return library.list_items(workspace_id)
    except SupabaseError as e:
        raise _db_error(e) from e


@router.get("/{item_id}")
def get_item(item_id: uuid.UUID, workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    if not is_configured():
        raise HTTPException(status_code=404, detail="Not found")
    try:
        item = library.get_item(workspace_id, str(item_id))
    except SupabaseError as e:
        raise _db_error(e) from e
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item


@router.post("")
def save_item(payload: SaveRequest, workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    """For output produced outside this API (slide decks are built in the Next
    app's /api/deck route). Everything generated here saves itself."""
    if payload.kind not in library.KINDS:
        raise HTTPException(status_code=400, detail="Unknown item type")
    if len(json.dumps(payload.content)) > _MAX_CONTENT_BYTES:
        raise HTTPException(status_code=413, detail="That item is too large to save")
    item_id = library.save_item(
        workspace_id=workspace_id, user_id=user.user_id, kind=payload.kind,
        title=library.title_for(payload.kind, {"title": payload.title}, {}), content=payload.content, params=payload.params,
    )
    if not item_id:
        raise HTTPException(status_code=502, detail="Could not save that just now.")
    return {"id": item_id}


@router.patch("/{item_id}")
def rename_item(item_id: uuid.UUID, payload: RenameRequest, workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    try:
        ok = library.rename_item(workspace_id, str(item_id), payload.title)
    except SupabaseError as e:
        raise _db_error(e) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "ok"}


@router.delete("/{item_id}")
def delete_item(item_id: uuid.UUID, workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    try:
        ok = library.delete_item(workspace_id, str(item_id))
    except SupabaseError as e:
        raise _db_error(e) from e
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"status": "deleted"}
