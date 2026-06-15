"""Service métier pour le module étudiant — Supabase uniquement."""

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from core.db import (
    get_session_by_id,
    get_session_by_code,
    get_session_exams,
    get_generated_exam_by_id,
    update_generated_exam,
    get_submission_by_exam,
    create_submission,
    create_security_incident,
)
from core.supabase_client import cache
from services.event_bus import event_bus

logger = logging.getLogger(__name__)


class StudentService:
    """Gestion des opérations côté étudiant."""

    def _hash_student(self, session_id: int, student_number: str) -> str:
        raw = f"{student_number}:{session_id}"
        return hashlib.sha256(raw.encode()).hexdigest()

    async def get_session_by_code(self, code: str) -> Optional[dict]:
        """Trouve une session par son code d'accès avec cache Supabase."""
        code_upper = code.upper()

        cached = await cache.get_cached_session(code_upper)
        if cached is not None:
            session = get_session_by_id(cached.get("id"))
            if session and session["status"] == "active":
                return session
            await cache.invalidate_session(code_upper)

        session = get_session_by_code(code_upper)
        if session and session["status"] != "active":
            return None

        if session:
            await cache.cache_session(code_upper, {
                "id": session["id"],
                "title": session["title"],
                "status": session["status"],
            })

        return session

    async def get_exam_for_student(self, session: dict, student_number: str) -> Optional[dict]:
        """Récupère l'épreuve générée pour un étudiant."""
        student_hash = self._hash_student(session["id"], student_number)

        cached = await cache.get_cached_exam(student_hash)
        if cached is not None:
            exam = get_generated_exam_by_id(cached.get("id"))
            if exam:
                return exam

        exams = get_session_exams(session["id"])
        exam = None
        for e in exams:
            if e["student_id_hash"] == student_hash:
                exam = e
                break

        if exam:
            await cache.cache_exam(student_hash, {
                "id": exam["id"],
                "status": exam["status"],
            })

        return exam

    def start_exam(self, exam: dict, session_duration: int = 0) -> dict:
        """Marque l'épreuve comme commencée."""
        if exam["status"] != "pending":
            raise ValueError(f"L'épreuve est déjà en statut '{exam['status']}'")

        now = datetime.now(timezone.utc)
        update_data = {"status": "started", "started_at": now.isoformat()}
        if session_duration > 0:
            update_data["expires_at"] = (now + timedelta(seconds=session_duration)).isoformat()

        update_generated_exam(exam["id"], update_data)
        exam.update(update_data)

        # Publier l'événement
        session = get_session_by_id(exam["session_id"])
        if session:
            try:
                asyncio.create_task(event_bus.publish(f"session:{session['access_code']}", {
                    "type": "exam_started",
                    "session_code": session["access_code"],
                    "session_id": session["id"],
                    "exam_id": exam["id"],
                    "student_hash": exam.get("student_id_hash", "")[:12],
                }))
                asyncio.create_task(event_bus.publish(f"teacher:{session['teacher_id']}", {
                    "type": "exam_started",
                    "session_id": session["id"],
                    "session_title": session["title"],
                    "exam_id": exam["id"],
                }))
            except Exception as e:
                logger.warning("Impossible de publier l'événement exam_started : %s", e)

        return exam

    def submit_exam(
        self,
        exam: dict,
        student_name: str,
        student_number: str,
        class_name: Optional[str],
        university: Optional[str],
        content: str,
        auto_submitted: bool = False,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> dict:
        """Soumet la copie d'un étudiant."""
        if exam["status"] == "submitted":
            raise ValueError("Cette copie a déjà été soumise")

        submission = create_submission({
            "generated_exam_id": exam["id"],
            "student_name": student_name,
            "student_number": student_number,
            "class_name": class_name,
            "university": university,
            "content": content,
            "auto_submitted": auto_submitted,
            "ip_address": ip_address,
            "user_agent": user_agent,
        })

        update_generated_exam(exam["id"], {"status": "submitted"})

        # Publier l'événement
        session = get_session_by_id(exam["session_id"])
        if session:
            try:
                asyncio.create_task(event_bus.publish(f"session:{session['access_code']}", {
                    "type": "submission_received",
                    "session_code": session["access_code"],
                    "session_id": session["id"],
                    "submission_id": submission["id"],
                    "student_name": student_name,
                    "student_number": student_number[-4:],
                    "auto_submitted": auto_submitted,
                }))
                asyncio.create_task(event_bus.publish(f"teacher:{session['teacher_id']}", {
                    "type": "submission_received",
                    "session_id": session["id"],
                    "session_title": session["title"],
                    "submission_id": submission["id"],
                    "student_name": student_name,
                    "auto_submitted": auto_submitted,
                }))
            except Exception as e:
                logger.warning("Impossible de publier l'événement submission_received : %s", e)

        return submission or {}

    def report_incident(
        self,
        submission_id: int,
        incident_type: str,
        details: str,
        severity: str = "medium",
    ) -> dict:
        """Enregistre un incident de sécurité."""
        incident = create_security_incident({
            "submission_id": submission_id,
            "incident_type": incident_type,
            "details": details,
            "severity": severity,
        })

        # Publier l'événement
        from core.supabase_client import get_supabase
        supabase = __import__("core.supabase_client", fromlist=["get_supabase"]).get_supabase()
        sub = supabase.table("submissions").select("*").eq("id", submission_id).maybe_single().execute()
        if sub.data:
            exam = supabase.table("generated_exams").select("*").eq("id", sub.data["generated_exam_id"]).maybe_single().execute()
            if exam.data:
                session = get_session_by_id(exam.data["session_id"])
                if session:
                    try:
                        asyncio.create_task(event_bus.publish(f"session:{session['access_code']}", {
                            "type": "incident_reported",
                            "session_code": session["access_code"],
                            "session_id": session["id"],
                            "submission_id": submission_id,
                            "student_name": sub.data.get("student_name", "Inconnu"),
                            "incident_type": incident_type,
                            "severity": severity,
                            "details": str(details)[:200],
                        }))
                        asyncio.create_task(event_bus.publish(f"teacher:{session['teacher_id']}", {
                            "type": "incident_reported",
                            "session_id": session["id"],
                            "session_title": session["title"],
                            "submission_id": submission_id,
                            "student_name": sub.data.get("student_name", "Inconnu"),
                            "incident_type": incident_type,
                            "severity": severity,
                            "details": str(details)[:200],
                        }))
                    except Exception as e:
                        logger.warning("Impossible de publier l'événement incident_reported : %s", e)

        return incident or {}

    def get_session_status(self, session: dict) -> dict:
        """Retourne les statistiques en direct d'une session."""
        exams = get_session_exams(session["id"])
        total = len(exams)
        started = sum(1 for e in exams if e["status"] == "started")
        submitted = sum(1 for e in exams if e["status"] == "submitted")
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
