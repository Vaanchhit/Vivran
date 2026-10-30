"""The teacher's saved work: every generated item, kept so it can be reopened.

One item = one ``projects`` row (what the Recent list shows: title, type, dates,
owned by a workspace) + one ``artifacts`` row holding the full result exactly
as the frontend received it. Reopening hands that result back to the page that
made it, so a saved item renders through the same code as a fresh one.

Saving is best effort by design: a teacher who has just waited for a paper
must still get it if the database hiccups. Failures are logged, never raised.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.core.logging import logger
from app.services.supabase_service import (
    SupabaseError,
    delete_storage_keys,
    is_configured,
    signed_url,
    table_delete,
    table_insert,
    table_select,
    table_update,
)

KINDS = {
    "course_plan": "Course plan",
    "slides": "Slide deck",
    "worksheet": "Worksheet",
    "lesson_notes": "Lesson notes",
    "interactive": "Interactive coursework",
    "example": "Intuitive example",
    "assessment": "Exam paper",
    "narration": "Narration audio",
    "image": "Image",
    "video": "Video",
}
MEDIA_KINDS = {"narration", "image", "video"}
TITLE_MAX = 120
LIST_FIELDS = "id,title,type,status,created_at,updated_at"


def playable(result: Any) -> Any:
    """Swaps a stored media key for a fresh signed link, keeping the key.

    Media services store files and return the object KEY, which is what gets
    saved (a link would expire). Anything shown to a browser goes through here.
    Non-media results, and anything that is not a dict, pass through untouched.
    """
    if not isinstance(result, dict):
        return result
    url = result.get("media_url")
    if not isinstance(url, str) or not url or url.startswith(("http://", "https://")):
        return result
    link = signed_url(url) if is_configured() else None
    return {**result, "media_key": url, "media_url": link or ""}


def worth_saving(kind: str, result: Any) -> bool:
    """Only real output is saved: never an error envelope or an empty paper."""
    if kind not in KINDS or not isinstance(result, dict) or result.get("error"):
        return False
    if kind in MEDIA_KINDS:
        return result.get("status") == "ready" and bool(result.get("media_url"))
    if kind == "assessment":
        return bool(result.get("assessment"))
    return True


def title_for(kind: str, result: Dict[str, Any], params: Dict[str, Any]) -> str:
    assessment = result.get("assessment") if isinstance(result.get("assessment"), dict) else {}
    context = result.get("context") if isinstance(result.get("context"), dict) else {}
    raw = (
        result.get("title")
        or assessment.get("title")
        or context.get("topic")
        or params.get("title")
        or params.get("topic")
        or ", ".join(params.get("topics") or [])
        or params.get("prompt")
        or params.get("script")
        or KINDS.get(kind, "Untitled")
    )
    text = " ".join(str(raw).split())
    return text if len(text) <= TITLE_MAX else text[: TITLE_MAX - 1].rstrip() + "…"


def save_item(
    *,
    workspace_id: Optional[str],
    user_id: str,
    kind: str,
    title: str,
    content: Dict[str, Any],
    params: Optional[Dict[str, Any]] = None,
    project_id: Optional[str] = None,
) -> Optional[str]:
    """Store one item; returns its id, or None when it could not be saved.

    ``project_id`` reuses a projects row that already exists (course plans
    write their own), so the same plan is never listed twice.
    """
    if not is_configured() or not workspace_id or kind not in KINDS:
        return None
    try:
        if project_id is None:
            row = table_insert(
                "projects",
                {
                    "workspace_id": workspace_id,
                    "created_by": user_id,
                    "title": title,
                    "type": kind,
                    "specification_json": params or {},
                    "status": "ready",
                },
            )
            project_id = row["id"]
        table_insert("artifacts", {"project_id": project_id, "type": kind, "title": title, "content_json": content})
        # A saved paper owns its assessment row, so deleting the item removes the
        # questions too (assessments.project_id cascades).
        if kind == "assessment" and content.get("assessment_id"):
            table_update("assessments", {"id": f"eq.{content['assessment_id']}"}, {"project_id": project_id})
        return project_id
    except SupabaseError as e:
        logger.warning("Saving %s '%s' to the library failed (the teacher still has the result): %s", kind, title, e)
        return None


# From each item's parameters, the few that say what it is about: enough for the
# chat's teaching-memory map to place it under a class and a topic, without
# shipping every stored spec (a course plan's spec can hold the whole plan).
_META_KEYS = ("grade", "subject", "topic", "topics", "concept")


def _meta(spec: Any) -> Dict[str, Any]:
    if not isinstance(spec, dict):
        return {}
    out = {k: spec[k] for k in _META_KEYS if spec.get(k)}
    if isinstance(out.get("topics"), list):
        out["topics"] = [str(t)[:120] for t in out["topics"][:5]]
    return out


def list_items(workspace_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    rows = table_select(
        "projects",
        {"workspace_id": f"eq.{workspace_id}", "select": LIST_FIELDS + ",specification_json", "order": "created_at.desc", "limit": str(limit)},
    )
    return [{**{k: v for k, v in r.items() if k != "specification_json"}, "meta": _meta(r.get("specification_json"))} for r in rows]


def get_item(workspace_id: str, item_id: str) -> Optional[Dict[str, Any]]:
    rows = table_select("projects", {"id": f"eq.{item_id}", "workspace_id": f"eq.{workspace_id}"})
    if not rows:
        return None
    project = rows[0]
    arts = table_select("artifacts", {"project_id": f"eq.{item_id}", "order": "created_at.desc", "limit": "1"})
    spec = project.get("specification_json") or {}
    if arts:
        content = arts[0].get("content_json")
    elif project.get("type") == "course_plan" and spec.get("course_plan"):
        # Course plans saved before the library existed kept the plan in the spec.
        content = spec["course_plan"]
    else:
        content = None
    return {
        "id": project["id"],
        "title": project.get("title"),
        "type": project.get("type"),
        "created_at": project.get("created_at"),
        "updated_at": project.get("updated_at"),
        "params": {k: v for k, v in spec.items() if k != "course_plan"},
        "content": playable(content),
    }


def rename_item(workspace_id: str, item_id: str, title: str) -> bool:
    title = " ".join(title.split())[:TITLE_MAX]
    rows = table_update("projects", {"id": f"eq.{item_id}", "workspace_id": f"eq.{workspace_id}"}, {"title": title})
    if not rows:
        return False
    table_update("artifacts", {"project_id": f"eq.{item_id}"}, {"title": title})
    return True


def update_content(workspace_id: str, item_id: str, content: Any) -> bool:
    """Replace a saved item's content (e.g. a deck after the teacher added a slide). Scoped to the workspace."""
    if not table_select("projects", {"id": f"eq.{item_id}", "workspace_id": f"eq.{workspace_id}", "select": "id"}):
        return False
    table_update("artifacts", {"project_id": f"eq.{item_id}"}, {"content_json": content})
    return True


