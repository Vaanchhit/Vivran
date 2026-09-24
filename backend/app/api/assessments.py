"""Assessments API (§47) & Questions API for single-item regeneration."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel

from app.api.deps import require_teacher, require_workspace_id, teacher_session
from app.api.jobs import ASYNC_JOB_QUERY, dispatch_generation
from app.core.auth import CurrentUser
from app.core.config import settings
from app.core.errors import raise_for_service_result
from app.core.rate_limit import limit
from app.generation.assessments import generate_assessment, regenerate_single_question
from app.generation.pdf_export import render_assessment_pdf
from app.media.tally import TallyService
from app.services.supabase_service import SupabaseError

router = APIRouter(tags=["assessments"])

# Both generation routes below burn metered Gemini quota per call (assessment
# generation can also take the premium tier), so they carry the same per-IP
# throttle as the other generators — see app/api/content.py.
_GEN_LIMIT = "30/minute;300/hour"


class AssessmentGenerateRequest(BaseModel):
    grade: str
    subject: str
    topics: List[str]
    total_marks: int = 40
    difficulty: str = "medium"
    material_id: Optional[str] = None


@router.post("/assessments/generate")
@limit(_GEN_LIMIT)
def api_generate_assessment(
    request: Request,
    payload: AssessmentGenerateRequest,
    async_job: bool = ASYNC_JOB_QUERY,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    session: Dict[str, Any] = Depends(teacher_session),
    user: CurrentUser = Depends(require_teacher),
):
    # Grounding is optional: if a Workspace-Id is supplied it must be the
    # caller's own workspace (never trust a client-supplied id blindly).
    # Compared against the request-cached session rather than a fresh
    # provisioning call, so the beta gate and this check share one lookup.
    if workspace_id and workspace_id != session["workspace_id"]:
        raise HTTPException(status_code=403, detail="Workspace access denied")

    return dispatch_generation(
        async_job=async_job,
        task_type="assessment",
        workspace_id=session["workspace_id"],
        user=user,
        params=payload.model_dump(),
        # This is the one generator that may route to the premium tier
        # (app/generation/assessments.py falls back to cheap when Pro quota
        # isn't enabled), so the job row records the tier that was *planned*.
        model_tier="premium",
        model_name=settings.premium_model,
        run=lambda: generate_assessment(
            grade=payload.grade,
            subject=payload.subject,
            topics=payload.topics,
            total_marks=payload.total_marks,
            difficulty=payload.difficulty,
            created_by=user.user_id,
            workspace_id=workspace_id,
            material_id=payload.material_id,
        ),
    )


class AssessmentPdfRequest(BaseModel):
    assessment: Dict[str, Any]
    include_answer_key: bool = True


@router.post("/assessments/export/pdf")
def api_export_assessment_pdf(
    payload: AssessmentPdfRequest,
    user: CurrentUser = Depends(require_teacher),
):
    pdf_bytes = render_assessment_pdf(payload.assessment, include_answer_key=payload.include_answer_key)
    filename = (payload.assessment.get("title") or "assessment").replace(" ", "_").replace("/", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


class AssessmentTallyRequest(BaseModel):
    assessment: Dict[str, Any]


@router.post("/assessments/export/tally")
def api_export_assessment_tally(
    payload: AssessmentTallyRequest,
    user: CurrentUser = Depends(require_teacher),
):
    mcq_questions = [
        {"question_text": q["question_text"], "options": q.get("options") or []}
        for sec in payload.assessment.get("sections", [])
        for q in sec.get("questions", [])
        if q.get("question_type") == "mcq"
    ]
    result = TallyService().create_mcq_form(payload.assessment.get("title", "Assessment"), mcq_questions)
    raise_for_service_result(result, context="Tally export")
    total_questions = sum(len(sec.get("questions", [])) for sec in payload.assessment.get("sections", []))
    result["mcq_count"] = len(mcq_questions)
    result["skipped_non_mcq"] = total_questions - len(mcq_questions)
    return result


class QuestionRegenerateRequest(BaseModel):
    option: str  # harder, easier, application, conceptual, case


@router.post("/questions/{question_id}/regenerate")
@limit(_GEN_LIMIT)
def api_regenerate_question(
    request: Request,
    question_id: str,
    payload: QuestionRegenerateRequest,
    # Required, not optional: the question id in the path is the only thing
    # identifying the target row, so without a verified workspace to scope the
    # lookup through, any teacher could regenerate (and read back) any other
    # teacher's question. The frontend already sends Workspace-Id on every
    # call (see frontend/services/api.ts's buildHeaders).
    workspace_id: str = Depends(require_workspace_id),
    user: CurrentUser = Depends(require_teacher),
):
    try:
        return regenerate_single_question(
            question_id=question_id,
            option=payload.option,
            workspace_id=workspace_id,
            created_by=user.user_id,
        )
    except SupabaseError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

