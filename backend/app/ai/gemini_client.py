"""Thin client for the Gemini API (generateContent + embedContent).

Every AI tier in app/ai/*.py routes through here. Raises GeminiError on any
failure (missing key, network error, non-2xx response) so callers can decide
how to degrade — never fabricate a response here.

GeminiError carries a machine-readable `failure` (app/core/errors.FailureClass)
alongside the human string, so the API layer can pick the right user-facing
message without regex-ing an exception message.

Transient failures are retried here rather than at each call site: a single
Google-side 503 used to be enough to drop the whole request onto its degraded
path (e.g. prompt_compiler's keyword heuristic), which silently made the
teacher's result worse for a blip that clears in under a second.

Outbound calls are also PACED here (app/ai/rate_limiter.py) so a burst never
becomes a 429 in the first place. Retrying and pacing solve different halves of
the same problem: pacing stops us exceeding the per-minute window, retrying
handles Google being unwell independently of anything we did.

EMBEDDINGS ARE PERMANENTLY ON GEMINI. `source_chunks.embedding` holds 768-dim
vectors produced by gemini-embedding-001. Vectors from a different model are not
comparable to those — cosine distance between them is noise, so a "cheaper
embedding provider" would not degrade retrieval, it would break it. Switching
means re-embedding every chunk of every material every teacher has uploaded, as
one migration, or not at all. Do not make embeddings part of a provider-failover
story; the generateContent path is the only place that seam belongs.
"""
from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Sequence

import httpx

from app.ai.rate_limiter import TokenBucket
from app.ai.usage import record, usage_from_gemini
from app.core.config import settings
from app.core.errors import FailureClass, classify_upstream_status
from app.core.logging import logger

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# --- Outbound pacing --------------------------------------------------------
# Two buckets because Google meters generateContent and embedContent against
# separate quotas: a 900-chunk upload must not be able to consume the allowance
# a teacher's slide deck is waiting on. Process-wide and thread-safe — the job
# pool (app/services/jobs.py) and the request path share them.
_generate_bucket = TokenBucket(name="gemini/generateContent", rate_per_minute=settings.gemini_rpm_limit)
_embed_bucket = TokenBucket(name="gemini/embedContent", rate_per_minute=settings.gemini_embed_rpm_limit)


def _pace(bucket: TokenBucket) -> None:
    if settings.gemini_rate_limit_enabled:
        bucket.acquire()

# --- Retry policy -----------------------------------------------------------
# These calls already take 10-40s, so the retry budget is deliberately small:
# a generous policy would turn a 40s generation into a two-minute hang that the
# teacher reads as "broken" long before it succeeds. Two retries at ~0.8s and
# ~1.6s recover the overwhelmingly common case (a momentary UNAVAILABLE spike)
# for at most ~3.5s of added wall-clock, and give up quickly when Google is
# genuinely down.
_MAX_ATTEMPTS = 3               # 1 initial try + 2 retries
_BACKOFF_BASE_SECONDS = 0.8
_BACKOFF_FACTOR = 2.0
_BACKOFF_JITTER = 0.4           # +/- fraction, spreads concurrent retries out
_RETRY_BUDGET_SECONDS = 3.5     # hard cap on total *added* sleep time

# Only these classes are ever retried. Everything else (400 bad request, 401/403
# auth, a quota cap, invalid JSON from the model, a safety block) is
# deterministic: retrying spends quota to get the identical failure back.
_RETRYABLE = (FailureClass.UPSTREAM_BUSY,)


class GeminiError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        failure: FailureClass = FailureClass.UPSTREAM_ERROR,
        status_code: Optional[int] = None,
        body: str = "",
    ):
        super().__init__(message)
        self.failure = failure
        self.status_code = status_code
        self.body = body


def _require_key() -> str:
    if not settings.gemini_api_key:
        raise GeminiError("GEMINI_API_KEY is not configured", failure=FailureClass.NOT_CONFIGURED)
    return settings.gemini_api_key


def _backoff_delay(attempt: int) -> float:
    """Exponential backoff with symmetric jitter. `attempt` is 1-based."""
    base = _BACKOFF_BASE_SECONDS * (_BACKOFF_FACTOR ** (attempt - 1))
    return base * (1.0 + random.uniform(-_BACKOFF_JITTER, _BACKOFF_JITTER))


