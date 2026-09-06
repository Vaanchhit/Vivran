"""Data Models (§32-45) matching Supabase PostgreSQL entities."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class TeacherProfileModel(BaseModel):
    id: Optional[str] = None
    user_id: str
    name: str
    school: Optional[str] = None
    subjects: Optional[List[str]] = []
    grades: Optional[List[str]] = []


class ProjectModel(BaseModel):
    id: Optional[str] = None
    workspace_id: str
    course_id: Optional[str] = None
    created_by: str
    title: str
    type: str  # course_plan, lesson, classroom_pack, assessment, interactive_course
    specification_json: Optional[Dict[str, Any]] = None
    status: str = "draft"

