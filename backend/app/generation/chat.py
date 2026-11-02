"""The chat (§ /beta): read a request, route it, answer it in blocks.

Three jobs, each on the intelligence app/ai/task_router.py names for it:

  read_request()   RULES first, the SLM only when no rule matched. Returns the
                   intent, what the request names (topic, two items, class,
                   marks) and, when a detail it cannot do without is missing, a
                   question instead of a guess.
  answer()         The text answers (compare, summarise, ideas, analyse, general,
                   smalltalk) as typed blocks the chat renders: text, bullets, a
                   table, follow-ups. Grounded in the teacher's sources and cited
                   [S1].. like every other generator; a tag the model invented is
                   removed, not shown.
  transform()      The quick actions on an answer. Rewrites on the SLM, anything
                   that adds content on the LLM.
  improve()        "Improve my prompt": the teacher's request with the specifics
                   it was missing, on the SLM, falling back to their own words.

The things Vivran MAKES (slides, papers, worksheets, plans, explanations) are not
here: the chat hands those to the generators that already exist, and only the
route decision comes from this module.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Sequence

from app.ai.cheap_model import generate_llm, generate_slm
from app.ai.prompt_compiler import _compile_teacher_prompt_heuristic
from app.ai.task_router import ACTION_TASK, Intelligence, Route, is_smalltalk, route_for
from app.core.errors import FailureClass
from app.core.logging import logger
from app.retrieval.context import format_sources, resolve_tags, sources_payload, tag_map

INTENTS = ("explain", "summarise", "compare", "slides", "paper", "worksheet", "plan", "notes", "activity",
           "narration", "image", "video", "ideas", "analyse", "general")

LABELS = {
    "explain": "Explanation", "summarise": "Summary", "compare": "Comparison", "slides": "Slides",
    "paper": "Exam paper", "worksheet": "Worksheet", "plan": "Unit plan", "ideas": "Ideas",
    "analyse": "Analysis", "general": "General", "notes": "Lesson notes", "activity": "Class activity",
    "narration": "Narration", "image": "Image", "video": "Video",
}

# The same rules as the chat has always used (frontend lib/slidekit/intent.ts
# reads decks the same way): weighted keywords, highest total wins.
_RULES = [
    ("compare", re.compile(r"\b(compare|comparison|vs\.?|versus|difference between|differences)\b", re.I), 3),
    ("summarise", re.compile(r"\b(summari[sz]e|summary|key points|tl;?dr|gist)\b", re.I), 3),
    ("analyse", re.compile(r"\b(analy[sz]e|analysis|results|marks data|performance|scores)\b", re.I), 3),
    ("paper", re.compile(r"\b(paper|test|exam|quiz|marks|assessment|question paper)\b", re.I), 2),
    ("worksheet", re.compile(r"\b(worksheet|activity sheet|homework)\b", re.I), 3),
    ("slides", re.compile(r"\b(slides?|deck|ppt|powerpoint|presentation)\b", re.I), 3),
    ("plan", re.compile(r"\b(unit plan|lesson plan|scheme of work|week by week|weekly plan|plan a unit|plan (?:a|my|the) (?:unit|course|term|month))\b", re.I), 3),
    # What the old Teach screen made. Weighted to beat "ideas" and "explain",
    # which share their words ("activities", "explain ... in a video").
    ("notes", re.compile(r"\b(lesson notes?|teaching notes?|class notes?|notes (?:on|for|about))\b", re.I), 4),
    ("activity", re.compile(r"\b((?:class|classroom|in-class|group) activit(?:y|ies)|role[- ]?play|interactive (?:lesson|session|activity))\b", re.I), 4),
    ("narration", re.compile(r"\b(narrat\w*|voice[- ]?over|read (?:this|it|the following) (?:out|aloud)|text to speech)\b", re.I), 5),
    ("image", re.compile(r"\b(image|picture|illustration|infographic|drawing|draw|diagram)\b", re.I), 3),
    ("video", re.compile(r"\b(video|clip|animation|animated)\b", re.I), 4),
    ("ideas", re.compile(r"\b(ideas?|brainstorm|activities|engage|hook|fun)\b", re.I), 2),
    ("explain", re.compile(r"\b(explain|what is|what are|why|how does|simply|understand|meaning of|teach me)\b", re.I), 2),
]

_TOPIC = re.compile(
    r"\b(?:on|about|for|explain|of|summari[sz]e|teach)\s+(?:the\s+)?([^?.!\n]{3,60}?)"
    r"(?=\s+(?:for|to|in|with|simply|class|grade|worth|from|using)\b|\s*\d+\s*-?\s*marks?|[?.!,\n]|$)",
    re.I,
)
_NOT_TOPIC = re.compile(r"^(my|this|that|it|me|class|tomorrow|today|next|a|an|them|these|those|students?)\b", re.I)
_ITEMS = (
    re.compile(r"(?:compare|between)\s+(.+?)\s+(?:and|vs\.?|versus|with)\s+(.+?)(?:\s+for\s+(?:class|grade|my)\b.*)?(?:[?.!]|$)", re.I),
    re.compile(r"(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:[?.!]|$)", re.I),
)
_DOC_REF = re.compile(r"\b(this|the|my|attached)\s+(pdf|chapter|document|file|unit|notes|paper|deck)\b", re.I)
_GRADE = re.compile(r"\b(class|grade|std\.?)\s*(\d{1,2})\b", re.I)
_MINUTES = re.compile(r"\b(\d{1,3})\s*-?\s*(?:min|mins|minutes?)\b", re.I)
_SECS = re.compile(r"\b([468])\s*-?\s*(?:s|sec|secs|seconds?)\b", re.I)
# "Narrate this: ...", "Read the following aloud - ...": the script is what follows.
_SCRIPT_LEAD = re.compile(
    r"^\s*(?:please\s+)?(?:can you\s+)?(?:narrate|voice[- ]?over|read(?:\s+(?:this|it|the following))?(?:\s+(?:out|aloud))*|"
    r"(?:make|create|record)\s+(?:a|an)?\s*(?:narration|voice[- ]?over|audio)(?:\s+(?:of|for))?)"
    r"(?:\s+(?:this|the following|my script))?\s*[:\-–—]?\s*", re.I)


def _script_of(text: str) -> str:
    """The words to speak: everything after the instruction, or after a colon."""
    if ":" in text[:80]:
        return text.split(":", 1)[1].strip()
    return _SCRIPT_LEAD.sub("", text, count=1).strip()


def _topic_of(text: str) -> Optional[str]:
    t = re.sub(r"^\s*(please|can you|could you|i need|i want|make|create|give me|write|set)\s+", "", text, flags=re.I)
    m = _TOPIC.search(t)
    topic = (m.group(1).strip(" '\"") if m else "")
    topic = re.sub(r"^(?:a|an|the)\s+", "", topic, flags=re.I)
    if topic and not _NOT_TOPIC.match(topic) and len(topic.split()) <= 8:
        return topic[0].upper() + topic[1:]
    # "Photosynthesis slides", "inflation" — a short request is its own topic
    # once the format words are taken out.
    bare = re.sub(r"\b(slides?|deck|ppt|presentation|worksheet|quiz|test|paper|exam|explain|summari[sz]e|simply|please|for|my|class|grade|\d+|marks?|ideas?|plan|a|an|the|on|of|about|make|create|write|set|give|me|some|lesson|unit|new|notes?|activit(?:y|ies)|classroom|group|interactive|minutes?|mins?|image|picture|illustration|infographic|diagram|drawing|draw|video|clip|animation|animated|generate|seconds?|secs?)\b", " ", text, flags=re.I)
    bare = re.sub(r"[^\w\s'’-]", " ", bare)
    bare = " ".join(bare.split())
    if 2 < len(bare) <= 40 and len(bare.split()) <= 5 and not _NOT_TOPIC.match(bare):
        return bare[0].upper() + bare[1:]
    return None


def _items_of(text: str) -> List[str]:
    for rx in _ITEMS:
        m = rx.search(text)
        if m:
            items = [re.sub(r"^(compare|the|these|two)\s+", "", s.strip(), flags=re.I).strip(" ,.") for s in (m.group(1), m.group(2))]
            items = [i for i in items if i and not re.match(r"^(these|those|them|things)$", i, re.I)]
            if len(items) == 2:
                return items
    return []


def _rules(text: str) -> tuple[str, float, bool]:
    scores: Dict[str, int] = {}
    for intent, rx, weight in _RULES:
        if rx.search(text):
            scores[intent] = scores.get(intent, 0) + weight
    if not scores:
        return "general", 0.3, False
    intent = max(scores.items(), key=lambda kv: kv[1])[0]
    return intent, min(0.98, scores[intent] / sum(scores.values())), True


_CLASSIFY_SYSTEM = """Pick what a teacher's message asks for. Return JSON only: {"intent": one of %s, "topic": string or null}.
explain = explain a concept; summarise = summarise a document; compare = compare two things; slides = a slide deck;
paper = an exam, test or quiz; worksheet = a worksheet or homework; plan = a unit or course plan; notes = lesson or
teaching notes; activity = a timed class activity with tasks and checks; narration = spoken audio of a script;
image = a picture, diagram or illustration; video = a short video clip; ideas = brainstormed classroom ideas;
analyse = analyse student results; general = anything else.""" % (", ".join(f'"{i}"' for i in INTENTS))


def _classify_with_slm(text: str) -> Optional[Dict[str, Any]]:
    route = route_for("classify_fallback", text)
    call = generate_slm if route.intelligence is Intelligence.SLM else _llm_json
    result = call(text, task="chat_classify", system_prompt=_CLASSIFY_SYSTEM, json_mode=True, temperature=0.1)
    if not result.get("success"):
        return None
    try:
        data = json.loads(result["content"])
    except (ValueError, TypeError):
        return None
    if data.get("intent") not in INTENTS:
        return None
    return {"intent": data["intent"], "topic": (data.get("topic") or None), "model": result.get("model_name"), "provider": result.get("provider")}


def _llm_json(prompt: str, *, task: str, system_prompt: str, json_mode: bool = True, temperature: float = 0.4) -> Dict[str, Any]:
    return generate_llm(prompt, system_prompt=system_prompt, task=task, json_mode=json_mode, temperature=temperature)


def read_request(
    text: str,
    *,
    forced: Optional[str] = None,
    has_source: bool = False,
    topics_hint: Sequence[str] = (),
    use_model: bool = True,
) -> Dict[str, Any]:
    """What the teacher asked for, and the route it takes. Never generates the answer."""
    text = (text or "").strip()
    used: List[Dict[str, Any]] = []
    if forced in INTENTS:
        intent, confidence, matched = forced, 1.0, True
    elif is_smalltalk(text):
        intent, confidence, matched = "general", 0.9, True
    else:
        intent, confidence, matched = _rules(text)

    topic = _topic_of(text)
    if not matched and use_model and len(text.split()) >= 3:
        slm = _classify_with_slm(text)
        if slm:
            intent, confidence = slm["intent"], 0.7
            topic = topic or slm["topic"]
            used.append({"task": "classify_fallback", "model": slm["model"], "provider": slm["provider"]})

    heur = _compile_teacher_prompt_heuristic(text)
    grade_m = _GRADE.search(text)
    items = _items_of(text) if intent == "compare" else []
    if len(items) == 2:
        topic = f"{items[0]} vs {items[1]}"
    entities: Dict[str, Any] = {
        "topic": topic or (heur.topics[0] if heur.topics else None),
        "items": items,
        "grade": (f"Class {grade_m.group(2)}" if grade_m else heur.grade) or None,
        "subject": heur.subject or None,
        "marks": heur.marks,
        "doc": bool(_DOC_REF.search(text)),
        "difficulty": heur.difficulty,
    }
    if intent == "activity":
        m = _MINUTES.search(text)
        entities["minutes"] = min(90, max(5, int(m.group(1)))) if m else None
    if intent == "narration":
        entities["script"] = _script_of(text) or None
    if intent == "video":
        m = _SECS.search(text)
        entities["secs"] = int(m.group(1)) if m else None

    task = "smalltalk" if is_smalltalk(text) and not forced else intent
    route = route_for(task, text)
    return {
        "intent": intent,
        "label": LABELS[intent],
        "confidence": round(confidence, 2),
        "entities": entities,
        "ask": _ask_for(intent, entities, has_source, topics_hint),
        "task": task,
        "route": route,
        "models_used": used,
    }


def _ask_for(intent: str, e: Dict[str, Any], has_source: bool, topics: Sequence[str]) -> Optional[Dict[str, Any]]:
    """The one missing detail, asked rather than guessed. None when nothing is missing."""
    recent = [t for t in topics if t][:4]
    if intent == "compare" and len(e["items"]) < 2:
        return {"question": "Which two would you like me to compare?", "options": [], "field": "items", "placeholder": "Type two things, e.g. mitosis and meiosis"}
    if intent == "summarise" and not has_source:
        return {"question": "Which document should I summarise?", "options": [], "field": "doc", "placeholder": "Attach a file with the paperclip, or paste the text here"}
    if intent == "narration" and len(e.get("script") or "") < 12:
        return {"question": "What should I narrate? Paste the script, word for word.", "options": [], "field": "script", "placeholder": "Paste or type the lesson script"}
    if intent in ("image", "video") and not e["topic"]:
        q = "What should the image show?" if intent == "image" else "What should the video show?"
        return {"question": q, "options": recent, "field": "topic", "placeholder": "e.g. a labelled diagram of the human heart"}
    if intent in ("slides", "explain", "paper", "worksheet", "plan", "notes", "activity") and not e["topic"]:
        q = {"slides": "Which topic are the slides for?", "explain": "Which idea should I explain?", "paper": "Which topic is the paper on?",
             "worksheet": "Which topic is the worksheet on?", "plan": "Which unit should I plan?",
             "notes": "Which topic are the notes for?", "activity": "Which topic is the activity for?"}[intent]
        return {"question": q, "options": recent, "field": "topic", "placeholder": "Type a topic, e.g. photosynthesis for Class 7"}
    return None


# ───────────────────────────── answers ─────────────────────────────

_BLOCKS_SPEC = """Return JSON only: {"blocks": [...], "followups": [string, ...]}.
Each block is one of:
  {"t": "text", "text": string}            short paragraphs; **bold** allowed
  {"t": "bullets", "title": string or null, "items": [string, ...]}
  {"t": "table", "columns": [string, ...], "rows": [[string, ...], ...], "caption": string or null}
