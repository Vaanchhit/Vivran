"""Vector Embedding Service (§21) — Gemini text-embedding-004."""
from typing import List

from app.ai.gemini_client import embed_text as _embed_text


def generate_embedding(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
    """Generates a real vector embedding for a text chunk via the Gemini API."""
    return _embed_text(text, task_type=task_type)
