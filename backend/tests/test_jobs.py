"""Background generation jobs — lifecycle, tenancy, reaping, error masking.

Supabase is not reachable in tests (see conftest.py), so these exercise the
in-memory store in app/services/jobs.py. That store applies the *same*
workspace filter as the PostgREST path deliberately, and the one test that
cannot be expressed offline — that the real PostgREST query carries the
workspace filter at all — asserts on the captured query params instead, the
same way test_protected_api.py pins the assessments IDOR fix.
"""
from __future__ import annotations

import threading
import time
import uuid
from datetime import timedelta

import pytest

from app.core.config import settings
from app.core.errors import USER_MESSAGES, FailureClass
from app.services import jobs


@pytest.fixture(autouse=True)
def _clean_jobs():
    jobs.reset_local_store()
    yield
    jobs.reset_local_store()


def _wait_for(client, headers, job_id, *, timeout=10.0):
    """Poll the real endpoint until the job leaves the active states."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        resp = client.get(f"/api/jobs/{job_id}", headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        if body["status"] in jobs.TERMINAL_STATUSES:
            return body
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} never finished: {body}")


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


def test_job_lifecycle_queued_to_completed(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]
    row = jobs.enqueue(
        workspace_id=ws,
        user_id=provisioned_workspace["user_id"],
        task_type="slides",
        params={"topic": "Tissues"},
        run=lambda: {"slides": [{"title": "Tissues"}]},
    )
    assert row["status"] == jobs.QUEUED
    assert row["progress"] == 0

    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        got = jobs.get_job(row["id"], ws)
        if got["status"] in jobs.TERMINAL_STATUSES:
            break
        time.sleep(0.01)

    assert got["status"] == jobs.COMPLETED
    assert got["progress"] == 100
    assert got["started_at"] and got["completed_at"]
    public = jobs.public_job(got, include_result=True)
    assert public["result"] == {"slides": [{"title": "Tissues"}]}
    # The request that produced it survives alongside the result, so a job list
    # can say *what* is running without the client having stored anything.
    assert public["params"] == {"topic": "Tissues"}


def test_job_failure_is_recorded_not_raised(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]

    def boom():
        raise RuntimeError("kaboom")

    row = jobs.enqueue(
        workspace_id=ws, user_id=provisioned_workspace["user_id"],
        task_type="slides", params={}, run=boom,
    )
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        got = jobs.get_job(row["id"], ws)
        if got["status"] in jobs.TERMINAL_STATUSES:
            break
        time.sleep(0.01)
    assert got["status"] == jobs.FAILED
    assert got["error"]


def test_queue_cap_refuses_rather_than_hoarding(provisioned_workspace, monkeypatch):
    """Accepting work this process will probably lose on the next restart is
    worse than saying no."""
    monkeypatch.setattr(jobs, "_inflight", {"a", "b", "c"})
    monkeypatch.setattr(settings, "job_queue_cap", 2)
    with pytest.raises(jobs.JobQueueFull):
        jobs.enqueue(
            workspace_id=provisioned_workspace["workspace_id"],
            user_id=provisioned_workspace["user_id"],
            task_type="slides", params={}, run=lambda: {},
        )


# ---------------------------------------------------------------------------
# Workspace scoping. This runs on the service-role key, which bypasses RLS.
# ---------------------------------------------------------------------------


def test_foreign_workspace_cannot_read_a_job(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]
    row = jobs.create_job(
        workspace_id=ws, user_id=provisioned_workspace["user_id"],
        task_type="slides", params={},
    )
    assert jobs.get_job(row["id"], ws) is not None
    assert jobs.get_job(row["id"], str(uuid.uuid4())) is None


def test_foreign_workspace_cannot_write_a_job(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]
    row = jobs.create_job(
        workspace_id=ws, user_id=provisioned_workspace["user_id"],
        task_type="slides", params={},
    )
    jobs.fail_job(row["id"], str(uuid.uuid4()), "should not land")
    assert jobs.get_job(row["id"], ws)["status"] == jobs.QUEUED


def test_list_never_returns_another_workspaces_jobs(provisioned_workspace):
    mine = provisioned_workspace["workspace_id"]
    theirs = str(uuid.uuid4())
    jobs.create_job(workspace_id=mine, user_id="u1", task_type="slides", params={})
    jobs.create_job(workspace_id=theirs, user_id="u2", task_type="slides", params={})

    assert len(jobs.list_jobs(mine)) == 1
    assert all(r["workspace_id"] == mine for r in jobs._fetch_workspace(mine, 50))


def test_postgrest_reads_are_filtered_by_workspace(monkeypatch):
    """The offline store can enforce whatever it likes; production is PostgREST
    on a service-role key with RLS bypassed. Assert the query itself carries
    the tenancy filter — nothing else does."""
    captured: dict = {}

    def fake_select(table, params):
        captured["table"] = table
        captured["params"] = params
        return []

    monkeypatch.setattr(jobs, "is_configured", lambda: True)
    monkeypatch.setattr(jobs, "table_select", fake_select)

    ws = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    assert jobs.get_job(job_id, ws) is None
    assert captured["table"] == "generation_jobs"
    assert captured["params"]["id"] == f"eq.{job_id}"
    assert captured["params"]["workspace_id"] == f"eq.{ws}"

    captured.clear()
    jobs.list_jobs(ws)
    assert captured["params"]["workspace_id"] == f"eq.{ws}"
    assert "id" not in captured["params"]


def test_postgrest_writes_are_filtered_by_workspace(monkeypatch):
    captured: dict = {}

    def fake_update(table, params, patch):
        captured["params"] = params
        captured["patch"] = patch
        return []

    monkeypatch.setattr(jobs, "is_configured", lambda: True)
    monkeypatch.setattr(jobs, "table_update", fake_update)

    ws = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    jobs.fail_job(job_id, ws, "nope")
    assert captured["params"] == {"id": f"eq.{job_id}", "workspace_id": f"eq.{ws}"}


# ---------------------------------------------------------------------------
# Orphaned jobs
# ---------------------------------------------------------------------------


def _age_job(job_id: str, seconds: int) -> None:
    stale = jobs._now() - timedelta(seconds=seconds)
    with jobs._memory_lock:
        jobs._memory_jobs[job_id]["created_at"] = jobs._iso(stale)
        jobs._memory_jobs[job_id]["started_at"] = jobs._iso(stale)


def test_stale_running_job_is_reaped_on_read(provisioned_workspace):
    """The process dies mid-job on every deploy and every free-tier spin-down.
    A row left 'processing' forever is a spinner that never resolves."""
    ws = provisioned_workspace["workspace_id"]
    row = jobs.create_job(workspace_id=ws, user_id="u1", task_type="slides", params={})
    jobs.mark_processing(row["id"], ws)
    _age_job(row["id"], settings.job_stale_after_seconds + 60)

    got = jobs.get_job(row["id"], ws)
    assert got["status"] == jobs.FAILED
    assert got["error"] == jobs.STALE_MESSAGE
    # Persisted, not just patched in the response — a second read agrees.
    with jobs._memory_lock:
        assert jobs._memory_jobs[row["id"]]["status"] == jobs.FAILED


def test_stale_queued_job_that_never_started_is_reaped(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]
    row = jobs.create_job(workspace_id=ws, user_id="u1", task_type="slides", params={})
    _age_job(row["id"], settings.job_stale_after_seconds + 60)
    assert jobs.list_jobs(ws)[0]["status"] == jobs.FAILED


def test_a_live_job_in_this_process_is_never_reaped(provisioned_workspace):
    """The reaper is an age heuristic, so it must yield to hard evidence: if a
    worker thread in THIS process owns the job, it is alive no matter how old
    the timestamp looks."""
    ws = provisioned_workspace["workspace_id"]
    row = jobs.create_job(workspace_id=ws, user_id="u1", task_type="slides", params={})
    jobs.mark_processing(row["id"], ws)
    _age_job(row["id"], settings.job_stale_after_seconds * 10)

    with jobs._inflight_lock:
        jobs._inflight.add(row["id"])
    try:
        assert jobs.get_job(row["id"], ws)["status"] == jobs.PROCESSING
    finally:
        with jobs._inflight_lock:
            jobs._inflight.discard(row["id"])


def test_fresh_job_is_not_reaped(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]
    row = jobs.create_job(workspace_id=ws, user_id="u1", task_type="slides", params={})
    jobs.mark_processing(row["id"], ws)
    assert jobs.get_job(row["id"], ws)["status"] == jobs.PROCESSING


def test_unreadable_timestamp_is_not_treated_as_stale(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]
    row = jobs.create_job(workspace_id=ws, user_id="u1", task_type="slides", params={})
    with jobs._memory_lock:
        jobs._memory_jobs[row["id"]]["created_at"] = "not-a-timestamp"
    assert jobs.get_job(row["id"], ws)["status"] == jobs.QUEUED


# ---------------------------------------------------------------------------
# Error masking. A stored job error is rendered straight into the UI.
# ---------------------------------------------------------------------------


def test_upstream_failure_stores_the_masked_message(provisioned_workspace):
    """The raw Gemini body names models, quotas and request ids. It belongs in
    the logs, never in the job row the teacher's browser reads."""
    from app.ai.gemini_client import GeminiError

    ws = provisioned_workspace["workspace_id"]
    raw = "Quota exceeded for quota metric 'generate_requests' of service generativelanguage.googleapis.com"

    def boom():
        raise GeminiError(f"Gemini returned status 429: {raw}", failure=FailureClass.QUOTA_EXHAUSTED, status_code=429, body=raw)

    row = jobs.enqueue(workspace_id=ws, user_id="u1", task_type="slides", params={}, run=boom)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        got = jobs.get_job(row["id"], ws)
        if got["status"] == jobs.FAILED:
            break
        time.sleep(0.01)

    assert got["error"] == USER_MESSAGES[FailureClass.QUOTA_EXHAUSTED]
    assert "generativelanguage" not in got["error"]
    assert "quota metric" not in got["error"]


