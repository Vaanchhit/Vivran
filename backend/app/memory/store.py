"""Teaching memory persistence, and how traits change as files come and go.

The teacher stays in charge of what is used:

  suggested  found in the files, shown to the teacher, not used
  active     the teacher said "use this"; generation uses ``value``. If later
             files say something different, that goes in ``latest_value``
             and is offered, never applied on its own.
  dismissed  the teacher said no. It stays quiet unless the evidence for it
             at least doubles, then it is suggested again.
  stale      was active, but the files behind it were deleted. Not used
             until the teacher looks at it again.

A trait learned for one subject is never applied to another (the scoping the
over-personalisation research found matters most); only traits from files
uploaded without a subject apply across subjects.

The uploaded file itself is never stored. What is kept is the fingerprint:
structure, counts and short question excerpts with student identity fields
redacted (safety.py). Student work is refused before anything is written.
"""
from __future__ import annotations

import datetime as _dt
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging import logger
from app.memory import classify as classify_mod
from app.memory.decks import parse_deck
from app.memory.lessons import parse_lesson_plan
from app.memory.papers import parse_paper
from app.memory.safety import check_student_work
from app.memory.text import UnreadableFile, extract, file_type_for
from app.memory.traits import derive_traits
from app.services import supabase_service as sb

PARSER_VERSION = "1"
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
DOCUMENTS = "history_documents"
TRAITS = "style_traits"
DOCUMENT_LIST_FIELDS = "id,title,file_type,kind,subject,grade,authored_by_me,status,status_reason,fingerprint,created_at"


class MemoryNotReady(RuntimeError):
    """The tables don't exist yet (migration 0008 not applied)."""


class StudentWorkRefused(ValueError):
    pass


