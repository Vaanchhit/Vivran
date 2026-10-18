"""The retry loops: the shared validate-and-retry loop, honest counts, section repair, and the breaker.

No model is called: generate_* helpers are faked at the tier wrappers.
"""
import json

import pytest

from app.ai.gemini_client import GeminiError
from app.ai.validators import validate_course_plan, validate_coursework, validate_lesson_notes, validate_worksheet
from app.core.errors import FailureClass
from app.generation import artifacts, assessments, coursework, planning
from app.generation.loop import run_validated


def ok(payload) -> dict:
    return {"success": True, "content": json.dumps(payload), "model_name": "fake"}


# ---------------------------------------------------------------------------
# The shared loop
# ---------------------------------------------------------------------------

def test_a_valid_first_attempt_is_one_call_and_is_recorded_as_such():
    calls = []
    data, errors, meta = run_validated(lambda fb: calls.append(fb) or {"n": 1}, lambda d: [], label="t")
    assert calls == [""] and errors == [] and meta.first_pass_valid and meta.stopped == "valid" and meta.attempts == 1


def test_the_retry_is_told_exactly_what_was_wrong():
    seen = []

    def gen(fb):
        seen.append(fb)
        return {"n": len(seen)}

    data, errors, meta = run_validated(gen, lambda d: ["too short"] if d["n"] == 1 else [], label="t")
    assert "too short" in seen[1] and errors == [] and not meta.first_pass_valid and meta.attempts == 2


def test_an_upstream_failure_ends_the_loop_at_once():
    calls = []
    data, errors, meta = run_validated(lambda fb: calls.append(1) or {"error": "busy"}, lambda d: ["x"], label="t")
    assert len(calls) == 1 and meta.stopped == "upstream_error"


def test_the_same_failure_twice_stops_the_loop_even_with_attempts_left():
    calls = []
    data, errors, meta = run_validated(lambda fb: calls.append(1) or {}, lambda d: ["same rule"], max_attempts=5, label="t")
    assert len(calls) == 2 and meta.stopped == "no_progress" and errors == ["same rule"]


# ---------------------------------------------------------------------------
# Worksheets: the count is the real count
# ---------------------------------------------------------------------------

def q(n):
    return {"question_text": f"Question {n}?", "answer": f"Answer {n}", "source_ids": []}


def test_worksheet_validator_catches_what_used_to_ship():
    assert validate_worksheet({"questions": [q(1), q(2)]}, 3) == ["Write exactly 3 questions; there are 2."]
    assert "has no answer" in validate_worksheet({"questions": [{"question_text": "A?", "answer": ""}]}, 1)[0]
    assert "repeats" in validate_worksheet({"questions": [q(1), q(1)]}, 2)[0]


def test_a_short_worksheet_asks_only_for_the_missing_questions(monkeypatch):
    prompts = []

    def fake(prompt, task=None, system_prompt=None, json_mode=False, **_):
        prompts.append(prompt)
        if len(prompts) == 1:
            return ok({"title": "W", "instructions": "", "questions": [q(i) for i in range(1, 8)]})   # 7 of 10
        return ok({"title": "W", "instructions": "", "questions": [q(i) for i in range(8, 11)]})

    monkeypatch.setattr(artifacts, "generate_cheap_cloud", fake)
    out = artifacts.generate_worksheet("Ratios", 10)
    assert out["question_count"] == 10 and len(out["questions"]) == 10
    assert len(prompts) == 2 and "Write exactly 3 MORE" in prompts[1]
    assert "Question 1?" in prompts[1]            # shown what exists, so it can't repeat
    assert out["guardrail_warnings"] == []


def test_a_worksheet_that_cannot_reach_the_count_reports_the_real_one(monkeypatch):
    monkeypatch.setattr(artifacts, "generate_cheap_cloud",
                        lambda *a, **k: ok({"title": "W", "instructions": "", "questions": [q(1), q(2), q(3)]}))
    out = artifacts.generate_worksheet("Ratios", 10)
    assert out["question_count"] == 3 and out["requested_question_count"] == 10
    assert any("3 could be written" in w for w in out["guardrail_warnings"])


