"""DOCX Document Ingestion Module (§19)."""
from io import BytesIO
from typing import Any, Dict

from docx import Document


def parse_docx(file_bytes: bytes) -> Dict[str, Any]:
    doc = Document(BytesIO(file_bytes))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    return {"status": "extracted", "paragraphs": paragraphs}
