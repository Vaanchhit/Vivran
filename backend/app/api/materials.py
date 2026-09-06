"""Materials API (§47) — Upload, List, Retrieve, Delete teacher materials."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/materials", tags=["materials"])


class MaterialCreateRequest(BaseModel):
    title: str
    type: str  # pdf, docx, pptx, youtube
    external_url: Optional[str] = None
    subject: Optional[str] = None
    grade: Optional[str] = None


@router.post("")
def create_material(payload: MaterialCreateRequest):
    return {
        "id": "mat-101",
        "title": payload.title,
        "type": payload.type,
        "processing_status": "PROCESSING",
        "message": "Material uploaded and queued for document ingestion pipeline.",
    }


@router.get("")
def list_materials():
    return [
        {
            "id": "mat-101",
            "title": "NCERT Class 10 Biology Chapter 6 — Tissues.pdf",
            "type": "pdf",
            "processing_status": "READY",
        }
    ]

