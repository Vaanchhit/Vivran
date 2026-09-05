"""A tiny background worker that processes jobs from a local sqlite queue.

This is intentionally dependency-light for the MVP. For production the worker
should be replaced with a proper queue (Redis/RQ, Celery, or Supabase row-watcher).
"""
from __future__ import annotations

import json
import sqlite3
import time
from typing import Any

DB_PATH = "./jobs.sqlite"


def _ensure_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            workflow TEXT,
            payload TEXT,
            status TEXT,
            result TEXT,
            created_at REAL,
            updated_at REAL
        )
        """
    )
    conn.commit()
    conn.close()


def enqueue(job_id: str, workflow: str, payload: dict[str, Any]) -> None:
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    now = time.time()
    cur.execute(
        "INSERT OR REPLACE INTO jobs (id, workflow, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (job_id, workflow, json.dumps(payload), "queued", now, now),
    )
    conn.commit()
    conn.close()


def _fetch_one_queued():
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, workflow, payload FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1")
    row = cur.fetchone()
    conn.close()
    return row


def _mark_status(job_id: str, status: str, result: dict[str, Any] | None = None) -> None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    now = time.time()
    cur.execute("UPDATE jobs SET status = ?, result = ?, updated_at = ? WHERE id = ?", (status, json.dumps(result) if result else None, now, job_id))
    conn.commit()
    conn.close()


def _process_job(job_id: str, workflow: str, payload_json: str) -> dict[str, Any]:
    payload = json.loads(payload_json)
    # Very small placeholder processing: echo the payload with a synthetic artifact
    time.sleep(1)
    return {"ok": True, "artifact": {"title": f"Auto: {workflow}", "payload": payload}}


def run_loop(poll_interval: float = 2.0) -> None:
    _ensure_db()
    print("Job worker started, polling for queued jobs...")
    try:
        while True:
            row = _fetch_one_queued()
            if row:
                job_id, workflow, payload = row
                print(f"Processing job {job_id} workflow={workflow}")
                _mark_status(job_id, "processing")
                try:
                    result = _process_job(job_id, workflow, payload)
                    _mark_status(job_id, "completed", result)
                    print(f"Completed job {job_id}")
                except Exception as e:
                    _mark_status(job_id, "failed", {"error": str(e)})
                    print(f"Job {job_id} failed: {e}")
            else:
                time.sleep(poll_interval)
    except KeyboardInterrupt:
        print("Worker stopped")


if __name__ == "__main__":
    run_loop()