def normalise_subject(subject: Optional[str]) -> str:
    return " ".join((subject or "").lower().split())


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Storage backend: Supabase when configured, process memory otherwise (local
# development and the test suite), the same split provisioning.py uses.
# ---------------------------------------------------------------------------

_local: Dict[str, List[Dict[str, Any]]] = {DOCUMENTS: [], TRAITS: []}


def _missing_table(e: Exception) -> bool:
    text = str(e).lower()
    return "does not exist" in text or "could not find the table" in text or "pgrst205" in text or "42p01" in text


def _select(table: str, workspace_id: str, **filters: str) -> List[Dict[str, Any]]:
    if not sb.is_configured():
        return [r for r in _local[table] if r["workspace_id"] == workspace_id and all(str(r.get(k)) == v for k, v in filters.items())]
    params = {"workspace_id": f"eq.{workspace_id}", **{k: f"eq.{v}" for k, v in filters.items()}, "order": "created_at.asc"}
    try:
        return sb.table_select(table, params)
    except sb.SupabaseError as e:
        if _missing_table(e):
            raise MemoryNotReady(str(e)) from e
        raise


def _insert(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    row = {"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now(), **row}
    if not sb.is_configured():
        _local[table].append(row)
        return row
    try:
        return sb.table_insert(table, row)
    except sb.SupabaseError as e:
        if _missing_table(e):
            raise MemoryNotReady(str(e)) from e
        raise


def _update(table: str, workspace_id: str, row_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not sb.is_configured():
        for r in _local[table]:
            if r["workspace_id"] == workspace_id and r["id"] == row_id:
                r.update(patch, updated_at=_now())
                return r
        return None
    rows = sb.table_update(table, {"workspace_id": f"eq.{workspace_id}", "id": f"eq.{row_id}"}, patch)
    return rows[0] if rows else None


def _delete(table: str, workspace_id: str, row_id: Optional[str] = None) -> None:
    if not sb.is_configured():
        _local[table] = [
            r for r in _local[table]
            if not (r["workspace_id"] == workspace_id and (row_id is None or r["id"] == row_id))
        ]
        return
    params = {"workspace_id": f"eq.{workspace_id}"}
    if row_id is not None:
        params["id"] = f"eq.{row_id}"
    sb.table_delete(table, params)


# ---------------------------------------------------------------------------
# Reading one file (pure: no storage)
# ---------------------------------------------------------------------------

def read_document(data: bytes, filename: str, kind_hint: Optional[str] = None) -> Dict[str, Any]:
    """Bytes -> {file_type, kind, status, status_reason, fingerprint}.

    Raises UnreadableFile or StudentWorkRefused with a message for the teacher.
    """
    file_type = file_type_for(filename)
    if file_type is None:
        raise UnreadableFile("Upload a PDF, Word (.docx) or PowerPoint (.pptx) file.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise UnreadableFile("That file is over 15 MB. Upload a smaller copy, or split it.")
    text = extract(data, file_type)

    safety = check_student_work(text.lines)
    if safety.is_student_work:
        raise StudentWorkRefused(safety.reason)

    kind = kind_hint if kind_hint in classify_mod.KINDS else classify_mod.classify(file_type, text.lines)
    if kind == "slides" and file_type != "pptx":
        kind = classify_mod.classify(file_type, text.lines)

    status, reason = "ready", None
    if kind in ("exam_paper", "worksheet"):
        fp = parse_paper(text.lines, kind)
        fingerprint = fp.to_dict()
        if len(fp.questions) < 3:
            status, reason = "needs_review", "Couldn't find numbered questions in this file, so it isn't used yet."
        elif kind == "exam_paper" and not fp.reconciled:
            status, reason = "needs_review", fp.note
    elif kind == "slides":
        fingerprint = parse_deck(text.slides)
        if not fingerprint["usable"]:
            status, reason = "needs_review", "This deck has fewer than three slides with text."
    elif kind == "lesson_plan":
        fingerprint = parse_lesson_plan(text.lines)
        if not fingerprint["usable"]:
            status, reason = "needs_review", "Couldn't find the lesson's stages (objectives, activity, recap and so on)."
    else:
        fingerprint = {"kind": "notes", "line_count": len(text.lines)}
    return {"file_type": file_type, "kind": kind, "status": status, "status_reason": reason, "fingerprint": fingerprint}


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------

def add_document(
    *,
    workspace_id: str,
    user_id: str,
    filename: str,
    data: bytes,
    title: Optional[str] = None,
    subject: Optional[str] = None,
    grade: Optional[str] = None,
    kind_hint: Optional[str] = None,
    authored_by_me: bool = True,
) -> Dict[str, Any]:
    read = read_document(data, filename, kind_hint)
    row = _insert(
        DOCUMENTS,
        {
            "workspace_id": workspace_id,
            "created_by": user_id,
            "title": (title or filename).strip()[:200] or "Untitled",
            "subject": normalise_subject(subject),
            "grade": grade,
            "authored_by_me": authored_by_me,
            "parser_version": PARSER_VERSION,
            **read,
        },
    )
    recompute(workspace_id)
    return public_document(row)


def public_document(row: Dict[str, Any]) -> Dict[str, Any]:
    """What the page shows for a file: no question excerpts, just the facts."""
    fp = row.get("fingerprint") or {}
    return {
        "id": row["id"],
        "title": row["title"],
        "file_type": row.get("file_type"),
        "kind": row["kind"],
        "kind_label": classify_mod.KIND_LABELS.get(row["kind"], row["kind"]),
        "subject": row.get("subject") or "",
        "grade": row.get("grade"),
        "authored_by_me": row.get("authored_by_me", True),
        "status": row["status"],
        "status_reason": row.get("status_reason"),
        "question_count": fp.get("question_count"),
        "total_marks": fp.get("total_marks"),
        "duration_minutes": fp.get("duration_minutes"),
        "slide_count": fp.get("slide_count"),
        "created_at": row.get("created_at"),
    }


def list_documents(workspace_id: str) -> List[Dict[str, Any]]:
    return [public_document(r) for r in reversed(_select(DOCUMENTS, workspace_id))]


def delete_document(workspace_id: str, document_id: str) -> bool:
    if not _select(DOCUMENTS, workspace_id, id=document_id):
        return False
    _delete(DOCUMENTS, workspace_id, document_id)
    recompute(workspace_id)
    return True


def forget_all(workspace_id: str) -> None:
    _delete(TRAITS, workspace_id)
    _delete(DOCUMENTS, workspace_id)


# ---------------------------------------------------------------------------
# Traits
# ---------------------------------------------------------------------------

def _key(t: Dict[str, Any]) -> Tuple[str, str, str]:
    return (t.get("subject") or "", t["kind"], t["key"])


def recompute(workspace_id: str) -> None:
    """Re-derive traits from the files and merge, never overriding a decision."""
    derived = {_key(t): t for t in derive_traits(_select(DOCUMENTS, workspace_id))}
    existing = {_key(t): t for t in _select(TRAITS, workspace_id)}

    for k, d in derived.items():
        facts = {"n_evidence": d["n_evidence"], "n_documents": d["n_documents"], "evidence": d["evidence"]}
        old = existing.get(k)
        if old is None:
            _insert(TRAITS, {"workspace_id": workspace_id, "subject": d["subject"], "kind": d["kind"], "key": d["key"],
                             "value": d["value"], "summary": d["summary"], "status": "suggested", "latest_value": None, **facts})
        elif old["status"] == "suggested":
            _update(TRAITS, workspace_id, old["id"], {"value": d["value"], "summary": d["summary"], "latest_value": None, **facts})
        elif old["status"] == "active":
            latest = None if d["value"] == old["value"] else {"value": d["value"], "summary": d["summary"]}
            _update(TRAITS, workspace_id, old["id"], {"latest_value": latest, **facts})
        elif old["status"] == "dismissed":
            if d["n_evidence"] >= 2 * max(1, old.get("n_evidence") or 0):
                _update(TRAITS, workspace_id, old["id"], {"status": "suggested", "value": d["value"], "summary": d["summary"], "latest_value": None, **facts})
            else:
                _update(TRAITS, workspace_id, old["id"], facts)
        elif old["status"] == "stale":
            _update(TRAITS, workspace_id, old["id"], {"status": "suggested", "value": d["value"], "summary": d["summary"], "latest_value": None, **facts})

    for k, old in existing.items():
        if k in derived:
            continue
        if old["status"] == "active":
            _update(TRAITS, workspace_id, old["id"], {"status": "stale", "evidence": [], "n_evidence": 0, "latest_value": None})
        elif old["status"] in ("suggested", "dismissed"):
            _delete(TRAITS, workspace_id, old["id"])


def list_traits(workspace_id: str) -> List[Dict[str, Any]]:
    order = {"active": 0, "suggested": 1, "stale": 2, "dismissed": 3}
    rows = _select(TRAITS, workspace_id)
    return sorted(
        [
            {
                "id": r["id"], "subject": r.get("subject") or "", "kind": r["kind"], "key": r["key"],
                "summary": r["summary"], "status": r["status"], "n_evidence": r.get("n_evidence", 0),
                "n_documents": r.get("n_documents", 0), "evidence": r.get("evidence") or [],
                "update": (r.get("latest_value") or {}).get("summary"),
            }
            for r in rows
        ],
        key=lambda t: (t["subject"], order.get(t["status"], 9), t["key"]),
    )


def decide(workspace_id: str, trait_id: str, action: str) -> Optional[Dict[str, Any]]:
    """The teacher's call on one trait: "use" or "dismiss"."""
    rows = _select(TRAITS, workspace_id, id=trait_id)
    if not rows:
        return None
    trait = rows[0]
    if action == "use":
        # On a stale trait this is the teacher keeping it with no files behind it: their call.
        patch: Dict[str, Any] = {"status": "active", "decided_at": _now()}
        latest = trait.get("latest_value")
        if trait["status"] == "active" and latest:
            patch.update(value=latest["value"], summary=latest["summary"], latest_value=None)
    elif action == "dismiss":
        patch = {"status": "dismissed", "decided_at": _now(), "latest_value": None}
    else:
        raise ValueError("action must be 'use' or 'dismiss'")
    _update(TRAITS, workspace_id, trait_id, patch)
    return next((t for t in list_traits(workspace_id) if t["id"] == trait_id), None)


def active_traits(workspace_id: str, subject: Optional[str], kind: str) -> Dict[str, Dict[str, Any]]:
    """key -> {value, summary} for generation. Subject traits win over subject-less ones.

    Never raises: a teacher's paper must not fail because their style
    couldn't be read. Whatever went wrong is logged and the paper is made
    without it.
    """
    try:
        rows = [r for r in _select(TRAITS, workspace_id, kind=kind) if r["status"] == "active"]
    except MemoryNotReady:
        return {}
    except Exception as e:  # noqa: BLE001 - see docstring
        logger.warning("Could not read teaching style for workspace %s: %s", workspace_id, e)
        return {}
    wanted = normalise_subject(subject)
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        if r.get("subject") == "":
            out.setdefault(r["key"], {"value": r["value"], "summary": r["summary"]})
    for r in rows:
        if r.get("subject") == wanted and wanted:
            out[r["key"]] = {"value": r["value"], "summary": r["summary"]}
    return out
