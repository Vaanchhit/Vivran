"""Structured Pydantic Schemas (§26) for AI generation outputs."""
from typing import List, Optional
from pydantic import BaseModel, Field


class QuestionSchema(BaseModel):
    question_number: int
    section: Optional[str] = "Section A"
    question_type: str = Field(..., description="mcq, true_false, short_answer, long_answer, numerical")
    question_text: str
    marks: int
    difficulty: str = "medium"
    bloom_level: Optional[str] = "apply"
    options: Optional[List[str]] = None
    answer: str
    solution: Optional[str] = None
    source_ids: Optional[List[str]] = []


class SectionSchema(BaseModel):
    name: str
    instructions: Optional[str] = None
    questions: List[QuestionSchema]


class AssessmentSchema(BaseModel):
    title: str
    subject: str
    grade: str
    total_marks: int
    duration_minutes: int
    sections: List[SectionSchema]


class SlideSchema(BaseModel):
    slide_number: int
    title: str
    bullet_points: List[str]
    speaker_notes: Optional[str] = None
    media_suggestion: Optional[str] = None


class CourseBlockSchema(BaseModel):
    type: str  # text, explanation, image, video, audio, question, quiz, activity, scenario, recap
    position: int
    content: dict

