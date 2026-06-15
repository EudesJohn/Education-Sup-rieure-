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
    return result.data if result else None


def get_teacher_by_email(email: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("teachers").select("*").eq("email", email).maybe_single().execute()
    return result.data if result else None


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
    return result.data if result else None


def get_session_by_code(code: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("exam_sessions").select("*").eq("access_code", code).maybe_single().execute()
    return result.data if result else None


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
    return result.data if result else None


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
    return result.data if result else None


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
    return result.data if result else None


def get_generated_exam_by_hash(sha256_hash: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("generated_exams").select("*").eq("sha256_hash", sha256_hash).maybe_single().execute()
    return result.data if result else None


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
    return result.data if result else None


def get_submission_by_exam(generated_exam_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("submissions").select("*").eq("generated_exam_id", generated_exam_id).maybe_single().execute()
    return result.data if result else None


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
    return result.data if result else None


def get_correction_by_submission(submission_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("corrections").select("*").eq("submission_id", submission_id).maybe_single().execute()
    return result.data if result else None


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


# ==================== INSTITUTIONS ====================

def get_institution_by_id(institution_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("institutions").select("*").eq("id", institution_id).maybe_single().execute()
    return result.data if result else None


def get_institution_by_name(name: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("institutions").select("*").eq("name", name).maybe_single().execute()
    return result.data if result else None


def list_institutions() -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("institutions").select("*").order("name").execute()
    return result.data or []


def create_institution(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("institutions").insert(data).execute()
    return result.data[0] if result.data else None


def update_institution(institution_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("institutions").update(data).eq("id", institution_id).execute()
    return result.data[0] if result.data else None


def delete_institution(institution_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("institutions").delete().eq("id", institution_id).execute()
    return True


# ==================== SUBJECTS ====================

def get_subject_by_id(subject_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("subjects").select("*").eq("id", subject_id).maybe_single().execute()
    return result.data if result else None


def get_subject_by_name(name: str) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("subjects").select("*").eq("name", name).maybe_single().execute()
    return result.data if result else None


def list_subjects() -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("subjects").select("*").order("name").execute()
    return result.data or []


def create_subject(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("subjects").insert(data).execute()
    return result.data[0] if result.data else None


def update_subject(subject_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("subjects").update(data).eq("id", subject_id).execute()
    return result.data[0] if result.data else None


def delete_subject(subject_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("subjects").delete().eq("id", subject_id).execute()
    return True


# ==================== STUDENT LISTS (CDC v2.2 RF-02) ====================

def create_student_list(data: dict) -> Optional[dict]:
    """Créer une nouvelle liste d'étudiants."""
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("student_lists").insert(data).execute()
    return result.data[0] if result.data else None


def get_student_list(list_id: int) -> Optional[dict]:
    """Récupérer une liste par son ID."""
    supabase = get_supabase()
    result = supabase.table("student_lists").select("*").eq("id", list_id).maybe_single().execute()
    return result.data if result else None


def get_teacher_lists(teacher_id: int, status: Optional[str] = None) -> list[dict]:
    """Lister les listes d'un enseignant."""
    supabase = get_supabase()
    query = supabase.table("student_lists").select("*").eq("teacher_id", teacher_id)
    if status:
        query = query.eq("status", status)
    result = query.order("created_at", desc=True).execute()
    return result.data or []


def update_student_list(list_id: int, data: dict) -> Optional[dict]:
    """Mettre à jour une liste."""
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("student_lists").update(data).eq("id", list_id).execute()
    return result.data[0] if result.data else None


def delete_student_list(list_id: int) -> bool:
    """Supprimer une liste (cascade supprime les entrées)."""
    supabase = get_supabase()
    supabase.table("student_lists").delete().eq("id", list_id).execute()
    return True


def create_list_entries(entries: list[dict]) -> list[dict]:
    """Insérer plusieurs entrées dans une liste."""
    if not entries:
        return []
    supabase = get_supabase()
    now = _now()
    for e in entries:
        e["created_at"] = now
    result = supabase.table("student_list_entries").insert(entries).execute()
    return result.data or []


def get_list_entries(list_id: int) -> list[dict]:
    """Récupérer toutes les entrées d'une liste."""
    supabase = get_supabase()
    result = supabase.table("student_list_entries").select("*").eq("list_id", list_id).order("row_index").execute()
    return result.data or []


def get_student_by_matricule(list_id: int, student_number: str) -> Optional[dict]:
    """Chercher un étudiant par matricule dans une liste spécifique."""
    supabase = get_supabase()
    result = (supabase.table("student_list_entries")
              .select("*")
              .eq("list_id", list_id)
              .eq("student_number", student_number)
              .maybe_single()
              .execute())
    return result.data if result else None


def get_student_list_entry_by_id(entry_id: int) -> Optional[dict]:
    """Récupérer une entrée par son ID."""
    supabase = get_supabase()
    result = supabase.table("student_list_entries").select("*").eq("id", entry_id).maybe_single().execute()
    return result.data if result else None


def update_list_entry(entry_id: int, data: dict) -> Optional[dict]:
    """Modifier une entrée individuelle."""
    supabase = get_supabase()
    result = supabase.table("student_list_entries").update(data).eq("id", entry_id).execute()
    return result.data[0] if result.data else None


def delete_list_entry(entry_id: int) -> bool:
    """Supprimer une entrée."""
    supabase = get_supabase()
    supabase.table("student_list_entries").delete().eq("id", entry_id).execute()
    return True


def count_list_entries(list_id: int) -> int:
    """Compter les entrées d'une liste."""
    supabase = get_supabase()
    result = supabase.table("student_list_entries").select("*", count="exact").eq("list_id", list_id).execute()
    return result.count or 0


# ==================== AUDIT LOGS (CDC v2.2) ====================

def create_audit_log(data: dict) -> Optional[dict]:
    """Journaliser une action critique."""
    supabase = get_supabase()
    data["created_at"] = _now()
    result = supabase.table("audit_logs").insert(data).execute()
    return result.data[0] if result.data else None


def query_audit_logs(
    actor_type: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    """Rechercher dans les logs d'audit."""
    supabase = get_supabase()
    query = supabase.table("audit_logs").select("*")
    if actor_type:
        query = query.eq("actor_type", actor_type)
    if action:
        query = query.eq("action", action)
    if resource_type:
        query = query.eq("resource_type", resource_type)
    result = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    return result.data or []


def count_audit_logs(
    actor_type: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
) -> int:
    """Compter les logs d'audit."""
    supabase = get_supabase()
    query = supabase.table("audit_logs").select("*", count="exact")
    if actor_type:
        query = query.eq("actor_type", actor_type)
    if action:
        query = query.eq("action", action)
    if resource_type:
        query = query.eq("resource_type", resource_type)
    result = query.execute()
    return result.count or 0


# ==================== CODE EXECUTIONS (CDC v2.2 RF-08) ====================

def create_code_execution(data: dict) -> Optional[dict]:
    """Enregistrer une exécution de code."""
    supabase = get_supabase()
    data["executed_at"] = _now()
    result = supabase.table("code_executions").insert(data).execute()
    return result.data[0] if result.data else None


def get_submission_executions(submission_id: int) -> list[dict]:
    """Récupérer l'historique des exécutions d'une soumission."""
    supabase = get_supabase()
    result = supabase.table("code_executions").select("*").eq("submission_id", submission_id).order("executed_at").execute()
    return result.data or []


def get_session_executions(session_id: int, limit: int = 50) -> list[dict]:
    """Récupérer les exécutions d'une session."""
    supabase = get_supabase()
    result = supabase.table("code_executions").select("*").eq("session_id", session_id).order("executed_at", desc=True).limit(limit).execute()
    return result.data or []


# ============================================================
# PEDAGOGICAL DOCUMENTS (RF-06)
# ============================================================

def create_pedagogical_document(data: dict) -> Optional[dict]:
    """Créer un dossier pédagogique."""
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("pedagogical_documents").insert(data).execute()
    return result.data[0] if result.data else None


def get_pedagogical_document(doc_id: int) -> Optional[dict]:
    """Récupérer un document par son ID."""
    supabase = get_supabase()
    result = supabase.table("pedagogical_documents").select("*").eq("id", doc_id).maybe_single().execute()
    return result.data if result else None


def list_pedagogical_documents(
    teacher_id: int,
    document_type: Optional[str] = None,
    subject: Optional[str] = None,
    status: str = "active",
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Lister les documents pédagogiques d'un enseignant."""
    supabase = get_supabase()
    query = supabase.table("pedagogical_documents").select("*").eq("teacher_id", teacher_id).eq("status", status)
    if document_type:
        query = query.eq("document_type", document_type)
    if subject:
        query = query.eq("subject", subject)
    result = query.order("created_at", desc=True).limit(limit).offset(offset).execute()
    return result.data or []


def update_pedagogical_document(doc_id: int, data: dict) -> Optional[dict]:
    """Mettre à jour un document."""
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("pedagogical_documents").update(data).eq("id", doc_id).execute()
    return result.data[0] if result.data else None


def delete_pedagogical_document(doc_id: int) -> bool:
    """Supprimer un document."""
    supabase = get_supabase()
    supabase.table("pedagogical_documents").delete().eq("id", doc_id).execute()
    return True


def search_pedagogical_documents(
    teacher_id: int,
    query: str,
    limit: int = 20,
) -> list[dict]:
    """Recherche full-text dans les documents."""
    supabase = get_supabase()
    result = supabase.table("pedagogical_documents").select("*") \
        .eq("teacher_id", teacher_id) \
        .text_search("search_vector", query, type="websearch") \
        .limit(limit) \
        .execute()
    return result.data or []


def count_pedagogical_documents(teacher_id: int) -> dict:
    """Compter les documents par type."""
    supabase = get_supabase()
    docs = supabase.table("pedagogical_documents").select("document_type").eq("teacher_id", teacher_id).eq("status", "active").execute()
    data = docs.data or []
    counts: dict = {"total": len(data)}
    for d in data:
        dt = d.get("document_type", "other")
        counts[dt] = counts.get(dt, 0) + 1
    return counts


# ============================================================
# Correction Annotations (RF-10)
# ============================================================

def get_annotations_by_submission(submission_id: int) -> list[dict]:
    """Lister les annotations d'une soumission."""
    supabase = get_supabase()
    result = supabase.table("correction_annotations") \
        .select("*") \
        .eq("submission_id", submission_id) \
        .order("created_at") \
        .execute()
    return result.data or []


def get_annotations_by_correction(correction_id: int) -> list[dict]:
    """Lister les annotations d'une correction."""
    supabase = get_supabase()
    result = supabase.table("correction_annotations") \
        .select("*") \
        .eq("correction_id", correction_id) \
        .order("created_at") \
        .execute()
    return result.data or []


def create_annotation(data: dict) -> Optional[dict]:
    """Créer une annotation sur une copie."""
    supabase = get_supabase()
    fields = {
        "correction_id", "submission_id", "teacher_id", "exercise_id",
        "annotation_type", "selection_start", "selection_end",
        "selected_text", "content", "score", "max_score",
    }
    payload = {k: v for k, v in data.items() if k in fields and v is not None}
    result = supabase.table("correction_annotations").insert(payload).execute()
    return result.data[0] if result.data else None


def update_annotation(annotation_id: int, data: dict) -> Optional[dict]:
    """Mettre à jour une annotation."""
    supabase = get_supabase()
    allowed = {"content", "annotation_type", "score", "max_score",
               "is_resolved", "resolved_at", "selection_start", "selection_end"}
    payload = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not payload:
        return None
    result = supabase.table("correction_annotations").update(payload) \
        .eq("id", annotation_id).execute()
    return result.data[0] if result.data else None


def delete_annotation(annotation_id: int) -> bool:
    """Supprimer une annotation."""
    supabase = get_supabase()
    supabase.table("correction_annotations").delete().eq("id", annotation_id).execute()
    return True


# ============================================================
# Correction Rubrics (RF-10)
# ============================================================

def get_rubrics_by_session(session_id: int) -> list[dict]:
    """Lister les grilles d'évaluation d'une session."""
    supabase = get_supabase()
    result = supabase.table("correction_rubrics") \
        .select("*") \
        .eq("session_id", session_id) \
        .eq("is_active", True) \
        .order("created_at") \
        .execute()
    return result.data or []


def get_rubric_by_id(rubric_id: int) -> Optional[dict]:
    """Détail d'une grille d'évaluation."""
    supabase = get_supabase()
    result = supabase.table("correction_rubrics") \
        .select("*") \
        .eq("id", rubric_id) \
        .maybe_single() \
        .execute()
    return result.data


def create_rubric(data: dict) -> Optional[dict]:
    """Créer une grille d'évaluation."""
    supabase = get_supabase()
    fields = {"session_id", "teacher_id", "title", "description", "criteria", "max_score"}
    payload = {k: v for k, v in data.items() if k in fields and v is not None}
    result = supabase.table("correction_rubrics").insert(payload).execute()
    return result.data[0] if result.data else None


def update_rubric(rubric_id: int, data: dict) -> Optional[dict]:
    """Mettre à jour une grille."""
    supabase = get_supabase()
    allowed = {"title", "description", "criteria", "max_score", "is_active"}
    payload = {k: v for k, v in data.items() if k in allowed and v is not None}
    if not payload:
        return None
    result = supabase.table("correction_rubrics").update(payload) \
        .eq("id", rubric_id).execute()
    return result.data[0] if result.data else None


def delete_rubric(rubric_id: int) -> bool:
    """Supprimer une grille."""
    supabase = get_supabase()
    supabase.table("correction_rubrics").delete().eq("id", rubric_id).execute()
    return True


# ============================================================
# Session Access Codes (identifiants uniques par étudiant)
# ============================================================

import random
import string


def generate_session_access_codes(
    session_id: int,
    teacher_id: int,
    entries: list[dict],
) -> list[dict]:
    """Générer des codes PIN uniques pour chaque étudiant d'une session.

    Chaque étudiant reçoit un code à 6 chiffres.
    Les codes existants sont d'abord supprimés pour cette session.
    """
    supabase = get_supabase()

    # Supprimer les anciens codes
    supabase.table("session_access_codes").delete().eq("session_id", session_id).execute()

    # Générer les nouveaux codes
    codes = []
    used_pins = set()

    for entry in entries:
        # Générer un PIN unique à 6 chiffres
        while True:
            pin = "".join(random.choices(string.digits, k=6))
            if pin not in used_pins:
                used_pins.add(pin)
                break

        code_record = {
            "session_id": session_id,
            "teacher_id": teacher_id,
            "student_name": entry.get("student_name", ""),
            "student_number": entry.get("student_number", ""),
            "class_name": entry.get("class_name"),
            "access_pin": pin,
        }
        codes.append(code_record)

    # Insérer en masse
    if codes:
        result = supabase.table("session_access_codes").insert(codes).execute()
        return result.data or []
    return []


def get_session_access_codes(session_id: int) -> list[dict]:
    """Lister les codes d'accès d'une session."""
    supabase = get_supabase()
    result = supabase.table("session_access_codes") \
        .select("*") \
        .eq("session_id", session_id) \
        .order("student_name") \
        .execute()
    return result.data or []


def get_access_code_by_pin(access_pin: str) -> Optional[dict]:
    """Trouver un code d'accès par son PIN."""
    supabase = get_supabase()
    result = supabase.table("session_access_codes") \
        .select("*") \
        .eq("access_pin", access_pin) \
        .eq("is_used", False) \
        .maybe_single() \
        .execute()
    return result.data


def mark_access_code_used(pin_id: int) -> bool:
    """Marquer un code d'accès comme utilisé."""
    supabase = get_supabase()
    supabase.table("session_access_codes") \
        .update({"is_used": True, "used_at": _now()}) \
        .eq("id", pin_id) \
        .execute()
    return True


def count_used_codes(session_id: int) -> int:
    """Compter les codes utilisés dans une session."""
    supabase = get_supabase()
    result = supabase.table("session_access_codes") \
        .select("id", count="exact") \
        .eq("session_id", session_id) \
        .eq("is_used", True) \
        .execute()
    return result.count or 0


# ============================================================
# FILIERES (branches d'étude liées à un établissement)
# ============================================================

def get_filiere_by_id(filiere_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("filieres").select("*").eq("id", filiere_id).maybe_single().execute()
    return result.data


def list_filieres(institution_id: Optional[int] = None) -> list[dict]:
    supabase = get_supabase()
    query = supabase.table("filieres").select("*")
    if institution_id is not None:
        query = query.eq("institution_id", institution_id)
    result = query.order("name").execute()
    return result.data or []


def create_filiere(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    data["updated_at"] = _now()
    result = supabase.table("filieres").insert(data).execute()
    return result.data[0] if result.data else None


def update_filiere(filiere_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["updated_at"] = _now()
    result = supabase.table("filieres").update(data).eq("id", filiere_id).execute()
    return result.data[0] if result.data else None


def delete_filiere(filiere_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("filieres").delete().eq("id", filiere_id).execute()
    return True


# ============================================================
# ACADEMIC YEARS (années académiques)
# ============================================================

def get_academic_year_by_id(year_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("academic_years").select("*").eq("id", year_id).maybe_single().execute()
    return result.data


def list_academic_years() -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("academic_years").select("*").order("name", desc=True).execute()
    return result.data or []


def create_academic_year(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    result = supabase.table("academic_years").insert(data).execute()
    return result.data[0] if result.data else None


def update_academic_year(year_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("academic_years").update(data).eq("id", year_id).execute()
    return result.data[0] if result.data else None


def delete_academic_year(year_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("academic_years").delete().eq("id", year_id).execute()
    return True


# ============================================================
# CLASSES (classe = filière + année académique)
# ============================================================

def get_class_by_id(class_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("classes").select("*").eq("id", class_id).maybe_single().execute()
    return result.data


def list_classes(
    filiere_id: Optional[int] = None,
    academic_year_id: Optional[int] = None,
) -> list[dict]:
    supabase = get_supabase()
    query = supabase.table("classes").select("*")
    if filiere_id is not None:
        query = query.eq("filiere_id", filiere_id)
    if academic_year_id is not None:
        query = query.eq("academic_year_id", academic_year_id)
    result = query.order("name").execute()
    return result.data or []


def create_class(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    result = supabase.table("classes").insert(data).execute()
    return result.data[0] if result.data else None


def update_class(class_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("classes").update(data).eq("id", class_id).execute()
    return result.data[0] if result.data else None


def delete_class(class_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("classes").delete().eq("id", class_id).execute()
    return True


# ============================================================
# CLASS STUDENTS (étudiants d'une classe, gérés par l'admin)
# ============================================================

def get_class_student_by_id(student_id: int) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("class_students").select("*").eq("id", student_id).maybe_single().execute()
    return result.data


def list_class_students(class_id: int) -> list[dict]:
    supabase = get_supabase()
    result = supabase.table("class_students") \
        .select("*") \
        .eq("class_id", class_id) \
        .order("student_name") \
        .execute()
    return result.data or []


def create_class_student(data: dict) -> Optional[dict]:
    supabase = get_supabase()
    data["created_at"] = _now()
    result = supabase.table("class_students").insert(data).execute()
    return result.data[0] if result.data else None


def update_class_student(student_id: int, data: dict) -> Optional[dict]:
    supabase = get_supabase()
    result = supabase.table("class_students").update(data).eq("id", student_id).execute()
    return result.data[0] if result.data else None


def delete_class_student(student_id: int) -> bool:
    supabase = get_supabase()
    supabase.table("class_students").delete().eq("id", student_id).execute()
    return True


def bulk_create_class_students(class_id: int, students: list[dict]) -> list[dict]:
    """Insérer plusieurs étudiants dans une classe en une requête."""
    supabase = get_supabase()
    now = _now()
    for s in students:
        s["class_id"] = class_id
        s.setdefault("created_at", now)
    result = supabase.table("class_students").insert(students).execute()
    return result.data or []
