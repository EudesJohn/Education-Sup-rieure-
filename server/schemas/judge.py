"""Schémas Pydantic pour l'exécution de code (Judge / éditeur de code)."""

from typing import Optional

from pydantic import BaseModel, Field


class CodeRunRequest(BaseModel):
    """Requête d'exécution de code (test rapide, sans sauvegarde)."""
    code: str = Field(..., min_length=1, max_length=100000,
                      description="Code source à exécuter")
    language: str = Field(..., description="Langage (python, java, cpp, ...)")
    stdin: str = Field(default="", description="Entrée standard")
    session_code: str = Field(..., description="Code de session d'examen")
    student_number: str = Field(..., description="Numéro d'étudiant")


class CodeRunResponse(BaseModel):
    """Résultat d'une exécution de code."""
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    time_seconds: float = 0.0
    error: Optional[str] = None


class TestCase(BaseModel):
    """Cas de test pour la soumission."""
    input: str = ""
    expected_output: str = ""
    description: Optional[str] = None


class CodeSubmitRequest(BaseModel):
    """Requête de soumission avec cas de test."""
    code: str = Field(..., min_length=1, max_length=100000)
    language: str = Field(...)
    test_cases: list[TestCase] = Field(default_factory=list)
    session_code: str = Field(..., description="Code de session d'examen")
    student_number: str = Field(..., description="Numéro d'étudiant")


class TestResult(BaseModel):
    """Résultat d'un cas de test."""
    description: Optional[str] = None
    passed: bool = False
    input: str = ""
    expected_output: str = ""
    actual_output: str = ""
    error: Optional[str] = None


class CodeSubmitResponse(BaseModel):
    """Résultat complet de la soumission."""
    passed: int = 0
    total: int = 0
    results: list[TestResult] = []
    execution_time: float = 0.0
    error: Optional[str] = None


class LanguageInfo(BaseModel):
    """Informations sur un langage supporté."""
    id: str
    name: str
    extension: str
