"""The dormant Groq failover (app/ai/groq_client.py, app/ai/cheap_model.py).

There is no GROQ_API_KEY on this machine, so none of this has ever run against
the real service. That is exactly why it is tested here against a mocked
transport, and why the first assertions below are about it doing NOTHING: the
guarantee the founder is relying on is that with no key set, this backend
behaves precisely as it did before the seam existed.
"""
import pytest

from app.ai import cheap_model, groq_client
from app.ai.gemini_client import GeminiError
from app.core.errors import FailureClass

GEMINI_503 = '{"error": {"code": 503, "status": "UNAVAILABLE", "message": "The model is overloaded."}}'


class _Resp:
    def __init__(self, status_code, body="", json_body=None):
        self.status_code = status_code
        self.text = body
        self._json = json_body if json_body is not None else {}

    def json(self):
        return self._json


def _groq_ok(text="the groq answer", prompt_tokens=11, completion_tokens=22):
    return _Resp(200, "", {
        "choices": [{"message": {"role": "assistant", "content": text}}],
        "usage": {"prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens},
    })


class _FakeGroqClient:
    """httpx.Client stand-in for the Groq endpoint, recording every request."""

    def __init__(self, response, calls):
        self._response = response
        self._calls = calls

    def __call__(self, *a, **k):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, **kwargs):
        self._calls.append({"url": url, **kwargs})
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


@pytest.fixture
def gemini_fails(monkeypatch):
    """Makes the Gemini call raise a chosen GeminiError at the tier wrapper."""

    def install(failure: FailureClass, message="gemini said no"):
        def boom(*a, **k):
            raise GeminiError(message, failure=failure)

        monkeypatch.setattr(cheap_model, "generate_text", boom)

    return install


@pytest.fixture
def groq_transport(monkeypatch):
    """Installs a key + a fake Groq transport; returns the recorded call list."""
    calls: list = []

    def install(response=None):
        monkeypatch.setattr("app.core.config.settings.groq_api_key", "test-groq-key")
        monkeypatch.setattr(
            groq_client.httpx, "Client", _FakeGroqClient(response or _groq_ok(), calls)
        )
        return calls

    return install


# ---------------------------------------------------------------------------
# Dormant by default — the guarantee that matters today
# ---------------------------------------------------------------------------


def test_without_a_key_the_provider_is_not_configured():
    assert groq_client.is_configured() is False


def test_without_a_key_an_upstream_busy_failure_behaves_exactly_as_before(gemini_fails, monkeypatch):
    calls: list = []
    monkeypatch.setattr(groq_client.httpx, "Client", _FakeGroqClient(_groq_ok(), calls))
    gemini_fails(FailureClass.UPSTREAM_BUSY)

    result = cheap_model.generate_cheap_cloud("make slides")

    assert calls == [], "no key means no outbound request, ever"
    assert result["success"] is False
    assert result["provider"] == "gemini"
    assert result["failure"] is FailureClass.UPSTREAM_BUSY


def test_calling_groq_directly_without_a_key_raises_rather_than_half_working():
    with pytest.raises(groq_client.GroqError) as e:
        groq_client.generate_text("hello")
    assert e.value.failure is FailureClass.NOT_CONFIGURED


# ---------------------------------------------------------------------------
# With a key: fires on UPSTREAM_BUSY only
# ---------------------------------------------------------------------------


def test_it_fails_over_when_gemini_reports_itself_busy(gemini_fails, groq_transport):
    calls = groq_transport()
    gemini_fails(FailureClass.UPSTREAM_BUSY)

    result = cheap_model.generate_cheap_cloud("make slides")

    assert len(calls) == 1
    assert calls[0]["url"] == "https://api.groq.com/openai/v1/chat/completions"
    assert calls[0]["headers"]["Authorization"] == "Bearer test-groq-key"
    assert result["success"] is True
    assert result["content"] == "the groq answer"


def test_the_response_records_which_provider_and_model_really_answered(gemini_fails, groq_transport):
    """So a bad artifact found months later can be traced to the model that
    produced it, rather than to the model we intended to use."""
    groq_transport()
    gemini_fails(FailureClass.UPSTREAM_BUSY)

    result = cheap_model.generate_cheap_cloud("make slides")

    assert result["provider"] == "groq"
    assert result["model_name"].startswith("openai/gpt-oss")
    assert result["model_tier"] == "cheap_cloud"
    assert result["usage"] == {"input_tokens": 11, "output_tokens": 22, "calls": 1}


def test_it_does_not_fail_over_on_quota_exhausted(gemini_fails, groq_transport):
    """A spent allowance is information the founder must SEE. Papering over it
    with a second provider means discovering the bill instead of the limit."""
    calls = groq_transport()
    gemini_fails(FailureClass.QUOTA_EXHAUSTED)

    result = cheap_model.generate_cheap_cloud("make slides")

    assert calls == []
    assert result["success"] is False
    assert result["failure"] is FailureClass.QUOTA_EXHAUSTED
    assert result["provider"] == "gemini"


def test_it_does_not_fail_over_on_content_blocked(gemini_fails, groq_transport):
    """A safety refusal is a property of the prompt, not the vendor — it
    reproduces anywhere, and shopping providers for a refused generation is not
    a behaviour to build in."""
    calls = groq_transport()
    gemini_fails(FailureClass.CONTENT_BLOCKED)

    result = cheap_model.generate_cheap_cloud("make slides")

    assert calls == []
    assert result["failure"] is FailureClass.CONTENT_BLOCKED


def test_it_does_not_fail_over_when_the_gemini_key_is_missing(gemini_fails, groq_transport):
    """A missing key is a deployment fault to fix, not to route around."""
    calls = groq_transport()
    gemini_fails(FailureClass.NOT_CONFIGURED)

    result = cheap_model.generate_cheap_cloud("make slides")

    assert calls == []
    assert result["failure"] is FailureClass.NOT_CONFIGURED


