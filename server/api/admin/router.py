"""Routeur pour le module d'administration."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request, status
from pydantic import BaseModel

from core.dependencies import RoleChecker
from core.supabase_client import get_supabase
from core.db import (
    get_teacher_by_id,
    update_teacher,
    delete_teacher,
    get_institution_by_id,
    get_institution_by_name,
    list_institutions,
    create_institution,
    update_institution,
    delete_institution,
    get_subject_by_id,
    get_subject_by_name,
    list_subjects,
    create_subject,
    update_subject,
    delete_subject,
    get_filiere_by_id,
    list_filieres,
    create_filiere,
    update_filiere,
    delete_filiere,
    get_academic_year_by_id,
    list_academic_years,
    create_academic_year,
    update_academic_year,
    delete_academic_year,
    get_study_level_by_id,
    list_study_levels,
    create_study_level,
    update_study_level,
    delete_study_level,
    get_class_by_id,
    list_classes,
    create_class,
    update_class,
    delete_class,
    get_class_student_by_id,
    list_class_students,
    create_class_student,
    update_class_student,
    delete_class_student,
    bulk_create_class_students,
    query_audit_logs,
    count_audit_logs,
    get_invitation_code_stats,
    create_invitation_codes_bulk,
    list_invitation_codes,
    revoke_invitation_code,
    create_student_list,
    get_student_list,
    get_teacher_lists,
    update_student_list,
    delete_student_list,
    create_list_entries,
    get_list_entries,
    get_student_by_matricule,
    update_list_entry,
    delete_list_entry,
    count_list_entries,
    create_audit_log,
)

logger = logging.getLogger(__name__)

class RoleUpdate(BaseModel):
    role: str

router = APIRouter(dependencies=[Depends(RoleChecker(allowed_roles=["admin"]))])


def _count(table: str, filters: dict | None = None) -> int:
    supabase = get_supabase()
    query = supabase.table(table).select("*", count="exact")
    if filters:
        for k, v in filters.items():
            if v is not None:
                query = query.eq(k, v)
    result = query.execute()
    return result.count or 0


@router.get("/stats")
def get_admin_stats():
    """Statistiques globales de la plateforme."""
    supabase = get_supabase()

    total_teachers = _count("teachers")
    total_sessions = _count("exam_sessions")
    active_sessions = _count("exam_sessions", {"status": "active"})
    total_exercises = _count("exercises")
    total_submissions = _count("submissions")
    total_incidents = _count("security_incidents")
    total_corrections = _count("corrections")
    total_institutions = _count("institutions")
    total_subjects = _count("subjects")

    # Incident breakdown
    incidents_raw = supabase.table("security_incidents").select("incident_type", count="exact").execute()
    from collections import Counter
    type_counts = Counter()
    for row in (incidents_raw.data or []):
        type_counts[row["incident_type"]] += 1

    return {
        "total_teachers": total_teachers,
        "total_sessions": total_sessions,
        "active_sessions": active_sessions,
        "total_exercises": total_exercises,
        "total_submissions": total_submissions,
        "total_incidents": total_incidents,
        "total_corrections": total_corrections,
        "total_institutions": total_institutions,
        "total_subjects": total_subjects,
        "incident_breakdown": dict(type_counts),
    }


@router.get("/teachers")
def list_teachers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Liste tous les enseignants inscrits."""
    supabase = get_supabase()
    result = supabase.table("teachers").select("*", count="exact").range(skip, skip + limit - 1).order("created_at", desc=True).execute()
    teachers = result.data or []

    enriched = []
    for t in teachers:
        sessions_count = _count("exam_sessions", {"teacher_id": t["id"]})
        exercises_count = _count("exercises", {"teacher_id": t["id"]})
        enriched.append({
            "id": t["id"],
            "email": t["email"],
            "full_name": t["full_name"],
            "institution": t["institution"],
            "discipline": t["discipline"],
            "role": t.get("role", "teacher"),
            "is_verified": t["is_verified"],
            "created_at": t["created_at"],
            "sessions_count": sessions_count,
            "exercises_count": exercises_count,
        })

    return enriched


