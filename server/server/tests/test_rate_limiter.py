"""Tests du rate limiter — sliding window log en mémoire."""
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, Request


class TestRateLimiterLocalStore:
    """Tests du stockage mémoire interne."""

    def test_incr_first_request(self):
        """Première requête : count=1, remaining=max-1."""
        from services.rate_limiter import _local_store
        key = "ratelimit:127.0.0.1:/test"
        count, remaining = _local_store.incr(key, 60, 5)
        assert count == 1
        assert remaining == 4

    def test_incr_within_limit(self):
        """Requêtes dans la limite : remaining décroît."""
        from services.rate_limiter import _local_store
        key = "ratelimit:127.0.0.1:/test-within"
        for i in range(3):
            count, remaining = _local_store.incr(key, 60, 5)
        assert count == 3
        assert remaining == 2

    def test_cleanup_expired(self):
        """Les entrées expirées sont nettoyées."""
        from services.rate_limiter import _local_store
        key = "ratelimit:127.0.0.1:/test-cleanup"
        # Simuler des entrées très anciennes
        import time
        _local_store._buckets[key] = [time.time() - 100, time.time() - 100]
        count, remaining = _local_store.incr(key, 5, 5)  # fenêtre de 5s
        # Les 2 entrées à -100s doivent être expirées, seule la nouvelle compte
        assert count == 1
        assert remaining == 4

    def test_reset_clears_key(self):
        """reset() supprime la clé du bucket."""
        from services.rate_limiter import _local_store
        key = "ratelimit:127.0.0.1:/test-reset"
        _local_store.incr(key, 60, 5)
        _local_store._buckets.pop(key, None)
        assert key not in _local_store._buckets

    def test_multiple_keys_independent(self):
        """Deux clés différentes ont des compteurs indépendants."""
        from services.rate_limiter import _local_store
        key_a = "ratelimit:127.0.0.1:/endpoint-a"
        key_b = "ratelimit:127.0.0.1:/endpoint-b"
        _local_store.incr(key_a, 60, 5)
        _local_store.incr(key_a, 60, 5)
        ca, _ = _local_store.incr(key_a, 60, 5)
        cb, _ = _local_store.incr(key_b, 60, 5)
        assert ca == 3
        assert cb == 1


class TestRateLimiterIPExtraction:
    """Tests de l'extraction d'IP."""

    def test_forwarded_for_priority(self):
        """X-Forwarded-For est prioritaire."""
        from services.rate_limiter import _get_client_ip
        request = MagicMock(spec=Request)
        request.headers = {"X-Forwarded-For": "1.2.3.4, 5.6.7.8"}
        request.client = MagicMock()
        request.client.host = "9.9.9.9"
        ip = _get_client_ip(request)
        assert ip == "1.2.3.4"

    def test_x_real_ip(self):
        """X-Real-IP est utilisé si pas de X-Forwarded-For."""
        from services.rate_limiter import _get_client_ip
        request = MagicMock(spec=Request)
        request.headers = {"X-Real-IP": "10.0.0.1"}
        request.client = MagicMock()
        request.client.host = "9.9.9.9"
        ip = _get_client_ip(request)
        assert ip == "10.0.0.1"

    def test_fallback_client_host(self):
        """Fallback sur client.host."""
        from services.rate_limiter import _get_client_ip
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "192.168.1.1"
        ip = _get_client_ip(request)
        assert ip == "192.168.1.1"

    def test_fallback_unknown(self):
        """Fallback sur 'unknown' si pas de client."""
        from services.rate_limiter import _get_client_ip
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = None
        ip = _get_client_ip(request)
        assert ip == "unknown"


class TestRateLimiterClass:
    """Tests de la classe RateLimiter en isolation."""

    def test_build_key_with_path(self):
        """build_key inclut le chemin par défaut."""
        from services.rate_limiter import RateLimiter
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "10.0.0.1"
        request.url.path = "/api/test"
        key = limiter._build_key(request)
        assert "10.0.0.1" in key
        assert "/api/test" in key

    def test_build_key_without_path(self):
        """build_key sans chemin quand include_path=False."""
        from services.rate_limiter import RateLimiter
        limiter = RateLimiter(max_requests=5, window_seconds=60, include_path=False)
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "10.0.0.1"
        request.url.path = "/api/test"
        key = limiter._build_key(request)
        assert "10.0.0.1" in key
        assert "/api/test" not in key

    def test_call_under_limit(self):
        """Requête sous la limite → None."""
        from services.rate_limiter import RateLimiter
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "10.0.0.2"
        request.url.path = "/api/login"

        import asyncio
        result = asyncio.run(limiter(request))
        assert result is None

    def test_call_over_limit_raises(self):
        """Requête au-dessus de la limite → HTTPException 429."""
        from services.rate_limiter import RateLimiter
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "10.0.0.3"
        request.url.path = "/api/login-over"

        import asyncio
        # 2 requêtes autorisées
        asyncio.run(limiter(request))
        asyncio.run(limiter(request))

        # La 3e doit échouer
        with pytest.raises(HTTPException) as exc:
            asyncio.run(limiter(request))
        assert exc.value.status_code == 429

    def test_reset_clears_bucket(self):
        """reset() vide le bucket pour une clé donnée."""
        from services.rate_limiter import RateLimiter
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        request = MagicMock(spec=Request)
        request.headers = {}
        request.client = MagicMock()
        request.client.host = "10.0.0.4"
        request.url.path = "/api/reset-test"

        import asyncio
        asyncio.run(limiter(request))
        asyncio.run(limiter(request))

        # Reset
        asyncio.run(limiter.reset(request))

        # Après reset, la requête suivante doit passer
        result = asyncio.run(limiter(request))
        assert result is None
