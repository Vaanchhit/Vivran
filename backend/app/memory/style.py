"""A teacher's accepted traits -> how a new paper is shaped.

Style decides FORM: the paper's sections and marks (in code, exactly, like
the default blueprint), the balance of thinking it asks for, its command
words, how long it runs. It never supplies facts. The prompt says so in as
many words, and nothing from the teacher's past papers is sent: no questions,
no excerpts, only the numbers and words below.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from app.memory.traits import LEVEL_WORDS

Blueprint = List[Tuple[str, str, int, int]]

_SCHEMA_TYPES = {"mcq", "true_false", "short_answer", "long_answer", "numerical"}
MAX_QUESTIONS = 60


def _schema_type(qtype: str, marks: int) -> str:
    if qtype in _SCHEMA_TYPES:
        return qtype
    return "short_answer" if marks <= 3 else "long_answer"


def blueprint_from_structure(total_marks: int, sections: List[Dict[str, Any]]) -> Optional[Blueprint]:
    """The teacher's paper shape, scaled to ``total_marks`` with the arithmetic exact.

    Each section keeps its marks per question and roughly its share of the
    paper; counts are rounded, then nudged until the total is exact. When no
    nudge gets there (a 37-mark paper from a shape of 2s and 5s, say) this
    returns None and the caller falls back to the default blueprint, rather
    than bending the teacher's shape into one they didn't use.
    """
    if not sections or any(not s.get("marks_each") for s in sections):
        return None
    eaches = [int(s["marks_each"]) for s in sections]
    counts = [max(1, round(float(s.get("share", 0)) * total_marks / e)) for s, e in zip(sections, eaches)]

    def gap() -> int:
        return total_marks - sum(c * e for c, e in zip(counts, eaches))

    # Smallest marks-per-question first: they make the finest adjustments.
    order = sorted(range(len(sections)), key=lambda i: eaches[i])
    for _ in range(4 * len(sections) + 40):
        g = gap()
        if g == 0:
            break
        fixed = False
        for i in order:
            if g % eaches[i] == 0 and counts[i] + g // eaches[i] >= 1:
                counts[i] += g // eaches[i]
                fixed = True
                break
        if fixed:
            continue
        # No single section closes it: move the largest section one step
        # towards the target and try again.
        i = order[-1]
        step = 1 if g > 0 else -1
        if counts[i] + step < 1:
            return None
        counts[i] += step
    if gap() != 0 or sum(counts) > MAX_QUESTIONS:
        return None

    plan: Blueprint = []
    for n, (s, count, each) in enumerate(zip(sections, counts, eaches)):
        plan.append((f"Section {chr(ord('A') + n)}", _schema_type(s["type"], each), count, each))
    return plan


def case_sections(sections: List[Dict[str, Any]]) -> List[int]:
    return [i for i, s in enumerate(sections) if s.get("case_based")]


def prompt_lines(style: Dict[str, Dict[str, Any]], total_marks: int) -> List[str]:
    """Lines for the prompt. Empty when nothing is active."""
    lines: List[str] = []
    mix = (style.get("level_mix") or {}).get("value")
    if mix:
        parts = [f"{LEVEL_WORDS[lvl]} ~{int(round(share * 100))}%" for lvl, share in mix.items() if share >= 0.05]
        lines.append(f"- Balance of thinking, by share of marks: {', '.join(parts)}.")
    case = (style.get("case_based") or {}).get("value")
    if case:
        lines.append(
            f"- About {int(round(case['share'] * 100))}% of marks should be case-based: a short scenario or data set "
            "built ONLY from the source excerpts or the topic, followed by questions on it."
        )
    verbs = (style.get("command_verbs") or {}).get("value")
    if verbs:
        lines.append(f"- Prefer these command words where they fit the question: {', '.join(verbs['verbs'])}.")
    timing = (style.get("timing") or {}).get("value")
    if timing:
        minutes = int(round(timing["minutes_per_mark"] * total_marks / 5) * 5)
        lines.append(f"- Set duration_minutes to {minutes}.")
    if not lines:
        return []
    return [
        "\nThe teacher's own style, learned from their past papers. It governs FORMAT and PHRASING only;",
        "it is never a source of facts. Every fact must come from the excerpts above or the topic itself.",
        *lines,
    ]


def applied(style: Dict[str, Dict[str, Any]], used_structure: bool) -> List[Dict[str, str]]:
    """What the teacher is told shaped this paper."""
    out = []
    for key in ("structure", "level_mix", "case_based", "command_verbs", "timing"):
        if key not in style or (key == "structure" and not used_structure):
            continue
        out.append({"key": key, "summary": style[key]["summary"]})
    return out