def _post_with_retry(
    label: str,
    send: Callable[[], httpx.Response],
    bucket: Optional[TokenBucket] = None,
) -> httpx.Response:
    """Runs `send`, retrying only genuinely transient failures.

    Returns the first 2xx response, or raises GeminiError classified from the
    last failure. `label` names the call for the log line (model or "embedding").

    `bucket` paces each attempt. A retry is a real request against the quota
    window, so it is paced too — otherwise the retry storm that follows an
    outage would be exactly the burst the limiter exists to prevent.
    """
    spent = 0.0
    last: Optional[GeminiError] = None

    for attempt in range(1, _MAX_ATTEMPTS + 1):
        if bucket is not None:
            _pace(bucket)
        try:
            r = send()
        except httpx.HTTPError as e:
            # Connection refused / read timeout / DNS: no status at all, which
            # classify_upstream_status treats as transient.
            last = GeminiError(
                f"Gemini request failed: {e}",
                failure=classify_upstream_status(None),
                status_code=None,
                body=str(e),
            )
        else:
            if r.status_code == 200:
                return r
            failure = classify_upstream_status(r.status_code, r.text)
            logger.warning("Gemini %s returned %s: %s", label, r.status_code, r.text[:500])
            last = GeminiError(
                f"Gemini returned status {r.status_code}: {r.text[:300]}",
                failure=failure,
                status_code=r.status_code,
                body=r.text,
            )

        if last.failure not in _RETRYABLE or attempt == _MAX_ATTEMPTS:
            break

        delay = _backoff_delay(attempt)
        if spent + delay > _RETRY_BUDGET_SECONDS:
            logger.warning(
                "Gemini %s: transient failure on attempt %s/%s but the %.1fs retry budget is "
                "spent — giving up (%s)",
                label, attempt, _MAX_ATTEMPTS, _RETRY_BUDGET_SECONDS, last,
            )
            break

        logger.warning(
            "Gemini %s: transient failure on attempt %s/%s (%s) — retrying in %.2fs",
            label, attempt, _MAX_ATTEMPTS, last.failure.value, delay,
        )
        time.sleep(delay)
        spent += delay

    assert last is not None
    raise last


def generate_text(
    prompt: str,
    system_prompt: str = "",
    model: Optional[str] = None,
    json_mode: bool = False,
    temperature: float = 0.4,
) -> str:
    """Calls Gemini generateContent and returns the text of the first candidate.

    The token counts Google returns alongside the text are reported to the
    enclosing ``usage_scope`` (app/ai/usage.py) rather than to this function's
    caller. That is deliberate: a scope captures EVERY attempt, including the
    retries below and the second and third calls of a validate-and-regenerate
    loop, whereas a return value would only ever describe the attempt that
    happened to succeed — and undercounting is the one thing a cost number must
    not do. It also leaves this signature alone for its many call sites.
    """
    api_key = _require_key()
    model_name = model or settings.cheap_model

    payload: Dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": temperature},
    }
    if system_prompt:
        payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    url = f"{BASE_URL}/models/{model_name}:generateContent"

    def _send() -> httpx.Response:
        with httpx.Client(timeout=60.0) as client:
            return client.post(url, params={"key": api_key}, json=payload)

    r = _post_with_retry(model_name, _send, bucket=_generate_bucket)

    data = r.json()
    # Recorded before the candidate checks below: a response that got filtered
    # still burned input tokens, and a cost report that only counts successes
    # understates the bill in exactly the situation worth knowing about.
    usage = usage_from_gemini(data)
    record(usage)

    candidates = data.get("candidates") or []
    if not candidates:
        # Almost always a safety filter. Deterministic — retrying the identical
        # prompt reproduces it, so this is raised, not retried.
        raise GeminiError(
            f"Gemini returned no candidates (finish reason likely blocked): {data}",
            failure=FailureClass.CONTENT_BLOCKED,
            body=str(data)[:600],
        )

    parts = candidates[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts)
    if not text:
        raise GeminiError("Gemini returned an empty response", failure=FailureClass.CONTENT_BLOCKED)
    return text


def generate_json(
    prompt: str,
    system_prompt: str = "",
    model: Optional[str] = None,
    temperature: float = 0.4,
) -> Dict[str, Any]:
    """Calls Gemini in JSON mode and parses the result. Raises GeminiError on
    a non-JSON response so callers never silently proceed with garbage."""
    raw = generate_text(prompt, system_prompt=system_prompt, model=model, json_mode=True, temperature=temperature)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        # Not retried here: the callers that care (assessments, slides) already
        # run a validate -> feed-the-error-back -> regenerate loop, which is a
        # strictly better recovery than blindly re-sending the same prompt.
        raise GeminiError(
            f"Gemini returned invalid JSON: {e}. Raw: {raw[:300]}",
            failure=FailureClass.UPSTREAM_ERROR,
            body=raw[:600],
        ) from e


