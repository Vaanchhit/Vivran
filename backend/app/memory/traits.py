"""Fingerprints -> traits: what a teacher's papers have in common.

Pure functions, no I/O. A trait needs at least two files behind it (one file
is a document, not a habit) and, where it describes a choice, for most of the
files considered to agree. Every trait carries the files it came from, and its
summary says how many of how many.

Only exam papers produce traits for now, because paper generation is the one
place that uses them. Slides, worksheets and lesson plans are read and their
fingerprints kept, so traits for them can be added without asking teachers to
upload again.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from statistics import median
from typing import Any, Dict, List, Optional, Tuple

MIN_DOCUMENTS = 2
MIN_AGREEMENT = 0.6
MIN_QUESTIONS_FOR_MIX = 5
MIN_LEVEL_COVERAGE = 0.5

TYPE_WORDS = {
    "mcq": "multiple-choice",
    "true_false": "true/false",
    "short_answer": "short-answer",
    "long_answer": "long-answer",
    "numerical": "numerical",
    "unknown": "other",
}
LEVEL_WORDS = {"recall": "recalling facts", "understand": "explaining", "apply": "applying", "higher": "analysing or evaluating"}


def _pct(x: float) -> str:
    return f"{int(round(x * 100))}%"


def _evidence(docs: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    return [{"document_id": str(d["id"]), "title": d.get("title") or "Untitled"} for d in docs]


def _trait(kind: str, key: str, value: Any, summary: str, agreeing: List[Dict[str, Any]], considered: int) -> Dict[str, Any]:
    return {
        "kind": kind,
        "key": key,
        "value": value,
        "summary": summary,
        "n_evidence": len(agreeing),
        "n_documents": considered,
        "evidence": _evidence(agreeing),
    }


def _of(n: int, total: int, noun: str = "papers") -> str:
    return f"{n} of {total} {noun}" if n != total else f"all {total} {noun}"


def _structure_trait(papers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    usable = [p for p in papers if p["fingerprint"].get("reconciled") and p["fingerprint"].get("structure")]
    if len(usable) < MIN_DOCUMENTS:
        return None
    groups: Dict[Tuple, List[Dict[str, Any]]] = defaultdict(list)
    for p in usable:
        sig = tuple((r["type"], r["marks_each"]) for r in p["fingerprint"]["structure"])
        groups[sig].append(p)
    sig, members = max(groups.items(), key=lambda kv: len(kv[1]))
    if len(members) < MIN_DOCUMENTS or len(members) / len(usable) < MIN_AGREEMENT:
        return None
    sections = []
    for i, (qtype, marks_each) in enumerate(sig):
        runs = [m["fingerprint"]["structure"][i] for m in members]
        sections.append({
            "type": qtype,
            "marks_each": marks_each,
            "share": round(sum(r["share"] for r in runs) / len(runs), 4),
            "case_based": any(r.get("case_based") for r in runs),
        })
    parts = [f"{s['marks_each']}-mark {TYPE_WORDS.get(s['type'], s['type'])} (about {_pct(s['share'])} of marks)" for s in sections]
    summary = f"Your papers follow the same shape: {', then '.join(parts)}. Seen in {_of(len(members), len(usable))}."
    return _trait("exam_paper", "structure", {"sections": sections}, summary, members, len(usable))


def _level_trait(papers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    usable = [
        p for p in papers
        if p["fingerprint"].get("question_count", 0) >= MIN_QUESTIONS_FOR_MIX
        and p["fingerprint"].get("level_coverage", 0) >= MIN_LEVEL_COVERAGE
    ]
    if len(usable) < MIN_DOCUMENTS:
        return None
    totals: Counter = Counter()
    for p in usable:
        for level, share in p["fingerprint"]["level_mix"].items():
            totals[level] += share
    mix = {level: round(totals[level] / len(usable), 2) for level in ("recall", "understand", "apply", "higher")}
    ordered = sorted(((lvl, share) for lvl, share in mix.items() if share >= 0.05), key=lambda kv: -kv[1])
    parts = [f"{_pct(share)} to {LEVEL_WORDS[lvl]}" for lvl, share in ordered]
    summary = f"Across {_of(len(usable), len(usable))}, about {', '.join(parts)} (by marks, judged from each question's command word)."
    return _trait("exam_paper", "level_mix", mix, summary, usable, len(usable))


def _case_trait(papers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    usable = [p for p in papers if p["fingerprint"].get("question_count", 0) >= 3]
    if len(usable) < MIN_DOCUMENTS:
        return None
    with_case = [p for p in usable if p["fingerprint"].get("case_share", 0) > 0]
    if len(with_case) < MIN_DOCUMENTS or len(with_case) / len(usable) < MIN_AGREEMENT:
        return None
    share = round(median(p["fingerprint"]["case_share"] for p in with_case), 2)
    summary = f"Your papers include case-based questions (a case, passage or data to work from), about {_pct(share)} of marks. Seen in {_of(len(with_case), len(usable))}."
    return _trait("exam_paper", "case_based", {"share": share}, summary, with_case, len(usable))


def _verbs_trait(papers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    usable = [p for p in papers if p["fingerprint"].get("verbs")]
    if len(usable) < MIN_DOCUMENTS:
        return None
    in_docs: Counter = Counter()
    uses: Counter = Counter()
    for p in usable:
        verbs = p["fingerprint"]["verbs"]
        uses.update(verbs)
        in_docs.update(set(verbs))
    shared = [v for v, _ in uses.most_common() if in_docs[v] >= MIN_DOCUMENTS][:6]
    if len(shared) < 3:
        return None
    summary = f"Your questions most often start with: {', '.join(shared)}. Each appears in at least two of your papers."
    return _trait("exam_paper", "command_verbs", {"verbs": shared}, summary, usable, len(usable))


def _timing_trait(papers: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    usable = [p for p in papers if p["fingerprint"].get("total_marks") and p["fingerprint"].get("duration_minutes")]
    if len(usable) < MIN_DOCUMENTS:
        return None
    per_mark = round(median(p["fingerprint"]["duration_minutes"] / p["fingerprint"]["total_marks"] for p in usable), 2)
    example = round(per_mark * 40 / 5) * 5
    summary = f"You allow about {per_mark:g} minutes per mark (around {example} minutes for a 40-mark paper). Seen in {_of(len(usable), len(usable))}."
    return _trait("exam_paper", "timing", {"minutes_per_mark": per_mark}, summary, usable, len(usable))


def derive_traits(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """All traits for one workspace, each scoped to a subject.

    ``documents`` are history_documents rows. Rejected files never count, and
    nor do files the teacher said aren't their own work.
    """
    by_subject: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for d in documents:
        if d.get("status") == "rejected" or not d.get("authored_by_me", True):
            continue
        if d.get("kind") == "exam_paper":
            by_subject[d.get("subject") or ""].append(d)

    traits: List[Dict[str, Any]] = []
    for subject, papers in by_subject.items():
        for build in (_structure_trait, _level_trait, _case_trait, _verbs_trait, _timing_trait):
            t = build(papers)
            if t:
                traits.append({**t, "subject": subject})
    return traits