def test_unexpected_exception_does_not_leak_its_text(provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]

    def boom():
        raise ValueError("postgresql://postgres:hunter2@db.example.supabase.co:5432")

    row = jobs.enqueue(workspace_id=ws, user_id="u1", task_type="slides", params={}, run=boom)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        got = jobs.get_job(row["id"], ws)
        if got["status"] == jobs.FAILED:
            break
        time.sleep(0.01)

    assert got["error"] == USER_MESSAGES[FailureClass.UPSTREAM_ERROR]
    assert "hunter2" not in got["error"]


def test_media_envelope_failure_is_masked_the_same_way(provisioned_workspace):
    """A media service reports failure by returning an envelope, not raising.
    The async path must word it identically to the synchronous one."""
    ws = provisioned_workspace["workspace_id"]
    envelope = {
        "status": "failed",
        "failure": FailureClass.UPSTREAM_BUSY,
        "error": "503 UNAVAILABLE: The model is overloaded. Please try again later.",
    }
    row = jobs.enqueue(
        workspace_id=ws, user_id="u1", task_type="video", params={},
        run=lambda: envelope, service_context="video generation",
    )
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        got = jobs.get_job(row["id"], ws)
        if got["status"] in jobs.TERMINAL_STATUSES:
            break
        time.sleep(0.01)

    assert got["status"] == jobs.FAILED
    assert got["error"] == USER_MESSAGES[FailureClass.UPSTREAM_BUSY]
    assert "UNAVAILABLE" not in got["error"]


