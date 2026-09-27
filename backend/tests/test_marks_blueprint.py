import pytest

from app.generation.assessments import _apply_blueprint_marks, _build_prompt, marks_blueprint


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard", "unknown"])
def test_every_blueprint_sums_to_the_requested_total(difficulty):
    for total in range(1, 301):
        plan = marks_blueprint(total, difficulty)
        assert sum(count * each for _, _, count, each in plan) == total
        assert all(count > 0 for _, _, count, _ in plan)


def test_harder_papers_lean_on_long_answers():
    easy = dict((q, c * e) for _, q, c, e in marks_blueprint(60, "easy"))
    hard = dict((q, c * e) for _, q, c, e in marks_blueprint(60, "hard"))
    assert hard["long_answer"] > easy["long_answer"]
    assert hard["mcq"] < easy["mcq"]


def test_the_prompt_states_the_structure():
    prompt = _build_prompt("Class 10", "Maths", ["AP"], 40, "medium", [])
    assert "Section A: 8 mcq question(s) x 1 mark(s) = 8 marks" in prompt


def _paper(shape, marks=7):
    return {"total_marks": 1, "sections": [{"questions": [{"marks": marks} for _ in range(n)]} for n in shape]}


def test_marks_are_stamped_when_the_model_kept_the_shape():
    plan = marks_blueprint(40, "medium")
    data = _paper([c for _, _, c, _ in plan])
    _apply_blueprint_marks(data, plan, 40)
    assert sum(q["marks"] for s in data["sections"] for q in s["questions"]) == 40
    assert data["total_marks"] == 40


def test_a_paper_with_a_different_shape_is_left_for_the_validator():
    plan = marks_blueprint(40, "medium")
    data = _paper([3, 3])
    _apply_blueprint_marks(data, plan, 40)
    assert all(q["marks"] == 7 for s in data["sections"] for q in s["questions"])
    assert data["total_marks"] == 1
