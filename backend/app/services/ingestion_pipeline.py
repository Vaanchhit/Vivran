"""End-to-end material ingestion (§19): parse -> chunk -> embed -> persist.

Runs synchronously inside the request. Fine for the file sizes a teacher
demo uploads; a real multi-teacher rollout should move this to a background
worker (see app/services/job_worker.py) so large PDFs don't hold a request
open.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from app.ai.gemini_client import GeminiError
from app.core.logging import logger
from app.ingestion.chunking import chunk_units
from app.ingestion.docx import parse_docx
from app.ingestion.pdf import parse_pdf
from app.ingestion.pptx import parse_pptx
from app.ingestion.youtube import YouTubeIngestionError, parse_youtube
from app.retrieval.embeddings import generate_embedding
from app.services.supabase_service import (
    SupabaseError,
    ensure_bucket,
    is_configured,
    table_insert,
    table_insert_many,
    table_update,
    upload_file,
)

SUPPORTED_TYPES = {"pdf", "docx", "pptx", "youtube"}


class IngestionError(RuntimeError):
    pass


def _extract_units(material_type: str, file_bytes: Optional[bytes], external_url: Optional[str]) -> List[Dict[str, Any]]:
    if material_type == "pdf":
        if not file_bytes:
            raise IngestionError("A PDF file is required")
        pages = parse_pdf(file_bytes)["pages"]
        return [{"text": p["text"], "page_number": p["page_number"]} for p in pages]

    if material_type == "docx":
        if not file_bytes:
            raise IngestionError("A DOCX file is required")
        paragraphs = parse_docx(file_bytes)["paragraphs"]
        return [{"text": "\n".join(paragraphs)}] if paragraphs else []

    if material_type == "pptx":
        if not file_bytes:
            raise IngestionError("A PPTX file is required")
        slides = parse_pptx(file_bytes)["slides"]
        return [{"text": s["text"], "page_number": s["slide_number"]} for s in slides]

    if material_type == "youtube":
        if not external_url:
            raise IngestionError("A YouTube URL is required")
        try:
            segments = parse_youtube(external_url)["segments"]
        except YouTubeIngestionError as e:
            raise IngestionError(str(e)) from e
        return [
            {"text": s["text"], "timestamp_start": s["timestamp_start"], "timestamp_end": s["timestamp_end"]}
            for s in segments
        ]

    raise IngestionError(f"Unsupported material type: {material_type}")


def ingest_material(
    *,
    workspace_id: str,
    title: str,
    material_type: str,
    created_by: str,
    file_bytes: Optional[bytes] = None,
    filename: Optional[str] = None,
    content_type: str = "application/octet-stream",
    external_url: Optional[str] = None,
    subject: Optional[str] = None,
    grade: Optional[str] = None,
) -> Dict[str, Any]:
    if material_type not in SUPPORTED_TYPES:
        raise IngestionError(f"type must be one of {sorted(SUPPORTED_TYPES)}")

    if not is_configured():
        raise IngestionError(
            "Supabase is not configured on the backend (SUPABASE_URL / "
            "SUPABASE_SERVICE_ROLE_KEY). Materials cannot be persisted."
        )

    material_id = str(uuid.uuid4())
    storage_path = None

    try:
        units = _extract_units(material_type, file_bytes, external_url)
        if not units:
            raise IngestionError("No extractable text was found in this material")

        chunks = chunk_units(units)
        if not chunks:
            raise IngestionError("No extractable text was found in this material")

        for chunk in chunks:
            chunk["embedding"] = generate_embedding(chunk["content"])

    except (IngestionError, GeminiError) as e:
        logger.warning("Ingestion failed for '%s': %s", title, e)
        return {
            "id": material_id,
            "workspace_id": workspace_id,
            "title": title,
            "type": material_type,
            "processing_status": "FAILED",
            "error": str(e),
        }

    if file_bytes is not None:
        try:
            ensure_bucket("materials")
            safe_name = (filename or "upload").replace("/", "_")
            storage_path = upload_file(
                "materials", f"{workspace_id}/{material_id}/{safe_name}", file_bytes, content_type
            )
        except SupabaseError as e:
            logger.warning("Storage upload failed for '%s' (continuing without it): %s", title, e)

    material_row = table_insert(
        "materials",
        {
            "id": material_id,
            "workspace_id": workspace_id,
            "title": title,
            "type": material_type,
            "storage_path": storage_path,
            "external_url": external_url,
            "subject": subject,
            "grade": grade,
            "processing_status": "PROCESSING",
            "metadata": {"created_by": created_by},
        },
    )

    try:
        table_insert_many(
            "source_chunks",
            [
                {
                    "material_id": material_id,
                    "content": c["content"],
                    "embedding": c["embedding"],
                    "page_number": c.get("page_number"),
                    "timestamp_start": c.get("timestamp_start"),
                    "timestamp_end": c.get("timestamp_end"),
                }
                for c in chunks
            ],
        )
    except SupabaseError as e:
        logger.warning("Storing chunks failed for '%s': %s", title, e)
        table_update("materials", {"id": f"eq.{material_id}"}, {"processing_status": "FAILED"})
        return {**material_row, "processing_status": "FAILED", "error": str(e)}

    material_row = table_update(
        "materials", {"id": f"eq.{material_id}"}, {"processing_status": "READY", "metadata": {"chunk_count": len(chunks), "created_by": created_by}}
    )[0]
    return {**material_row, "chunk_count": len(chunks)}
