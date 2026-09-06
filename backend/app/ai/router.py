"""Vivran Three-Tier AI Router (§22, §24).

Deterministic model routing:
- OPEN/LOCAL (Ollama) -> intent classification, prompt compilation, routing, clarification
- CHEAP CLOUD -> standard quizzes, worksheets, lessons, slides
- PREMIUM -> complex reasoning, multi-source assessment, exam matching
"""
from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class AIRequest:
    prompt: str
    task_type: str  # intent, compilation, coursework_planning, assessment_creation, question_regen
    complexity: str = "normal"  # simple, normal, complex
    subject: str | None = None
    grade: str | None = None


class ModelRouter:
    def route(self, request: AIRequest) -> Dict[str, Any]:
        task = request.task_type.lower()
        complexity = request.complexity.lower()

        if task in {"intent", "compilation", "classification", "clarification"} or complexity == "simple":
            tier = "open_local"
            model_name = "qwen2.5:7b"
        elif complexity == "complex" or task == "assessment_creation_heavy":
            tier = "premium"
            model_name = "gpt-4o"
        else:
            tier = "cheap_cloud"
            model_name = "gpt-4o-mini"

        return {
            "model_tier": tier,
            "model_name": model_name,
            "task_type": task,
            "intent": request.prompt,
            "subject": request.subject or "General",
            "grade": request.grade or "Class 10",
            "status": "routed",
        }

