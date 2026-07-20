"""Routeur pour la correction et la notation des copies."""

import asyncio
import csv
import io
import json
import codecs

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from core.dependencies import get_current_teacher
from core.db import (
    get_session_by_id,
    get_session_exams,
    get_submission_by_id,
    get_submission_by_exam,
    get_correction_by_id,
    get_correction_by_submission,
    list_class_students,
    get_list_entries,
)
from core.security import hash_student_identifier
from core.supabase_client import get_supabase

router = APIRouter()


@router.get("/sessions/{session_id}/submissions")
def list_submissions(
    session_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: str = Query(None, alias="status"),
    teacher: dict = Depends(get_current_teacher),
):
    """Liste toutes les soumissions d'une session (paginé)."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    exams = get_session_exams(session_id)
    total = len(exams)

    results = []
    for exam in exams[skip:skip + limit]:
        submission = get_submission_by_exam(exam["id"])
        if not submission:
            continue

        correction = get_correction_by_submission(submission["id"])

        if status_filter:
            corr_status = correction["correction_status"] if correction else "pending"
            if corr_status != status_filter:
                continue

        results.append({
            "submission_id": submission["id"],
            "student_name": submission["student_name"],
            "student_number": submission["student_number"],
            "class_name": submission.get("class_name"),
            "submitted_at": submission["submitted_at"],
            "auto_submitted": submission["auto_submitted"],
            "correction_status": correction["correction_status"] if correction else "pending",
            "final_score": correction.get("final_score") if correction else None,
            "ai_score": correction.get("ai_score") if correction else None,
        })

    results.sort(key=lambda x: x["student_name"])
    return {"items": results, "total": total, "skip": skip, "limit": limit}


@router.get("/submissions/{submission_id}")
def get_submission_detail(
    submission_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Récupère le détail complet d'une soumission (copie + correction)."""
    submission = get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Soumission non trouvée")

    # Vérifier propriétaire
    supabase = get_supabase()
    exam = supabase.table("generated_exams").select("*").eq("id", submission["generated_exam_id"]).maybe_single().execute()
    if not exam.data:
        raise HTTPException(status_code=404, detail="Épreuve non trouvée")
    exam = exam.data

    session = get_session_by_id(exam["session_id"])
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")

    correction = get_correction_by_submission(submission_id)

    base = {
        "id": submission["id"],
        "student_name": submission["student_name"],
        "student_number": submission["student_number"],
        "class_name": submission.get("class_name"),
        "university": submission.get("university"),
        "submitted_at": submission["submitted_at"],
        "auto_submitted": submission["auto_submitted"],
    }

    if correction:
        correction_data = {
            "id": correction["id"],
            "ai_score": correction.get("ai_score"),
            "ai_feedback": correction.get("ai_feedback"),
            "ai_detailed_scores": correction.get("ai_detailed_scores"),
            "ai_corrected_at": correction.get("ai_corrected_at"),
            "teacher_score": correction.get("teacher_score"),
            "teacher_feedback": correction.get("teacher_feedback"),
            "final_score": correction.get("final_score"),
            "correction_status": correction["correction_status"],
            "grading_system": correction["grading_system"],
        }
    else:
        correction_data = {
            "id": None,
            "ai_score": None,
            "ai_feedback": None,
            "ai_detailed_scores": None,
            "ai_corrected_at": None,
            "teacher_score": None,
            "teacher_feedback": None,
            "final_score": None,
            "correction_status": "pending",
            "grading_system": session["grading_system"],
        }

    return {
        "submission": base,
        "exam_content": exam["content"],
        "student_content": submission["content"],
        "correction": correction_data,
    }


