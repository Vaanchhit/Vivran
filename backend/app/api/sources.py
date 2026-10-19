"""Sources API: one upload for facts and style (see app/services/sources.py)."""
# No `from __future__ import annotations` (slowapi + FastAPI annotations; see app/api/auth.py).
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser
from app.core.rate_limit import limit
from app.memory import store
from app.services import sources
from app.services.ingestion_pipeline import IngestionError, ingest_material
from app.services.supabase_service import SupabaseError

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
def list_sources(workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    try:
        return {"sources": sources.list_sources(workspace_id)}
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail="Couldn't reach the database. Please try again.") from e


@router.post("")
@limit("20/minute;200/hour")
async def add_source(
    request: Request,
    title: str = Form(...),
    type: str = Form(...),  # pdf, docx, pptx, youtube
    confirm_no_student_data: bool = Form(...),
    subject: Optional[str] = Form(None),
    grade: Optional[str] = Form(None),
    external_url: Optional[str] = Form(None),
    use_for_facts: bool = Form(True),
    learn_style: Literal["auto", "yes", "no"] = Form("auto"),
    authored_by_me: bool = Form(True),
    file: Optional[UploadFile] = File(None),
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    if not confirm_no_student_data:
        raise HTTPException(status_code=400, detail="Please confirm the file has no student work or student names in it.")
    data = await file.read(store.MAX_UPLOAD_BYTES * 4 + 1) if file is not None else None
    filename = file.filename if file else None
    content_type = (file.content_type if file else None) or "application/octet-stream"

    def _run():
        return sources.add_source(
            workspace_id=workspace_id, user_id=user.user_id, title=title, material_type=type,
            file_bytes=data, filename=filename, content_type=content_type, external_url=external_url,
            subject=subject, grade=grade, use_for_facts=use_for_facts, learn_style=learn_style,
            authored_by_me=authored_by_me, ingest=ingest_material,
        )

    try:
        return await run_in_threadpool(_run)
    except (sources.SourceRefused, IngestionError) as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except store.MemoryNotReady:
        raise HTTPException(status_code=503, detail="Teaching style isn't set up on this server yet (migration 0008).")
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail="Couldn't reach the database. Please try again.") from e


@router.delete("/{source_id}")
def delete_source(source_id: str, workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    try:
        ok = sources.delete_source(workspace_id, source_id)
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail="Couldn't reach the database. Please try again.") from e
    if not ok:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


@router.delete("/{source_id}/style")
def stop_style(source_id: str, workspace_id: str = Depends(require_workspace_id), user: CurrentUser = Depends(require_teacher)):
    """Keep the file for facts; forget the style it taught."""
    if not sources.stop_learning_style(workspace_id, source_id):
        raise HTTPException(status_code=404, detail="Not found")
    return {"style": None}
