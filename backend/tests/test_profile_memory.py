"""Dynamic teacher memory: requests -> habits that follow the teacher.

Habits are derived from what a teacher asks for (prompts, settings, how they
change questions), recomputed after each request, offered rather than imposed,
and only accepted ones reach a prompt.
"""
import pytest

from app.generation import assessments
from app.memory import events, store
from app.memory.profile import derive_profile_traits, usual_setup
from app.memory.events import redact_prompt

WS = "ws-profile"


@pytest.fixture(autouse=True)
def _empty():
    events._local.clear()
    store._local[store.DOCUMENTS].clear()
    store._local[store.TRAITS].clear()
    yield
    events._local.clear()
    store._local[store.DOCUMENTS].clear()
    store._local[store.TRAITS].clear()


def gen(artifact="assessment", subject="Economics", grade="Class 12", **params):
    events.record_generation(WS, artifact, subject, grade, params)


def prompt(text, subject="Economics", grade="Class 12"):
    events.record_prompt(WS, text, {"subject": subject, "grade": grade, "topics": ["Demand"]})


def traits():
    return {(t["subject"], t["key"]): t for t in store.list_traits(WS) if t["kind"] == "profile"}


# ---------------------------------------------------------------------------
# What is stored
# ---------------------------------------------------------------------------

def test_prompts_are_stripped_of_contact_details_and_capped():
    out = redact_prompt("Mail me at ravi.k@school.in or call +91 98765 43210, see https://x.example/a  test on demand")
    assert "@" not in out and "98765" not in out and "https" not in out
    assert "[email]" in out and "[number]" in out and "[link]" in out
    assert len(redact_prompt("word " * 500)) <= 400


def test_only_known_settings_are_kept_from_a_request():
    gen(total_marks=40, difficulty="hard", material_id="secret-id", topics=["a", "b"])
    saved = events.recent(WS)[0]["params"]
    assert saved["total_marks"] == 40 and "material_id" not in saved


def test_recent_prompts_list_and_deletion():
    prompt("20 mark test on demand")
    prompt("worksheet on supply")
    listed = events.recent_prompts(WS)
    assert [p["text"] for p in listed] == ["worksheet on supply", "20 mark test on demand"]
    assert events.delete_prompt(WS, listed[0]["id"]) and len(events.recent_prompts(WS)) == 1
    events.clear_all(WS)
    assert events.recent_prompts(WS) == []


def test_history_is_capped_and_old_events_are_pruned():
    for i in range(events.MAX_EVENTS + 20):
        gen(total_marks=40)
    assert len(events.recent(WS, 1000)) == events.MAX_EVENTS


# ---------------------------------------------------------------------------
# Habits
# ---------------------------------------------------------------------------

def test_two_requests_are_an_incident_three_are_a_habit():
    gen(total_marks=40); gen(total_marks=40)
    assert ("economics", "assessment.marks") not in traits()
    gen(total_marks=40)
    t = traits()[("economics", "assessment.marks")]
    assert t["status"] == "suggested" and "40 marks" in t["summary"] and "3 of 3" in t["summary"]


def test_a_habit_needs_a_clear_majority():
    for m in (20, 30, 40, 50):
        gen(total_marks=m)
    assert ("economics", "assessment.marks") not in traits()


def test_usual_class_and_difficulty_are_found():
    for _ in range(3):
        gen(total_marks=40, difficulty="hard")
    t = traits()
    assert t[("", "usual_class")]["summary"].startswith("You mostly make things for Class 12, Economics")
    assert "hard difficulty" in t[("economics", "assessment.difficulty")]["summary"]


def test_habits_are_per_subject():
    for _ in range(3):
        gen(subject="Economics", total_marks=40)
        gen(subject="Physics", grade="Class 11", total_marks=25)
    t = traits()
    assert t[("economics", "assessment.marks")]["summary"].count("40") and t[("physics", "assessment.marks")]["summary"].count("25")


def test_chosen_question_types_become_a_habit():
    plan = [{"type": "mcq", "count": 10, "marks_each": 1}, {"type": "long_answer", "count": 2, "marks_each": 5}]
    for _ in range(3):
        gen(total_marks=20, question_plan=plan)
    t = traits()[("economics", "assessment.question_plan")]
    assert "10 mcq × 1" in t["summary"] and "2 long answer × 5" in t["summary"]


def test_the_angle_of_prompts_is_learned_from_a_fixed_list_not_from_topics():
    for text in ["application questions on demand", "case study on supply", "application based test on elasticity",
                 "numericals on costs", "application questions on markets"]:
        prompt(text)
    t = traits()[("", "angles")]
    assert "application" in t["summary"]
    assert "demand" not in t["summary"].lower() and "supply" not in t["summary"].lower()   # topics are not habits


def test_how_a_teacher_changes_questions_is_a_habit():
    for _ in range(4):
        events.record_regenerate(WS, "application")
    assert "application" in traits()[("", "regen_bias")]["summary"]


