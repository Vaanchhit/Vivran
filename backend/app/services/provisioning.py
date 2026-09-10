"""Teacher provisioning on first login (§34).

When a teacher authenticates for the first time we upsert a row in
``teacher_profiles`` and ensure a default ``workspaces`` row owned by them.

Where Supabase is configured this hits PostgREST with the service-role key
(server-side only). Without Supabase (local dev / tests) a deterministic
pseudo workspace id is derived from the user id so the whole flow stays
testable offline.
"""
from __future__ import annotations

import uuid
from typing import Dict, Optional

import httpx

from app.core.auth import CurrentUser
from app.core.config import settings

_NS = uuid.NAMESPACE_URL


def ensure_teacher_workspace(user: CurrentUser) -> str:
    """Upsert teacher profile + default workspace. Returns the workspace id."""
    if settings.supabase_url and settings.supabase_service_role_key:
        return _provision_supabase(user)
    return _provision_local(user)


def _default_headers() -> Dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _provision_supabase(user: CurrentUser) -> str:
    base = settings.supabase_url.rstrip("/")

    # 1) Upsert teacher profile on user_id
    with httpx.Client(timeout=10.0) as client:
        profile = {
            "user_id": user.user_id,
            "name": user.full_name or user.username or user.email or "Teacher",
            "avatar_url": user.avatar_url or "",
        }
        client.post(
            f"{base}/rest/v1/teacher_profiles",
            json=profile,
            headers={**_default_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
            params={"on_conflict": "user_id"},
        )

        # 2) Ensure a default workspace exists for the teacher
        existing = client.get(
            f"{base}/rest/v1/workspaces",
            headers=_default_headers(),
            params={"owner_id": f"eq.{user.user_id}", "select": "id", "limit": "1"},
        )
        rows = existing.json() if existing.status_code == 200 else []
        if rows:
            return rows[0]["id"]

        created = client.post(
            f"{base}/rest/v1/workspaces",
            json={"owner_id": user.user_id, "name": f"{user.full_name or user.username or 'Teacher'}'s Workspace"},
            headers=_default_headers(),
        )
        data = created.json()
        if created.status_code in (200, 201) and isinstance(data, list) and data:
            return data[0]["id"]
        if isinstance(data, dict) and data.get("id"):
            return data["id"]

    # Fallback: deterministic id derived from the user so downstream scoping stays consistent
    return _workspace_id(user)


def _provision_local(user: CurrentUser) -> str:
    return _workspace_id(user)


def _workspace_id(user: CurrentUser) -> str:
    return str(uuid.uuid5(_NS, f"vivran:workspace:{user.user_id}"))


def local_workspace_id(user_id: str) -> str:
    """Deterministic pseudo-workspace id used for offline/tests."""
    return str(uuid.uuid5(_NS, f"vivran:workspace:{user_id}"))


def lookup_user(access_token: str) -> Optional[Dict]:
    """Resolve the authenticated user from Supabase /auth/v1/user (validates token server-side)."""
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url, headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {access_token}"})
            if r.status_code == 200:
                return r.json()
    except httpx.HTTPError:
        pass
    return None