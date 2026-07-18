"""Routeur pour la consultation des listes d'étudiants.

L'enseignant peut :
1. Consulter les listes d'étudiants créées par l'admin
2. Associer/dissocier une liste à une session
3. Vérifier la cohérence liste vs configuration session

La création et la modification des listes sont gérées par l'admin.
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.db import (
    get_student_list,
    get_teacher_lists,
    get_list_entries,
    count_list_entries,
    update_session,
    get_session_by_id,
    create_audit_log,
)
from core.dependencies import get_current_teacher
from schemas.student_lists import (
    StudentListResponse,
    ListAssignRequest,
)
from services.student_list_parser import StudentListParser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Listes étudiants"])
parser = StudentListParser()


# ============================================================
# CONSULTATION DES LISTES (lecture seule)
# ============================================================


@router.get("/student-lists")
def list_student_lists(
    status_filter: Optional[str] = Query(None, alias="status"),
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les listes d'étudiants (lecture seule).

    L'enseignant voit uniquement les listes qui lui sont accessibles.
    La création et la modification sont réservées à l'administrateur.
    """
    lists = get_teacher_lists(teacher["id"], status=status_filter)
    return [
        StudentListResponse(
            id=lst["id"],
            teacher_id=lst["teacher_id"],
            name=lst["name"],
            groupe=lst.get("groupe"),
            original_filename=lst.get("original_filename"),
            file_type=lst["file_type"],
            student_count=lst["student_count"],
            status=lst["status"],
            created_at=lst["created_at"],
            updated_at=lst["updated_at"],
        )
        for lst in lists
    ]


@router.get("/student-lists/{list_id}")
def get_student_list_detail(
    list_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Détail d'une liste avec ses entrées."""
    lst = get_student_list(list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    entries = get_list_entries(list_id)

    return {
        "list": StudentListResponse(
            id=lst["id"],
            teacher_id=lst["teacher_id"],
            name=lst["name"],
            groupe=lst.get("groupe"),
            original_filename=lst.get("original_filename"),
            file_type=lst["file_type"],
            student_count=lst["student_count"],
            status=lst["status"],
            created_at=lst["created_at"],
            updated_at=lst["updated_at"],
        ),
        "entries": entries,
        "column_mapping": json.loads(lst.get("column_mapping") or "{}"),
    }


@router.get("/student-lists/{list_id}/entries")
def get_list_entries_route(
    list_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lister toutes les entrées d'une liste d'étudiants."""
    lst = get_student_list(list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")
    return get_list_entries(list_id)


# ============================================================
# ASSOCIATION LISTE ↔ SESSION
# ============================================================


@router.post("/sessions/{session_id}/assign-list")
def assign_list_to_session(
    session_id: int,
    data: ListAssignRequest,
    teacher: dict = Depends(get_current_teacher),
):
    """Associer une liste d'étudiants à une session d'examen.

    Vérifie la cohérence : le nombre d'entrées dans la liste doit correspondre
    au nombre d'étudiants configuré pour la session (avec alerte si différent).
    """
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    lst = get_student_list(data.list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    if lst["status"] != "active":
        raise HTTPException(status_code=400, detail="La liste n'est pas active")

    # Vérifier la cohérence des effectifs
    entries_count = count_list_entries(data.list_id)
    session_count = session["student_count"]
    warnings = []

    if entries_count != session_count:
        warnings.append(
            f"La liste '{lst['name']}' contient {entries_count} étudiants, "
            f"mais la session est configurée pour {session_count} étudiants."
        )

    # Associer la liste à la session
    update_session(session_id, {"student_list_id": data.list_id})

    # Mettre à jour le student_count si nécessaire
    if entries_count != session_count:
        update_session(session_id, {"student_count": entries_count})
        warnings.append(f"Le nombre d'étudiants de la session a été ajusté à {entries_count}.")

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "list_assigned_to_session",
        "resource_type": "session",
        "resource_id": session_id,
        "details": json.dumps({
            "list_id": data.list_id,
            "list_name": lst["name"],
            "entries_count": entries_count,
        }),
    })

    return {
        "session_id": session_id,
        "list_id": data.list_id,
        "list_name": lst["name"],
        "entries_count": entries_count,
        "session_student_count": entries_count,
        "warnings": warnings,
        "message": f"Liste '{lst['name']}' associée à la session",
    }


@router.delete("/sessions/{session_id}/assign-list")
def unassign_list_from_session(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Retirer la liste d'étudiants associée à une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    if session["status"] != "draft":
        raise HTTPException(status_code=400, detail="Seules les sessions en brouillon peuvent être modifiées")

    update_session(session_id, {"student_list_id": None})

    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "list_unassigned_from_session",
        "resource_type": "session",
        "resource_id": session_id,
        "details": json.dumps({
            "session_title": session.get("title"),
        }),
    })

    return {"message": "Liste retirée de la session"}


@router.get("/sessions/{session_id}/list-status")
def get_session_list_status(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Vérifier l'état de la liste associée à une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    list_id = session.get("student_list_id")
    class_id = session.get("class_id")

    # Cas 1 : classe associée (système hiérarchique)
    if class_id:
        from core.db import list_class_students, get_class_by_id
        students = list_class_students(class_id)
        cls = get_class_by_id(class_id)
        class_name = cls["name"] if cls else f"Classe #{class_id}"
        return {
            "has_list": True,
            "list": {
                "id": f"class_{class_id}",
                "name": class_name,
                "file_type": "class",
                "student_count": len(students),
            },
            "status": "class",
            "is_consistent": True,
            "entries_count": len(students),
            "session_student_count": session.get("student_count", 0),
            "message": f"Étudiants de la classe — {len(students)} inscrits",
        }

    # Cas 2 : liste d'étudiants associée
    if not list_id:
        return {
            "has_list": False,
            "list": None,
            "status": "no_list",
            "message": "Aucune liste n'est associée à cette session",
        }

    lst = get_student_list(list_id)
    if not lst:
        return {
            "has_list": False,
            "list": None,
            "status": "list_deleted",
            "message": "La liste associée a été supprimée",
        }

    entries_count = count_list_entries(list_id)
    session_count = session["student_count"]
    is_consistent = entries_count == session_count

    return {
        "has_list": True,
        "list": {
            "id": lst["id"],
            "name": lst["name"],
            "groupe": lst.get("groupe"),
            "file_type": lst["file_type"],
            "student_count": entries_count,
        },
        "status": "consistent" if is_consistent else "inconsistent",
        "is_consistent": is_consistent,
        "entries_count": entries_count,
        "session_student_count": session_count,
        "message": None if is_consistent else
            f"Incohérence : {entries_count} étudiants dans la liste vs {session_count} configurés",
    }
