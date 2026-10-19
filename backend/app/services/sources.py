"""Sources: one upload that can do two jobs.

A teacher's file can be evidence (what is true: chapters, facts, page numbers)
and it can be a habit (how they set papers and build decks). These used to be
two uploads on two pages. Now one upload decides both, and says what it did:

  facts  the file is chunked, embedded and searchable (materials + source_chunks)
         so generated work can cite it.
  style  the file is fingerprinted (history_documents) so Vivran can suggest the
         teacher's own paper layout, marks, slide count. Only the fingerprint is
         kept; the teacher still accepts each learned pattern before it is used.

The link between the two halves lives in ``materials.metadata.style_document_id``,
so deleting the source removes both. Student work is refused for BOTH jobs: a
script with a filled-in name and roll number should not become searchable
grounding either.

Rule kept everywhere downstream: style never overrides facts. Style shapes the
container (sections, marks, length); facts fill it.
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from app.core.logging import logger
from app.memory import store
from app.memory.text import file_type_for
from app.services import supabase_service as sb

# What a file teaches about the teacher's habits. Notes and textbooks teach facts only.
STYLE_KINDS = ("exam_paper", "worksheet", "slides", "lesson_plan")


class SourceRefused(ValueError):
    """A message for the teacher (student work, unreadable file)."""


def decide_style(learn_style: str, kind: str, authored_by_me: bool) -> tuple[bool, str]:
    """Whether to learn style from a file, and the reason in the teacher's words."""
    if learn_style == "no":
        return False, "You chose not to learn style from this file."
    if kind not in STYLE_KINDS:
        return False, "This looks like notes or a textbook, so it's used for facts only."
    if learn_style == "yes":
        return True, "You asked Vivran to learn your style from this file."
    if not authored_by_me:
        return False, "You didn't write this file, so your style isn't learned from it."
    label = {"exam_paper": "an exam paper", "worksheet": "a worksheet", "slides": "a slide deck", "lesson_plan": "a lesson plan"}[kind]
    return True, f"This looks like {label} you made, so Vivran learns its layout. Nothing is used until you accept it."


def add_source(
    *,
    workspace_id: str,
    user_id: str,
    title: str,
    material_type: str,
    file_bytes: Optional[bytes],
    filename: Optional[str],
    content_type: str,
    external_url: Optional[str],
    subject: Optional[str],
    grade: Optional[str],
    use_for_facts: bool,
    learn_style: str,
    authored_by_me: bool,
    ingest: Callable[..., Dict[str, Any]],
) -> Dict[str, Any]:
    if not use_for_facts and learn_style == "no":
        raise SourceRefused("Choose at least one: use it for facts, or learn your style from it.")

    read: Optional[Dict[str, Any]] = None
    style_ok, style_reason = False, "Style is learned from files, not links."
    if file_bytes is not None and filename and file_type_for(filename):
        try:
            read = store.read_document(file_bytes, filename)
        except store.StudentWorkRefused as e:
            raise SourceRefused(str(e)) from e
        except Exception as e:  # unreadable for style; facts ingestion has its own reader
            logger.info("Style read skipped for %s: %s", filename, e)
            read = None
        if read:
            style_ok, style_reason = decide_style(learn_style, read["kind"], authored_by_me)

    style_doc: Optional[Dict[str, Any]] = None
    if style_ok and read is not None:
        style_doc = store.add_document(
            workspace_id=workspace_id, user_id=user_id, filename=filename or "upload", data=b"",
            title=title, subject=subject, grade=grade, authored_by_me=authored_by_me, read=read,
        )

    material: Optional[Dict[str, Any]] = None
    if use_for_facts:
        material = ingest(
            workspace_id=workspace_id, title=title, material_type=material_type, created_by=user_id,
            file_bytes=file_bytes, filename=filename, content_type=content_type, external_url=external_url,
            subject=subject, grade=grade,
            extra_metadata={"style_document_id": style_doc["id"]} if style_doc else None,
        )
        if material.get("processing_status") == "FAILED" and style_doc is None:
            raise SourceRefused(material.get("error") or "Couldn't read that file.")

    return {
        "material": material,
        "style": {
            "learned": style_doc is not None,
            "reason": style_reason,
            "kind": read["kind"] if read else None,
            "document": style_doc,
        },
        "facts": {
            "used": bool(material and material.get("processing_status") != "FAILED"),
            "reason": ("Searchable: generated work can cite its pages." if material and material.get("processing_status") != "FAILED"
                       else (material or {}).get("error") or "You chose not to use this file for facts."),
        },
    }


