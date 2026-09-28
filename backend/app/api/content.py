"""Classroom Content Creation (§13) & Interactive Coursework (§28) API."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from app.ai.cheap_model import generate_cheap_cloud, generate_planner
from app.api.deps import require_teacher, teacher_session
from app.api.jobs import ASYNC_JOB_QUERY, dispatch_generation
from app.core.auth import CurrentUser
from app.core.errors import FailureClass, http_error, raise_for_service_result
from app.core.logging import logger
from app.core.rate_limit import limit
from app.generation.artifacts import generate_lesson_notes, generate_slides, generate_worksheet
from app.generation.coursework import generate_interactive_coursework
from app.generation.prompt_enhancement import enhance_creative_prompt
from app.generation.slide_html import render_slides_html
from app.media.cartesia import CartesiaService
from app.media.elevenlabs import ElevenLabsService
from app.retrieval.search import search_knowledge_base

router = APIRouter(prefix="/content", tags=["content"])

# Every route here spends metered third-party quota on each call — Gemini for
# the text generators, ElevenLabs/Cartesia for image/video/speech — billed to
# us, so they're throttled per client IP on top of the auth + beta gates. The
# media budget is tighter because those calls are by far the most expensive.
# Both are sized well above what a teacher can trigger by hand from the UI, so
# normal use never sees a 429.
_TEXT_GEN_LIMIT = "30/minute;300/hour"
_MEDIA_GEN_LIMIT = "10/minute;60/hour"


def _validated_workspace(workspace_id: Optional[str], session: Dict[str, Any]) -> Optional[str]:
    """Grounding is optional here, but a supplied Workspace-Id must be the
    caller's own — never trust a client-supplied id blindly.

    Takes the already-resolved teacher_session rather than re-deriving the
    workspace: FastAPI caches that dependency for the request, so this costs
    nothing on top of the beta-gate check every one of these routes already
    runs (see app/main.py).
    """
    if workspace_id and workspace_id != session["workspace_id"]:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    return workspace_id


class SlidesRequest(BaseModel):
    topic: str
    slide_count: int = 12
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/slides")
@limit(_TEXT_GEN_LIMIT)
def api_generate_slides(
    request: Request,
    payload: SlidesRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, session)
    return dispatch_generation(
        async_job=async_job,
        task_type="slides",
        # The JOB is always owned by the caller's own workspace, even when the
        # optional grounding header was left off — otherwise a job could be
        # written with a null workspace and no read path could ever scope it.
        workspace_id=session["workspace_id"],
        user=user,
        params=payload.model_dump(),
        run=lambda: generate_slides(payload.topic, payload.slide_count, payload.grade, payload.subject, ws),
    )


class WorksheetRequest(BaseModel):
    topic: str
    question_count: int = 10
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/worksheet")
@limit(_TEXT_GEN_LIMIT)
def api_generate_worksheet(
    request: Request,
    payload: WorksheetRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, session)
    return dispatch_generation(
        async_job=async_job,
        task_type="worksheet",
        workspace_id=session["workspace_id"],
        user=user,
        params=payload.model_dump(),
        run=lambda: generate_worksheet(payload.topic, payload.question_count, payload.grade, payload.subject, ws),
    )


class LessonNotesRequest(BaseModel):
    topic: str
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/lesson-notes")
@limit(_TEXT_GEN_LIMIT)
def api_generate_lesson_notes(
    request: Request,
    payload: LessonNotesRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, session)
    return dispatch_generation(
        async_job=async_job,
        task_type="lesson_notes",
        workspace_id=session["workspace_id"],
        user=user,
        params=payload.model_dump(),
        run=lambda: generate_lesson_notes(payload.topic, payload.grade, payload.subject, ws),
    )


class InteractiveRequest(BaseModel):
    topic: str
    duration_minutes: int = 15
    grade: Optional[str] = None
    subject: Optional[str] = None


@router.post("/interactive")
@limit(_TEXT_GEN_LIMIT)
def api_generate_interactive(
    request: Request,
    payload: InteractiveRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, session)
    return dispatch_generation(
        async_job=async_job,
        task_type="interactive_coursework",
        workspace_id=session["workspace_id"],
        user=user,
        params=payload.model_dump(),
        run=lambda: generate_interactive_coursework(
            payload.topic, payload.duration_minutes, payload.grade, payload.subject, ws
        ),
    )


class EnhancePromptRequest(BaseModel):
    prompt: str
    artifact_type: str  # "video" | "image" | "slides" | "worksheet" | ...


@router.post("/enhance-prompt")
@limit(_TEXT_GEN_LIMIT)
def api_enhance_prompt(
    request: Request,
    payload: EnhancePromptRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
):
    ws = _validated_workspace(workspace_id, session)
    return enhance_creative_prompt(payload.prompt, payload.artifact_type, ws)


def _visual_grounding(topic: str, workspace_id: Optional[str]) -> List[Dict[str, Any]]:
    """Retrieval context for an image/video brief, when the teacher has any.

    Grounding a *visual* matters more than grounding text: a picture that
    invents a statistic or a named entity looks authoritative and gets shown to
    a class unreviewed. Best-effort — retrieval failing must never block the
    generation, only make it ungrounded (same rule as every other engine here).
    """
    if not workspace_id:
        return []
    try:
        return search_knowledge_base(topic, workspace_id, limit=3)
    except Exception as e:
        logger.warning("Retrieval for media generation failed (continuing ungrounded): %s", e)
        return []


class ImageRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "1:1"


@router.post("/image")
@limit(_MEDIA_GEN_LIMIT)
def api_generate_image(
    request: Request,
    payload: ImageRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, session)
    return dispatch_generation(
        async_job=async_job,
        task_type="image",
        workspace_id=session["workspace_id"],
        user=user,
        params=payload.model_dump(),
        run=lambda: ElevenLabsService().generate_image(
            payload.prompt,
            aspect_ratio=payload.aspect_ratio,
            grounding=_visual_grounding(payload.prompt, ws),
        ),
        service_context="image generation",
    )


class VideoRequest(BaseModel):
    prompt: str
    aspect_ratio: str = "16:9"
    duration_secs: int = 8


@router.post("/video")
@limit(_MEDIA_GEN_LIMIT)
def api_generate_video(
    request: Request,
    payload: VideoRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    ws = _validated_workspace(workspace_id, session)
    # The visual guardrails (palette, no-rendered-text, anti-hallucination) are
    # applied inside the service, not here, so every caller gets them and none
    # can opt out. See app/media/visual_guardrails.py.
    return dispatch_generation(
        async_job=async_job,
        task_type="video",
        workspace_id=session["workspace_id"],
        user=user,
        params=payload.model_dump(),
        run=lambda: ElevenLabsService().generate_video(
            payload.prompt,
            aspect_ratio=payload.aspect_ratio,
            duration_secs=payload.duration_secs,
            grounding=_visual_grounding(payload.prompt, ws),
        ),
        service_context="video generation",
    )


@router.post("/transcribe")
@limit(_MEDIA_GEN_LIMIT)
async def api_transcribe_audio(
    request: Request,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
):
    audio_bytes = await file.read()
    # This handler has to be `async def` (it awaits UploadFile.read), which
    # means its body runs ON the event loop — and CartesiaService.transcribe is
    # a blocking httpx call that can take tens of seconds. Left inline it stops
    # the single Render worker from serving anything at all, including
    # /health. run_in_threadpool puts it back where FastAPI would have run it
    # had the handler been a plain `def`.
    result = await run_in_threadpool(
        CartesiaService().transcribe,
        audio_bytes,
        file.filename or "audio.webm",
        file.content_type or "audio/webm",
    )
    raise_for_service_result(result, context="transcription")
    return {"text": result["text"]}


class NarrationRequest(BaseModel):
    script: str
    provider: str = "cartesia"  # cartesia | elevenlabs (elevenlabs needs Text-to-Speech key permission)


@router.post("/narration")
@limit(_MEDIA_GEN_LIMIT)
def api_generate_narration(
    request: Request,
    payload: NarrationRequest,
    user: CurrentUser = Depends(require_teacher),
):
    service = CartesiaService() if payload.provider == "cartesia" else ElevenLabsService()
    method = service.generate_speech if payload.provider == "cartesia" else service.generate_narration_audio
    result = method(payload.script)
    return raise_for_service_result(result, context="narration")


class SlidesHtmlRequest(BaseModel):
    """Renders an already-generated deck. Takes the deck the client already has
    rather than regenerating it, so previewing/printing costs nothing and — more
    importantly — prints exactly the deck the teacher reviewed on screen."""

    deck: Dict[str, Any]
    include_notes_pages: bool = False


@router.post("/slides/html", response_class=HTMLResponse)
def api_render_slides_html(
    payload: SlidesHtmlRequest,
    user: CurrentUser = Depends(require_teacher),
):
    """Print-ready HTML for a slide deck — the teacher prints it to PDF from the
    browser (Print → Save as PDF).

    No model call, no quota, and therefore no rate limit: this is a pure
    function of the deck that was already generated.
    """
    if not (payload.deck.get("slides") or []):
        # A genuine, actionable input error — stays specific, never masked.
        raise HTTPException(status_code=400, detail="This deck has no slides to render.")
    return HTMLResponse(content=render_slides_html(payload.deck, include_notes_pages=payload.include_notes_pages))


# ---------------------------------------------------------------------------
# slidekit seam.
#
# slidekit (frontend/lib/slidekit) owns understanding the teacher's request,
# planning the lesson skeleton, deriving character budgets from layouts it has
# verified, validating and repairing the model's JSON, and choosing a layout.
# All of that is deterministic and needs no key, so it runs in the frontend.
#
# What it cannot do from there is hold an API key, reach pgvector, or inherit
# the retry/backoff, error masking, request pacing and token accounting that
# already wrap every model call here. So the split is: slidekit prepares the
# prompt and consumes the result; these two endpoints do the parts that must
# stay server-side.
# ---------------------------------------------------------------------------


class GroundingRequest(BaseModel):
    query: str
    material_id: Optional[str] = None
    limit: int = 6


@router.post("/grounding")
@limit(_TEXT_GEN_LIMIT)
def api_grounding(
    request: Request,
    payload: GroundingRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    """Retrieved chunks for slidekit to label S1..Sn and put in its prompt.

    Returns [] rather than erroring when nothing is indexed: an ungrounded deck
    is a worse deck, not a failed one, and the teacher is told which it was.
    """
    ws = _validated_workspace(workspace_id, session)
    if not ws:
        return {"chunks": [], "grounded": False}
    chunks = search_knowledge_base(
        payload.query, workspace_id=ws, material_id=payload.material_id, limit=payload.limit
    )
    return {
        "chunks": [
            {
                "chunk_id": c.get("chunk_id") or c.get("id"),
                "excerpt": c.get("content") or c.get("excerpt") or "",
                "source_material": c.get("source_material") or c.get("title"),
                "page_number": c.get("page_number"),
            }
            for c in chunks
        ],
        "grounded": bool(chunks),
    }


class BlockFillRequest(BaseModel):
    system_prompt: str
    user_prompt: str


@router.post("/blocks")
@limit(_TEXT_GEN_LIMIT)
def api_fill_blocks(
    request: Request,
    payload: BlockFillRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    """Runs a slidekit-prepared prompt on the authoring tier.

    Deliberately thin: it does NOT parse, validate or repair the response.
    slidekit's zod schemas and repair.ts are the authority on block shape, and
    duplicating that here would give two implementations that can disagree.
    The raw string goes back as-is; failures are masked as everywhere else.
    """
    _validated_workspace(workspace_id, session)
    result = generate_cheap_cloud(
        payload.user_prompt,
        task="slidekit_blocks",
        system_prompt=payload.system_prompt,
        json_mode=True,
    )
    # NOTE: the model tiers return {"success": ...}, not the media services'
    # {"status": "ready"} envelope — raise_for_service_result is for the latter
    # and silently treats every generation result as a failure.
    if not result.get("success"):
        raise http_error(
            result.get("failure") or FailureClass.UPSTREAM_ERROR,
            context="slides",
            detail=str(result.get("error", "")),
        )
    return {
        "content": result.get("content", ""),
        "provider": result.get("provider"),
        "model_name": result.get("model_name"),
        "usage": result.get("usage"),
    }


@router.post("/outline")
@limit(_TEXT_GEN_LIMIT)
def api_plan_outline(
    request: Request,
    payload: BlockFillRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    """Runs a slidekit-prepared outline prompt on the planning model.

    Thin for the same reason as /blocks: slidekit validates the outline, and the
    teacher approves it before anything is written.
    """
    _validated_workspace(workspace_id, session)
    result = generate_planner(payload.user_prompt, system_prompt=payload.system_prompt, task="slide_outline")
    if not result.get("success"):
        raise http_error(
            result.get("failure") or FailureClass.UPSTREAM_ERROR,
            context="slides",
            detail=str(result.get("error", "")),
        )
    return {
        "content": result.get("content", ""),
        "provider": result.get("provider"),
        "model_name": result.get("model_name"),
        "usage": result.get("usage"),
    }
