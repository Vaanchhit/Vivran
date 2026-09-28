"""Saved work (app/services/library.py, app/api/library.py). Database mocked throughout."""
import uuid

import pytest

from app.api import jobs as jobs_api
from app.core.auth import CurrentUser
from app.services import library
from app.services.supabase_service import SupabaseError


@pytest.fixture
def db(monkeypatch):
    """An in-memory stand-in for the three table helpers library.py uses."""
    tables: dict = {"projects": [], "artifacts": [], "assessments": [{"id": "a1", "project_id": None}]}

    def insert(table, row):
        row = {"id": row.get("id") or str(uuid.uuid4()), **row}
        tables[table].append(row)
        return row

    def match(row, params):
        for k, v in params.items():
            if k in ("select", "order", "limit"):
                continue
            if str(row.get(k)) != v.removeprefix("eq."):
                return False
        return True

    def select(table, params):
        return [r for r in tables[table] if match(r, params)]

    def update(table, params, patch):
        rows = [r for r in tables[table] if match(r, params)]
        for r in rows:
            r.update(patch)
        return rows

    def delete(table, params):
        keep = [r for r in tables[table] if not match(r, params)]
        gone = {r["id"] for r in tables[table]} - {r["id"] for r in keep}
        tables[table] = keep
        if table == "projects":  # ON DELETE CASCADE
            tables["artifacts"] = [a for a in tables["artifacts"] if a["project_id"] not in gone]

    monkeypatch.setattr(library, "is_configured", lambda: True)
    monkeypatch.setattr(library, "table_insert", insert)
    monkeypatch.setattr(library, "table_select", select)
    monkeypatch.setattr(library, "table_update", update)
    monkeypatch.setattr(library, "table_delete", delete)
    return tables


def test_save_writes_one_listed_row_and_its_content(db):
    item = library.save_item(workspace_id="ws1", user_id="u1", kind="worksheet", title="Ratios", content={"title": "Ratios", "questions": []}, params={"topic": "Ratios"})
    assert item and len(db["projects"]) == 1 and len(db["artifacts"]) == 1
    got = library.get_item("ws1", item)
    assert got["type"] == "worksheet" and got["content"]["title"] == "Ratios" and got["params"] == {"topic": "Ratios"}
    assert [r["id"] for r in library.list_items("ws1")] == [item]


def test_another_workspace_cannot_read_rename_or_delete_it(db):
    item = library.save_item(workspace_id="ws1", user_id="u1", kind="worksheet", title="Mine", content={"x": 1})
    assert library.get_item("ws2", item) is None
    assert library.rename_item("ws2", item, "Hijacked") is False
    assert library.delete_item("ws2", item) is False
    assert library.get_item("ws1", item)["title"] == "Mine"


def test_rename_and_delete(db):
    item = library.save_item(workspace_id="ws1", user_id="u1", kind="lesson_notes", title="Old", content={"x": 1})
    assert library.rename_item("ws1", item, "  New   title ") is True
    assert library.get_item("ws1", item)["title"] == "New title"
    assert library.delete_item("ws1", item) is True
    assert db["projects"] == [] and db["artifacts"] == []


def test_a_saved_paper_owns_its_assessment_row(db):
    item = library.save_item(workspace_id="ws1", user_id="u1", kind="assessment", title="Paper", content={"assessment": {"title": "Paper"}, "assessment_id": "a1"})
    assert db["assessments"][0]["project_id"] == item


def test_a_course_plan_reuses_its_existing_row(db):
    db["projects"].append({"id": "p1", "workspace_id": "ws1", "type": "course_plan", "title": "Plan", "specification_json": {"grade": "Class 9"}})
    assert library.save_item(workspace_id="ws1", user_id="u1", kind="course_plan", title="Plan", content={"weekly_structure": []}, project_id="p1") == "p1"
    assert len(db["projects"]) == 1 and db["artifacts"][0]["project_id"] == "p1"


def test_legacy_course_plans_open_from_their_spec(db):
    db["projects"].append({"id": "p0", "workspace_id": "ws1", "type": "course_plan", "title": "Old plan", "specification_json": {"grade": "Class 9", "course_plan": {"title": "Old plan"}}})
    got = library.get_item("ws1", "p0")
    assert got["content"] == {"title": "Old plan"} and got["params"] == {"grade": "Class 9"}


