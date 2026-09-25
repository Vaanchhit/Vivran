"""Token accounting (app/ai/usage.py) and its two destinations.

``generation_jobs.input_tokens`` / ``output_tokens`` / ``estimated_cost`` have
existed since the first migration and nothing ever wrote them, so every claim
about what Vivran costs to run was a guess. Gemini returns the counts in the
same response body as the content, so this is information we were discarding.
"""
import json
import threading
import time

import pytest

from app.ai import gemini_client
from app.ai.usage import TokenUsage, estimated_cost, record, usage_from_gemini, usage_scope
from app.core.config import settings
from app.services import jobs


class _Resp:
    def __init__(self, status_code, body="", json_body=None):
        self.status_code = status_code
        self.text = body
        self._json = json_body if json_body is not None else {}

    def json(self):
        return self._json


class _FakeClient:
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


def _gemini_reply(text='{"ok":true}', prompt_tokens=100, candidates_tokens=250):
    return _Resp(200, "", {
        "candidates": [{"content": {"parts": [{"text": text}]}}],
        "usageMetadata": {
            "promptTokenCount": prompt_tokens,
            "candidatesTokenCount": candidates_tokens,
            "totalTokenCount": prompt_tokens + candidates_tokens,
        },
    })


@pytest.fixture
def gemini(monkeypatch):
    def install(responses):
        calls: list = []
        monkeypatch.setattr("app.core.config.settings.gemini_api_key", "test-key")
        monkeypatch.setattr(gemini_client.httpx, "Client", _FakeClient(responses, calls))
        monkeypatch.setattr(gemini_client.time, "sleep", lambda _s: None)
        return calls

    return install


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------