followups: 2-3 short next requests the teacher might send, written as they would type them."""

_STYLE = """You are Vivran, a teaching assistant for school and college teachers in India.
Write for the teacher, about their class. Be concrete and brief: no preamble, no restating the request,
no "great question". Indian context and examples where they help. Use the teacher's language if they wrote in one."""

_GROUNDING = """Sources from the teacher's own material are given as [S1], [S2]... Prefer them over general knowledge.
Put the tag right after the sentence or item it supports, like "... in 1789 [S1]." Never cite a tag that isn't listed.
If the sources don't cover something, say it comes from general knowledge."""

_INTENT_RULES = {
    "compare": "One short text line, then ONE table: the first column names the aspect compared, then one column per item, 4-6 rows. End with a one-line takeaway text block.",
    "summarise": "A bullets block of the 4-6 points that matter most, each cited. Then a table of key terms (columns: Term, Meaning) if the material has any.",
    "ideas": "One short text line, then a bullets block of 5-6 ideas, each as 'Name (time): what students do', from a 2-minute opener to an exit ticket.",
    "analyse": "If the message contains no marks or results, ask the teacher to paste them (one text block) and stop. Otherwise a table by section or question, a bullets block titled 'What stands out', and a bullets block titled 'What to do next'.",
    "general": "Answer directly. Use bullets only if the answer is a list, a table only if it is a comparison.",
    "smalltalk": "Reply in one short friendly line and offer one thing you could make for their class. No other blocks.",
}


