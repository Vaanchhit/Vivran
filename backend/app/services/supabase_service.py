"""Minimal Supabase service stubs for Vivran MVP.

These functions are placeholders that wrap Supabase REST API or client SDK.
They are intentionally small so they can be swapped for a real Supabase client
using the `supabase` Python SDK later.
"""
from __future__ import annotations

import os
import httpx
from typing import Any, Dict

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")


def _headers() -> Dict[str, str]:
    return {
        "apikey": SUPABASE_KEY or "",
        "Authorization": f"Bearer {SUPABASE_KEY or ''}",
        "Content-Type": "application/json",
    }


def upsert_project(project: Dict[str, Any]) -> Dict[str, Any]:
    """Upsert a project record in Supabase. Returns the inserted row (placeholder)."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"error": "Supabase not configured", "project": project}

    url = f"{SUPABASE_URL}/rest/v1/projects"
    # Use on_conflict or prefer RPC; for MVP this is a simple insert
    with httpx.Client() as client:
        r = client.post(url, json=project, headers=_headers())
        return r.json()


def insert_job(job: Dict[str, Any]) -> Dict[str, Any]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"error": "Supabase not configured", "job": job}

    url = f"{SUPABASE_URL}/rest/v1/jobs"
    with httpx.Client() as client:
        r = client.post(url, json=job, headers=_headers())
        return r.json()
