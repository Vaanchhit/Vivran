"""What a teacher asks for, kept so Vivran can learn their habits as they change.

Three kinds of event, all small:

  prompt      the words they typed, after the intent was read (capped, redacted)
  generate    what they asked Vivran to make: the kind, subject, grade and the
              settings they chose (marks, difficulty, slide count, question types ...)
  regenerate  how they asked a question to be changed (harder, easier, application ...)

Every event triggers a recompute of the habits derived from them (profile.py),
so the picture follows the teacher: it is not a one-time import. The newest
MAX_EVENTS per workspace are kept; older ones are pruned as new ones arrive.

Recording never raises. A teacher's paper must not fail because their history
could not be written; the failure is logged and the request carries on.
"""
from __future__ import annotations

import datetime as _dt
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.logging import logger
from app.services import supabase_service as sb

TABLE = "prompt_events"
MAX_EVENTS = 300
PROMPT_CHARS = 400
KEEP_PARAMS = {
    "marks", "total_marks", "difficulty", "slide_count", "slideCount", "question_count", "questionCount",
    "duration_minutes", "durationMinutes", "duration_weeks", "durationWeeks", "language", "question_plan",
    "option", "setting", "topics", "mode",
}

_local: List[Dict[str, Any]] = []

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"(?<!\d)(?:\+?\d[\s-]?){9,13}(?!\d)")
_URL = re.compile(r"https?://\S+")


def redact_prompt(text: str) -> str:
    """The prompt as it may be stored: no emails, phone numbers or links, capped."""
    out = _URL.sub("[link]", text or "")
    out = _EMAIL.sub("[email]", out)
    out = _PHONE.sub("[number]", out)
    out = " ".join(out.split())
    return out[:PROMPT_CHARS]


def norm_subject(subject: Optional[str]) -> str:
    return " ".join((subject or "").lower().split())


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


def _missing_table(e: Exception) -> bool:
    text = str(e).lower()
    return "does not exist" in text or "could not find the table" in text or "pgrst205" in text or "42p01" in text


def _clean_params(params: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for k, v in (params or {}).items():
        if k in KEEP_PARAMS and v is not None and v != "":
            out[k] = v
    if isinstance(out.get("topics"), list):
        out["topics"] = [str(t)[:80] for t in out["topics"][:5]]
    return out


def _add(row: Dict[str, Any]) -> None:
    row = {"id": str(uuid.uuid4()), "created_at": _now(), **row}
    if not sb.is_configured():
        _local.append(row)
        return
    sb.table_insert(TABLE, row)


def recent(workspace_id: str, limit: int = MAX_EVENTS) -> List[Dict[str, Any]]:
    """Newest first. [] when the table doesn't exist yet (migration 0009)."""
    if not sb.is_configured():
        rows = [r for r in _local if r["workspace_id"] == workspace_id]
        return sorted(rows, key=lambda r: r["created_at"], reverse=True)[:limit]
    try:
        return sb.table_select(TABLE, {"workspace_id": f"eq.{workspace_id}", "order": "created_at.desc", "limit": str(limit)})
    except sb.SupabaseError as e:
        if _missing_table(e):
            return []
        raise


def _prune(workspace_id: str) -> None:
    rows = recent(workspace_id, MAX_EVENTS + 50)
    stale = [r["id"] for r in rows[MAX_EVENTS:]]
    if not stale:
        return
    if not sb.is_configured():
        _local[:] = [r for r in _local if r["id"] not in set(stale)]
        return
    sb.table_delete(TABLE, {"workspace_id": f"eq.{workspace_id}", "id": f"in.({','.join(stale)})"})


_executor: Optional[ThreadPoolExecutor] = None


def _submit(fn, *args) -> None:
    """Runs ``fn`` off the request path: history is bookkeeping, and the teacher
    is waiting on their paper, not on six database round trips. Inline under
    test so assertions see the result."""
    global _executor
    if settings.app_env == "test":
        fn(*args)
        return
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="vivran-history")
    _executor.submit(fn, *args)


def _record(workspace_id: str, row: Dict[str, Any]) -> None:
    _submit(_record_now, workspace_id, row)


def _record_now(workspace_id: str, row: Dict[str, Any]) -> None:
    try:
        _add({"workspace_id": workspace_id, **row})
        _prune(workspace_id)
        # The habits are re-derived from the events every time, so they follow
        # the teacher as their requests change.
        from app.memory import store

        store.recompute(workspace_id)
    except Exception as e:  # noqa: BLE001 - recording must never fail a request
        logger.warning("Could not record teaching history: %s", e)


def record_prompt(workspace_id: str, text: str, intent: Optional[Dict[str, Any]] = None) -> None:
    intent = intent or {}
    clean = redact_prompt(text)
    if not clean:
        return
    _record(workspace_id, {
        "kind": "prompt", "artifact": None, "subject": norm_subject(intent.get("subject")),
        "grade": intent.get("grade") or None, "prompt_text": clean,
        "params": _clean_params({"topics": intent.get("topics"), "marks": intent.get("marks"), "difficulty": intent.get("difficulty")}),
    })


def record_generation(workspace_id: str, artifact: str, subject: Optional[str], grade: Optional[str], params: Dict[str, Any]) -> None:
    _record(workspace_id, {
        "kind": "generate", "artifact": artifact, "subject": norm_subject(subject),
        "grade": grade or None, "prompt_text": None, "params": _clean_params(params),
    })


def record_regenerate(workspace_id: str, option: str, artifact: str = "assessment") -> None:
    _record(workspace_id, {"kind": "regenerate", "artifact": artifact, "subject": "", "grade": None, "prompt_text": None, "params": {"option": option}})


def recent_prompts(workspace_id: str, limit: int = 15) -> List[Dict[str, Any]]:
    out = []
    for r in recent(workspace_id):
        if r.get("kind") != "prompt" or not r.get("prompt_text"):
            continue
        out.append({"id": r["id"], "text": r["prompt_text"], "subject": r.get("subject") or "", "grade": r.get("grade"), "created_at": r.get("created_at")})
        if len(out) >= limit:
            break
    return out


def delete_prompt(workspace_id: str, event_id: str) -> bool:
    if not sb.is_configured():
        before = len(_local)
        _local[:] = [r for r in _local if not (r["workspace_id"] == workspace_id and r["id"] == event_id)]
        gone = len(_local) < before
    else:
        rows = sb.table_select(TABLE, {"workspace_id": f"eq.{workspace_id}", "id": f"eq.{event_id}", "select": "id"})
        gone = bool(rows)
        if gone:
            sb.table_delete(TABLE, {"workspace_id": f"eq.{workspace_id}", "id": f"eq.{event_id}"})
    if gone:
        _recompute_quietly(workspace_id)
    return gone


def clear_all(workspace_id: str) -> None:
    if not sb.is_configured():
        _local[:] = [r for r in _local if r["workspace_id"] != workspace_id]
    else:
        try:
            sb.table_delete(TABLE, {"workspace_id": f"eq.{workspace_id}"})
        except sb.SupabaseError as e:
            if not _missing_table(e):
                raise
    _recompute_quietly(workspace_id)


def _recompute_quietly(workspace_id: str) -> None:
    try:
        from app.memory import store

        store.recompute(workspace_id)
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not refresh teaching habits: %s", e)
