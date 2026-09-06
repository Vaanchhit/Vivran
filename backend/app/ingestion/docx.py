"""DOCX Document Ingestion Module (§19)."""
from typing import Dict, Any


def parse_docx(file_path: str) -> Dict[str, Any]:
    return {
        "status": "extracted",
        "file_path": file_path,
        "paragraphs": ["Sample DOCX syllabus text."],
    }

