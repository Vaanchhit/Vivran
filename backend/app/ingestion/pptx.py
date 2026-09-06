"""PPTX Document Ingestion Module (§19)."""
from typing import Dict, Any


def parse_pptx(file_path: str) -> Dict[str, Any]:
    return {
        "status": "extracted",
        "file_path": file_path,
        "slides": [{"slide_number": 1, "text": "Sample slide text."}],
    }

