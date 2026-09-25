"""Batched embedding (app/ai/gemini_client.embed_texts_batch) and the query cache.

The behaviour that matters and had no coverage before: a 900-chunk PDF becomes
~9 HTTP calls instead of ~900, and one bad batch no longer throws away every
embedding that already succeeded.
"""
import pytest

from app.ai import gemini_client
from app.ai.gemini_client import BATCH_EMBED_MAX, GeminiError, embed_texts_batch
from app.core.errors import FailureClass

BUSY_BODY = '{"error": {"code": 503, "status": "UNAVAILABLE", "message": "The model is overloaded."}}'


class _Resp:
    def __init__(self, status_code, body="", json_body=None):
        self.status_code = status_code
        self.text = body
        self._json = json_body if json_body is not None else {}

    def json(self):
        return self._json


def _ok(count, dim=4):
    return _Resp(200, "", {"embeddings": [{"values": [0.1] * dim} for _ in range(count)]})


class _FakeClient:
    """httpx.Client stand-in that records every batch it was asked to send.

    ``handler(batch_index, requests)`` returns the response for that call.
    """

    def __init__(self, handler, sent):
        self._handler = handler
        self._sent = sent

    def __call__(self, *a, **k):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, *a, **k):
        requests = (k.get("json") or {}).get("requests") or []
        self._sent.append(requests)
        return self._handler(len(self._sent) - 1, requests)


@pytest.fixture
def transport(monkeypatch):
    """Installs a scripted fake transport; yields the list of batches sent."""
    sent: list = []

    def install(handler):
        monkeypatch.setattr("app.core.config.settings.gemini_api_key", "test-key")
        monkeypatch.setattr(gemini_client.httpx, "Client", _FakeClient(handler, sent))
        monkeypatch.setattr(gemini_client.time, "sleep", lambda _s: None)
        return sent

    return install


def test_nine_hundred_chunks_become_nine_calls(transport):
    sent = transport(lambda _i, reqs: _ok(len(reqs)))

    result = embed_texts_batch([f"chunk {i}" for i in range(900)])

    assert len(sent) == 9, "900 chunks must be 9 calls of 100, not 900 calls of 1"
    assert [len(b) for b in sent] == [100] * 9
    assert result.succeeded == 900
    assert result.failed == 0
    assert result.failures == []


def test_batches_never_exceed_the_documented_cap_of_100(transport):
    """Google errors rather than truncating past 100, so this is a hard limit."""
    sent = transport(lambda _i, reqs: _ok(len(reqs)))

    embed_texts_batch([f"c{i}" for i in range(250)], batch_size=1000)

    assert [len(b) for b in sent] == [BATCH_EMBED_MAX, BATCH_EMBED_MAX, 50]


def test_a_failing_batch_does_not_discard_the_ones_that_worked(transport):
    """The old loop raised at chunk 847 and threw away 846 paid-for embeddings."""

    def handler(index, reqs):
        # Second window of 100 is permanently unavailable; the rest are fine.
        return _Resp(503, BUSY_BODY) if index in (1, 2, 3) else _ok(len(reqs))

    transport(handler)
    result = embed_texts_batch([f"c{i}" for i in range(250)])

    assert result.succeeded == 150
    assert result.failed == 100
    assert result.all_failed is False
    # Exactly the failed window is missing, index-aligned with the input.
    assert all(v is not None for v in result.embeddings[:100])
    assert all(v is None for v in result.embeddings[100:200])
    assert all(v is not None for v in result.embeddings[200:])

    assert len(result.failures) == 1
    failure = result.failures[0]
    assert (failure.start, failure.count) == (100, 100)
    assert failure.error.failure is FailureClass.UPSTREAM_BUSY


def test_every_batch_failing_is_reported_as_such(transport):
    transport(lambda _i, _reqs: _Resp(503, BUSY_BODY))
    result = embed_texts_batch([f"c{i}" for i in range(150)])

    assert result.all_failed is True
    assert result.succeeded == 0
    assert len(result.failures) == 2


def test_a_short_batch_response_is_a_batch_failure_not_a_silent_gap(transport):
    """Fewer vectors than inputs would otherwise mis-align chunks and vectors —
    the worst possible outcome, since it corrupts retrieval silently."""
    transport(lambda _i, reqs: _ok(len(reqs) - 1))
    result = embed_texts_batch(["a", "b", "c"])

    assert result.all_failed is True
    assert result.failures[0].error.failure is FailureClass.UPSTREAM_ERROR


def test_no_texts_makes_no_calls(transport):
    sent = transport(lambda _i, reqs: _ok(len(reqs)))
    result = embed_texts_batch([])
    assert result.embeddings == [] and result.failures == [] and sent == []


