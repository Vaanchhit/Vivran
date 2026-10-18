"""A teacher's habits, derived from what they ask for. Pure functions, no I/O.

Where traits.py reads a teacher's past papers, this reads their requests: the
prompts they type, what they generate, how they change questions. A habit needs
evidence in the numbers: at least three requests, and a clear majority doing the
same thing. It is always stated with those numbers ("6 of 8 recent tests"), so a
teacher can see it is a count, not a guess.

The picture is recomputed after every new request (events.py), and only the
latest RECENT requests of each kind count, so it follows the teacher: if they
start setting 60-mark papers, the 40-mark habit fades and the new one is offered.
Nothing here changes what Vivran does on its own: habits are suggested, the
teacher accepts them, and only accepted ones shape generation (store.py).
"""
from __future__ import annotations

import re
from collections import Counter
from statistics import median
from typing import Any, Dict, List, Optional, Sequence, Tuple

RECENT = 30          # requests of one kind that count
MIN_EVIDENCE = 3     # fewer than this is an incident, not a habit
MIN_SHARE = 0.5      # of those requests, the share that must agree

ARTIFACT_NAMES = {
    "assessment": "tests", "worksheet": "worksheets", "slides": "slide decks", "lesson_notes": "lesson notes",
    "interactive": "class activities", "course_plan": "course plans", "example": "intuitive examples",
}

# Where each habit's number lives in an event's params. The API's own field
# names come first; the UI's are listed too since both report events.
_FIELDS: Dict[str, Dict[str, Tuple[str, ...]]] = {
    "assessment": {"marks": ("total_marks", "marks"), "difficulty": ("difficulty",)},
    "slides": {"slide_count": ("slide_count", "slideCount")},
    "worksheet": {"question_count": ("question_count", "questionCount")},
    "interactive": {"duration_minutes": ("duration_minutes", "durationMinutes")},
    "course_plan": {"duration_weeks": ("duration_weeks", "durationWeeks")},
    "example": {"setting": ("setting",)},
}
_UNITS = {"marks": "marks", "slide_count": "slides", "question_count": "questions", "duration_minutes": "minutes", "duration_weeks": "weeks"}

# Things teachers say about the shape of a question. A fixed list on purpose:
# frequent words in prompts are mostly topics ("demand", "supply"), which say
# nothing about how this teacher likes to teach.
ANGLES = [
    ("application", r"\bapplication\b|\bapplied\b|\bapply\b"),
    ("case study", r"\bcase[- ]?stud(?:y|ies)\b|\bcase[- ]based\b"),
    ("real-life examples", r"\breal[- ]?(?:life|world)\b|\beveryday\b"),
    ("conceptual", r"\bconceptual\b|\bconcept\b"),
    ("numerical", r"\bnumericals?\b|\bcalculation\b|\bsums?\b"),
    ("scenario", r"\bscenarios?\b"),
    ("diagram", r"\bdiagrams?\b|\bgraphs?\b"),
    ("exam style", r"\bexam[- ]?style\b|\bboard[- ]?style\b|\bpast[- ]paper\b"),
    ("revision", r"\brevision\b|\brevise\b"),
    ("higher-order thinking", r"\bhots\b|\bhigher[- ]order\b|\bcritical thinking\b|\banalytical\b"),
]


def _first(params: Dict[str, Any], names: Sequence[str]) -> Any:
    for n in names:
        if params.get(n) not in (None, ""):
            return params[n]
    return None


def _mode(values: Sequence[Any]) -> Optional[Tuple[Any, int, int]]:
    """(most common value, how many, out of how many), when it is a habit."""
    vals = [v for v in values if v is not None]
    if len(vals) < MIN_EVIDENCE:
        return None
    value, n = Counter(vals).most_common(1)[0]
    return (value, n, len(vals)) if n >= MIN_EVIDENCE and n / len(vals) >= MIN_SHARE else None


def _trait(key: str, subject: str, value: Dict[str, Any], summary: str, n: int, total: int) -> Dict[str, Any]:
    return {"kind": "profile", "key": key, "subject": subject, "value": value, "summary": summary,
            "n_evidence": n, "n_documents": total, "evidence": []}


