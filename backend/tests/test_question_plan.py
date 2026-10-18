"""A teacher's chosen question types and counts (question_plan): the paper's exact shape.

The model is stubbed throughout; the stub writes whatever shape the prompt
asks for, optionally sabotaged, so the guardrails can be watched working.
"""
import json
import re

import pytest

from app.generation import assessments
from app.generation.assessments import blueprint_from_plan

ROW = re.compile(r"- (Section \w): (\d+) (\w+) question\(s\) x (\d+) mark")


def writer(calls: list, *, mislabel=False, drop_one=False, blank=True, mcq_options=4):
    """A stand-in model that follows the prompt's structure, with optional faults."""
    def fake(prompt, task=None, system_prompt=None, json_mode=False, **_):
        calls.append(prompt)
        sections, n = [], 0
        for name, count, qtype, each in ROW.findall(prompt):
            count = int(count) - (1 if drop_one and not sections else 0)
            qs = []
            for _ in range(count):
                n += 1
                text = f"Question {n}" + (" The capital is ____." if qtype == "fill_blank" and blank else "")
                qs.append({
                    "question_number": 99, "section": "wrong",
                    "question_type": "short_answer" if mislabel else qtype,
                    "question_text": text, "marks": 7 if mislabel else int(each),
                    "difficulty": "medium", "bloom_level": "apply",
                    "options": [f"o{i}" for i in range(mcq_options)] if qtype == "mcq" else None,
                    "answer": "x", "solution": "y", "source_ids": [],
                })
            sections.append({"name": name, "instructions": "", "questions": qs})
        total = sum(q["marks"] for s in sections for q in s["questions"])
        paper = {"title": "T", "subject": "Economics", "grade": "12", "total_marks": total, "duration_minutes": 60, "sections": sections}
        return {"success": True, "content": json.dumps(paper), "model_name": "fake"}

    return fake


PLAN = [
    {"type": "long_answer", "count": 2, "marks_each": 5},
    {"type": "mcq", "count": 10},
    {"type": "fill_blank", "count": 5},
]


def test_plan_becomes_sections_in_paper_order_with_default_marks():
    assert blueprint_from_plan(PLAN) == [
        ("Section A", "mcq", 10, 1),
        ("Section B", "fill_blank", 5, 1),
        ("Section C", "long_answer", 2, 5),
    ]


def test_total_marks_follow_from_the_plan(monkeypatch):
    calls: list = []
    monkeypatch.setattr(assessments, "generate_assessment_cloud", writer(calls))
    result = assessments.generate_assessment("Class 12", "Economics", ["Demand"], total_marks=80, question_plan=PLAN)
    assert result["validation"]["valid"] is True
    paper = result["assessment"]
    assert paper["total_marks"] == 25
    assert [len(s["questions"]) for s in paper["sections"]] == [10, 5, 2]
    assert "Total marks required: 25" in calls[0]


def test_only_the_chosen_types_rules_are_sent(monkeypatch):
    calls: list = []
    monkeypatch.setattr(assessments, "generate_assessment_cloud", writer(calls))
    assessments.generate_assessment("Class 12", "Economics", ["Demand"], question_plan=[{"type": "true_false", "count": 5}])
    assert "true_false:" in calls[0]
    assert "mcq:" not in calls[0] and "case_based:" not in calls[0] and "fill_blank:" not in calls[0]


def test_mislabelled_types_and_marks_are_repaired_without_a_second_call(monkeypatch):
    calls: list = []
    monkeypatch.setattr(assessments, "generate_assessment_cloud", writer(calls, mislabel=True))
    result = assessments.generate_assessment("Class 12", "Economics", ["Demand"], question_plan=PLAN)
    assert len(calls) == 1
    assert result["validation"]["valid"] is True
    qs = [q for s in result["assessment"]["sections"] for q in s["questions"]]
    assert [q["question_type"] for q in qs] == ["mcq"] * 10 + ["fill_blank"] * 5 + ["long_answer"] * 2
    assert [q["question_number"] for q in qs] == list(range(1, 18))
    assert all(q["options"] is None for q in qs if q["question_type"] != "mcq")


def test_a_wrong_count_is_sent_back_once_then_reported(monkeypatch):
    calls: list = []
    monkeypatch.setattr(assessments, "generate_assessment_cloud", writer(calls, drop_one=True))
    result = assessments.generate_assessment("Class 12", "Economics", ["Demand"], question_plan=PLAN)
    assert len(calls) == 2
    # Attempt 2 rewrites only the failing section, not the whole paper.
    assert "Rewrite ONLY these sections" in calls[1] and "Section A: exactly 10 mcq" in calls[1]
    assert "Section B: exactly" not in calls[1].split("Rewrite ONLY these sections")[1]
    # Still wrong after the retry: the paper is shown with the problem listed.
    assert result["validation"]["valid"] is False
    assert "Section A must have exactly 10" in result["validation"]["errors"][0]


@pytest.mark.parametrize("fault,expected", [
    ({"mcq_options": 2}, "fewer than 3 options"),
    ({"blank": False}, "has no blank"),
])
def test_type_rules_are_checked(monkeypatch, fault, expected):
    calls: list = []
    monkeypatch.setattr(assessments, "generate_assessment_cloud", writer(calls, **fault))
    result = assessments.generate_assessment("Class 12", "Economics", ["Demand"], question_plan=PLAN)
    assert len(calls) == 2
    assert result["validation"]["valid"] is False and expected in result["validation"]["errors"][0]


def test_true_false_options_are_set_in_code(monkeypatch):
    calls: list = []
    monkeypatch.setattr(assessments, "generate_assessment_cloud", writer(calls))
    result = assessments.generate_assessment("Class 12", "Economics", ["Demand"], question_plan=[{"type": "true_false", "count": 3}])
    assert all(q["options"] == ["True", "False"] for q in result["assessment"]["sections"][0]["questions"])


# ---------------------------------------------------------------------------
# API limits
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("plan", [
    [{"type": "mcq", "count": 5}, {"type": "mcq", "count": 3}],      # same type twice
    [{"type": "mcq", "count": 0}],                                     # nothing to write
    [{"type": "mcq", "count": 30}, {"type": "short_answer", "count": 31}],  # over 30 per type
    [{"type": "mcq", "count": 30}, {"type": "short_answer", "count": 30}, {"type": "true_false", "count": 1}],  # over 60
    [{"type": "long_answer", "count": 30, "marks_each": 10}],          # over 200 marks
    [{"type": "essay", "count": 2}],                                   # unknown type
])
def test_api_rejects_plans_outside_the_limits(client, provisioned_workspace, plan):
    body = {"grade": "12", "subject": "Economics", "topics": ["Demand"], "question_plan": plan}
    resp = client.post("/api/assessments/generate", headers=provisioned_workspace["headers"], json=body)
    assert resp.status_code == 422