def test_missing_api_key_still_raises_rather_than_returning_empty_vectors(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "")
    with pytest.raises(GeminiError) as e:
        embed_texts_batch(["a"])
    assert e.value.failure is FailureClass.NOT_CONFIGURED


# ---------------------------------------------------------------------------
# Ingestion keeps the partial result
# ---------------------------------------------------------------------------


def test_ingestion_keeps_the_chunks_that_embedded(monkeypatch):
    """A transient failure part-way through a 300-page PDF must not cost the
    teacher the whole upload."""
    from app.ai.gemini_client import BatchEmbedFailure, BatchEmbedResult
    from app.services import ingestion_pipeline

    vectors = [[0.1] * 4, None, [0.3] * 4]
    monkeypatch.setattr(
        ingestion_pipeline,
        "generate_embeddings_batch",
        lambda texts, **k: BatchEmbedResult(
            embeddings=list(vectors),
            failures=[BatchEmbedFailure(start=1, count=1, error=GeminiError("boom"))],
        ),
    )
    monkeypatch.setattr(ingestion_pipeline, "_extract_units", lambda *a, **k: [{"text": "body"}])
    monkeypatch.setattr(ingestion_pipeline, "chunk_units", lambda units: [
        {"content": "one"}, {"content": "two"}, {"content": "three"}
    ])
    monkeypatch.setattr(ingestion_pipeline, "_generate_summary", lambda units: None)
    monkeypatch.setattr(ingestion_pipeline, "is_configured", lambda: True)
    monkeypatch.setattr(ingestion_pipeline, "ensure_bucket", lambda *a, **k: None)
    monkeypatch.setattr(ingestion_pipeline, "table_insert", lambda table, row: dict(row))

    stored: list = []
    monkeypatch.setattr(
        ingestion_pipeline, "table_insert_many", lambda table, rows: stored.extend(rows) or rows
    )
    monkeypatch.setattr(
        ingestion_pipeline, "table_update", lambda table, params, patch: [{**patch, "id": "m1"}]
    )

    result = ingestion_pipeline.ingest_material(
        workspace_id="w1",
        title="Textbook",
        material_type="docx",
        created_by="u1",
        file_bytes=None,
        external_url=None,
    )

    assert result["processing_status"] == "READY"
    assert result["chunk_count"] == 2
    assert result["skipped_chunks"] == 1
    assert [r["content"] for r in stored] == ["one", "three"]
    assert all(r["embedding"] is not None for r in stored)


def test_ingestion_still_fails_when_nothing_embedded(monkeypatch):
    from app.ai.gemini_client import BatchEmbedFailure, BatchEmbedResult
    from app.services import ingestion_pipeline

    monkeypatch.setattr(
        ingestion_pipeline,
        "generate_embeddings_batch",
        lambda texts, **k: BatchEmbedResult(
            embeddings=[None],
            failures=[BatchEmbedFailure(
                start=0, count=1, error=GeminiError("upstream is down", failure=FailureClass.UPSTREAM_BUSY)
            )],
        ),
    )
    monkeypatch.setattr(ingestion_pipeline, "_extract_units", lambda *a, **k: [{"text": "body"}])
    monkeypatch.setattr(ingestion_pipeline, "chunk_units", lambda units: [{"content": "one"}])
    monkeypatch.setattr(ingestion_pipeline, "is_configured", lambda: True)

    result = ingestion_pipeline.ingest_material(
        workspace_id="w1",
        title="Textbook",
        material_type="docx",
        created_by="u1",
        external_url=None,
    )
    assert result["processing_status"] == "FAILED"


# ---------------------------------------------------------------------------
# Query embedding cache
# ---------------------------------------------------------------------------


def test_repeated_queries_are_embedded_once(monkeypatch):
    """One classroom pack asks for the same "{subject} {topics}" key per
    artifact; each repeat used to be a round-trip on a watched request."""
    from app.retrieval import embeddings

    calls: list = []
    monkeypatch.setattr(embeddings, "_embed_text", lambda text, task_type: calls.append(text) or [0.5] * 4)
    embeddings.clear_query_cache()

    first = embeddings.generate_query_embedding("Biology Tissues")
    for _ in range(5):
        assert embeddings.generate_query_embedding("Biology Tissues") == first
    embeddings.generate_query_embedding("Physics Motion")

    assert calls == ["Biology Tissues", "Physics Motion"]
    embeddings.clear_query_cache()


def test_a_cached_vector_cannot_be_mutated_by_a_caller(monkeypatch):
    from app.retrieval import embeddings

    monkeypatch.setattr(embeddings, "_embed_text", lambda text, task_type: [0.5] * 4)
    embeddings.clear_query_cache()

    got = embeddings.generate_query_embedding("Biology Tissues")
    got[0] = 99.0
    assert embeddings.generate_query_embedding("Biology Tissues")[0] == 0.5
    embeddings.clear_query_cache()
