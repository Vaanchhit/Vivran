"""Intuitive examples: checkable explanations. The model is faked; the rules are real."""
import copy
import json

import httpx
import pytest

from app.generation import examples
from app.generation.safe_math import MathError, run_steps, safe_eval
from app.media.napkin import NapkinService


def ok(payload) -> dict:
    return {"success": True, "content": json.dumps(payload), "model_name": "fake"}


CARD = {
    "concept": "FCFE",
    "one_line": "The cash left for shareholders after the business has paid for everything it needs.",
    "key_terms": [
        {"term": "Operating cash flow", "meaning": "Cash the business earns from its normal work."},
        {"term": "Capital expenditure", "meaning": "Money spent on assets to keep or grow the business."},
        {"term": "Net borrowing", "meaning": "New loans taken minus loans repaid."},
    ],
    "formula": "FCFE = CFO - Capex + Net borrowing",
    "prerequisites": ["Cash flow"],
    "source_ids": [],
}

GOOD = {
    "setting": "a tea stall",
    "story": "Asha runs a chai stall. Each day she sells tea and keeps the money. She buys a new gas stove to keep the stall going. "
             "She also borrows a little from her uncle and pays some back. What is left in her pocket is hers to keep.",
    "mapping": [
        {"term": "Operating cash flow", "in_story": "the money from selling tea"},
        {"term": "Capital expenditure", "in_story": "buying the new gas stove"},
        {"term": "Net borrowing", "in_story": "uncle's loan minus what she paid back"},
    ],
    "worked_example": {
        "title": "Asha's month",
        "inputs": [{"name": "tea_sales", "label": "Money from tea", "value": 120, "unit": "₹ thousand"},
                   {"name": "stove", "label": "New stove", "value": 40, "unit": "₹ thousand"},
                   {"name": "loan_net", "label": "Loan minus repaid", "value": 15, "unit": "₹ thousand"}],
        "steps": [{"name": "pocket", "label": "Left in her pocket", "expr": "tea_sales - stove + loan_net"}],
        "explain": "She can take this much home without hurting the stall.",
    },
    "where_it_breaks": ["A real company's owners are many people, not one."],
    "common_mistake": "Thinking profit and cash left for owners are the same thing.",
    "check": [{"q": "What happens to her pocket money if she buys a bigger stove?", "a": "It falls."},
              {"q": "What if her uncle lends her more?", "a": "It rises, for now."}],
}


# ---------------------------------------------------------------------------
# The arithmetic is code's, never the model's
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad", ["__import__('os').system('x')", "a.b", "2**99", "1/0", "unknown + 1", "lambda: 1", "[1,2]", "'a'*9", "True + 1", "x" * 200])
def test_only_plain_arithmetic_is_evaluated(bad):
    with pytest.raises(MathError):
        safe_eval(bad, {})


def test_arithmetic_over_named_values():
    assert safe_eval("cfo - capex + net", {"cfo": 120, "capex": 40, "net": 15}) == 95
    assert safe_eval("(a + b) * 2 / 4", {"a": 3, "b": 5}) == 4
    assert safe_eval("2 ^ 3 × 2", {}) == 16


def test_steps_chain_and_report_problems():
    steps, problems = run_steps([{"name": "a", "value": 10}, {"name": "b", "value": 4}],
                                [{"name": "c", "label": "C", "expr": "a - b"}, {"name": "d", "label": "D", "expr": "c * 2"}])
    assert problems == [] and [s["value"] for s in steps] == [6.0, 12.0]
    _, problems = run_steps([{"name": "a", "value": 1}], [{"name": "c", "expr": "a + missing"}, {"name": "Bad Name", "expr": "1"}])
    assert len(problems) == 2


# ---------------------------------------------------------------------------
# What an analogy must satisfy
# ---------------------------------------------------------------------------

def errors_for(**changes):
    data = copy.deepcopy(GOOD)
    data.update(changes)
    return examples.analogy_errors(data, CARD, [])


def test_a_good_analogy_passes_and_its_numbers_are_computed():
    data = copy.deepcopy(GOOD)
    assert examples.analogy_errors(data, CARD, []) == []
    worked = examples._finish_worked(data["worked_example"])
    assert worked["result"]["value"] == 95.0 and worked["steps"][0]["value"] == 95.0


def test_every_key_term_must_be_mapped():
    e = errors_for(mapping=GOOD["mapping"][:2])
    assert any("missing: Net borrowing" in x for x in e)


def test_the_story_may_not_use_the_jargon_it_is_explaining():
    e = errors_for(story="Asha's operating cash flow pays for her capital expenditure each day.")
    assert any("technical term" in x and "Operating cash flow" in x for x in e)


