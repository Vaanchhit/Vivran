"""Lesson plans -> the order of their phases ("Objectives, Warm-up, Explanation, Activity, Recap")."""
from __future__ import annotations

import re
from typing import Any, Dict, List

# Phase name -> the headings teachers use for it. A heading is a short line
# that starts with one of these, so body text mentioning "activity" isn't one.
_PHASES = [
    ("objectives", r"(?:learning\s+)?(?:objectives?|outcomes?|aims?|goals?)"),
    ("prior_knowledge", r"(?:previous|prior)\s+knowledge|prerequisites?"),
    ("warm_up", r"warm[- ]?up|starter|hook|engage|motivation|ice[- ]?breaker"),
    ("introduction", r"introduction|intro"),
    ("explanation", r"explanation|presentation|teaching|instruction|development|explore|explain"),
    ("example", r"(?:worked\s+)?examples?|demonstration|illustration"),
    ("activity", r"activit(?:y|ies)|practice|group\s+work|pair\s+work|task|exercise|elaborate"),
    ("discussion", r"discussion|questioning|q\s*&\s*a"),
    ("assessment", r"assessment|evaluation|evaluate|check\s+for\s+understanding|exit\s+ticket|quiz"),
    ("recap", r"recap|summary|conclusion|plenary|closure|wrap[- ]?up|review"),
    ("homework", r"home\s?work|assignment|follow[- ]?up|extension"),
]
_HEADING = [(name, re.compile(rf"^\s*(?:\d+[.)]\s*)?(?:{pat})\b[^.?!]{{0,40}}:?\s*$", re.IGNORECASE)) for name, pat in _PHASES]
_DURATION = re.compile(r"\b(\d{1,3})\s*(?:min|mins|minutes)\b", re.IGNORECASE)


def parse_lesson_plan(lines: List[str]) -> Dict[str, Any]:
    phases: List[str] = []
    for line in lines:
        if len(line) > 60:
            continue
        for name, pattern in _HEADING:
            if pattern.match(line):
                if not phases or phases[-1] != name:
                    phases.append(name)
                break
    durations = [int(m.group(1)) for ln in lines[:15] for m in _DURATION.finditer(ln)]
    return {
        "kind": "lesson_plan",
        "phases": phases,
        "duration_minutes": max(durations) if durations else None,
        "usable": len(phases) >= 3,
    }
