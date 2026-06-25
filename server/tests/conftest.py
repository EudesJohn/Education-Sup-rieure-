"""Fixtures de test pour PEAN.

Architecture : pas de SQLAlchemy. Le projet utilise Supabase REST.
Les tests mockent le client Supabase via monkeypatch de get_supabase().
"""

import os
from unittest.mock import MagicMock, patch
from typing import Any, Generator

import pytest
from fastapi.testclient import TestClient

# S'assurer que JWT_SECRET_KEY est définie pour les tests
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pean-tests-only")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")


# ============================================================
# Mock Supabase
# ============================================================

@pytest.fixture
def mock_supabase() -> MagicMock:
    """Crée un mock du client Supabase.

    Retourne un MagicMock configurable. Chaque test peut
    surcharger les retours des méthodes .table().select().execute()
    pour simuler les réponses Supabase.
    """
    return MagicMock()


@pytest.fixture(autouse=True)
def patch_supabase(mock_supabase: MagicMock) -> Generator:
    """Patch get_supabase() pour tous les tests."""
    with patch("core.supabase_client.get_supabase", return_value=mock_supabase):
        yield


# ============================================================
# Client API (sans authentification)
# ============================================================

@pytest.fixture
def client() -> TestClient:
    """Fixture : client HTTP de test."""
    from main import app
    return TestClient(app)


# ============================================================
# Données factices pour les tests
# ============================================================

@pytest.fixture
def mock_teacher() -> dict:
    """Un enseignant factice."""
    return {
        "id": 1,
        "email": "test@universite.edu",
        "full_name": "Dr. Test",
        "institution": "Université de Test",
        "discipline": "Mathématiques",
        "role": "teacher",
        "is_verified": True,
        "password_hash": "$2b$12$..." + "x" * 40,
    }


@pytest.fixture
def mock_session() -> dict:
    """Une session d'examen factice."""
    return {
        "id": 1,
        "teacher_id": 1,
        "title": "Test Session",
        "subject": "Mathématiques",
        "duration_seconds": 3600,
        "student_count": 10,
        "grading_system": "20",
        "correction_mode": "ai_assisted",
        "access_code": "TEST1234",
        "status": "draft",
    }


@pytest.fixture
def mock_exercises() -> list[dict]:
    """Des exercices factices avec variantes."""
    exercises = []
    for i in range(2):
        ex = {
            "id": i + 1,
            "teacher_id": 1,
            "title": f"Exercice {i + 1}",
            "subject": "Mathématiques",
            "difficulty": "medium",
            "instructions": f"Résolvez le problème {i + 1}",
            "points": 10,
            "exercise_type": "open",
        }
        ex["_variants"] = [
            {"id": (i * 3) + v + 1, "exercise_id": ex["id"],
             "variant_order": v + 1, "content": f"Variante {v + 1}"}
            for v in range(3)
        ]
        exercises.append(ex)
    return exercises