def test_the_story_must_be_short_and_plain():
    e = errors_for(story=" ".join(["Asha sells tea every single morning near the busy bus stand"] * 14))
    assert any("words" in x for x in e)
    long_sentence = "Asha " + "and then she " * 30 + "goes home."
    assert any("too long" in x for x in errors_for(story=long_sentence))


def test_where_it_breaks_and_two_checks_are_required():
    assert any("stops being true" in x for x in errors_for(where_it_breaks=[]))
    assert any("exactly two" in x for x in errors_for(check=GOOD["check"][:1]))


def test_numbers_that_do_not_compute_are_rejected():
    worked = copy.deepcopy(GOOD["worked_example"])
    worked["steps"][0]["expr"] = "tea_sales - stove + nothing"
    assert any("unknown name 'nothing'" in x for x in errors_for(worked_example=worked))


def test_a_non_quantitative_concept_needs_no_worked_example():
    assert errors_for(worked_example=None) == []


def test_a_setting_the_teacher_already_saw_is_refused():
    data = copy.deepcopy(GOOD)
    assert any("different setting" in x for x in examples.analogy_errors(data, CARD, ["a Tea Stall"]))


# ---------------------------------------------------------------------------
# The generator end to end
# ---------------------------------------------------------------------------

def script(monkeypatch, *replies):
    """The model answers with each reply in turn; returns the prompts it was sent."""
    prompts = []

    def fake(prompt, task=None, system_prompt=None, json_mode=False, **_):
        prompts.append(prompt)
        r = replies[min(len(prompts) - 1, len(replies) - 1)]
        return r if isinstance(r, dict) and "success" in r else ok(r)

    monkeypatch.setattr(examples, "generate_cheap_cloud", fake)
    monkeypatch.setattr(examples, "search_many", lambda *a, **k: [])
    return prompts


def test_a_full_example_is_two_calls_and_the_model_never_states_a_result(monkeypatch):
    stated = copy.deepcopy(GOOD)
    stated["worked_example"]["steps"][0]["value"] = 9999        # a result the model "calculated"
    prompts = script(monkeypatch, CARD, stated)
    out = examples.generate_example("FCFE", grade="Class 12", subject="Finance")
    assert len(prompts) == 2 and "error" not in out
    assert out["analogy"]["worked_example"]["result"]["value"] == 95.0     # computed, not 9999
    assert [m["term"] for m in out["analogy"]["mapping"]] == ["Operating cash flow", "Capital expenditure", "Net borrowing"]
    assert out["analogy"]["mapping"][0]["meaning"].startswith("Cash the business earns")
    assert out["guardrail_warnings"] == [] and out["generation"]["analogy"]["first_pass_valid"]


def test_jargon_in_the_story_is_sent_back_with_the_exact_words(monkeypatch):
    jargon = copy.deepcopy(GOOD)
    jargon["story"] = "Asha's capital expenditure on a stove changes her day."
    prompts = script(monkeypatch, CARD, jargon, GOOD)
    out = examples.generate_example("FCFE")
    assert len(prompts) == 3 and "Capital expenditure" in prompts[2] and "everyday words" in prompts[2]
    assert out["generation"]["analogy"]["attempts"] == 2 and out["guardrail_warnings"] == []


def test_a_reroll_reuses_the_concept_card_and_costs_one_call(monkeypatch):
    other = {**GOOD, "setting": "a cricket match"}
    prompts = script(monkeypatch, other)
    out = examples.generate_example("FCFE", card=CARD, avoid_settings=["a tea stall"], setting="auto")
    assert len(prompts) == 1 and "Do NOT use these settings: a tea stall" in prompts[0]
    assert out["concept"]["concept"] == "FCFE"


def test_what_still_fails_after_the_retry_is_reported_not_hidden(monkeypatch):
    bad = copy.deepcopy(GOOD)
    bad["mapping"] = GOOD["mapping"][:1]
    script(monkeypatch, CARD, bad, bad)
    out = examples.generate_example("FCFE")
    assert any("missing" in w and "Net borrowing" in w for w in out["guardrail_warnings"])


def test_unverifiable_numbers_drop_the_worked_example_but_keep_the_rest(monkeypatch):
    bad = copy.deepcopy(GOOD)
    bad["worked_example"]["steps"][0]["expr"] = "__import__('os')"
    script(monkeypatch, CARD, bad, bad)
    out = examples.generate_example("FCFE")
    assert out["analogy"]["worked_example"] is None and out["analogy"]["story"]
    assert any("left out" in w for w in out["guardrail_warnings"])