def _materials(workspace_id: str) -> List[Dict[str, Any]]:
    if not sb.is_configured():
        return []
    return sb.table_select("materials", {"workspace_id": f"eq.{workspace_id}", "order": "created_at.desc"})


def list_sources(workspace_id: str, materials: Optional[List[Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """Every file the teacher gave Vivran, with what it is used for."""
    mats = _materials(workspace_id) if materials is None else materials
    try:
        docs = {d["id"]: d for d in store.list_documents(workspace_id)}
    except store.MemoryNotReady:
        docs = {}
    out: List[Dict[str, Any]] = []
    linked: set = set()
    for m in mats:
        meta = m.get("metadata") or {}
        doc = docs.get(meta.get("style_document_id") or "")
        if doc:
            linked.add(doc["id"])
        out.append({
            "id": m["id"], "title": m.get("title"), "type": m.get("type"), "subject": m.get("subject"), "grade": m.get("grade"),
            "created_at": m.get("created_at"),
            "facts": {"status": m.get("processing_status"), "chunks": meta.get("chunk_count")},
            "style": ({"document_id": doc["id"], "kind": doc.get("kind"), "status": doc.get("status"), "reason": doc.get("status_reason")} if doc else None),
        })
    # Files uploaded only to teach style (before the two were merged, or with facts off).
    for d in docs.values():
        if d["id"] in linked:
            continue
        out.append({
            "id": f"style:{d['id']}", "title": d.get("title"), "type": d.get("file_type"), "subject": d.get("subject") or None,
            "grade": d.get("grade"), "created_at": d.get("created_at"), "facts": None,
            "style": {"document_id": d["id"], "kind": d.get("kind"), "status": d.get("status"), "reason": d.get("status_reason")},
        })
    out.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return out


def delete_source(workspace_id: str, source_id: str) -> bool:
    """Remove a source and everything learned from it: chunks, stored file, style fingerprint."""
    if source_id.startswith("style:"):
        return store.delete_document(workspace_id, source_id.split(":", 1)[1])
    if not sb.is_configured():
        return False
    rows = sb.table_select("materials", {"id": f"eq.{source_id}", "workspace_id": f"eq.{workspace_id}"})
    if not rows:
        return False
    m = rows[0]
    style_id = (m.get("metadata") or {}).get("style_document_id")
    if style_id:
        try:
            store.delete_document(workspace_id, style_id)
        except store.MemoryNotReady:
            pass
    if m.get("storage_path"):
        try:
            sb.delete_storage_keys([m["storage_path"]])
        except sb.SupabaseError as e:
            logger.warning("Couldn't delete stored file for material %s: %s", source_id, e)
    sb.table_delete("materials", {"id": f"eq.{source_id}", "workspace_id": f"eq.{workspace_id}"})  # chunks cascade
    return True


def stop_learning_style(workspace_id: str, source_id: str) -> bool:
    """Keep the file for facts, forget the style it taught."""
    if not sb.is_configured():
        return False
    rows = sb.table_select("materials", {"id": f"eq.{source_id}", "workspace_id": f"eq.{workspace_id}"})
    if not rows:
        return False
    meta = dict(rows[0].get("metadata") or {})
    style_id = meta.pop("style_document_id", None)
    if style_id:
        store.delete_document(workspace_id, style_id)
        sb.table_update("materials", {"id": f"eq.{source_id}"}, {"metadata": meta})
    return True