def test_our_own_validation_error_is_kept_verbatim(provisioned_workspace):
    """The counterpart rule from app/core/errors.py: OUR messages are already
    specific and actionable, so masking them into "something went wrong" would
    take away the one sentence the teacher could act on."""
    ws = provisioned_workspace["workspace_id"]

    def boom():
        raise jobs.JobUserError("No extractable text was found in this material")

    row = jobs.enqueue(workspace_id=ws, user_id="u1", task_type="material_ingestion", params={}, run=boom)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        got = jobs.get_job(row["id"], ws)
        if got["status"] == jobs.FAILED:
            break
        time.sleep(0.01)
    assert got["error"] == "No extractable text was found in this material"


# ---------------------------------------------------------------------------
# HTTP surface
# ---------------------------------------------------------------------------


def test_get_job_requires_workspace_header(client, auth_headers):
    assert client.get(f"/api/jobs/{uuid.uuid4()}", headers=auth_headers).status_code == 400


def test_get_foreign_job_is_404_not_403(client, provisioned_workspace):
    """404, deliberately. A 403 would confirm the id exists, turning this route
    into an existence oracle over another teacher's workspace."""
    mine = provisioned_workspace["workspace_id"]
    theirs = str(uuid.uuid4())
    row = jobs.create_job(workspace_id=theirs, user_id="someone-else", task_type="slides", params={})

    resp = client.get(f"/api/jobs/{row['id']}", headers=provisioned_workspace["headers"])
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Job not found"

    # Identical answer for an id that does not exist at all — the two cases
    # must be indistinguishable.
    missing = client.get(f"/api/jobs/{uuid.uuid4()}", headers=provisioned_workspace["headers"])
    assert missing.status_code == 404
    assert missing.json() == resp.json()

    # ...and the row itself was untouched.
    assert jobs.get_job(row["id"], theirs)["status"] == jobs.QUEUED


