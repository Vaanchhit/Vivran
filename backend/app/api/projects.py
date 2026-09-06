"""Projects API (§47) — Create, List, Retrieve, Interpret & Generate projects."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from app.generation.planning import generate_course_plan

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    title: str
    type: str
    grade: str
    subject: str
    topics: List[str]


@router.post("")
def create_project(payload: ProjectCreateRequest):
    course_plan = generate_course_plan(payload.grade, payload.subject, payload.topics)
    return {
        "id": "proj-101",
        "title": payload.title,
        "type": payload.type,
        "status": "active",
        "course_plan": course_plan,
    }


@router.get("")
def list_projects():
    return [
        {
            "id": "proj-101",
            "title": "Class 10 Biology — Tissues",
            "type": "classroom_pack",
            "status": "active",
        }
    ]