def test_a_generic_upstream_error_does_not_fail_over(gemini_fails, groq_transport):
    calls = groq_transport()
    gemini_fails(FailureClass.UPSTREAM_ERROR)

    assert cheap_model.generate_cheap_cloud("make slides")["success"] is False
    assert calls == []


# ---------------------------------------------------------------------------
# When the second provider also fails
# ---------------------------------------------------------------------------


def test_a_failing_failover_reports_the_original_gemini_problem(gemini_fails, groq_transport):
    """The teacher's problem is that Gemini is busy. Replacing that honest,
    already-classified failure with one about a provider they have never heard
    of makes the UI and the logs harder to read, not easier."""
    groq_transport(_Resp(500, "groq exploded"))
    gemini_fails(FailureClass.UPSTREAM_BUSY, message="gemini overloaded")

    result = cheap_model.generate_cheap_cloud("make slides")

    assert result["success"] is False
    assert result["provider"] == "gemini"
    assert result["failure"] is FailureClass.UPSTREAM_BUSY
    assert "gemini overloaded" in result["error"]
    assert "groq" not in result["error"].lower()


def test_a_transport_error_from_groq_is_swallowed(gemini_fails, groq_transport, monkeypatch):
    import httpx

    groq_transport(httpx.ConnectError("no route to host"))
    gemini_fails(FailureClass.UPSTREAM_BUSY)

    result = cheap_model.generate_cheap_cloud("make slides")
    assert result["success"] is False
    assert result["provider"] == "gemini"


def test_an_empty_groq_completion_is_treated_as_a_refusal(groq_transport):
    groq_transport(_Resp(200, "", {"choices": [{"message": {"content": ""}}]}))
    with pytest.raises(groq_client.GroqError) as e:
        groq_client.generate_text("hello")
    assert e.value.failure is FailureClass.CONTENT_BLOCKED


def test_json_mode_is_translated_to_the_openai_response_format(groq_transport):
    calls = groq_transport()
    groq_client.generate_text("hello", system_prompt="Return JSON only", json_mode=True)

    payload = calls[0]["json"]
    assert payload["response_format"] == {"type": "json_object"}
    assert payload["messages"][0] == {"role": "system", "content": "Return JSON only"}
    assert payload["messages"][1] == {"role": "user", "content": "hello"}


def test_the_slm_tier_gets_the_same_failover(gemini_fails, groq_transport):
    groq_transport()
    gemini_fails(FailureClass.UPSTREAM_BUSY)

    result = cheap_model.generate_slm("extract intent")
    assert result["success"] is True
    assert result["provider"] == "groq"
    assert result["model_tier"] == "slm"


# --- Second Gemini model before Groq ----------------------------------------

def _gemini_by_model(monkeypatch, outcomes):
    """outcomes: model -> FailureClass to raise, or text to return. Records calls."""
    calls: list = []

    def fake(prompt, *, model, **k):
        calls.append(model)
        out = outcomes[model]
        if isinstance(out, FailureClass):
            raise GeminiError(f"{model} failed", failure=out)
        return out

    monkeypatch.setattr(cheap_model, "generate_text", fake)
    return calls


def test_a_busy_model_falls_back_to_the_other_gemini_model_first(monkeypatch, groq_transport):
    groq_calls = groq_transport()
    calls = _gemini_by_model(monkeypatch, {
        "gemini-3.5-flash-lite": FailureClass.UPSTREAM_BUSY,
        "gemini-3.1-flash-lite": "from the fallback",
    })
    result = cheap_model.generate_slm("p")
    assert result["success"] and result["content"] == "from the fallback"
    assert result["provider"] == "gemini" and result["model_name"] == "gemini-3.1-flash-lite"
    assert calls == ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
    assert groq_calls == []


def test_the_fallback_is_never_the_model_that_just_failed(monkeypatch):
    calls = _gemini_by_model(monkeypatch, {
        "gemini-3.1-flash-lite": FailureClass.UPSTREAM_BUSY,
        "gemini-3.5-flash-lite": "ok",
    })
    result = cheap_model.generate_assessment_cloud("p")
    assert result["success"]
    assert calls == ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]


def test_groq_is_reached_only_when_both_gemini_models_are_busy(monkeypatch, groq_transport):
    groq_calls = groq_transport()
    _gemini_by_model(monkeypatch, {
        "gemini-3.5-flash-lite": FailureClass.UPSTREAM_BUSY,
        "gemini-3.1-flash-lite": FailureClass.UPSTREAM_BUSY,
    })
    result = cheap_model.generate_slm("p")
    assert result["provider"] == "groq"
    assert len(groq_calls) == 1


def test_a_quota_error_on_the_fallback_stops_before_groq(monkeypatch, groq_transport):
    groq_calls = groq_transport()
    _gemini_by_model(monkeypatch, {
        "gemini-3.5-flash-lite": FailureClass.UPSTREAM_BUSY,
        "gemini-3.1-flash-lite": FailureClass.QUOTA_EXHAUSTED,
    })
    result = cheap_model.generate_slm("p")
    assert not result["success"]
    assert result["failure"] == FailureClass.UPSTREAM_BUSY
    assert groq_calls == []


def test_non_busy_failures_do_not_try_the_fallback_model(monkeypatch):
    calls = _gemini_by_model(monkeypatch, {"gemini-3.5-flash-lite": FailureClass.QUOTA_EXHAUSTED})
    result = cheap_model.generate_slm("p")
    assert not result["success"] and calls == ["gemini-3.5-flash-lite"]
