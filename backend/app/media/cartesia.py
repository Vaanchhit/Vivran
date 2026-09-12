"""Cartesia Service Abstraction (§31) for text-to-speech and speech-to-text.

Verified live against Cartesia's current API (docs.cartesia.ai, version
2026-08-14) — auth is `Authorization: Bearer`, not `X-API-Key`.
"""
import uuid
from typing import Any, Dict

import httpx

from app.core.config import settings
from app.services.supabase_service import SupabaseError, ensure_bucket, upload_file

DEFAULT_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"
CARTESIA_VERSION = "2026-08-14"


class CartesiaService:
    def __init__(self):
        self.api_key = settings.cartesia_api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}", "Cartesia-Version": CARTESIA_VERSION}

    def generate_speech(self, script: str, voice_id: str = DEFAULT_VOICE_ID) -> Dict[str, Any]:
        if not self.is_configured():
            return {"provider": "cartesia", "status": "not_configured", "error": "CARTESIA_API_KEY is not set"}

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
            return {"provider": "cartesia", "status": "failed", "error": str(e)}

        if r.status_code != 200:
            return {"provider": "cartesia", "status": "failed", "error": f"{r.status_code}: {r.text[:300]}"}

        try:
            ensure_bucket("materials")
            url = upload_file("materials", f"media/{uuid.uuid4()}.mp3", r.content, "audio/mpeg")
        except SupabaseError as e:
            return {"provider": "cartesia", "status": "failed", "error": f"generated but upload failed: {e}"}

        return {"provider": "cartesia", "status": "ready", "media_url": url}

    def transcribe(self, audio_bytes: bytes, filename: str, content_type: str) -> Dict[str, Any]:
        if not self.is_configured():
            return {"provider": "cartesia", "status": "not_configured", "error": "CARTESIA_API_KEY is not set"}

        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.post(
                    "https://api.cartesia.ai/stt",
                    headers=self._headers(),
                    files={"file": (filename, audio_bytes, content_type)},
                    data={"model": "ink-whisper"},
                )
        except httpx.HTTPError as e:
            return {"provider": "cartesia", "status": "failed", "error": str(e)}

        if r.status_code != 200:
            return {"provider": "cartesia", "status": "failed", "error": f"{r.status_code}: {r.text[:300]}"}

        return {"provider": "cartesia", "status": "ready", "text": r.json().get("text", "")}
