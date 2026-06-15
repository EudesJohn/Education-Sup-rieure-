"""Routeur pour la génération de codes d'accès étudiants par session.

Permet au professeur de :
1. Générer des codes PIN uniques (6 chiffres) pour chaque étudiant d'une session
2. Lister les codes générés
3. En option, les étudiants peuvent s'identifier avec leur PIN
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from core.db import (
    get_session_by_id,
    get_list_entries,
    generate_session_access_codes,
    get_session_access_codes,
    get_access_code_by_pin,
    mark_access_code_used,
    create_audit_log,
)
from core.dependencies import get_current_teacher

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Codes d'accès étudiants"])


def _get_supabase():
    from core.supabase_client import get_supabase
    return get_supabase()


# ============================================================
# GÉNÉRATION DES CODES
# ============================================================


@router.post("/teacher/sessions/{session_id}/generate-access-codes")
async def generate_codes(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Générer des codes PIN uniques pour chaque étudiant de la session.

    Prérequis : la session doit avoir une liste d'étudiants associée.
    Chaque étudiant reçoit un code à 6 chiffres.
    Les anciens codes sont remplacés.
    """
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    student_list_id = session.get("student_list_id")
    if not student_list_id:
        raise HTTPException(
            status_code=400,
            detail="Aucune liste d'étudiants associée à cette session. Associez d'abord une liste.",
        )

    # Récupérer les entrées de la liste
    entries = get_list_entries(student_list_id)
    if not entries:
        raise HTTPException(
            status_code=400,
            detail="La liste d'étudiants est vide. Ajoutez des étudiants d'abord.",
        )

    # Générer les codes
    codes = generate_session_access_codes(
        session_id=session_id,
        teacher_id=teacher["id"],
        entries=entries,
    )

    if not codes:
        raise HTTPException(
            status_code=500,
            detail="Erreur lors de la génération des codes",
        )

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "access_codes_generated",
        "resource_type": "session",
        "resource_id": session_id,
        "details": json.dumps({
            "student_count": len(codes),
            "session_title": session.get("title"),
        }),
    })

    return {
        "generated": len(codes),
        "session_id": session_id,
        "session_title": session.get("title"),
        "codes": [
            {
                "id": c["id"],
                "student_name": c["student_name"],
                "student_number": c["student_number"],
                "class_name": c.get("class_name"),
                "access_pin": c["access_pin"],
                "is_used": c["is_used"],
            }
            for c in codes
        ],
        "message": f"{len(codes)} codes d'accès générés avec succès",
    }


# ============================================================
# LISTE DES CODES
# ============================================================


@router.get("/teacher/sessions/{session_id}/access-codes")
def list_access_codes(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les codes d'accès d'une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    codes = get_session_access_codes(session_id)
    total = len(codes)
    used = sum(1 for c in codes if c.get("is_used"))

    return {
        "session_id": session_id,
        "session_title": session.get("title"),
        "total": total,
        "used": used,
        "remaining": total - used,
        "codes": [
            {
                "id": c["id"],
                "student_name": c["student_name"],
                "student_number": c["student_number"],
                "class_name": c.get("class_name"),
                "access_pin": c["access_pin"],
                "is_used": c["is_used"],
                "used_at": c.get("used_at"),
            }
            for c in codes
        ],
    }


# ============================================================
# AUTHENTIFICATION PAR PIN
# ============================================================


@router.post("/sessions/auth-by-pin")
async def authenticate_by_pin(
    data: dict,
):
    """Authentifier un étudiant via son code PIN + nom + matricule.

    Body : { "access_pin": "123456", "student_name": "Jean Dupont", "student_number": "MAT2024001" }
    Retourne les informations de la session et de l'étudiant.
    """
    pin = data.get("access_pin", "").strip()
    student_name = (data.get("student_name") or "").strip()
    student_number = (data.get("student_number") or "").strip()

    if not pin or len(pin) != 6 or not pin.isdigit():
        raise HTTPException(status_code=400, detail="Code PIN invalide (6 chiffres requis)")
    if not student_name:
        raise HTTPException(status_code=400, detail="Le nom de l'étudiant est requis")
    if not student_number:
        raise HTTPException(status_code=400, detail="Le numéro d'étudiant est requis")

    # Chercher le code PIN
    code_record = get_access_code_by_pin(pin)
    if not code_record:
        raise HTTPException(
            status_code=404,
            detail="Code PIN invalide ou déjà utilisé",
        )

    # Vérifier que le nom et le matricule correspondent
    if code_record["student_name"].strip().lower() != student_name.lower():
        raise HTTPException(
            status_code=400,
            detail="Le nom ne correspond pas au code PIN",
        )
    if code_record["student_number"].strip().lower() != student_number.lower():
        raise HTTPException(
            status_code=400,
            detail="Le matricule ne correspond pas au code PIN",
        )

    session_id = code_record["session_id"]

    # Vérifier la session
    session = get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    if session.get("status") not in ("active", "draft"):
        raise HTTPException(
            status_code=400,
            detail=f"Session {session.get('status')} — impossible de rejoindre",
        )

    # Marquer le code comme utilisé
    mark_access_code_used(code_record["id"])

    # Journaliser
    create_audit_log({
        "actor_type": "student",
        "actor_id": code_record["student_number"],
        "action": "student_authenticated_by_pin",
        "resource_type": "session",
        "resource_id": session_id,
        "details": json.dumps({
            "student_name": code_record["student_name"],
            "student_number": code_record["student_number"],
        }),
    })

    return {
        "student_name": code_record["student_name"],
        "student_number": code_record["student_number"],
        "class_name": code_record.get("class_name"),
        "session_id": session_id,
        "session_code": session.get("access_code"),
        "session_title": session.get("title"),
        "session_status": session.get("status"),
    }
