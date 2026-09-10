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