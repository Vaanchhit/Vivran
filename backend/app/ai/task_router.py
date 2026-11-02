"""The chat's multimodal task router: which intelligence does each job.

Every request in the chat becomes a TASK, and every task has exactly one row in
ROUTES below saying what runs it. That table is the whole policy: the chat API
(app/api/chat.py) looks a task up here and calls what it names, so the route a
teacher's request takes can be read in one place and tested without a model.

THE FOUR KINDS OF INTELLIGENCE
  RULES   No model. Deterministic code: reading the request, spotting a missing
          detail, writing a chat title. Same words, same answer, no quota spent.
  SLM     The small model (settings.slm_model). Extraction and REWRITING: the
          output says nothing the input didn't, it is short and checkable, and
          each call site falls back to something usable when it fails.
  LLM     The large model (settings.llm_model, Gemini authoring as fallback;
          see cheap_model.generate_llm). Anything that has to ADD knowledge or
          reason: explaining, comparing, summarising a document, ideas, analysis,
          and the artifact pipelines, which carry their own model pins.
  MEDIA   Not a language model: speech-to-text, text-to-speech, images.

THE RULE THAT DECIDES SLM vs LLM
  Would a wrong answer be a NEW wrong fact? Then it is LLM work. Turning an
  answer the teacher already has into bullets or a table cannot introduce a
  fact the answer didn't contain, so it is SLM work; "explain further" or "give
  examples" has to produce new content, so it is LLM work even though it looks
  like a rewrite button.

MODALITIES
  A route names what it takes (text, a document, voice) and what it gives back
  (text, a deck, a paper, audio, an image). The input modality is a fact about
  the request (a file attached, the mic used), and it can change the route: a
  request with a document attached is grounded in it, and a request in an Indic
  script never goes to the SLM (app/ai/language.py).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Tuple

from app.ai import groq_client
from app.ai.language import uses_non_latin_script
from app.core.config import settings
from app.media.elevenlabs import DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL


class Intelligence(str, Enum):
    RULES = "rules"
    SLM = "slm"
    LLM = "llm"
    MEDIA = "media"


class Modality(str, Enum):
    TEXT = "text"
    DOCUMENT = "document"
    VOICE = "voice"
    AUDIO = "audio"
    IMAGE = "image"
    DECK = "deck"
    PAPER = "paper"
    VIDEO = "video"


T, D, V = Modality.TEXT, Modality.DOCUMENT, Modality.VOICE


@dataclass(frozen=True)
class Route:
    task: str
    intelligence: Intelligence
    # What runs it: "chat.answer" (app/generation/chat.py), or one of the
    # existing generators the chat hands off to.
    pipeline: str
    inputs: Tuple[Modality, ...]
    output: Modality
    why: str


def _r(task: str, intel: Intelligence, pipeline: str, inputs: Tuple[Modality, ...], output: Modality, why: str) -> Route:
    return Route(task, intel, pipeline, inputs, output, why)


I = Intelligence
ROUTES: Dict[str, Route] = {r.task: r for r in (
    # ── reading the request ──────────────────────────────────────────────
    _r("classify", I.RULES, "chat.route", (T, V), T, "Keyword rules read most requests exactly; the SLM is asked only when no rule matches."),
    _r("classify_fallback", I.SLM, "chat.route", (T, V), T, "Picking one label from a fixed list: extraction, schema-checked, and 'general' when it fails."),
    _r("clarify", I.RULES, "chat.route", (T,), T, "A missing topic or a missing second item is a fact about the words, so it is asked, never guessed."),
    _r("improve_prompt", I.SLM, "chat.improve", (T, V), T, "Rewrites the teacher's own request; falls back to it unchanged."),
    _r("smalltalk", I.SLM, "chat.answer", (T, V), T, "A greeting or thanks needs one short line, not the large model."),
    # ── answers in the chat ──────────────────────────────────────────────
    _r("explain", I.LLM, "examples", (T, V, D), T, "An analogy has to be new and right; the example generator checks every term maps."),
    _r("compare", I.LLM, "chat.answer", (T, V, D), T, "Filling both sides of a table is new subject content."),
    _r("summarise", I.LLM, "chat.answer", (D, T), T, "Reads long source text and has to choose what matters."),
    _r("ideas", I.LLM, "chat.answer", (T, V, D), T, "Classroom activities are authored, not extracted."),
    _r("analyse", I.LLM, "chat.answer", (T, D), T, "Reasoning over marks: where a class struggles and why."),
    _r("general", I.LLM, "chat.answer", (T, V, D), T, "An open question can need any amount of knowledge."),
    # ── things Vivran makes (each pipeline keeps its own model pins) ─────
    _r("slides", I.LLM, "deck", (T, V, D), Modality.DECK, "Planned on the planner model, written by slidekit on the authoring model, every slide fitted in code."),
    _r("paper", I.LLM, "assessment", (T, V, D), Modality.PAPER, "On the model measured to get marks arithmetic right, with validate-and-regenerate."),
    _r("worksheet", I.LLM, "worksheet", (T, V, D), T, "Authored questions with answers."),
    _r("plan", I.LLM, "course_plan", (T, V, D), T, "A week-by-week plan is authored structure."),
    _r("notes", I.LLM, "lesson_notes", (T, V, D), T, "Teaching notes in order, with everyday examples and a recap: authored content."),
    _r("activity", I.LLM, "interactive", (T, V, D), T, "A timed lesson in steps (explain, do, a scenario, checks), validated before it is returned."),
    # ── quick actions on an answer ───────────────────────────────────────
    _r("rewrite.summarise", I.SLM, "chat.transform", (T,), T, "Shortens an answer the teacher already has."),
    _r("rewrite.bullets", I.SLM, "chat.transform", (T,), T, "Same content, as a list."),
    _r("rewrite.table", I.SLM, "chat.transform", (T,), T, "Same content, as rows and columns."),
    _r("rewrite.simplify", I.SLM, "chat.transform", (T,), T, "Same content in easier words."),
    _r("extend.further", I.LLM, "chat.transform", (T,), T, "Going deeper adds facts the answer didn't have."),
    _r("extend.examples", I.LLM, "chat.transform", (T,), T, "New examples are new content."),
    _r("extend.elaborate", I.LLM, "chat.transform", (T,), T, "More detail for stronger students is new content."),
    # ── speech and pictures ──────────────────────────────────────────────
    _r("speech_to_text", I.MEDIA, "transcribe", (V,), T, "Browser speech recognition first (free); the server transcriber when it is unavailable."),
    _r("read_aloud", I.MEDIA, "narration", (T,), Modality.AUDIO, "Browser speech first (free); Cartesia or ElevenLabs for a downloadable narration."),
    _r("narration", I.MEDIA, "narration", (T,), Modality.AUDIO, "The teacher's own script, spoken as it is written; no language model touches the words."),
    _r("image", I.MEDIA, "image", (T, V), Modality.IMAGE, "An image model draws it from the teacher's description; labels can be wrong, so they are checked before use."),
    _r("video", I.MEDIA, "video", (T, V), Modality.VIDEO, "A video model makes a 4 to 8 second clip. Slow (1 to 3 minutes), so it runs only when asked for."),
)}

ACTION_TASK = {
    "summarise": "rewrite.summarise", "bullets": "rewrite.bullets", "table": "rewrite.table", "simplify": "rewrite.simplify",
    "further": "extend.further", "examples": "extend.examples", "elaborate": "extend.elaborate",
}

_SMALLTALK = re.compile(r"^\s*(hi|hello|hey|namaste|thanks?|thank you|ok(ay)?|good (morning|afternoon|evening)|bye)\b[\s!.,]*\w{0,12}[\s!.]*$", re.I)


def is_smalltalk(text: str) -> bool:
    return bool(_SMALLTALK.match(text or ""))


def route_for(task: str, text: str = "") -> Route:
    """The route a task takes for this request. Unknown tasks are 'general'.

    The one adjustment made per request is the language guard: SLM work on text
    written in an Indic script moves to the LLM, because the SLM's quality was
    measured in English only (app/ai/language.py).
    """
    route = ROUTES.get(task) or ROUTES["general"]
    if route.intelligence is Intelligence.SLM and uses_non_latin_script(text):
        return Route(route.task, Intelligence.LLM, route.pipeline, route.inputs, route.output,
                     route.why + " Moved to the LLM: written in a script the SLM was not measured on.")
    return route


def models_for(intel: Intelligence) -> Dict[str, Any]:
    """Which model(s) an intelligence runs on right now, as the call sites really choose them."""
    if intel is Intelligence.SLM:
        return {"model": settings.slm_model, "provider": "gemini"}
    if intel is Intelligence.LLM:
        if groq_client.is_configured():
            return {"model": settings.llm_model, "provider": "groq", "fallback": settings.cheap_model}
        return {"model": settings.cheap_model, "provider": "gemini"}
    if intel is Intelligence.MEDIA:
        return {"model": "browser speech, then Cartesia / ElevenLabs", "provider": "media"}
    return {"model": None, "provider": "rules"}


def describe(route: Route, *, modality: Modality = Modality.TEXT) -> Dict[str, Any]:
    """The route as the API reports it (internal: shown only when routing is switched on in the chat)."""
    pins: Dict[str, Any] = {}
    if route.pipeline == "deck":
        pins = {"plan": settings.planner_model, "write": settings.cheap_model}
    elif route.pipeline == "assessment":
        pins = {"write": settings.assessment_model}
    elif route.pipeline in ("lesson_notes", "interactive"):
        pins = {"write": settings.cheap_model}
    elif route.task == "narration":
        pins = {"speak": "cartesia sonic-3"}
    elif route.pipeline == "image":
        pins = {"draw": f"{DEFAULT_IMAGE_MODEL} (via ElevenLabs)"}
    elif route.pipeline == "video":
        pins = {"film": f"{DEFAULT_VIDEO_MODEL} (via ElevenLabs)"}
    return {
        "task": route.task,
        "intelligence": route.intelligence.value,
        "pipeline": route.pipeline,
        "input": modality.value,
        "output": route.output.value,
        "why": route.why,
        # A pipeline with its own pins runs on those, not on the lane's default model.
        **({"pins": pins, "model": None, "provider": "pipeline"} if pins else models_for(route.intelligence)),
    }