def _history_lines(history: Sequence[Dict[str, str]]) -> str:
    turns = [f"{'Teacher' if h.get('role') == 'user' else 'Vivran'}: {(h.get('text') or '')[:600]}" for h in list(history)[-6:] if h.get("text")]
    return ("Conversation so far:\n" + "\n".join(turns) + "\n\n") if turns else ""


def _clean_blocks(data: Any, tags: Dict[str, Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[str], List[str]]:
    """Only well-formed blocks survive; invented [S#] tags are removed. Returns (blocks, cited chunk ids, invented tags)."""
    raw = data.get("blocks") if isinstance(data, dict) else None
    blocks: List[Dict[str, Any]] = []
    cited: List[str] = []
    invented: List[str] = []

    def fix(s: Any) -> str:
        s = str(s or "").strip()
        found = re.findall(r"\[(S\d+)\]", s)
        real, fake = resolve_tags(found, tags)
        for cid in real:
            if cid not in cited:
                cited.append(cid)
        for t in fake:
            invented.append(t)
            s = s.replace(f"[{t}]", "")
        return re.sub(r"\s+([.,;:])", r"\1", re.sub(r"[ \t]{2,}", " ", s)).strip()[:2400]

    for b in raw if isinstance(raw, list) else []:
        if not isinstance(b, dict):
            continue
        t = b.get("t") or b.get("type")
        if t == "text" and b.get("text"):
            blocks.append({"t": "text", "text": fix(b["text"])})
        elif t == "bullets" and isinstance(b.get("items"), list):
            items = [fix(i) for i in b["items"] if str(i or "").strip()][:10]
            if items:
                blocks.append({"t": "bullets", "title": (str(b.get("title")).strip()[:120] if b.get("title") else None), "items": items})
        elif t == "table" and isinstance(b.get("columns"), list) and isinstance(b.get("rows"), list):
            cols = [str(c)[:60] for c in b["columns"]][:6]
            rows = [[fix(c) for c in (r if isinstance(r, list) else [r])][: len(cols)] for r in b["rows"]][:12]
            rows = [r + [""] * (len(cols) - len(r)) for r in rows if any(r)]
            if cols and rows:
                blocks.append({"t": "table", "data": {"columns": cols, "rows": rows, "caption": (str(b["caption"])[:160] if b.get("caption") else None)}})
        if len(blocks) >= 8:
            break
    return blocks, cited, invented


def _followups(data: Any) -> List[str]:
    f = data.get("followups") if isinstance(data, dict) else None
    return [str(x).strip()[:90] for x in (f if isinstance(f, list) else []) if str(x or "").strip()][:3]


def _run(route: Route, prompt: str, system: str, task: str, temperature: float = 0.4) -> Dict[str, Any]:
    if route.intelligence is Intelligence.SLM:
        return generate_slm(prompt, task=task, system_prompt=system, json_mode=True, temperature=temperature)
    return generate_llm(prompt, system_prompt=system, task=task, json_mode=True, temperature=temperature)


def answer(
    task: str,
    text: str,
    *,
    history: Sequence[Dict[str, str]] = (),
    chunks: Sequence[Dict[str, Any]] = (),
    grade: Optional[str] = None,
    subject: Optional[str] = None,
    pasted: Optional[str] = None,
) -> Dict[str, Any]:
    """A text answer as blocks, on the intelligence the route names."""
    route = route_for(task, text)
    tags = tag_map(chunks)
    lines = format_sources(chunks, text)
    system = "\n\n".join(filter(None, [_STYLE, _INTENT_RULES.get(task, _INTENT_RULES["general"]), _GROUNDING if lines else "", _BLOCKS_SPEC]))
    who = ", ".join(filter(None, [grade, subject]))
    prompt = (
        _history_lines(history)
        + (f"Class: {who}\n" if who else "")
        + (("Sources:\n" + "\n".join(lines) + "\n\n") if lines else "")
        + (f"Text the teacher provided:\n{pasted[:6000]}\n\n" if pasted else "")
        + f"Teacher's request: {text}"
    )
    result = _run(route, prompt, system, f"chat_{task}")
    if not result.get("success"):
        return {"ok": False, "failure": result.get("failure") or FailureClass.UPSTREAM_ERROR, "error": result.get("error", ""), "route": route}
    try:
        data = json.loads(result["content"])
    except (ValueError, TypeError):
        # A model that answered in prose still answered: show it as text.
        data = {"blocks": [{"t": "text", "text": result.get("content", "")}]}
    blocks, cited, invented = _clean_blocks(data, tags)
    if not blocks:
        return {"ok": False, "failure": FailureClass.UPSTREAM_ERROR, "error": "empty answer", "route": route}
    if invented:
        logger.info("chat %s: removed %d invented source tags", task, len(invented))
    # Each source keeps the tag it had in the prompt, so [S3] in the answer is the third passage.
    sources = [{**p, "tag": f"S{i}"} for i, (c, p) in enumerate(zip(chunks, sources_payload(chunks)), start=1) if str(c.get("chunk_id")) in cited]
    return {
        "ok": True,
        "blocks": blocks,
        "followups": _followups(data),
        "sources": sources,
        "grounded_on": len(chunks),
        "route": route,
        "model": result.get("model_name"),
        "provider": result.get("provider"),
        "usage": result.get("usage"),
    }


_TRANSFORM = {
    "summarise": "Shorten the answer to its 3 most important points, as one bullets block titled 'In short'. Use only what the answer says.",
    "bullets": "Turn the answer into one bullets block of at most 7 items. Use only what the answer says; keep its [S#] tags.",
    "table": "Turn the answer into one table students can copy, with sensible columns. Use only what the answer says; keep its [S#] tags.",
    "simplify": "Rewrite the answer in easier words and shorter sentences for weaker students, as one text block. Use only what the answer says.",
    "further": "Go one level deeper than the answer: the next layer of understanding a teacher would add, as a short text line then a bullets block.",
    "examples": "Give 3-4 new concrete examples of the answer's main idea that Indian students will recognise, as one bullets block titled 'Examples'.",
    "elaborate": "Add detail for stronger students: mechanisms, exceptions, numbers. A short text line, then a bullets block.",
}


def transform(action: str, answer_text: str, *, request: str = "", history: Sequence[Dict[str, str]] = ()) -> Dict[str, Any]:
    task = ACTION_TASK.get(action)
    if not task:
        return {"ok": False, "failure": FailureClass.UPSTREAM_ERROR, "error": f"unknown action {action}"}
    route = route_for(task, answer_text)
    system = "\n\n".join([_STYLE, _TRANSFORM[action], _BLOCKS_SPEC.replace("followups: 2-3", "followups: 0-2")])
    prompt = _history_lines(history) + (f"The teacher originally asked: {request}\n\n" if request else "") + f"The answer:\n{answer_text[:6000]}"
    result = _run(route, prompt, system, f"chat_{task}", temperature=0.3)
    if not result.get("success"):
        return {"ok": False, "failure": result.get("failure") or FailureClass.UPSTREAM_ERROR, "error": result.get("error", ""), "route": route}
    try:
        data = json.loads(result["content"])
    except (ValueError, TypeError):
        data = {"blocks": [{"t": "text", "text": result.get("content", "")}]}
    # Tags are kept as written: they point at the original answer's sources.
    blocks, _, _ = _clean_blocks(data, {f"S{i}": {"chunk_id": f"S{i}"} for i in range(1, 13)})
    if not blocks:
        return {"ok": False, "failure": FailureClass.UPSTREAM_ERROR, "error": "empty answer", "route": route}
    return {"ok": True, "blocks": blocks, "followups": _followups(data), "route": route, "model": result.get("model_name"), "provider": result.get("provider")}


_IMPROVE_SYSTEM = """You improve a teacher's request to Vivran so it can be done well in one go.
Keep what they asked for and their own words. Add only the specifics a teacher would expect and that are missing:
the class or year, how long or how many marks, the format, the angle (Indian examples, exam focus, a misconception to tackle).
Use the class and subject given if the request has none. Do not invent a different topic. At most two sentences.
Return JSON only: {"improved": string, "added": [string, ...]} where added lists, in 1-3 words each, what you added."""


def improve(text: str, *, intent: Optional[str] = None, grade: Optional[str] = None, subject: Optional[str] = None) -> Dict[str, Any]:
    """The request with what it was missing. Falls back to the teacher's own words, unchanged."""
    route = route_for("improve_prompt", text)
    who = ", ".join(filter(None, [grade, subject]))
    prompt = (f"Their usual class: {who}\n" if who else "") + (f"It reads as: {LABELS.get(intent or '', 'a request')}\n" if intent else "") + f'Request: "{text}"'
    result = _run(route, prompt, _IMPROVE_SYSTEM, "chat_improve_prompt", temperature=0.3)
    fallback = {"improved": text, "added": [], "changed": False, "route": route}
    if not result.get("success"):
        return fallback
    try:
        data = json.loads(result["content"])
        improved = " ".join(str(data.get("improved") or "").split())[:500]
        added = [str(a).strip()[:40] for a in (data.get("added") or []) if str(a).strip()][:4]
    except (ValueError, TypeError, AttributeError):
        return fallback
    if len(improved) < len(text) * 0.6 or improved.lower() == text.lower():
        return fallback
    return {"improved": improved, "added": added, "changed": True, "route": route, "model": result.get("model_name"), "provider": result.get("provider")}