def _latest(events: Sequence[Dict[str, Any]], kind: str, artifact: Optional[str] = None) -> List[Dict[str, Any]]:
    """The newest RECENT events of a kind (events arrive newest first)."""
    picked = [e for e in events if e.get("kind") == kind and (artifact is None or e.get("artifact") == artifact)]
    return picked[:RECENT]


def _plan_habit(gens: Sequence[Dict[str, Any]], subject: str) -> Optional[Dict[str, Any]]:
    plans = [(e.get("params") or {}).get("question_plan") for e in gens]
    plans = [p for p in plans if isinstance(p, list) and p]
    if len(plans) < MIN_EVIDENCE:
        return None
    used: Counter = Counter()
    counts: Dict[str, List[int]] = {}
    marks: Dict[str, List[int]] = {}
    for p in plans:
        for item in p:
            t = item.get("type")
            if not t:
                continue
            used[t] += 1
            counts.setdefault(t, []).append(int(item.get("count") or 0))
            marks.setdefault(t, []).append(int(item.get("marks_each") or 1))
    common = [t for t, n in used.items() if n / len(plans) >= 0.6]
    if not common:
        return None
    plan = [{"type": t, "count": int(round(median(counts[t]))), "marks_each": int(round(median(marks[t])))} for t in common]
    label = ", ".join(f"{p['count']} {p['type'].replace('_', ' ')} × {p['marks_each']}" for p in plan)
    return _trait("assessment.question_plan", subject, {"artifact": "assessment", "question_plan": plan},
                  f"Your tests usually include {label} ({len(plans)} recent tests built from question types).", len(plans), len(plans))


