"""Couche d'accès aux données Supabase pour PEAN.

Remplace SQLAlchemy + les modèles ORM. Fournit des helpers
pour les requêtes courantes (CRUD) sur chaque table.
"""

from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client

from core.supabase_client import get_supabase


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ==================== TEACHERS ====================

def get_teacher_by_id(teacher_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("teachers").select("*").eq("id", teacher_id).maybe_single().execute()
    return result.data


def get_teacher_by_email(email: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("teachers").select("*").eq("email", email).maybe_single().execute()
    return result.data


def create_teacher(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("teachers").insert(data).execute()
    return result.data[0] if result.data else None


def update_teacher(teacher_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("teachers").update(data).eq("id", teacher_id).execute()
    return result.data[0] if result.data else None


# ==================== EXAM SESSIONS ====================

def get_session_by_id(session_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("exam_sessions").select("*").eq("id", session_id).maybe_single().execute()
    return result.data


def get_session_by_code(code: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("exam_sessions").select("*").eq("access_code", code).maybe_single().execute()
    return result.data


def get_teacher_sessions(teacher_id: int, status: Optional[str] = None) -> list[dict]:
    supabase = get_supabase()
    query = supabase.table("exam_sessions").select("*").eq("teacher_id", teacher_id)
    if status:
        query = query.eq("status", status)
    query = query.order("created_at", desc=True)
    result = query.execute()
    return result.data or []


def create_session(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("exam_sessions").insert(data).execute()
    return result.data[0] if result.data else None


def update_session(session_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("exam_sessions").update(data).eq("id", session_id).execute()
    return result.data[0] if result.data else None


def delete_session(session_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("exam_sessions").delete().eq("id", session_id).execute()
    return True


def get_expired_sessions(now: str) -> list[dict]:
    """Sessions actives dont scheduled_start + duration est dépassé."""
    supabase = get_supabase()
    # Récupère toutes les sessions actives avec scheduled_start
    result = supabase.table("exam_sessions").select("*").eq("status", "active").is_("scheduled_start", "not.null").execute()
    return result.data or []


def get_active_sessions() -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("exam_sessions").select("*").eq("status", "active").execute()
    return result.data or []


# ==================== EXERCISES ====================

def get_exercise_by_id(exercise_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("exercises").select("*").eq("id", exercise_id).maybe_single().execute()
    return result.data


def get_teacher_exercises(teacher_id: int, subject: Optional[str] = None) -> list[dict]:
    supabase = get_supabase()
    query = supabase.table("exercises").select("*").eq("teacher_id", teacher_id)
    if subject:
        query = query.eq("subject", subject)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


def create_exercise(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("exercises").insert(data).execute()
    return result.data[0] if result.data else None


def update_exercise(exercise_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("exercises").update(data).eq("id", exercise_id).execute()
    return result.data[0] if result.data else None


def delete_exercise(exercise_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("exercises").delete().eq("id", exercise_id).execute()
    return True


# ==================== VARIANTS ====================

def get_variants_by_exercise(exercise_id: int) -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("variants").select("*").eq("exercise_id", exercise_id).order("variant_order").execute()
    return result.data or []


def get_variant_by_id(variant_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("variants").select("*").eq("id", variant_id).maybe_single().execute()
    return result.data


def create_variant(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    result = supabase.table("variants").insert(data).execute()
    return result.data[0] if result.data else None


def update_variant(variant_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("variants").update(data).eq("id", variant_id).execute()
    return result.data[0] if result.data else None


def delete_variant(variant_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("variants").delete().eq("id", variant_id).execute()
    return True


# ==================== GENERATED EXAMS ====================

def get_generated_exam_by_id(exam_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("generated_exams").select("*").eq("id", exam_id).maybe_single().execute()
    return result.data


def get_generated_exam_by_hash(sha256_hash: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("generated_exams").select("*").eq("sha256_hash", sha256_hash).maybe_single().execute()
    return result.data


def get_session_exams(session_id: int) -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("generated_exams").select("*").eq("session_id", session_id).execute()
    return result.data or []


def create_generated_exam(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    result = supabase.table("generated_exams").insert(data).execute()
    return result.data[0] if result.data else None


def update_generated_exam(exam_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("generated_exams").update(data).eq("id", exam_id).execute()
    return result.data[0] if result.data else None


def get_expired_exams(now: str) -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("generated_exams").select("*").eq("status", "started").is_("expires_at", "not.null").lte("expires_at", now).execute()
    return result.data or []


# ==================== SUBMISSIONS ====================

def get_submission_by_id(submission_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("submissions").select("*").eq("id", submission_id).maybe_single().execute()
    return result.data


def get_submission_by_exam(generated_exam_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("submissions").select("*").eq("generated_exam_id", generated_exam_id).maybe_single().execute()
    return result.data


def create_submission(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["submitted_at"] = _now()
    result = supabase.table("submissions").insert(data).execute()
    return result.data[0] if result.data else None


def get_session_submissions(session_id: int) -> list[dict]:
    """Soumissions pour une session via generated_exams."""
    supabase = get_supabase()
    result = supabase.table("submissions").select("*, generated_exam!inner(session_id)").eq("generated_exam.session_id", session_id).execute()
    return result.data or []


# ==================== CORRECTIONS ====================

def get_correction_by_id(correction_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("corrections").select("*").eq("id", correction_id).maybe_single().execute()
    return result.data


def get_correction_by_submission(submission_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("corrections").select("*").eq("submission_id", submission_id).maybe_single().execute()
    return result.data


def create_correction(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["corrected_at"] = _now()
    result = supabase.table("corrections").insert(data).execute()
    return result.data[0] if result.data else None


def update_correction(correction_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("corrections").update(data).eq("id", correction_id).execute()
    return result.data[0] if result.data else None


# ==================== SECURITY INCIDENTS ====================

def create_security_incident(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["timestamp"] = _now()
    result = supabase.table("security_incidents").insert(data).execute()
    return result.data[0] if result.data else None


def get_submission_incidents(submission_id: int) -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("security_incidents").select("*").eq("submission_id", submission_id).order("timestamp").execute()
    return result.data or []
