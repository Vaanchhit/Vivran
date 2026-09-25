"""Upstream-failure masking: quota vs transient vs user error.

The distinction these tests protect is the whole point of app/core/errors.py.
Telling a teacher "your free tier is over" when Google had a capacity blip is
a lie that generates a support request nobody can action, and masking a genuine
input error makes the product undebuggable for the person using it. Both are
easy to reintroduce with a one-line change, so both are pinned here.
"""
import pytest

from app.core.errors import (
    USER_MESSAGES,
    FailureClass,
    classify_upstream_status,
    raise_for_service_result,
)

# The live failure from the founder's logs at the time this was written.
GEMINI_503_BODY = (
    '{"error":{"code":503,"message":"This model is currently experiencing high demand. '
    'Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}'
)
GEMINI_QUOTA_429_BODY = (
    '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan '
    'and billing details.","status":"RESOURCE_EXHAUSTED"}}'
)
GEMINI_RATELIMIT_429_BODY = (
    '{"error":{"code":429,"message":"Too many requests. Please slow down.","status":"RESOURCE_EXHAUSTED"}}'
)


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "status,body,expected",
    [
        # Google-side capacity. NOT the teacher's quota.
        (503, GEMINI_503_BODY, FailureClass.UPSTREAM_BUSY),
        (503, "", FailureClass.UPSTREAM_BUSY),
        # No response at all (connect/read timeout) — transient by nature.
        (None, "connection timed out", FailureClass.UPSTREAM_BUSY),
        # Genuine billing/quota exhaustion.
        (429, GEMINI_QUOTA_429_BODY, FailureClass.QUOTA_EXHAUSTED),
        (402, "payment required", FailureClass.QUOTA_EXHAUSTED),
        (403, "Billing has not been enabled for this project", FailureClass.QUOTA_EXHAUSTED),
        (401, '{"detail":{"status":"quota_exceeded"}}', FailureClass.QUOTA_EXHAUSTED),
        # A per-minute rate limit is the SAME status code as quota exhaustion
        # and the opposite situation.
        (429, GEMINI_RATELIMIT_429_BODY, FailureClass.UPSTREAM_BUSY),
        # A key that isn't set up for this feature.
        (401, "Invalid API key", FailureClass.NOT_CONFIGURED),
        (403, "This endpoint requires a Pro subscription tier", FailureClass.QUOTA_EXHAUSTED),
        # Deterministic failures — never dressed up as quota, never retried.
        (400, "Invalid JSON payload received", FailureClass.UPSTREAM_ERROR),
        (404, "model not found", FailureClass.UPSTREAM_ERROR),
        (500, "internal error", FailureClass.UPSTREAM_ERROR),
    ],
)
def test_classification(status, body, expected):
    assert classify_upstream_status(status, body) is expected


def test_transient_overload_is_never_reported_as_a_quota_problem():
    """The specific regression this module exists to prevent."""
    busy = USER_MESSAGES[classify_upstream_status(503, GEMINI_503_BODY)]
    assert "free tier" not in busy.lower()
    assert "admin" not in busy.lower()
    assert "try that again" in busy.lower()


def test_quota_exhaustion_says_exactly_what_the_founder_asked_for():
    quota = USER_MESSAGES[classify_upstream_status(429, GEMINI_QUOTA_429_BODY)]
    assert "free tier" in quota.lower()
    assert "admin" in quota.lower()


def test_no_user_message_leaks_a_provider_name_or_status_code():
    for message in USER_MESSAGES.values():
        lowered = message.lower()
        assert "gemini" not in lowered
        assert "elevenlabs" not in lowered
        assert "cartesia" not in lowered
        assert "503" not in lowered and "429" not in lowered


# ---------------------------------------------------------------------------
# The API-layer entry point
# ---------------------------------------------------------------------------


def test_service_success_passes_through():
    result = {"status": "ready", "media_url": "https://example/x.mp4"}
    assert raise_for_service_result(result, context="video") is result


def test_transient_failure_becomes_a_503_with_the_neutral_message():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        raise_for_service_result(
            {"status": "failed", "error": GEMINI_503_BODY, "failure": FailureClass.UPSTREAM_BUSY},
            context="video",
        )
    assert e.value.status_code == 503
    assert e.value.detail == USER_MESSAGES[FailureClass.UPSTREAM_BUSY]
    assert "high demand" not in e.value.detail  # the raw upstream text is gone


