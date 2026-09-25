from pydantic_settings import BaseSettings

# The beta code as originally committed. It is PUBLIC — it has been in this
# repo's git history since the gate shipped, so anyone with repo access (or a
# copy of an old checkout) knows it. It stays as the default purely so the
# live gate keeps working until REFERRAL_CODE is set on the host; rotating it
# there retires this value without a redeploy. app/main.py logs a warning at
# startup whenever production is still running on it.
LEGACY_COMMITTED_REFERRAL_CODE = "632006"

# The small/fast Gemini model that the SLM tier runs on. A module constant
# rather than a literal repeated in the class body below, because two settings
# default to the same model and they must not drift apart silently.
#
# Measured on this key, today, not taken from a model card:
#   gemini-3.5-flash-lite  -> 4/4 success, 1.9s median, correct structured
#                             extraction.
#   gemini-3.6-flash       -> 503 "model overloaded" on 3/10 in one run and
#                             4/4 in the next; ~12s median when it does answer.
# So flash-lite is both markedly more AVAILABLE and ~6x faster. It is used
# wherever the job is extraction or rewriting rather than authoring.
#
# NOT gemini-2.5-flash-lite: that name is still listed by the models endpoint
# but every call 404s with "no longer available to new users" and points here.
SLM_MODEL = "gemini-3.5-flash-lite"


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Vivran"
    
    # Tier 1 - Open / Local AI (Ollama) per Spec §22 & §59.
    # Optional: only used if reachable (local dev). Production has no Ollama
    # host, so Tier 1 falls back to the same Gemini flash-lite model used
    # below whenever Ollama is unset or unreachable.
    ollama_host: str = ""
    ollama_model: str = "qwen2.5:7b"

    # Gemini API. Tiers differ by model choice — see app/ai/router.py, which is
    # the one place that maps a task to a tier.
    gemini_api_key: str = ""
    # SLM tier: extraction and rewriting, where the output is short, structured
    # and checkable, and both call sites already degrade gracefully. See the
    # SLM_MODEL comment above for the numbers behind this choice.
    slm_model: str = SLM_MODEL
    # Tier 1's Gemini fallback when no Ollama host is reachable (which is always,
    # in production). Tier 1's documented job list — intent, classification,
    # metadata extraction, clarification — IS the SLM job list, so it runs the
    # same model.
    open_model: str = SLM_MODEL
    # Authoring tier: slides, worksheets, lesson notes, coursework, assessments.
    # Pinned to a concrete model rather than a "-latest" alias.
    #
    # CAVEAT, measured today: this model is currently unreliable — 503 "model
    # overloaded" on 3/10 calls in one run and 4/4 in another, ~12s median when
    # it works. It is kept here anyway because authoring is the one job the SLM
    # has NOT been shown to do as well, and gemini_client.py already retries a
    # 503. If the overload rate stays this high, this is the next thing to
    # revisit — it needs a judgement call about output quality, not a config
    # edit made on availability grounds alone.
    cheap_model: str = "gemini-3.6-flash"
    # Requires a Google Cloud billing account with Pro-tier quota — verified
    # live that this key gets 429 "quota exceeded" on every Pro-tier model
    # (gemini-pro-latest, gemini-2.5-pro, gemini-3.1-pro-preview).
    premium_model: str = "gemini-pro-latest"
    # OFF until billing is enabled, and that is the whole point.
    #
    # app/generation/assessments.py used to try the premium tier whenever
    # difficulty was "hard" or total_marks >= 60 — which is most real exam
    # papers. Every one of those attempts is a guaranteed 429 (see above) that
    # is then retried once by the validate-and-regenerate loop, so a single
    # paper spent 1-2 requests of a 20-per-minute allowance to learn something
    # we already know, before falling back to the cheap tier and producing the
    # identical result it would have produced immediately. Flip this to true
    # the day Pro-tier quota exists on the key; nothing else needs to change.
    premium_tier_enabled: bool = False
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768

    # --- Client-side pacing (app/ai/rate_limiter.py) ------------------------
    # Measured: the free tier allows 20 generateContent requests per minute, and
    # a full classroom pack fires ~9 of them in ~10s (~54 RPM instantaneous). 18
    # leaves headroom for the health-check-adjacent odd call and for the fact
    # that Google's window and ours are not aligned.
    gemini_rpm_limit: int = 18
    # embedContent is metered separately from generateContent, so it gets its
    # own bucket — otherwise a 900-chunk upload would starve the generations a
    # teacher is waiting on. NOT measured on this key: set conservatively below
    # the documented free-tier embedding limit. Batching (see
    # embed_texts_batch) means a 900-chunk PDF is 9 calls, so this is slack.
    gemini_embed_rpm_limit: int = 60
    # Escape hatch. The limiter sleeps in real time, so the test suite turns it
    # off (see tests/conftest.py) and exercises the bucket directly with an
    # injected clock instead.
    gemini_rate_limit_enabled: bool = True

    # --- Second provider (app/ai/groq_client.py) ----------------------------
    # DORMANT. With no key set, nothing in this backend reaches Groq and the
    # behaviour is exactly what it was before the failover existed. Set
    # GROQ_API_KEY to switch it on; it then handles ONLY the case where Gemini
    # reports itself busy/overloaded (see app/ai/cheap_model.py for why the
    # other failure classes must not fail over).
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"

    # Media Services per Spec §31
    cartesia_api_key: str = ""
    elevenlabs_api_key: str = ""

    # Tally.so — MCQ-test-to-form export
    tally_api_key: str = ""

    # Supabase Infrastructure
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_storage_bucket: str = "materials"

    # Supabase Auth JWT validation (JWT_SECRET from Supabase project settings)
    supabase_jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    # Beta-access gate: a shared code required to create a new teacher
    # account while the product is invite-only. Deliberately NOT enforced
    # client-side (see app/api/auth.py's /auth/verify-referral) — a
    # frontend-only check would ship this value in plain text in the JS
    # bundle, readable via view-source. Overridable via REFERRAL_CODE env
    # var so it can be rotated without a code change/redeploy.
    #
    # The default is the already-public committed code (see above). It is
    # NOT blanked out here on purpose: an empty default would take the live
    # gate down the moment this deploys, before REFERRAL_CODE exists on the
    # host. Set REFERRAL_CODE, then this literal is dead weight.
    referral_code: str = LEGACY_COMMITTED_REFERRAL_CODE

    # --- Background generation jobs (app/services/jobs.py) ------------------
    # How many generations may run off-request at once. Deliberately small:
    # Render's cheap single-instance tier has little memory, every one of these
    # threads is holding an httpx connection to Gemini and burning metered
    # quota, and there are single-digit users. Raising this buys throughput
    # nobody is asking for and makes an OOM restart (which orphans jobs) more
    # likely.
    job_max_workers: int = 2
    # Hard cap on jobs accepted but not yet finished in this process. Past this
    # the API says so (429) instead of queueing work it will probably lose on
    # the next restart.
    job_queue_cap: int = 24
    # A job still 'queued'/'processing' this long after it was created is
    # assumed dead — the process that owned it is gone (deploy, free-tier spin
    # down, OOM). Generously above the ~40s worst case of a real generation so
    # a slow-but-live job is never reaped out from under a teacher.
    job_stale_after_seconds: int = 900
    # How far back GET /api/jobs looks for already-finished jobs, so a teacher
    # who wandered off and came back still sees the result rather than nothing.
    job_recent_window_minutes: int = 60

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

