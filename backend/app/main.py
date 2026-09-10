from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import assessments, health, materials, projects, teacher_workflows
from app.core.config import settings

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

app.include_router(health.router)
app.include_router(teacher_workflows.router, prefix="/api")
app.include_router(assessments.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(materials.router, prefix="/api")


@app.get("/")
def read_root() -> dict:
    return {"message": "Vivran backend is running"}