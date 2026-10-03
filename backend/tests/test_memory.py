"""Teaching memory (app/memory): reading past files, traits, the teacher's decisions, and generation.

Files are built with python-docx / python-pptx so the real readers run. No
model is called anywhere: the paper generator is stubbed, and the memory
package never calls one.
"""
import io
import json
import re

import pytest
from docx import Document
from pptx import Presentation

from app.generation import assessments
from app.memory import store
from app.memory.classify import classify
from app.memory.papers import parse_paper
from app.memory.safety import REDACTED, check_student_work, redact
from app.memory.style import blueprint_from_structure, prompt_lines
from app.memory.text import UnreadableFile
from app.memory.traits import derive_traits
from app.memory.verbs import command_verb

WS = "ws-memory"


@pytest.fixture(autouse=True)
def _empty_store():
    store._local[store.DOCUMENTS].clear()
    store._local[store.TRAITS].clear()
    yield
    store._local[store.DOCUMENTS].clear()
    store._local[store.TRAITS].clear()


def economics_paper(topic: str = "Demand", total: int = 40, case: bool = True) -> list:
    """A paper in a common Indian board shape: 10 x 1 MCQ, 5 x 3 short, 3 x 5 long (one case-based)."""
    lines = [
        "Unit Test — Economics",
        f"Time Allowed: 1½ hours        Maximum Marks: {total}",
        "General Instructions: All questions are compulsory.",
        "Name: ______________   Roll No: ______",
        "Section A",
        "Each question carries 1 mark.",
    ]
    for n in range(1, 11):
        lines += [f"{n}. Which of the following best describes {topic.lower()} point {n}?", "(a) one (b) two", "(c) three (d) four"]
    lines += ["Section B"]
    verbs = ["Explain", "Explain", "Distinguish between", "Calculate the elasticity if price rises from 10 to 12 and", "Define"]
    for i, n in enumerate(range(11, 16)):
        lines.append(f"{n}. {verbs[i]} {topic.lower()} and supply in your own words. [3]")
    lines += ["Section C"]
    lines.append("16. Using the case above, evaluate whether the price ceiling helped consumers. (5 marks)" if case
                 else "16. Evaluate whether the price ceiling helped consumers. (5 marks)")
    lines += ["OR", "Assess the effect of a subsidy on producers. (5 marks)"]
    lines.append("17. Explain with a diagram how equilibrium price is determined. [5]")
    lines.append("18. Discuss two causes of a shift in the demand curve. [5]")
    return lines


def docx_bytes(lines: list) -> bytes:
    doc = Document()
    for line in lines:
        doc.add_paragraph(line)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def pptx_bytes(titles: list) -> bytes:
    prs = Presentation()
    for t in titles:
        slide = prs.slides.add_slide(prs.slide_layouts[1])
        slide.shapes.title.text = t
        slide.placeholders[1].text = "First point about this\nSecond point about this"
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Reading a paper
# ---------------------------------------------------------------------------

def test_a_paper_is_read_and_its_marks_reconcile_with_the_stated_total():
    fp = parse_paper(economics_paper())
    assert fp.total_marks == 40 and fp.duration_minutes == 90
    assert len(fp.questions) == 18
    assert fp.reconciled, fp.note
    assert [q.qtype for q in fp.questions[:10]] == ["mcq"] * 10
    assert all(q.marks == 3 for q in fp.questions[10:15])
    assert fp.questions[15].internal_choice and fp.questions[15].marks == 5  # "OR" counted once
    shape = [(r["type"], r["marks_each"], r["count"]) for r in fp.to_dict()["structure"]]
    assert shape[0] == ("mcq", 1, 10) and shape[-1] == ("long_answer", 5, 3)


def test_a_paper_whose_marks_dont_add_up_is_kept_but_not_trusted():
    fp = parse_paper(economics_paper(total=50))
    assert not fp.reconciled
    assert "40" in fp.note and "50" in fp.note
    assert fp.to_dict()["structure"] == []


def test_the_command_word_skips_framing():
    assert command_verb("Using the case above, evaluate whether the policy worked") == ("evaluate", "higher")
    assert command_verb("Define opportunity cost.") == ("define", "recall")
    assert command_verb("Read the passage and explain the author's view")[0] == "explain"


def test_document_kinds():
    assert classify("docx", economics_paper()) == "exam_paper"
    assert classify("docx", ["Worksheet 3: Ratios", "Practice questions", "1. Find the ratio [2]"]) == "worksheet"
    assert classify("docx", ["Lesson Plan: Photosynthesis", "Learning objectives", "Warm-up", "Activity"]) == "lesson_plan"
    assert classify("docx", ["Some notes about the French Revolution"]) == "notes"
    assert classify("pptx", []) == "slides"


