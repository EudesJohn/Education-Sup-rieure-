"""Bus d'événements en mémoire pour les notifications temps réel (WebSocket).

Maintient un registre des connexions WebSocket par salon (session, teacher)
et diffuse les événements de manière asynchrone.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class EventBus:
    """Bus d'événements simple pour diffuser des notifications via WebSocket.

    Utilisation :
        bus = EventBus()
        bus.subscribe("session:ABC123", websocket)
        bus.publish("session:ABC123", {"type": "submission_received", ...})
    """

    def __init__(self):
        self._subscribers: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, channel: str, websocket: WebSocket):
        """Abonne une websocket à un canal."""
        async with self._lock:
            if channel not in self._subscribers:
                self._subscribers[channel] = set()
            self._subscribers[channel].add(websocket)
            logger.debug("WebSocket abonné au canal '%s' (%d abonnés)", channel, len(self._subscribers[channel]))

    async def unsubscribe(self, channel: str, websocket: WebSocket):
        """Désabonne une websocket d'un canal."""
        async with self._lock:
            if channel in self._subscribers:
                self._subscribers[channel].discard(websocket)
                if not self._subscribers[channel]:
                    del self._subscribers[channel]
                logger.debug("WebSocket désabonné du canal '%s'", channel)

    async def unsubscribe_all(self, websocket: WebSocket):
        """Désabonne une websocket de tous ses canaux."""
        async with self._lock:
            channels_to_remove = []
            for channel, subs in self._subscribers.items():
                subs.discard(websocket)
                if not subs:
                    channels_to_remove.append(channel)
            for channel in channels_to_remove:
                del self._subscribers[channel]

    def subscriber_count(self, channel: str) -> int:
        """Nombre d'abonnés sur un canal."""
        return len(self._subscribers.get(channel, set()))

    async def publish(self, channel: str, event: dict[str, Any]):
        """Publie un événement sur un canal.

        Diffuse à tous les abonnés du canal. Les connexions fermées
        sont automatiquement retirées.
        """
        async with self._lock:
            subscribers = self._subscribers.get(channel, set()).copy()

        if not subscribers:
            return

        event["timestamp"] = datetime.now(timezone.utc).isoformat()
        payload = json.dumps(event, default=str)

        dead: list[WebSocket] = []
        for ws in subscribers:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._subscribers.get(channel, set()).discard(ws)


# Instance globale unique
event_bus = EventBus()