@router.get("/teachers/{teacher_id}")
def get_teacher_detail(teacher_id: int):
    """Détail d'un enseignant."""
    teacher = get_teacher_by_id(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Enseignant non trouvé")

    supabase = get_supabase()
    sessions_raw = supabase.table("exam_sessions").select("id, title, status, student_count").eq("teacher_id", teacher_id).execute()
    sessions = sessions_raw.data or []
    exercises_count = _count("exercises", {"teacher_id": teacher_id})

    return {
        "id": teacher["id"],
        "email": teacher["email"],
        "full_name": teacher["full_name"],
        "institution": teacher["institution"],
        "discipline": teacher["discipline"],
        "avatar_url": teacher.get("avatar_url"),
        "bio": teacher.get("bio"),
        "is_verified": teacher["is_verified"],
        "role": teacher["role"],
        "is_2fa_enabled": teacher["is_2fa_enabled"],
        "created_at": teacher["created_at"],
        "sessions": sessions,
        "exercises_count": exercises_count,
    }


@router.put("/teachers/{teacher_id}/role", status_code=200)
def update_teacher_role(teacher_id: int, data: RoleUpdate, admin: dict = Depends(RoleChecker(allowed_roles=["admin"]))):
    """Promouvoir un enseignant en administrateur ou le rétrograder.

    Corps JSON : {"role": "admin"} ou {"role": "teacher"}
    """
    teacher = get_teacher_by_id(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Enseignant non trouvé")

    new_role = data.role.strip()
    if new_role not in ("admin", "teacher"):
        raise HTTPException(
            status_code=400,
            detail="Rôle invalide. Utilise 'admin' ou 'teacher'.",
        )

    if teacher["role"] == new_role:
        return {
            "message": f"Le rôle est déjà '{new_role}' pour {teacher['full_name']}",
            "teacher_id": teacher_id,
            "role": new_role,
        }

    updated = update_teacher(teacher_id, {"role": new_role})
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour du rôle")

    return {
        "message": f"{teacher['full_name']} est maintenant {new_role}",
        "teacher_id": teacher_id,
        "role": new_role,
        "full_name": teacher["full_name"],
    }


@router.delete("/teachers/{teacher_id}", status_code=200)
def delete_teacher_endpoint(
    teacher_id: int,
    admin: dict = Depends(RoleChecker(allowed_roles=["admin"])),
):
    """Supprimer un compte enseignant et toutes ses données associées."""
    teacher = get_teacher_by_id(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Enseignant non trouvé")

    if teacher["role"] == "admin":
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer un administrateur. Rétrogradez-le d'abord.",
        )

    try:
        delete_teacher(teacher_id)
        return {
            "message": f"Le compte de {teacher['full_name']} a été supprimé avec toutes ses données associées.",
            "teacher_id": teacher_id,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la suppression : {str(e)}",
        )


@router.get("/sessions")
def list_all_sessions(
    status: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Liste toutes les sessions d'examen."""
    supabase = get_supabase()
    query = supabase.table("exam_sessions").select("*, teachers!inner(id, full_name)", count="exact")

    if status:
        query = query.eq("status", status)

    result = query.range(skip, skip + limit - 1).order("created_at", desc=True).execute()
    sessions = result.data or []

    enriched = []
    for s in sessions:
        teacher_name = "Inconnu"
        if s.get("teachers"):
            teacher_name = s["teachers"]["full_name"]
        enriched.append({
            "id": s["id"],
            "teacher_name": teacher_name,
            "teacher_id": s["teacher_id"],
            "title": s["title"],
            "subject": s["subject"],
            "status": s["status"],
            "student_count": s["student_count"],
            "grading_system": s["grading_system"],
            "correction_mode": s["correction_mode"],
            "access_code": s["access_code"],
            "created_at": s["created_at"],
        })

    return enriched


@router.get("/incidents")
def list_incidents(
    severity: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Liste les incidents de sécurité."""
    supabase = get_supabase()
    query = supabase.table("security_incidents").select("*, submissions!inner(student_name, generated_exam_id)", count="exact")

    if severity:
        query = query.eq("severity", severity)

    result = query.range(skip, skip + limit - 1).order("timestamp", desc=True).execute()
    incidents = result.data or []

    enriched = []
    for i in incidents:
        student_name = "Inconnu"
        session_title = "N/A"
        if i.get("submissions"):
            student_name = i["submissions"].get("student_name", "Inconnu")
            exam = supabase.table("generated_exams").select("*, exam_sessions!inner(title)").eq("id", i["submissions"].get("generated_exam_id")).maybe_single().execute()
            if exam.data and exam.data.get("exam_sessions"):
                session_title = exam.data["exam_sessions"].get("title", "N/A")

        enriched.append({
            "id": i["id"],
            "submission_id": i["submission_id"],
            "incident_type": i["incident_type"],
            "details": i["details"],
            "severity": i["severity"],
            "timestamp": i["timestamp"],
            "student_name": student_name,
            "session_title": session_title,
        })

    return enriched


@router.get("/audit-logs")
def list_audit_logs(
    actor_type: str = Query(None),
    action: str = Query(None),
    resource_type: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    """Liste paginée des logs d'audit."""
    logs = query_audit_logs(
        actor_type=actor_type if actor_type else None,
        action=action if action else None,
        resource_type=resource_type if resource_type else None,
        limit=limit,
        offset=skip,
    )
    total = count_audit_logs(
        actor_type=actor_type if actor_type else None,
        action=action if action else None,
        resource_type=resource_type if resource_type else None,
    )
    return {"data": logs, "total": total}


# ==================== INSTITUTIONS (admin CRUD) ====================

@router.get("/institutions")
def admin_list_institutions():
    """Liste tous les établissements."""
    return list_institutions()


@router.post("/institutions", status_code=201)
def admin_create_institution(data: dict, admin: dict = Depends(RoleChecker(allowed_roles=["admin"]))):
    """Créer un établissement."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")

    existing = get_institution_by_name(name)
    if existing:
        raise HTTPException(status_code=409, detail="Cet établissement existe déjà")

    inst = create_institution({"name": name, "created_by": admin["id"]})
    return inst


@router.put("/institutions/{institution_id}")
def admin_update_institution(institution_id: int, data: dict):
    """Modifier un établissement."""
    inst = get_institution_by_id(institution_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")

    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")

    dup = get_institution_by_name(name)
    if dup and dup["id"] != institution_id:
        raise HTTPException(status_code=409, detail="Cet établissement existe déjà")

    return update_institution(institution_id, {"name": name})


@router.delete("/institutions/{institution_id}")
def admin_delete_institution(institution_id: int):
    """Supprimer un établissement."""
    inst = get_institution_by_id(institution_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")
    delete_institution(institution_id)
    return {"message": "Établissement supprimé"}


# ==================== SUBJECTS (admin CRUD) ====================

@router.get("/subjects")
def admin_list_subjects():
    """Liste toutes les matières."""
    return list_subjects()


@router.post("/subjects", status_code=201)
def admin_create_subject(data: dict, admin: dict = Depends(RoleChecker(allowed_roles=["admin"]))):
    """Créer une matière."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")

    existing = get_subject_by_name(name)
    if existing:
        raise HTTPException(status_code=409, detail="Cette matière existe déjà")

    subj = create_subject({"name": name, "created_by": admin["id"]})
    return subj


@router.put("/subjects/{subject_id}")
def admin_update_subject(subject_id: int, data: dict):
    """Modifier une matière."""
    subj = get_subject_by_id(subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Matière non trouvée")

    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")

    dup = get_subject_by_name(name)
    if dup and dup["id"] != subject_id:
        raise HTTPException(status_code=409, detail="Cette matière existe déjà")

    return update_subject(subject_id, {"name": name})


@router.delete("/subjects/{subject_id}")
def admin_delete_subject(subject_id: int):
    """Supprimer une matière."""
    subj = get_subject_by_id(subject_id)
    if not subj:
        raise HTTPException(status_code=404, detail="Matière non trouvée")
    delete_subject(subject_id)
    return {"message": "Matière supprimée"}


# ==================== FILIERES (admin CRUD) ====================

@router.get("/filieres")
def admin_list_filieres(
    institution_id: int = Query(None),
):
    """Liste toutes les filières, filtrées par établissement."""
    return list_filieres(institution_id)


@router.post("/filieres", status_code=201)
def admin_create_filiere(data: dict):
    """Créer une filière."""
    name = data.get("name", "").strip()
    institution_id = data.get("institution_id")
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")
    if not institution_id:
        raise HTTPException(status_code=400, detail="L'établissement est requis")

    inst = get_institution_by_id(institution_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Établissement non trouvé")

    existing = list_filieres(institution_id)
    if any(f["name"].lower() == name.lower() for f in existing):
        raise HTTPException(status_code=409, detail="Cette filière existe déjà dans cet établissement")

    return create_filiere({
        "name": name,
        "institution_id": institution_id,
        "code": data.get("code"),
        "description": data.get("description"),
    })


@router.get("/filieres/{filiere_id}")
def admin_get_filiere(filiere_id: int):
    """Détail d'une filière."""
    f = get_filiere_by_id(filiere_id)
    if not f:
        raise HTTPException(status_code=404, detail="Filière non trouvée")
    return f


@router.put("/filieres/{filiere_id}")
def admin_update_filiere(filiere_id: int, data: dict):
    """Modifier une filière."""
    f = get_filiere_by_id(filiere_id)
    if not f:
        raise HTTPException(status_code=404, detail="Filière non trouvée")

    payload = {}
    if "name" in data:
        payload["name"] = data["name"]
    if "code" in data:
        payload["code"] = data.get("code")
    if "description" in data:
        payload["description"] = data.get("description")

    return update_filiere(filiere_id, payload)


@router.delete("/filieres/{filiere_id}")
def admin_delete_filiere(filiere_id: int):
    """Supprimer une filière."""
    f = get_filiere_by_id(filiere_id)
    if not f:
        raise HTTPException(status_code=404, detail="Filière non trouvée")
    delete_filiere(filiere_id)
    return {"message": "Filière supprimée"}


# ==================== ACADEMIC YEARS (admin CRUD) ====================

@router.get("/academic-years")
def admin_list_academic_years():
    """Liste toutes les années académiques."""
    return list_academic_years()


@router.post("/academic-years", status_code=201)
def admin_create_academic_year(data: dict):
    """Créer une année académique."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")

    payload = {
        "name": name,
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "is_current": data.get("is_current", False),
    }
    return create_academic_year(payload)


@router.get("/academic-years/{year_id}")
def admin_get_academic_year(year_id: int):
    """Détail d'une année académique."""
    y = get_academic_year_by_id(year_id)
    if not y:
        raise HTTPException(status_code=404, detail="Année académique non trouvée")
    return y


@router.put("/academic-years/{year_id}")
def admin_update_academic_year(year_id: int, data: dict):
    """Modifier une année académique."""
    y = get_academic_year_by_id(year_id)
    if not y:
        raise HTTPException(status_code=404, detail="Année académique non trouvée")
    return update_academic_year(year_id, {
        k: data[k] for k in ("name", "start_date", "end_date", "is_current") if k in data
    })


@router.delete("/academic-years/{year_id}")
def admin_delete_academic_year(year_id: int):
    """Supprimer une année académique."""
    y = get_academic_year_by_id(year_id)
    if not y:
        raise HTTPException(status_code=404, detail="Année académique non trouvée")
    delete_academic_year(year_id)
    return {"message": "Année académique supprimée"}


# ==================== STUDY LEVELS (admin CRUD) ====================


@router.get("/study-levels")
def admin_list_study_levels():
    """Liste tous les niveaux d'étude."""
    return list_study_levels()


@router.post("/study-levels", status_code=201)
def admin_create_study_level(data: dict):
    """Créer un niveau d'étude."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")
    return create_study_level({"name": name})


@router.get("/study-levels/{level_id}")
def admin_get_study_level(level_id: int):
    """Détail d'un niveau d'étude."""
    level = get_study_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Niveau d'étude non trouvé")
    return level


@router.put("/study-levels/{level_id}")
def admin_update_study_level(level_id: int, data: dict):
    """Modifier un niveau d'étude."""
    level = get_study_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Niveau d'étude non trouvé")
    return update_study_level(level_id, {k: data[k] for k in ("name",) if k in data})


@router.delete("/study-levels/{level_id}")
def admin_delete_study_level(level_id: int):
    """Supprimer un niveau d'étude."""
    level = get_study_level_by_id(level_id)
    if not level:
        raise HTTPException(status_code=404, detail="Niveau d'étude non trouvé")
    delete_study_level(level_id)
    return {"message": "Niveau d'étude supprimé"}


# ==================== CLASSES (admin CRUD) ====================

@router.get("/classes")
def admin_list_classes(
    filiere_id: int = Query(None),
    academic_year_id: int = Query(None),
):
    """Liste toutes les classes, filtrées par filière et/ou année."""
    return list_classes(filiere_id, academic_year_id)


@router.post("/classes", status_code=201)
def admin_create_class(data: dict):
    """Créer une classe."""
    name = data.get("name", "").strip()
    filiere_id = data.get("filiere_id")
    academic_year_id = data.get("academic_year_id")

    if not name:
        raise HTTPException(status_code=400, detail="Le nom est requis")
    if not filiere_id:
        raise HTTPException(status_code=400, detail="La filière est requise")
    if not academic_year_id:
        raise HTTPException(status_code=400, detail="L'année académique est requise")

    if not get_filiere_by_id(filiere_id):
        raise HTTPException(status_code=404, detail="Filière non trouvée")
    if not get_academic_year_by_id(academic_year_id):
        raise HTTPException(status_code=404, detail="Année académique non trouvée")

    return create_class({
        "name": name,
        "filiere_id": filiere_id,
        "academic_year_id": academic_year_id,
        "study_level_id": data.get("study_level_id"),
        "level": data.get("level"),
    })


@router.get("/classes/{class_id}")
def admin_get_class(class_id: int):
    """Détail d'une classe."""
    c = get_class_by_id(class_id)
    if not c:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    return c


@router.put("/classes/{class_id}")
def admin_update_class(class_id: int, data: dict):
    """Modifier une classe."""
    c = get_class_by_id(class_id)
    if not c:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    return update_class(class_id, {
        k: data[k] for k in ("name", "level", "study_level_id", "filiere_id", "academic_year_id") if k in data
    })


@router.delete("/classes/{class_id}")
def admin_delete_class(class_id: int):
    """Supprimer une classe."""
    c = get_class_by_id(class_id)
    if not c:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    delete_class(class_id)
    return {"message": "Classe supprimée"}


# ==================== CLASS STUDENTS (admin CRUD) ====================

@router.get("/classes/{class_id}/students")
def admin_list_class_students(class_id: int):
    """Liste les étudiants d'une classe."""
    c = get_class_by_id(class_id)
    if not c:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    return list_class_students(class_id)


@router.post("/classes/{class_id}/students", status_code=201)
def admin_add_class_student(class_id: int, data: dict):
    """Ajouter un étudiant à une classe."""
    c = get_class_by_id(class_id)
    if not c:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    student_name = data.get("student_name", "").strip()
    student_number = data.get("student_number", "").strip()
    if not student_name:
        raise HTTPException(status_code=400, detail="Le nom de l'étudiant est requis")
    if not student_number:
        raise HTTPException(status_code=400, detail="Le numéro d'étudiant est requis")

    return create_class_student({
        "class_id": class_id,
        "student_name": student_name,
        "student_number": student_number,
        "email": data.get("email"),
    })


@router.put("/classes/students/{student_id}")
def admin_update_class_student(student_id: int, data: dict):
    """Modifier un étudiant."""
    s = get_class_student_by_id(student_id)
    if not s:
        raise HTTPException(status_code=404, detail="Étudiant non trouvé")
    return update_class_student(student_id, {
        k: data[k] for k in ("student_name", "student_number", "email") if k in data
    })


@router.delete("/classes/students/{student_id}")
def admin_delete_class_student(student_id: int):
    """Supprimer un étudiant d'une classe."""
    s = get_class_student_by_id(student_id)
    if not s:
        raise HTTPException(status_code=404, detail="Étudiant non trouvé")
    delete_class_student(student_id)
    return {"message": "Étudiant supprimé"}


@router.post("/classes/{class_id}/students/import", status_code=201)
def admin_import_class_students(class_id: int, data: dict):
    """Importer plusieurs étudiants dans une classe (format JSON)."""
    c = get_class_by_id(class_id)
    if not c:
        raise HTTPException(status_code=404, detail="Classe non trouvée")

    students = data.get("students", [])
    if not students:
        raise HTTPException(status_code=400, detail="Aucun étudiant à importer")

    result = bulk_create_class_students(class_id, students)
    return {
        "imported": len(result),
        "students": result,
        "message": f"{len(result)} étudiants importés avec succès",
    }


# ==================== INVITATION CODES (admin) ====================


@router.get("/invitation-codes/stats")
def admin_invitation_code_stats():
    """Statistiques sur les codes d'invitation."""
    from core.db import get_invitation_code_stats
    return get_invitation_code_stats()


@router.post("/invitation-codes", status_code=201)
def admin_create_invitation_codes(
    data: dict,
    admin: dict = Depends(RoleChecker(allowed_roles=["admin"])),
):
    """Generer un ou plusieurs codes d'invitation.

    Corps JSON:
      { "count": 5, "notes": "Session 2025-2026", "expires_in_days": 30 }
    """
    from core.db import create_invitation_codes_bulk
    count = max(1, min(100, data.get("count", 1)))
    notes = data.get("notes", "")
    expires_in_days = data.get("expires_in_days")
    codes = create_invitation_codes_bulk(
        created_by=admin["id"],
        count=count,
        notes=notes,
        expires_in_days=expires_in_days,
    )
    return {
        "codes": codes,
        "count": len(codes),
        "message": f"{len(codes)} code(s) d'invitation genere(s)",
    }


@router.get("/invitation-codes")
def admin_list_invitation_codes(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    include_used: bool = Query(False),
):
    """Lister les codes d'invitation avec leur statut."""
    from core.db import list_invitation_codes
    codes = list_invitation_codes(skip=skip, limit=limit, include_used=include_used)
    return codes


@router.post("/invitation-codes/{code_id}/revoke")
def admin_revoke_invitation_code(
    code_id: int,
    admin: dict = Depends(RoleChecker(allowed_roles=["admin"])),
):
    """Revoquer un code d'invitation (le desactiver)."""
    from core.db import revoke_invitation_code
    if not revoke_invitation_code(code_id):
        raise HTTPException(status_code=404, detail="Code d'invitation non trouve")
    return {"message": "Code d'invitation revoque avec succes"}


# ==================== STUDENT LISTS (admin CRUD) ====================
# Ces routes remplacent les anciennes routes enseignant.
# Les professeurs ne peuvent plus creer/modifier des listes d'etudiants.


@router.post("/student-lists/upload", status_code=200)
async def admin_upload_student_list(
    file: UploadFile = File(...),
    admin: dict = Depends(RoleChecker(allowed_roles=["admin"])),
):
    """Uploader un fichier CSV/XLSX/PDF -> parsing + preview.

    L'administrateur importe le fichier, valide le mapping des colonnes,
    puis confirme la creation de la liste.
    """
    from services.student_list_parser import StudentListParser

    if not file.filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ('csv', 'xlsx', 'xls', 'pdf'):
        raise HTTPException(
            status_code=400,
            detail=f"Format de fichier non supporte : '.{ext}'. Formats acceptes : .csv, .xlsx, .xls, .pdf"
        )

    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur de lecture du fichier : {str(e)}")

    if not content or len(content) == 0:
        raise HTTPException(status_code=400, detail="Fichier vide")

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")

    parser = StudentListParser()
    result = parser.parse(file.filename, content)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)

    return {
        "headers": result.headers,
        "column_mapping": {
            "student_name": result.column_mapping.student_name if result.column_mapping else None,
            "student_number": result.column_mapping.student_number if result.column_mapping else None,
            "email": result.column_mapping.email if result.column_mapping else None,
            "class_name": result.column_mapping.class_name if result.column_mapping else None,
        },
        "confidence": result.column_mapping.confidence if result.column_mapping else 0.0,
        "total_rows": result.total_rows,
        "preview_rows": result.entries[:10],
        "error_rows": result.error_rows,
        "warnings": result.warnings,
        "original_filename": file.filename,
        "file_type": ext,
    }


class AdminManualStudentListCreate(BaseModel):
    name: str
    groupe: str = ""
    teacher_id: int
    students: list[dict]


@router.post("/student-lists/manual", status_code=201)
def admin_create_manual_student_list(
    data: AdminManualStudentListCreate,
    admin: dict = Depends(RoleChecker(allowed_roles=["admin"])),
):
    """Creer une liste d'etudiants saisie manuellement (sans fichier).

    L'admin peut creer une liste pour un enseignant (via teacher_id).
    """
    list_data = {
        "teacher_id": data.teacher_id,
        "name": data.name,
        "groupe": data.groupe,
        "file_type": "manual",
        "student_count": len(data.students),
        "status": "active",
    }
    lst = create_student_list(list_data)
    if not lst:
        raise HTTPException(status_code=500, detail="Erreur lors de la creation de la liste")

    entries = [
        {
            "list_id": lst["id"],
            "student_name": s.get("student_name", ""),
            "student_number": s.get("student_number", ""),
            "email": s.get("email"),
            "row_index": i,
        }
        for i, s in enumerate(data.students)
    ]
    create_list_entries(entries)

    create_audit_log({
        "actor_type": "admin",
        "actor_id": admin["id"],
        "action": "student_list_created",
        "resource_type": "student_list",
        "details": json.dumps({
            "list_name": data.name,
            "teacher_id": data.teacher_id,
            "entries_count": len(data.students),
            "source": "manual",
        }),
    })

    return {
        "id": lst["id"],
        "name": lst["name"],
        "student_count": len(data.students),
        "message": f"Liste '{data.name}' creee avec {len(data.students)} etudiant(s)",
    }


class AdminListConfirmRequest(BaseModel):
    name: str
    groupe: str = ""
    teacher_id: int
    column_mapping: dict
    entries: list[dict]
    original_filename: str | None = None
    file_type: str | None = None


@router.post("/student-lists/confirm", status_code=201)
def admin_confirm_student_list(
    data: AdminListConfirmRequest,
    admin: dict = Depends(RoleChecker(allowed_roles=["admin"])),
):
    """Confirmer la creation d'une liste apres revue de la preview.

    L'admin specifie le teacher_id auquel la liste sera attribuee.
    """
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom de la liste est requis")

    list_record = create_student_list({
        "teacher_id": data.teacher_id,
        "name": name,
        "groupe": data.groupe,
        "original_filename": data.original_filename,
        "file_type": data.file_type,
        "student_count": len(data.entries),
        "column_mapping": json.dumps(data.column_mapping, ensure_ascii=False),
        "status": "active",
    })

    if not list_record:
        raise HTTPException(status_code=500, detail="Erreur lors de la creation de la liste")

    db_entries = []
    for idx, entry in enumerate(data.entries):
        db_entries.append({
            "list_id": list_record["id"],
            "student_name": entry.get("student_name", "").strip(),
            "student_number": entry.get("student_number", "").strip(),
            "email": entry.get("email") or None,
            "class_name": entry.get("class_name") or None,
            "row_index": idx + 1,
        })

    created_entries = create_list_entries(db_entries)

    create_audit_log({
        "actor_type": "admin",
        "actor_id": admin["id"],
        "action": "student_list_created",
        "resource_type": "student_list",
        "resource_id": list_record["id"],
        "details": json.dumps({
            "name": name,
            "teacher_id": data.teacher_id,
            "entries_count": len(created_entries),
        }),
    })

    return {
        "list": {
            "id": list_record["id"],
            "teacher_id": list_record["teacher_id"],
            "name": list_record["name"],
            "groupe": list_record.get("groupe"),
            "original_filename": list_record.get("original_filename"),
            "file_type": list_record["file_type"],
            "student_count": len(created_entries),
            "status": list_record["status"],
            "created_at": list_record["created_at"],
            "updated_at": list_record["updated_at"],
        },
        "entries_count": len(created_entries),
        "message": f"Liste '{name}' creee avec {len(created_entries)} etudiants",
    }


@router.get("/student-lists")
def admin_list_student_lists(
    teacher_id: int = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    """Lister toutes les listes d'etudiants (filtrer par enseignant ou statut)."""
    if teacher_id:
        lists = get_teacher_lists(teacher_id, status=status_filter)
    else:
        supabase = get_supabase()
        query = supabase.table("student_lists").select("*", count="exact")
        if status_filter:
            query = query.eq("status", status_filter)
        result = query.order("created_at", desc=True).execute()
        lists = result.data or []

    return [
        {
            "id": lst["id"],
            "teacher_id": lst["teacher_id"],
            "name": lst["name"],
            "groupe": lst.get("groupe"),
            "original_filename": lst.get("original_filename"),
            "file_type": lst["file_type"],
            "student_count": lst["student_count"],
            "status": lst["status"],
            "created_at": lst["created_at"],
            "updated_at": lst["updated_at"],
        }
        for lst in lists
    ]


@router.get("/student-lists/{list_id}")
def admin_get_student_list_detail(
    list_id: int,
):
    """Detail d'une liste avec ses entrees."""
    lst = get_student_list(list_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste non trouvee")

    entries = get_list_entries(list_id)

    return {
        "list": {
            "id": lst["id"],
            "teacher_id": lst["teacher_id"],
            "name": lst["name"],
            "groupe": lst.get("groupe"),
            "original_filename": lst.get("original_filename"),
            "file_type": lst["file_type"],
            "student_count": lst["student_count"],
            "status": lst["status"],
            "created_at": lst["created_at"],
            "updated_at": lst["updated_at"],
        },
        "entries": entries,
        "column_mapping": json.loads(lst.get("column_mapping") or "{}"),
    }


@router.put("/student-lists/{list_id}")
def admin_update_student_list(
    list_id: int,
    data: dict,
):
    """Modifier les metadonnees d'une liste (nom, groupe, statut)."""
    lst = get_student_list(list_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste non trouvee")

    allowed = {"name", "groupe", "status", "teacher_id"}
    update_data = {k: v for k, v in data.items() if k in allowed}
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ valide a modifier")

    updated = update_student_list(list_id, update_data)
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la mise a jour")

    return updated


@router.delete("/student-lists/{list_id}", status_code=204)
def admin_delete_student_list(
    list_id: int,
):
    """Supprimer une liste d'etudiants (cascade supprime les entrees)."""
    lst = get_student_list(list_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste non trouvee")

    delete_student_list(list_id)

    create_audit_log({
        "actor_type": "admin",
        "actor_id": "system",
        "action": "student_list_deleted",
        "resource_type": "student_list",
        "resource_id": list_id,
        "details": json.dumps({"name": lst["name"]}),
    })

    return None


@router.get("/student-lists/{list_id}/entries")
def admin_get_list_entries(
    list_id: int,
):
    """Lister toutes les entrees d'une liste."""
    lst = get_student_list(list_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste non trouvee")
    return get_list_entries(list_id)


class AdminAddEntryRequest(BaseModel):
    student_name: str = ""
    student_number: str = ""
    email: Optional[str] = None
    class_name: Optional[str] = None


@router.post("/student-lists/{list_id}/entries", status_code=201)
def admin_add_student_entry(
    list_id: int,
    data: AdminAddEntryRequest,
):
    """Ajouter manuellement un etudiant a une liste existante."""
    lst = get_student_list(list_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste non trouvee")

    student_name = (data.student_name or "").strip()
    student_number = (data.student_number or "").strip()
    if not student_name and not student_number:
        raise HTTPException(status_code=422, detail="Nom ou matricule requis")

    if student_number:
        existing_entry = get_student_by_matricule(list_id, student_number)
        if existing_entry:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Un etudiant avec le matricule '{student_number}' existe deja dans cette liste "
                    f"(nom : {existing_entry['student_name']}). "
                    "Chaque matricule doit etre unique dans une meme liste."
                ),
            )

    existing = get_list_entries(list_id)
    next_index = len(existing)

    entry = {
        "list_id": list_id,
        "student_name": student_name,
        "student_number": student_number,
        "email": (data.email or "").strip() or None,
        "class_name": (data.class_name or "").strip() or None,
        "row_index": next_index,
    }
    created = create_list_entries([entry])
    if not created:
        raise HTTPException(status_code=500, detail="Erreur lors de l'ajout de l'etudiant")

    update_student_list(list_id, {"student_count": next_index + 1})

    return created[0]


@router.put("/student-lists/{list_id}/entries/{entry_id}")
def admin_update_list_entry(
    list_id: int,
    entry_id: int,
    data: dict,
):
    """Modifier une entree individuelle dans une liste."""
    lst = get_student_list(list_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste non trouvee")

    allowed = {"student_name", "student_number", "email", "class_name"}
    update_data = {k: v for k, v in data.items() if k in allowed}

    new_number = update_data.get("student_number")
    if new_number:
        existing = get_student_by_matricule(list_id, new_number)
        if existing and existing["id"] != entry_id:
            raise HTTPException(
                status_code=409,
                detail=f"Un autre etudiant avec le matricule '{new_number}' existe deja.",
            )

    updated = update_list_entry(entry_id, update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Entree non trouvee")

    return updated


@router.delete("/student-lists/{list_id}/entries/{entry_id}", status_code=204)
def admin_delete_list_entry(
    list_id: int,
    entry_id: int,
):
    """Supprimer une entree d'une liste."""
    lst = get_student_list(list_id)
    if not lst:
        raise HTTPException(status_code=404, detail="Liste non trouvee")

    deleted = delete_list_entry(entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Entree non trouvee")

    remaining = count_list_entries(list_id)
    update_student_list(list_id, {"student_count": remaining})

    return None
