"""Assessments API (§47) & Questions API for single-item regeneration."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List

from app.api.deps import require_teacher
from app.core.auth import CurrentUser
from app.generation.assessments import generate_assessment, regenerate_single_question

router = APIRouter(tags=["assessments"])


class AssessmentGenerateRequest(BaseModel):
    grade: str
    subject: str
    topics: List[str]
    total_marks: int = 40
    difficulty: str = "medium"


@router.post("/assessments/generate")
def api_generate_assessment(
    payload: AssessmentGenerateRequest,
    user: CurrentUser = Depends(require_teacher),
):
    return generate_assessment(
        grade=payload.grade,
        subject=payload.subject,
        topics=payload.topics,
        total_marks=payload.total_marks,
        difficulty=payload.difficulty,
        created_by=user.user_id,
    )


class QuestionRegenerateRequest(BaseModel):
    option: str  # harder, easier, application, conceptual, case


@router.post("/questions/{question_id}/regenerate")
def api_regenerate_question(
    question_id: str,
    payload: QuestionRegenerateRequest,
    user: CurrentUser = Depends(require_teacher),
):
    return regenerate_single_question(
        question_id=question_id,
        option=payload.option,
        created_by=user.user_id,
    )

