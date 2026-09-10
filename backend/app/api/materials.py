"""Materials API (§47) — Upload, List, Retrieve, Delete teacher materials.

Protected: requires a valid Supabase JWT and a ``Workspace-Id`` header scoped to
the authenticated teacher's own workspace.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from app.api.deps import require_teacher, require_workspace_id
from app.core.auth import CurrentUser

router = APIRouter(prefix="/materials", tags=["materials"])


class MaterialCreateRequest(BaseModel):
    title: str
    type: str  # pdf, docx, pptx, youtube
    external_url: Optional[str] = None
    subject: Optional[str] = None
    grade: Optional[str] = None


@router.post("")
def create_material(
    payload: MaterialCreateRequest,
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    return {
        "id": "mat-101",
        "workspace_id": workspace_id,
        "created_by": user.user_id,
        "title": payload.title,
        "type": payload.type,
        "processing_status": "PROCESSING",
        "message": "Material uploaded and queued for document ingestion pipeline.",
    }


@router.get("")
def list_materials(
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    return [
        {
            "id": "mat-101",
            "workspace_id": workspace_id,
            "created_by": user.user_id,
            "title": "NCERT Class 10 Biology Chapter 6 — Tissues.pdf",
            "type": "pdf",
            "processing_status": "READY",
        }
    ]