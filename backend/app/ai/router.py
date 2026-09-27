"""Vivran's AI tier layer (§22, §24) — the one place a task becomes a model.

WHAT CHANGED AND WHY
--------------------
This module used to compute a tier name and a model name and hand them back as
diagnostics. Nothing routed: every generation call named ``settings.cheap_model``
itself, and all three tier settings pointed at the same model anyway, so "tier"
was a label on a response rather than a decision. The tiers are real now, and
this file is where the decision is written down.

THE TIERS  (models pinned in app/core/config.py, with the benchmark)
  SLM         Extraction and rewriting — short, structured, checkable output,
              from call sites that already have a deterministic or
              pass-through fallback.
  CHEAP_CLOUD Authoring — slides, worksheets, lesson notes, coursework.
              Exam papers use this tier on their own pin
              (settings.assessment_model).
  PREMIUM     a Pro model. Off by default; see ``settings.premium_tier_enabled``.

WHAT DELIBERATELY DOES *NOT* GO TO THE SLM
  - ``generate_assessment``. The binding constraint there is that the marks must
    sum to the requested total exactly, and arithmetic-under-constraint is the
    textbook small-model failure. It is also self-punishing here: a paper that
    misses the total is fed back and regenerated, so a cheaper call that fails
    validation costs an extra request and ends up more expensive than the one
    we were avoiding.
  - Anything the teacher wrote in a non-English script. The UI offers twelve
    Indian languages; the published small-model evidence covers one of them.
    Untested multilingual quality is not a saving. See ``app/ai/language.py``.
"""
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional

from app.core.config import settings


class ModelTier(str, Enum):
    SLM = "slm"
    CHEAP_CLOUD = "cheap_cloud"
    PREMIUM = "premium"


def model_for_tier(tier: ModelTier) -> str:
    """The model a tier runs on right now. Single source of truth."""
    return {
        ModelTier.SLM: settings.slm_model,
        ModelTier.CHEAP_CLOUD: settings.cheap_model,
        ModelTier.PREMIUM: settings.premium_model,
    }[tier]


# Tasks whose output is an extraction or a rewrite of text the teacher already
# supplied, rather than new subject content authored from scratch. Named
# explicitly rather than inferred from a "complexity" string, because the reason
# each one is safe on a small model is a property of that specific call site
# (it has a fallback, its output is schema-checked) and not of its difficulty.
_SLM_TASKS = frozenset({
    "intent",
    "compilation",
    "classification",
    "clarification",
    "prompt_enhancement",
})


def select_tier(task_type: str, *, complexity: str = "normal") -> ModelTier:
    """Picks the tier for a task.

    Takes no text, on purpose: the language guard (app/ai/language.py) belongs
    at the call site that actually holds the teacher's words, and a tier
    function that quietly inspected prompts would be a second, hidden routing
    rule.
    """
    task = (task_type or "").lower()

    if task in _SLM_TASKS:
        return ModelTier.SLM

    if complexity.lower() == "complex" or task == "assessment_creation_heavy":
        # Still reported as premium even when it is switched off, so the routing
        # answer stays honest about what this task WANTS. The call sites gate on
        # settings.premium_tier_enabled; see app/generation/assessments.py.
        return ModelTier.PREMIUM

    return ModelTier.CHEAP_CLOUD


@dataclass
class AIRequest:
    prompt: str
    task_type: str  # intent, compilation, coursework_planning, assessment_creation, question_regen
    complexity: str = "normal"  # simple, normal, complex
    subject: Optional[str] = None
    grade: Optional[str] = None


class ModelRouter:
    def route(self, request: AIRequest) -> Dict[str, Any]:
        """Reports the tier and model this task actually runs on.

        Now backed by ``select_tier``/``model_for_tier``, the same two functions
        the generation code calls, so this can no longer describe a route that
        does not happen.
        """
        tier = select_tier(request.task_type, complexity=request.complexity)
        effective = tier
        if tier is ModelTier.PREMIUM and not settings.premium_tier_enabled:
            # Say what will really happen rather than what the task asked for.
            effective = ModelTier.CHEAP_CLOUD

        return {
            "model_tier": effective.value,
            "model_name": model_for_tier(effective),
            "requested_tier": tier.value,
            "task_type": (request.task_type or "").lower(),
            "intent": request.prompt,
            # Diagnostic routing metadata, not shown to teachers (the actual
            # content intent is StructuredIntent from prompt_compiler.py) —
            # but no reason to fabricate a value here either.
            "subject": request.subject,
            "grade": request.grade,
            "status": "routed",
        }
