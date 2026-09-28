import pytest

from app.services import provisioning, supabase_service


class _Resp:
    def __init__(self, status_code=200, body=None, text=""):
        self.status_code = status_code
        self._body = body
        self.text = text

    def json(self):
        return self._body


class _FakeStorage:
    """Storage stand-in: `tree` maps a folder prefix to its direct entries."""

    def __init__(self, tree, calls):
        self.tree, self.calls = tree, calls

    def __call__(self, *a, **k):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, json=None, headers=None):
        self.calls.append(("list", json["prefix"]))
        return _Resp(200, self.tree.get(json["prefix"], []))

    def request(self, method, url, json=None, headers=None):
        self.calls.append(("delete", sorted(json["prefixes"])))
        return _Resp(200, [])


@pytest.fixture
def supabase_on(monkeypatch):
    monkeypatch.setattr(supabase_service.settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(supabase_service.settings, "supabase_service_role_key", "service-key")


def test_walks_folders_and_deletes_every_file(monkeypatch, supabase_on):
    calls: list = []
    tree = {
        "ws1": [{"name": "m1", "id": None}, {"name": "m2", "id": None}],
        "ws1/m1": [{"name": "unit.pdf", "id": "a"}],
        "ws1/m2": [{"name": "deck.pptx", "id": "b"}, {"name": "notes.docx", "id": "c"}],
    }
    monkeypatch.setattr(supabase_service.httpx, "Client", _FakeStorage(tree, calls))

    assert supabase_service.delete_storage_prefix("materials", "ws1") == 3
    assert ("delete", ["ws1/m1/unit.pdf", "ws1/m2/deck.pptx", "ws1/m2/notes.docx"]) in calls


def test_an_empty_workspace_deletes_nothing(monkeypatch, supabase_on):
    calls: list = []
    monkeypatch.setattr(supabase_service.httpx, "Client", _FakeStorage({}, calls))
    assert supabase_service.delete_storage_prefix("materials", "ws-empty") == 0
    assert not any(c[0] == "delete" for c in calls)


def test_stored_files_go_before_any_database_row(monkeypatch, supabase_on):
    order: list = []
    monkeypatch.setattr(provisioning, "table_select", lambda t, p: [{"id": "ws1"}] if t == "workspaces" else [])
    monkeypatch.setattr(provisioning, "delete_storage_prefix", lambda b, p: order.append(("storage", b, p)) or 1)
    monkeypatch.setattr(provisioning.library, "delete_workspace_media", lambda ws: order.append(("media", ws)) or 0)
    monkeypatch.setattr(provisioning, "table_delete", lambda t, p: order.append(("table", t)))

    class _Admin:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def delete(self, *a, **k):
            order.append(("auth_user",))
            return _Resp(204)

    monkeypatch.setattr(provisioning.httpx, "Client", _Admin)
    provisioning._delete_account_supabase("user-1")

    assert order[0] == ("storage", "materials", "ws1")
    assert order[1] == ("media", "ws1")
    assert order[-1] == ("auth_user",)


def test_a_storage_failure_stops_deletion_before_rows_are_touched(monkeypatch, supabase_on):
    touched: list = []
    monkeypatch.setattr(provisioning, "table_select", lambda t, p: [{"id": "ws1"}])

    def boom(b, p):
        raise supabase_service.SupabaseError("storage down")

    monkeypatch.setattr(provisioning, "delete_storage_prefix", boom)
    monkeypatch.setattr(provisioning, "table_delete", lambda t, p: touched.append(t))
    with pytest.raises(supabase_service.SupabaseError):
        provisioning._delete_account_supabase("user-1")
    assert touched == []
