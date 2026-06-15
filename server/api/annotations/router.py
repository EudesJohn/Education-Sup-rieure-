"""Routeur pour les annotations de correction (RF-10).

Permet aux enseignants d'annoter des parties spécifiques des copies
et de gérer des grilles d'évaluation (rubrics).
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from core.dependencies import get_current_teacher
from core.db import (
    get_submission_by_id,
    get_correction_by_id,
    get_correction_by_submission,
    get_session_by_id,
    get_annotations_by_submission,
    get_annotations_by_correction,
    create_annotation,
    update_annotation,
    delete_annotation,
    get_rubrics_by_session,
    get_rubric_by_id,
    create_rubric,
    update_rubric,
    delete_rubric,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Annotations de correction"])


def _get_supabase():
    from core.supabase_client import get_supabase
    return get_supabase()


def _verify_submission_access(submission_id: int, teacher_id: int):
    """Vérifie que l'enseignant a accès à cette soumission."""
    sub = get_submission_by_id(submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Soumission non trouvée")

    supabase = _get_supabase()
    exam = supabase.table("generated_exams").select("*") \
        .eq("id", sub["generated_exam_id"]).maybe_single().execute()
    if not exam.data:
        raise HTTPException(status_code=404, detail="Épreuve non trouvée")

    session = get_session_by_id(exam.data["session_id"])
    if not session or session["teacher_id"] != teacher_id:
        raise HTTPException(status_code=403, detail="Accès non autorisé")

    return sub, session


# ============================================================
# ANNOTATIONS CRUD
# ============================================================


@router.get("/grading/submissions/{submission_id}/annotations")
def list_annotations(
    submission_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les annotations d'une soumission."""
    _verify_submission_access(submission_id, teacher["id"])
    return get_annotations_by_submission(submission_id)


@router.post("/grading/submissions/{submission_id}/annotations", status_code=201)
def create_submission_annotation(
    submission_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Ajouter une annotation sur une soumission."""
    sub, _ = _verify_submission_access(submission_id, teacher["id"])
    correction = get_correction_by_submission(submission_id)

    annotation_data = {
        "submission_id": submission_id,
        "correction_id": correction["id"] if correction else 0,
        "teacher_id": teacher["id"],
        "annotation_type": data.get("annotation_type", "comment"),
        "content": data.get("content", ""),
    }

    # Champs optionnels
    for field in ("exercise_id", "selection_start", "selection_end",
                  "selected_text", "score", "max_score", "is_resolved"):
        if field in data and data[field] is not None:
            annotation_data[field] = data[field]

    if not annotation_data["content"].strip():
        raise HTTPException(status_code=400, detail="Le contenu de l'annotation est vide")

    annotation = create_annotation(annotation_data)
    if not annotation:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de l'annotation")

    return annotation


@router.put("/grading/submissions/{submission_id}/annotations/{annotation_id}")
def update_submission_annotation(
    submission_id: int,
    annotation_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Modifier une annotation."""
    _verify_submission_access(submission_id, teacher["id"])

    updated = update_annotation(annotation_id, data)
    if not updated:
        raise HTTPException(status_code=404, detail="Annotation non trouvée")
    return updated


@router.delete("/grading/submissions/{submission_id}/annotations/{annotation_id}",
               status_code=204)
def delete_submission_annotation(
    submission_id: int,
    annotation_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer une annotation."""
    _verify_submission_access(submission_id, teacher["id"])
    delete_annotation(annotation_id)
    return None


# ============================================================
# NAVIGATION ENTRE SOUMISSIONS
# ============================================================


@router.get("/grading/sessions/{session_id}/submissions/navigation")
def get_submission_navigation(
    session_id: int,
    current_submission_id: int = None,
    teacher: dict = Depends(get_current_teacher),
):
    """Liste ordonnée des soumissions d'une session pour navigation.

    Retourne la liste complète avec indication de la soumission courante.
    """
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    supabase = _get_supabase()
    exams = supabase.table("generated_exams").select("id") \
        .eq("session_id", session_id).execute()
    if not exams.data:
        return {"submissions": [], "current_index": -1, "total": 0}

    submissions = []
    current_index = -1
    for i, exam in enumerate(exams.data):
        sub = supabase.table("submissions").select("id, student_name, student_number") \
            .eq("generated_exam_id", exam["id"]).maybe_single().execute()
        if sub.data:
            entry = {
                "submission_id": sub.data["id"],
                "student_name": sub.data["student_name"],
                "student_number": sub.data["student_number"],
            }
            submissions.append(entry)
            if current_submission_id and sub.data["id"] == current_submission_id:
                current_index = i

    return {
        "submissions": submissions,
        "current_index": current_index,
        "total": len(submissions),
    }


# ============================================================
# RUBRICS (Grilles d'évaluation)
# ============================================================


@router.get("/grading/sessions/{session_id}/rubrics")
def list_session_rubrics(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les grilles d'évaluation d'une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    return get_rubrics_by_session(session_id)


@router.post("/grading/sessions/{session_id}/rubrics", status_code=201)
def create_session_rubric(
    session_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Créer une grille d'évaluation pour une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    if "title" not in data or not data.get("title", "").strip():
        raise HTTPException(status_code=400, detail="Le titre de la grille est requis")

    rubric = create_rubric({
        "session_id": session_id,
        "teacher_id": teacher["id"],
        "title": data["title"],
        "description": data.get("description"),
        "criteria": json.dumps(data.get("criteria", [])),
        "max_score": data.get("max_score"),
    })

    if not rubric:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de la grille")
    return rubric


@router.put("/grading/sessions/{session_id}/rubrics/{rubric_id}")
def update_session_rubric(
    session_id: int,
    rubric_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Modifier une grille d'évaluation."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    rubric = get_rubric_by_id(rubric_id)
    if not rubric or rubric["session_id"] != session_id:
        raise HTTPException(status_code=404, detail="Grille non trouvée")

    update_data = {}
    if "title" in data and data["title"]:
        update_data["title"] = data["title"]
    if "description" in data:
        update_data["description"] = data["description"]
    if "criteria" in data:
        update_data["criteria"] = json.dumps(data["criteria"])
    if "max_score" in data:
        update_data["max_score"] = data["max_score"]
    if "is_active" in data:
        update_data["is_active"] = data["is_active"]

    updated = update_rubric(rubric_id, update_data)
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour")
    return updated


@router.delete("/grading/sessions/{session_id}/rubrics/{rubric_id}",
               status_code=204)
def delete_session_rubric(
    session_id: int,
    rubric_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer une grille d'évaluation."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    rubric = get_rubric_by_id(rubric_id)
    if not rubric or rubric["session_id"] != session_id:
        raise HTTPException(status_code=404, detail="Grille non trouvée")

    delete_rubric(rubric_id)
    return None
