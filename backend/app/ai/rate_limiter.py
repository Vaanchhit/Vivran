"""Client-side token buckets for the Gemini API.

WHY THIS EXISTS
---------------
The free tier allows 20 generateContent requests per minute. We are nowhere
near 20 requests of *sustained* demand — the problem is the shape of the burst,
not the volume. One teacher asking for a full classroom pack fires roughly nine
generateContent calls inside about ten seconds, which is ~54 RPM instantaneous.
Google counts the window, not our intent, so the tail of that burst comes back
429 even though the minute as a whole is only a third spent.

Retrying after the fact (app/ai/gemini_client.py's backoff) is the wrong tool
for this: it only starts helping once the teacher has already been told to wait,
and every rejected call still consumed a request against the window. Pacing the
*outbound* side turns the same burst into a short queue — the pack takes a few
seconds longer and never 429s.

WHY A BUCKET AND NOT A FIXED SLEEP
----------------------------------
A fixed inter-request delay would tax the common case (one teacher, one
generation, nothing else running) to protect the rare one. A bucket lets a cold
system fire its whole burst immediately and only paces once the recent rate
actually approaches the ceiling, which is the behaviour we want on a box that
is idle most of the day.

THREAD SAFETY
-------------
app/services/jobs.py runs generations on a ThreadPoolExecutor and the request
path calls the same code inline, so both share one process-wide bucket per
quota. Every mutation happens under a lock, and a caller that has to wait
*reserves* its slot (the balance is allowed to go negative) before releasing the
lock — so two threads arriving together queue one behind the other instead of
both sleeping the same interval and then both firing.

``time.monotonic``/``time.sleep`` are bound at import on purpose. Tests
elsewhere in this repo monkeypatch ``time.sleep`` on the shared ``time`` module
to skip retry backoff; a bucket that picked the patched function up would
busy-spin instead of waiting. Injecting a clock is how the bucket's own tests
control it.
"""
from __future__ import annotations

import threading
import time
from typing import Callable

from app.core.logging import logger

_monotonic: Callable[[], float] = time.monotonic
_real_sleep: Callable[[float], None] = time.sleep


class TokenBucket:
    """A thread-safe, reserving token bucket measured in requests per minute."""

    def __init__(
        self,
        *,
        name: str,
        rate_per_minute: float,
        burst: float | None = None,
        max_wait_seconds: float = 30.0,
        monotonic: Callable[[], float] | None = None,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        self.name = name
        self.rate_per_minute = max(1.0, float(rate_per_minute))
        self._rate_per_second = self.rate_per_minute / 60.0
        # A full minute's worth of burst by default: an idle system may spend
        # its whole allowance at once, which is exactly the classroom-pack case.
        self._capacity = float(burst if burst is not None else self.rate_per_minute)
        self._max_wait = max(0.0, float(max_wait_seconds))
        self._monotonic = monotonic or _monotonic
        self._sleep = sleep or _real_sleep

        self._lock = threading.Lock()
        self._tokens = self._capacity
        self._updated = self._monotonic()

    def _reserve(self, tokens: float) -> float:
        """Takes `tokens` from the bucket, returning the seconds to wait first."""
        with self._lock:
            now = self._monotonic()
            self._tokens = min(
                self._capacity,
                self._tokens + (now - self._updated) * self._rate_per_second,
            )
            self._updated = now

            wait = 0.0
            if self._tokens < tokens:
                wait = (tokens - self._tokens) / self._rate_per_second
            # Debited either way. Going negative is the reservation: the next
            # caller computes its wait from a balance that already accounts for
            # this one, so concurrent callers stagger instead of colliding.
            self._tokens -= tokens
            return wait

    def acquire(self, tokens: float = 1.0) -> float:
        """Blocks until this call may go out. Returns the seconds actually waited.

        Never refuses. A cap on the wait exists because an unbounded queue would
        hold one of only two job workers for minutes: past ``max_wait_seconds``
        we let the call through and accept that Google may 429 it, which the
        retry path already handles honestly, rather than hanging a teacher's
        generation on our own limiter.
        """
        wait = self._reserve(tokens)
        if wait <= 0:
            return 0.0

        capped = min(wait, self._max_wait)
        if wait > self._max_wait:
            logger.warning(
                "%s rate limiter: %.1fs of queue needed but capped at %.1fs — letting the "
                "call through; expect a 429 if upstream disagrees",
                self.name, wait, self._max_wait,
            )
        else:
            logger.info("%s rate limiter: pacing this call by %.2fs", self.name, capped)
        self._sleep(capped)
        return capped

    def available_tokens(self) -> float:
        """Current balance, for tests and diagnostics. May be negative."""
        with self._lock:
            now = self._monotonic()
            return min(
                self._capacity,
                self._tokens + (now - self._updated) * self._rate_per_second,
            )
