"""Routeur pour le module etudiant.

Les etudiants n'ont pas de compte permanent.
Ils s'identifient par session avec un code d'acces.
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Header, Request, UploadFile, File, Form, status

from core.db import (
    get_session_by_code,
    get_session_exams,
    get_generated_exam_by_id,
    update_generated_exam,
    get_generated_exam_by_hash,
    create_submission,
    get_submission_by_exam,
    create_security_incident,
)
from core.supabase_client import cache
from schemas.student import StudentJoin, StudentSubmit, StudentIncident
from services.event_bus import event_bus
from services.storage import StorageService

logger = logging.getLogger(__name__)

router = APIRouter()
storage_service = StorageService()


def _hash_student(session_id: int, student_number: str) -> str:
    """Geneere le hash unique d'un etudiant dans une session."""
    raw = f"{student_number}:{session_id}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _find_exam_by_student(exams: list[dict], student_hash: str):
    """Trouve l'epreuve d'un etudiant parmi une liste d'epreuves."""
    return next((e for e in exams if e.get("student_id_hash") == student_hash), None)


@router.post("/sessions/{code}/join")
async def join_session(
    code: str,
    data: StudentJoin,
    request: Request,
):
    """Un etudiant rejoint une session d'examen avec son code d'acces."""
    code_upper = code.upper()

    # Verifier la session
    session = get_session_by_code(code_upper)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session introuvable ou pas encore active",
        )

    # Verifier que la session n'est pas expiree
    scheduled_start = session.get("scheduled_start")
    if scheduled_start:
        scheduled_dt = datetime.fromisoformat(scheduled_start)
        if scheduled_dt > datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cette session n'a pas encore commence",
            )

    # Verifier le verrou multi-session (SupabaseCache)
    student_hash = _hash_student(session["id"], data.student_number)
    if await cache.has_exam_lock(student_hash):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette epreuve est deja ouverte dans un autre onglet. Fermez l'autre onglet puis reessayez.",
        )

    # Recuperer l'epreuve generee pour cet etudiant
    exams = get_session_exams(session["id"])
    exam = _find_exam_by_student(exams, student_hash)
    if not exam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucune epreuve trouvee pour cet etudiant dans cette session",
        )

    if exam.get("status") == "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous avez deja soumis votre copie pour cette session",
        )

    # Verrouiller l'epreuve dans le cache pour eviter la double connexion
    duration = session.get("duration_seconds", 7200)
    await cache.set_exam_lock(student_hash, ttl=duration + 300)

    # Generer un token de session etudiant (securite des soumissions)
    student_token = await cache.set_student_token(
        student_hash=student_hash,
        session_code=code,
        student_number=data.student_number,
        ttl=duration + 600,
    )

    return {
        "session": {
            "id": session["id"],
            "title": session["title"],
            "subject": session["subject"],
            "duration_seconds": session["duration_seconds"],
            "grading_system": session["grading_system"],
        },
        "exam_id": exam["id"],
        "exam_hash": exam["sha256_hash"],
        "status": exam["status"],
        "student_token": student_token,
    }


@router.get("/student/exam")
async def get_student_exam(
    session_code: str,
    student_number: str,
    student_token: str = Header(..., alias="X-Student-Token"),
):
    """Recupere le contenu de l'epreuve pour un etudiant (apres identification).

    Necessite le token de session obtenu lors du join()
    (en-tete X-Student-Token) pour empecher l'acces non autorise.
    """
    code_upper = session_code.upper()

    session = get_session_by_code(code_upper)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    student_hash = _hash_student(session["id"], student_number)
    exams = get_session_exams(session["id"])
    exam = _find_exam_by_student(exams, student_hash)
    if not exam:
        raise HTTPException(status_code=404, detail="Epreuve introuvable")

    if exam.get("status") == "submitted":
        raise HTTPException(status_code=400, detail="Copie deja soumise")

    # Verifier le token de session etudiant
    if not await cache.verify_student_token(student_hash, student_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token de session invalide. Veuillez rejoindre la session a nouveau.",
        )

    # Marquer comme commencee si c'est la premiere consultation
    if exam.get("status") == "pending":
        now = datetime.now(timezone.utc)
        update_data = {
            "status": "started",
            "started_at": now.isoformat(),
        }
        duration = session.get("duration_seconds")
        if duration:
            update_data["expires_at"] = (now + timedelta(seconds=duration)).isoformat()
        update_generated_exam(exam["id"], update_data)
        exam["status"] = "started"
        exam["started_at"] = update_data["started_at"]
        if "expires_at" in update_data:
            exam["expires_at"] = update_data["expires_at"]

        # Publier l'evenement de demarrage
        try:
            asyncio.create_task(event_bus.publish(f"session:{code_upper}", {
                "type": "exam_started",
                "session_code": code_upper,
                "session_id": session["id"],
                "exam_id": exam["id"],
                "student_hash": student_hash[:12],
            }))
            asyncio.create_task(event_bus.publish(f"teacher:{session.get('teacher_id')}", {
                "type": "exam_started",
                "session_id": session["id"],
                "session_title": session.get("title"),
                "exam_id": exam["id"],
            }))
        except Exception as e:
            logger.warning("Impossible de publier l'evenement exam_started : %s", e)

    return {
        "exam_id": exam["id"],
        "session_id": session["id"],
        "duration_seconds": session["duration_seconds"],
        "title": session["title"],
        "subject": session["subject"],
        "content": exam["content"],
        "status": exam["status"],
        "started_at": exam.get("started_at") if exam.get("started_at") else None,
    }


