"""Text Chunking Module (§19) for RAG embedding pipeline."""
from typing import List, Dict, Any


def chunk_text(raw_text: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict[str, Any]]:
    """Splits document text into overlapping source chunks."""
    words = raw_text.split()
    chunks = []
    start = 0
    chunk_index = 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_str = " ".join(words[start:end])
        chunks.append({
            "chunk_index": chunk_index,
            "content": chunk_str,
        })
        start += (chunk_size - overlap)
        chunk_index += 1
    return chunks

