"""Napkin (api.napkin.ai): a designed visual for an intuitive example, on request.

OPTIONAL and OFF without NAPKIN_API_KEY. Two things make it a deliberate opt-in
rather than part of every example:

  * usage draws on the key owner's Napkin credits, shared by every teacher on
    this deployment, and free plans add a watermark to what comes back;
  * the diagrams Vivran draws itself (mapping table and worked-example chart)
    are free, instant and spelled by us, so Napkin is the prettier extra, not
    the dependency.

WHAT IS VERIFIED against Napkin's published docs: auth is `Authorization: Bearer`,
creating is `POST /v1/visual` and needs `format` and `content`, it is
asynchronous, status is `GET /v1/visual/{id}/status` with a `generated_files`
array, formats are svg (default), png and ppt, status and file URLs expire after
30 minutes, 402 is `no_credits`, 429 carries Retry-After.

WHAT IS NOT (the reference pages publish no body or response schema): the field
names inside the create response and the status payload below are read
tolerantly (several spellings accepted) and need ONE live call to confirm.
Nothing here has been called against the real service.
"""
from __future__ import annotations

import base64
import time
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.errors import FailureClass
from app.core.logging import logger

POLL_SECONDS = 2.0
MAX_WAIT_SECONDS = 60.0
MAX_CONTENT_CHARS = 1800
_DONE = {"completed", "complete", "done", "succeeded", "success", "ready", "finished"}
_FAILED = {"failed", "error", "cancelled", "canceled"}


class NapkinService:
    def __init__(self) -> None:
        self.key = settings.napkin_api_key
        self.base = settings.napkin_base_url.rstrip("/")

    def is_configured(self) -> bool:
        return bool(self.key)

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}

    @staticmethod
    def _failed(message: str, failure: FailureClass = FailureClass.UPSTREAM_ERROR) -> Dict[str, Any]:
        return {"provider": "napkin", "status": "failed", "error": message, "failure": failure, "user_facing": True}

    def _error_for(self, r: httpx.Response) -> Dict[str, Any]:
        try:
            code = (r.json() or {}).get("error", "")
        except ValueError:
            code = ""
        if r.status_code == 402 or code == "no_credits":
            return self._failed("The visual service has run out of credits for now. The example itself is complete without it.", FailureClass.QUOTA_EXHAUSTED)
        if r.status_code == 429:
            return self._failed("The visual service is busy. Try again in a minute.", FailureClass.UPSTREAM_BUSY)
        logger.warning("Napkin returned %s (%s): %s", r.status_code, code, r.text[:200])
        return self._failed("The visual service couldn't make that picture. The example itself is complete without it.")

    def make_visual(self, text: str, language: Optional[str] = None) -> Dict[str, Any]:
        """Text -> an SVG as a data URL. Blocks up to MAX_WAIT_SECONDS; call from a job."""
        if not self.is_configured():
            return {"provider": "napkin", "status": "not_configured", "error": "NAPKIN_API_KEY is not set", "failure": FailureClass.NOT_CONFIGURED}
        body: Dict[str, Any] = {"format": "svg", "content": text[:MAX_CONTENT_CHARS]}
        if language:
            body["language"] = language
        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(f"{self.base}/v1/visual", headers=self._headers(), json=body)
                if r.status_code not in (200, 201, 202):
                    return self._error_for(r)
                payload = r.json() or {}
                request_id = payload.get("id") or payload.get("request_id") or payload.get("requestId")
                if not request_id:
                    return self._failed("The visual service gave an unexpected answer.")
                files = self._wait(client, str(request_id))
                if isinstance(files, dict):
                    return files
                if not files:
                    return self._failed("The visual service finished without a picture.")
                svg = client.get(files[0], headers=self._headers())
                if svg.status_code != 200:
                    return self._error_for(svg)
                data = base64.b64encode(svg.content).decode("ascii")
        except httpx.HTTPError as e:
            logger.warning("Napkin request failed: %s", e)
            return self._failed("Couldn't reach the visual service. Try again in a moment.", FailureClass.UPSTREAM_BUSY)
        return {"provider": "napkin", "status": "ready", "image": f"data:image/svg+xml;base64,{data}", "format": "svg"}

    def _wait(self, client: httpx.Client, request_id: str) -> "List[str] | Dict[str, Any]":
        deadline = time.monotonic() + MAX_WAIT_SECONDS
        while time.monotonic() < deadline:
            r = client.get(f"{self.base}/v1/visual/{request_id}/status", headers=self._headers())
            if r.status_code != 200:
                return self._error_for(r)
            body = r.json() or {}
            status = str(body.get("status", "")).lower()
            files = [f if isinstance(f, str) else (f.get("url") or f.get("file_url") or "") for f in (body.get("generated_files") or [])]
            files = [f for f in files if f]
            if files or status in _DONE:
                return files
            if status in _FAILED:
                return self._failed("The visual service couldn't make that picture. The example itself is complete without it.")
            time.sleep(POLL_SECONDS)
        return self._failed("The visual service took too long. The example itself is complete without it.", FailureClass.UPSTREAM_BUSY)
