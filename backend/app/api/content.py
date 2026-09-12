"""Classroom Content Creation (§13) & Interactive Coursework (§28) API."""
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from app.api.deps import require_teacher
from app.core.auth import CurrentUser
from app.generation.artifacts import generate_lesson_notes, generate_slides, generate_worksheet
from app.generation.coursework import generate_interactive_coursework
from app.media.cartesia import CartesiaService
from app.media.elevenlabs import ElevenLabsService
from app.services.provisioning import ensure_teacher_workspace

router = APIRouter(prefix="/content", tags=["content"])


def _validated_workspace(workspace_id: Optional[str], user: CurrentUser) -> Optional[str]:
    if workspace_id and workspace_id != ensure_teacher_workspace(user):
        raise HTTPException(status_code=403, detail="Workspace access denied")
    return workspace_id


class SlidesRequest(BaseModel):
    topic: str
    slide_count: int = 12
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/slides")
def api_generate_slides(
    payload: SlidesRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, user)
    return generate_slides(payload.topic, payload.slide_count, payload.grade, payload.subject, ws)


class WorksheetRequest(BaseModel):
    topic: str
    question_count: int = 10
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/worksheet")
def api_generate_worksheet(
    payload: WorksheetRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, user)
    return generate_worksheet(payload.topic, payload.question_count, payload.grade, payload.subject, ws)


class LessonNotesRequest(BaseModel):
    topic: str
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/lesson-notes")
def api_generate_lesson_notes(
    payload: LessonNotesRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, user)
    return generate_lesson_notes(payload.topic, payload.grade, payload.subject, ws)


class InteractiveRequest(BaseModel):
    topic: str
    duration_minutes: int = 15
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/interactive")
def api_generate_interactive(
    payload: InteractiveRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, user)
    return generate_interactive_coursework(payload.topic, payload.duration_minutes, payload.grade, payload.subject, ws)


class ImageRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"


@router.post("/image")
def api_generate_image(
    payload: ImageRequest,
    user: CurrentUser = Depends(require_teacher),
):
    result = ElevenLabsService().generate_image(payload.prompt, aspect_ratio=payload.aspect_ratio)
    if result["status"] == "not_configured":
        raise HTTPException(status_code=503, detail=result["error"])
    if result["status"] == "failed":
        raise HTTPException(status_code=502, detail=result["error"])
    return result


class VideoRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "16:9"
    duration_secs: int = 8


@router.post("/video")
def api_generate_video(
    payload: VideoRequest,
    user: CurrentUser = Depends(require_teacher),
):
    result = ElevenLabsService().generate_video(payload.prompt, aspect_ratio=payload.aspect_ratio, duration_secs=payload.duration_secs)
    if result["status"] == "not_configured":
        raise HTTPException(status_code=503, detail=result["error"])
    if result["status"] == "failed":
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@router.post("/transcribe")
async def api_transcribe_audio(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
):
    audio_bytes = await file.read()
    result = CartesiaService().transcribe(audio_bytes, file.filename or "audio.webm", file.content_type or "audio/webm")
    if result["status"] == "not_configured":
        raise HTTPException(status_code=503, detail=result["error"])
    if result["status"] == "failed":
        raise HTTPException(status_code=502, detail=result["error"])
    return {"text": result["text"]}


class NarrationRequest(BaseModel):
    script: str
    provider: str = "elevenlabs"  # elevenlabs | cartesia


@router.post("/narration")
def api_generate_narration(
    payload: NarrationRequest,
    user: CurrentUser = Depends(require_teacher),
):
    service = CartesiaService() if payload.provider == "cartesia" else ElevenLabsService()
    method = service.generate_speech if payload.provider == "cartesia" else service.generate_narration_audio
    result = method(payload.script)
    if result["status"] == "not_configured":
        raise HTTPException(status_code=503, detail=result["error"])
    if result["status"] == "failed":
        raise HTTPException(status_code=502, detail=result["error"])
    return result
