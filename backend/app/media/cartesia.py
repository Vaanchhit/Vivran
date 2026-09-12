"""Cartesia Service Abstraction (§31) for text-to-speech.

Best-effort real integration against Cartesia's TTS API. If you plan to
demo this specifically, verify the request/response shape against Cartesia's
current docs first — it has not been exercised against a live key here.
"""
import uuid
from typing import Any, Dict

import httpx

from app.core.config import settings
from app.services.supabase_service import SupabaseError, ensure_bucket, upload_file

DEFAULT_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091"


class CartesiaService:
    def __init__(self):
        self.api_key = settings.cartesia_api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_speech(self, script: str, voice_id: str = DEFAULT_VOICE_ID) -> Dict[str, Any]:
        if not self.is_configured():
            return {"provider": "cartesia", "status": "not_configured", "error": "CARTESIA_API_KEY is not set"}

        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.post(
                    "https://api.cartesia.ai/tts/bytes",
                    headers={
                        "X-API-Key": self.api_key,
                        "Cartesia-Version": "2024-06-10",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model_id": "sonic-english",
                        "transcript": script,
                        "voice": {"mode": "id", "id": voice_id},
                        "output_format": {"container": "mp3", "encoding": "mp3", "sample_rate": 44100},
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
