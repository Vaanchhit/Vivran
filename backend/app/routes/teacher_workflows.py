from fastapi import APIRouter
from pydantic import BaseModel

from app.services.ai_router import AIRequest, ModelRouter

router = APIRouter(prefix="/workflow", tags=["teacher-workflows"])
model_router = ModelRouter()


class TeacherIntentRequest(BaseModel):
    teacher_prompt: str
    subject: str | None = None
    grade: str | None = None


@router.post("/parse-intent")
def parse_intent(payload: TeacherIntentRequest) -> dict:
    prompt = payload.teacher_prompt.strip()
    workflow_types = [
        "coursework_planning",
        "classroom_content_creation",
        "assessment_creation",
    ]

    lowered_prompt = prompt.lower()
    if "quiz" in lowered_prompt or "assessment" in lowered_prompt:
        workflow_types.append("interactive_coursework")

    ai_route = model_router.route(
        AIRequest(
            prompt=prompt,
            workflow="coursework_planning",
            subject=payload.subject,
            grade=payload.grade,
        )
    )

    return {
        "intent": {
            "raw_prompt": prompt,
            "subject": payload.subject or "biology",
            "grade": payload.grade or "Class 10",
            "workflow_types": workflow_types,
            "required_outputs": [
                "course plan",
                "lesson plan",
                "slides",
                "worksheets",
                "quizzes",
                "assessment",
            ],
        },
        "ai_route": ai_route,
        "message": "Intent parsed and routed to the content planning pipeline.",
    }


@router.get("/capabilities")
def workflow_capabilities() -> dict:
    return {
        "allowed_workflows": [
            "coursework_planning",
            "classroom_content_creation",
            "assessment_creation",
            "interactive_coursework",
        ],
        "future_capabilities": [
            "ai_teacher_twin",
            "ai_grading",
        ],
        "model_layers": {
            "open_local": "intent understanding, prompt compilation, classification, metadata extraction, clarification",
            "cheap_cloud": "normal content generation",
            "premium": "complex reasoning-heavy generation",
        },
    }
