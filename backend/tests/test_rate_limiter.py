"""The outbound token bucket (app/ai/rate_limiter.py).

Driven by an injected clock rather than real time: these assert the *pacing
arithmetic*, which is the thing that has to be right, and a test that proved it
by sleeping for a minute would be a test nobody runs.
"""
import threading

from app.ai.rate_limiter import TokenBucket


class FakeClock:
    """A monotonic clock that only advances when something sleeps on it."""

    def __init__(self):
        self.now = 1000.0
        self.slept = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def _bucket(**kwargs):
    clock = FakeClock()
    bucket = TokenBucket(
        name="test",
        rate_per_minute=kwargs.pop("rate_per_minute", 18),
        monotonic=clock.monotonic,
        sleep=clock.sleep,
        **kwargs,
    )
    return bucket, clock


def test_an_idle_bucket_lets_a_full_burst_through_without_waiting():
    """The common case — one teacher, a cold box — must not be taxed."""
    bucket, clock = _bucket(rate_per_minute=18)
    for _ in range(18):
        assert bucket.acquire() == 0.0
    assert clock.slept == []


def test_the_call_past_the_burst_is_paced_not_refused():
    """A classroom pack is ~9 calls in ~10s against a 20/min ceiling. The 19th
    call in a cold minute waits for a token instead of becoming a 429."""
    bucket, clock = _bucket(rate_per_minute=18)
    for _ in range(18):
        bucket.acquire()

    waited = bucket.acquire()
    # 18 per minute is one token every 10/3 seconds.
    assert round(waited, 3) == round(60.0 / 18.0, 3)
    assert clock.slept == [waited]


def test_waits_accumulate_so_a_sustained_burst_is_spread_evenly():
    bucket, clock = _bucket(rate_per_minute=60)  # one token/second, exact maths
    for _ in range(60):
        bucket.acquire()

    assert bucket.acquire() == 1.0
    assert bucket.acquire() == 1.0
    assert bucket.acquire() == 1.0
    assert clock.slept == [1.0, 1.0, 1.0]


def test_tokens_refill_over_time():
    bucket, clock = _bucket(rate_per_minute=60)
    for _ in range(60):
        bucket.acquire()
    assert bucket.acquire() == 1.0  # drained

    clock.now += 30.0  # thirty seconds of quiet at one token/second
    assert bucket.available_tokens() == 30.0
    for _ in range(30):
        assert bucket.acquire() == 0.0


def test_refill_never_exceeds_the_burst_capacity():
    """An hour of idling does not buy an hour's worth of burst."""
    bucket, clock = _bucket(rate_per_minute=18)
    clock.now += 3600.0
    assert bucket.available_tokens() == 18.0


def test_the_wait_is_capped_so_a_job_worker_is_never_held_for_minutes():
    """Past the cap we let the call out and accept a possible 429 — an honest
    upstream error beats our own limiter hanging a teacher's generation.

    The clock is frozen here (sleeping does not advance it) to model the case
    that actually produces a long queue: many callers reserving at once, as the
    job pool does.
    """
    slept = []
    bucket = TokenBucket(
        name="test",
        rate_per_minute=60,
        max_wait_seconds=5.0,
        monotonic=lambda: 1000.0,
        sleep=slept.append,
    )
    for _ in range(60):
        bucket.acquire()

    waits = [bucket.acquire() for _ in range(20)]
    # Reservations keep stacking (1s, 2s, 3s ...) but nothing sleeps past the cap.
    assert waits[0] == 1.0
    assert max(waits) == 5.0
    assert max(slept) == 5.0


def test_concurrent_callers_reserve_distinct_slots():
    """jobs.py runs generations on a ThreadPoolExecutor, so two threads hitting
    a drained bucket together must queue one behind the other rather than both
    sleeping the same interval and then both firing."""
    # A real bucket (real clock, no sleeping) so the locking is what is tested.
    bucket = TokenBucket(name="test", rate_per_minute=60, sleep=lambda _s: None)
    for _ in range(60):
        bucket.acquire()

    waits = []
    waits_lock = threading.Lock()

    def worker():
        w = bucket.acquire()
        with waits_lock:
            waits.append(round(w))

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Five threads, one token per second: the reservations must be 1..5 in some
    # order, not five copies of 1.
    assert sorted(waits) == [1, 2, 3, 4, 5]


def test_acquire_never_refuses():
    """The bucket queues; it does not turn a teacher's request into an error."""
    bucket, _clock = _bucket(rate_per_minute=1, max_wait_seconds=0.0)
    for _ in range(50):
        assert bucket.acquire() >= 0.0


# ---------------------------------------------------------------------------
# It is actually wired into the client
# ---------------------------------------------------------------------------


class _Resp:
    status_code = 200
    text = ""

    def json(self):
        return {"candidates": [{"content": {"parts": [{"text": "hi"}]}}]}


class _FakeClient:
    def __call__(self, *a, **k):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, *a, **k):
        return _Resp()


def test_generate_and_embed_are_paced_by_separate_buckets(monkeypatch):
    """Google meters generateContent and embedContent separately, so a
    900-chunk upload must not consume the allowance a teacher's deck needs.

    The limiter is switched off for the suite as a whole (see conftest.py); this
    turns it back on for one call each to prove the wiring exists.
    """
    from app.ai import gemini_client

    acquired: list = []
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "test-key")
    monkeypatch.setattr("app.core.config.settings.gemini_rate_limit_enabled", True)
    monkeypatch.setattr(gemini_client.httpx, "Client", _FakeClient())
    monkeypatch.setattr(gemini_client._generate_bucket, "acquire", lambda *a: acquired.append("generate") or 0.0)
    monkeypatch.setattr(gemini_client._embed_bucket, "acquire", lambda *a: acquired.append("embed") or 0.0)

    gemini_client.generate_text("hi")
    assert acquired == ["generate"]

    monkeypatch.setattr(
        gemini_client.httpx, "Client",
        type("C", (_FakeClient,), {"post": lambda self, *a, **k: type(
            "R", (), {"status_code": 200, "text": "", "json": lambda s: {"embedding": {"values": [0.1]}}}
        )()})(),
    )
    gemini_client.embed_text("hi")
    assert acquired == ["generate", "embed"]


def test_nothing_is_paced_when_the_limiter_is_switched_off(monkeypatch):
    from app.ai import gemini_client

    acquired: list = []
    monkeypatch.setattr("app.core.config.settings.gemini_api_key", "test-key")
    monkeypatch.setattr("app.core.config.settings.gemini_rate_limit_enabled", False)
    monkeypatch.setattr(gemini_client.httpx, "Client", _FakeClient())
    monkeypatch.setattr(gemini_client._generate_bucket, "acquire", lambda *a: acquired.append(1) or 0.0)

    gemini_client.generate_text("hi")
    assert acquired == []
