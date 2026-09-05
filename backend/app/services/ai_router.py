from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class AIRequest:
    prompt: str
    workflow: str
    subject: str | None = None
    grade: str | None = None


class ModelRouter:
    """Simple abstraction for AI provider tiers. No direct provider calls in the frontend."""

    def route(self, request: AIRequest) -> dict[str, Any]:
        workflow = request.workflow.lower()

        if workflow in {"coursework_planning", "assessment_creation"}:
            tier = "premium"
        else:
            tier = "cheap_cloud"

        return {
            "model_tier": tier,
            "workflow": workflow,
            "intent": request.prompt,
            "subject": request.subject or "general",
            "grade": request.grade or "mixed",
            "status": "queued_for_generation",
        }
