"""Schémas Pydantic pour les corrections."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class CorrectionResponse(BaseModel):
    id: int
    submission_id: int
    ai_score: Optional[float] = None
    ai_feedback: Optional[str] = None
    teacher_score: Optional[float] = None
    teacher_feedback: Optional[str] = None
    correction_status: str
    grading_system: str
    final_score: Optional[float] = None
    corrected_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TeacherReview(BaseModel):
    teacher_score: float
    teacher_feedback: str
