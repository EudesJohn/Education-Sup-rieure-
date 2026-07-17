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
    exam_mode: str = Field(default="ai_generated")
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
    exam_mode: Optional[str] = None
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
    grading_details: Optional[str] = None
    correction_mode: str
    exam_mode: str = "ai_generated"
    access_code: str
    status: str
    auto_submit: Optional[bool] = True
    show_results: Optional[bool] = False
    class_id: Optional[int] = None
    academic_year_id: Optional[int] = None
    scheduled_start: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ExamGenerateRequest(BaseModel):
    exercise_ids: Optional[list[int]] = None  # None = utiliser session_exercises
    student_identifiers: Optional[list[dict]] = None


class SessionLaunch(BaseModel):
    pass


class SessionExerciseAdd(BaseModel):
    exercise_id: int
    sort_order: int = 0
    points_override: Optional[float] = None


class SessionExerciseReorder(BaseModel):
    exercise_ids: list[int]


class SessionExerciseResponse(BaseModel):
    id: int
    session_id: int
    exercise_id: int
    sort_order: int
    points_override: Optional[int] = None
    exercise: Optional[dict] = None

    model_config = {"from_attributes": True}
