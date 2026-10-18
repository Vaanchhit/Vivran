"""Scoped retrieval over a teacher's own materials (§20), hybrid and honest.

Retrieval is strictly scoped by workspace and, optionally, a single material —
enforced inside the Postgres functions (migrations 0003 and 0009), not only in
application code, so a bug here cannot leak another teacher's content.

What one search does:

  1. embeds each query and pulls vector candidates (match_source_chunks)
  2. pulls exact-word candidates (match_source_chunks_lexical, migration 0009),
     which is what finds acronyms, formulas and names that embeddings blur;
     until that migration is applied this step is skipped, nothing breaks
  3. drops vector candidates that are not close enough to be evidence: below an
     absolute floor, or far below the best match for that query
  4. fuses all rankings (reciprocal rank fusion) across queries
  5. when the request names a unit ("Unit 4"), prefers chunks tagged with it
  6. reranks, removes duplicates, caps hits per page, and returns ``limit``

Returning FEWER than ``limit`` — or none — is the point of step 3. Callers
report "grounded on N" from what comes back, so N is the number of passages
that actually support the request.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from app.core.config import settings
from app.core.logging import logger
from app.retrieval.embeddings import generate_query_embedding
from app.retrieval.query import to_tsquery, unit_number
from app.retrieval.reranking import rerank_chunks
from app.services.supabase_service import SupabaseError, rpc

RRF_K = 60
MAX_QUERIES = 4

# Flips off the first time the text-search function is found missing, so an
# un-migrated database costs one logged line, not one failed call per search.
_lexical_available = True


def _row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "chunk_id": row["chunk_id"],
        "content": row["content"],
        "source_material": row.get("source_material"),
        "page_number": row.get("page_number"),
        "chapter": row.get("chapter"),
        "topic": row.get("topic"),
        "score": row.get("score"),
    }


def _dense(query: str, workspace_id: str, material_id: Optional[str], n: int) -> List[Dict[str, Any]]:
    rows = rpc(
        "match_source_chunks",
        {
            "query_embedding": generate_query_embedding(query),
            "match_workspace_id": workspace_id,
            "match_count": n,
            "match_material_id": material_id,
        },
    )
    return [_row(r) for r in rows]


def _lexical(query: str, workspace_id: str, material_id: Optional[str], n: int) -> List[Dict[str, Any]]:
    global _lexical_available
    tsq = to_tsquery(query)
    if not _lexical_available or not tsq:
        return []
    try:
        rows = rpc(
            "match_source_chunks_lexical",
            {"query_tsquery": tsq, "match_workspace_id": workspace_id, "match_count": n, "match_material_id": material_id},
        )
    except SupabaseError as e:
        text = str(e).lower()
        if "could not find the function" in text or "does not exist" in text or "pgrst202" in text or "(404)" in text:
            _lexical_available = False
            logger.warning("Text search unavailable (migration 0009 not applied?); using vector search only: %s", e)
        else:
            logger.warning("Text search failed, continuing with vector search only: %s", e)
        return []
    return [_row(r) | {"score": None} for r in rows]


def close_enough(dense_rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Vector hits that are evidence: above the floor AND near this query's best."""
    scored = [r for r in dense_rows if r.get("score") is not None]
    if not scored:
        return []
    best = max(r["score"] for r in scored)
    cut = max(settings.retrieval_min_score, best * settings.retrieval_relative_cut)
    return [r for r in scored if r["score"] >= cut]


def _prefer_unit(chunks: List[Dict[str, Any]], unit: int) -> List[Dict[str, Any]]:
    """Chunks tagged with the named unit first; only those, when there are enough."""
    tagged = [c for c in chunks if c.get("chapter") and unit_number(c["chapter"]) == unit]
    if len(tagged) >= 3:
        return tagged
    return tagged + [c for c in chunks if c not in tagged]


def search_many(
    queries: Sequence[str],
    workspace_id: str,
    material_id: Optional[str] = None,
    limit: int = 6,
) -> List[Dict[str, Any]]:
    """Several searches (one per topic, say) fused into one ranked, de-duplicated list."""
    qs = []
    for q in queries:
        q = (q or "").strip()
        if q and q not in qs:
            qs.append(q)
    qs = qs[:MAX_QUERIES]
    if not qs:
        return []

    n = settings.retrieval_candidates
    fused: Dict[str, Dict[str, Any]] = {}

    def add(rows: Sequence[Dict[str, Any]]) -> None:
        for rank, r in enumerate(rows):
            cid = str(r["chunk_id"])
            slot = fused.setdefault(cid, {**r, "rrf": 0.0})
            slot["rrf"] += 1.0 / (RRF_K + rank + 1)
            if r.get("score") is not None and (slot.get("score") is None or r["score"] > slot["score"]):
                slot["score"] = r["score"]

    for q in qs:
        add(close_enough(_dense(q, workspace_id, material_id, n)))
        # Exact-word hits are admitted only near the top: they carry no
        # similarity score to hold them to, so rank is their credential.
        add(_lexical(q, workspace_id, material_id, n)[:3])

    candidates = list(fused.values())
    if not candidates:
        return []
    request_text = " ".join(qs)
    unit = unit_number(request_text)
    ranked = rerank_chunks(request_text, candidates)
    if unit is not None:
        ranked = _prefer_unit(ranked, unit)
    return ranked[:limit]


def search_knowledge_base(
    query: str,
    workspace_id: str,
    material_id: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Scoped, hybrid retrieval for one request. May return fewer than ``limit``, or none.

    Returns [] if no materials are indexed or Supabase isn't configured —
    callers treat that as "no grounding available", not an error.
    """
    return search_many([query], workspace_id, material_id=material_id, limit=limit)
