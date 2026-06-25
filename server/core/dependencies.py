"""Dépendances FastAPI pour l'authentification et l'autorisation."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.db import (
    get_session_by_code,
    get_generated_exam_by_id,
    get_teacher_by_id,
)
from core.security import decode_token, hash_student_identifier

security_scheme = HTTPBearer()


def get_current_teacher(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> dict:
    """Dépendance : récupère l'enseignant connecté via le token JWT."""
    token = credentials.credentials
    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token non valide pour cette opération",
        )

    teacher_id = payload.get("sub")
    if teacher_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
        )

    teacher = get_teacher_by_id(int(teacher_id))
    if teacher is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enseignant non trouvé",
        )

    return teacher


class RoleChecker:
    """Vérifie le rôle de l'utilisateur."""

    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, teacher: dict = Depends(get_current_teacher)) -> dict:
        if teacher["role"] not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Rôle requis : {' ou '.join(self.allowed_roles)}. "
                       f"Votre rôle actuel : {teacher['role']}",
            )
        return teacher


def verify_student_session(
    session_code: str,
    student_number: str,
) -> dict:
    """Vérifie qu'un étudiant a une session active et retourne son épreuve."""
    session = get_session_by_code(session_code)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session d'examen introuvable",
        )

    if session["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cette session d'examen n'est pas active",
        )

    # Chercher l'épreuve générée pour cet étudiant
    student_hash = hash_student_identifier(session["id"], student_number)

    from core.db import get_session_exams
    exams = get_session_exams(session["id"])
    exam = None
    for e in exams:
        if e["student_id_hash"] == student_hash:
            exam = e
            break

    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucune épreuve trouvée pour cet étudiant dans cette session",
        )

    if exam["status"] == "submitted":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cette épreuve a déjà été soumise",
        )

    return exam
