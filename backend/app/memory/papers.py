"""Exam papers and worksheets -> a structure fingerprint.

The parse checks itself: when every question's marks are found and they add
up to the paper's stated maximum, the reading is right. When they don't, the
paper is kept but marked ``reconciled: False`` and its structure is not used,
so a misread paper can't teach Vivran a structure the teacher never wrote.

What it reads, all by pattern:
  header     maximum marks, time allowed, "attempt any"
  sections   "Section A", "Part II", with "each question carries 2 marks"
             or "10 x 1 = 10" setting a default for the section
  questions  numbered in sequence (1, 2, 3 ...; numbering may restart at a
             new section), each with its following lines as its block
  marks      "[3]", "(5 marks)", "4 marks", a trailing number, or the
             section default; sub-parts are summed, and an internal "OR"
             counts once
  type       MCQ (three or more lettered options), true/false, fill in the
             blank, numerical, else short/long by marks
  verb       the command word and its Bloom level (verbs.py)
  case-based the question or its section refers to a case, passage, extract,
             source or given data
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.memory.safety import redact
from app.memory.verbs import command_verb

EXCERPT_CHARS = 200

# Counted for the thinking-level mix, but not reported as "command verbs":
# nobody describes their style as "starts questions with what".
_QUESTION_WORDS = {"what", "which", "who", "when", "where", "why", "how"}
_FRAMING_VERBS = {"using", "use", "given", "consider"}

_TOTAL_MARKS = [
    re.compile(r"\b(?:max(?:imum)?\.?|full|total)\s*marks?\s*[:\-–=]?\s*(\d{1,3})\b", re.IGNORECASE),
    re.compile(r"\bM\.?\s?M\.?\s*[:\-–=]\s*(\d{1,3})\b"),
    re.compile(r"\bmarks?\s*[:\-–=]\s*(\d{2,3})\b", re.IGNORECASE),
]
_DURATION = re.compile(
    r"\b(?:time(?:\s+allowed|\s+allotted)?|duration)\s*[:\-–=]?\s*"
    r"(\d+(?:\.\d+)?|one|two|three|half)\s*(hours?|hrs?\.?|h\b|minutes?|mins?\.?)",
    re.IGNORECASE,
)
_WORD_NUM = {"one": 1.0, "two": 2.0, "three": 3.0, "half": 0.5}
_ATTEMPT_ANY = re.compile(r"\battempt\s+any\b|\banswer\s+any\b", re.IGNORECASE)

_SECTION = re.compile(r"^\s*(section|part)\s*[-–:]?\s*([A-Z]|[IVX]{1,4}|\d{1,2})\b[\s:.\-–]*(.*)$", re.IGNORECASE)
_SECTION_EACH = [
    re.compile(r"\beach\s+(?:question\s+)?(?:carries|carry|is\s+of|of|for)\s+(\d{1,2})\s*marks?\b", re.IGNORECASE),
    re.compile(r"\b(\d{1,2})\s*marks?\s+each\b", re.IGNORECASE),
    re.compile(r"\b\d{1,2}\s*[x×*]\s*(\d{1,2})\s*=\s*\d{1,3}\b"),
]

_QUESTION = re.compile(r"^\s*(?:Q(?:ue(?:stion)?|n)?\s*\.?\s*(?:no\.?\s*)?)?(\d{1,2})\s*[.):]\s*(.*)$", re.IGNORECASE)
_QUESTION_Q_ONLY = re.compile(r"^\s*Q\.?\s*(\d{1,2})\b\s*(.*)$", re.IGNORECASE)

_MARKS_BRACKET = re.compile(r"[\[(]\s*(\d{1,2})\s*(?:marks?|mks?|m)?\s*[\])]\s*$", re.IGNORECASE)
_MARKS_WORD = re.compile(r"\b(\d{1,2})\s*(?:marks?|mks)\b", re.IGNORECASE)
_MARKS_TRAILING = re.compile(r"\s(\d{1,2})\s*$")
_OR_LINE = re.compile(r"^\s*\(?\s*or\s*\)?\s*$", re.IGNORECASE)

_OPTION = re.compile(r"(?:^|\s)\(?([a-dA-D])[).]\s+\S")
_TRUE_FALSE = re.compile(r"\btrue\s+or\s+false\b|\bT\s*/\s*F\b|\(true/false\)", re.IGNORECASE)
_FILL_BLANK = re.compile(r"_{3,}|\bfill\s+in\s+the\s+blanks?\b", re.IGNORECASE)
_NUMERICAL_VERBS = {"calculate", "compute", "solve", "find", "determine", "estimate", "prepare", "journalise", "journalize"}
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
_CASE = re.compile(
    r"\b(?:case(?:\s+study)?|passage|extract|source|excerpt|scenario|"
    r"(?:data|table|information|graph|figure)\s+(?:given|below|above)|read\s+the\s+following|following\s+(?:case|passage|data|information))\b",
    re.IGNORECASE,
)
_ANSWER_KEY = re.compile(r"\banswer\s*key\b|\bmarking\s+scheme\b|\bsolutions?\b|^\s*answers?\s*[:\-]?\s*$", re.IGNORECASE | re.MULTILINE)


@dataclass
class Question:
    number: int
    section: str
    marks: Optional[int]
    qtype: str
    verb: Optional[str]
    level: Optional[str]
    case_based: bool
    internal_choice: bool
    excerpt: str


@dataclass
class _Section:
    name: str
    default_marks: Optional[int] = None
    case_based: bool = False


@dataclass
class PaperFingerprint:
    kind: str
    total_marks: Optional[int]
    duration_minutes: Optional[int]
    attempt_any: bool
    reconciled: bool
    marks_found: int
    questions: List[Question] = field(default_factory=list)
    has_answer_key: bool = False
    note: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Everything traits.py reads, precomputed, plus the questions as evidence."""
        d = asdict(self)
        mix, coverage = level_mix(self.questions)
        marks_total = sum(q.marks or 1 for q in self.questions) or 1
        d.update(
            question_count=len(self.questions),
            structure=structure(self.questions) if self.reconciled else [],
            level_mix=mix,
            level_coverage=coverage,
            case_share=round(sum(q.marks or 1 for q in self.questions if q.case_based) / marks_total, 4),
            verbs=[q.verb for q in self.questions if q.verb and q.verb not in _QUESTION_WORDS and q.verb not in _FRAMING_VERBS],
        )
        return d


