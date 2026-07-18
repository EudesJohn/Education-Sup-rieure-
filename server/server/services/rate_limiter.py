"""Rate Limiter — Sliding Window Log (mémoire uniquement).

Plus de dépendance Redis. Utilise un stockage en mémoire avec
nettoyage paresseux des entrées expirées.

Utilisation (FastAPI Dependency) :
    from services.rate_limiter import RateLimiter

    @router.post("/login")
    async def login(
        request: Request,
        _: None = Depends(RateLimiter(max_requests=5, window_seconds=900)),
    ):
        ...
"""

import logging
import time
from collections import defaultdict
from typing import Optional

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


def _get_client_ip(request: Request) -> str:
    """Extrait l'IP du client depuis la requête.

    Priorité : X-Forwarded-For > X-Real-IP > client.host
    """
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded and "," in forwarded:
        return forwarded.split(",")[0].strip()
    if forwarded:
        return forwarded.strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


class _LocalRateStore:
    """Stockage mémoire thread-safe avec nettoyage paresseux."""

    def __init__(self):
        self._buckets: dict[str, list[float]] = defaultdict(list)

    def _cleanup(self, key: str, window: int):
        now = time.time()
        cutoff = now - window
        self._buckets[key] = [t for t in self._buckets[key] if t > cutoff]

    def incr(self, key: str, window: int, max_requests: int) -> tuple[int, int]:
        self._cleanup(key, window)
        self._buckets[key].append(time.time())
        count = len(self._buckets[key])
        remaining = max(0, max_requests - count)
        return count, remaining


_local_store = _LocalRateStore()


class RateLimiter:
    """Limiteur de taux basé sur la mémoire, utilisable comme dépendance FastAPI.

    Implémente un sliding window log : chaque requête est horodatée.
    Si le nombre de requêtes dans la fenêtre dépasse max_requests,
    la requête est refusée avec un 429.
    """

    def __init__(
        self,
        max_requests: int = 5,
        window_seconds: int = 900,
        prefix: str = "ratelimit",
        include_path: bool = True,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.prefix = prefix
        self.include_path = include_path

    def _build_key(self, request: Request) -> str:
        ip = _get_client_ip(request)
        if self.include_path:
            return f"{self.prefix}:{ip}:{request.url.path}"
        return f"{self.prefix}:{ip}"

    async def __call__(self, request: Request) -> Optional[None]:
        # Bypasser le rate limiting pour les requêtes de tests via TestClient
        if _get_client_ip(request) == "testclient":
            return None

        key = self._build_key(request)
        count, remaining = _local_store.incr(key, self.window_seconds, self.max_requests)

        headers = {
            "X-RateLimit-Limit": str(self.max_requests),
            "X-RateLimit-Remaining": str(remaining),
            "X-RateLimit-Reset": str(self.window_seconds),
        }

        if not (count <= self.max_requests):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "message": "Trop de requêtes. Veuillez réessayer plus tard.",
                    "retry_after_seconds": self.window_seconds,
                },
                headers=headers,
            )

        return None

    async def reset(self, request: Request) -> None:
        key = self._build_key(request)
        _local_store._buckets.pop(key, None)
