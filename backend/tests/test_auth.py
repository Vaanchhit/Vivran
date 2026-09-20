"""Auth integration tests — JWT validation, provisioning, token lifecycle."""
import datetime

import jwt

from app.core.config import settings


def test_health_is_open(client):
    assert client.get("/health").status_code == 200


def test_protected_route_rejects_missing_token(client):
    resp = client.get("/api/projects")
    assert resp.status_code == 401


def test_protected_route_rejects_bad_token(client):
    resp = client.get("/api/projects", headers={"Authorization": "Bearer not-a-jwt"})
    assert resp.status_code == 401


def test_protected_route_rejects_expired_token(client):
    from tests.conftest import make_token

    expired = make_token(expires_delta=datetime.timedelta(seconds=-60))
    resp = client.get("/api/projects", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401


def test_protected_route_rejects_wrong_audience(client):
    from tests.conftest import make_token

    token = make_token(aud="service_role")
    resp = client.get("/api/projects", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_provision_upserts_workspace(client, auth_headers):
    resp = client.post("/api/auth/provision", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "provisioned"
    assert data["user_id"]
    assert data["workspace_id"]
    assert data["email"] == "teacher@example.com"


def test_provision_is_idempotent(client, auth_headers):
    first = client.post("/api/auth/provision", headers=auth_headers).json()
    second = client.post("/api/auth/provision", headers=auth_headers).json()
    assert first["workspace_id"] == second["workspace_id"]


def test_me_returns_identity(client, auth_headers):
    data = {"teacher_prompt": "Plan a lesson"}
    # me is token-only; provision returns richer payload
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "teacher@example.com"
    assert body["role"] == "teacher"
    assert data  # silence unused


def test_me_rejects_no_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_provision_reports_onboarding_incomplete_for_new_teacher(client):
    """A brand-new teacher (never provisioned before) should be sent through
    onboarding — the local fallback profile store defaults to
    onboarding_completed=False for a user id it has never seen."""
    from tests.conftest import make_token

    token = make_token(user_id=str(__import__("uuid").uuid4()))
    resp = client.post("/api/auth/provision", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["onboarding_completed"] is False
    assert data["subjects"] == []
    assert data["grades"] == []
    assert data["preferred_language"] is None


def test_preferences_roundtrip_marks_onboarding_complete(client, auth_headers):
    # Provision first (mirrors real flow: login always provisions before the
    # wizard can save preferences).
    client.post("/api/auth/provision", headers=auth_headers)

    payload = {
        "subjects": ["Economics", "Business Studies"],
        "grades": ["College 1st Year"],
        "preferred_language": "Hindi",
        "preferred_difficulty": "hard",
    }
    resp = client.put("/api/auth/preferences", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["onboarding_completed"] is True
    assert body["subjects"] == payload["subjects"]
    assert body["grades"] == payload["grades"]
    assert body["preferred_language"] == "Hindi"
    assert body["preferred_difficulty"] == "hard"

    # A subsequent provision call should now report onboarding as complete
    # and return the saved preferences — this is what keeps a teacher from
    # being sent through the wizard again on their next login.
    again = client.post("/api/auth/provision", headers=auth_headers).json()
    assert again["onboarding_completed"] is True
    assert again["subjects"] == payload["subjects"]
    assert again["preferred_language"] == "Hindi"


def test_preferences_rejects_no_token(client):
    resp = client.put("/api/auth/preferences", json={"subjects": [], "grades": []})
    assert resp.status_code == 401


def test_delete_account_requires_supabase_config(client, auth_headers):
    # Test environment has no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configured
    # (see conftest.py) — deletion is inherently Supabase-specific (it must
    # call the Auth Admin API with the service-role key), so it should refuse
    # cleanly rather than pretend to succeed.
    resp = client.delete("/api/auth/account", headers=auth_headers)
    assert resp.status_code == 503


def test_delete_account_rejects_no_token(client):
    assert client.delete("/api/auth/account").status_code == 401