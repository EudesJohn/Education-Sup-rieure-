"""Schémas Pydantic pour l'import et la gestion des listes étudiants.

CDC v2.2 — RF-02 : Import et Vérification de la Liste des Étudiants
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class StudentListCreate(BaseModel):
    """Création d'une nouvelle liste d'étudiants."""
    name: str = Field(..., min_length=1, max_length=255)
    groupe: Optional[str] = None
    file_type: str = Field(default="csv")


class StudentListUpdate(BaseModel):
    """Mise à jour d'une liste."""
    name: Optional[str] = None
    groupe: Optional[str] = None
    status: Optional[str] = None  # 'active' | 'archived'


class StudentListResponse(BaseModel):
    """Réponse pour une liste d'étudiants."""
    id: int
    teacher_id: int
    name: str
    groupe: Optional[str] = None
    original_filename: Optional[str] = None
    file_type: str
    column_mapping: Optional[dict] = None
    student_count: int
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ListEntryCreate(BaseModel):
    """Création d'une entrée dans une liste."""
    student_name: str = Field(..., min_length=1, max_length=255)
    student_number: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    class_name: Optional[str] = None
    row_index: int = 0


class ListEntryUpdate(BaseModel):
    """Mise à jour d'une entrée."""
    student_name: Optional[str] = None
    student_number: Optional[str] = None
    email: Optional[str] = None
    class_name: Optional[str] = None


class ListEntryResponse(BaseModel):
    """Réponse pour une entrée de liste."""
    id: int
    list_id: int
    student_name: str
    student_number: str
    email: Optional[str] = None
    class_name: Optional[str] = None
    row_index: int

    model_config = {"from_attributes": True}


class ImportPreview(BaseModel):
    """Aperçu après parsing du fichier — avant validation finale."""
    headers: list[str]
    column_mapping: Optional[dict] = None
    total_rows: int
    preview_rows: list[dict] = Field(default_factory=list)  # Max 10 lignes de preview
    error_rows: list[dict] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    confidence: float = 0.0


class ImportConfirm(BaseModel):
    """Validation finale après revue de l'aperçu."""
    list_name: str = Field(..., min_length=1, max_length=255)
    groupe: Optional[str] = None
    column_mapping: dict  # Mapping validé par l'utilisateur
    keep_entries: list[int]  # Index des lignes à conserver (0-based)


class ListAssignRequest(BaseModel):
    """Associer une liste à une session."""
    list_id: int


class ManualStudentEntry(BaseModel):
    """Ajout manuel d'un étudiant à une session."""
    student_name: str = Field(..., min_length=1, max_length=255)
    student_number: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None


class ManualStudentListCreate(BaseModel):
    """Création d'une liste avec des étudiants saisis manuellement."""
    name: str = Field(..., min_length=1, max_length=255)
    groupe: Optional[str] = None
    students: list[ManualStudentEntry] = Field(..., min_length=1)


class ListConfirmRequest(BaseModel):
    """Confirmation d'une liste après preview (étape 2)."""
    name: str = Field(..., min_length=1, max_length=255)
    groupe: Optional[str] = None
    column_mapping: dict = Field(default_factory=dict)
    entries: list[dict] = Field(default_factory=list)
    original_filename: Optional[str] = None
    file_type: str = "csv"
