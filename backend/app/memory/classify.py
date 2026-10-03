"""What kind of document is this? Rules over the first page; the teacher confirms.

Each kind scores the cues it is known by. The winner needs at least two cues,
otherwise the document is "notes": a wrong guess shapes the wrong part of
the profile, while "notes" shapes nothing.
"""
from __future__ import annotations

import re
from typing import Dict, List

KINDS = ("exam_paper", "worksheet", "slides", "lesson_plan", "notes")

KIND_LABELS = {
    "exam_paper": "Exam paper",
    "worksheet": "Worksheet",
    "slides": "Slides",
    "lesson_plan": "Lesson plan",
    "notes": "Notes",
}

_CUES: Dict[str, List[re.Pattern]] = {
    "exam_paper": [
        re.compile(p, re.IGNORECASE)
        for p in (
            r"\b(?:max(?:imum)?\.?|full|total)\s*marks?\b",
            r"\bM\.\s?M\.?\s*[:\-]?\s*\d",
            r"\btime\s*(?:allowed|allotted)?\s*[:\-–]\s*\d",
            r"\b(?:section|part)\s*[-–:]?\s*(?:[A-E]|I{1,3}|IV|V)\b",
            r"\bgeneral\s+instructions\b",
            r"\battempt\s+(?:all|any)\b",
            r"\b(?:examination|exam|test|assessment|question\s+paper|mid[- ]?term|unit\s+test)\b",
            r"[\[(]\s*\d{1,2}\s*(?:marks?|m)\s*[\])]",
        )
    ],
    "worksheet": [
        re.compile(p, re.IGNORECASE)
        for p in (
            r"\bworksheet\b",
            r"\bpractice\s+(?:set|questions?|sheet)\b",
            r"\bassignment\b",
            r"\bhome\s?work\b",
            r"\bexercise\b",
            r"\banswer\s+key\b",
        )
    ],
    "lesson_plan": [
        re.compile(p, re.IGNORECASE)
        for p in (
            r"\blesson\s+plan\b",
            r"\blearning\s+(?:objectives?|outcomes?)\b",
            r"\bteaching\s+(?:aids?|methods?|strategy)\b",
            r"\b(?:procedure|warm[- ]?up|introduction|plenary|homework|assessment\s+for\s+learning)\b",
            r"\bduration\s*[:\-]\s*\d+\s*(?:min|minutes|periods?)\b",
            r"\bprevious\s+knowledge\b",
        )
    ],
}


def classify(file_type: str, lines: List[str]) -> str:
    if file_type == "pptx":
        return "slides"
    head = "\n".join(lines[:60])
    scores = {kind: sum(1 for cue in cues if cue.search(head)) for kind, cues in _CUES.items()}
    kind, best = max(scores.items(), key=lambda kv: kv[1])
    if best < 2:
        return "notes"
    # "Worksheet" in the title beats an exam-style header on a practice sheet.
    if kind == "exam_paper" and re.search(r"\bworksheet\b", head, re.IGNORECASE):
        return "worksheet"
    return kind
