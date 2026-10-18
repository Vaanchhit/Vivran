"""From retrieved chunks to prompt text: pick the useful part, tag it, keep it cheap.

Every generator used to cut each chunk to its first 500-600 characters. A chunk
is up to ~400 words, so that threw away most of what had been retrieved and
kept whichever sentences happened to open the page. Here each chunk contributes
the sentences that best match the request, within a character budget shared
across all the chunks, so the prompt is the same size and carries the evidence.
No model is involved: it is sentence scoring.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Sequence, Tuple

from app.core.config import settings
from app.retrieval.query import terms

_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")


def best_excerpt(text: str, query_terms: Sequence[str], max_chars: int) -> str:
    """The most relevant stretch of ``text`` that fits ``max_chars``.

    Sentences are scored by how many query words they contain; the best one is
    grown outwards (next sentence, then previous) until the budget is used, and
    the result keeps the original order. A text that already fits is returned
    whole.
    """
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    sentences = [s.strip() for s in _SENTENCE.split(text) if s.strip()]
    if not sentences:
        return text[:max_chars]
    wanted = set(query_terms)
    scores = [len(wanted & set(terms(s, 3))) for s in sentences]
    best = max(range(len(sentences)), key=lambda i: (scores[i], -i))
    lo = hi = best
    used = len(sentences[best])
    if used > max_chars:
        return sentences[best][:max_chars].rsplit(" ", 1)[0]
    while True:
        # Prefer the neighbour that scores higher; ties extend forwards.
        after = scores[hi + 1] if hi + 1 < len(sentences) else -1
        before = scores[lo - 1] if lo > 0 else -1
        if after < 0 and before < 0:
            break
        take_after = after >= before
        nxt = sentences[hi + 1] if take_after else sentences[lo - 1]
        if used + 1 + len(nxt) > max_chars:
            break
        used += 1 + len(nxt)
        if take_after:
            hi += 1
        else:
            lo -= 1
    return " ".join(sentences[lo : hi + 1])


def label_for(chunk: Dict[str, Any]) -> str:
    bits = [chunk.get("source_material") or "source"]
    if chunk.get("chapter"):
        bits.append(str(chunk["chapter"]))
    if chunk.get("page_number"):
        bits.append(f"p.{chunk['page_number']}")
    return " · ".join(bits)


def format_sources(
    chunks: Sequence[Dict[str, Any]],
    query: str,
    *,
    total_chars: int | None = None,
    min_each: int = 350,
    max_each: int = 1400,
) -> List[str]:
    """Tagged prompt lines ``[S1] (Book · Unit 4 · p.12) excerpt``, one per chunk.

    The budget is shared: few chunks get long excerpts, many get short ones,
    so adding sources never silently grows the prompt.
    """
    if not chunks:
        return []
    budget = total_chars if total_chars is not None else settings.retrieval_prompt_chars
    each = max(min_each, min(max_each, budget // len(chunks)))
    q_terms = terms(query)
    return [
        f"[S{i}] ({label_for(c)}) {best_excerpt(c.get('content', ''), q_terms, each)}"
        for i, c in enumerate(chunks, start=1)
    ]


def sources_payload(chunks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """What the UI lists under a result: where each source came from, and a glimpse."""
    return [
        {
            "chunk_id": c["chunk_id"],
            "source_material": c.get("source_material"),
            "page_number": c.get("page_number"),
            "chapter": c.get("chapter"),
            "excerpt": (c.get("content") or "")[:200],
        }
        for c in chunks
    ]


def tag_map(chunks: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    return {f"S{i}": c for i, c in enumerate(chunks, start=1)}


def resolve_tags(tags: Sequence[Any] | None, mapping: Dict[str, Dict[str, Any]]) -> Tuple[List[str], List[str]]:
    """(chunk ids for the tags that exist, tags the model invented).

    The invented ones are returned, not dropped: the rate at which a model
    cites sources it was never given is the number worth watching.
    """
    real: List[str] = []
    invented: List[str] = []
    for t in tags or []:
        t = str(t).strip().upper()
        if t in mapping:
            cid = str(mapping[t]["chunk_id"])
            if cid not in real:
                real.append(cid)
        elif t:
            invented.append(t)
    return real, invented


def support_level(claim: str, cited_chunks: Sequence[Dict[str, Any]]) -> str:
    """How much of a claim's content words appear in the sources it cites.

    "none" with no citation, otherwise "high", "partial" or "low". It cannot
    prove an answer true; it catches the case that matters most, a confident
    answer whose cited page never mentions what it says.
    """
    if not cited_chunks:
        return "none"
    words = terms(claim, 4)
    if len(words) < 2:
        return "high"
    haystack = " ".join((c.get("content") or "").lower() for c in cited_chunks)
    found = sum(1 for w in words if w in haystack)
    share = found / len(words)
    return "high" if share >= 0.6 else "partial" if share >= 0.3 else "low"
