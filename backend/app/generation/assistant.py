"""Ask Vivran: a small guide that answers from the help entries and takes teachers where they need to go.

Cheap and unable to make things up, by construction:

  * It is shown at most five help entries the browser already matched, trimmed;
    its instructions are to answer ONLY from them. No retrieval, no tools.
  * It can point at pages only by ROUTE ID from the fixed table below. The ids it
    returns are looked up here and turned into links by us, so a made-up page is
    impossible: an unknown id is dropped.
  * It can offer to open a page with a request pre-typed, but never submits it:
    the teacher presses the button on that page.
  * The answer, steps, follow-ups and action list are length-capped after the
    fact, whatever the model wrote.

About 700 input tokens and 150 output per question on Groq's gpt-oss-120b with a
Gemini fallback (generate_planner), so a question costs a fraction of a paisa.
When it fails or the teacher is over their daily allowance the page falls back to
the local keyword search, which needs no server at all.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.ai.cheap_model import generate_planner
from app.core.errors import FailureClass, mask

# id -> (label, href, what it is for, accepts a pre-typed request)
ROUTES: Dict[str, tuple] = {
    "home": ("Home", "/teacher", "ask for anything in your own words; shortcuts to everything", True),
    "plan": ("Plan", "/teacher/plan", "make a course plan, week by week", True),
    "teach": ("Teach", "/teacher/create", "notes, slides, activities, narration, images, video, intuitive examples", False),
    "slides": ("Slides", "/teacher/create?type=slides", "make a slide deck (outline first)", True),
    "lesson_notes": ("Lesson notes", "/teacher/create?type=lesson_notes", "make notes to teach from", True),
    "activities": ("Class activities", "/teacher/create?type=interactive", "make a lesson as steps and activities", True),
    "narration": ("Narration", "/teacher/create?type=narration", "turn a script into spoken audio", False),
    "image": ("Image", "/teacher/create?type=image", "make a diagram or picture", False),
    "video": ("Video", "/teacher/create?type=video", "make a short explainer clip", False),
    "example": ("Explain simply", "/teacher/create?type=example", "explain a hard idea with an everyday example", True),
    "assess": ("Assess", "/teacher/assess", "quizzes, tests and worksheets", False),
    "quiz": ("Quiz", "/teacher/assess?mode=quiz", "make a short quiz", True),
    "test": ("Test", "/teacher/assess?mode=test", "make a full test paper", True),
    "worksheet": ("Worksheet", "/teacher/assess?mode=worksheet", "make practice questions with answers", True),
    "materials": ("My materials", "/teacher/materials", "upload your books, notes and slides", False),
    "memory": ("Teaching memory", "/teacher/memory", "papers you add, habits Vivran noticed, recent requests", False),
    "library": ("Library", "/teacher/library", "everything you have made, to reopen, rename or delete", False),
    "settings": ("Settings", "/teacher/settings", "subjects, grades, language, difficulty, delete account", False),
    "help": ("Help", "/teacher/help", "guides and answers", False),
}

MAX_ANSWER = 520
MAX_STEP = 150
MAX_STEPS = 5
MAX_ACTIONS = 3
MAX_FOLLOWUPS = 3
MAX_PROMPT = 220

_SYSTEM = """You are Vivran's guide, helping a teacher find their way around the Vivran app.
Answer ONLY from the HELP entries given. If they do not cover the question, say you are not sure and set needs_human true.
Never invent features, buttons, prices or promises. Be brief and concrete, in plain words.
Return JSON only:
{"answer": string (at most 60 words),
 "steps": string[] (0 to 5 short steps, only when the teacher needs to DO something),
 "actions": [{"label": string, "route_id": string (exactly one id from ROUTES), "prompt": string or null}] (0 to 3),
 "followups": string[] (up to 3 short questions they might ask next),
 "needs_human": boolean}
Use "prompt" only to pre-type a request on a page marked (type) in ROUTES, taken from what the teacher asked; never invent topics."""


def _routes_block() -> str:
    return "\n".join(f"{rid} = {label}: {what}{' (type)' if typable else ''}" for rid, (label, _href, what, typable) in ROUTES.items())


def _entry_block(entries: List[Dict[str, Any]]) -> str:
    out = []
    for e in entries[:5]:
        steps = "; ".join(str(s) for s in (e.get("steps") or [])[:5])
        points = "; ".join(str(p) for p in (e.get("points") or [])[:3])
        out.append(f"- Q: {str(e.get('q', ''))[:100]}\n  A: {str(e.get('a', ''))[:200]}" + (f"\n  Steps: {steps[:300]}" if steps else "") + (f"\n  Notes: {points[:150]}" if points else ""))
    return "\n".join(out) if out else "(none matched)"


def build_prompt(message: str, page: str, history: List[Dict[str, str]], entries: List[Dict[str, Any]]) -> str:
    lines = [f"ROUTES:\n{_routes_block()}", f"\nHELP:\n{_entry_block(entries)}", f"\nThe teacher is on: {page[:60] or 'unknown'}"]
    if history:
        lines.append("\nRecent conversation:")
        lines += [f"{'Teacher' if h.get('role') == 'user' else 'Guide'}: {str(h.get('text', ''))[:160]}" for h in history[-3:]]
    lines.append(f"\nTeacher's question: {message[:400]}")
    return "\n".join(lines)


def clean(raw: Any) -> Dict[str, Any]:
    """Whatever the model wrote, as a reply that is safe to show: capped, links resolved by us."""
    data = raw if isinstance(raw, dict) else {}
    answer = " ".join(str(data.get("answer", "")).split())[:MAX_ANSWER].strip()
    steps = [" ".join(str(s).split())[:MAX_STEP] for s in (data.get("steps") or []) if str(s).strip()][:MAX_STEPS]
    followups = [" ".join(str(f).split())[:90] for f in (data.get("followups") or []) if str(f).strip()][:MAX_FOLLOWUPS]
    actions: List[Dict[str, Any]] = []
    for a in data.get("actions") or []:
        rid = a.get("route_id") if isinstance(a, dict) else None
        if rid not in ROUTES or any(x["route_id"] == rid for x in actions):
            continue          # an id we never issued is dropped, never guessed at
        label, href, _what, typable = ROUTES[rid]
        prompt = " ".join(str(a.get("prompt") or "").split())[:MAX_PROMPT] or None
        actions.append({
            "route_id": rid,
            "label": " ".join(str(a.get("label") or label).split())[:40] or label,
            "href": href,
            "prompt": prompt if typable else None,
        })
        if len(actions) >= MAX_ACTIONS:
            break
    return {
        "answer": answer,
        "steps": steps if answer else [],
        "actions": actions,
        "followups": followups,
        "needs_human": bool(data.get("needs_human")) or not answer,
    }


def ask(message: str, page: str, history: List[Dict[str, str]], entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    result = generate_planner(build_prompt(message, page, history, entries), system_prompt=_SYSTEM, task="assistant")
    if not result.get("success"):
        failure = result.get("failure") or FailureClass.UPSTREAM_ERROR
        return {"error": mask(failure, context="the assistant", detail=str(result.get("error", "")))}
    try:
        raw = json.loads(result["content"])
    except ValueError:
        return {"error": mask(FailureClass.UPSTREAM_ERROR, context="the assistant", detail="invalid JSON")}
    reply = clean(raw)
    reply["usage"] = result.get("usage")
    return reply