# ---------------------------------------------------------------------------
# Dynamic: the picture follows the teacher
# ---------------------------------------------------------------------------

def test_an_accepted_habit_is_not_overwritten_when_requests_change_it_is_offered_the_update():
    for _ in range(3):
        gen(total_marks=40)
    t = traits()[("economics", "assessment.marks")]
    store.decide(WS, t["id"], "use")
    for _ in range(8):
        gen(total_marks=60)
    now = traits()[("economics", "assessment.marks")]
    assert now["status"] == "active" and "40 marks" in now["summary"]            # still what they accepted
    assert now["update"] and "60 marks" in now["update"]                          # the new habit is offered
    store.decide(WS, now["id"], "use")
    assert "60 marks" in traits()[("economics", "assessment.marks")]["summary"]


def test_deleting_a_prompt_changes_the_habits_derived_from_it():
    for t in ["application questions on a", "application questions on b", "application questions on c", "application on d", "application on e"]:
        prompt(t)
    assert ("", "angles") in traits()
    for p in events.recent_prompts(WS)[:3]:
        events.delete_prompt(WS, p["id"])
    assert ("", "angles") not in traits()


def test_forgetting_everything_clears_requests_too():
    for _ in range(3):
        gen(total_marks=40)
    store.forget_all(WS)
    assert events.recent(WS) == [] and store.list_traits(WS) == []


# ---------------------------------------------------------------------------
# What reaches generation
# ---------------------------------------------------------------------------

def test_a_suggested_habit_never_reaches_a_prompt_but_an_accepted_one_does():
    for text in ["application questions on a", "application on b", "application on c", "case study on d", "application on e"]:
        prompt(text)
    assert store.habit_lines(WS, "Economics") == []
    store.decide(WS, traits()[("", "angles")]["id"], "use")
    lines = "\n".join(store.habit_lines(WS, "Economics"))
    assert "application" in lines and "never the facts" in lines


def test_habit_lines_reach_the_paper_prompt(monkeypatch):
    captured = {}
    monkeypatch.setattr(assessments, "generate_assessment_cloud", lambda prompt, **k: captured.setdefault("p", prompt) and {"success": False, "error": "stop", "failure": None})
    assessments.generate_assessment("Class 12", "Economics", ["Demand"], habit_lines=["- Lean application."])
    assert "- Lean application." in captured["p"]


# ---------------------------------------------------------------------------
# One-tap setup
# ---------------------------------------------------------------------------

def test_the_usual_setup_chip_combines_class_and_settings():
    for _ in range(4):
        gen(total_marks=40, difficulty="medium")
    chip = store.usual(WS, "assessment")
    assert chip["fields"] == {"grade": "Class 12", "subject": "Economics", "marks": 40, "difficulty": "medium"}
    assert chip["label"] == "Class 12 · Economics · 40 marks · Medium" and chip["status"] == "suggested"


def test_dismissed_habits_are_left_out_of_the_chip():
    for _ in range(4):
        gen(total_marks=40, difficulty="medium")
    store.decide(WS, traits()[("economics", "assessment.difficulty")]["id"], "dismiss")
    assert "difficulty" not in store.usual(WS, "assessment")["fields"]


def test_no_habits_no_chip():
    gen(total_marks=40)
    assert store.usual(WS, "assessment") is None


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def test_api_round_trip(client, provisioned_workspace):
    h, ws = provisioned_workspace["headers"], provisioned_workspace["workspace_id"]
    for _ in range(3):
        assert client.post("/api/memory/events", headers=h, json={"artifact": "slides", "subject": "History", "grade": "Class 9", "params": {"slide_count": 8, "junk": 1}}).status_code == 200
    mem = client.get("/api/memory", headers=h).json()
    assert any(t["key"] == "slides.slide_count" and "8 slides" in t["summary"] for t in mem["traits"])
    chip = client.get("/api/memory/usual?artifact=slides", headers=h).json()["usual"]
    assert chip["fields"]["slide_count"] == 8


def test_api_prompts_are_listed_and_deletable(client, provisioned_workspace, monkeypatch):
    h = provisioned_workspace["headers"]
    r = client.post("/api/workflow/parse-intent", headers=h, json={"teacher_prompt": "20 mark test on demand and supply for class 11 economics"})
    assert r.status_code == 200
    prompts = client.get("/api/memory/prompts", headers=h).json()["prompts"]
    assert prompts and "demand and supply" in prompts[0]["text"]
    assert client.delete(f"/api/memory/prompts/{prompts[0]['id']}", headers=h).status_code == 200
    assert client.get("/api/memory/prompts", headers=h).json()["prompts"] == []
    assert client.delete("/api/memory/prompts/nope", headers=h).status_code == 404


def test_api_rejects_unknown_artifacts_in_reported_events(client, provisioned_workspace):
    r = client.post("/api/memory/events", headers=provisioned_workspace["headers"], json={"artifact": "assessment", "params": {}})
    assert r.status_code == 422
