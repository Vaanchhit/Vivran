"""Chat API: the conversation in /beta, routed per task (app/ai/task_router.py).

  POST /chat/route      read a request: intent, what it names, a question if a
                        detail is missing, and the route it will take. RULES,
                        and the SLM only when no rule matched.
  POST /chat/answer     a text answer as blocks (compare, summarise, ideas,
                        analyse, general, smalltalk), grounded in the teacher's
                        sources.
  POST /chat/transform  a quick action on an answer (rewrite on the SLM, extend
                        on the LLM).
  POST /chat/improve    "Improve my prompt", on the SLM.
  GET  /chat/routes     the routing table itself, for inspecting what runs where.

Slides, papers, worksheets, plans and explanations are NOT generated here: the
chat calls the generators that already exist (/api/deck, /assessments/generate,
/content/worksheet, /projects, /examples) with what /chat/route read.
"""
import re
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.ai.task_router import ROUTES, Modality, describe, route_for
from app.api.deps import require_teacher, teacher_session
from app.core.auth import CurrentUser
from app.core.errors import FailureClass, http_error
from app.core.logging import logger
from app.core.rate_limit import limit
from app.generation import chat
from app.memory import events as memory_events
from app.retrieval.search import search_knowledge_base
from app.services import library
from app.services.supabase_service import SupabaseError, is_configured

router = APIRouter(prefix="/chat", tags=["chat"])

_LIMIT = "30/minute;300/hour"
# Reading a request costs no model call unless no rule matched, so it can be looser.
_ROUTE_LIMIT = "60/minute;600/hour"


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(default="", max_length=4000)


class RouteRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    forced_intent: Optional[str] = None
    has_source: bool = False
    modality: Literal["text", "voice", "document"] = "text"


class AnswerRequest(BaseModel):
    task: str = Field(max_length=40)
    text: str = Field(min_length=1, max_length=2000)
    history: List[Turn] = Field(default_factory=list, max_length=12)
    material_id: Optional[str] = None
    grade: Optional[str] = Field(default=None, max_length=40)
    subject: Optional[str] = Field(default=None, max_length=80)
    # Marks or text pasted into the message, kept apart from the request itself.
    pasted: Optional[str] = Field(default=None, max_length=8000)


class TransformRequest(BaseModel):
    action: Literal["summarise", "further", "examples", "bullets", "table", "simplify", "elaborate"]
    answer: str = Field(min_length=1, max_length=8000)
    request: str = Field(default="", max_length=2000)
    history: List[Turn] = Field(default_factory=list, max_length=12)


class ImproveRequest(BaseModel):
    text: str = Field(min_length=3, max_length=1000)
    intent: Optional[str] = None
    grade: Optional[str] = Field(default=None, max_length=40)
    subject: Optional[str] = Field(default=None, max_length=80)


def _recent_topics(workspace_id: str) -> List[str]:
    """Titles of recent saved work, offered as answers to "which topic?"."""
    if not is_configured():
        return []
    try:
        rows = library.list_items(workspace_id, limit=12)
    except SupabaseError:
        return []
    seen: List[str] = []
    for r in rows:
        t = (r.get("title") or "").split(" · ")[0].strip()
        if t and t.lower() not in {s.lower() for s in seen}:
            seen.append(t)
    return seen[:4]


def _route_out(route, modality: str, used: Optional[List[Dict[str, Any]]] = None, ran: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    out = describe(route, modality=Modality(modality))
    if used:
        out["also_used"] = used
    if ran and ran.get("model"):
        # What actually produced the bytes, which can differ from the plan
        # when a provider was busy and the fallback answered.
        out["ran_on"] = {"model": ran.get("model"), "provider": ran.get("provider")}
    return out


@router.post("/route")
@limit(_ROUTE_LIMIT)
def api_route(request: Request, payload: RouteRequest, session: Dict[str, Any] = Depends(teacher_session), user: CurrentUser = Depends(require_teacher)):
    ws = session["workspace_id"]
    read = chat.read_request(
        payload.text, forced=payload.forced_intent, has_source=payload.has_source,
        topics_hint=_recent_topics(ws),
    )
    memory_events.record_prompt(ws, payload.text, {"task_type": read["intent"], "topics": [read["entities"]["topic"]] if read["entities"]["topic"] else []})
    modality = "document" if payload.has_source and payload.modality == "text" else payload.modality
    return {
        "intent": read["intent"],
        "label": read["label"],
        "confidence": read["confidence"],
        "entities": read["entities"],
        "ask": read["ask"],
        "task": read["task"],
        "route": _route_out(read["route"], modality, read["models_used"]),
    }


def _chunks_for(task: str, text: str, ws: str, material_id: Optional[str]) -> List[Dict[str, Any]]:
    if task == "smalltalk":
        return []
    query = text
    if task == "summarise":
        # "Summarise this PDF" names no content to search for, so ask for what a summary needs.
        stripped = re.sub(r"\b(summari[sz]e|summary|this|the|my|pdf|chapter|document|file|unit|notes|please|of|key points)\b", " ", text, flags=re.I).strip()
        query = stripped if len(stripped) > 8 else "main ideas key terms definitions causes effects"
    try:
        return search_knowledge_base(query, ws, material_id=material_id, limit=8 if task == "summarise" else 6)
    except Exception as e:  # retrieval is best effort: an ungrounded answer is worse, not failed
        logger.warning("Chat retrieval failed (answering ungrounded): %s", e)
        return []


@router.post("/answer")
@limit(_LIMIT)
def api_answer(request: Request, payload: AnswerRequest, session: Dict[str, Any] = Depends(teacher_session), user: CurrentUser = Depends(require_teacher)):
    if payload.task not in ROUTES or ROUTES[payload.task].pipeline != "chat.answer":
        raise http_error(FailureClass.UPSTREAM_ERROR, context="chat", detail=f"{payload.task} is not answered in the chat")
    ws = session["workspace_id"]
    chunks = _chunks_for(payload.task, payload.text, ws, payload.material_id)
    result = chat.answer(
        payload.task, payload.text, history=[t.model_dump() for t in payload.history], chunks=chunks,
        grade=payload.grade, subject=payload.subject, pasted=payload.pasted,
    )
    if not result["ok"]:
        raise http_error(result["failure"], context="chat", detail=result.get("error", ""))
    return {
        "blocks": result["blocks"],
        "followups": result["followups"],
        "sources": result["sources"],
        "grounded_on": result["grounded_on"],
        "route": _route_out(result["route"], "document" if chunks else "text", ran=result),
    }


@router.post("/transform")
@limit(_LIMIT)
def api_transform(request: Request, payload: TransformRequest, user: CurrentUser = Depends(require_teacher)):
    result = chat.transform(payload.action, payload.answer, request=payload.request, history=[t.model_dump() for t in payload.history])
    if not result["ok"]:
        raise http_error(result["failure"], context="chat action", detail=result.get("error", ""))
    return {"blocks": result["blocks"], "followups": result["followups"], "route": _route_out(result["route"], "text", ran=result)}


@router.post("/improve")
@limit(_LIMIT)
def api_improve(request: Request, payload: ImproveRequest, user: CurrentUser = Depends(require_teacher)):
    result = chat.improve(payload.text, intent=payload.intent, grade=payload.grade, subject=payload.subject)
    return {"improved": result["improved"], "added": result["added"], "changed": result["changed"], "route": _route_out(result["route"], "text", ran=result)}


@router.get("/routes")
def api_routes(user: CurrentUser = Depends(require_teacher)):
    return {"routes": [describe(route_for(task)) for task in ROUTES]}
