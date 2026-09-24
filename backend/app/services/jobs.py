"""Durable background generation jobs, persisted to ``generation_jobs``.

WHY THIS EXISTS
---------------
Generation used to run entirely inside the HTTP request. If the teacher closed
the tab, switched apps long enough for the browser to drop the fetch, or the
request simply timed out, 10-40 seconds of paid Gemini work vanished with no
record it had ever run. This module makes the *job* the durable thing: the row
in ``generation_jobs`` is written before any work starts, so "what is running
for me right now" and "what finished while I was away" are answerable from the
database alone. The client stores nothing.

WHY A THREAD POOL AND NOT CELERY/RQ/REDIS
-----------------------------------------
Those are the textbook answer and they are wrong here. They need a second
Render service plus a Redis instance, which is real money and a second thing
to deploy, monitor and restart, for single-digit users on a single cheap
instance. What the founder actually needs is "the work outlives the request"
and "one slow upload doesn't freeze the box", and a bounded in-process pool
delivers both with zero new infrastructure. The honest cost of that choice is
written down under "ORPHANED JOBS" below.

WHY A DEDICATED EXECUTOR AND NOT FastAPI's ``BackgroundTasks``
--------------------------------------------------------------
``BackgroundTasks`` would work, but it runs on the same AnyIO threadpool that
Starlette uses to run every ``def`` endpoint. A burst of 40-second generations
would eat the tokens that ordinary requests need, so a background job could
make the *foreground* API slow — precisely the failure we are fixing. A
separate, explicitly bounded pool keeps generation contention inside
generation, caps concurrent spend against Gemini, and gives the threads a
recognisable name in a stack dump.

ORPHANED JOBS
-------------
The process WILL die mid-job: every deploy restarts it and the free tier spins
down on inactivity. Those jobs are simply gone — nothing resumes them. What
must never happen is a teacher staring at a spinner forever, so any job still
``queued``/``processing`` more than ``job_stale_after_seconds`` after it was
created is marked ``failed`` with an honest message, lazily, whenever jobs are
read. See ``reap_stale_jobs``.

TENANCY
-------
This runs on the Supabase service-role key, which bypasses RLS entirely, so
every single read and write below filters on ``workspace_id`` in application
code. There is no such thing as a lookup by job id alone in this module — see
``_row_params``. (A cross-tenant IDOR of exactly that shape was recently fixed
in app/generation/assessments.py; the fix is not to repeat the pattern.)
"""
from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import HTTPException

from app.ai.gemini_client import GeminiError
from app.core.config import settings
from app.core.errors import FailureClass, mask, service_result_message
from app.core.logging import logger
from app.services.supabase_service import SupabaseError, is_configured, table_insert, table_select, table_update

_TABLE = "generation_jobs"

# Status vocabulary. These four strings are the ones documented on the column
# in migrations/0001_core_tables.sql — kept identical so a hand-written SQL
# query in the Supabase dashboard matches what the app writes.
QUEUED = "queued"
PROCESSING = "processing"
COMPLETED = "completed"
FAILED = "failed"

ACTIVE_STATUSES = (QUEUED, PROCESSING)
TERMINAL_STATUSES = (COMPLETED, FAILED)

# Our own condition, not an upstream one, so it is stated plainly rather than
# run through app/core/errors.py's masking (see that module's docstring: only
# *upstream* failures are translated). "Interrupted" is the truth, and "run it
# again" is the only action available.
STALE_MESSAGE = (
    "This was interrupted before it finished — the server restarted while it was running. "
    "Nothing was saved, so please start it again."
)

QUEUE_FULL_MESSAGE = (
    "Vivran is already working through several generations — please try again in a minute."
)


class JobQueueFull(RuntimeError):
    """Raised by ``enqueue`` when this process is already saturated."""


class JobUserError(RuntimeError):
    """A job failure the teacher can actually act on — stored verbatim.

    The async counterpart of the ``user_facing: True`` envelope flag in
    app/core/errors.py, and it follows the same rule that module states: our
    own validation errors ("A PDF file is required", "No extractable text was
    found in this material") are already specific and must NOT be masked into
    "something went wrong", or the teacher loses the one sentence that would
    have let them fix it in five seconds. Only *upstream* failures get masked.
    """


# ---------------------------------------------------------------------------
# Storage. Supabase when configured, an in-process dict otherwise.
#
# The fallback mirrors app/services/provisioning.py's ``_local_profiles``: the
# offline path has to behave the same way as the real one, including the
# workspace filtering, or the test suite would be proving nothing about the
# code that actually ships.
# ---------------------------------------------------------------------------
_memory_jobs: Dict[str, Dict[str, Any]] = {}
_memory_lock = threading.Lock()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.isoformat()


