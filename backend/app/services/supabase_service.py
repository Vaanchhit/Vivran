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


def table_upsert(table: str, row: Dict[str, Any], on_conflict: str) -> List[Dict[str, Any]]:
    """Insert-or-merge a single row on ``on_conflict``, returning what landed.

    PostgREST is allowed to answer an upsert that resolved to a conflict with
    an empty body on some configurations, so an empty list here means "the
    write succeeded but told us nothing" — never "the write failed". Failures
    always raise.
    """
    with httpx.Client(timeout=20.0) as client:
        r = client.post(
            f"{_base()}/rest/v1/{table}",
            json=row,
            params={"on_conflict": on_conflict},
            headers=_headers("resolution=merge-duplicates,return=representation"),
        )
    if r.status_code not in (200, 201, 204):
        raise SupabaseError(f"Upsert into {table} failed ({r.status_code}): {r.text[:300]}")
    if not r.content:
        return []
    data = r.json()
    return data if isinstance(data, list) else [data]


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


def table_delete(table: str, params: Dict[str, str]) -> None:
    with httpx.Client(timeout=20.0) as client:
        r = client.delete(f"{_base()}/rest/v1/{table}", params=params, headers=_headers())
    if r.status_code not in (200, 204):
        raise SupabaseError(f"Delete from {table} failed ({r.status_code}): {r.text[:300]}")


def rpc(function_name: str, args: Dict[str, Any]) -> Any:
    with httpx.Client(timeout=30.0) as client:
        r = client.post(f"{_base()}/rest/v1/rpc/{function_name}", json=args, headers=_headers())
    if r.status_code != 200:
        raise SupabaseError(f"RPC {function_name} failed ({r.status_code}): {r.text[:300]}")
    return r.json()


def delete_storage_prefix(bucket: str, prefix: str) -> int:
    """Deletes every object under ``prefix`` in ``bucket``. Returns the count.

    Storage's list endpoint returns one folder level at a time (a folder is an
    entry with no ``id``), so this walks down before deleting. A missing bucket
    means there is nothing to delete, not a failure.
    """
    headers = {
        "apikey": settings.supabase_service_role_key,
        "Authorization": f"Bearer {settings.supabase_service_role_key}",
    }
    keys: List[str] = []
    with httpx.Client(timeout=30.0) as client:
        pending = [prefix.strip("/")]
        while pending:
            folder = pending.pop()
            offset = 0
            while True:
                r = client.post(
                    f"{_base()}/storage/v1/object/list/{bucket}",
                    json={"prefix": folder, "limit": 1000, "offset": offset},
                    headers=headers,
                )
                if r.status_code in (400, 404) and "not found" in r.text.lower():
                    return 0
                if r.status_code != 200:
                    raise SupabaseError(f"Storage list failed ({r.status_code}): {r.text[:300]}")
                entries = r.json()
                for e in entries:
                    path = f"{folder}/{e['name']}"
                    (keys if e.get("id") else pending).append(path)
                if len(entries) < 1000:
                    break
                offset += 1000
        for i in range(0, len(keys), 1000):
            r = client.request(
                "DELETE",
                f"{_base()}/storage/v1/object/{bucket}",
                json={"prefixes": keys[i:i + 1000]},
                headers=headers,
            )
            if r.status_code not in (200, 204):
                raise SupabaseError(f"Storage delete failed ({r.status_code}): {r.text[:300]}")
    return len(keys)


def ensure_bucket(bucket: str) -> None:
    """Idempotently creates a PRIVATE storage bucket if it doesn't already exist.

    Was `"public": True`, which made every uploaded PDF/DOCX/PPTX — real course
    material, sometimes unreleased papers — fetchable forever by anyone holding
    the URL, with no auth.

    This only governs buckets this call CREATES. Supabase answers an existing
    bucket with 400 "already exists" and changes nothing, so flipping this
    literal does not retroactively close the live `materials` bucket — that is
    a one-line manual step in the Supabase dashboard (Storage → materials →
    make private). Deliberately so: doing it here would have this deploy
    silently change the visibility of production data.
    """
    with httpx.Client(timeout=15.0) as client:
        r = client.post(
            f"{_base()}/storage/v1/bucket",
            json={"id": bucket, "name": bucket, "public": False},
            headers=_headers(),
        )
    if r.status_code in (200, 201):
        return
    if r.status_code == 400 and "already exists" in r.text.lower():
        return
    raise SupabaseError(f"Could not ensure storage bucket '{bucket}' ({r.status_code}): {r.text[:300]}")


def upload_file(bucket: str, path: str, content: bytes, content_type: str = "application/octet-stream") -> str:
    """Uploads a file to Supabase Storage and returns its bucket-relative key.

    Returns the key, not a `/object/public/...` URL. The old return value was
    an anonymous-readable link that got persisted into materials.storage_path,
    so the database itself was a list of permanent public download URLs for
    teachers' uploads. Nothing in the app reads storage_path today, so storing
    the key costs nothing now and is what a signed-URL download route would
    need once one exists.
    """
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
    return f"{bucket}/{path}"