@router.post("/student/submit")
async def submit_exam(
    data: StudentSubmit,
    session_code: str,
    student_number: str,
    student_name: str,
    request: Request,
    student_token: str = Header(..., alias="X-Student-Token"),
):
    """Un etudiant soumet sa copie.

    Necessite le token de session obtenu lors du join()
    (en-tete X-Student-Token) pour empecher les soumissions non autorisees.
    """
    code_upper = session_code.upper()

    session = get_session_by_code(code_upper)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    student_hash = _hash_student(session["id"], student_number)
    exams = get_session_exams(session["id"])
    exam = _find_exam_by_student(exams, student_hash)
    if not exam:
        raise HTTPException(status_code=404, detail="Epreuve introuvable")

    if exam.get("status") == "submitted":
        raise HTTPException(status_code=400, detail="Copie deja soumise")

    # Verifier le token de session etudiant
    if not await cache.verify_student_token(student_hash, student_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token de session invalide. Veuillez rejoindre la session a nouveau.",
        )

    # Verifier l'expiration cote serveur
    expires_at = exam.get("expires_at")
    if expires_at:
        expires_dt = datetime.fromisoformat(expires_at)
        if datetime.now(timezone.utc) > expires_dt:
            if not data.auto_submitted:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Le temps de l'epreuve est ecoule. La soumission automatique a ete declenchee.",
                )

    # Creer la soumission
    submission = create_submission({
        "generated_exam_id": exam["id"],
        "student_name": student_name,
        "student_number": student_number,
        "class_name": data.class_name,
        "university": data.university,
        "content": data.content,
        "auto_submitted": data.auto_submitted,
        "ip_address": data.ip_address or (request.client.host if request.client else None),
        "user_agent": data.user_agent or request.headers.get("user-agent"),
    })

    # Mettre a jour le statut de l'epreuve
    update_generated_exam(exam["id"], {"status": "submitted"})

    # Liberer le verrou et supprimer le token
    await cache.release_exam_lock(student_hash)
    await cache.release_student_token(student_hash)

    # Invalider le cache de la session
    await cache.invalidate_session(code_upper)

    # Publier l'evenement de soumission
    try:
        asyncio.create_task(event_bus.publish(f"session:{code_upper}", {
            "type": "submission_received",
            "session_code": code_upper,
            "session_id": session["id"],
            "submission_id": submission["id"],
            "student_name": student_name,
            "student_number": student_number[-4:],
            "auto_submitted": data.auto_submitted,
        }))
        asyncio.create_task(event_bus.publish(f"teacher:{session.get('teacher_id')}", {
            "type": "submission_received",
            "session_id": session["id"],
            "session_title": session.get("title"),
            "submission_id": submission["id"],
            "student_name": student_name,
            "auto_submitted": data.auto_submitted,
        }))
    except Exception as e:
        logger.warning("Impossible de publier l'evenement submission_received : %s", e)

    return {
        "submission_id": submission["id"],
        "message": "Copie soumise avec succes",
        "submitted_at": submission["submitted_at"],
    }


