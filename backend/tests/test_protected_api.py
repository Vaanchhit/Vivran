"""Protected API integration tests — workspace_id scoping on /projects, /materials."""
import uuid


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


def test_assessments_generate_authenticated(client, auth_headers):
    # No GEMINI_API_KEY is configured in the test environment (tests stay
    # offline/deterministic), so generation degrades gracefully rather than
    # fabricating content — assert that contract instead of AI output.
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