def test_list_jobs_active_and_recent(client, provisioned_workspace):
    ws = provisioned_workspace["workspace_id"]
    headers = provisioned_workspace["headers"]

    running = jobs.create_job(workspace_id=ws, user_id="u1", task_type="slides", params={})
    jobs.mark_processing(running["id"], ws)
    with jobs._inflight_lock:
        jobs._inflight.add(running["id"])

    done = jobs.create_job(workspace_id=ws, user_id="u1", task_type="worksheet", params={})
    jobs.complete_job(done["id"], ws, {"ok": True}, {})

    try:
        active = client.get("/api/jobs?active=true", headers=headers).json()
        assert [j["id"] for j in active] == [running["id"]]

        both = client.get("/api/jobs", headers=headers).json()
        assert {j["id"] for j in both} == {running["id"], done["id"]}

        # The list is an index, not a payload — the deck comes from the detail
        # route, so polling this every few seconds stays cheap.
        assert "result" not in both[0]
        detail = client.get(f"/api/jobs/{done['id']}", headers=headers).json()
        assert detail["result"] == {"ok": True}
    finally:
        with jobs._inflight_lock:
            jobs._inflight.discard(running["id"])


def test_list_jobs_rejects_foreign_workspace_header(client, provisioned_workspace):
    foreign = {**provisioned_workspace["headers"], "Workspace-Id": str(uuid.uuid4())}
    assert client.get("/api/jobs", headers=foreign).status_code == 403


def test_jobs_are_behind_the_beta_gate(client, unverified_auth_headers):
    resp = client.get("/api/jobs", headers=unverified_auth_headers)
    assert resp.status_code == 403
    assert "referral code" in resp.json()["detail"]


