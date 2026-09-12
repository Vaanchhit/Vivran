"""Assessments API (§47) & Questions API for single-item regeneration."""
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.api.deps import require_teacher
from app.core.auth import CurrentUser
from app.generation.assessments import generate_assessment, regenerate_single_question
from app.services.provisioning import ensure_teacher_workspace
from app.services.supabase_service import SupabaseError

router = APIRouter(tags=["assessments"])


class AssessmentGenerateRequest(BaseModel):
    grade: str
    subject: str
    topics: List[str]
    total_marks: int = 40
    difficulty: str = "medium"
    material_id: Optional[str] = None


@router.post("/assessments/generate")
def api_generate_assessment(
    payload: AssessmentGenerateRequest,
    workspace_id: Optional[str] = Header(None, alias="Workspace-Id"),
    user: CurrentUser = Depends(require_teacher),
):
    # Grounding is optional: if a Workspace-Id is supplied it must be the
    # caller's own workspace (never trust a client-supplied id blindly).
    if workspace_id and workspace_id != ensure_teacher_workspace(user):
        raise HTTPException(status_code=403, detail="Workspace access denied")

    return generate_assessment(
        grade=payload.grade,
        subject=payload.subject,
        topics=payload.topics,
        total_marks=payload.total_marks,
        difficulty=payload.difficulty,
        created_by=user.user_id,
        workspace_id=workspace_id,
        material_id=payload.material_id,
    )


class QuestionRegenerateRequest(BaseModel):
    option: str  # harder, easier, application, conceptual, case


@router.post("/questions/{question_id}/regenerate")
def api_regenerate_question(
    question_id: str,
    payload: QuestionRegenerateRequest,
    user: CurrentUser = Depends(require_teacher),
):
    try:
        return regenerate_single_question(
            question_id=question_id,
            option=payload.option,
            created_by=user.user_id,
        )
    except SupabaseError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

