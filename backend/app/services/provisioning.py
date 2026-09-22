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
from typing import Any, Dict, List, Optional

import httpx

from app.core.auth import CurrentUser
from app.core.config import settings

_NS = uuid.NAMESPACE_URL

# In-memory fallback store, used only when Supabase isn't configured (local
# dev without a Supabase project / offline tests — see conftest.py). Mirrors
# the onboarding/preference columns migration 0004 adds to teacher_profiles,
# so the local fallback path stays behaviorally equivalent to the real one.
_local_profiles: Dict[str, Dict[str, Any]] = {}


def _default_local_profile() -> Dict[str, Any]:
    return {
        "onboarding_completed": False,
        "referral_verified": False,
        "subjects": [],
        "grades": [],
        "preferred_language": None,
        "preferred_difficulty": None,
    }


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
        return _ensure_workspace(client, user)


def _provision_local(user: CurrentUser) -> str:
    return _workspace_id(user)


def _ensure_workspace(client: httpx.Client, user: CurrentUser) -> str:
    """Ensure a default workspace exists for the teacher. Returns its id."""
    base = settings.supabase_url.rstrip("/")
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


def _workspace_id(user: CurrentUser) -> str:
    return str(uuid.uuid5(_NS, f"vivran:workspace:{user.user_id}"))


def local_workspace_id(user_id: str) -> str:
    """Deterministic pseudo-workspace id used for offline/tests."""
    return str(uuid.uuid5(_NS, f"vivran:workspace:{user_id}"))


# ----------------------------------------------------------------------------
# Full profile provisioning — onboarding status + saved preferences.
#
# Used by POST /auth/provision (called on every login/signup) so the frontend
# knows whether to show the first-time onboarding wizard and can prefill the
# smart-creation-box defaults from whatever preferences are already saved.
# ----------------------------------------------------------------------------


