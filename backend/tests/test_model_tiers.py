"""Which model actually runs each task (app/ai/router.py and its call sites).

These exist because the tier layer used to be decorative: three settings all
naming one model, and a router that returned a label nobody acted on. Each test
below pins one of the decisions that makes the tiers real, including the two
places we deliberately did NOT go cheaper.
"""
import json

from app.ai.language import uses_non_latin_script
from app.ai.router import AIRequest, ModelRouter, ModelTier, model_for_tier, select_tier
from app.core.config import settings


# ---------------------------------------------------------------------------
# Tier selection
# ---------------------------------------------------------------------------


def test_extraction_tasks_go_to_the_slm_tier():
    for task in ("intent", "compilation", "classification", "clarification", "prompt_enhancement"):
        assert select_tier(task) is ModelTier.SLM, task


def test_authoring_tasks_stay_on_the_cheap_cloud_tier():
    for task in ("content_generation", "assessment_creation", "coursework_planning", "question_regen"):
        assert select_tier(task) is ModelTier.CHEAP_CLOUD, task


def test_the_tier_layer_routes_rather_than_decorates():
    """The tiers were originally three names for one model, with a router that
    only described routes. They are now separately addressable settings.

    This deliberately does NOT assert the models differ. They currently do not:
    gemini-3.6-flash returned 429/503 on every authoring attempt measured, while
    flash-lite produced a full 12-slide deck with zero repairs, so authoring was
    repinned onto it. What must stay true is that each tier is pinned by its own
    setting, so repinning one cannot silently move another."""
    from app.core.config import SLM_MODEL, settings

    assert SLM_MODEL == "gemini-3.5-flash-lite"
    # Each tier reads its own setting rather than sharing one knob.
    assert model_for_tier(ModelTier.SLM) == settings.slm_model
    assert model_for_tier(ModelTier.CHEAP_CLOUD) == settings.cheap_model
    assert settings.assessment_model  # papers are pinned independently


def test_the_dead_2_5_model_is_not_referenced_anywhere_in_settings():
    """gemini-2.5-flash-lite is still listed by the models endpoint but 404s
    with "no longer available to new users"."""
    for name in (settings.slm_model, settings.open_model, settings.cheap_model, settings.premium_model):
        assert "2.5" not in name, name


def test_the_router_reports_the_model_that_will_really_be_used():
    route = ModelRouter().route(AIRequest(prompt="x", task_type="intent", complexity="simple"))
    assert route["model_tier"] == "slm"
    assert route["model_name"] == settings.slm_model


def test_the_router_reports_the_cheap_fallback_while_premium_is_switched_off(monkeypatch):
    monkeypatch.setattr(settings, "premium_tier_enabled", False)
    route = ModelRouter().route(AIRequest(prompt="x", task_type="assessment_creation", complexity="complex"))
    assert route["requested_tier"] == "premium"
    assert route["model_tier"] == "cheap_cloud"
    assert route["model_name"] == settings.cheap_model


def test_the_router_reports_premium_once_it_is_switched_on(monkeypatch):
    monkeypatch.setattr(settings, "premium_tier_enabled", True)
    route = ModelRouter().route(AIRequest(prompt="x", task_type="assessment_creation", complexity="complex"))
    assert route["model_tier"] == "premium"
    assert route["model_name"] == settings.premium_model


# ---------------------------------------------------------------------------
# The two deliberate non-downgrades
# ---------------------------------------------------------------------------


VALID_ASSESSMENT = {
    "title": "Class 12 Accountancy Paper",
    "subject": "Accountancy",
    "grade": "Class 12",
    "total_marks": 80,
    "duration_minutes": 180,
    "sections": [{
        "name": "Section A",
        "instructions": "Answer all.",
        "questions": [{
            "question_number": 1, "section": "Section A", "question_type": "long_answer",
            "question_text": "Prepare a balance sheet.", "marks": 80, "difficulty": "hard",
            "bloom_level": "apply", "options": None, "answer": "...", "solution": "...",
        }],
    }],
}


def _capture_models(monkeypatch, module_path, payload):
    """Patches generate_text at the tier wrapper and records the model asked for."""
    models: list = []

    def fake(prompt, system_prompt="", model=None, json_mode=False, temperature=0.4):
        models.append(model)
        return payload

    monkeypatch.setattr(module_path, fake)
    return models


def test_assessment_generation_uses_its_own_pinned_model(monkeypatch):
    """Marks arithmetic under a constraint is the classic small-model failure,
    so which model writes a paper must be an explicit decision rather than a
    consequence of whatever the authoring tier is pinned to this week.

    Measured before pinning: gemini-3.6-flash 429'd on all three test papers;
    flash-lite got 40 -> 40 and 60 -> 60 correct. generate_assessment also runs
    a validate -> feed-errors-back -> regenerate loop, so a miss is caught.
    Repinning settings.assessment_model is the one-line way to change this."""
    from app.generation.assessments import generate_assessment

    models = _capture_models(monkeypatch, "app.ai.cheap_model.generate_text", json.dumps(VALID_ASSESSMENT))
    generate_assessment("Class 12", "Accountancy", ["Balance Sheets"], total_marks=80, difficulty="hard")

    assert models and all(m == settings.assessment_model for m in models)


