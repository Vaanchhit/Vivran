from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assessments, auth, content, health, jobs, library, materials, projects, teacher_workflows
from app.api.deps import require_verified_teacher
from app.core.config import LEGACY_COMMITTED_REFERRAL_CODE, settings
from app.core.logging import logger
from app.core.rate_limit import install_rate_limiting

app = FastAPI(title=settings.app_name, version="0.1.0")

# CORS must list explicit origins when credentials are allowed (browsers
# reject a wildcard origin + allow_credentials=True). Dev server defaults are
# provided; override `cors_origins` in your .env for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

install_rate_limiting(app)

app.include_router(health.router)

# The auth router is the ONLY one not behind require_verified_teacher: it
# carries the endpoints a teacher must be able to reach *in order to* pass the
# beta gate (/auth/provision, /auth/verify-referral,
# /auth/verify-referral-account, /auth/me). Gating those would lock every new
# account out of the very call that unlocks it.
app.include_router(auth.router, prefix="/api")

_beta_gated = [Depends(require_verified_teacher)]
app.include_router(teacher_workflows.router, prefix="/api", dependencies=_beta_gated)
app.include_router(assessments.router, prefix="/api", dependencies=_beta_gated)
app.include_router(projects.router, prefix="/api", dependencies=_beta_gated)
app.include_router(library.router, prefix="/api", dependencies=_beta_gated)
app.include_router(materials.router, prefix="/api", dependencies=_beta_gated)
app.include_router(content.router, prefix="/api", dependencies=_beta_gated)
# Job status is as gated as the generation that creates jobs — the rows carry
# the teacher's own generated content.
app.include_router(jobs.router, prefix="/api", dependencies=_beta_gated)

if settings.app_env == "production" and settings.referral_code == LEGACY_COMMITTED_REFERRAL_CODE:
    logger.warning(
        "REFERRAL_CODE is not set — falling back to the value committed in "
        "app/core/config.py, which is public in the git history. Set "
        "REFERRAL_CODE to a fresh, longer code in the Render dashboard."
    )


@app.get("/")
def read_root() -> dict:
    return {"message": "Vivran backend is running"}