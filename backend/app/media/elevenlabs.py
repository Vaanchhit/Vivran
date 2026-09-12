"""ElevenLabs Service Abstraction (§29, §31) for narration audio, image, and video.

Image/video generation uses ElevenLabs' async Flows API (POST to create a
job, poll GET until completed) and requires an ElevenLabs Pro plan or above
for API access — a free-tier key will get a clear 401/403 from ElevenLabs,
surfaced as-is rather than silently failing.
"""
import time
import uuid
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings
from app.services.supabase_service import SupabaseError, ensure_bucket, upload_file

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs public "Rachel" voice
DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image"
DEFAULT_VIDEO_MODEL = "veo-3.1-fast-generate-001"


class ElevenLabsService:
    def __init__(self):
        self.api_key = settings.elevenlabs_api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {"xi-api-key": self.api_key, "Content-Type": "application/json"}

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

        try:
            ensure_bucket("materials")
            url = upload_file("materials", f"media/{uuid.uuid4()}.mp3", r.content, "audio/mpeg")
        except SupabaseError as e:
            return {"provider": "elevenlabs", "status": "failed", "error": f"generated but upload failed: {e}"}

        return {"provider": "elevenlabs", "status": "ready", "media_url": url}

    def generate_image(
        self,
        prompt: str,
        model_id: str = DEFAULT_IMAGE_MODEL,
        aspect_ratio: str = "1:1",
        poll_timeout_seconds: float = 90.0,
    ) -> Dict[str, Any]:
        if not self.is_configured():
            return {"provider": "elevenlabs", "status": "not_configured", "error": "ELEVENLABS_API_KEY is not set"}

        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(
                    "https://api.elevenlabs.io/v1/flows/image",
                    headers=self._headers(),
                    json={"model_id": model_id, "prompt": prompt, "aspect_ratio": aspect_ratio},
                )
        except httpx.HTTPError as e:
            return {"provider": "elevenlabs", "status": "failed", "error": str(e)}

        if r.status_code != 200:
            return {"provider": "elevenlabs", "status": "failed", "error": f"{r.status_code}: {r.text[:400]}"}

        generation_id = r.json()["id"]
        return self._poll_flow("image", generation_id, poll_timeout_seconds)

    def generate_video(
        self,
        prompt: str,
        model_id: str = DEFAULT_VIDEO_MODEL,
        aspect_ratio: str = "16:9",
        duration_secs: int = 8,
        poll_timeout_seconds: float = 240.0,
    ) -> Dict[str, Any]:
        if not self.is_configured():
            return {"provider": "elevenlabs", "status": "not_configured", "error": "ELEVENLABS_API_KEY is not set"}

        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(
                    "https://api.elevenlabs.io/v1/flows/video",
                    headers=self._headers(),
                    json={"model_id": model_id, "prompt": prompt, "aspect_ratio": aspect_ratio, "duration_secs": duration_secs},
                )
        except httpx.HTTPError as e:
            return {"provider": "elevenlabs", "status": "failed", "error": str(e)}

        if r.status_code != 200:
            return {"provider": "elevenlabs", "status": "failed", "error": f"{r.status_code}: {r.text[:400]}"}

        generation_id = r.json()["id"]
        # Video generation is much slower than images — poll with a longer timeout.
        return self._poll_flow("video", generation_id, poll_timeout_seconds, poll_interval=5.0)

    def _poll_flow(self, kind: str, generation_id: str, timeout_seconds: float, poll_interval: float = 2.0) -> Dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds
        last: Optional[Dict[str, Any]] = None
        try:
            with httpx.Client(timeout=30.0) as client:
                while time.monotonic() < deadline:
                    r = client.get(f"https://api.elevenlabs.io/v1/flows/{kind}/{generation_id}", headers=self._headers())
                    if r.status_code != 200:
                        return {"provider": "elevenlabs", "status": "failed", "error": f"{r.status_code}: {r.text[:400]}"}
                    last = r.json()
                    if last["status"] == "completed":
                        break
                    if last["status"] == "failed":
                        return {"provider": "elevenlabs", "status": "failed", "error": last.get("error", "generation failed")}
                    time.sleep(poll_interval)
        except httpx.HTTPError as e:
            return {"provider": "elevenlabs", "status": "failed", "error": str(e)}

        if not last or last.get("status") != "completed":
            return {"provider": "elevenlabs", "status": "failed", "error": f"Timed out waiting for {kind} generation"}
        assert last is not None

        try:
            with httpx.Client(timeout=60.0) as client:
                media = client.get(last["content_url"])
                media.raise_for_status()
            ext = "png" if "image" in last.get("content_mime_type", "") else "mp4"
            ensure_bucket("materials")
            url = upload_file("materials", f"media/{uuid.uuid4()}.{ext}", media.content, last.get("content_mime_type", "application/octet-stream"))
        except (httpx.HTTPError, SupabaseError) as e:
            return {"provider": "elevenlabs", "status": "failed", "error": f"generated but could not persist: {e}"}

        return {"provider": "elevenlabs", "status": "ready", "media_url": url}