# ---------------------------------------------------------------------------
# Student work and names
# ---------------------------------------------------------------------------

def test_a_blank_paper_template_is_not_student_work():
    assert not check_student_work(economics_paper()).is_student_work


def test_a_marked_script_is_refused():
    script = ["Name: Ravi Kumar   Class: 10 B", "Roll No: 23", "Marks Obtained: 31/40", "1. Demand means ..."]
    result = check_student_work(script)
    assert result.is_student_work and "student" in result.reason


def test_a_teachers_own_name_on_a_plan_is_not_a_student():
    plan = ["Prepared by: Mrs. Sharma", "Teacher Name: A. Sharma", "Remarks: revise before Diwali", "Lesson plan"]
    assert not check_student_work(plan).is_student_work


def test_identity_values_are_redacted():
    assert redact("Name: Ravi Kumar   Class: 10") == f"Name: {REDACTED}   Class: 10"
    assert redact("Roll No: 23") == f"Roll No: {REDACTED}"
    assert redact("Name: ________") == "Name: ________"


def test_refused_files_are_never_stored():
    script = docx_bytes(["Name: Ravi Kumar", "Roll No: 23", "Marks obtained: 31", *economics_paper()[4:]])
    with pytest.raises(store.StudentWorkRefused):
        store.add_document(workspace_id=WS, user_id="u", filename="ravi.docx", data=script)
    assert store._local[store.DOCUMENTS] == []


def test_unreadable_files_say_why():
    with pytest.raises(UnreadableFile, match="PDF, Word"):
        store.read_document(b"hello", "notes.txt")
    with pytest.raises(UnreadableFile):
        store.read_document(b"%PDF-1.4 not really", "scan.pdf")


# ---------------------------------------------------------------------------
# Traits
# ---------------------------------------------------------------------------

def _add_paper(subject="Economics", topic="Demand", **kw):
    return store.add_document(workspace_id=WS, user_id="u", filename=f"{topic}.docx", data=docx_bytes(economics_paper(topic, **kw)), subject=subject)


def test_one_paper_is_a_document_not_a_habit():
    _add_paper()
    assert store.list_traits(WS) == []


def test_two_matching_papers_suggest_traits_and_nothing_is_used_yet():
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    traits = {t["key"]: t for t in store.list_traits(WS)}
    assert {"structure", "level_mix", "case_based", "timing"} <= set(traits)
    assert all(t["status"] == "suggested" for t in traits.values())
    assert traits["structure"]["n_evidence"] == 2 and "all 2 papers" in traits["structure"]["summary"]
    assert store.active_traits(WS, "Economics", "exam_paper") == {}


def test_files_that_arent_the_teachers_own_dont_count():
    store.add_document(workspace_id=WS, user_id="u", filename="a.docx", data=docx_bytes(economics_paper()), subject="Economics", authored_by_me=False)
    store.add_document(workspace_id=WS, user_id="u", filename="b.docx", data=docx_bytes(economics_paper()), subject="Economics", authored_by_me=False)
    assert store.list_traits(WS) == []


def test_documents_list_shows_facts_not_question_text():
    _add_paper()
    doc = store.list_documents(WS)[0]
    assert doc["kind"] == "exam_paper" and doc["status"] == "ready" and doc["question_count"] == 18
    assert "questions" not in doc and "fingerprint" not in doc


def test_accepting_and_dismissing():
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    traits = {t["key"]: t for t in store.list_traits(WS)}
    store.decide(WS, traits["structure"]["id"], "use")
    store.decide(WS, traits["timing"]["id"], "dismiss")
    active = store.active_traits(WS, "Economics", "exam_paper")
    assert set(active) == {"structure"}


def test_traits_stay_in_their_subject():
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    for t in store.list_traits(WS):
        store.decide(WS, t["id"], "use")
    assert store.active_traits(WS, "economics", "exam_paper")  # case-insensitive
    assert store.active_traits(WS, "Physics", "exam_paper") == {}