def _first(patterns: List[re.Pattern], text: str) -> Optional[int]:
    for p in patterns:
        m = p.search(text)
        if m:
            return int(m.group(1))
    return None


def _header_lines(lines: List[str]) -> str:
    """Top-of-paper lines that state totals without a label, e.g. "12 · Economics · 40 Marks · 90 Minutes".

    Only lines carrying the word "marks" and no question number, so "[2 marks]"
    after a question or "5 marks each" in a section never reads as the total.
    """
    out = []
    for ln in lines[:12]:
        if re.search(r"\bmarks\b", ln, re.IGNORECASE) and not _question_start(ln) and "[" not in ln and "each" not in ln.lower():
            out.append(ln)
    return "\n".join(out)


_UNLABELLED_TOTAL = re.compile(r"(?<![\d(\[])\b(\d{2,3})\s*marks\b", re.IGNORECASE)
_UNLABELLED_DURATION = re.compile(r"\b(\d+(?:\.\d+)?)\s*(hours?|hrs?\.?|minutes|mins?\.?)\b", re.IGNORECASE)


def _duration_minutes(text: str) -> Optional[int]:
    m = _DURATION.search(text.replace("½", ".5"))
    if not m:
        return None
    raw, unit = m.group(1).lower(), m.group(2).lower()
    value = _WORD_NUM.get(raw)
    if value is None:
        try:
            value = float(raw)
        except ValueError:
            return None
    minutes = value * 60 if unit.startswith("h") else value
    return int(round(minutes)) if 5 <= minutes <= 300 else None


def _question_start(line: str) -> Optional[Tuple[int, str]]:
    m = _QUESTION.match(line) or _QUESTION_Q_ONLY.match(line)
    if not m:
        return None
    return int(m.group(1)), m.group(2).strip()


def _block_marks(block: List[str], section_default: Optional[int], allow_trailing: bool) -> Tuple[Optional[int], bool]:
    """Marks for one question block, and whether it has an internal choice."""
    choice_at = next((i for i, ln in enumerate(block) if _OR_LINE.match(ln)), None)
    counted = block if choice_at is None else block[:choice_at]
    bracketed = [int(m.group(1)) for ln in counted if (m := _MARKS_BRACKET.search(ln))]
    if bracketed:
        return sum(bracketed), choice_at is not None
    worded = [int(m.group(1)) for ln in counted for m in _MARKS_WORD.finditer(ln)]
    if worded:
        return (worded[0] if len(worded) == 1 else sum(worded)), choice_at is not None
    if allow_trailing and counted and len(counted[0]) > 25:
        m = _MARKS_TRAILING.search(counted[0])
        if m and 1 <= int(m.group(1)) <= 20:
            return int(m.group(1)), choice_at is not None
    return section_default, choice_at is not None


def _qtype(text: str, marks: Optional[int], verb: Optional[str]) -> str:
    if len({m.group(1).lower() for m in _OPTION.finditer(text)}) >= 3:
        return "mcq"
    if _TRUE_FALSE.search(text):
        return "true_false"
    if _FILL_BLANK.search(text):
        return "fill_blank"
    if verb in _NUMERICAL_VERBS and len(_NUMBER.findall(text)) >= 2:
        return "numerical"
    if marks is None:
        return "unknown"
    return "short_answer" if marks <= 3 else "long_answer"


