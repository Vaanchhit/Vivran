"""The plan-before-produce call (cheap_model.generate_planner). Mocked transports only."""
from app.ai import cheap_model, groq_client
from app.core.config import settings
from app.core.errors import FailureClass


def _groq(monkeypatch, outcome):
    """outcome: text to return, or a FailureClass to raise. Returns recorded calls."""
    calls: list = []
    monkeypatch.setattr(settings, "groq_api_key", "test-groq-key")

    def fake(prompt, **kw):
        calls.append(kw)
        if isinstance(outcome, FailureClass):
            raise groq_client.GroqError("groq said no", failure=outcome)
        return groq_client.GroqCompletion(text=outcome, model=kw.get("model"), usage=groq_client.TokenUsage())

    monkeypatch.setattr(groq_client, "generate_text", fake)
    return calls


def _gemini(monkeypatch, text='{"slides": []}'):
    calls: list = []

    def fake(prompt, **kw):
        calls.append(kw)
        return text

    monkeypatch.setattr(cheap_model, "generate_text", fake)
    return calls


def test_plans_on_groq_with_the_planner_model(monkeypatch):
    groq = _groq(monkeypatch, '{"slides": [1]}')
    gemini = _gemini(monkeypatch)
    r = cheap_model.generate_planner("p", system_prompt="s")
    assert r["success"] and r["provider"] == "groq" and r["content"] == '{"slides": [1]}'
    assert groq[0]["model"] == settings.planner_model and groq[0]["json_mode"] is True
    assert gemini == []


def test_a_groq_rate_limit_plans_on_gemini_instead(monkeypatch):
    _groq(monkeypatch, FailureClass.QUOTA_EXHAUSTED)
    gemini = _gemini(monkeypatch, '{"slides": [2]}')
    r = cheap_model.generate_planner("p", system_prompt="s")
    assert r["success"] and r["provider"] == "gemini" and r["content"] == '{"slides": [2]}'
    assert gemini[0]["json_mode"] is True


def test_without_a_groq_key_it_plans_on_gemini(monkeypatch):
    monkeypatch.setattr(settings, "groq_api_key", "")
    gemini = _gemini(monkeypatch)
    r = cheap_model.generate_planner("p", system_prompt="s")
    assert r["success"] and r["provider"] == "gemini" and len(gemini) == 1


def test_a_refusal_is_not_shopped_to_another_model(monkeypatch):
    _groq(monkeypatch, FailureClass.CONTENT_BLOCKED)
    gemini = _gemini(monkeypatch)
    r = cheap_model.generate_planner("p", system_prompt="s")
    assert not r["success"] and r["failure"] is FailureClass.CONTENT_BLOCKED
    assert gemini == []