@router.post("/student/submit-with-files")
async def submit_exam_with_files(
    session_code: str = Form(...),
    student_number: str = Form(...),
    student_name: str = Form(...),
    class_name: str = Form(None),
    university: str = Form(None),
    content: str = Form(...),
    auto_submitted: bool = Form(False),
    files: list[UploadFile] = File(default=[]),
    student_token: str = Form(..., alias="X-Student-Token"),
):
    """Soumission avec fichiers joints (copies scannees, images, etc.)."""
    code_upper = session_code.upper()

    session = get_session_by_code(code_upper)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    student_hash = _hash_student(session["id"], student_number)
    exams = get_session_exams(session["id"])
    exam = _find_exam_by_student(exams, student_hash)
    if not exam:
        raise HTTPException(status_code=404, detail="Epreuve introuvable")

    if exam.get("status") == "submitted":
        raise HTTPException(status_code=400, detail="Copie deja soumise")

    # Verifier le token de session etudiant
    if not await cache.verify_student_token(student_hash, student_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Token de session invalide. Veuillez rejoindre la session a nouveau.",
        )

    # Uploader les fichiers joints vers Supabase Storage
    attachment_urls = []
    for file in files:
        if file.filename:
            file_url = await storage_service.upload_submission_file(
                exam_id=exam["id"],
                student_number=student_number,
                file=file,
            )
            attachment_urls.append(file_url)

    # Ajouter les URLs au contenu
    if attachment_urls:
        import json
        try:
            meta = json.loads(exam["content"]) if isinstance(exam["content"], str) else {}
        except json.JSONDecodeError:
            meta = {}
        if not isinstance(meta, dict):
            meta = {}

    # Creer la soumission
    submission = create_submission({
        "generated_exam_id": exam["id"],
        "student_name": student_name,
        "student_number": student_number,
        "class_name": class_name,
        "university": university,
        "content": content,
        "auto_submitted": auto_submitted,
    })

    # Mettre a jour le statut de l'epreuve
    update_generated_exam(exam["id"], {"status": "submitted"})

    # Liberer le verrou et supprimer le token
    await cache.release_exam_lock(student_hash)
    await cache.release_student_token(student_hash)
    await cache.invalidate_session(code_upper)

    # Publier l'evenement de soumission
    try:
        asyncio.create_task(event_bus.publish(f"session:{code_upper}", {
            "type": "submission_received",
            "session_code": code_upper,
            "session_id": session["id"],
            "submission_id": submission["id"],
            "student_name": student_name,
            "student_number": student_number[-4:],
            "auto_submitted": auto_submitted,
        }))
        asyncio.create_task(event_bus.publish(f"teacher:{session.get('teacher_id')}", {
            "type": "submission_received",
            "session_id": session["id"],
            "session_title": session.get("title"),
            "submission_id": submission["id"],
            "student_name": student_name,
            "auto_submitted": auto_submitted,
        }))
    except Exception as e:
        logger.warning("Impossible de publier l'evenement submission_received : %s", e)

    return {
        "submission_id": submission["id"],
        "message": "Copie soumise avec succes",
        "submitted_at": submission["submitted_at"],
        "attachments": attachment_urls,
    }


@router.post("/student/incident")
async def report_incident(
    data: StudentIncident,
    session_code: str,
    student_number: str,
):
    """Un etudiant signale un incident de securite."""
    code_upper = session_code.upper()

    session = get_session_by_code(code_upper)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    student_hash = _hash_student(session["id"], student_number)
    exams = get_session_exams(session["id"])
    exam = _find_exam_by_student(exams, student_hash)
    if not exam:
        raise HTTPException(status_code=404, detail="Epreuve introuvable")

    # Recuperer la soumission si elle existe
    submission = get_submission_by_exam(exam["id"])
    if not submission:
        # Si pas encore soumis, on soumet d'abord automatiquement
        submission = create_submission({
            "generated_exam_id": exam["id"],
            "student_name": "Inconnu",
            "student_number": student_number,
            "class_name": None,
            "university": None,
            "content": "",
            "auto_submitted": True,
        })
        update_generated_exam(exam["id"], {"status": "submitted"})

    # Creer l'incident
    incident = create_security_incident({
        "submission_id": submission["id"],
        "incident_type": data.incident_type,
        "details": data.details,
        "severity": data.severity,
    })

    # Invalider le cache de la session
    await cache.invalidate_session(code_upper)

    # Publier l'evenement incident via WebSocket
    try:
        asyncio.create_task(event_bus.publish(f"session:{code_upper}", {
            "type": "incident_reported",
            "session_code": code_upper,
            "session_id": session["id"],
            "submission_id": submission["id"],
            "student_name": submission.get("student_name") or "Inconnu",
            "incident_type": data.incident_type,
            "severity": data.severity,
            "details": data.details[:200],
        }))
        asyncio.create_task(event_bus.publish(f"teacher:{session.get('teacher_id')}", {
            "type": "incident_reported",
            "session_id": session["id"],
            "session_title": session.get("title"),
            "submission_id": submission["id"],
            "student_name": submission.get("student_name") or "Inconnu",
            "student_number": submission.get("student_number", "")[-4:] if submission.get("student_number") else "N/A",
            "incident_type": data.incident_type,
            "severity": data.severity,
            "details": data.details[:200],
        }))
    except Exception as e:
        logger.warning("Impossible de publier l'evenement incident_reported : %s", e)

    return {
        "incident_id": incident["id"],
        "message": "Incident enregistre",
        "submission_closed": True,
    }


@router.get("/sessions/{code}/status")
async def get_session_status(
    code: str,
):
    """Recupere le statut en direct d'une session (pour l'enseignant)."""
    code_upper = code.upper()

    session = get_session_by_code(code_upper)
    if not session:
        raise HTTPException(status_code=404, detail="Session introuvable")

    exams = get_session_exams(session["id"])
    total = len(exams)
    started = sum(1 for e in exams if e.get("status") == "started")
    submitted = sum(1 for e in exams if e.get("status") == "submitted")
    pending = total - started - submitted

    return {
        "session_id": session["id"],
        "title": session["title"],
        "status": session["status"],
        "total_students": total,
        "pending": pending,
        "in_progress": started,
        "submitted": submitted,
        "progress_pct": round((submitted / total * 100), 1) if total > 0 else 0,
    }