def parse_paper(lines: List[str], kind: str = "exam_paper") -> PaperFingerprint:
    head = "\n".join(lines[:30])
    total = _first(_TOTAL_MARKS, head)
    duration = _duration_minutes(head)
    if total is None or duration is None:
        unlabelled = _header_lines(lines)
        if total is None:
            total = _first([_UNLABELLED_TOTAL], unlabelled)
        if duration is None:
            m = _UNLABELLED_DURATION.search(unlabelled.replace("½", ".5"))
            if m:
                value, unit = float(m.group(1)), m.group(2).lower()
                minutes = value * 60 if unit.startswith("h") else value
                duration = int(round(minutes)) if 5 <= minutes <= 300 else None
    attempt_any = bool(_ATTEMPT_ANY.search("\n".join(lines)))

    section = _Section("")
    raw: List[Tuple[int, _Section, List[str]]] = []  # (number, section, block lines)
    expected = 1
    section_changed = False

    for line in lines:
        sec = _SECTION.match(line)
        if sec and len(line) < 120:
            section = _Section(f"{sec.group(1).title()} {sec.group(2).upper()}")
            rest = sec.group(3)
            section.default_marks = _first(_SECTION_EACH, rest)
            section.case_based = bool(_CASE.search(rest))
            section_changed = True
            continue
        start = _question_start(line)
        if start and (start[0] == expected or (start[0] == 1 and section_changed and raw)):
            number, text = start
            raw.append((number, section, [text] if text else []))
            expected = number + 1
            section_changed = False
            continue
        if raw and raw[-1][1] is section:
            raw[-1][2].append(line)
        else:
            # Instructions between a section heading and its first question.
            if section.default_marks is None:
                section.default_marks = _first(_SECTION_EACH, line)
            if _CASE.search(line):
                section.case_based = True

    questions: List[Question] = []
    for number, sec, block in raw:
        text = " ".join(block)
        marks, choice = _block_marks(block, sec.default_marks, allow_trailing=total is not None)
        verb, level = command_verb(text)
        questions.append(
            Question(
                number=number,
                section=sec.name,
                marks=marks,
                qtype=_qtype(text, marks, verb),
                verb=verb,
                level=level,
                case_based=sec.case_based or bool(_CASE.search(text)),
                internal_choice=choice,
                excerpt=redact(text)[:EXCERPT_CHARS],
            )
        )

    marks_found = sum(1 for q in questions if q.marks is not None)
    summed = sum(q.marks or 0 for q in questions)
    reconciled = bool(questions) and marks_found == len(questions) and total is not None and summed == total and not attempt_any

    note = None
    if kind == "exam_paper" and questions and not reconciled:
        if attempt_any:
            note = "This paper lets students choose questions, so its marks can't be checked against the total."
        elif total is None:
            note = "No maximum marks were found at the top of the paper, so its structure couldn't be checked."
        elif marks_found < len(questions):
            note = f"Marks were found for {marks_found} of {len(questions)} questions."
        else:
            note = f"The marks found add up to {summed}, not the {total} at the top of the paper."

    return PaperFingerprint(
        kind=kind,
        total_marks=total,
        duration_minutes=duration,
        attempt_any=attempt_any,
        reconciled=reconciled,
        marks_found=marks_found,
        questions=questions,
        has_answer_key=bool(_ANSWER_KEY.search("\n".join(lines))),
        note=note,
    )


def structure(questions: List[Question]) -> List[Dict[str, Any]]:
    """Consecutive runs of the same question type and marks: the paper's shape.

    Built from the questions rather than the section headings, because the
    headings vary ("Section A", "Part I", none at all) while the shape is
    what a new paper needs to reproduce.
    """
    # Runs break on objective vs written and on marks, not on finer type: one
    # "calculate" question among 3-mark short answers is still that section,
    # and splitting it would give two papers of the same shape different ones.
    def bucket(qtype: str) -> str:
        return "objective" if qtype in ("mcq", "true_false") else "written"

    groups: List[List[Question]] = []
    for q in questions:
        if groups and bucket(groups[-1][-1].qtype) == bucket(q.qtype) and groups[-1][-1].marks == q.marks:
            groups[-1].append(q)
        else:
            groups.append([q])
    total = sum(q.marks or 0 for q in questions) or 1
    runs: List[Dict[str, Any]] = []
    for g in groups:
        types = Counter("short_answer" if q.qtype == "fill_blank" else q.qtype for q in g)
        runs.append({
            "type": types.most_common(1)[0][0],
            "marks_each": g[0].marks,
            "count": len(g),
            "case_based": any(q.case_based for q in g),
            "share": round(len(g) * (g[0].marks or 0) / total, 4),
        })
    return runs


def level_mix(questions: List[Question]) -> Tuple[Dict[str, float], float]:
    """Share of marks by thinking level, and the share of marks it covers."""
    weights = Counter()
    covered = 0
    total = 0
    for q in questions:
        m = q.marks or 1
        total += m
        if q.level:
            weights[q.level] += m
            covered += m
    if not covered:
        return {}, 0.0
    return {lvl: round(w / covered, 4) for lvl, w in weights.items()}, round(covered / total, 4)