@router.post("/submissions/{submission_id}/correct-ai")
async def trigger_ai_correction(
    submission_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Déclenche la correction IA pour une soumission."""
    submission = get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Soumission non trouvée")

    supabase = get_supabase()
    exam = supabase.table("generated_exams").select("*").eq("id", submission["generated_exam_id"]).maybe_single().execute()
    if not exam.data:
        raise HTTPException(status_code=404, detail="Épreuve non trouvée")
    exam = exam.data

    session = get_session_by_id(exam["session_id"])
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")

    from services.correction_ai import AICorrectionService
    correction_service = AICorrectionService()

    try:
        correction = await correction_service.correct_submission(submission_id)
        return correction
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la correction IA : {str(e)}",
        )


@router.post("/corrections/{correction_id}/review")
def teacher_review(
    correction_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """L'enseignant révise et valide une correction."""
    correction = get_correction_by_id(correction_id)
    if not correction:
        raise HTTPException(status_code=404, detail="Correction non trouvée")

    # Vérifier le propriétaire
    supabase = get_supabase()
    sub = supabase.table("submissions").select("*").eq("id", correction["submission_id"]).maybe_single().execute()
    if not sub.data:
        raise HTTPException(status_code=404, detail="Soumission non trouvée")
    exam = supabase.table("generated_exams").select("*").eq("id", sub.data["generated_exam_id"]).maybe_single().execute()
    session = get_session_by_id(exam.data["session_id"]) if exam.data else None
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")

    from services.correction_ai import AICorrectionService
    correction_service = AICorrectionService()

    updated = correction_service.teacher_review(
        correction_id=correction_id,
        teacher_id=teacher["id"],
        teacher_score=data.get("teacher_score", 0),
        teacher_feedback=data.get("teacher_feedback", ""),
    )

    return updated


@router.post("/submissions/{submission_id}/correct-qcm")
async def auto_correct_qcm(
    submission_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Correction automatique des QCM uniquement."""
    submission = get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Soumission non trouvée")

    supabase = get_supabase()
    exam = supabase.table("generated_exams").select("*").eq("id", submission["generated_exam_id"]).maybe_single().execute()
    if not exam.data:
        raise HTTPException(status_code=404, detail="Épreuve non trouvée")
    exam = exam.data

    session = get_session_by_id(exam["session_id"])
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")

    from services.qcm_correction import QCMCorrectionService
    qcm_service = QCMCorrectionService()
    result = qcm_service.auto_correct_qcm(
        exam_content=exam["content"],
        submission_content=submission["content"],
        grading_details=session.get("grading_details"),
    )

    return {
        "submission_id": submission_id,
        "has_qcm": len(result.get("qcm_results", [])) > 0,
        "qcm_score": result.get("qcm_score"),
        "qcm_max_score": result.get("qcm_max_score"),
        "qcm_results": result.get("qcm_results"),
        "distractor_analysis": result.get("distractor_analysis"),
    }


@router.get("/sessions/{session_id}/qcm-analysis")
def get_qcm_analysis(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Analyse globale des réponses QCM pour une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    exams = get_session_exams(session_id)
    from services.qcm_correction import QCMCorrectionService
    qcm_service = QCMCorrectionService()

    all_qcm_results = []
    global_distractors = {}

    for exam in exams:
        sub = get_submission_by_exam(exam["id"])
        if not sub:
            continue

        result = qcm_service.auto_correct_qcm(
            exam_content=exam["content"],
            submission_content=sub["content"],
            grading_details=session.get("grading_details"),
        )

        if result.get("qcm_results"):
            all_qcm_results.append({
                "student_name": sub["student_name"],
                "student_number": sub["student_number"],
                "results": result["qcm_results"],
            })

        for dist in result.get("distractor_analysis", []):
            ex_id = dist.get("exercise_id")
            if ex_id not in global_distractors:
                global_distractors[ex_id] = {
                    "title": dist.get("exercise_title", f"Exercice {ex_id}"),
                    "total_students": 0,
                    "distractors": {},
                }
            global_distractors[ex_id]["total_students"] += 1
            for d in dist.get("analysis", []):
                opt = d.get("option", "")
                selected = d.get("selected", False)
                is_correct = d.get("correct", False)
                if opt:
                    if opt not in global_distractors[ex_id]["distractors"]:
                        global_distractors[ex_id]["distractors"][opt] = {
                            "label": opt,
                            "correct": is_correct,
                            "count": 0,
                        }
                    if selected:
                        global_distractors[ex_id]["distractors"][opt]["count"] += 1

    exercise_stats = []
    for ex_id, data in global_distractors.items():
        total = data["total_students"]
        dist_list = list(data["distractors"].values())
        correct_opt = [d for d in dist_list if d["correct"]]
        avg_correct_rate = (
            sum(d["count"] for d in correct_opt) / (total * len(correct_opt)) * 100
            if total > 0 and correct_opt else 0
        )
        exercise_stats.append({
            "exercise_id": ex_id,
            "title": data["title"],
            "total_students": total,
            "avg_correct_rate": round(avg_correct_rate, 1),
            "distractors": dist_list,
        })

    return {
        "session_title": session["title"],
        "grading_system": session["grading_system"],
        "exercise_stats": exercise_stats,
        "student_results": all_qcm_results,
    }


@router.post("/sessions/{session_id}/correct-all")
async def correct_all_pending(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lance la correction IA pour toutes les soumissions en attente d'une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    exams = get_session_exams(session_id)
    pending_subs = []
    for exam in exams:
        sub = get_submission_by_exam(exam["id"])
        if sub:
            corr = get_correction_by_submission(sub["id"])
            if not corr or corr["correction_status"] == "pending":
                pending_subs.append(sub)

    from services.correction_ai import AICorrectionService
    correction_service = AICorrectionService()
    sem = asyncio.Semaphore(5)

    async def _correct_one(sub: dict) -> dict:
        async with sem:
            try:
                correction = await correction_service.correct_submission(sub["id"])
                return {"submission_id": sub["id"], "status": "success", "correction_id": correction["id"]}
            except Exception as e:
                return {"submission_id": sub["id"], "status": "error", "error": str(e)}

    tasks = [_correct_one(sub) for sub in pending_subs]
    results = await asyncio.gather(*tasks)

    return {
        "total": len(pending_subs),
        "success": sum(1 for r in results if r["status"] == "success"),
        "errors": sum(1 for r in results if r["status"] == "error"),
        "results": results,
    }


@router.get("/sessions/{session_id}/results/export")
def export_results_csv(
    session_id: int,
    fmt: str = Query("csv", alias="format"),
    teacher: dict = Depends(get_current_teacher),
):
    """Exporte les résultats d'une session au format CSV (colonnes en français, tous les étudiants)."""
    import traceback
    try:
        session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    exams = get_session_exams(session_id)

    # ---- Reconstruire la liste des étudiants avec leurs vrais noms ----
    student_map: dict[str, str] = {}  # student_id_hash -> nom
    student_number_map: dict[str, str] = {}  # student_id_hash -> numero

    if session.get("class_id"):
        students = list_class_students(session["class_id"])
        for s in students:
            h = hash_student_identifier(session_id, s["student_number"])
            student_map[h] = s["student_name"]
            student_number_map[h] = s["student_number"]
    elif session.get("student_list_id"):
        entries = get_list_entries(session["student_list_id"])
        for e in entries:
            h = hash_student_identifier(session_id, e["student_number"])
            student_map[h] = e["student_name"]
            student_number_map[h] = e["student_number"]
    else:
        # Fallback : generer des noms sequentiels
        for i in range(session.get("student_count", 0)):
            sn = f"PEAN_{session_id}_{i + 1:04d}"
            h = hash_student_identifier(session_id, sn)
            student_map[h] = f"Etudiant {i + 1}"
            student_number_map[h] = sn

    rows = []
    for exam in exams:
        hid = exam.get("student_id_hash", "")
        student_name = student_map.get(hid, "Inconnu")
        student_number = student_number_map.get(hid, "")

        sub = get_submission_by_exam(exam["id"])
        if sub:
            # Utiliser le nom de la soumission SAUF si c'est un placeholder technique
            sub_name = sub["student_name"] or ""
            if sub_name.startswith("EXIT-") or sub_name.startswith("INCIDENT-") or "Soumission automatique" in sub_name:
                sub_name = student_map.get(hid, "Inconnu")
            student_name = sub_name
            student_number = sub.get("student_number", student_number)
            corr = get_correction_by_submission(sub["id"])
            rows.append({
                "nom": student_name,
                "matricule": student_number,
                "classe": sub.get("class_name", ""),
                "date_remise": sub.get("submitted_at", ""),
                "statut": "corrigé" if (corr and corr["correction_status"] == "completed") else "en_attente",
                "note_ia": str(corr.get("ai_score", "")) if corr else "",
                "note_enseignant": str(corr.get("teacher_score", "")) if corr else "",
                "note_finale": str(corr.get("final_score", "")) if corr else "",
            })
        else:
            rows.append({
                "nom": student_name,
                "matricule": student_number,
                "classe": "",
                "date_remise": "N/A",
                "statut": "abandon",
                "note_ia": "",
                "note_enseignant": "",
                "note_finale": "",
            })

    # Colonnes en français pour Excel
    header_map = {
        "nom": "Nom de l'étudiant",
        "matricule": "Matricule",
        "classe": "Classe",
        "date_remise": "Date de remise",
        "statut": "Statut",
        "note_ia": "Note IA",
        "note_enseignant": "Note enseignant",
        "note_finale": "Note finale",
    }

    # Utiliser le point-virgule comme separateur (compatible Excel France)
    # et le BOM UTF-8 pour qu'Excel reconnaisse l'encodage
    buffer = io.StringIO()
    fieldnames = list(header_map.keys())

    writer = csv.DictWriter(buffer, fieldnames=fieldnames, delimiter=";", lineterminator="\n")
    writer.writerow(header_map)  # En-tête en français
    writer.writerows(rows)
    csv_content = buffer.getvalue()

    # Puis envelopper dans BytesIO avec BOM pour la reponse
    output = io.BytesIO()
    output.write(codecs.BOM_UTF8)
    output.write(csv_content.encode("utf-8"))
    output.seek(0)

    # Nettoyer le titre pour le nom de fichier
    safe_title = "".join(c for c in session['title'] if c.isalnum() or c in (" ", "-", "_")).strip().replace(" ", "_")
    filename = f"resultats_{safe_title}_{session_id}.csv"

    return StreamingResponse(
        output,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur export CSV : {type(e).__name__}: {e}",
        )


@router.get("/sessions/{session_id}/results")
def get_session_results(
    session_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    teacher: dict = Depends(get_current_teacher),
):
    """Récupère les résultats complets d'une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    exams = get_session_exams(session_id)
    total = len(exams)

    results = []
    for exam in exams[skip:skip + limit]:
        sub = get_submission_by_exam(exam["id"])
        if sub:
            corr = get_correction_by_submission(sub["id"])
            results.append({
                "submission_id": sub["id"],
                "student_name": sub["student_name"],
                "student_number": sub["student_number"],
                "class_name": sub.get("class_name"),
                "submitted_at": sub["submitted_at"],
                "correction_status": corr["correction_status"] if corr else "pending",
                "ai_score": corr.get("ai_score") if corr else None,
                "teacher_score": corr.get("teacher_score") if corr else None,
                "final_score": corr.get("final_score") if corr else None,
                "grading_system": corr["grading_system"] if corr else session["grading_system"],
            })
        else:
            results.append({
                "submission_id": None,
                "student_name": "Inconnu",
                "student_number": "N/A",
                "class_name": None,
                "submitted_at": None,
                "correction_status": "pending",
                "ai_score": None,
                "teacher_score": None,
                "final_score": None,
                "grading_system": session["grading_system"],
            })

    return {
        "session_title": session["title"],
        "subject": session["subject"],
        "grading_system": session["grading_system"],
        "total_students": total,
        "corrected": sum(1 for r in results if r["correction_status"] != "pending"),
        "items": results,
        "skip": skip,
        "limit": limit,
    }
