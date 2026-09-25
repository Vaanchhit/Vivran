"""Materials API (§47) — Upload, List teacher materials.

Protected: requires a valid Supabase JWT and a ``Workspace-Id`` header scoped to
the authenticated teacher's own workspace.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.api.deps import require_teacher, require_workspace_id
from app.api.jobs import ASYNC_JOB_QUERY, dispatch_generation
from app.core.auth import CurrentUser
from app.services.ingestion_pipeline import IngestionError, ingest_material
from app.services.jobs import JobUserError
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
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    """Ingest a teaching material: parse -> chunk -> embed -> persist.

    This handler MUST be ``async def`` — it awaits ``UploadFile.read()`` — but
    ``ingest_material`` is entirely synchronous and, for a large PDF, spends
    tens of seconds parsing, embedding and persisting. FastAPI runs ``async
    def`` handlers directly on the event loop, so that work used to freeze the
    whole instance (Render runs ONE worker): no other request, not even
    /health, could be served until the upload finished. (Embedding is batched
    now — see app/services/ingestion_pipeline.py — which took a 300-page PDF
    from ~900 sequential HTTP calls to ~9, but it is still far too long to hold
    the loop.)

    Two fixes, in order of importance:
      1. ``run_in_threadpool`` for the synchronous path, so the event loop is
         free even when a teacher insists on waiting for the response.
      2. ``?async_job=true``, which returns a job id immediately so a long
         upload survives the teacher navigating away.
    """
    file_bytes = await file.read() if file is not None else None
    filename = file.filename if file else None
    content_type = (file.content_type if file else None) or "application/octet-stream"

    def _ingest():
        return ingest_material(
            workspace_id=workspace_id,
            title=title,
            material_type=type,
            created_by=user.user_id,
            file_bytes=file_bytes,
            filename=filename,
            content_type=content_type,
            external_url=external_url,
            subject=subject,
            grade=grade,
        )

    if async_job:
        def _ingest_for_job():
            # A background job has no HTTP status code to carry meaning, so the
            # two ways ingestion reports an actionable problem — raising
            # IngestionError, and returning a FAILED envelope — are both
            # funnelled into JobUserError, which jobs.py stores verbatim
            # instead of masking. Otherwise "A PDF file is required" would
            # reach the teacher as "something went wrong generating that".
            try:
                result = _ingest()
            except IngestionError as e:
                raise JobUserError(str(e)) from e
            if result.get("processing_status") == "FAILED":
                raise JobUserError(result.get("error") or "Ingestion failed")
            return result

        # dispatch_generation only touches the DB and the executor, so it never
        # blocks; the ingestion itself runs on a job thread.
        return dispatch_generation(
            async_job=True,
            task_type="material_ingestion",
            workspace_id=workspace_id,
            user=user,
            params={"title": title, "type": type, "subject": subject, "grade": grade,
                    "external_url": external_url, "filename": filename},
            run=_ingest_for_job,
        )

    try:
        result = await run_in_threadpool(_ingest)
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