def test_errors_and_empty_papers_are_not_saved():
    assert not library.worth_saving("worksheet", {"title": "x", "error": "Gemini was busy"})
    assert not library.worth_saving("assessment", {"assessment": None, "validation": {}})
    assert not library.worth_saving("image", {"status": "failed"})
    assert library.worth_saving("image", {"status": "ready", "media_url": "https://x"})
    assert not library.worth_saving("unknown_kind", {"title": "x"})


def test_a_database_failure_never_costs_the_teacher_their_result(monkeypatch):
    monkeypatch.setattr(library, "is_configured", lambda: True)

    def boom(*a, **k):
        raise SupabaseError("db down")

    monkeypatch.setattr(library, "table_insert", boom)
    assert library.save_item(workspace_id="ws1", user_id="u1", kind="worksheet", title="x", content={}) is None


def test_generation_results_are_saved_and_tagged(db):
    user = CurrentUser(user_id="u1", email="t@example.com")
    result = jobs_api.dispatch_generation(
        async_job=False, task_type="worksheet", workspace_id="ws1", user=user,
        params={"topic": "Fractions"}, run=lambda: {"title": "Fractions practice", "questions": []}, save_as="worksheet",
    )
    assert result["library_id"] == db["projects"][0]["id"]
    assert db["projects"][0]["title"] == "Fractions practice"


def test_a_failed_generation_is_not_saved(db):
    user = CurrentUser(user_id="u1", email="t@example.com")
    result = jobs_api.dispatch_generation(
        async_job=False, task_type="worksheet", workspace_id="ws1", user=user,
        params={}, run=lambda: {"title": "", "error": "busy"}, save_as="worksheet",
    )
    assert "library_id" not in result and db["projects"] == []


def test_titles_fall_back_sensibly():
    assert library.title_for("slides", {"context": {"topic": "Photosynthesis"}}, {}) == "Photosynthesis"
    assert library.title_for("assessment", {"assessment": {"title": "Unit test"}}, {}) == "Unit test"
    assert library.title_for("narration", {"status": "ready"}, {"script": "Plants make food"}) == "Plants make food"
    assert library.title_for("image", {}, {}) == "Image"
    assert len(library.title_for("worksheet", {"title": "x" * 500}, {})) == library.TITLE_MAX


def test_api_rejects_unknown_kinds_and_bad_ids(client, provisioned_workspace, monkeypatch):
    monkeypatch.setattr("app.api.library.is_configured", lambda: True)
    h = provisioned_workspace["headers"]
    r = client.post("/api/library", json={"kind": "virus", "title": "x", "content": {}}, headers=h)
    assert r.status_code == 400
    assert client.get("/api/library/not-a-uuid", headers=h).status_code == 422


def test_media_keys_become_signed_links_and_keep_the_key(monkeypatch):
    monkeypatch.setattr(library, "is_configured", lambda: True)
    monkeypatch.setattr(library, "signed_url", lambda key: f"https://signed/{key}")
    out = library.playable({"status": "ready", "media_url": "materials/media/a.mp3"})
    assert out["media_url"] == "https://signed/materials/media/a.mp3" and out["media_key"] == "materials/media/a.mp3"
    assert library.playable({"media_url": "https://already"})["media_url"] == "https://already"
    assert library.playable({"title": "worksheet"}) == {"title": "worksheet"}


def test_deleting_a_media_item_deletes_its_file(db, monkeypatch):
    deleted: list = []
    monkeypatch.setattr(library, "delete_storage_keys", lambda keys: deleted.extend(keys))
    item = library.save_item(workspace_id="ws1", user_id="u1", kind="narration", title="Audio", content={"status": "ready", "media_url": "materials/media/a.mp3"})
    # the in-memory db ignores "in.(...)" filters, so point the lookup at this item directly
    monkeypatch.setattr(library, "_media_keys", lambda ids: ["materials/media/a.mp3"] if item in ids else [])
    assert library.delete_item("ws1", item) is True
    assert deleted == ["materials/media/a.mp3"] and db["projects"] == []
