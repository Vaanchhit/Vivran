"""Slide decks -> fingerprint: length, density, how they open and close."""
from __future__ import annotations

import re
from statistics import median
from typing import Any, Dict, List

from app.memory.text import Slide

_OBJECTIVES = re.compile(r"\b(?:objectives?|learning\s+outcomes?|today\s+we\s+will|by\s+the\s+end|agenda|what\s+we.ll\s+learn)\b", re.IGNORECASE)
_RECAP = re.compile(r"\b(?:recap|summary|summari[sz]e|key\s+(?:takeaways?|points)|review|conclusion|wrap[- ]?up|remember)\b", re.IGNORECASE)
_CHECK = re.compile(r"\?\s*$|\b(?:quiz|check\s+your\s+understanding|think|discuss|question\s+time|exit\s+ticket|try\s+this)\b", re.IGNORECASE)
_EXAMPLE = re.compile(r"\b(?:example|e\.g\.|for\s+instance|case|illustration|real[- ]life)\b", re.IGNORECASE)


def parse_deck(slides: List[Slide]) -> Dict[str, Any]:
    content = [s for s in slides if s.title or s.body]
    if not content:
        return {"kind": "slides", "slide_count": 0, "usable": False}
    words = [sum(len(b.split()) for b in s.body) for s in content]
    bullets = [len(s.body) for s in content]
    first = content[: min(3, len(content))]
    last = content[-min(3, len(content)):]
    return {
        "kind": "slides",
        "slide_count": len(content),
        "words_per_slide": round(median(words), 1),
        "bullets_per_slide": round(median(bullets), 1),
        "opens_with_objectives": any(_OBJECTIVES.search(s.title + " " + " ".join(s.body[:2])) for s in first),
        "ends_with_recap": any(_RECAP.search(s.title) for s in last),
        "check_slides": sum(1 for s in content if _CHECK.search(s.title)),
        "example_slides": sum(1 for s in content if _EXAMPLE.search(s.title)),
        "speaker_notes_share": round(sum(1 for s in content if len(s.notes.split()) >= 5) / len(content), 3),
        "usable": len(content) >= 3,
    }
