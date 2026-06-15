"""Routeur pour la gestion des enseignants."""

from fastapi import APIRouter, Depends, Query

from core.db import (
    get_teacher_by_id, update_teacher, get_teacher_sessions, get_teacher_exercises,
    get_filiere_by_id, list_filieres,
    get_academic_year_by_id, list_academic_years,
    get_class_by_id, list_classes,
    list_class_students, list_institutions, get_institution_by_id,
)
from core.dependencies import get_current_teacher
from schemas.auth import TeacherResponse

router = APIRouter()


@router.get("/profile", response_model=TeacherResponse)
def get_profile(teacher: dict = Depends(get_current_teacher)):
    """Recuperer le profil complet."""
    return TeacherResponse.model_validate(teacher)


@router.get("/dashboard")
def get_dashboard(teacher: dict = Depends(get_current_teacher)):
    """Recuperer les donnees du tableau de bord."""
    teacher_id = teacher["id"]
    sessions = get_teacher_sessions(teacher_id)
    exercises = get_teacher_exercises(teacher_id)

    return {
        "total_sessions": len(sessions),
        "active_sessions": sum(1 for s in sessions if s["status"] == "active"),
        "total_exercises": len(exercises),
        "recent_sessions": [
            {
                "id": s["id"],
                "title": s["title"],
                "status": s["status"],
                "created_at": s["created_at"],
            }
            for s in sorted(sessions, key=lambda x: x["created_at"], reverse=True)[:5]
        ],
    }


# ============================================================
# Endpoints de sélection hiérarchique (classes)
# ============================================================

@router.get("/institutions")
def teacher_list_institutions():
    """Lister les établissements (pour le sélecteur hiérarchique)."""
    return list_institutions()


@router.get("/filieres")
def teacher_list_filieres(institution_id: int = Query(None)):
    """Lister les filières, filtrées par établissement."""
    return list_filieres(institution_id)


@router.get("/academic-years")
def teacher_list_academic_years():
    """Lister les années académiques."""
    return list_academic_years()


@router.get("/classes")
def teacher_list_classes(
    filiere_id: int = Query(None),
    academic_year_id: int = Query(None),
):
    """Lister les classes, filtrées par filière et/ou année."""
    return list_classes(filiere_id, academic_year_id)


@router.get("/classes/{class_id}/students")
def teacher_list_class_students(class_id: int):
    """Lister les étudiants d'une classe."""
    c = get_class_by_id(class_id)
    if not c:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    return list_class_students(class_id)
