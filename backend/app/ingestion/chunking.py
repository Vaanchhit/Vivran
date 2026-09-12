"""Text Chunking Module (§19) for RAG embedding pipeline."""
from typing import List, Dict, Any


def chunk_text(raw_text: str, chunk_size: int = 400, overlap: int = 50) -> List[Dict[str, Any]]:
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


def chunk_units(units: List[Dict[str, Any]], chunk_size: int = 400, overlap: int = 50) -> List[Dict[str, Any]]:
    """Chunks a list of {"text", "page_number"?, "timestamp_start"?, "timestamp_end"?}
    units (pages, slides, transcript segments), preserving each unit's source
    metadata on its resulting chunk(s). Splits any unit longer than
    `chunk_size` words into overlapping sub-chunks.
    """
    result: List[Dict[str, Any]] = []
    for unit in units:
        text = (unit.get("text") or "").strip()
        if not text:
            continue
        meta = {k: v for k, v in unit.items() if k != "text"}
        word_count = len(text.split())
        if word_count <= chunk_size:
            result.append({"content": text, **meta})
        else:
            for sub in chunk_text(text, chunk_size=chunk_size, overlap=overlap):
                result.append({"content": sub["content"], **meta})
    return result

