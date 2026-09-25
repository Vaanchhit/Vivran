"""Vector Embedding Service (§21).

PERMANENTLY GEMINI. ``source_chunks.embedding`` holds 768-dimension vectors from
``gemini-embedding-001``. A vector from any other model is not comparable to
those — the distance between them is noise, so swapping providers would not make
retrieval cheaper, it would make it wrong. Changing the embedding model means
re-embedding every chunk of every material every teacher has ever uploaded, in
one migration, or not at all. This is the one part of the AI stack with no
provider seam, and that is on purpose (see app/ai/gemini_client.py).
"""
from functools import lru_cache
from typing import List, Sequence, Tuple

from app.ai.gemini_client import BatchEmbedResult
from app.ai.gemini_client import embed_text as _embed_text
from app.ai.gemini_client import embed_texts_batch as _embed_texts_batch


def generate_embedding(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
    """Generates a real vector embedding for a single text via the Gemini API."""
    return _embed_text(text, task_type=task_type)


def generate_embeddings_batch(
    texts: Sequence[str], task_type: str = "RETRIEVAL_DOCUMENT"
) -> BatchEmbedResult:
    """Embeds many texts in batches of up to 100, keeping partial successes.

    The ingestion path (app/services/ingestion_pipeline.py) is the caller that
    matters: a 300-page PDF is ~900 chunks, which was ~900 sequential HTTP calls
    and is now ~9.
    """
    return _embed_texts_batch(texts, task_type=task_type)


# Query embeddings repeat heavily and the repeats are exact.
#
# Every grounded generation calls search_knowledge_base with a key built from
# the same few fields — ``f"{subject} {' '.join(topics)}"`` — so a teacher
# producing a slide deck, a worksheet, a quiz and a paper for one chapter embeds
# the identical string four times, and does it again on every regeneration and
# every retry. Each one is an HTTP round-trip on the critical path of a request
# they are watching, and a request against the embedding quota.
#
# 256 entries is far more than the working set of a single-digit-user instance
# and costs ~1MB of floats at 768 dimensions. The cache lives for the life of
# the process, which is fine: an embedding of a given string under a given task
# type is deterministic and has no tenancy — it is derived from the query text
# only, never from anything in a workspace — so there is nothing here that could
# leak across teachers. The vectors it guards are compared against chunks that
# ARE scoped, by the match_source_chunks function (migration 0003).
_QUERY_CACHE_SIZE = 256


@lru_cache(maxsize=_QUERY_CACHE_SIZE)
def _cached_query_embedding(text: str, task_type: str) -> Tuple[float, ...]:
    # Stored as a tuple so a caller cannot mutate the cached entry in place.
    return tuple(_embed_text(text, task_type=task_type))


def generate_query_embedding(text: str, task_type: str = "RETRIEVAL_QUERY") -> List[float]:
    """Embeds a search query, reusing the vector when the exact query repeats."""
    return list(_cached_query_embedding(text, task_type))


def query_cache_info():
    """Hits/misses for the query cache, for diagnostics and tests."""
    return _cached_query_embedding.cache_info()


def clear_query_cache() -> None:
    _cached_query_embedding.cache_clear()


# Re-exported so callers that only touch this module can type the result.
__all__ = [
    "BatchEmbedResult",
    "clear_query_cache",
    "generate_embedding",
    "generate_embeddings_batch",
    "generate_query_embedding",
    "query_cache_info",
]
