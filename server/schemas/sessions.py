"""Schémas Pydantic pour les sessions d'examen."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


SESSION_TYPES = ["assignment", "exam", "retake", "demo"]


class ExamSessionCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    subject: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    session_type: str = Field(default="exam")
    duration_seconds: int = Field(..., gt=0)
    student_count: int = Field(..., gt=0)
    grading_system: str = Field(default="20")
    grading_details: Optional[str] = None
    correction_mode: str = Field(default="ai_assisted")
    auto_submit: bool = True
    show_results: bool = False
    scheduled_start: Optional[datetime] = None
    class_id: Optional[int] = None
    academic_year_id: Optional[int] = None

    @field_validator("session_type")
    @classmethod
    def validate_session_type(cls, v: str) -> str:
        if v not in SESSION_TYPES:
            raise ValueError(
                f"Type de session invalide : '{v}'. "
                f"Types acceptés : {', '.join(SESSION_TYPES)}"
            )
        return v


class ExamSessionUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    session_type: Optional[str] = None
    duration_seconds: Optional[int] = None
    student_count: Optional[int] = None
    grading_system: Optional[str] = None
    correction_mode: Optional[str] = None
    auto_submit: Optional[bool] = None
    show_results: Optional[bool] = None
    class_id: Optional[int] = None
    academic_year_id: Optional[int] = None


class ExamSessionResponse(BaseModel):
    id: int
    teacher_id: int
    title: str
    subject: str
    description: Optional[str] = None
    session_type: str = "exam"
    duration_seconds: int
    student_count: int
    grading_system: str
    correction_mode: str
    access_code: str
    status: str
    class_id: Optional[int] = None
    academic_year_id: Optional[int] = None
    scheduled_start: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExamGenerateRequest(BaseModel):
    exercise_ids: list[int] = Field(..., min_length=1)
    student_identifiers: Optional[list[dict]] = None


class SessionLaunch(BaseModel):
    pass
