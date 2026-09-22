"""Auth API — session provisioning, preferences, and account lifecycle for teachers."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, require_teacher
from app.core.auth import CurrentUser
from app.core.config import settings
from app.services.provisioning import (
    delete_teacher_account,
    provision_teacher_full,
    save_teacher_preferences,
    verify_and_mark_referral,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class ReferralCodeCheck(BaseModel):
    code: str


@router.post("/verify-referral")
def verify_referral(payload: ReferralCodeCheck) -> dict:
    """Checks a beta-access referral code — no auth required (there is no
    session yet at signup time). The frontend calls this BEFORE attempting
    supabase.auth.signUp(), so account creation itself stays gated behind a
    correct code while the product is invite-only. Deliberately checked
    server-side rather than as a literal string in frontend code, which
    would ship the real code in plain text in the JS bundle.
    """
    valid = payload.code.strip() == settings.referral_code
    return {"valid": valid}


@router.post("/verify-referral-account")
def verify_referral_account(payload: ReferralCodeCheck, user: CurrentUser = Depends(require_teacher)) -> dict:
    """The authoritative referral gate — checked AFTER authentication, on an
    already-signed-in user. Persists the result against user.user_id so it
    sticks across future logins. TeacherLayout blocks access to the product
    (via referral-gate.tsx) until this returns valid=true.

    Unlike /verify-referral above (which only gates supabase.auth.signUp()
    for the email/password form), this also covers "Continue with Google" —
    Supabase creates the account automatically on the OAuth callback, so
    there's no "before signup" moment to intercept for that flow. This is
    the one gate that can't be bypassed by switching sign-in methods.
    """
    valid = verify_and_mark_referral(user, payload.code)
    return {"valid": valid}


@router.post("/provision")
def provision_workspace(user: CurrentUser = Depends(require_teacher)) -> dict:
    """Upsert teacher_profile + default workspace on first login.

    Call this once after the frontend receives a session; the returned
    workspace_id must be sent as the ``Workspace-Id`` header on protected
    calls. Also returns the teacher's onboarding status and any saved
    preferences (subjects/grades/language/difficulty) so the frontend can
    decide whether to show the first-time onboarding wizard and can prefill
    the smart-creation defaults from what's already saved.
    """
    data = provision_teacher_full(user)
    return {
        "status": "provisioned",
        "user_id": user.user_id,
        "email": user.email,
        "full_name": user.full_name,
        "workspace_id": data["workspace_id"],
        "onboarding_completed": data["onboarding_completed"],
        "referral_verified": data["referral_verified"],
        "subjects": data["subjects"],
        "grades": data["grades"],
        "preferred_language": data["preferred_language"],
        "preferred_difficulty": data["preferred_difficulty"],
    }


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user)) -> dict:
    """Return the authenticated user payload (token already validated)."""
    return {
        "user_id": user.user_id,
        "email": user.email,
        "full_name": user.full_name,
        "username": user.username,
        "role": user.role,
        "workspace_id": user.workspace_id,
    }


class PreferencesUpdate(BaseModel):
    subjects: List[str] = Field(default_factory=list)
    grades: List[str] = Field(default_factory=list)
    preferred_language: Optional[str] = None
    preferred_difficulty: Optional[str] = None


@router.put("/preferences")
def update_preferences(payload: PreferencesUpdate, user: CurrentUser = Depends(require_teacher)) -> dict:
    """Saves the onboarding wizard's answers and marks onboarding complete.

    Idempotent — can also be called later (e.g. a future "edit preferences"
    settings UI) without re-triggering the wizard, since onboarding_completed
    is simply set to true again.
    """
    try:
        profile = save_teacher_preferences(
            user,
            subjects=payload.subjects,
            grades=payload.grades,
            preferred_language=payload.preferred_language,
            preferred_difficulty=payload.preferred_difficulty,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"status": "ok", **profile}


@router.delete("/account")
def delete_account(user: CurrentUser = Depends(require_teacher)) -> dict:
    """Permanently deletes the authenticated teacher's account and all owned data.

    Deletes the account belonging to ``user.user_id`` from the verified JWT —
    NEVER an id supplied by the client. Irreversible.
    """
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=503, detail="Account deletion requires Supabase configuration")
    try:
        delete_teacher_account(user)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"status": "deleted"}
