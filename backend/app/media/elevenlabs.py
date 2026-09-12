"""ElevenLabs Service Abstraction (§29, §31) for narration audio.

Note: ElevenLabs generates audio, not video — the earlier "educational video
asset" framing here was aspirational, not a real ElevenLabs capability. This
generates real narration audio for a script and uploads it to Supabase
Storage; pairing it with visuals (slides) into an actual video is out of
scope for this pass.
"""
from typing import Any, Dict

import httpx

from app.core.config import settings
from app.services.supabase_service import SupabaseError, ensure_bucket, upload_file

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs public "Rachel" voice


class ElevenLabsService:
    def __init__(self):
        self.api_key = settings.elevenlabs_api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def generate_narration_audio(self, script: str, voice_id: str = DEFAULT_VOICE_ID) -> Dict[str, Any]:
        if not self.is_configured():
            return {"provider": "elevenlabs", "status": "not_configured", "error": "ELEVENLABS_API_KEY is not set"}

        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                    headers={"xi-api-key": self.api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                    json={"text": script, "model_id": "eleven_multilingual_v2"},
                )
        except httpx.HTTPError as e:
            return {"provider": "elevenlabs", "status": "failed", "error": str(e)}

        if r.status_code != 200:
            return {"provider": "elevenlabs", "status": "failed", "error": f"{r.status_code}: {r.text[:300]}"}

        import uuid

        try:
            ensure_bucket("materials")
            url = upload_file("materials", f"media/{uuid.uuid4()}.mp3", r.content, "audio/mpeg")
        except SupabaseError as e:
            return {"provider": "elevenlabs", "status": "failed", "error": f"generated but upload failed: {e}"}

        return {"provider": "elevenlabs", "status": "ready", "media_url": url}
