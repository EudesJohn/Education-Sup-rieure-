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

# Hiérarchie des rôles : un rôle supérieur peut tout faire
# comme les rôles inférieurs
ROLE_HIERARCHY = {
    "super_admin": 100,
    "admin": 60,
    "cd": 30,
    "teacher": 0,
}


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
    """Vérifie le rôle de l'utilisateur de façon hiérarchique.

    super_admin > admin > cd > teacher

    Un super_admin peut accéder aux routes admin, cd et teacher.
    Un admin peut accéder aux routes cd et teacher.
    Un cd peut accéder aux routes teacher.
    """

    def __init__(self, allowed_roles: list[str], hierarchical: bool = True):
        self.allowed_roles = allowed_roles
        self.hierarchical = hierarchical

    def __call__(self, teacher: dict = Depends(get_current_teacher)) -> dict:
        user_role = teacher.get("role", "teacher")

        if self.hierarchical:
            user_level = ROLE_HIERARCHY.get(user_role, 0)
            # Niveau minimum requis parmi les rôles autorisés
            required_level = min(ROLE_HIERARCHY.get(r, 999) for r in self.allowed_roles)
            if user_level >= required_level:
                return teacher

        # Fallback : correspondance exacte
        if user_role in self.allowed_roles:
            return teacher

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Accès refusé. Rôle requis : {' ou '.join(self.allowed_roles)}. "
                   f"Votre rôle actuel : {user_role}",
        )


def require_institution(teacher: dict = Depends(get_current_teacher)) -> dict:
    """Vérifie que l'enseignant est rattaché à un établissement.

    Utilisé pour les routes qui nécessitent un institution_id (admin d'établissement, CD).
    Le super_admin n'a pas besoin d'être rattaché à un établissement spécifique.
    """
    if teacher.get("role") == "super_admin":
        return teacher
    if not teacher.get("institution_id"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun établissement rattaché à ce compte. "
                   "Contactez l'administrateur universitaire.",
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
