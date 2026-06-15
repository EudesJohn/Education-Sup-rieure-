"""Schémas Pydantic pour le module étudiant."""

from typing import Optional

from pydantic import BaseModel, Field


class StudentJoin(BaseModel):
    student_name: str = Field(..., min_length=1, max_length=255)
    student_number: str = Field(..., min_length=1, max_length=100)
    class_name: Optional[str] = None
    university: Optional[str] = None


class StudentSubmit(BaseModel):
    content: str  # Contenu de la copie (HTML/rich text)
    auto_submitted: bool = False
    class_name: Optional[str] = None
    university: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class StudentIncident(BaseModel):
    incident_type: str
    details: str
    severity: str = "medium"
