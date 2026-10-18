"""Query-side helpers for retrieval: words, text-search queries, unit references.

Pure functions, no I/O.
"""
from __future__ import annotations

import re
from typing import List, Optional

_WORD = re.compile(r"[a-z0-9]+")

_STOP = frozenset(
    "the and for with from that this these those into about what which when where who whom whose how why are was were "
    "been being have has had does did can could should would will shall may might must not but you your our their its "
    "any all some each every other than then them they she him her his out off over under again once only own same "
    "too very just also more most such both few here there above below between through during before after while "
    "using use make made create generate give show tell want need please class grade subject topic topics chapter unit".split()
)

_ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5, "vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10}
_UNIT = re.compile(r"\b(?:unit|chapter|ch|lesson|module)\.?\s*[-–:]?\s*(\d{1,2}|[ivx]{1,4})\b", re.IGNORECASE)


def terms(text: str, min_len: int = 3) -> List[str]:
    """Distinct meaningful words, in first-seen order (acronyms like "fcfe" survive)."""
    seen: List[str] = []
    for w in _WORD.findall((text or "").lower()):
        if len(w) >= min_len and w not in _STOP and not w.isdigit() and w not in seen:
            seen.append(w)
    return seen


def to_tsquery(text: str, max_terms: int = 10) -> Optional[str]:
    """An OR'd, prefix-matching Postgres tsquery from plain words, or None.

    Only [a-z0-9] ever reaches the database, so no operator or quote in what a
    teacher typed can change the query's meaning.
    """
    words = terms(text)[:max_terms]
    return " | ".join(f"{w}:*" for w in words) if words else None


def unit_number(text: str) -> Optional[int]:
    """The unit/chapter number a piece of text names ("Unit 4", "chapter IV"), or None."""
    m = _UNIT.search(text or "")
    if not m:
        return None
    raw = m.group(1).lower()
    if raw.isdigit():
        return int(raw)
    return _ROMAN.get(raw)
