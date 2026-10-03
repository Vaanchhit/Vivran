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


def test_jwks_outage_returns_503_not_500(client, monkeypatch):
    """A transient Supabase JWKS blip must not 500 every authenticated request.

    503 rather than 401 on purpose: the token is probably fine, so the client
    should retry — a 401 would make the frontend sign the teacher out.
    """
    from app.core import auth as core_auth

    def boom(kid):
        raise core_auth.SigningKeyUnavailable("Could not fetch Supabase signing keys: timeout")

    monkeypatch.setattr(core_auth, "_get_signing_key", boom)
    # Force the asymmetric branch of decode_access_token, which is what a real
    # Supabase project uses (ES256 via JWKS); HS256 tokens never touch JWKS.
    monkeypatch.setattr(core_auth.jwt, "get_unverified_header", lambda token: {"alg": "ES256", "kid": "k1"})

    resp = client.get("/api/auth/me", headers={"Authorization": "Bearer anything"})
    assert resp.status_code == 503
    assert "signing keys" in resp.json()["detail"]


def test_verify_referral_rejects_empty_code(client):
    """An empty code can never pass — otherwise clearing REFERRAL_CODE on the
    host would turn the gate into a no-op that still reports valid."""
    assert client.post("/api/auth/verify-referral", json={"code": "   "}).json()["valid"] is False


def test_verify_referral_accepts_the_configured_code(client):
    assert client.post("/api/auth/verify-referral", json={"code": settings.referral_code}).json()["valid"] is True


def test_unset_referral_code_refuses_everything(client, monkeypatch):
    """No default code: an unset REFERRAL_CODE closes the gate, it never opens it."""
    monkeypatch.setattr(settings, "referral_code", "")
    assert client.post("/api/auth/verify-referral", json={"code": ""}).json()["valid"] is False
    assert client.post("/api/auth/verify-referral", json={"code": "632006"}).json()["valid"] is False


def test_wrong_guesses_from_every_client_share_one_budget(client):
    """A fresh X-Forwarded-For per request dodges the per-IP limit, so wrong
    guesses are also capped globally, whoever sends them."""
    from app.core.rate_limit import referral_failures

    for i in range(referral_failures.max_failures):
        resp = client.post(
            "/api/auth/verify-referral", json={"code": f"guess-{i}"}, headers={"X-Forwarded-For": f"10.0.0.{i}"}
        )
        assert resp.json()["valid"] is False

    blocked = client.post(
        "/api/auth/verify-referral", json={"code": settings.referral_code}, headers={"X-Forwarded-For": "10.9.9.9"}
    )
    assert blocked.status_code == 429