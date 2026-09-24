"""ElevenLabs Service Abstraction (§29, §31) for narration audio, image, and video.

Image/video generation uses ElevenLabs' async Flows API (POST to create a
job, poll GET until completed) and requires an ElevenLabs Pro plan or above
for API access — a free-tier key will get a clear 401/403 from ElevenLabs,
surfaced as-is rather than silently failing.
"""
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.core.errors import FailureClass, classify_upstream_status
from app.core.logging import logger
from app.media.visual_guardrails import build_guarded_prompt
from app.services.supabase_service import SupabaseError, ensure_bucket, upload_file

DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # ElevenLabs public "Rachel" voice
DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image"
DEFAULT_VIDEO_MODEL = "veo-3.1-fast-generate-001"


def _failed(
    status_code: Optional[int],
    body: str,
    *,
    context: str,
    failure: Optional[FailureClass] = None,
) -> Dict[str, Any]:
    """Uniform failure envelope: raw detail for the log, classified failure for
    the API layer to translate (app/core/errors.py). Nothing here is ever shown
    to a teacher verbatim. `failure` overrides classification where the HTTP
    status alone can't say what happened (an async job that reports failed)."""
    failure = failure or classify_upstream_status(status_code, body)
    logger.warning("ElevenLabs %s failed (status=%s, class=%s): %s", context, status_code, failure.value, body[:400])
    return {"provider": "elevenlabs", "status": "failed", "error": body[:400], "failure": failure}


class ElevenLabsService:
    def __init__(self):
        self.api_key = settings.elevenlabs_api_key

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {"xi-api-key": self.api_key, "Content-Type": "application/json"}

    def generate_narration_audio(self, script: str, voice_id: str = DEFAULT_VOICE_ID) -> Dict[str, Any]:
        if not self.is_configured():
            return self._not_configured()

        try:
            with httpx.Client(timeout=60.0) as client:
                r = client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                    headers={"xi-api-key": self.api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                    json={"text": script, "model_id": "eleven_multilingual_v2"},
                )
        except httpx.HTTPError as e:
            return _failed(None, str(e), context="narration")

        if r.status_code != 200:
            return _failed(r.status_code, r.text, context="narration")

        try:
            ensure_bucket("materials")
            url = upload_file("materials", f"media/{uuid.uuid4()}.mp3", r.content, "audio/mpeg")
        except SupabaseError as e:
            return self._persist_failed("narration", e)

        return {"provider": "elevenlabs", "status": "ready", "media_url": url}

    def generate_image(
        self,
        prompt: str,
        model_id: str = DEFAULT_IMAGE_MODEL,
        aspect_ratio: str = "1:1",
        poll_timeout_seconds: float = 90.0,
        grounding: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured():
            return self._not_configured()

        # Same invisible house guardrails as video — an image generated for a
        # slide deck sits next to video stills in the same pack, so drifting
        # style/legibility here is just as visible. See visual_guardrails.py.
        guarded_prompt = build_guarded_prompt(prompt, grounding=grounding, motion=False)

        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(
                    "https://api.elevenlabs.io/v1/flows/image",
                    headers=self._headers(),
                    json={"model_id": model_id, "prompt": guarded_prompt, "aspect_ratio": aspect_ratio},
                )
        except httpx.HTTPError as e:
            return _failed(None, str(e), context="image")

        if r.status_code != 200:
            return _failed(r.status_code, r.text, context="image")

        generation_id = r.json()["id"]
        return self._poll_flow("image", generation_id, poll_timeout_seconds)

    def generate_video(
        self,
        prompt: str,
        model_id: str = DEFAULT_VIDEO_MODEL,
        aspect_ratio: str = "16:9",
        duration_secs: int = 8,
        poll_timeout_seconds: float = 240.0,
        grounding: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured():
            return self._not_configured()

        # The teacher's prompt is never sent raw. Palette/contrast, the
        # avoid-rendered-text rule and the anti-hallucination constraints are
        # forced on server-side here, are not request parameters, and are not
        # echoed back in the response — they are invisible by design.
        # Tune them in app/media/visual_guardrails.py.
        guarded_prompt = build_guarded_prompt(prompt, grounding=grounding, motion=True)

        try:
            with httpx.Client(timeout=30.0) as client:
                r = client.post(
                    "https://api.elevenlabs.io/v1/flows/video",
                    headers=self._headers(),
                    json={"model_id": model_id, "prompt": guarded_prompt, "aspect_ratio": aspect_ratio, "duration_secs": duration_secs},
                )
        except httpx.HTTPError as e:
            return _failed(None, str(e), context="video")

        if r.status_code != 200:
            return _failed(r.status_code, r.text, context="video")

        generation_id = r.json()["id"]
        # Video generation is much slower than images — poll with a longer timeout.
        return self._poll_flow("video", generation_id, poll_timeout_seconds, poll_interval=5.0)

    @staticmethod
    def _not_configured() -> Dict[str, Any]:
        return {
            "provider": "elevenlabs",
            "status": "not_configured",
            "error": "ELEVENLABS_API_KEY is not set",
            "failure": FailureClass.NOT_CONFIGURED,
        }

    @staticmethod
    def _persist_failed(context: str, exc: Exception) -> Dict[str, Any]:
        """Generation succeeded but Supabase storage didn't. Our bug, not the
        provider's and not the teacher's — classified as a generic upstream
        error so it never reads as "your free tier is over"."""
        logger.error("ElevenLabs %s generated but could not be persisted: %s", context, exc)
        return {
            "provider": "elevenlabs",
            "status": "failed",
            "error": f"generated but could not persist: {exc}",
            "failure": FailureClass.UPSTREAM_ERROR,
        }

    def _poll_flow(self, kind: str, generation_id: str, timeout_seconds: float, poll_interval: float = 2.0) -> Dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds
        last: Optional[Dict[str, Any]] = None
        try:
            with httpx.Client(timeout=30.0) as client:
                while time.monotonic() < deadline:
                    r = client.get(f"https://api.elevenlabs.io/v1/flows/{kind}/{generation_id}", headers=self._headers())
                    if r.status_code != 200:
                        return _failed(r.status_code, r.text, context=f"{kind} poll")
                    last = r.json()
                    if last["status"] == "completed":
                        break
                    if last["status"] == "failed":
                        # The job ran and came back failed — a content refusal or
                        # a model-side error, not a capacity blip. Don't tell the
                        # teacher to "try again in a moment" for a deterministic
                        # refusal.
                        return _failed(
                            None,
                            str(last.get("error", "generation failed")),
                            context=f"{kind} job",
                            failure=FailureClass.UPSTREAM_ERROR,
                        )
                    time.sleep(poll_interval)
        except httpx.HTTPError as e:
            return _failed(None, str(e), context=f"{kind} poll")

        if not last or last.get("status") != "completed":
            # A timeout is a capacity symptom, not a quota one — classify it as
            # busy so the teacher is told to retry, not to email the admin.
            return _failed(None, f"Timed out waiting for {kind} generation", context=f"{kind} timeout")
        assert last is not None

        try:
            with httpx.Client(timeout=60.0) as client:
                media = client.get(last["content_url"])
                media.raise_for_status()
            ext = "png" if "image" in last.get("content_mime_type", "") else "mp4"
            ensure_bucket("materials")
            url = upload_file("materials", f"media/{uuid.uuid4()}.{ext}", media.content, last.get("content_mime_type", "application/octet-stream"))
        except (httpx.HTTPError, SupabaseError) as e:
            return self._persist_failed(kind, e)

        return {"provider": "elevenlabs", "status": "ready", "media_url": url}