def test_quota_failure_becomes_a_402_with_the_free_tier_message():
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        raise_for_service_result(
            {"status": "failed", "error": "quota exceeded", "failure": FailureClass.QUOTA_EXHAUSTED},
            context="video",
        )
    assert e.value.status_code == 402
    assert e.value.detail == USER_MESSAGES[FailureClass.QUOTA_EXHAUSTED]


def test_user_facing_errors_are_never_masked():
    """A teacher-actionable message must survive verbatim — masking it into
    "something went wrong" makes the product undebuggable for them."""
    from fastapi import HTTPException

    specific = "This paper has no multiple-choice questions to export to Tally."
    with pytest.raises(HTTPException) as e:
        raise_for_service_result(
            {"status": "failed", "error": specific, "user_facing": True}, context="tally"
        )
    assert e.value.status_code == 400
    assert e.value.detail == specific


def test_unclassified_failure_defaults_to_generic_not_to_quota():
    """A service that forgets to classify must not accidentally tell every
    teacher their free tier is over."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as e:
        raise_for_service_result({"status": "failed", "error": "???"}, context="video")
    assert e.value.detail == USER_MESSAGES[FailureClass.UPSTREAM_ERROR]


# ---------------------------------------------------------------------------
# Retry policy in the Gemini client
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, status_code, body="", json_body=None):
        self.status_code = status_code
        self.text = body
        self._json = json_body or {}

    def json(self):
        return self._json


class _FakeClient:
    """Stands in for httpx.Client, replaying a scripted list of responses."""

    def __init__(self, responses, calls):
        self._responses = responses
        self._calls = calls

    def __call__(self, *a, **k):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, *a, **k):
        self._calls.append(1)
        return self._responses[min(len(self._calls) - 1, len(self._responses) - 1)]


def _patch_gemini(monkeypatch, responses):
    from app.ai import gemini_client

    calls: list = []
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "test-key")
    monkeypatch.setattr(gemini_client.httpx, "Client", _FakeClient(responses, calls))
    monkeypatch.setattr(gemini_client.time, "sleep", lambda _s: None)  # no real backoff in tests
    return calls


_OK = _FakeResponse(
    200, "", {"candidates": [{"content": {"parts": [{"text": '{"ok":true}'}]}}]}
)


def test_transient_503_is_retried_and_then_succeeds(monkeypatch):
    from app.ai.gemini_client import generate_text

    calls = _patch_gemini(monkeypatch, [_FakeResponse(503, GEMINI_503_BODY), _OK])
    assert generate_text("hi") == '{"ok":true}'
    assert len(calls) == 2  # one failure, one retry that worked


def test_retries_are_bounded(monkeypatch):
    from app.ai.gemini_client import GeminiError, _MAX_ATTEMPTS, generate_text

    calls = _patch_gemini(monkeypatch, [_FakeResponse(503, GEMINI_503_BODY)])
    with pytest.raises(GeminiError) as e:
        generate_text("hi")
    assert len(calls) == _MAX_ATTEMPTS
    assert e.value.failure is FailureClass.UPSTREAM_BUSY


def test_deterministic_failures_are_not_retried(monkeypatch):
    """Retrying a 400/403/quota burns quota to receive the identical error."""
    from app.ai.gemini_client import GeminiError, generate_text

    for status, body, expected in [
        (400, "Invalid JSON payload", FailureClass.UPSTREAM_ERROR),
        (403, "API key not valid", FailureClass.NOT_CONFIGURED),
        (429, GEMINI_QUOTA_429_BODY, FailureClass.QUOTA_EXHAUSTED),
    ]:
        calls = _patch_gemini(monkeypatch, [_FakeResponse(status, body)])
        with pytest.raises(GeminiError) as e:
            generate_text("hi")
        assert len(calls) == 1, f"{status} must not be retried"
        assert e.value.failure is expected


def test_safety_block_is_classified_as_blocked_not_busy(monkeypatch):
    from app.ai.gemini_client import GeminiError, generate_text

    calls = _patch_gemini(monkeypatch, [_FakeResponse(200, "", {"candidates": []})])
    with pytest.raises(GeminiError) as e:
        generate_text("hi")
    assert len(calls) == 1
    assert e.value.failure is FailureClass.CONTENT_BLOCKED


# ---------------------------------------------------------------------------
# End to end through the API
# ---------------------------------------------------------------------------


def test_video_endpoint_masks_upstream_overload(client, provisioned_workspace, monkeypatch):
    monkeypatch.setattr(
        "app.media.elevenlabs.ElevenLabsService.generate_video",
        lambda self, *a, **k: {
            "status": "failed",
            "error": "503: model overloaded",
            "failure": FailureClass.UPSTREAM_BUSY,
        },
    )
    resp = client.post(
        "/api/content/video", json={"prompt": "photosynthesis"}, headers=provisioned_workspace["headers"]
    )
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert detail == USER_MESSAGES[FailureClass.UPSTREAM_BUSY]
    assert "503" not in detail and "overloaded" not in detail


def test_video_endpoint_reports_quota_as_the_free_tier_message(client, provisioned_workspace, monkeypatch):
    monkeypatch.setattr(
        "app.media.elevenlabs.ElevenLabsService.generate_video",
        lambda self, *a, **k: {
            "status": "failed",
            "error": "401: {'detail': {'status': 'quota_exceeded'}}",
            "failure": FailureClass.QUOTA_EXHAUSTED,
        },
    )
    resp = client.post(
        "/api/content/video", json={"prompt": "photosynthesis"}, headers=provisioned_workspace["headers"]
    )
    assert resp.status_code == 402
    assert resp.json()["detail"] == USER_MESSAGES[FailureClass.QUOTA_EXHAUSTED]


def test_slides_endpoint_returns_a_masked_error_not_raw_upstream_text(client, provisioned_workspace, monkeypatch):
    """/content/slides answers 200 with an "error" field the UI renders
    directly, so that field must already be translated."""
    from app.ai.gemini_client import GeminiError

    def boom(*a, **k):
        raise GeminiError("Gemini returned status 503: high demand", failure=FailureClass.UPSTREAM_BUSY)

    monkeypatch.setattr("app.ai.cheap_model.generate_text", boom)
    resp = client.post(
        "/api/content/slides", json={"topic": "Tissues"}, headers=provisioned_workspace["headers"]
    )
    assert resp.status_code == 200
    assert resp.json()["error"] == USER_MESSAGES[FailureClass.UPSTREAM_BUSY]


def test_our_own_validation_errors_stay_specific(client, provisioned_workspace):
    """Input errors must keep their actionable message — this is the class the
    masking layer must NOT touch."""
    resp = client.post(
        "/api/content/slides/html", json={"deck": {"slides": []}}, headers=provisioned_workspace["headers"]
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "This deck has no slides to render."


# ---------------------------------------------------------------------------
# Regression: Gemini's free-tier PER-MINUTE limit is worded like a spent
# allowance. Captured verbatim from the founder's dev log, where it produced
# "Your free tier limit has been reached — contact the admin" for an error
# that cleared in 25 seconds.
# ---------------------------------------------------------------------------

_GEMINI_PER_MINUTE_429 = (
    '{"error":{"code":429,"message":"You exceeded your current quota, please check '
    "your plan and billing details. For more information on this error, head to: "
    "https://ai.google.dev/gemini-api/docs/rate-limits.\\n* Quota exceeded for metric: "
    "generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, "
    'model: gemini-3.6-flash\\nPlease retry in 25.411575375s.","status":"RESOURCE_EXHAUSTED"}}'
)


def test_gemini_per_minute_limit_is_transient_not_quota():
    """It carries every quota marker we look for, and still is not quota."""
    assert classify_upstream_status(429, _GEMINI_PER_MINUTE_429) is FailureClass.UPSTREAM_BUSY
    message = USER_MESSAGES[classify_upstream_status(429, _GEMINI_PER_MINUTE_429)]
    assert "free tier" not in message.lower()
    assert "admin" not in message.lower()


def test_structured_retry_info_is_transient():
    body = (
        '{"error":{"code":429,"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo",'
        '"retryDelay":"31s"}],"message":"Resource has been exhausted (e.g. check quota)."}}'
    )
    assert classify_upstream_status(429, body) is FailureClass.UPSTREAM_BUSY


def test_a_retry_hint_measured_in_hours_is_a_real_cap():
    body = '{"error":{"code":429,"message":"Quota exceeded for requests per day. Please retry in 7200s."}}'
    assert classify_upstream_status(429, body) is FailureClass.QUOTA_EXHAUSTED


def test_quota_without_any_retry_hint_still_reads_as_quota():
    body = '{"error":{"code":429,"message":"You exceeded your current quota. Upgrade your plan."}}'
    assert classify_upstream_status(429, body) is FailureClass.QUOTA_EXHAUSTED
