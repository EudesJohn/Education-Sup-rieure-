"""Tests de santé de l'API."""

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


class TestHealth:
    """Tests du endpoint de santé."""

    def test_health_check(self):
        """Vérifie que l'API répond."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "PEAN" in data["app"]

    def test_health_response_structure(self):
        """Vérifie la structure de la réponse health."""
        response = client.get("/api/health")
        data = response.json()
        assert all(k in data for k in ["status", "version", "app"])