def test_repinning_the_authoring_model_does_not_move_exam_papers(monkeypatch):
    """The regression the separate pin exists to prevent."""
    from app.generation.assessments import generate_assessment

    monkeypatch.setattr(settings, "cheap_model", "some-other-authoring-model")
    models = _capture_models(monkeypatch, "app.ai.cheap_model.generate_text", json.dumps(VALID_ASSESSMENT))
    generate_assessment("Class 12", "Accountancy", ["Balance Sheets"], total_marks=80, difficulty="hard")

    assert models and all(m == settings.assessment_model for m in models)
    assert "some-other-authoring-model" not in models


def test_a_hard_80_mark_paper_does_not_touch_the_premium_model(monkeypatch):
    """Ungated, "hard or >=60 marks" matched most real papers and spent 1-2
    guaranteed-429 requests per paper out of the 20 available that minute."""
    from app.generation import assessments

    monkeypatch.setattr(settings, "premium_tier_enabled", False)
    premium_calls: list = []
    monkeypatch.setattr(
        assessments, "generate_premium_cloud",
        lambda *a, **k: premium_calls.append(1) or {"success": False, "error": "429"},
    )
    _capture_models(monkeypatch, "app.ai.cheap_model.generate_text", json.dumps(VALID_ASSESSMENT))

    result = assessments.generate_assessment(
        "Class 12", "Accountancy", ["Balance Sheets"], total_marks=80, difficulty="hard"
    )

    assert premium_calls == []
    assert result["validation"]["valid"] is True


def test_the_premium_attempt_comes_back_when_billing_is_enabled(monkeypatch):
    from app.generation import assessments

    monkeypatch.setattr(settings, "premium_tier_enabled", True)
    premium_calls: list = []
    monkeypatch.setattr(
        assessments, "generate_premium_cloud",
        lambda *a, **k: premium_calls.append(1) or {
            "success": True, "content": json.dumps(VALID_ASSESSMENT), "model_name": settings.premium_model
        },
    )
    assessments.generate_assessment(
        "Class 12", "Accountancy", ["Balance Sheets"], total_marks=80, difficulty="hard"
    )
    assert premium_calls == [1]


# ---------------------------------------------------------------------------
# The language guard
# ---------------------------------------------------------------------------


def test_indic_scripts_are_detected():
    for text in [
        "कक्षा 10 विज्ञान के लिए 40 अंकों का प्रश्नपत्र बनाइए",   # Hindi
        "দশম শ্রেণীর জীববিজ্ঞান পরীক্ষা",                          # Bengali
        "வகுப்பு 10 அறிவியல் தேர்வு",                              # Tamil
        "10వ తరగతి సైన్స్ పరీక్ష",                                  # Telugu
        "ધોરણ ૧૦ વિજ્ઞાન કસોટી",                                   # Gujarati
        "ಹತ್ತನೇ ತರಗತಿ ವಿಜ್ಞಾನ ಪರೀಕ್ಷೆ",                              # Kannada
    ]:
        assert uses_non_latin_script(text) is True, text


def test_english_and_near_english_are_not_flagged():
    for text in [
        "Create a 40 mark Class 10 Science paper on Tissues",
        "",
        "80 marks, hard, Porter's Five Forces — Section A/B/C",
        # A stray glyph or two pasted out of a PDF must not reroute an
        # otherwise-English request; a whole word deliberately still does.
        "Create a Class 10 Science paper on Tissues and Plant Anatomy, chapter क, for my students",
    ]:
        assert uses_non_latin_script(text) is False, text


def test_even_one_non_english_word_is_enough_to_reroute():
    """Deliberate: a false positive costs a few seconds of latency on a call
    that still works, a false negative costs output quality nobody checks."""
    assert uses_non_latin_script("Create a Class 10 paper on विज्ञान for my students") is True


def test_a_non_english_prompt_is_compiled_on_the_authoring_model(monkeypatch):
    """Twelve languages are offered; there is published small-model evidence for
    one of them. Untested multilingual quality is not a saving."""
    from app.ai import prompt_compiler

    models: list = []

    def fake_generate_json(prompt, system_prompt="", model=None, temperature=0.4):
        models.append(model)
        return {"task_type": "assessment", "grade": "Class 10", "subject": "Science", "topics": ["Tissues"]}

    monkeypatch.setattr(prompt_compiler, "generate_json", fake_generate_json)

    prompt_compiler.compile_teacher_prompt("Create a Class 10 Science paper on Tissues")
    assert models == [settings.slm_model]

    models.clear()
    prompt_compiler.compile_teacher_prompt("कक्षा 10 विज्ञान का प्रश्नपत्र बनाइए")
    assert models == [settings.cheap_model]


def test_prompt_enhancement_runs_on_the_slm_for_english(monkeypatch):
    from app.generation import prompt_enhancement

    models = _capture_models(
        monkeypatch, "app.ai.cheap_model.generate_text",
        json.dumps({"enhanced_prompt": "a richer prompt", "illustration_suggestions": ["x"], "reasoning": "y"}),
    )
    out = prompt_enhancement.enhance_creative_prompt("a video on Porter's Five Forces", "video")

    assert models == [settings.slm_model]
    assert out["enhanced_prompt"] == "a richer prompt"


def test_prompt_enhancement_stays_on_the_authoring_model_for_non_english(monkeypatch):
    from app.generation import prompt_enhancement

    models = _capture_models(
        monkeypatch, "app.ai.cheap_model.generate_text",
        json.dumps({"enhanced_prompt": "बेहतर प्रॉम्प्ट"}),
    )
    prompt_enhancement.enhance_creative_prompt("पोर्टर के पाँच बलों पर एक वीडियो", "video")

    assert models == [settings.cheap_model]
