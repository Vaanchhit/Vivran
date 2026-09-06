"""Background Job Queue Processing (§51) for PDF ingestion, embeddings, and media generation."""
import json
import sqlite3
import time
from typing import Any, Dict

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


def enqueue_job(job_id: str, workflow: str, payload: Dict[str, Any]) -> None:
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


def fetch_job_status(job_id: str) -> Dict[str, Any]:
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, workflow, status, result FROM jobs WHERE id = ?", (job_id,))
    row = cur.fetchone()
    conn.close()
    if row:
        return {
            "job_id": row[0],
            "workflow": row[1],
            "status": row[2],
            "result": json.loads(row[3]) if row[3] else None,
        }
    return {"error": "Job not found", "job_id": job_id}

