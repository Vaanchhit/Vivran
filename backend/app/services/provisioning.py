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
from app.core.logging import logger
from app.services import library
from app.services.supabase_service import SupabaseError, delete_storage_prefix, table_delete, table_select, table_upsert

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
    return ensure_teacher_session(user)["workspace_id"]


def ensure_teacher_session(user: CurrentUser) -> Dict[str, Any]:
    """Upsert profile + workspace and return what every protected request needs.

    Returns ``{"workspace_id", "referral_verified"}``. Deliberately ONE
    function doing both, because ``require_workspace_id`` and
    ``require_verified_teacher`` both run on every protected request and
    FastAPI caches a shared sub-dependency per request (see
    app/api/deps.py's ``teacher_session``) — splitting them would double the
    Supabase round-trips on every single API call.

    Raises ``RuntimeError`` if Supabase is configured but the writes fail, so
    callers never proceed against a workspace that doesn't exist.
    """
    if settings.supabase_url and settings.supabase_service_role_key:
        with httpx.Client(timeout=10.0) as client:
            row = _upsert_profile(client, user)
            workspace_id = _ensure_workspace(client, user)
        return {"workspace_id": workspace_id, "referral_verified": _profile_state(row)["referral_verified"]}

    profile = _local_profiles.setdefault(user.user_id, _default_local_profile())
    return {"workspace_id": _workspace_id(user), "referral_verified": bool(profile["referral_verified"])}


def _default_headers() -> Dict[str, str]:
    return {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _upsert_profile(client: httpx.Client, user: CurrentUser) -> Optional[Dict[str, Any]]:
    """Upsert the teacher_profiles row and return it (None if unreadable).

    Only the *identity* columns are written here. Never send referral_verified
    or onboarding_completed from this path: it runs on every authenticated
    request, and an upsert carrying those columns would reset them on each
    call, silently un-verifying teachers who had already passed the gate.
    """
    base = settings.supabase_url.rstrip("/")
    resp = client.post(
        f"{base}/rest/v1/teacher_profiles",
        json={
            "user_id": user.user_id,
            "name": user.full_name or user.username or user.email or "Teacher",
            "avatar_url": user.avatar_url or "",
        },
        headers={**_default_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        params={"on_conflict": "user_id"},
    )
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"Teacher profile upsert failed ({resp.status_code}): {resp.text[:300]}")

    rows = resp.json() if resp.content else []
    if isinstance(rows, list) and rows:
        return rows[0]

    # Some PostgREST configs don't return a representation on an upsert
    # conflict path; fall back to an explicit read.
    got = client.get(
        f"{base}/rest/v1/teacher_profiles",
        headers=_default_headers(),
        params={"user_id": f"eq.{user.user_id}", "select": "*", "limit": "1"},
    )
    got_rows = got.json() if got.status_code == 200 else []
    return got_rows[0] if got_rows else None


def _ensure_workspace(client: httpx.Client, user: CurrentUser) -> str:
    """Ensure a default workspace exists for the teacher. Returns its id."""
    base = settings.supabase_url.rstrip("/")
    existing = client.get(
        f"{base}/rest/v1/workspaces",
        headers=_default_headers(),
        params={"owner_id": f"eq.{user.user_id}", "select": "id", "limit": "1"},
    )
    if existing.status_code != 200:
        raise RuntimeError(f"Workspace lookup failed ({existing.status_code}): {existing.text[:300]}")
    rows = existing.json()
    if rows:
        return rows[0]["id"]

    created = client.post(
        f"{base}/rest/v1/workspaces",
        json={"owner_id": user.user_id, "name": f"{user.full_name or user.username or 'Teacher'}'s Workspace"},
        headers=_default_headers(),
    )
    data = created.json() if created.content else None
    if created.status_code in (200, 201):
        if isinstance(data, list) and data:
            return data[0]["id"]
        if isinstance(data, dict) and data.get("id"):
            return data["id"]

    # Deliberately NOT falling back to _workspace_id(user) here. That uuid5
    # value is a real row only on the offline path; against Supabase it names
    # a workspace that doesn't exist, and because require_workspace_id derives
    # the same value the scoping check would *pass* — after which every
    # downstream insert dies on the workspace_id foreign key and the teacher's
    # generated work is silently discarded. Fail loudly instead.
    raise RuntimeError(f"Workspace provisioning failed ({created.status_code}): {created.text[:300]}")


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
    with httpx.Client(timeout=10.0) as client:
        row = _upsert_profile(client, user)
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
    # An empty submitted code can never pass, even if REFERRAL_CODE is
    # accidentally set to "" on the host — otherwise clearing the env var
    # would silently turn the beta gate into a no-op that still reports
    # "valid", which is worse than a gate that refuses everyone.
    if not code.strip() or code.strip() != settings.referral_code:
        return False

    if settings.supabase_url and settings.supabase_service_role_key:
        # The status of this write MUST be checked. Returning True on a failed
        # upsert lets the teacher through for exactly one session; the next
        # /auth/provision reads referral_verified=false and re-gates them, and
        # re-entering the same (correct) code "succeeds" again — an invisible
        # loop with no way for the teacher to tell they aren't stuck on a typo.
        try:
            table_upsert(
                "teacher_profiles",
                {
                    "user_id": user.user_id,
                    "name": user.full_name or user.username or user.email or "Teacher",
                    "referral_verified": True,
                },
                on_conflict="user_id",
            )
        except SupabaseError as e:
            # Same fail-open-on-missing-column rule as _profile_state below:
            # if migration 0005 hasn't been applied to this project yet the
            # column doesn't exist, PostgREST rejects the whole upsert, and
            # everyone already reads as verified anyway. Any OTHER failure is
            # a real one and must surface (the route turns it into a 502).
            if "referral_verified" not in str(e):
                raise
            logger.warning("referral_verified column missing (migration 0005 not applied?): %s", e)
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
    #
    # Each of these is status-checked (table_delete raises): a "deleted"
    # account whose rows are actually still there is worse than a visible
    # error, because the teacher has been told their data is gone.
    # Uploaded files live in Storage under materials/<workspace_id>/, which no
    # database cascade reaches. Removed first: if this fails, nothing else has
    # been deleted yet and the teacher sees an error rather than a "deleted"
    # account whose files are still stored.
    for ws in table_select("workspaces", {"owner_id": f"eq.{user_id}", "select": "id"}):
        removed = delete_storage_prefix("materials", str(ws["id"])) + library.delete_workspace_media(str(ws["id"]))
        logger.info("Account deletion removed %s stored file(s) for workspace %s", removed, ws["id"])

    table_delete("projects", {"created_by": f"eq.{user_id}"})
    table_delete("assessments", {"created_by": f"eq.{user_id}"})
    table_delete("generation_jobs", {"user_id": f"eq.{user_id}"})

    # Normal path — cascades to everything hung off workspace_id.
    table_delete("workspaces", {"owner_id": f"eq.{user_id}"})
    table_delete("teacher_profiles", {"user_id": f"eq.{user_id}"})

    # Finally, delete the actual Supabase Auth user via the Admin API
    # (not PostgREST, so it can't go through supabase_service).
    with httpx.Client(timeout=15.0) as client:
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