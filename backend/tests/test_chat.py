"""The chat and its task router (app/ai/task_router.py, app/generation/chat.py). Mocked models only."""
import json

import pytest

from app.ai import task_router
from app.ai.task_router import ACTION_TASK, ROUTES, Intelligence, route_for
from app.generation import chat


def ok(content, model="m", provider="p"):
    return {"success": True, "content": json.dumps(content) if not isinstance(content, str) else content, "model_name": model, "provider": provider, "usage": {}}


@pytest.fixture
def calls(monkeypatch):
    """Records which lane each call took; answers with whatever the test queues."""
    log = {"slm": [], "llm": [], "queue": []}

    def slm(prompt, task="", system_prompt="", json_mode=False, temperature=0.4):
        log["slm"].append(task)
        return log["queue"].pop(0) if log["queue"] else ok({"blocks": [{"t": "text", "text": "small"}]}, "slm-model", "gemini")

    def llm(prompt, *, system_prompt, task, json_mode=True, temperature=0.4, model=""):
        log["llm"].append(task)
        log.setdefault("prompts", []).append(prompt)
        return log["queue"].pop(0) if log["queue"] else ok({"blocks": [{"t": "text", "text": "large"}]}, "llm-model", "groq")

    monkeypatch.setattr(chat, "generate_slm", slm)
    monkeypatch.setattr(chat, "generate_llm", llm)
    return log


# ── the table ───────────────────────────────────────────────────────────

def test_every_rewrite_is_slm_and_everything_that_adds_content_is_llm():
    for action, task in ACTION_TASK.items():
        expected = Intelligence.SLM if task.startswith("rewrite.") else Intelligence.LLM
        assert ROUTES[task].intelligence is expected, action
    assert {a for a, t in ACTION_TASK.items() if t.startswith("extend.")} == {"further", "examples", "elaborate"}


def test_making_things_and_answering_from_knowledge_never_go_to_the_slm():
    for task in ("explain", "compare", "summarise", "ideas", "analyse", "general", "slides", "paper", "worksheet", "plan"):
        assert ROUTES[task].intelligence is Intelligence.LLM, task


def test_reading_the_request_is_rules_first():
    assert ROUTES["classify"].intelligence is Intelligence.RULES
    assert ROUTES["clarify"].intelligence is Intelligence.RULES
    assert ROUTES["classify_fallback"].intelligence is Intelligence.SLM
    assert ROUTES["improve_prompt"].intelligence is Intelligence.SLM


def test_indic_script_moves_slm_work_to_the_llm():
    assert route_for("rewrite.bullets", "turn this into bullets").intelligence is Intelligence.SLM
    hindi = route_for("rewrite.bullets", "इसे बिंदुओं में लिखिए, कक्षा नौ के लिए")
    assert hindi.intelligence is Intelligence.LLM and "script" in hindi.why
    # LLM work stays where it is.
    assert route_for("compare", "तुलना करें").intelligence is Intelligence.LLM


def test_routes_name_their_modalities():
    assert task_router.Modality.DOCUMENT in ROUTES["summarise"].inputs
    assert ROUTES["slides"].output is task_router.Modality.DECK
    assert ROUTES["paper"].output is task_router.Modality.PAPER
    assert ROUTES["speech_to_text"].inputs == (task_router.Modality.VOICE,)


def test_the_route_reports_the_pinned_models_of_a_pipeline():
    from app.core.config import settings

    d = task_router.describe(ROUTES["paper"])
    assert d["pins"] == {"write": settings.assessment_model}
    assert task_router.describe(ROUTES["slides"])["pins"]["plan"] == settings.planner_model


# ── reading a request ───────────────────────────────────────────────────

@pytest.mark.parametrize("text,intent,topic", [
    ("Slides on photosynthesis for my Class 7", "slides", "Photosynthesis"),
    ("A 40-mark unit test on the French Revolution", "paper", "French Revolution"),
    ("Explain inflation simply for Class 9", "explain", "Inflation"),
    ("Compare Girondins and Jacobins", "compare", "Girondins vs Jacobins"),
    ("A worksheet on fractions for Class 6", "worksheet", "Fractions"),
    ("Plan a unit on fractions, 4 weeks", "plan", "Fractions"),
])
def test_rules_read_common_requests_without_a_model(calls, text, intent, topic):
    r = chat.read_request(text)
    assert (r["intent"], r["entities"]["topic"]) == (intent, topic)
    assert r["ask"] is None
    assert calls["slm"] == [] and calls["llm"] == []


def test_entities_carry_class_and_marks(calls):
    e = chat.read_request("A 40-mark unit test on the French Revolution for Class 9")["entities"]
    assert e["marks"] == 40 and e["grade"] == "Class 9"


def test_a_missing_detail_is_asked_not_guessed(calls):
    assert chat.read_request("Make slides")["ask"]["field"] == "topic"
    assert chat.read_request("Compare these two")["ask"]["field"] == "items"
    assert chat.read_request("Summarise this PDF")["ask"]["field"] == "doc"
    assert chat.read_request("Summarise this PDF", has_source=True)["ask"] is None


def test_recent_topics_are_offered_as_answers(calls):
    ask = chat.read_request("Make slides", topics_hint=["Photosynthesis", "Fractions"])["ask"]
    assert ask["options"] == ["Photosynthesis", "Fractions"]


def test_the_slm_is_asked_only_when_no_rule_matches(calls):
    calls["queue"].append(ok({"intent": "ideas", "topic": "Diwali"}, "slm-model", "gemini"))
    r = chat.read_request("something for my kids around Diwali")
    assert r["intent"] == "ideas" and calls["slm"] == ["chat_classify"]
    assert r["models_used"][0]["model"] == "slm-model"


