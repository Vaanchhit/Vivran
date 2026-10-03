"""Keeping student work and student identities out of teaching memory.

Two rules, both from the terms the teacher agrees to:

1. Work a student submitted is refused outright. The signal is a FILLED-IN
   identity field (a name or roll number written next to "Name:") together
   with something only a marked or answered script has: marks awarded, an
   examiner's remark, or an answer-sheet heading. A blank paper with
   "Name: ________" at the top is the teacher's own template and passes.
2. Anything kept is redacted: the value after a student identity label is
   replaced, wherever it appears. Only short excerpts are kept at all (see
   store.py), so this applies to those.

Rule-based by design, so it can be wrong in both directions. That is why the
upload also asks the teacher to confirm there is no student work in it, and
why the terms call this a safeguard, not a guarantee.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

_ID_LABEL = (
    r"(?:student'?s?\s+name|name\s+of\s+(?:the\s+)?(?:student|candidate)|candidate'?s?\s+name|name|"
    r"roll\s*(?:no\.?|number)|admission\s*(?:no\.?|number)|enrol?l?ment\s*(?:no\.?|number)|"
    r"registration\s*(?:no\.?|number)|reg\.?\s*no\.?|scholar\s*no\.?)"
)

# Label, separator, then a value that is real content: letters or digits, not
# the underscores/dots/dashes of a blank template.
_FILLED_ID = re.compile(
    rf"\b{_ID_LABEL}\s*[:\-–]\s*(?P<value>(?![_.\-–\s]*$)[A-Za-z0-9][A-Za-z0-9 .'/-]{{1,40}}?)(?=\s{{2,}}|\s*[,;|]|\s+(?:class|section|roll|date|subject|sec)\b|$)",
    re.IGNORECASE,
)

_MARKED_OR_ANSWERED = re.compile(
    r"\b(?:marks?\s+(?:obtained|awarded|scored|secured)|score\s*[:\-]\s*\d|"
    r"total\s+marks?\s+obtained|examiner'?s?\s+(?:remarks?|signature)|remarks?\s*[:\-]\s*\w{3,}|"
    r"checked\s+by\s*[:\-]?\s*\w{2,}|answer\s+(?:sheet|script|booklet)|grade\s+awarded)\b",
    re.IGNORECASE,
)

# What a teacher's own documents call themselves near the top. A teacher
# writing "Name: Mrs. Sharma" on her own lesson plan is not a student.
_TEACHER_HEADER = re.compile(r"\b(?:teacher|faculty|prepared\s+by|subject\s+teacher|professor|instructor)\b", re.IGNORECASE)

REDACTED = "[redacted]"


@dataclass
class SafetyResult:
    is_student_work: bool
    reason: Optional[str] = None


def check_student_work(lines: List[str]) -> SafetyResult:
    head = lines[:40]  # identity fields live at the top of a script
    filled = [ln for ln in head if _FILLED_ID.search(ln) and not _TEACHER_HEADER.search(ln)]
    if not filled:
        return SafetyResult(False)
    if any(_MARKED_OR_ANSWERED.search(ln) for ln in lines):
        return SafetyResult(
            True,
            "This looks like work a student submitted (a filled-in name or roll number with marks or "
            "remarks on it). Vivran doesn't keep student work. Upload the blank paper or the answer key instead.",
        )
    return SafetyResult(False)


def redact(text: str) -> str:
    """Replace the value of every student identity field in ``text``."""
    def _sub(m: re.Match) -> str:
        whole = m.group(0)
        start, end = m.start("value") - m.start(), m.end("value") - m.start()
        return whole[:start] + REDACTED + whole[end:]

    return _FILLED_ID.sub(_sub, text)
