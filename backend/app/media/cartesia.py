"""Cartesia Service Abstraction (§31) for transcription and speech."""
from typing import Dict, Any
from app.core.config import settings


class CartesiaService:
    def __init__(self):
        self.api_key = settings.cartesia_api_key

    def transcribe_audio(self, audio_url_or_path: str) -> Dict[str, Any]:
        return {
            "provider": "cartesia",
            "status": "completed",
            "transcript": "Sample transcript generated via Cartesia service.",
        }