def test_new_files_never_overwrite_an_accepted_trait():
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    timing = next(t for t in store.list_traits(WS) if t["key"] == "timing")
    store.decide(WS, timing["id"], "use")
    before = store.active_traits(WS, "Economics", "exam_paper")["timing"]["value"]

    # Two more papers with a much longer time allowed shift the median.
    for topic in ("Elasticity", "Markets"):
        lines = [ln.replace("1½ hours", "3 hours") for ln in economics_paper(topic)]
        store.add_document(workspace_id=WS, user_id="u", filename=f"{topic}.docx", data=docx_bytes(lines), subject="Economics")
    for topic in ("Costs",):
        lines = [ln.replace("1½ hours", "3 hours") for ln in economics_paper(topic)]
        store.add_document(workspace_id=WS, user_id="u", filename=f"{topic}.docx", data=docx_bytes(lines), subject="Economics")

    assert store.active_traits(WS, "Economics", "exam_paper")["timing"]["value"] == before
    timing = next(t for t in store.list_traits(WS) if t["key"] == "timing")
    assert timing["update"]  # offered, not applied
    store.decide(WS, timing["id"], "use")
    assert store.active_traits(WS, "Economics", "exam_paper")["timing"]["value"] != before


def test_deleting_the_files_makes_an_accepted_trait_stale_not_silent():
    a = _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    structure = next(t for t in store.list_traits(WS) if t["key"] == "structure")
    store.decide(WS, structure["id"], "use")
    store.delete_document(WS, a["id"])
    structure = next(t for t in store.list_traits(WS) if t["key"] == "structure")
    assert structure["status"] == "stale" and structure["evidence"] == []
    assert store.active_traits(WS, "Economics", "exam_paper") == {}


def test_forget_everything():
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    store.forget_all(WS)
    assert store.list_documents(WS) == [] and store.list_traits(WS) == []


def test_slides_are_read_but_shape_nothing_yet():
    deck = pptx_bytes(["Learning objectives", "Demand", "Supply", "Equilibrium", "Recap"])
    doc = store.add_document(workspace_id=WS, user_id="u", filename="deck.pptx", data=deck, subject="Economics")
    assert doc["kind"] == "slides" and doc["slide_count"] == 5
    assert derive_traits(store._local[store.DOCUMENTS]) == []


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("total", [20, 25, 30, 40, 50, 60, 80, 100])
def test_the_teachers_shape_scales_to_any_total_exactly(total):
    sections = parse_paper(economics_paper()).to_dict()["structure"]
    plan = blueprint_from_structure(total, sections)
    assert plan is not None
    assert sum(count * each for _, _, count, each in plan) == total
    assert [each for _, _, _, each in plan] == [s["marks_each"] for s in sections]


def test_a_shape_that_cannot_hit_the_total_falls_back():
    sections = [{"type": "long_answer", "marks_each": 5, "share": 1.0}]
    assert blueprint_from_structure(37, sections) is None


def _fake_paper_writer(captured: dict):
    """Stands in for the model: writes a paper with exactly the shape the prompt asks for."""
    row = re.compile(r"- (Section \w): (\d+) (\w+) question\(s\) x (\d+) mark")

    def fake(prompt, task=None, system_prompt=None, json_mode=False, **_):
        captured["prompt"] = prompt
        sections, n = [], 0
        for name, count, qtype, each in row.findall(prompt):
            qs = []
            for _ in range(int(count)):
                n += 1
                qs.append({
                    "question_number": n, "section": name, "question_type": qtype, "question_text": f"Question {n}",
                    "marks": int(each), "difficulty": "medium", "bloom_level": "understand",
                    "options": ["a", "b", "c", "d"] if qtype == "mcq" else None,
                    "answer": "x", "solution": "y", "source_ids": [],
                })
            sections.append({"name": name, "instructions": "", "questions": qs})
        total = sum(q["marks"] for s in sections for q in s["questions"])
        paper = {"title": "T", "subject": "Economics", "grade": "12", "total_marks": total, "duration_minutes": 60, "sections": sections}
        return {"success": True, "content": json.dumps(paper), "model_name": "fake"}

    return fake


def test_an_accepted_style_shapes_the_paper_and_says_so(monkeypatch):
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    for t in store.list_traits(WS):
        store.decide(WS, t["id"], "use")

    captured: dict = {}
    monkeypatch.setattr(assessments, "generate_assessment_cloud", _fake_paper_writer(captured))
    result = assessments.generate_assessment("Class 12", "Economics", ["Elasticity"], total_marks=40, workspace_id=WS)

    assert result["validation"]["valid"] is True
    prompt = captured["prompt"]
    assert "Section A: 10 mcq question(s) x 1 mark(s)" in prompt
    assert "Section C: 3 long_answer question(s) x 5 mark(s) = 15 marks (case-based)" in prompt
    assert "never a source of facts" in prompt
    assert {a["key"] for a in result["style_applied"]} >= {"structure", "level_mix"}
    # Nothing from the past papers themselves goes to the model.
    assert "price ceiling" not in prompt and "Which of the following" not in prompt


