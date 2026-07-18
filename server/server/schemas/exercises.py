"""Schémas Pydantic pour les exercices et variantes."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class VariantCreate(BaseModel):
    variant_order: int
    content: str
    data_overrides: Optional[str] = None


class VariantResponse(BaseModel):
    id: int
    exercise_id: int
    variant_order: int
    content: str
    data_overrides: Optional[str] = None

    model_config = {"from_attributes": True}


class ExerciseCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    subject: str = Field(..., min_length=1, max_length=255)
    difficulty: str = Field(default="medium")
    instructions: str
    correct_answer: Optional[str] = None
    points: int = Field(default=10, gt=0)
    exercise_type: str = Field(default="open")
    language: Optional[str] = None  # python, java, cpp, javascript... (pour type="code")


class ExerciseResponse(BaseModel):
    id: int
    teacher_id: int
    title: str
    subject: str
    difficulty: str
    instructions: str
    points: int
    exercise_type: str
    language: Optional[str] = None
    variants: list[VariantResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}
