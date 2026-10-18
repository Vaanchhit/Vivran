"""Intuitive examples: explain a hard idea with something a student already knows.

A teacher types "FCFE" (or "opportunity cost", or "Le Chatelier's principle")
and gets a short, checkable explanation:

  concept card   the idea in one plain line, its key terms, the formula if any;
                 written from the teacher's own materials when they have them,
                 so the definition matches their textbook
  analogy        a story from daily life told WITHOUT the jargon, and a mapping
                 that ties every key term to one thing in the story
  worked example friendly numbers whose arithmetic is done by code (safe_math.py):
                 the model names the inputs and writes each step as an
                 expression; it never states a result
  where it breaks  where the analogy stops being true: half of what makes an
                 analogy safe to teach with
  check          two questions that test understanding, with answers

Two model calls, in this order, because they fail differently and are re-rolled
differently: the concept card is stable (one call, kept), the analogy is the part
a teacher asks to try again ("a different setting"), and re-rolling it costs one
call, not two.

Everything the model is asked for is also CHECKED: every key term mapped, no key
term in the story, plain-length sentences, numbers that compute, a stated limit.
A failed check is fed back once; what still fails is reported, not hidden.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from app.ai.cheap_model import generate_cheap_cloud
from app.ai.prompt_snippets import LEVEL_INSTRUCTION
from app.core.config import settings
from app.core.errors import FailureClass, mask
from app.core.logging import logger
from app.generation.loop import run_validated
from app.generation.safe_math import run_steps
from app.retrieval.context import format_sources, resolve_tags, sources_payload, tag_map
from app.retrieval.search import search_many

SETTINGS_HINT = (
    "a tea stall (chai tapri), a cricket match, a school canteen, a train journey, a family kitchen, "
    "a local kirana shop, a village weekly market, a mobile data plan, a pocket-money budget, a bus ticket counter"
)

MAX_STORY_WORDS = 110
MAX_AVG_SENTENCE_WORDS = 22

_CARD_SYSTEM = """You are Vivran's concept extraction engine for school teachers and college professors.
Define ONE concept precisely for the stated grade. Return JSON only:
{"concept": string, "one_line": string (the idea in plain words, at most 35 words),
 "key_terms": [{"term": string, "meaning": string (at most 20 words)}] (3 to 6 terms: the technical words a student must connect),
 "formula": string or null (as written in the teacher's materials when given),
 "prerequisites": string[] (at most 3 ideas a student should already know),
 "source_ids": string[] (tags of the provided passages the definition follows, [] if none)}
When source passages are provided the definition and formula MUST follow them, not your own memory. Never invent a tag.
""" + LEVEL_INSTRUCTION

_ANALOGY_SYSTEM = """You are a master teacher who makes hard ideas obvious with ONE everyday analogy that maps cleanly.
Return JSON only:
{"setting": string,
 "story": string (at most 90 words, plain everyday words a 12-year-old uses, told as a short scene),
 "mapping": [{"term": string (EXACTLY one of the key terms), "in_story": string (what it is in the story, at most 15 words)}],
 "worked_example": null | {"title": string,
    "inputs": [{"name": lower_snake_case, "label": string, "value": number, "unit": string}] (2 to 6),
    "steps": [{"name": lower_snake_case, "label": string, "expr": string}] (1 to 6, arithmetic over input and earlier step names only),
    "explain": string (at most 40 words, what the final number means in the story)},
 "where_it_breaks": string[] (1 to 3 honest places the analogy stops being true),
 "common_mistake": string (the misunderstanding students most often have),
 "check": [{"q": string, "a": string}] (exactly 2 questions that test understanding, not recall)}
Rules:
- The setting is something students already live: never another school subject.
- The story must NOT contain any of the key terms. Tell it in everyday words.
- The mapping is one-to-one and faithful: what grows or shrinks what in the story must match the concept.
- You NEVER state a calculated result. Give inputs and write each step as an expression; the results are computed for you.
- Use friendly numbers. Use null for worked_example when the concept is not quantitative.
"""


def _words(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def _sentences(text: str) -> List[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", (text or "").strip()) if s]


def _has_term(text: str, term: str) -> bool:
    return bool(re.search(rf"(?<![\w]){re.escape(term.strip())}(?![\w])", text or "", re.IGNORECASE))


# ---------------------------------------------------------------------------
# Stage A: the concept card
# ---------------------------------------------------------------------------

def card_errors(card: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    if not str(card.get("concept", "")).strip():
        errors.append("Name the concept.")
    if not str(card.get("one_line", "")).strip():
        errors.append("Give the idea in one plain line.")
    elif _words(card["one_line"]) > 45:
        errors.append("The one-line idea is too long; at most 35 words.")
    terms = card.get("key_terms")
    if not isinstance(terms, list) or not 2 <= len(terms) <= 7:
        errors.append("List between 3 and 6 key terms.")
    else:
        seen = set()
        for i, t in enumerate(terms, start=1):
            if not isinstance(t, dict) or not str(t.get("term", "")).strip() or not str(t.get("meaning", "")).strip():
                errors.append(f"Key term {i} needs both a term and a meaning.")
                continue
            if t["term"].strip().lower() in seen:
                errors.append(f"Key term '{t['term']}' is listed twice.")
            seen.add(t["term"].strip().lower())
    return errors


def _call(prompt: str, system: str, label: str) -> Dict[str, Any]:
    result = generate_cheap_cloud(prompt, task="intuitive_example", system_prompt=system, json_mode=True)
    if not result.get("success"):
        return {"error": mask(result.get("failure") or FailureClass.UPSTREAM_ERROR, context=label, detail=str(result.get("error", "")))}
    try:
        data = json.loads(result["content"])
    except ValueError as e:
        return {"error": mask(FailureClass.UPSTREAM_ERROR, context=label, detail=f"invalid JSON: {e}")}
    if not isinstance(data, dict):
        return {"error": mask(FailureClass.UPSTREAM_ERROR, context=label, detail="not an object")}
    return data


def build_card(
    concept: str,
    grade: Optional[str],
    subject: Optional[str],
    context: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], List[str], Any]:
    lines = [f"Concept: {concept}"]
    if grade:
        lines.append(f"Grade: {grade}")
    if subject:
        lines.append(f"Subject: {subject}")
    if context:
        lines.append("\nThe teacher's own materials. Follow them. Cite tags in source_ids:")
        lines.extend(format_sources(context, concept, total_chars=3500))
    prompt = "\n".join(lines)
    card, errors, meta = run_validated(lambda fb: _call(prompt + fb, _CARD_SYSTEM, "intuitive example"), card_errors, label="example_card")
    if card.get("error"):
        return card, errors, meta
    real, invented = resolve_tags(card.get("source_ids"), tag_map(context))
    card["source_ids"] = real
    card["key_terms"] = [{"term": str(t["term"]).strip(), "meaning": str(t["meaning"]).strip()} for t in card.get("key_terms", []) if isinstance(t, dict) and t.get("term")]
    return card, errors, meta


# ---------------------------------------------------------------------------
# Stage B: the analogy
# ---------------------------------------------------------------------------

def analogy_errors(data: Dict[str, Any], card: Dict[str, Any], avoid: List[str]) -> List[str]:
    """Every rule an analogy must meet to be safe to teach with. Also computes the worked example."""
    errors: List[str] = []
    terms = [t["term"] for t in card.get("key_terms", [])]

    setting = str(data.get("setting", "")).strip()
    if not setting:
        errors.append("Name the everyday setting.")
    elif any(a.lower() in setting.lower() or setting.lower() in a.lower() for a in avoid if a):
        errors.append(f"Pick a different setting from: {', '.join(avoid)}.")

    story = str(data.get("story", "")).strip()
    if not story:
        errors.append("Tell the story.")
    else:
        if _words(story) > MAX_STORY_WORDS:
            errors.append(f"The story is {_words(story)} words; keep it under 90.")
        sents = _sentences(story)
        if sents and _words(story) / len(sents) > MAX_AVG_SENTENCE_WORDS:
            errors.append("The sentences are too long; use short, plain sentences.")
        used = [t for t in terms if _has_term(story, t)]
        if used:
            errors.append(f"The story uses the technical term(s) {', '.join(repr(t) for t in used)}. Tell it in everyday words only.")

    mapping = data.get("mapping")
    if not isinstance(mapping, list):
        errors.append("Give a mapping from each key term to something in the story.")
    else:
        mapped = {str(m.get("term", "")).strip().lower(): m for m in mapping if isinstance(m, dict)}
        missing = [t for t in terms if t.lower() not in mapped]
        if missing:
            errors.append(f"The mapping is missing: {', '.join(missing)}.")
        for term, m in mapped.items():
            if not str(m.get("in_story", "")).strip():
                errors.append(f"The mapping for '{term}' says nothing about the story.")
            elif _words(str(m["in_story"])) > 25:
                errors.append(f"The mapping for '{term}' is too long; at most 15 words.")

    breaks = data.get("where_it_breaks")
    if not isinstance(breaks, list) or not [b for b in breaks if str(b).strip()]:
        errors.append("Say where the analogy stops being true.")

    check = data.get("check")
    if not isinstance(check, list) or len(check) != 2 or any(not str(c.get("q", "")).strip() or not str(c.get("a", "")).strip() for c in check if isinstance(c, dict)):
        errors.append("Give exactly two check questions, each with an answer.")

    worked = data.get("worked_example")
    if worked:
        if not isinstance(worked, dict):
            errors.append("The worked example must be an object or null.")
        else:
            inputs, steps = worked.get("inputs") or [], worked.get("steps") or []
            if not 2 <= len(inputs) <= 6:
                errors.append("The worked example needs 2 to 6 inputs.")
            if not 1 <= len(steps) <= 6:
                errors.append("The worked example needs 1 to 6 steps.")
            if inputs and steps:
                computed, problems = run_steps(inputs, steps)
                errors.extend(problems)
                if not problems:
                    worked["_computed"] = computed
    return errors


def build_analogy(
    card: Dict[str, Any],
    grade: Optional[str],
    setting: Optional[str],
    avoid: List[str],
    language: Optional[str],
    style_lines: List[str],
) -> Tuple[Dict[str, Any], List[str], Any]:
    lines = [
        f"Concept: {card['concept']}",
        f"In plain words: {card['one_line']}",
        "Key terms (each must be mapped): " + "; ".join(f"{t['term']} = {t['meaning']}" for t in card["key_terms"]),
    ]
    if card.get("formula"):
        lines.append(f"Formula: {card['formula']}")
    if grade:
        lines.append(f"Students: {grade}")
    lines.append(f"Setting: {setting}" if setting and setting.lower() != "auto" else f"Pick a setting students know well, for example {SETTINGS_HINT}.")
    if avoid:
        lines.append("Do NOT use these settings: " + ", ".join(avoid))
    if language and language.lower() != "english":
        lines.append(f"Write the story, mapping, questions and answers in {language}; keep the JSON keys in English.")
    lines.extend(style_lines)
    prompt = "\n".join(lines)
    data, errors, meta = run_validated(
        lambda fb: _call(prompt + fb, _ANALOGY_SYSTEM, "intuitive example"),
        lambda d: analogy_errors(d, card, avoid),
        label="example_analogy",
    )
    return data, errors, meta


def _finish_worked(worked: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """The worked example as shown: inputs, and each step with the value CODE computed."""
    if not worked or "_computed" not in worked:
        return None
    steps = worked["_computed"]
    final = steps[-1]
    return {
        "title": str(worked.get("title", "")).strip(),
        "inputs": [{"name": i["name"], "label": str(i.get("label", i["name"])), "value": float(i["value"]), "unit": str(i.get("unit", ""))} for i in worked["inputs"]],
        "steps": [{"name": s["name"], "label": str(s.get("label", s["name"])), "expr": s["expr"], "value": s["value"]} for s in steps],
        "result": {"name": final["name"], "label": str(final.get("label", final["name"])), "value": final["value"]},
        "explain": str(worked.get("explain", "")).strip(),
    }


def generate_example(
    concept: str,
    grade: Optional[str] = None,
    subject: Optional[str] = None,
    setting: Optional[str] = None,
    avoid_settings: Optional[List[str]] = None,
    workspace_id: Optional[str] = None,
    material_id: Optional[str] = None,
    language: Optional[str] = None,
    card: Optional[Dict[str, Any]] = None,
    style_lines: Optional[List[str]] = None,
) -> Dict[str, Any]:
    concept = concept.strip()
    avoid = [a for a in (avoid_settings or []) if a][:6]
    warnings: List[str] = []
    meta: Dict[str, Any] = {}

    # Re-rolling an analogy reuses the card the teacher already saw: the
    # definition stays put, and only the part they asked to change is paid for.
    context: List[Dict[str, Any]] = []
    if card is None:
        if workspace_id:
            try:
                queries = [concept] + ([f"{subject} {concept}"] if subject else [])
                context = search_many(queries, workspace_id, material_id=material_id, limit=5)
            except Exception as e:  # noqa: BLE001
                logger.warning("Retrieval for an intuitive example failed (continuing ungrounded): %s", e)
        card, card_errors_left, card_meta = build_card(concept, grade, subject, context)
        meta["card"] = card_meta.public()
        if card.get("error"):
            return {"artifact_type": "example", "title": f"Intuitive example: {concept}", "error": card["error"]}
        warnings.extend(card_errors_left)
        if card_errors_left:
            return {"artifact_type": "example", "title": f"Intuitive example: {concept}", "concept": card,
                    "error": "Vivran couldn't pin down the key terms of that concept. Try naming it more fully, for example the full name and subject."}
    else:
        card = {**card, "key_terms": [{"term": str(t["term"]), "meaning": str(t["meaning"])} for t in card.get("key_terms", [])]}
        if card_errors(card):
            return {"artifact_type": "example", "title": f"Intuitive example: {concept}", "error": "That concept card is not valid. Start again."}

    data, errors, a_meta = build_analogy(card, grade, setting, avoid, language, style_lines or [])
    meta["analogy"] = a_meta.public()
    if data.get("error"):
        return {"artifact_type": "example", "title": f"Intuitive example: {concept}", "concept": card, "error": data["error"], "generation": meta}

    worked = _finish_worked(data.get("worked_example"))
    if data.get("worked_example") and worked is None:
        warnings.append("The worked example's numbers could not be checked, so it was left out.")
    if errors:
        # What still fails after the retry is shown to the teacher, not hidden.
        warnings.extend(e for e in errors if not e.startswith(("Step ", "Input ", "The worked example")))

    meaning = {t["term"].lower(): t["meaning"] for t in card["key_terms"]}
    mapping = [
        {"term": str(m.get("term", "")).strip(), "meaning": meaning.get(str(m.get("term", "")).strip().lower(), ""), "in_story": str(m.get("in_story", "")).strip()}
        for m in (data.get("mapping") or []) if isinstance(m, dict)
    ]
    return {
        "artifact_type": "example",
        "title": f"Intuitive example: {card['concept']}",
        "concept": card,
        "analogy": {
            "setting": str(data.get("setting", "")).strip(),
            "story": str(data.get("story", "")).strip(),
            "mapping": mapping,
            "worked_example": worked,
            "where_it_breaks": [str(b).strip() for b in (data.get("where_it_breaks") or []) if str(b).strip()],
            "common_mistake": str(data.get("common_mistake", "")).strip(),
            "check": [{"q": str(c.get("q", "")).strip(), "a": str(c.get("a", "")).strip()} for c in (data.get("check") or []) if isinstance(c, dict)],
        },
        "grounded_on": len(context),
        "sources": sources_payload(context),
        "guardrail_warnings": warnings,
        "generation": meta,
        "visual_options": {"napkin": bool(settings.napkin_api_key)},
    }