def _media_keys(project_ids: List[str]) -> List[str]:
    """Stored-file keys held by these items' saved content (audio, images, video)."""
    if not project_ids:
        return []
    arts = table_select("artifacts", {"project_id": f"in.({','.join(project_ids)})", "select": "type,content_json"})
    keys = []
    for a in arts:
        url = (a.get("content_json") or {}).get("media_url") if a.get("type") in MEDIA_KINDS else None
        if isinstance(url, str) and url and not url.startswith(("http://", "https://")):
            keys.append(url)
    return keys


def delete_item(workspace_id: str, item_id: str) -> bool:
    """Deletes the item and its stored file; artifacts, and a paper's
    assessment and questions, cascade. The file goes first: a row pointing at
    a missing file is harmless, a file nobody can find is not."""
    if not table_select("projects", {"id": f"eq.{item_id}", "workspace_id": f"eq.{workspace_id}", "select": "id"}):
        return False
    keys = _media_keys([item_id])
    if keys:
        delete_storage_keys(keys)
    table_delete("projects", {"id": f"eq.{item_id}", "workspace_id": f"eq.{workspace_id}"})
    return True


def delete_workspace_media(workspace_id: str) -> int:
    """Account deletion: stored media lives outside the workspace's folder, so no prefix delete reaches it."""
    ids = [r["id"] for r in table_select("projects", {"workspace_id": f"eq.{workspace_id}", "select": "id"})]
    keys = _media_keys(ids)
    if keys:
        delete_storage_keys(keys)
    return len(keys)
