"""YouTube Ingestion Module (§19).

Retrieves the public transcript for a video, preserving timestamps.
"""
import re
from typing import Any, Dict
from urllib.parse import parse_qs, urlparse

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled


class YouTubeIngestionError(RuntimeError):
    pass


def _extract_video_id(video_url: str) -> str:
    parsed = urlparse(video_url)
    if parsed.hostname in {"youtu.be"}:
        return parsed.path.lstrip("/")
    if parsed.hostname and "youtube.com" in parsed.hostname:
        qs = parse_qs(parsed.query)
        if "v" in qs:
            return qs["v"][0]
        match = re.search(r"/(embed|shorts)/([^/?]+)", parsed.path)
        if match:
            return match.group(2)
    raise YouTubeIngestionError(f"Could not extract a video id from '{video_url}'")


def _format_timestamp(seconds: float) -> str:
    total = int(seconds)
    return f"{total // 60:02d}:{total % 60:02d}"


def parse_youtube(video_url: str) -> Dict[str, Any]:
    video_id = _extract_video_id(video_url)
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id).to_raw_data()
    except (TranscriptsDisabled, NoTranscriptFound) as e:
        raise YouTubeIngestionError(f"No transcript available for this video: {e}") from e

    segments = [
        {
            "timestamp_start": _format_timestamp(seg["start"]),
            "timestamp_end": _format_timestamp(seg["start"] + seg.get("duration", 0)),
            "text": seg["text"],
        }
        for seg in transcript
    ]
    return {"status": "extracted", "video_id": video_id, "segments": segments}
