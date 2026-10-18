"""Ask Vivran: it can only answer from the help it is given, and only link to real pages."""
import json

import pytest

from app.api import assistant as assistant_api
from app.generation import assistant

ENTRY = {"id": "regenerate", "q": "How do I change just one question?", "a": "Select it and regenerate it.",
         "steps": ["Click the question.", "Choose harder, easier or application.", "Press Regenerate."], "points": []}


@pytest.fixture(autouse=True)
def _fresh_allowance():
    assistant_api.reset_allowance()
    yield
    assistant_api.reset_allowance()


def model(monkeypatch, reply):
    seen = {}

    def fake(prompt, *, system_prompt, task="planning"):
        seen["prompt"], seen["system"] = prompt, system_prompt
        return {"success": True, "content": reply if isinstance(reply, str) else json.dumps(reply), "usage": {"input_tokens": 700, "output_tokens": 120}}

    monkeypatch.setattr(assistant, "generate_planner", fake)
    return seen


# ---------------------------------------------------------------------------
# It cannot make up a page
# ---------------------------------------------------------------------------

def test_links_are_resolved_from_a_fixed_table_and_invented_ids_are_dropped():
    out = assistant.clean({"answer": "Go to Assess.", "actions": [
        {"label": "Open Assess", "route_id": "assess"},
        {"label": "Secret admin", "route_id": "admin_panel"},
        {"label": "Evil", "route_id": "assess", "href": "https://evil.example"},          # a duplicate id, and a href we never read
    ]})
    assert [a["href"] for a in out["actions"]] == ["/teacher/assess"]


def test_a_request_can_be_pretyped_only_on_pages_that_take_one():
    out = assistant.clean({"answer": "ok", "actions": [
        {"label": "Make it", "route_id": "test", "prompt": "20 mark test on demand"},
        {"label": "Upload", "route_id": "materials", "prompt": "ignored"},
    ]})
    by = {a["route_id"]: a for a in out["actions"]}
    assert by["test"]["prompt"] == "20 mark test on demand" and by["materials"]["prompt"] is None


def test_everything_is_length_capped_whatever_the_model_wrote():
    out = assistant.clean({"answer": "word " * 400, "steps": ["s" * 500] * 12, "followups": ["f"] * 9,
                           "actions": [{"label": "L" * 90, "route_id": r} for r in ("home", "plan", "test", "quiz", "help")]})
    assert len(out["answer"]) <= assistant.MAX_ANSWER and len(out["steps"]) == 5 and all(len(s) <= 150 for s in out["steps"])
    assert len(out["followups"]) == 3 and len(out["actions"]) == 3 and all(len(a["label"]) <= 40 for a in out["actions"])


def test_an_empty_or_malformed_answer_hands_over_to_a_human():
    assert assistant.clean({})["needs_human"] is True
    assert assistant.clean("not a dict")["needs_human"] is True
    assert assistant.clean({"answer": "Fine.", "needs_human": False})["needs_human"] is False


# ---------------------------------------------------------------------------
# What the model is shown
# ---------------------------------------------------------------------------

def test_the_prompt_carries_the_help_entries_the_routes_and_the_page(monkeypatch):
    seen = model(monkeypatch, {"answer": "Select the question, then Regenerate.", "steps": ["Click it."], "actions": [], "followups": []})
    out = assistant.ask("how do i change one question", "/teacher/assess", [{"role": "user", "text": "hi"}], [ENTRY])
    p = seen["prompt"]
    assert "Q: How do I change just one question?" in p and "Press Regenerate" in p
    assert "assess = Assess:" in p and "/teacher/assess" in p and "Teacher: hi" in p
    assert "ONLY from the HELP entries" in seen["system"] and out["answer"].startswith("Select")


def test_the_prompt_stays_small(monkeypatch):
    seen = model(monkeypatch, {"answer": "x"})
    big = {**ENTRY, "a": "a" * 5000, "steps": ["s" * 900] * 20, "points": ["p" * 900] * 20}
    assistant.ask("q" * 2000, "/teacher/assess", [{"role": "user", "text": "t" * 5000}] * 20, [big] * 12)
    assert len(seen["prompt"]) < 6500            # roughly 1,500 tokens at the very worst


def test_a_model_failure_is_translated_not_leaked(monkeypatch):
    monkeypatch.setattr(assistant, "generate_planner", lambda *a, **k: {"success": False, "error": "Gemini returned status 503 ...", "failure": None})
    out = assistant.ask("hello", "", [], [])
    assert "error" in out and "503" not in out["error"]


def test_unparseable_output_is_an_error_not_a_crash(monkeypatch):
    model(monkeypatch, "not json")
    assert "error" in assistant.ask("hello", "", [], [])


# ---------------------------------------------------------------------------
# API: allowance and validation
# ---------------------------------------------------------------------------

def test_api_answers_and_counts_the_days_questions(client, provisioned_workspace, monkeypatch):
    model(monkeypatch, {"answer": "Use Library.", "actions": [{"label": "Open Library", "route_id": "library"}]})
    h = provisioned_workspace["headers"]
    r = client.post("/api/assistant/ask", headers=h, json={"message": "where are my papers", "page": "/teacher", "entries": [ENTRY]})
    assert r.status_code == 200 and r.json()["actions"][0]["href"] == "/teacher/library" and r.json()["left_today"] == assistant_api.DAILY_ALLOWANCE - 1


def test_api_stops_at_the_daily_allowance_with_a_useful_message(client, provisioned_workspace, monkeypatch):
    model(monkeypatch, {"answer": "ok"})
    monkeypatch.setattr(assistant_api, "DAILY_ALLOWANCE", 2)
    h = provisioned_workspace["headers"]
    body = {"message": "hello there", "entries": []}
    assert client.post("/api/assistant/ask", headers=h, json=body).status_code == 200
    assert client.post("/api/assistant/ask", headers=h, json=body).status_code == 200
    r = client.post("/api/assistant/ask", headers=h, json=body)
    assert r.status_code == 429 and "help search still works" in r.json()["detail"]


def test_api_validates_the_request(client, provisioned_workspace):
    h = provisioned_workspace["headers"]
    assert client.post("/api/assistant/ask", headers=h, json={"message": "x"}).status_code == 422
    assert client.post("/api/assistant/ask", headers=h, json={"message": "hello", "entries": [{"id": "a", "q": "q", "a": "a"}] * 6}).status_code == 422
    assert client.post("/api/assistant/ask", headers=h, json={"message": "hello", "history": [{"role": "system", "text": "x"}]}).status_code == 422
