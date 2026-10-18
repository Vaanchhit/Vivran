"""Finding a material's structure — chapters, units, headings — with rules, not a model.

Ingestion used to store ``chapter`` and ``topic`` as NULL for every chunk, so
"Unit 4" could only ever be matched by how similar a passage sounded. These
rules label each extracted unit (a PDF page, a slide, a document section) with
the chapter it sits in and the heading it falls under, carrying the last chapter
seen forward until the next one starts.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

_CHAPTER = re.compile(
    r"^\s*(chapter|unit|module|lesson|section|part)\s*[-–:.]?\s*(\d{1,2}|[ivx]{1,4})\b[\s:.\-–]*(.{0,80})$",
    re.IGNORECASE,
)
# "4.2 Price elasticity of demand", "3) Types of costs": a numbered heading, short, no sentence punctuation.
_NUMBERED = re.compile(r"^\s*(\d{1,2}(?:\.\d{1,2})?)[.)]?\s+([A-Z][^.!?;:]{3,70})$")
_HEAD_LINES = 8


def _chapter_label(match: re.Match) -> str:
    kind, num, rest = match.group(1).title(), match.group(2).upper(), match.group(3).strip(" :.-–")
    return f"{kind} {num}" + (f" · {rest}" if rest else "")


def label_units(units: List[Dict[str, Any]], *, titles_are_topics: bool = False) -> List[Dict[str, Any]]:
    """Adds ``chapter`` and ``topic`` to each unit where they can be found.

    ``titles_are_topics`` is for slides, whose first line is a title rather
    than running text.
    """
    chapter = None
    out: List[Dict[str, Any]] = []
    for unit in units:
        lines = [ln.strip() for ln in (unit.get("text") or "").splitlines() if ln.strip()]
        topic = None
        for ln in lines[:_HEAD_LINES]:
            m = _CHAPTER.match(ln)
            if m and len(ln) <= 100:
                chapter = _chapter_label(m)
                continue
            n = _NUMBERED.match(ln)
            if n and topic is None:
                topic = n.group(2).strip()
        if topic is None and titles_are_topics and lines and len(lines[0]) <= 90:
            topic = lines[0]
        labelled = dict(unit)
        if chapter:
            labelled["chapter"] = chapter
        if topic:
            labelled["topic"] = topic
        out.append(labelled)
    return out


def merge_small_units(units: List[Dict[str, Any]], min_words: int = 120, max_words: int = 380) -> List[Dict[str, Any]]:
    """Joins neighbouring short units (slides) into one passage of useful size.

    A slide is a title and three bullets: embedded alone it has almost no
    context to be found by. Neighbours under the same chapter are merged until
    the passage reaches ``min_words``; the first unit's page number and labels
    are kept so the citation still points at where it starts.
    """
    merged: List[Dict[str, Any]] = []
    current: Dict[str, Any] | None = None
    for unit in units:
        words = len((unit.get("text") or "").split())
        if current is None:
            current = dict(unit)
            continue
        cur_words = len(current["text"].split())
        same_chapter = current.get("chapter") == unit.get("chapter")
        if cur_words < min_words and same_chapter and cur_words + words <= max_words:
            current["text"] = current["text"] + "\n\n" + (unit.get("text") or "")
        else:
            merged.append(current)
            current = dict(unit)
    if current is not None:
        merged.append(current)
    return merged
