"""Routeur pour la gestion des enseignants."""

from fastapi import APIRouter, Depends, Query

from core.db import (
    get_teacher_by_id, update_teacher, get_teacher_sessions, get_teacher_exercises,
    list_filieres,
    list_academic_years,
    list_study_levels,
    list_classes,
    list_institutions,
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


@router.get("/study-levels")
def teacher_list_study_levels():
    """Lister les niveaux d'étude."""
    return list_study_levels()


@router.get("/classes")
def teacher_list_classes(
    filiere_id: int = Query(None),
    academic_year_id: int = Query(None),
    study_level_id: int = Query(None),
):
    """Lister les classes, filtrées par filière, année et/ou niveau d'étude."""
    return list_classes(filiere_id, academic_year_id, study_level_id)