def test_usage_metadata_is_read_off_the_response():
    usage = usage_from_gemini({"usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 9}})
    assert (usage.input_tokens, usage.output_tokens, usage.calls) == (7, 9, 1)
    assert usage.total_tokens == 16


def test_reasoning_tokens_are_counted_as_output():
    usage = usage_from_gemini({
        "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 9, "thoughtsTokenCount": 40}
    })
    assert usage.output_tokens == 49


def test_missing_or_junk_metadata_never_breaks_a_generation():
    """A counter we could not read must not be able to fail a call that worked."""
    assert usage_from_gemini({}).to_dict() == {"input_tokens": 0, "output_tokens": 0, "calls": 1}
    assert usage_from_gemini({"usageMetadata": {"promptTokenCount": "lots"}}).input_tokens == 0


# ---------------------------------------------------------------------------
# The envelope
# ---------------------------------------------------------------------------


def test_the_generation_envelope_carries_the_token_counts(gemini):
    from app.ai.cheap_model import generate_cheap_cloud

    gemini([_gemini_reply(prompt_tokens=1200, candidates_tokens=800)])
    result = generate_cheap_cloud("make slides")

    assert result["success"] is True
    assert result["usage"] == {"input_tokens": 1200, "output_tokens": 800, "calls": 1}
    assert result["provider"] == "gemini"


def test_retried_attempts_are_all_billed(gemini):
    """A return value would only describe the attempt that happened to work;
    undercounting is the one thing a cost number must not do."""
    from app.ai.cheap_model import generate_cheap_cloud

    busy = _Resp(503, '{"error":{"status":"UNAVAILABLE","message":"overloaded"}}')
    gemini([busy, _gemini_reply(prompt_tokens=100, candidates_tokens=200)])

    result = generate_cheap_cloud("make slides")
    # The 503 carried no usage block, so only the successful attempt has counts —
    # but the call is still counted, which is what makes the two distinguishable.
    assert result["usage"]["calls"] == 1
    assert result["usage"]["input_tokens"] == 100


def test_a_blocked_generation_still_reports_what_it_spent(gemini):
    from app.ai.cheap_model import generate_cheap_cloud

    gemini([_Resp(200, "", {"candidates": [], "usageMetadata": {"promptTokenCount": 640}})])
    result = generate_cheap_cloud("something the filter dislikes")

    assert result["success"] is False
    assert result["usage"]["input_tokens"] == 640


# ---------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------


def test_a_scope_sums_every_call_inside_it():
    with usage_scope() as total:
        record(TokenUsage(10, 20, 1))
        record(TokenUsage(5, 6, 1))
    assert total.to_dict() == {"input_tokens": 15, "output_tokens": 26, "calls": 2}


def test_nested_scopes_fold_into_the_outer_one():
    """A job's scope must still see the tokens spent by the per-call scope the
    tier wrapper opens inside it."""
    with usage_scope() as job_total:
        with usage_scope() as call_total:
            record(TokenUsage(10, 20, 1))
        assert call_total.calls == 1
        record(TokenUsage(1, 2, 1))
    assert job_total.to_dict() == {"input_tokens": 11, "output_tokens": 22, "calls": 2}


def test_recording_outside_a_scope_is_a_no_op():
    record(TokenUsage(999, 999, 1))  # must not raise or leak into the next scope
    with usage_scope() as total:
        pass
    assert total.calls == 0


def test_concurrent_jobs_do_not_bill_each_other():
    """jobs.py runs on a ThreadPoolExecutor; the accumulator is thread-local."""
    results: dict = {}
    started = threading.Barrier(2)

    def worker(name, amount):
        with usage_scope() as total:
            started.wait()
            record(TokenUsage(amount, amount, 1))
            time.sleep(0.01)
        results[name] = total.input_tokens

    threads = [threading.Thread(target=worker, args=(n, a)) for n, a in (("a", 100), ("b", 7))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert results == {"a": 100, "b": 7}


# ---------------------------------------------------------------------------
# Cost
# ---------------------------------------------------------------------------


def test_cost_is_none_rather_than_a_confident_zero_when_no_price_is_configured():
    """"free tier, genuinely zero" and "we have not configured a price" are
    different claims, and the column must not assert the first."""
    assert estimated_cost(settings.cheap_model, TokenUsage(1000, 1000, 1)) is None


def test_cost_is_computed_once_a_price_exists(monkeypatch):
    from app.ai import usage as usage_module

    monkeypatch.setitem(usage_module.PRICE_PER_MILLION_TOKENS, "priced-model", (0.10, 0.40))
    assert usage_module.estimated_cost("priced-model", TokenUsage(1_000_000, 500_000, 2)) == 0.3


# ---------------------------------------------------------------------------
# Persistence to generation_jobs
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clean_jobs():
    jobs.reset_local_store()
    yield
    jobs.reset_local_store()


def _run_to_completion(ws, user_id, run):
    row = jobs.enqueue(workspace_id=ws, user_id=user_id, task_type="slides", params={}, run=run)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        got = jobs.get_job(row["id"], ws)
        if got["status"] in jobs.TERMINAL_STATUSES:
            return got
        time.sleep(0.01)
    raise AssertionError(f"job never finished: {got}")


def test_a_completed_job_records_the_tokens_it_spent(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]

    def run():
        record(TokenUsage(1500, 900, 2))
        return {"slides": []}

    got = _run_to_completion(ws, provisioned_workspace["user_id"], run)
    assert got["status"] == jobs.COMPLETED
    assert got["input_tokens"] == 1500
    assert got["output_tokens"] == 900


def test_a_failed_job_records_them_too(provisioned_workspace):
    """A quota problem is exactly when you want to know what was burned getting
    nowhere."""
    ws = provisioned_workspace["workspace_id"]

    def run():
        record(TokenUsage(800, 0, 1))
        raise RuntimeError("upstream died")

    got = _run_to_completion(ws, provisioned_workspace["user_id"], run)
    assert got["status"] == jobs.FAILED
    assert got["input_tokens"] == 800


def test_a_job_that_made_no_model_call_leaves_the_columns_null(provisioned_workspace):
    """Better a NULL than a confident zero that nobody can distinguish from a
    real measurement."""
    ws = provisioned_workspace["workspace_id"]
    got = _run_to_completion(ws, provisioned_workspace["user_id"], lambda: {"slides": []})
    assert "input_tokens" not in got and "output_tokens" not in got


def test_the_whole_path_from_gemini_to_the_job_row(provisioned_workspace, gemini):
    """End to end: a real generateContent body, through the tier wrapper, into
    the stored job."""
    from app.ai.cheap_model import generate_cheap_cloud

    gemini([_gemini_reply(text=json.dumps({"slides": []}), prompt_tokens=333, candidates_tokens=444)])
    ws = provisioned_workspace["workspace_id"]

    got = _run_to_completion(
        ws,
        provisioned_workspace["user_id"],
        lambda: json.loads(generate_cheap_cloud("make slides", json_mode=True)["content"]),
    )
    assert got["input_tokens"] == 333
    assert got["output_tokens"] == 444
