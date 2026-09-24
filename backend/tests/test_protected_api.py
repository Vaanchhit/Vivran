"""Protected API integration tests — workspace_id scoping on /projects, /materials."""
import uuid

import pytest

from app.services.supabase_service import SupabaseError


def test_projects_require_workspace_header(client, auth_headers):
    resp = client.get("/api/projects", headers=auth_headers)
    assert resp.status_code == 400  # Workspace-Id header required


def test_projects_reject_foreign_workspace(client, provisioned_workspace):
    foreign = {
        **provisioned_workspace["headers"],
        "Workspace-Id": str(uuid.uuid4()),
    }
    resp = client.get("/api/projects", headers=foreign)
    assert resp.status_code == 403


def test_projects_list_scoped_to_workspace(client, provisioned_workspace):
    resp = client.get("/api/projects", headers=provisioned_workspace["headers"])
    assert resp.status_code == 200
    rows = resp.json()
    assert all(r["workspace_id"] == provisioned_workspace["workspace_id"] for r in rows)


def test_projects_create_scoped(client, provisioned_workspace):
    payload = {"title": "Bio Pack", "type": "classroom_pack", "grade": "10", "subject": "Biology", "topics": ["Tissues"]}
    resp = client.post("/api/projects", json=payload, headers=provisioned_workspace["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["workspace_id"] == provisioned_workspace["workspace_id"]
    assert body["created_by"] == provisioned_workspace["user_id"]


def test_materials_scoped_to_workspace(client, provisioned_workspace):
    resp = client.get("/api/materials", headers=provisioned_workspace["headers"])
    assert resp.status_code == 200
    assert all(r["workspace_id"] == provisioned_workspace["workspace_id"] for r in resp.json())


def test_assessments_require_auth(client):
    payload = {"grade": "10", "subject": "Biology", "topics": ["Tissues"], "total_marks": 40}
    assert client.post("/api/assessments/generate", json=payload).status_code == 401


def test_assessments_generate_authenticated(client, auth_headers, monkeypatch):
    # Force the "no AI key configured" path regardless of what's in the
    # developer's local .env — tests must stay deterministic and offline.
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "")
    payload = {"grade": "10", "subject": "Biology", "topics": ["Tissues"], "total_marks": 40}
    resp = client.post("/api/assessments/generate", json=payload, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["assessment"] is None
    assert body["validation"]["valid"] is False
    assert body["validation"]["errors"]


def test_parse_intent_scopes_to_user(client, auth_headers):
    resp = client.post(
        "/api/workflow/parse-intent",
        json={"teacher_prompt": "Create a 20-mark quiz for Class 8"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["requested_by"]


# ---------------------------------------------------------------------------
# Beta referral gate — enforced at the API layer, not only by TeacherLayout.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("post", "/api/content/video", {"prompt": "photosynthesis explainer"}),
        ("post", "/api/content/slides", {"topic": "Tissues"}),
        ("post", "/api/assessments/generate", {"grade": "10", "subject": "Biology", "topics": ["Tissues"]}),
        ("post", "/api/workflow/parse-intent", {"teacher_prompt": "Make a quiz"}),
        ("get", "/api/projects", None),
    ],
)
def test_unverified_teacher_is_blocked_at_the_api(client, unverified_auth_headers, method, path, body):
    """A valid JWT alone must not buy access to anything that costs money.

    This is the whole point of the server-side gate: signing in with Google
    mints a real token before <ReferralGate/> ever renders, so a token lifted
    out of devtools used to drive these endpoints directly with no code ever
    entered.
    """
    resp = getattr(client, method)(path, headers=unverified_auth_headers, **({"json": body} if body else {}))
    assert resp.status_code == 403, resp.text
    assert "referral code" in resp.json()["detail"]


def test_verified_teacher_passes_the_gate(client, provisioned_workspace):
    """Counterpart to the test above — the gate must not block a real teacher."""
    assert client.get("/api/projects", headers=provisioned_workspace["headers"]).status_code == 200


def test_auth_routes_stay_reachable_while_unverified(client, unverified_auth_headers):
    """The endpoints a teacher needs in order to PASS the gate must stay open,
    or a new account is locked out of the only call that would unlock it."""
    assert client.post("/api/auth/provision", headers=unverified_auth_headers).status_code == 200
    assert client.get("/api/auth/me", headers=unverified_auth_headers).status_code == 200
    assert client.post("/api/auth/verify-referral", json={"code": "wrong"}).status_code == 200


# ---------------------------------------------------------------------------
# Question regeneration — cross-tenant IDOR.
# ---------------------------------------------------------------------------


def test_regenerate_question_rejects_foreign_workspace(client, provisioned_workspace):
    """The route must be workspace-scoped. Before this, it depended only on
    require_teacher, so any question uuid in the path was fair game."""
    foreign = {**provisioned_workspace["headers"], "Workspace-Id": str(uuid.uuid4())}
    resp = client.post(f"/api/questions/{uuid.uuid4()}/regenerate", json={"option": "harder"}, headers=foreign)
    assert resp.status_code == 403


def test_regenerate_question_requires_workspace_header(client, auth_headers):
    resp = client.post(f"/api/questions/{uuid.uuid4()}/regenerate", json={"option": "harder"}, headers=auth_headers)
    assert resp.status_code == 400


def test_regenerate_question_lookup_is_filtered_by_owning_workspace(monkeypatch):
    """A foreign question uuid must not resolve.

    Supabase isn't reachable in tests, so this asserts the thing that makes it
    unreachable: that the PostgREST lookup joins through the owning assessment
    and filters on the caller's workspace. Without this filter the select runs
    on the service-role key with no tenancy check at all.
    """
    from app.generation import assessments as gen

    captured: dict = {}

    def fake_select(table, params):
        captured["table"] = table
        captured["params"] = params
        return []  # the foreign question is invisible to this workspace

    monkeypatch.setattr(gen, "is_configured", lambda: True)
    monkeypatch.setattr(gen, "table_select", fake_select)

    workspace_id = str(uuid.uuid4())
    foreign_question_id = str(uuid.uuid4())

    with pytest.raises(SupabaseError):
        gen.regenerate_single_question(
            question_id=foreign_question_id, option="harder", workspace_id=workspace_id, created_by="teacher-a"
        )

    assert captured["table"] == "questions"
    assert captured["params"]["id"] == f"eq.{foreign_question_id}"
    # !inner makes the embed an INNER JOIN — without it a row whose assessment
    # is in another workspace would still come back, just with a null embed.
    assert "assessments!inner(workspace_id)" in captured["params"]["select"]
    assert captured["params"]["assessments.workspace_id"] == f"eq.{workspace_id}"