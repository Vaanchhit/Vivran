"""Materials API (§47) — Upload, List teacher materials.

Protected: requires a valid Supabase JWT and a ``Workspace-Id`` header scoped to
the authenticated teacher's own workspace.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser
from app.services.ingestion_pipeline import IngestionError, ingest_material
from app.services.supabase_service import SupabaseError, is_configured, table_select

router = APIRouter(prefix="/materials", tags=["materials"])


@router.post("")
async def create_material(
    title: str = Form(...),
    type: str = Form(...),  # pdf, docx, pptx, youtube
    subject: Optional[str] = Form(None),
    grade: Optional[str] = Form(None),
    external_url: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    file_bytes = await file.read() if file is not None else None
    try:
        result = ingest_material(
            workspace_id=workspace_id,
            title=title,
            material_type=type,
            created_by=user.user_id,
            file_bytes=file_bytes,
            filename=file.filename if file else None,
            content_type=(file.content_type if file else None) or "application/octet-stream",
            external_url=external_url,
            subject=subject,
            grade=grade,
        )
    except IngestionError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if result.get("processing_status") == "FAILED":
        raise HTTPException(status_code=422, detail=result.get("error", "Ingestion failed"))
    return result


@router.get("")
def list_materials(
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    if not is_configured():
        return []
    try:
        return table_select(
            "materials",
            {"workspace_id": f"eq.{workspace_id}", "order": "created_at.desc"},
        )
    except SupabaseError as e:
        raise HTTPException(status_code=502, detail=str(e))
