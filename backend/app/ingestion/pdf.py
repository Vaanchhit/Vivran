"""PDF Document Ingestion Module (§19).

Upload -> Supabase Storage -> extract text -> chunk -> embed -> pgvector -> READY
"""
from io import BytesIO
from typing import Any, Dict

from pypdf import PdfReader


def parse_pdf(file_bytes: bytes) -> Dict[str, Any]:
    """Extracts text per page from a PDF file's raw bytes."""
    reader = PdfReader(BytesIO(file_bytes))
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            pages.append({"page_number": i, "text": text})
    return {"status": "extracted", "pages": pages}
