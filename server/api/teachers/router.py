"""Routeur pour la gestion des enseignants."""

from fastapi import APIRouter, Depends

from core.db import get_teacher_by_id, update_teacher, get_teacher_sessions, get_teacher_exercises
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
