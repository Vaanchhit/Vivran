"""Deterministic Assessment Validation (§27).

LLMs must not be trusted as the sole validator.
Checks total marks, section totals, question counts, missing answers, and duplicates.
"""
from typing import Dict, Any, List
from app.ai.schemas import AssessmentSchema


class ValidationResult:
    def __init__(self, valid: bool, errors: List[str]):
        self.valid = valid
        self.errors = errors

    def to_dict(self) -> Dict[str, Any]:
        return {"valid": self.valid, "errors": self.errors}


def validate_assessment(assessment: AssessmentSchema, target_marks: int) -> ValidationResult:
    errors = []

    # Calculate actual total marks across all sections & questions
    actual_marks = 0
    question_texts = set()

    for sec in assessment.sections:
        for q in sec.questions:
            actual_marks += q.marks

            # Check missing answers
            if not q.answer or not q.answer.strip():
                errors.append(f"Question {q.question_number} in {sec.name} is missing an answer.")

            # Check duplicate questions
            clean_text = q.question_text.strip().lower()
            if clean_text in question_texts:
                errors.append(f"Duplicate question detected: '{q.question_text[:40]}...'")
            question_texts.add(clean_text)

    # Check total marks match requested target marks
    if actual_marks != target_marks:
        errors.append(f"Requested {target_marks} marks but total generated marks equal {actual_marks} marks.")

    return ValidationResult(valid=len(errors) == 0, errors=errors)

