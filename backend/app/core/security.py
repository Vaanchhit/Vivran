"""Security and token validation utilities for Vivran FastAPI backend.

The real bearer-token validation lives in ``app/core/auth.py`` (JWT decode) and
``app/api/deps.py`` (FastAPI dependencies). This module is a thin legacy facade.
"""
from __future__ import annotations


def verify_teacher_access(user_id: str, workspace_id: str) -> bool:
    """Legacy stub.

    Use ``require_workspace_id`` / ``require_teacher`` FastAPI dependencies
    from ``app.api.deps`` instead; they validate the Supabase JWT and the
    workspace ownership for each request.
    """
    return bool(user_id and workspace_id)