def test_a_bad_slm_label_falls_back_to_general(calls):
    calls["queue"].append(ok({"intent": "dance"}))
    assert chat.read_request("something for my kids around Diwali")["intent"] == "general"


def test_greetings_go_to_the_slm(calls):
    r = chat.read_request("hi")
    assert r["task"] == "smalltalk" and r["route"].intelligence is Intelligence.SLM


# ── answering ───────────────────────────────────────────────────────────

CHUNKS = [
    {"chunk_id": "c1", "content": "The Girondins were moderates from the provinces.", "source_material": "Unit 4.pdf", "page_number": 7},
    {"chunk_id": "c2", "content": "The Jacobins drew support from Paris.", "source_material": "Unit 4.pdf", "page_number": 8},
]


def test_a_comparison_runs_on_the_llm_and_keeps_only_real_citations(calls):
    calls["queue"].append(ok({
        "blocks": [
            {"t": "text", "text": "Two factions [S1]."},
            {"t": "table", "columns": ["", "Girondins", "Jacobins"], "rows": [["Base", "Provinces [S1]", "Paris [S2] [S9]"], ["Short"]]},
        ],
        "followups": ["Make slides on this"],
    }))
    r = chat.answer("compare", "Compare Girondins and Jacobins", chunks=CHUNKS)
    assert calls["llm"] == ["chat_compare"] and calls["slm"] == []
    assert r["ok"] and r["blocks"][1]["data"]["rows"][0][2] == "Paris [S2]"
    # a short row is padded to the table's width
    assert r["blocks"][1]["data"]["rows"][1] == ["Short", "", ""]
    assert [(s["chunk_id"], s["tag"]) for s in r["sources"]] == [("c1", "S1"), ("c2", "S2")]
    assert "[S1] (Unit 4.pdf · p.7)" in calls["prompts"][0]


def test_smalltalk_is_answered_by_the_slm(calls):
    r = chat.answer("smalltalk", "hi")
    assert calls["slm"] == ["chat_smalltalk"] and r["blocks"][0]["text"] == "small"


def test_unknown_blocks_are_dropped_and_prose_is_kept(calls):
    calls["queue"].append(ok({"blocks": [{"t": "script", "src": "x"}, {"t": "bullets", "items": []}]}))
    assert chat.answer("general", "why is the sky blue")["ok"] is False
    calls["queue"].append(ok("Plain prose answer."))
    assert chat.answer("general", "why is the sky blue")["blocks"] == [{"t": "text", "text": "Plain prose answer."}]


def test_a_failed_call_is_reported_with_its_class(calls):
    from app.core.errors import FailureClass

    calls["queue"].append({"success": False, "failure": FailureClass.UPSTREAM_BUSY, "error": "503"})
    r = chat.answer("general", "why is the sky blue")
    assert r["ok"] is False and r["failure"] is FailureClass.UPSTREAM_BUSY


@pytest.mark.parametrize("action,lane", [("bullets", "slm"), ("table", "slm"), ("simplify", "slm"), ("summarise", "slm"),
                                         ("further", "llm"), ("examples", "llm"), ("elaborate", "llm")])
def test_quick_actions_take_their_lane(calls, action, lane):
    r = chat.transform(action, "Inflation is a general rise in prices [S1].")
    assert r["ok"] and calls[lane] and not calls["llm" if lane == "slm" else "slm"]


# ── improving a prompt ──────────────────────────────────────────────────

def test_improve_adds_specifics_on_the_slm(calls):
    calls["queue"].append(ok({"improved": "Slides on photosynthesis for Class 7 Science, about 40 minutes, with a quick check at the end.", "added": ["class", "length"]}))
    r = chat.improve("slides on photosynthesis", grade="Class 7", subject="Science")
    assert calls["slm"] == ["chat_improve_prompt"] and r["changed"] and r["added"] == ["class", "length"]


def test_improve_falls_back_to_the_teachers_words(calls):
    calls["queue"].append({"success": False, "error": "busy"})
    r = chat.improve("slides on photosynthesis")
    assert (r["improved"], r["added"], r["changed"]) == ("slides on photosynthesis", [], False)
    # a rewrite that loses most of the request is not an improvement
    calls["queue"].append(ok({"improved": "Slides", "added": []}))
    assert chat.improve("slides on photosynthesis for class 7")["changed"] is False


# ── API ─────────────────────────────────────────────────────────────────

def test_api_route_and_answer(client, provisioned_workspace, calls):
    h = provisioned_workspace["headers"]
    r = client.post("/api/chat/route", headers=h, json={"text": "Compare mitosis and meiosis"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "compare" and body["entities"]["items"] == ["mitosis", "meiosis"]
    assert body["route"]["intelligence"] == "llm" and body["route"]["pipeline"] == "chat.answer"

    a = client.post("/api/chat/answer", headers=h, json={"task": "compare", "text": "Compare mitosis and meiosis"})
    assert a.status_code == 200, a.text
    assert a.json()["blocks"][0]["text"] == "large" and a.json()["route"]["ran_on"]["model"] == "llm-model"


def test_api_refuses_to_answer_a_pipeline_task(client, provisioned_workspace, calls):
    r = client.post("/api/chat/answer", headers=provisioned_workspace["headers"], json={"task": "slides", "text": "Slides on x"})
    assert r.status_code >= 400 and calls["llm"] == []


def test_api_routes_lists_the_table(client, provisioned_workspace):
    r = client.get("/api/chat/routes", headers=provisioned_workspace["headers"])
    assert r.status_code == 200 and {x["task"] for x in r.json()["routes"]} == set(ROUTES)


def test_api_requires_a_verified_teacher(client, unverified_auth_headers):
    assert client.post("/api/chat/route", headers=unverified_auth_headers, json={"text": "hi"}).status_code == 403
