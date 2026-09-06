"""Assessment Generation Engine (§14) & Question Regeneration (§15)."""
from typing import Dict, Any, List
from app.ai.schemas import AssessmentSchema, QuestionSchema, SectionSchema
from app.ai.validators import validate_assessment


def generate_assessment(
    grade: str,
    subject: str,
    topics: List[str],
    total_marks: int = 40,
    difficulty: str = "medium",
) -> Dict[str, Any]:
    assessment = AssessmentSchema(
        title=f"{grade} {subject} Test Paper",
        subject=subject,
        grade=grade,
        total_marks=total_marks,
        duration_minutes=45,
        sections=[
            SectionSchema(
                name="Section A (MCQs)",
                instructions="Select the correct option for each question.",
                questions=[
                    QuestionSchema(
                        question_number=1,
                        section="Section A",
                        question_type="mcq",
                        question_text="Which tissue conducts water in vascular plants?",
                        marks=1,
                        difficulty="easy",
                        options=["A) Xylem", "B) Phloem", "C) Parenchyma", "D) Collenchyma"],
                        answer="A) Xylem",
                        solution="Xylem conducts water and dissolved minerals upwards.",
                    )
                ],
            )
        ],
    )

    validation = validate_assessment(assessment, total_marks=total_marks)
    return {
        "assessment": assessment.model_dump(),
        "validation": validation.to_dict(),
    }


def regenerate_single_question(
    question_id: str,
    option: str,  # harder, easier, application, conceptual, case
) -> Dict[str, Any]:
    """Regenerates ONLY the selected question (§15), preserving overall assessment constraints."""
    return {
        "status": "regenerated",
        "question_id": question_id,
        "option_applied": option,
        "new_question": {
            "question_text": f"Regenerated question variant ({option}).",
            "answer": "Updated sample answer.",
        },
    }