def derive_profile_traits(events: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """All habits visible in these events (newest first)."""
    traits: List[Dict[str, Any]] = []

    # Who they usually teach: grade and subject, over requests of every kind.
    pairs = [(e.get("grade"), e.get("subject")) for e in events if e.get("kind") in ("generate", "prompt")][: RECENT * 2]
    pairs = [(g, s) for g, s in pairs if g and s]
    top = _mode(pairs)
    if top:
        (grade, subject), n, total = top
        traits.append(_trait("usual_class", "", {"grade": grade, "subject": subject},
                             f"You mostly make things for {grade}, {subject.title()} ({n} of your last {total} requests).", n, total))

    # Per kind of thing and subject: the numbers they keep choosing.
    by_kind: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for artifact in _FIELDS:
        for e in _latest(events, "generate", artifact):
            by_kind.setdefault((artifact, e.get("subject") or ""), []).append(e)
    for (artifact, subject), gens in by_kind.items():
        where = f" in {subject.title()}" if subject else ""
        for field, names in _FIELDS[artifact].items():
            habit = _mode([_first(e.get("params") or {}, names) for e in gens])
            if not habit:
                continue
            value, n, total = habit
            what = ARTIFACT_NAMES[artifact]
            if field == "difficulty":
                summary = f"Your {what}{where} are usually {str(value).lower()} difficulty ({n} of {total} recent ones)."
            elif field == "setting":
                summary = f"You usually pick {value} as the setting for intuitive examples{where} ({n} of {total} recent ones)."
            else:
                summary = f"Your {what}{where} are usually {value} {_UNITS[field]} ({n} of {total} recent ones)."
            traits.append(_trait(f"{artifact}.{field}", subject, {"artifact": artifact, field: value}, summary, n, total))
        if artifact == "assessment":
            habit_plan = _plan_habit(gens, subject)
            if habit_plan:
                traits.append(habit_plan)

    # Language, across everything they generate.
    langs = [(e.get("params") or {}).get("language") for e in _latest(events, "generate")]
    habit = _mode([l for l in langs if l])
    if habit and str(habit[0]).lower() != "english":
        value, n, total = habit
        traits.append(_trait("language", "", {"language": value}, f"You usually ask for content in {value} ({n} of {total} recent requests that named a language).", n, total))

    # The angle of their prompts.
    prompts = [e.get("prompt_text") or "" for e in _latest(events, "prompt")]
    if len(prompts) >= 5:
        hits = [(name, sum(1 for p in prompts if re.search(rx, p, re.IGNORECASE))) for name, rx in ANGLES]
        common = [(name, c) for name, c in hits if c >= MIN_EVIDENCE and c / len(prompts) >= 0.25]
        if common:
            common.sort(key=lambda x: -x[1])
            names = [n for n, _ in common[:3]]
            top_n = common[0][1]
            traits.append(_trait("angles", "", {"terms": names},
                                 f"In your requests you often ask for: {', '.join(names)} ({common[0][0]} comes up in {top_n} of your last {len(prompts)} prompts).",
                                 top_n, len(prompts)))

    # How they like questions changed.
    regens = [(e.get("params") or {}).get("option") for e in _latest(events, "regenerate")]
    habit = _mode(regens)
    if habit and len(regens) >= 4:
        option, n, total = habit
        traits.append(_trait("regen_bias", "", {"option": option},
                             f"When you change a question you usually ask for it to be {option} ({n} of your last {total} changes).", n, total))
    return traits


def usual_setup(rows: Sequence[Dict[str, Any]], artifact: str) -> Optional[Dict[str, Any]]:
    """One suggested starting point for a form, from the stored profile traits.

    ``rows`` are style_traits rows (kind "profile"). Dismissed ones are ignored.
    Returns {"label", "fields", "status"} or None. ``status`` is "active" when the
    teacher accepted every habit used, else "suggested". A chip is only ever
    APPLIED by the teacher clicking it; this never fills a form by itself.
    """
    live = [r for r in rows if r.get("kind") == "profile" and r.get("status") in ("active", "suggested")]
    fields: Dict[str, Any] = {}
    parts: List[str] = []
    used: List[Dict[str, Any]] = []

    cls = next((r for r in live if r["key"] == "usual_class"), None)
    subject = ""
    if cls:
        fields.update(grade=cls["value"]["grade"], subject=cls["value"]["subject"].title() if cls["value"]["subject"] else "")
        parts += [cls["value"]["grade"], cls["value"]["subject"].title()]
        subject = cls["value"]["subject"]
        used.append(cls)

    for r in live:
        if not r["key"].startswith(f"{artifact}.") or (r.get("subject") or "") not in ("", subject):
            continue
        v = dict(r["value"])
        v.pop("artifact", None)
        for k, val in v.items():
            fields[k] = val
            if k == "question_plan":
                parts.append(f"{sum(p['count'] for p in val)} questions by type")
            elif k == "difficulty":
                parts.append(str(val).title())
            elif k in _UNITS:
                parts.append(f"{val} {_UNITS[k]}")
            elif k == "setting":
                parts.append(str(val))
        used.append(r)

    lang = next((r for r in live if r["key"] == "language"), None)
    if lang:
        fields["language"] = lang["value"]["language"]
        parts.append(lang["value"]["language"])
        used.append(lang)

    # A grade and subject alone isn't worth a chip.
    if len([k for k in fields if k not in ("grade", "subject")]) == 0 and not (cls and artifact):
        return None
    if not fields:
        return None
    return {
        "label": " · ".join(p for p in parts if p),
        "fields": fields,
        "status": "active" if used and all(r["status"] == "active" for r in used) else "suggested",
    }


def prompt_lines(traits: Dict[str, Dict[str, Any]]) -> List[str]:
    """Lines for a generation prompt, from ACCEPTED habits only. Emphasis, never facts."""
    lines: List[str] = []
    angles = (traits.get("angles") or {}).get("value")
    if angles:
        lines.append(f"- This teacher's requests often ask for: {', '.join(angles['terms'])}. Lean that way where it fits the topic.")
    bias = (traits.get("regen_bias") or {}).get("value")
    if bias:
        lines.append(f"- When this teacher changes a question they usually ask for it to be {bias['option']}; write the first draft that way.")
    if not lines:
        return []
    return [
        "\nThis teacher's habits, learned from their own requests. They shape emphasis and phrasing only,",
        "never the facts, which come only from the source passages or the topic itself:",
        *lines,
    ]