def test_a_concept_the_model_cannot_pin_down_says_so(monkeypatch):
    script(monkeypatch, {"concept": "x", "one_line": "", "key_terms": []})
    out = examples.generate_example("x")
    assert "couldn't pin down" in out["error"]


def test_the_concept_follows_the_teachers_own_material_when_they_have_it(monkeypatch):
    prompts = script(monkeypatch, CARD, GOOD)
    chunk = {"chunk_id": "c1", "content": "FCFE equals CFO minus Capex plus Net borrowing, as defined by our syllabus.", "source_material": "Finance.pdf", "page_number": 7, "chapter": "Unit 4"}
    monkeypatch.setattr(examples, "search_many", lambda *a, **k: [chunk])
    out = examples.generate_example("FCFE", workspace_id="ws")
    assert "[S1] (Finance.pdf · Unit 4 · p.7)" in prompts[0] and out["grounded_on"] == 1 and out["sources"][0]["page_number"] == 7


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def test_api_generates_and_a_reroll_is_not_a_new_habit(client, provisioned_workspace, monkeypatch):
    from app.memory import events

    script(monkeypatch, CARD, GOOD, {**GOOD, "setting": "a cricket match"})
    h = provisioned_workspace["headers"]
    first = client.post("/api/examples", headers=h, json={"concept": "FCFE", "grade": "Class 12", "subject": "Finance"})
    assert first.status_code == 200 and first.json()["analogy"]["setting"] == "a tea stall"
    again = client.post("/api/examples", headers=h, json={"concept": "FCFE", "card": CARD, "avoid_settings": ["a tea stall"]})
    assert again.status_code == 200
    generated = [e for e in events.recent(provisioned_workspace["workspace_id"]) if e["kind"] == "generate" and e["artifact"] == "example"]
    assert len(generated) == 1


def test_api_validates_its_input(client, provisioned_workspace):
    h = provisioned_workspace["headers"]
    assert client.post("/api/examples", headers=h, json={"concept": "x"}).status_code == 422
    assert client.post("/api/examples", headers=h, json={"concept": "FCFE", "avoid_settings": ["a"] * 7}).status_code == 422


# ---------------------------------------------------------------------------
# Napkin (mocked transport: nothing here calls the real service)
# ---------------------------------------------------------------------------

def napkin(monkeypatch, handler):
    monkeypatch.setattr("app.media.napkin.settings.napkin_api_key", "test-key")
    monkeypatch.setattr("app.media.napkin.POLL_SECONDS", 0)
    real = httpx.Client
    monkeypatch.setattr("app.media.napkin.httpx.Client", lambda **kw: real(transport=httpx.MockTransport(handler), **{k: v for k, v in kw.items() if k != "transport"}))
    return NapkinService()


def test_napkin_is_off_without_a_key():
    assert NapkinService().make_visual("hello")["status"] == "not_configured"


def test_napkin_creates_polls_and_downloads(monkeypatch):
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append((req.method, req.url.path, req.headers.get("authorization")))
        if req.method == "POST":
            body = json.loads(req.content)
            assert body["format"] == "svg" and body["content"].startswith("Asha")
            return httpx.Response(201, json={"id": "req1"})
        if req.url.path.endswith("/status"):
            n = sum(1 for s in seen if s[1].endswith("/status"))
            return httpx.Response(200, json={"status": "processing"} if n < 2 else {"status": "completed", "generated_files": [{"url": "https://api.napkin.ai/files/f1.svg"}]})
        return httpx.Response(200, content=b"<svg xmlns='http://www.w3.org/2000/svg'/>")

    out = napkin(monkeypatch, handler).make_visual("Asha sells tea")
    assert out["status"] == "ready" and out["image"].startswith("data:image/svg+xml;base64,")
    assert all(s[2] == "Bearer test-key" for s in seen)


@pytest.mark.parametrize("status,body,expect", [(402, {"error": "no_credits"}, "run out of credits"), (429, {"error": "rate_limit_exceeded"}, "busy"), (500, {"error": "internal_error"}, "couldn't make")])
def test_napkin_failures_are_translated_for_the_teacher(monkeypatch, status, body, expect):
    out = napkin(monkeypatch, lambda req: httpx.Response(status, json=body)).make_visual("x")
    assert out["status"] == "failed" and expect in out["error"] and out["user_facing"]


def test_napkin_visual_endpoint_is_off_unless_configured(client, provisioned_workspace):
    r = client.post("/api/examples/visual", headers=provisioned_workspace["headers"], json={"story": "Asha sells tea at her stall.", "mapping": []})
    assert r.status_code == 501
