"""Routeur pour la gestion des dossiers pédagogiques par le professeur.

Permet au professeur de :
1. Consulter les étudiants d'une classe (via class_students)
2. Ajouter/modifier/supprimer les infos d'un étudiant
3. Utiliser ces listes pour ses sessions
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.db import (
    get_class_by_id,
    list_class_students,
    get_class_student_by_id,
    create_class_student,
    update_class_student,
    delete_class_student,
)
from core.dependencies import get_current_teacher

router = APIRouter(tags=["Gestion pédagogique"])


@router.get("/teacher/classes/{class_id}/students")
def teacher_list_students(
    class_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les étudiants d'une classe (dossier pédagogique)."""
    cls = get_class_by_id(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    return list_class_students(class_id)


@router.post("/teacher/classes/{class_id}/students", status_code=201)
def teacher_add_student(
    class_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Ajouter un étudiant à une classe (dossier pédagogique)."""
    cls = get_class_by_id(class_id)
    if not cls:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    student_name = (data.get("student_name") or "").strip()
    student_number = (data.get("student_number") or "").strip()
    if not student_name:
        raise HTTPException(status_code=400, detail="Le nom de l'étudiant est requis")
    if not student_number:
        raise HTTPException(status_code=400, detail="Le numéro d'étudiant (matricule) est requis")

    existing = list_class_students(class_id)
    for s in existing:
        if s["student_number"].strip().lower() == student_number.lower():
            raise HTTPException(
                status_code=409,
                detail=f"Un étudiant avec le matricule '{student_number}' existe déjà dans cette classe",
            )

    student = create_class_student({
        "class_id": class_id,
        "student_name": student_name,
        "student_number": student_number,
        "email": (data.get("email") or "").strip() or None,
    })
    if not student:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de l'étudiant")
    return student


@router.put("/teacher/classes/students/{student_id}")
def teacher_update_student(
    student_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Modifier les infos d'un étudiant (nom, matricule, email)."""
    student = get_class_student_by_id(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Étudiant non trouvé")

    payload = {}
    for field in ("student_name", "student_number", "email"):
        if field in data:
            val = data[field]
            if isinstance(val, str):
                val = val.strip()
            payload[field] = val if val else None

    if not payload:
        raise HTTPException(status_code=400, detail="Aucun champ à modifier")

    updated = update_class_student(student_id, payload)
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la modification")
    return updated


@router.delete("/teacher/classes/students/{student_id}", status_code=204)
def teacher_delete_student(
    student_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer un étudiant du dossier pédagogique."""
    student = get_class_student_by_id(student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Étudiant non trouvé")
    delete_class_student(student_id)
    return None
