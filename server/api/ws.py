"""Routeur WebSocket pour les notifications en temps réel.

Endpoints :
  /ws/teacher/{teacher_id}    → notifications générales pour un enseignant
  /ws/session/{session_code}  → statut en direct d'une session

Authentification :
  Les deux endpoints nécessitent un token JWT valide passé en paramètre
  de requête ``?token=...``.
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from core.security import decode_token
from services.event_bus import event_bus

from typing import Optional

logger = logging.getLogger(__name__)

router = APIRouter()


async def _verify_teacher_token(
    websocket: WebSocket, expected_teacher_id: int
) -> bool:
    """Vérifie le token JWT dans les query params de la WebSocket.

    Extrait le paramètre ``token``, le décode, et vérifie qu'il
    correspond à l'enseignant attendu.

    Retourne True si valide, False sinon.
    """
    token = websocket.query_params.get("token", "")
    if not token:
        return False

    payload = decode_token(token)
    if payload is None:
        return False

    teacher_id = payload.get("sub") or payload.get("teacher_id")
    if teacher_id is None:
        return False

    try:
        return int(teacher_id) == expected_teacher_id
    except (ValueError, TypeError):
        return False


async def _verify_teacher_session(
    websocket: WebSocket, session_code: str
) -> Optional[int]:
    """Vérifie le token JWT et que l'enseignant possède la session.

    Retourne le teacher_id si valide, None sinon.
    """
    token = websocket.query_params.get("token", "")
    if not token:
        return None

    payload = decode_token(token)
    if payload is None:
        return None

    teacher_id_str = payload.get("sub") or payload.get("teacher_id")
    if not teacher_id_str:
        return None

    try:
        teacher_id = int(teacher_id_str)
    except (ValueError, TypeError):
        return None

    # Vérifier l'existence de la session et la propriété via Supabase
    from core.db import get_session_by_code
    try:
        session = get_session_by_code(session_code.upper())
        if session and session.get("teacher_id") == teacher_id:
            return teacher_id
    except Exception as e:
        logger.error("Erreur lors de la vérification de propriété de la session WS : %s", e)

    return None


@router.websocket("/teacher/{teacher_id}")
async def teacher_ws(websocket: WebSocket, teacher_id: int):
    """Canal WebSocket pour un enseignant.

    L'enseignant reçoit en temps réel :
      - submission_received : un étudiant a soumis sa copie
      - exam_started : un étudiant a commencé une épreuve
      - incident_reported : un incident a été signalé
      - session_completed : une session est terminée

    Authentification requise : token JWT dans ``?token=``.
    """
    # Verifier le JWT avant d'accepter la connexion
    if not await _verify_teacher_token(websocket, teacher_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    channel = f"teacher:{teacher_id}"
    # Limiter le nombre de connexions WebSocket simultanées par enseignant (QC-05 fix)
    if event_bus.subscriber_count(channel) >= 5:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await event_bus.subscribe(channel, websocket)

    try:
        # Envoyer un message de bienvenue
        await websocket.send_json({
            "type": "connected",
            "channel": channel,
            "message": "Connexion établie. Vous recevrez les notifications en direct.",
        })

        # Maintenir la connexion ouverte (reçoit les pings KeepAlive)
        while True:
            data = await websocket.receive_text()
            # Permet au client de envoyer des pings
            if data == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket teacher#%d déconnecté", teacher_id)
    except Exception as e:
        logger.error("Erreur WebSocket teacher#%d : %s", teacher_id, e)
    finally:
        await event_bus.unsubscribe_all(websocket)


@router.websocket("/session/{session_code}")
async def session_ws(websocket: WebSocket, session_code: str):
    """Canal WebSocket pour une session d'examen spécifique.

    Permet de suivre en direct :
      - submission_received   → une copie a été soumise
      - exam_started          → un étudiant commence l'épreuve

    Authentification requise : token JWT enseignant dans ``?token=``.
    """
    # Verifier le JWT et la propriete de la session avant d'accepter
    teacher_id = await _verify_teacher_session(websocket, session_code)
    if teacher_id is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    code = session_code.upper()
    channel = f"session:{code}"
    # Limiter le nombre de connexions WebSocket simultanées par session (QC-05 fix)
    if event_bus.subscriber_count(channel) >= 5:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    await event_bus.subscribe(channel, websocket)

    try:
        await websocket.send_json({
            "type": "connected",
            "channel": channel,
            "message": "Connecté au direct de la session.",
        })

        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket session#%s déconnecté", code)
    except Exception as e:
        logger.error("Erreur WebSocket session#%s : %s", code, e)
    finally:
        await event_bus.unsubscribe_all(websocket)
