"""Routeur pour le module d'administration."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.dependencies import RoleChecker
from core.supabase_client import get_supabase
from core.db import get_teacher_by_id

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
        "incident_breakdown": dict(type_counts),
    }


@router.get("/teachers")
def list_teachers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Liste tous les enseignants inscrits."""
    supabase = get_supabase()
    # Récupérer les enseignants avec comptage
    result = supabase.table("teachers").select("*", count="exact").range(skip, skip + limit - 1).order("created_at", desc=True).execute()
    teachers = result.data or []

    enriched = []
    for t in teachers:
        # Compter sessions et exercices
        sessions_count = _count("exam_sessions", {"teacher_id": t["id"]})
        exercises_count = _count("exercises", {"teacher_id": t["id"]})
        enriched.append({
            "id": t["id"],
            "email": t["email"],
            "full_name": t["full_name"],
            "institution": t["institution"],
            "discipline": t["discipline"],
            "is_verified": t["is_verified"],
            "created_at": t["created_at"],
            "sessions_count": sessions_count,
            "exercises_count": exercises_count,
        })

    return enriched


@router.get("/teachers/{teacher_id}")
def get_teacher_detail(
    teacher_id: int,
):
    """Détail d'un enseignant."""
    teacher = get_teacher_by_id(teacher_id)
    if not teacher:
        raise HTTPException(status_code=404, detail="Enseignant non trouvé")

    supabase = get_supabase()

    # Récupérer les sessions
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
        "is_2fa_enabled": teacher["is_2fa_enabled"],
        "created_at": teacher["created_at"],
        "sessions": sessions,
        "exercises_count": exercises_count,
    }


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

        # Compter les soumissions
        subs_count = _count("submissions")
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
            # Chercher la session associée
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