def embed_text(text: str, task_type: str = "RETRIEVAL_DOCUMENT") -> List[float]:
    """Embeds a single text using the configured Gemini embedding model.

    Kept alongside `embed_texts_batch` rather than replaced by it: query
    embedding (app/retrieval/search.py) is genuinely one text, on the critical
    path of a request a teacher is waiting on, and wrapping it in a batch of one
    would add a layer for no gain.
    """
    api_key = _require_key()
    url = f"{BASE_URL}/models/{settings.embedding_model}:embedContent"
    payload = {
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
        "outputDimensionality": settings.embedding_dimensions,
    }

    def _send() -> httpx.Response:
        with httpx.Client(timeout=30.0) as client:
            return client.post(url, params={"key": api_key}, json=payload)

    r = _post_with_retry(f"embedding/{settings.embedding_model}", _send, bucket=_embed_bucket)

    values = r.json().get("embedding", {}).get("values")
    if not values:
        raise GeminiError("Gemini embedding response missing values", failure=FailureClass.UPSTREAM_ERROR)
    return values


# Google's documented ceiling for batchEmbedContents. Exceeding it is an error,
# not a truncation, so the split below is a hard requirement rather than tuning.
BATCH_EMBED_MAX = 100


@dataclass
class BatchEmbedResult:
    """Index-aligned embeddings, with the batches that failed named explicitly.

    `embeddings[i]` is None exactly when the batch containing text i failed.
    """

    embeddings: List[Optional[List[float]]]
    failures: List["BatchEmbedFailure"]

    @property
    def succeeded(self) -> int:
        return sum(1 for e in self.embeddings if e is not None)

    @property
    def failed(self) -> int:
        return sum(1 for e in self.embeddings if e is None)

    @property
    def all_failed(self) -> bool:
        return bool(self.embeddings) and self.succeeded == 0


@dataclass
class BatchEmbedFailure:
    start: int          # index of the first text in the failed batch
    count: int          # how many texts were in it
    error: GeminiError


def embed_texts_batch(
    texts: Sequence[str],
    task_type: str = "RETRIEVAL_DOCUMENT",
    batch_size: int = BATCH_EMBED_MAX,
) -> BatchEmbedResult:
    """Embeds many texts via batchEmbedContents, keeping whatever succeeds.

    WHY THIS EXISTS
        Ingestion used to call `embed_text` once per chunk, sequentially. A
        300-page PDF is roughly 900 chunks, so that was 900 HTTP round-trips —
        four to six minutes holding one of only two job workers — and it was
        all-or-nothing: a single transient failure at chunk 847 raised, and the
        846 embeddings already paid for were thrown away. The same PDF is 9
        calls here.

    PARTIAL SUCCESS IS THE POINT
        Each batch is independent. A batch that fails costs us that batch and
        nothing else; its indices come back as None and are named in
        `failures`, and the caller decides what a partially-embedded material
        means. Raising on the first failure would recreate exactly the
        behaviour this replaces.
    """
    items = list(texts)
    if not items:
        return BatchEmbedResult(embeddings=[], failures=[])

    api_key = _require_key()
    url = f"{BASE_URL}/models/{settings.embedding_model}:batchEmbedContents"
    size = max(1, min(int(batch_size), BATCH_EMBED_MAX))

    embeddings: List[Optional[List[float]]] = [None] * len(items)
    failures: List[BatchEmbedFailure] = []

    for start in range(0, len(items), size):
        window = items[start : start + size]
        payload = {
            "requests": [
                {
                    # batchEmbedContents requires the model on every sub-request
                    # even though it is already in the URL.
                    "model": f"models/{settings.embedding_model}",
                    "content": {"parts": [{"text": text}]},
                    "taskType": task_type,
                    "outputDimensionality": settings.embedding_dimensions,
                }
                for text in window
            ]
        }

        def _send(payload: Dict[str, Any] = payload) -> httpx.Response:
            # A batch of 100 is a much bigger body than a single embed, so the
            # timeout is correspondingly larger.
            with httpx.Client(timeout=120.0) as client:
                return client.post(url, params={"key": api_key}, json=payload)

        label = f"batch-embedding/{settings.embedding_model}[{start}:{start + len(window)}]"
        try:
            r = _post_with_retry(label, _send, bucket=_embed_bucket)
            values = [e.get("values") for e in (r.json().get("embeddings") or [])]
            if len(values) != len(window) or any(not v for v in values):
                raise GeminiError(
                    f"Gemini batch embedding returned {len(values)} usable vectors for "
                    f"{len(window)} inputs",
                    failure=FailureClass.UPSTREAM_ERROR,
                )
        except GeminiError as e:
            logger.warning(
                "Embedding batch %s-%s of %s failed (%s) — keeping the other batches: %s",
                start, start + len(window), len(items), e.failure.value, e,
            )
            failures.append(BatchEmbedFailure(start=start, count=len(window), error=e))
            continue

        for offset, vector in enumerate(values):
            embeddings[start + offset] = vector

    return BatchEmbedResult(embeddings=embeddings, failures=failures)