def _profile_state(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    row = row or {}
    return {
        # Fail OPEN if the column is missing (migration 0004 hasn't been run
        # against this Supabase project yet): treat the teacher as already
        # onboarded rather than force *everyone* — including pre-existing
        # accounts — through a wizard the backend can't even persist yet.
        # Once the migration runs, the key is always present and real values
        # (backfilled `true` for old rows, `false` for new ones) take over.
        "onboarding_completed": bool(row["onboarding_completed"]) if "onboarding_completed" in row else True,
        # Same fail-open reasoning as onboarding_completed above: if
        # migration 0005 hasn't been run yet on this Supabase project, treat
        # everyone as already verified rather than lock every teacher out of
        # a product they may have already been using.
        "referral_verified": bool(row["referral_verified"]) if "referral_verified" in row else True,
        "subjects": row.get("subjects") or [],
        "grades": row.get("grades") or [],
        "preferred_language": row.get("preferred_language"),
        "preferred_difficulty": row.get("preferred_difficulty"),
    }


def provision_teacher_full(user: CurrentUser) -> Dict[str, Any]:
    """Upsert teacher profile + workspace; return workspace id + onboarding state."""
    if settings.supabase_url and settings.supabase_service_role_key:
        return _provision_supabase_full(user)
    return _provision_local_full(user)


def _provision_supabase_full(user: CurrentUser) -> Dict[str, Any]:
    base = settings.supabase_url.rstrip("/")
    with httpx.Client(timeout=10.0) as client:
        profile_body = {
            "user_id": user.user_id,
            "name": user.full_name or user.username or user.email or "Teacher",
            "avatar_url": user.avatar_url or "",
        }
        resp = client.post(
            f"{base}/rest/v1/teacher_profiles",
            json=profile_body,
            headers={**_default_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
            params={"on_conflict": "user_id"},
        )
        rows = resp.json() if resp.status_code in (200, 201) else []
        row = rows[0] if isinstance(rows, list) and rows else None

        if row is None:
            # Some PostgREST configs don't return a representation on an
            # upsert conflict path; fall back to an explicit read.
            got = client.get(
                f"{base}/rest/v1/teacher_profiles",
                headers=_default_headers(),
                params={"user_id": f"eq.{user.user_id}", "select": "*", "limit": "1"},
            )
            got_rows = got.json() if got.status_code == 200 else []
            row = got_rows[0] if got_rows else None

        workspace_id = _ensure_workspace(client, user)

    return {"workspace_id": workspace_id, **_profile_state(row)}


def _provision_local_full(user: CurrentUser) -> Dict[str, Any]:
    profile = _local_profiles.setdefault(user.user_id, _default_local_profile())
    return {"workspace_id": _workspace_id(user), **profile}


def save_teacher_preferences(
    user: CurrentUser,
    *,
    subjects: List[str],
    grades: List[str],
    preferred_language: Optional[str],
    preferred_difficulty: Optional[str],
) -> Dict[str, Any]:
    """Persists the onboarding wizard's answers and marks onboarding complete.

    Called by PUT /auth/preferences. A teacher_profiles row always exists by
    this point (provisioning runs on every login before this is reachable),
    so this updates rather than upserts.
    """
    if settings.supabase_url and settings.supabase_service_role_key:
        return _save_preferences_supabase(user, subjects, grades, preferred_language, preferred_difficulty)
    return _save_preferences_local(user, subjects, grades, preferred_language, preferred_difficulty)


def _save_preferences_supabase(
    user: CurrentUser,
    subjects: List[str],
    grades: List[str],
    preferred_language: Optional[str],
    preferred_difficulty: Optional[str],
) -> Dict[str, Any]:
    base = settings.supabase_url.rstrip("/")
    body = {
        "subjects": subjects,
        "grades": grades,
        "preferred_language": preferred_language,
        "preferred_difficulty": preferred_difficulty,
        "onboarding_completed": True,
    }
    with httpx.Client(timeout=10.0) as client:
        resp = client.patch(
            f"{base}/rest/v1/teacher_profiles",
            json=body,
            headers=_default_headers(),
            params={"user_id": f"eq.{user.user_id}"},
        )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Failed to save preferences ({resp.status_code}): {resp.text}")
    rows = resp.json() if resp.content else []
    row = rows[0] if isinstance(rows, list) and rows else body
    return _profile_state(row)


def _save_preferences_local(
    user: CurrentUser,
    subjects: List[str],
    grades: List[str],
    preferred_language: Optional[str],
    preferred_difficulty: Optional[str],
) -> Dict[str, Any]:
    profile = _local_profiles.setdefault(user.user_id, _default_local_profile())
    profile.update(
        {
            "subjects": subjects,
            "grades": grades,
            "preferred_language": preferred_language,
            "preferred_difficulty": preferred_difficulty,
            "onboarding_completed": True,
        }
    )
    return dict(profile)


def verify_and_mark_referral(user: CurrentUser, code: str) -> bool:
    """Authenticated counterpart to the pre-signup /auth/verify-referral check.

    This is the ONE gate TeacherLayout actually trusts (see referral-gate.tsx)
    — it persists the result against the authenticated user's own id, so it
    covers every sign-in path, including "Continue with Google" where
    Supabase creates the auth.users row automatically on the OAuth callback,
    well before the app has any chance to ask for a code up front.
    """
    if code.strip() != settings.referral_code:
        return False

    if settings.supabase_url and settings.supabase_service_role_key:
        base = settings.supabase_url.rstrip("/")
        with httpx.Client(timeout=10.0) as client:
            client.post(
                f"{base}/rest/v1/teacher_profiles",
                json={
                    "user_id": user.user_id,
                    "name": user.full_name or user.username or user.email or "Teacher",
                    "referral_verified": True,
                },
                headers={**_default_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
                params={"on_conflict": "user_id"},
            )
    else:
        profile = _local_profiles.setdefault(user.user_id, _default_local_profile())
        profile["referral_verified"] = True

    return True


def delete_teacher_account(user: CurrentUser) -> None:
    """Permanently deletes the teacher's application data + Supabase Auth user.

    Always keyed off ``user.user_id`` from the verified JWT (see
    app/api/auth.py's ``DELETE /auth/account``) — never a client-supplied id.
    """
    if settings.supabase_url and settings.supabase_service_role_key:
        _delete_account_supabase(user.user_id)
    else:
        _local_profiles.pop(user.user_id, None)


def _delete_account_supabase(user_id: str) -> None:
    base = settings.supabase_url.rstrip("/")
    headers = _default_headers()
    with httpx.Client(timeout=15.0) as client:
        # Defense in depth: teacher_profiles.user_id and workspaces.owner_id
        # both carry `ON DELETE CASCADE` to auth.users (see
        # backend/migrations/RESET_full_rebuild.sql), and every other app
        # table cascades transitively off workspace_id, so deleting the
        # workspace below already cleans up courses/materials/source_chunks/
        # projects/project_blocks/artifacts/assessments/questions/
        # question_versions/media_assets/generation_jobs for the normal case.
        #
        # projects.created_by, assessments.created_by, and
        # generation_jobs.user_id ALSO reference auth.users(id) directly, but
        # WITHOUT ON DELETE CASCADE — and projects.workspace_id is nullable,
        # so a row ever created without one wouldn't be reached by the
        # workspace cascade and would block the Auth user delete with a
        # foreign-key violation. Delete those directly first so account
        # deletion can never fail on that edge case.
        client.delete(f"{base}/rest/v1/projects", headers=headers, params={"created_by": f"eq.{user_id}"})
        client.delete(f"{base}/rest/v1/assessments", headers=headers, params={"created_by": f"eq.{user_id}"})
        client.delete(f"{base}/rest/v1/generation_jobs", headers=headers, params={"user_id": f"eq.{user_id}"})

        # Normal path — cascades to everything hung off workspace_id.
        client.delete(f"{base}/rest/v1/workspaces", headers=headers, params={"owner_id": f"eq.{user_id}"})
        client.delete(f"{base}/rest/v1/teacher_profiles", headers=headers, params={"user_id": f"eq.{user_id}"})

        # Finally, delete the actual Supabase Auth user via the Admin API.
        resp = client.delete(
            f"{base}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
            },
        )
    if resp.status_code not in (200, 204):
        raise RuntimeError(f"Supabase admin user delete failed ({resp.status_code}): {resp.text}")


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