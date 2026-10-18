"""Reranking and de-duplication of fused search candidates.

Deterministic and free: the vector and text searches already agree on a
shortlist; this decides the order it is used in, and removes what would waste
the prompt (the same passage twice, six hits from one page).
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.retrieval.query import terms

_SPACE = re.compile(r"\s+")


def signature(text: str) -> str:
    """A key that two copies of the same passage share (re-uploaded files, repeated headers)."""
    return _SPACE.sub(" ", (text or "").lower()).strip()[:240]


def rerank_chunks(
    query: str,
    chunks: List[Dict[str, Any]],
    *,
    limit: Optional[int] = None,
    per_page_cap: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Order candidates by fused rank, vector score and exact-word overlap; dedupe; cap per page.

    Weights: fused rank 0.6 (it already blends both searches), exact overlap
    with the request's words 0.3, vector score 0.1. Overlap earns its weight
    on acronyms, formulas and names, where embeddings are weakest.
    """
    cap = settings.retrieval_per_page_cap if per_page_cap is None else per_page_cap
    wanted = set(terms(query))
    top_rrf = max((c.get("rrf", 0.0) for c in chunks), default=0.0) or 1.0

    def final(c: Dict[str, Any]) -> float:
        overlap = len(wanted & set(terms(c.get("content", "")))) / len(wanted) if wanted else 0.0
        dense = c.get("score") or 0.0
        return 0.6 * (c.get("rrf", 0.0) / top_rrf) + 0.3 * overlap + 0.1 * dense

    ordered = sorted(chunks, key=final, reverse=True)
    seen: set[str] = set()
    per_page: Dict[tuple, int] = {}
    out: List[Dict[str, Any]] = []
    for c in ordered:
        sig = signature(c.get("content", ""))
        if sig in seen:
            continue
        page_key = (c.get("source_material"), c.get("page_number"))
        if cap and c.get("page_number") is not None and per_page.get(page_key, 0) >= cap:
            continue
        seen.add(sig)
        per_page[page_key] = per_page.get(page_key, 0) + 1
        out.append(c)
        if limit and len(out) >= limit:
            break
    return out
