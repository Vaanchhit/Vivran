"""Prompt Compiler (§25) — Converts natural language teacher prompts into structured intent."""
from typing import List
from pydantic import BaseModel, ValidationError

from app.ai.gemini_client import GeminiError, generate_json
from app.core.config import settings
from app.core.logging import logger


class StructuredIntent(BaseModel):
    task_type: str
    grade: str
    subject: str
    topics: List[str]
    marks: int | None = None
    difficulty: str = "medium"
    application_weight: float = 0.5
    requested_artifacts: List[str] = []


_SYSTEM_PROMPT = """You are Vivran's intent-parsing engine for teacher and professor requests (Tier 1, §25).
Extract structured intent from a natural-language request. Respond ONLY with JSON matching:
{
  "task_type": "course_plan" | "lesson" | "classroom_pack" | "assessment" | "interactive_course",
  "grade": string — a school grade ("Class 10") OR a college/university year ("College 2nd Year", "Final Year"),
  "subject": string — a school subject OR a college course/paper name (e.g. "Data Structures & Algorithms", "Organic Chemistry II"),
  "topics": string[],
  "marks": integer or null,
  "difficulty": "easy" | "medium" | "hard",
  "application_weight": number between 0 and 1 (share of application-style vs conceptual questions),
  "requested_artifacts": array from ["course_plan","lesson_plan","slides","worksheet","quiz","assessment","video","interactive_course"]
}
Infer grade/subject/topics even if only loosely implied — including college-level cues (year of study, degree
program, course code, "undergrad"/"postgrad") which should NOT be forced into a K-12 "Class N" shape, and should
produce college-appropriate content depth rather than school-level simplification. Default difficulty to
"medium" and application_weight to 0.5 if not implied."""


def compile_teacher_prompt(raw_prompt: str) -> tuple[StructuredIntent, bool]:
    """Parses teacher intent with the Tier-1 Gemini model.

    Returns (intent, degraded) — degraded=True means the Gemini call failed
    and a deterministic keyword-based heuristic was used instead.
    """
    try:
        data = generate_json(raw_prompt, system_prompt=_SYSTEM_PROMPT, model=settings.open_model, temperature=0.1)
        return StructuredIntent(**data), False
    except (GeminiError, ValidationError, TypeError) as e:
        logger.warning("AI intent parsing failed, using heuristic fallback: %s", e)
        return _compile_teacher_prompt_heuristic(raw_prompt), True


def _compile_teacher_prompt_heuristic(raw_prompt: str) -> StructuredIntent:
    prompt_lower = raw_prompt.lower()
    
    # Extract topics
    topics = []
    if "tissue" in prompt_lower:
        topics.append("Tissues")
    if "food" in prompt_lower:
        topics.append("Improvement in Food Resources")
    if "electricity" in prompt_lower:
        topics.append("Electricity")
    if "porter" in prompt_lower or "five forces" in prompt_lower:
        topics.append("Porter's Five Forces")
    if "demand" in prompt_lower or "supply" in prompt_lower:
        topics.append("Demand and Supply")
    if "balance sheet" in prompt_lower or "financial statement" in prompt_lower:
        topics.append("Financial Statements")
    if "marketing mix" in prompt_lower or "4ps" in prompt_lower:
        topics.append("Marketing Mix")
    if "gdp" in prompt_lower or "national income" in prompt_lower:
        topics.append("National Income Accounting")
    # Leave blank rather than fabricate a topic — the frontend already
    # treats an empty topics list as "nothing confidently extracted" and
    # lets the teacher add their own (see smart-creation-box.tsx).

    # Extract grade — school class or college year. Left blank ("") rather
    # than defaulted to an unrelated grade when nothing matches: the
    # frontend treats "" the same as a missing value and prompts the
    # teacher to pick one explicitly instead of silently running with a
    # guess (the same "don't assume anything" rule the smart-creation-box
    # UI already enforces for the real Gemini parsing path — this heuristic
    # fallback was the one place still violating it).
    grade = ""
    college_years = {
        "1st year": "College 1st Year", "first year": "College 1st Year",
        "2nd year": "College 2nd Year", "second year": "College 2nd Year",
        "3rd year": "College 3rd Year", "third year": "College 3rd Year",
        "4th year": "College 4th Year", "fourth year": "College 4th Year",
        "5th year": "College 5th Year", "fifth year": "College 5th Year",
        "final year": "College Final Year",
    }
    matched_college_year = next((v for k, v in college_years.items() if k in prompt_lower), None)
    if matched_college_year:
        grade = matched_college_year
    else:
        for g in ["class 8", "class 9", "class 10", "class 11", "class 12"]:
            if g in prompt_lower:
                grade = g.title()

    # Extract subject — same "leave blank, don't guess" rule as grade above.
    subject = ""
    if "biology" in prompt_lower:
        subject = "Biology"
    elif "physics" in prompt_lower:
        subject = "Physics"
    elif "economics" in prompt_lower:
        subject = "Economics"
    elif "marketing" in prompt_lower:
        subject = "Marketing"
    elif "finance" in prompt_lower or "accounting" in prompt_lower or "accountancy" in prompt_lower:
        subject = "Accounting & Finance"
    elif "business" in prompt_lower or "management" in prompt_lower or "strategy" in prompt_lower:
        subject = "Business Studies"

    # Extract marks
    marks = None
    if "80-mark" in prompt_lower or "80 mark" in prompt_lower:
        marks = 80
    elif "40-mark" in prompt_lower or "40 mark" in prompt_lower:
        marks = 40
    elif "20-mark" in prompt_lower or "20 mark" in prompt_lower:
        marks = 20

    # Extract requested artifacts
    artifacts = []
    if "slide" in prompt_lower:
        artifacts.append("slides")
    if "worksheet" in prompt_lower:
        artifacts.append("worksheet")
    if "quiz" in prompt_lower:
        artifacts.append("quiz")
    if "test" in prompt_lower or "paper" in prompt_lower:
        artifacts.append("assessment")
    if "video" in prompt_lower:
        artifacts.append("video")
    if not artifacts:
        artifacts = ["course_plan", "lesson_plan", "slides", "worksheet", "quiz"]

    return StructuredIntent(
        task_type="classroom_pack",
        grade=grade,
        subject=subject,
        topics=topics,
        marks=marks,
        difficulty="hard" if "hard" in prompt_lower or "difficult" in prompt_lower else "medium",
        application_weight=0.7 if "application" in prompt_lower else 0.5,
        requested_artifacts=artifacts,
    )

