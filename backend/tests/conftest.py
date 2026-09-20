"""Pytest fixtures for Vivran backend integration tests.

Sets a fixed SUPABASE_JWT_SECRET so test tokens can be minted locally without a
live Supabase project. Supabase REST calls are never made: provisioning falls
back to deterministic local workspace ids (see app/services/provisioning.py).

backend/.env now holds this project's real, live Supabase credentials (same
project used in local dev and production — see its own comments), so we
force-blank SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY here rather than rely on
the .env file being absent. Without this, pydantic-settings would load the
real credentials from .env and every "offline" test below would silently
issue live REST/Admin-API calls against the production Supabase project.
"""
import datetime
import os
import uuid

import pytest

# Must be set before importing the app so Settings picks it up. Plain
# assignment (not setdefault) so these always win over whatever is in the
# real .env file — pydantic-settings prefers actual process env vars over
# env_file values.
os.environ["SUPABASE_JWT_SECRET"] = "test-supabase-jwt-secret"
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
os.environ["SUPABASE_ANON_KEY"] = ""
os.environ.setdefault("APP_ENV", "test")

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import settings  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    from app.main import app

    return TestClient(app)


def make_token(
    *,
    user_id: str | None = None,
    email: str = "teacher@example.com",
    full_name: str = "Test Teacher",
    role: str = "teacher",
    expires_delta: datetime.timedelta = datetime.timedelta(hours=1),
    aud: str = "authenticated",
) -> str:
    """Mint a JWT shaped exactly like a Supabase Auth access token."""
    payload = {
        "sub": user_id or str(uuid.uuid4()),
        "email": email,
        "aud": aud,
        "role": aud,
        "exp": datetime.datetime.now(datetime.timezone.utc) + expires_delta,
        "iat": datetime.datetime.now(datetime.timezone.utc),
        "user_metadata": {"full_name": full_name},
        "app_metadata": {"vivran_role": role},
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm=settings.jwt_algorithm)


@pytest.fixture
def auth_headers() -> dict:
    """Bearer header for a freshly minted token."""
    token = make_token()
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def provisioned_workspace(client: TestClient, auth_headers: dict) -> dict:
    """Provision a teacher and return auth headers + workspace_id."""
    resp = client.post("/api/auth/provision", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return {
        "headers": {**auth_headers, "Workspace-Id": data["workspace_id"]},
        "workspace_id": data["workspace_id"],
        "user_id": data["user_id"],
    }