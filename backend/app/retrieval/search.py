"""Scoped Semantic Search Service (§20) using pgvector.

Retrieval is strictly scoped by workspace and, optionally, a single material —
enforced in the `match_source_chunks` Postgres function (migration 0003), not
just in application code, so a bug here can't leak another teacher's content.
"""
from typing import Any, Dict, List, Optional

from app.retrieval.embeddings import generate_query_embedding
from app.services.supabase_service import rpc


def search_knowledge_base(
    query: str,
    workspace_id: str,
    material_id: Optional[str] = None,
    limit: int = 5,
) -> List[Dict[str, Any]]:
    """Performs scoped vector retrieval over teacher source chunks.

    Returns [] if no materials are indexed yet or Supabase isn't configured —
    callers should treat an empty result as "no grounding available", not an
    error.
    """
    # Cached: the same query string arrives repeatedly (every artifact in one
    # classroom pack embeds the identical "{subject} {topics}" key), and this is
    # a round-trip on the critical path of a request a teacher is watching. See
    # app/retrieval/embeddings.py for why the cache is safe across tenants.
    query_embedding = generate_query_embedding(query)
    rows = rpc(
        "match_source_chunks",
        {
            "query_embedding": query_embedding,
            "match_workspace_id": workspace_id,
            "match_count": limit,
            "match_material_id": material_id,
        },
    )
    return [
        {
            "chunk_id": row["chunk_id"],
            "content": row["content"],
            "source_material": row.get("source_material"),
            "page_number": row.get("page_number"),
            "chapter": row.get("chapter"),
            "score": row.get("score"),
        }
        for row in rows
    ]