def test_style_can_be_turned_off_for_one_paper(monkeypatch):
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    for t in store.list_traits(WS):
        store.decide(WS, t["id"], "use")
    captured: dict = {}
    monkeypatch.setattr(assessments, "generate_assessment_cloud", _fake_paper_writer(captured))
    result = assessments.generate_assessment("Class 12", "Economics", ["Elasticity"], total_marks=40, workspace_id=WS, use_style=False)
    assert result["style_applied"] == [] and "teacher's own style" not in captured["prompt"]


def test_suggested_traits_never_reach_the_prompt(monkeypatch):
    _add_paper(topic="Demand")
    _add_paper(topic="Supply")
    captured: dict = {}
    monkeypatch.setattr(assessments, "generate_assessment_cloud", _fake_paper_writer(captured))
    result = assessments.generate_assessment("Class 12", "Economics", ["Elasticity"], total_marks=40, workspace_id=WS)
    assert result["style_applied"] == [] and "teacher's own style" not in captured["prompt"]


def test_prompt_lines_are_empty_without_traits():
    assert prompt_lines({}, 40) == []


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def _upload(client, ws, data, name="paper.docx", **form):
    fields = {"confirm_no_student_data": "true", "subject": "Economics", **form}
    return client.post("/api/memory/documents", headers=ws["headers"], data=fields, files={"file": (name, data)})


def test_api_upload_requires_the_no_student_data_confirmation(client, provisioned_workspace):
    resp = _upload(client, provisioned_workspace, docx_bytes(economics_paper()), confirm_no_student_data="false")
    assert resp.status_code == 400


def test_api_refuses_student_work_with_a_reason(client, provisioned_workspace):
    script = docx_bytes(["Name: Ravi Kumar", "Roll No: 23", "Marks obtained: 31", "1. Demand is ..."])
    resp = _upload(client, provisioned_workspace, script)
    assert resp.status_code == 422 and "student" in resp.json()["detail"]


def test_api_round_trip(client, provisioned_workspace):
    ws = provisioned_workspace
    assert _upload(client, ws, docx_bytes(economics_paper("Demand"))).status_code == 200
    assert _upload(client, ws, docx_bytes(economics_paper("Supply"))).status_code == 200
    memory = client.get("/api/memory", headers=ws["headers"]).json()
    assert len(memory["documents"]) == 2
    structure = next(t for t in memory["traits"] if t["key"] == "structure")
    decided = client.post(f"/api/memory/traits/{structure['id']}", headers=ws["headers"], json={"action": "use"})
    assert decided.status_code == 200 and decided.json()["status"] == "active"
    assert client.delete("/api/memory", headers=ws["headers"]).status_code == 200
    assert client.get("/api/memory", headers=ws["headers"]).json() == {"documents": [], "traits": []}


def test_api_is_behind_the_beta_gate(client, unverified_auth_headers):
    assert client.get("/api/memory", headers=unverified_auth_headers).status_code == 403


def test_a_paper_vivran_exported_reads_back_exactly():
    """Teachers will upload papers Vivran made for them; our own PDF must round-trip."""
    from app.generation.pdf_export import render_assessment_pdf

    sections, n = [], 0
    for name, qtype, count, each in [("Section A", "mcq", 10, 1), ("Section B", "short_answer", 5, 3), ("Section C", "long_answer", 3, 5)]:
        qs = []
        for _ in range(count):
            n += 1
            qs.append({"question_number": n, "question_type": qtype, "question_text": f"Explain idea {n} of demand.",
                       "marks": each, "options": ["Alpha", "Beta", "Gamma", "Delta"] if qtype == "mcq" else None,
                       "answer": "x", "solution": "y"})
        sections.append({"name": name, "instructions": "", "questions": qs})
    pdf = render_assessment_pdf({"title": "Unit test", "subject": "Economics", "grade": "12", "total_marks": 40,
                                 "duration_minutes": 90, "sections": sections}, include_answer_key=False)

    read = store.read_document(pdf, "unit-test.pdf")
    fp = read["fingerprint"]
    assert read["kind"] == "exam_paper" and read["status"] == "ready", read["status_reason"]
    assert fp["total_marks"] == 40 and fp["duration_minutes"] == 90
    assert [(s["type"], s["marks_each"], s["count"]) for s in fp["structure"]] == [
        ("mcq", 1, 10), ("short_answer", 3, 5), ("long_answer", 5, 3)
    ]
