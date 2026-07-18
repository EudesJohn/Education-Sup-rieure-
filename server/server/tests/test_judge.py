"""Tests du routeur Judge (exécution de code).

Vérifie le comportement selon le feature flag ENABLE_CODE_EXECUTION.
Les tests d'exécution réelle sont dans test_code_executor.py.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from core.config import get_settings


@pytest.fixture(autouse=True)
def patch_supabase(mock_supabase: MagicMock):
    """Override conftest's autouse mock — configure mock for judge tests.

    get_session_by_code("TEST123") → None (session inexistante),
    ce qui permet de tester le comportement 404 du routeur judge.
    """
    mock_execute = MagicMock()
    mock_execute.data = None
    mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = mock_execute

    with patch("core.db.get_supabase", return_value=mock_supabase):
        yield


@pytest.fixture
def client() -> TestClient:
    from main import app
    return TestClient(app)


class TestJudgeRouter:
    """Tests du routeur de code."""

    def test_languages_endpoint(self, client):
        """GET /api/judge/languages retourne la liste des langages."""
        response = client.get("/api/judge/languages")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        # Vérifie que Python est présent
        langs = {lang["id"] for lang in data}
        assert "python" in langs

    def test_run_code_execution_enabled(self, client):
        """POST /api/judge/run — code execution activé, vérifie la session invalide."""
        settings = get_settings()
        with patch.object(settings, "ENABLE_CODE_EXECUTION", True):
            response = client.post("/api/judge/run", json={
                "code": "print('hello')",
                "language": "python",
                "session_code": "TEST123",
                "student_number": "ETU001",
            })
        # Le feature flag est activé, mais la session n'existe pas → 404
        assert response.status_code == 404
        assert "introuvable" in response.json()["detail"].lower()

    def test_submit_code_execution_enabled(self, client):
        """POST /api/judge/submit — code execution activé, vérifie la session invalide."""
        settings = get_settings()
        with patch.object(settings, "ENABLE_CODE_EXECUTION", True):
            response = client.post("/api/judge/submit", json={
                "code": "print('hello')",
                "language": "python",
                "test_cases": [{"input": "", "expected_output": "hello\n"}],
                "session_code": "TEST123",
                "student_number": "ETU001",
            })
        # Le feature flag est activé, mais la session n'existe pas → 404
        assert response.status_code == 404
        assert "introuvable" in response.json()["detail"].lower()


class TestCodeExecutor:
    """Tests du service d'exécution (sans conftest)."""

    def test_language_config_exists(self):
        """Vérifie que la configuration des langages est chargée."""
        from services.code_executor import LANGUAGE_CONFIG
        assert "python" in LANGUAGE_CONFIG
        assert "javascript" in LANGUAGE_CONFIG
        assert "java" in LANGUAGE_CONFIG
        assert "cpp" in LANGUAGE_CONFIG

    def test_executor_instantiation(self):
        """Vérifie que l'exécuteur s'instancie."""
        from services.code_executor import CodeExecutor
        executor = CodeExecutor(max_time=5)
        assert executor.max_time == 5
