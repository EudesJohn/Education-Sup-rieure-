"""Watchdog de session — Auto-submission forcée et complétion des sessions expirées.

Tâche périodique qui :
1. Parcourt les sessions actives dont l'heure de fin est dépassée
2. Marque la session comme "completed"
3. Soumet automatiquement toutes les épreuves "started" qui n'ont pas été soumises

Plus de dépendance SQLAlchemy ni Redis — utilise Supabase uniquement.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from core.db import (
    get_active_sessions,
    get_session_exams,
    get_submission_by_exam,
    create_submission,
    update_generated_exam,
    update_session,
)
from core.supabase_client import cache

logger = logging.getLogger(__name__)

WATCHDOG_INTERVAL = 30


async def _check_and_close_expired() -> int:
    """Vérifie les sessions expirées et les ferme."""
    now = datetime.now(timezone.utc)
    auto_submissions = 0

    sessions = get_active_sessions()

    for session in sessions:
        if not session.get("scheduled_start"):
            continue

        scheduled = session["scheduled_start"]
        # Convertir en datetime si c'est une string ISO
        if isinstance(scheduled, str):
            scheduled = datetime.fromisoformat(scheduled.replace("Z", "+00:00"))

        end_time = scheduled + timedelta(seconds=session["duration_seconds"])

        if now < end_time:
            continue

        closed = await _close_session_and_auto_submit(session)
        auto_submissions += closed

    # Épreuves individuelles expirées
    from core.db import get_expired_exams
    expired_exams = get_expired_exams(now.isoformat())

    for exam in expired_exams:
        sub = get_submission_by_exam(exam["id"])
        if sub:
            continue

        session = get_session_by_id_safe(exam["session_id"])
        if not session:
            continue

        access_code = session.get("access_code")
        if access_code:
            await cache.invalidate_session(access_code)
        closed = await _auto_submit_exam(exam, session)
        if closed:
            auto_submissions += 1

    return auto_submissions


def get_session_by_id_safe(session_id: int):
    from core.db import get_session_by_id
    return get_session_by_id(session_id)


async def _close_session_and_auto_submit(session: dict) -> int:
    """Ferme une session et auto-soumet toutes les épreuves started."""
    logger.info(f"⏰ Watchdog : fermeture session {session['id']} — {session['title']}")
    update_session(session["id"], {"status": "completed"})
    access_code = session.get("access_code")
    if access_code:
        await cache.invalidate_session(access_code)

    count = 0
    exams = get_session_exams(session["id"])
    for exam in exams:
        if exam["status"] == "started":
            sub = get_submission_by_exam(exam["id"])
            if not sub:
                try:
                    await _auto_submit_exam(exam, session)
                    count += 1
                except Exception as e:
                    logger.error(f"Watchdog : erreur auto-submit exam#{exam['id']} : {e}")

    return count


async def _auto_submit_exam(exam: dict, session: dict) -> bool:
    """Soumet automatiquement une épreuve non rendue."""
    sub = get_submission_by_exam(exam["id"])
    if sub:
        return False

    current_content = exam.get("content", "")
    if exam["status"] != "started":
        current_content = ""

    create_submission({
        "generated_exam_id": exam["id"],
        "student_name": "Soumission automatique (fin du temps)",
        "student_number": exam.get("student_id_hash", "")[:20],
        "content": current_content or "",
        "auto_submitted": True,
    })

    update_generated_exam(exam["id"], {"status": "submitted"})
    logger.info(f"  ↳ Auto-submission exam#{exam['id']} pour session#{session['id']}")

    await cache.release_exam_lock(exam.get("student_id_hash", ""))

    return True


async def watchdog_loop():
    """Boucle principale du watchdog."""
    logger.info("🐕 Watchdog de session démarré (intervalle: %ds)", WATCHDOG_INTERVAL)

    try:
        while True:
            try:
                closed = await _check_and_close_expired()
                if closed > 0:
                    logger.info(f"Watchdog : {closed} soumission(s) automatique(s) effectuée(s)")
            except Exception as e:
                logger.exception(f"Watchdog : erreur lors de la vérification : {e}")

            await asyncio.sleep(WATCHDOG_INTERVAL)
    except asyncio.CancelledError:
        logger.info("🐕 Watchdog arrêté")