def test_repeated_and_empty_worksheet_questions_are_dropped(monkeypatch):
    monkeypatch.setattr(artifacts, "generate_cheap_cloud", lambda *a, **k: ok(
        {"title": "W", "instructions": "", "questions": [q(1), q(1), {"question_text": "", "answer": "x"}, q(2)]}))
    out = artifacts.generate_worksheet("Ratios", 2)
    assert [x["question_text"] for x in out["questions"]] == ["Question 1?", "Question 2?"]


# ---------------------------------------------------------------------------
# Notes, plans, activities
# ---------------------------------------------------------------------------

def test_lesson_notes_missing_a_recap_are_sent_back_once(monkeypatch):
    sections = [{"heading": "A", "content": "x" * 60}, {"heading": "B", "content": "y" * 60}]
    answers = [{"title": "N", "sections": sections, "real_life_examples": ["e"], "recap": ""},
               {"title": "N", "sections": sections, "real_life_examples": ["e"], "recap": "Done."}]
    seen = []

    def fake(prompt, **k):
        seen.append(prompt)
        return ok(answers[len(seen) - 1])

    monkeypatch.setattr(artifacts, "generate_cheap_cloud", fake)
    out = artifacts.generate_lesson_notes("Topic")
    assert out["recap"] == "Done." and "Add a closing recap." in seen[1] and out["generation"]["attempts"] == 2


def test_validators_for_plans_and_activities():
    assert validate_course_plan({"weekly_structure": [{"topic": "t", "lessons": ["l"], "objectives": ["o"]}]}, 3)[0].startswith("The plan must cover exactly 3")
    assert validate_coursework({"blocks": [{"type": "explanation"}] * 3})[0] == "The first block must be an introduction."
    assert validate_lesson_notes({"sections": [], "recap": "r", "real_life_examples": ["e"]})


def test_a_plan_with_the_wrong_number_of_weeks_is_renumbered_and_trimmed(monkeypatch):
    week = lambda n: {"week": 9, "topic": f"T{n}", "lessons": ["l"], "objectives": ["o"], "source_ids": []}
    monkeypatch.setattr(planning, "generate_cheap_cloud", lambda *a, **k: ok(
        {"title": "P", "grade": "9", "subject": "S", "duration_weeks": 3, "weekly_structure": [week(i) for i in range(5)]}))
    out = planning.generate_course_plan("9", "S", ["T"], duration_weeks=3)
    assert [w["week"] for w in out["weekly_structure"]] == [1, 2, 3]
    assert out["generation"]["attempts"] >= 1


def test_coursework_without_a_recap_is_retried(monkeypatch):
    bad = {"title": "L", "blocks": [{"type": "introduction", "position": 1, "content": {"text": "hi"}},
                                    {"type": "explanation", "position": 2, "content": {"text": "x"}},
                                    {"type": "activity", "position": 3, "content": {"text": "y"}}]}
    good = {**bad, "blocks": bad["blocks"] + [{"type": "recap", "position": 4, "content": {"text": "z"}}]}
    answers = [bad, good]
    prompts = []

    def fake(prompt, **k):
        prompts.append(prompt)
        return ok(answers[len(prompts) - 1])

    monkeypatch.setattr(coursework, "generate_cheap_cloud", fake)
    out = coursework.generate_interactive_coursework("Topic")
    assert len(prompts) == 2 and "The last block must be a recap." in prompts[1]
    assert out["blocks"][-1]["type"] == "recap" and out["guardrail_warnings"] == []


# ---------------------------------------------------------------------------
# Single-question regenerate
# ---------------------------------------------------------------------------

@pytest.fixture
def regen_db(monkeypatch):
    original = {"id": "q1", "assessment_id": "a1", "question_type": "short_answer", "marks": 3,
                "question_text": "Define demand.", "answer": "Quantity wanted at a price."}
    siblings = [{"id": "q1", "question_text": "Define demand."}, {"id": "q2", "question_text": "State the law of supply."}]

    def select(table, params):
        return [original] if table == "questions" and "assessment_id" not in params else siblings

    saved = []
    monkeypatch.setattr(assessments, "is_configured", lambda: True)
    monkeypatch.setattr(assessments, "table_select", select)
    monkeypatch.setattr(assessments, "table_insert", lambda t, row: saved.append(row) or row)
    monkeypatch.setattr(assessments, "search_many", lambda *a, **k: [])
    return saved


