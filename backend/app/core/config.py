from pydantic_settings import BaseSettings

# The beta code as originally committed. It is PUBLIC — it has been in this
# repo's git history since the gate shipped, so anyone with repo access (or a
# copy of an old checkout) knows it. It stays as the default purely so the
# live gate keeps working until REFERRAL_CODE is set on the host; rotating it
# there retires this value without a redeploy. app/main.py logs a warning at
# startup whenever production is still running on it.
LEGACY_COMMITTED_REFERRAL_CODE = "632006"


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Vivran"
    
    # Tier 1 - Open / Local AI (Ollama) per Spec §22 & §59.
    # Optional: only used if reachable (local dev). Production has no Ollama
    # host, so Tier 1 falls back to the same Gemini flash-lite model used
    # below whenever Ollama is unset or unreachable.
    ollama_host: str = ""
    ollama_model: str = "qwen2.5:7b"

    # Gemini API (all three tiers run on Gemini; tiers differ by model choice).
    gemini_api_key: str = ""
    # Pinned to concrete models rather than "-latest" aliases: verified live
    # that "-latest" flash alias currently 503s intermittently, while these
    # concrete names respond reliably. Revisit if Google stabilizes aliases.
    open_model: str = "gemini-3.6-flash"
    cheap_model: str = "gemini-3.6-flash"
    # Requires a Google Cloud billing account with Pro-tier quota — verified
    # live that this key gets 429 "quota exceeded" on every Pro-tier model
    # (gemini-pro-latest, gemini-2.5-pro, gemini-3.1-pro-preview). The
    # premium tier falls back to cheap_model automatically until billing is
    # enabled (see app/generation/assessments.py).
    premium_model: str = "gemini-pro-latest"
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768

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