def _parse_ts(value: Any) -> Optional[datetime]:
    """Parse a timestamp coming back from PostgREST (or our own ISO strings).

    Returns None when it can't be read. Callers treat None as "unknown age",
    which must mean *don't reap* — guessing old here would fail a live job.
    """
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _row_params(job_id: str, workspace_id: str) -> Dict[str, str]:
    """The ONLY way this module addresses a single job row.

    Both filters, always. A helper rather than an inline dict specifically so
    that "did we remember the workspace filter?" is one thing to check instead
    of one per call site.
    """
    return {"id": f"eq.{job_id}", "workspace_id": f"eq.{workspace_id}"}


def _insert(row: Dict[str, Any]) -> Dict[str, Any]:
    if is_configured():
        return table_insert(_TABLE, row)
    with _memory_lock:
        _memory_jobs[row["id"]] = dict(row)
    return dict(row)


def _patch(job_id: str, workspace_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if is_configured():
        rows = table_update(_TABLE, _row_params(job_id, workspace_id), patch)
        return rows[0] if rows else None
    with _memory_lock:
        row = _memory_jobs.get(job_id)
        # Same tenancy rule as the PostgREST filter above, enforced explicitly
        # rather than relying on the id being unguessable.
        if not row or row.get("workspace_id") != workspace_id:
            return None
        row.update(patch)
        return dict(row)


def _fetch(job_id: str, workspace_id: str) -> Optional[Dict[str, Any]]:
    if is_configured():
        rows = table_select(_TABLE, {**_row_params(job_id, workspace_id), "select": "*", "limit": "1"})
        return rows[0] if rows else None
    with _memory_lock:
        row = _memory_jobs.get(job_id)
        if not row or row.get("workspace_id") != workspace_id:
            return None
        return dict(row)


def _fetch_workspace(workspace_id: str, limit: int) -> List[Dict[str, Any]]:
    if is_configured():
        return table_select(
            _TABLE,
            {
                "workspace_id": f"eq.{workspace_id}",
                "select": "*",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
    with _memory_lock:
        rows = [dict(r) for r in _memory_jobs.values() if r.get("workspace_id") == workspace_id]
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return rows[:limit]


def reset_local_store() -> None:
    """Test-only: clears the offline job store between test modules."""
    with _memory_lock:
        _memory_jobs.clear()


# ---------------------------------------------------------------------------
# Public shape. What a teacher's browser sees.
# ---------------------------------------------------------------------------


def public_job(row: Dict[str, Any], *, include_result: bool) -> Dict[str, Any]:
    """Projects a stored row to the API response.

    ``include_result`` is False for the list endpoint on purpose: a completed
    slide deck is a large payload and the list is polled on every page load,
    so the list stays a cheap index and the detail route carries the goods.
    """
    metadata = row.get("metadata") or {}
    out = {
        "id": row.get("id"),
        "task_type": row.get("task_type"),
        "status": row.get("status"),
        "progress": row.get("progress") or 0,
        "error": row.get("error"),
        "params": metadata.get("params") or {},
        "created_at": row.get("created_at"),
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
    }
    if include_result:
        out["result"] = metadata.get("result") if row.get("status") == COMPLETED else None
    return out


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


def create_job(
    *,
    workspace_id: str,
    user_id: str,
    task_type: str,
    params: Dict[str, Any],
    model_tier: str = "cheap_cloud",
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Writes the ``queued`` row. Nothing runs until ``submit``."""
    row = {
        "id": str(uuid.uuid4()),
        "workspace_id": workspace_id,
        "user_id": user_id,
        "task_type": task_type,
        "status": QUEUED,
        # Both columns are NOT NULL in the schema, so the planned tier/model is
        # recorded up front rather than left for the worker to fill in — a row
        # that fails to insert would defeat the entire point of this module.
        "model_tier": model_tier,
        "model_name": model_name or settings.cheap_model,
        "progress": 0,
        # `params` is what was asked for, `result` is what came back. Both live
        # under the existing `metadata` jsonb column deliberately: storing the
        # result needs no new column, so this feature works against the live
        # database with no hand-applied migration.
        "metadata": {"params": params},
        "created_at": _iso(_now()),
    }
    return _insert(row)


def mark_processing(job_id: str, workspace_id: str) -> None:
    _patch(job_id, workspace_id, {"status": PROCESSING, "started_at": _iso(_now()), "progress": 5})


def update_progress(job_id: str, workspace_id: str, progress: int) -> None:
    """Best-effort progress ping. A failed progress write must never kill a job."""
    try:
        _patch(job_id, workspace_id, {"progress": max(0, min(100, int(progress)))})
    except SupabaseError as exc:
        logger.warning("Progress update for job %s failed (continuing): %s", job_id, exc)


def complete_job(job_id: str, workspace_id: str, result: Dict[str, Any], params: Dict[str, Any]) -> None:
    _patch(
        job_id,
        workspace_id,
        {
            "status": COMPLETED,
            "progress": 100,
            "completed_at": _iso(_now()),
            # PostgREST replaces the whole jsonb value, so `params` is written
            # back alongside the result rather than lost.
            "metadata": {"params": params, "result": result},
        },
    )


def fail_job(job_id: str, workspace_id: str, message: str) -> None:
    """Stores the TEACHER-SAFE message. Callers must have masked already.

    Nothing in this module ever puts ``str(exception)`` in this column: that
    text is upstream provider output (quota numbers, model names, request ids)
    and it would be rendered straight into the UI from the job list.
    """
    _patch(
        job_id,
        workspace_id,
        {"status": FAILED, "completed_at": _iso(_now()), "error": message},
    )


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------
_executor: Optional[ThreadPoolExecutor] = None
_executor_lock = threading.Lock()

# Jobs this process has accepted and not yet finished. Two uses: the queue cap,
# and — importantly — ``reap_stale_jobs`` refuses to declare one of these dead,
# so a genuinely slow live job can never be failed out from under its own
# worker thread.
_inflight: set[str] = set()
_inflight_lock = threading.Lock()


def _get_executor() -> ThreadPoolExecutor:
    global _executor
    with _executor_lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(
                max_workers=max(1, settings.job_max_workers),
                thread_name_prefix="vivran-job",
            )
        return _executor


def inflight_count() -> int:
    with _inflight_lock:
        return len(_inflight)


def _error_message_for(exc: BaseException, *, context: str) -> str:
    """Turns any exception into the string a teacher may safely be shown."""
    if isinstance(exc, JobUserError):
        return str(exc)
    if isinstance(exc, HTTPException):
        # Reached when a route's own helper raised inside the job body. The
        # detail on an HTTPException in this codebase is by construction
        # already user-facing — either produced by app/core/errors.py or one of
        # our own specific messages — so it is kept rather than re-masked.
        return str(exc.detail)
    if isinstance(exc, GeminiError):
        return mask(exc.failure, context=context, detail=f"{exc} | {exc.body[:300]}")
    if isinstance(exc, SupabaseError):
        # Our own database, not a third party — but the text still carries
        # table names and PostgREST internals, so it is logged, not shown.
        return mask(FailureClass.UPSTREAM_ERROR, context=context, detail=str(exc))
    return mask(FailureClass.UPSTREAM_ERROR, context=context, detail=f"{type(exc).__name__}: {exc}")


def _run_job(
    *,
    job_id: str,
    workspace_id: str,
    params: Dict[str, Any],
    run: Callable[[], Dict[str, Any]],
    context: str,
    service_context: Optional[str],
) -> None:
    """The worker body. Runs on a pool thread; must never raise."""
    try:
        mark_processing(job_id, workspace_id)
        result = run()

        if service_context is not None:
            # Media services signal failure by returning an envelope rather
            # than raising. Same classifier the synchronous route uses, so the
            # wording cannot drift between the two modes.
            message = service_result_message(result, context=service_context)
            if message:
                fail_job(job_id, workspace_id, message)
                return

        complete_job(job_id, workspace_id, result, params)
    except BaseException as exc:  # noqa: BLE001 - a job thread may not propagate
        logger.exception("Background job %s (%s) failed", job_id, context)
        try:
            fail_job(job_id, workspace_id, _error_message_for(exc, context=context))
        except Exception:  # pragma: no cover - the DB is down too
            # Nothing left to do but leave it; the stale reaper will resolve
            # this row for the teacher rather than leaving a live spinner.
            logger.exception("Could not record failure for job %s", job_id)
    finally:
        with _inflight_lock:
            _inflight.discard(job_id)


def enqueue(
    *,
    workspace_id: str,
    user_id: str,
    task_type: str,
    params: Dict[str, Any],
    run: Callable[[], Dict[str, Any]],
    service_context: Optional[str] = None,
    model_tier: str = "cheap_cloud",
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist a job row and start it off-request. Returns the queued row.

    Raises ``JobQueueFull`` when this process already has more outstanding work
    than ``job_queue_cap``. Refusing up front is kinder than accepting a job
    that will sit behind 30 others and probably be orphaned by the next deploy.
    """
    if inflight_count() >= max(1, settings.job_queue_cap):
        raise JobQueueFull(QUEUE_FULL_MESSAGE)

    row = create_job(
        workspace_id=workspace_id,
        user_id=user_id,
        task_type=task_type,
        params=params,
        model_tier=model_tier,
        model_name=model_name,
    )
    job_id = row["id"]

    with _inflight_lock:
        _inflight.add(job_id)

    try:
        _get_executor().submit(
            _run_job,
            job_id=job_id,
            workspace_id=workspace_id,
            params=params,
            run=run,
            context=task_type,
            service_context=service_context,
        )
    except RuntimeError as exc:
        # The interpreter is shutting down (deploy in progress). Resolve the
        # row now rather than leaving a job nobody will ever pick up.
        with _inflight_lock:
            _inflight.discard(job_id)
        logger.warning("Could not schedule job %s: %s", job_id, exc)
        fail_job(job_id, workspace_id, STALE_MESSAGE)
        row = {**row, "status": FAILED, "error": STALE_MESSAGE}

    return row


# ---------------------------------------------------------------------------
# Reading + stale-job reaping
# ---------------------------------------------------------------------------


def _is_stale(row: Dict[str, Any], *, cutoff: datetime) -> bool:
    if row.get("status") not in ACTIVE_STATUSES:
        return False
    with _inflight_lock:
        if row.get("id") in _inflight:
            # This process is running it right now. Age is irrelevant.
            return False
    # started_at for a claimed job, created_at for one that never got claimed.
    reference = _parse_ts(row.get("started_at")) or _parse_ts(row.get("created_at"))
    if reference is None:
        return False  # unreadable timestamp: never guess a live job is dead
    return reference < cutoff


def reap_stale_jobs(workspace_id: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Fails any job in ``rows`` whose owning process is gone. Returns the rows fixed up.

    Lazy, on read, rather than a background sweeper thread: the only observer
    who cares is the teacher looking at the page, the check is a timestamp
    comparison over the handful of rows already fetched, and a sweeper would be
    one more thing to run (and to orphan) on a box that spins down anyway.
    """
    cutoff = _now() - timedelta(seconds=max(60, settings.job_stale_after_seconds))
    out: List[Dict[str, Any]] = []
    for row in rows:
        if not _is_stale(row, cutoff=cutoff):
            out.append(row)
            continue
        logger.warning(
            "Reaping orphaned job %s (%s) — %s since %s",
            row.get("id"), row.get("task_type"), row.get("status"), row.get("started_at") or row.get("created_at"),
        )
        try:
            fail_job(row["id"], workspace_id, STALE_MESSAGE)
        except SupabaseError as exc:
            # Report it as failed to this caller anyway. A spinner that never
            # resolves is worse than a row whose write we retry next read.
            logger.warning("Could not persist reap of job %s: %s", row.get("id"), exc)
        out.append({**row, "status": FAILED, "error": STALE_MESSAGE, "completed_at": _iso(_now())})
    return out


def get_job(job_id: str, workspace_id: str) -> Optional[Dict[str, Any]]:
    """Single job, scoped. ``None`` means "not yours or not there" — the caller
    turns that into a 404, never a 403, so a job id is not an existence oracle
    for another teacher's workspace."""
    row = _fetch(job_id, workspace_id)
    if row is None:
        return None
    return reap_stale_jobs(workspace_id, [row])[0]


def list_jobs(
    workspace_id: str,
    *,
    active_only: bool = False,
    recent_minutes: Optional[int] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """"What is running for me, and what just finished."

    Deliberately fetches by workspace and filters in Python rather than
    building a PostgREST ``or=`` clause: the row count per workspace is tiny,
    and one obvious filter beats a query string nobody can read six months
    from now.
    """
    window = settings.job_recent_window_minutes if recent_minutes is None else recent_minutes
    # Over-fetch a little so that recently-finished rows don't push active ones
    # out of the window before filtering.
    rows = reap_stale_jobs(workspace_id, _fetch_workspace(workspace_id, max(limit * 3, 30)))

    cutoff = _now() - timedelta(minutes=max(0, window))
    out: List[Dict[str, Any]] = []
    for row in rows:
        status = row.get("status")
        if status in ACTIVE_STATUSES:
            out.append(row)
            continue
        if active_only:
            continue
        finished = _parse_ts(row.get("completed_at")) or _parse_ts(row.get("created_at"))
        if finished is not None and finished >= cutoff:
            out.append(row)
    return out[:limit]
