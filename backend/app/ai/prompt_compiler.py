"""Prompt Compiler (§25) — Converts natural language teacher prompts into structured intent."""
from typing import Dict, Any, List
from pydantic import BaseModel


class StructuredIntent(BaseModel):
    task_type: str
    grade: str
    subject: str
    topics: List[str]
    marks: int | None = None
    difficulty: str = "medium"
    application_weight: float = 0.5
    requested_artifacts: List[str] = []


def compile_teacher_prompt(raw_prompt: str) -> StructuredIntent:
    prompt_lower = raw_prompt.lower()
    
    # Extract topics
    topics = []
    if "tissue" in prompt_lower:
        topics.append("Tissues")
    if "food" in prompt_lower:
        topics.append("Improvement in Food Resources")
    if "electricity" in prompt_lower:
        topics.append("Electricity")
    if not topics:
        topics = ["General Topic"]

    # Extract grade
    grade = "Class 10"
    for g in ["class 8", "class 9", "class 10", "class 11", "class 12"]:
        if g in prompt_lower:
            grade = g.title()

    # Extract subject
    subject = "Science"
    if "biology" in prompt_lower:
        subject = "Biology"
    elif "physics" in prompt_lower:
        subject = "Physics"
    elif "economics" in prompt_lower:
        subject = "Economics"

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