def test_completed_job_outlives_the_request_that_started_it(client, provisioned_workspace, monkeypatch):
    """The whole point: the caller can walk away and still get the result back
    from a fresh request that knows nothing but the workspace."""
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "")
    headers = provisioned_workspace["headers"]

    resp = client.post("/api/content/slides?async_job=true", json={"topic": "Tissues"}, headers=headers)
    assert resp.status_code == 202, resp.text
    job_id = resp.json()["id"]
    assert resp.json()["status"] == jobs.QUEUED
    assert resp.json()["params"]["topic"] == "Tissues"

    finished = _wait_for(client, headers, job_id)
    assert finished["status"] == jobs.COMPLETED
    assert finished["result"] is not None

    # Recovered with no client-side state whatsoever.
    listed = client.get("/api/jobs", headers=headers).json()
    assert job_id in {j["id"] for j in listed}


def test_synchronous_contract_is_unchanged(client, provisioned_workspace, monkeypatch):
    """Backwards compatibility: without ?async_job the routes must behave
    exactly as they did before jobs existed — the frontend is mid-rewrite and
    nothing it does today may change."""
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "")
    headers = provisioned_workspace["headers"]

    resp = client.post("/api/content/slides", json={"topic": "Tissues"}, headers=headers)
    assert resp.status_code == 200
    assert "slides" in resp.json()

    assessment = client.post(
        "/api/assessments/generate",
        json={"grade": "10", "subject": "Biology", "topics": ["Tissues"], "total_marks": 40},
        headers=headers,
    )
    assert assessment.status_code == 200
    assert assessment.json()["assessment"] is None
    assert assessment.json()["validation"]["valid"] is False


# ---------------------------------------------------------------------------
# The event loop must stay free.
# ---------------------------------------------------------------------------


def test_material_ingestion_never_runs_on_the_event_loop(client, provisioned_workspace, monkeypatch):
    """POST /api/materials is `async def` (it awaits UploadFile.read), so its
    body runs ON the event loop. ingest_material is fully synchronous and
    embeds one chunk at a time; inline, a 50-page PDF froze the entire
    single-worker instance. Assert it is handed to a worker thread."""
    import app.api.materials as materials_api

    seen: dict = {}

    def fake_ingest(**kwargs):
        seen["thread"] = threading.current_thread().name
        return {"id": "m1", "processing_status": "READY"}

    monkeypatch.setattr(materials_api, "ingest_material", fake_ingest)

    resp = client.post(
        "/api/materials",
        data={"title": "Ch 1", "type": "pdf"},
        files={"file": ("ch1.pdf", b"%PDF-1.4 fake", "application/pdf")},
        headers=provisioned_workspace["headers"],
    )
    assert resp.status_code == 200, resp.text
    # AnyIO's threadpool workers are named "AnyIO worker thread"; the event
    # loop runs on MainThread (or TestClient's portal thread). Either way the
    # ingestion must not be on the thread the loop is running.
    assert seen["thread"] != threading.main_thread().name
    assert "AnyIO worker" in seen["thread"] or seen["thread"].startswith("vivran-job")


def test_a_long_job_does_not_block_other_requests(client, provisioned_workspace, monkeypatch):
    """End-to-end proof rather than a claim: while a background job sits in a
    blocking sleep, an ordinary request must still be served."""
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "")
    headers = provisioned_workspace["headers"]
    release = threading.Event()

    import app.api.content as content_api

    def slow_slides(*args, **kwargs):
        release.wait(timeout=10)
        return {"slides": [{"title": "eventually"}]}

    monkeypatch.setattr(content_api, "generate_slides", slow_slides)

    started = client.post("/api/content/slides?async_job=true", json={"topic": "X"}, headers=headers)
    assert started.status_code == 202
    job_id = started.json()["id"]

    try:
        # The job is blocked. The API must not be.
        for _ in range(5):
            assert client.get("/").status_code == 200
            assert client.get("/api/jobs?active=true", headers=headers).status_code == 200
        active = client.get("/api/jobs?active=true", headers=headers).json()
        assert job_id in {j["id"] for j in active}
    finally:
        release.set()

    assert _wait_for(client, headers, job_id)["status"] == jobs.COMPLETED
