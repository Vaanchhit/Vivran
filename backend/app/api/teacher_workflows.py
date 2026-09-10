from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.ai.router import AIRequest, ModelRouter
from app.ai.prompt_compiler import compile_teacher_prompt
from app.api.deps import require_teacher
from app.core.auth import CurrentUser

router = APIRouter(prefix="/workflow", tags=["teacher-workflows"])
model_router = ModelRouter()


class TeacherIntentRequest(BaseModel):
    teacher_prompt: str
    subject: str | None = None
    grade: str | None = None


@router.post("/parse-intent")
def parse_intent(
    payload: TeacherIntentRequest,
    user: CurrentUser = Depends(require_teacher),
) -> dict:
    prompt = payload.teacher_prompt.strip()
    compiled_intent = compile_teacher_prompt(prompt)
    
    ai_route = model_router.route(
        AIRequest(
            prompt=prompt,
            task_type="intent",
            complexity="simple",
            subject=payload.subject or compiled_intent.subject,
            grade=payload.grade or compiled_intent.grade,
        )
    )

    return {
        "intent": compiled_intent.model_dump(),
        "ai_route": ai_route,
        "requested_by": user.user_id,
        "message": "Intent parsed via Tier 1 OpenLocal model and routed to content planning pipeline.",
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
            "cheap_cloud": "normal content generation (slides, worksheets, quizzes)",
            "premium": "complex multi-source assessment & high-value pedagogical synthesis",
        },
    }

