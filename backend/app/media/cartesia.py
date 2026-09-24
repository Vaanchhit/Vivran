"""Cartesia Service Abstraction (§31) for text-to-speech and speech-to-text.

Verified live against Cartesia's current API (docs.cartesia.ai, version
2026-08-14) — auth is `Authorization: Bearer`, not `X-API-Key`.
"""
import uuid
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.core.errors import FailureClass, classify_upstream_status
from app.core.logging import logger
from app.services.supabase_service import SupabaseError, ensure_bucket, upload_file

DEFAULT_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"
CARTESIA_VERSION = "2026-08-14"


def _failed(status_code: Optional[int], body: str, *, context: str) -> Dict[str, Any]:
    """Raw detail for the log, classified failure for the API layer to
    translate (app/core/errors.py). Never shown to a teacher verbatim."""
    failure = classify_upstream_status(status_code, body)
    logger.warning("Cartesia %s failed (status=%s, class=%s): %s", context, status_code, failure.value, body[:400])
    return {"provider": "cartesia", "status": "failed", "error": body[:400], "failure": failure}


def _not_configured() -> Dict[str, Any]:
    return {
        "provider": "cartesia",
        "status": "not_configured",
        "error": "CARTESIA_API_KEY is not set",
        "failure": FailureClass.NOT_CONFIGURED,
    }


class CartesiaService:
    def __init__(self):
        self.api_key = settings.cartesia_api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Cartesia-Version": CARTESIA_VERSION}

    def generate_speech(self, script: str, voice_id: str = DEFAULT_VOICE_ID) -> Dict[str, Any]:
        if not self.is_configured():
            return _not_configured()

        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.post(
                    "https://api.cartesia.ai/tts/bytes",
                    headers={**self._headers(), "Content-Type": "application/json"},
                    json={
                        "model_id": "sonic-3",
                        "transcript": script,
                        "voice": {"id": voice_id},
                        "output_format": {"container": "mp3", "sample_rate": 44100, "bit_rate": 128000},
                    },
                )
        except httpx.HTTPError as e:
            return _failed(None, str(e), context="speech")

        if r.status_code != 200:
            return _failed(r.status_code, r.text, context="speech")

        try:
            ensure_bucket("materials")
            url = upload_file("materials", f"media/{uuid.uuid4()}.mp3", r.content, "audio/mpeg")
        except SupabaseError as e:
            # Our storage, not Cartesia's quota — never classified as quota.
            logger.error("Cartesia speech generated but upload failed: %s", e)
            return {
                "provider": "cartesia",
                "status": "failed",
                "error": f"generated but upload failed: {e}",
                "failure": FailureClass.UPSTREAM_ERROR,
            }

        return {"provider": "cartesia", "status": "ready", "media_url": url}

    def transcribe(self, audio_bytes: bytes, filename: str, content_type: str) -> Dict[str, Any]:
        if not self.is_configured():
            return _not_configured()

        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.post(
                    "https://api.cartesia.ai/stt",
                    headers=self._headers(),
                    files={"file": (filename, audio_bytes, content_type)},
                    data={"model": "ink-whisper"},
                )
        except httpx.HTTPError as e:
            return _failed(None, str(e), context="transcribe")

        if r.status_code != 200:
            return _failed(r.status_code, r.text, context="transcribe")

        return {"provider": "cartesia", "status": "ready", "text": r.json().get("text", "")}
