"""Classroom Artifact Generation Engine (§13) — Slides, Worksheets, Lesson Notes."""
from typing import Dict, Any, List


def generate_slides(topic: str, slide_count: int = 12) -> Dict[str, Any]:
    return {
        "artifact_type": "slides",
        "title": f"Presentation on {topic}",
        "slide_count": slide_count,
        "slides": [
            {"slide_number": 1, "title": "Hook & Introduction", "body": "Key hook question for the class."},
            {"slide_number": 2, "title": f"What is {topic}?", "body": "Core definition and simple analogy."},
        ],
    }


def generate_worksheet(topic: str, question_count: int = 10) -> Dict[str, Any]:
    return {
        "artifact_type": "worksheet",
        "title": f"Worksheet — {topic}",
        "instructions": "Answer all practice problems. Show working where required.",
        "question_count": question_count,
    }