def test_regenerate_survives_unparseable_output_by_trying_once_more(regen_db, monkeypatch):
    outs = ["not json at all", json.dumps({"question_text": "Explain demand using a graph.", "answer": "A downward curve."})]
    monkeypatch.setattr(assessments, "generate_cheap_cloud", lambda *a, **k: {"success": True, "content": outs.pop(0), "model_name": "m"})
    res = assessments.regenerate_single_question("q1", "harder", "ws")
    assert res["new_question"]["question_text"].startswith("Explain demand")
    assert regen_db and regen_db[0]["question_text"].startswith("Explain demand")


def test_regenerate_refuses_to_return_the_same_question_or_a_repeat(regen_db, monkeypatch):
    same = json.dumps({"question_text": "define demand.", "answer": "x"})
    repeat = json.dumps({"question_text": "State the law of supply.", "answer": "x"})
    outs = [same, repeat]
    monkeypatch.setattr(assessments, "generate_cheap_cloud", lambda *a, **k: {"success": True, "content": outs.pop(0), "model_name": "m"})
    with pytest.raises(RuntimeError, match="couldn't write a good replacement"):
        assessments.regenerate_single_question("q1", "harder", "ws")
    assert regen_db == []          # nothing stored for a rejected question


def test_regenerate_keeps_the_slots_type_and_marks(regen_db, monkeypatch):
    out = json.dumps({"question_text": "Why does demand slope down?", "answer": "Substitution.", "marks": 9, "question_type": "long_answer", "options": ["a"]})
    monkeypatch.setattr(assessments, "generate_cheap_cloud", lambda *a, **k: {"success": True, "content": out, "model_name": "m"})
    nq = assessments.regenerate_single_question("q1", "conceptual", "ws")["new_question"]
    assert nq["marks"] == 3 and nq["question_type"] == "short_answer" and nq["options"] is None


# ---------------------------------------------------------------------------
# The circuit breaker
# ---------------------------------------------------------------------------

def test_a_model_that_keeps_saying_busy_is_skipped_for_a_while(monkeypatch):
    from app.ai import cheap_model

    attempts = []

    def fake(prompt, system_prompt="", model=None, json_mode=False, temperature=0.4):
        attempts.append(model)
        if model == "primary":
            raise GeminiError("busy", failure=FailureClass.UPSTREAM_BUSY)
        return "{}"

    monkeypatch.setattr(cheap_model, "generate_text", fake)
    monkeypatch.setattr(cheap_model.settings, "gemini_fallback_models", "primary,backup")
    for _ in range(3):
        cheap_model.generate_cloud("p", model_override="primary")
    attempts.clear()
    res = cheap_model.generate_cloud("p", model_override="primary")
    assert res["success"] and attempts == ["backup"]          # primary not even tried


def test_the_breaker_never_skips_the_only_model_available(monkeypatch):
    from app.ai import cheap_model

    seen = []
    monkeypatch.setattr(cheap_model, "generate_text", lambda *a, **k: seen.append(k.get("model")) or (_ for _ in ()).throw(GeminiError("busy", failure=FailureClass.UPSTREAM_BUSY)))
    monkeypatch.setattr(cheap_model.settings, "gemini_fallback_models", "only")
    monkeypatch.setattr(cheap_model.groq_client, "is_configured", lambda: False)
    for _ in range(5):
        cheap_model.generate_cloud("p", model_override="only")
    assert seen.count("only") == 5                            # still tried every time


def test_quota_errors_do_not_open_the_breaker(monkeypatch):
    from app.ai import cheap_model

    seen = []
    monkeypatch.setattr(cheap_model, "generate_text", lambda *a, **k: seen.append(k.get("model")) or (_ for _ in ()).throw(GeminiError("quota", failure=FailureClass.QUOTA_EXHAUSTED)))
    monkeypatch.setattr(cheap_model.settings, "gemini_fallback_models", "primary,backup")
    for _ in range(6):
        cheap_model.generate_cloud("p", model_override="primary")
    assert seen == ["primary"] * 6
