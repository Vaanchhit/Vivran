"""DOCX Document Ingestion Module (§19)."""
from io import BytesIO
from typing import Any, Dict, List

from docx import Document


def parse_docx(file_bytes: bytes) -> Dict[str, Any]:
    """Paragraphs, and the document split at its headings.

    ``sections`` is [{"heading", "text"}]: Word's own Heading styles are the
    most reliable chapter markers there are, and they are lost once everything
    is flattened to one string.
    """
    doc = Document(BytesIO(file_bytes))
    paragraphs: List[str] = []
    sections: List[Dict[str, str]] = []
    heading = ""
    body: List[str] = []

    def flush() -> None:
        text = "\n".join(body).strip()
        if text:
            sections.append({"heading": heading, "text": text})
        body.clear()

    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
        paragraphs.append(text)
        style = (p.style.name or "").lower() if p.style is not None else ""
        if style.startswith("heading") or style == "title":
            flush()
            heading = text
        else:
            body.append(text)
    flush()
    return {"status": "extracted", "paragraphs": paragraphs, "sections": sections}
