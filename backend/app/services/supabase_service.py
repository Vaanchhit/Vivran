"""Supabase REST (PostgREST) + Storage helpers, service-role only.

These wrap the Supabase HTTP APIs directly (no supabase-py dependency) since
the rest of the backend already talks to Supabase over httpx. All functions
raise SupabaseError on failure — callers decide how to degrade, nothing here
fabricates a result.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


class SupabaseError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key)


def _base() -> str:
    if not settings.supabase_url:
        raise SupabaseError("SUPABASE_URL is not configured")
    return settings.supabase_url.rstrip("/")


def _headers(prefer: Optional[str] = None) -> Dict[str, str]:
    if not settings.supabase_service_role_key:
        raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def table_insert(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    with httpx.Client(timeout=20.0) as client:
        r = client.post(f"{_base()}/rest/v1/{table}", json=row, headers=_headers("return=representation"))
    if r.status_code not in (200, 201):
        raise SupabaseError(f"Insert into {table} failed ({r.status_code}): {r.text[:300]}")
    data = r.json()
    return data[0] if isinstance(data, list) else data


def table_insert_many(table: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rows:
        return []
    with httpx.Client(timeout=30.0) as client:
        r = client.post(f"{_base()}/rest/v1/{table}", json=rows, headers=_headers("return=representation"))
    if r.status_code not in (200, 201):
        raise SupabaseError(f"Bulk insert into {table} failed ({r.status_code}): {r.text[:300]}")
    return r.json()


def table_select(table: str, params: Dict[str, str]) -> List[Dict[str, Any]]:
    with httpx.Client(timeout=20.0) as client:
        r = client.get(f"{_base()}/rest/v1/{table}", params=params, headers=_headers())
    if r.status_code != 200:
        raise SupabaseError(f"Select from {table} failed ({r.status_code}): {r.text[:300]}")
    return r.json()


def table_update(table: str, params: Dict[str, str], patch: Dict[str, Any]) -> List[Dict[str, Any]]:
    with httpx.Client(timeout=20.0) as client:
        r = client.patch(f"{_base()}/rest/v1/{table}", params=params, json=patch, headers=_headers("return=representation"))
    if r.status_code not in (200, 204):
        raise SupabaseError(f"Update on {table} failed ({r.status_code}): {r.text[:300]}")
    return r.json() if r.content else []


def rpc(function_name: str, args: Dict[str, Any]) -> Any:
    with httpx.Client(timeout=30.0) as client:
        r = client.post(f"{_base()}/rest/v1/rpc/{function_name}", json=args, headers=_headers())
    if r.status_code != 200:
        raise SupabaseError(f"RPC {function_name} failed ({r.status_code}): {r.text[:300]}")
    return r.json()


def ensure_bucket(bucket: str) -> None:
    """Idempotently creates a public storage bucket if it doesn't already exist."""
    with httpx.Client(timeout=15.0) as client:
        r = client.post(
            f"{_base()}/storage/v1/bucket",
            json={"id": bucket, "name": bucket, "public": True},
            headers=_headers(),
        )
    if r.status_code in (200, 201):
        return
    if r.status_code == 400 and "already exists" in r.text.lower():
        return
    raise SupabaseError(f"Could not ensure storage bucket '{bucket}' ({r.status_code}): {r.text[:300]}")


def upload_file(bucket: str, path: str, content: bytes, content_type: str = "application/octet-stream") -> str:
    """Uploads a file to Supabase Storage and returns its public URL."""
    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            f"{_base()}/storage/v1/object/{bucket}/{path}",
            content=content,
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )
    if r.status_code not in (200, 201):
        raise SupabaseError(f"Storage upload failed ({r.status_code}): {r.text[:300]}")
    return f"{_base()}/storage/v1/object/public/{bucket}/{path}"
