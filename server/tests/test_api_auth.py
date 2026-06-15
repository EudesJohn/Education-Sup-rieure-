"""Tests pour les routes d'authentification."""

import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from core.database import Base
from models import Teacher, ExamSession, Exercise, Variant, GeneratedExam, Submission, Correction, SecurityIncident


@pytest.fixture(autouse=True)
def clear_rate_limiter():
    """Nettoie le cache du rate limiter entre chaque test."""
    from services.rate_limiter import _local_store
    _local_store._buckets.clear()
    yield


@pytest.fixture
def client():
    """Fixture client de test avec base SQLite fichier temporaire.

    On utilise un fichier temporaire au lieu de :memory: car TestClient
    exécute les handlers dans un thread pool. SQLite :memory: crée une
    base distincte par thread, ce qui rend invisibles les tables créées
    sur le thread principal.
    """
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from core.database import get_db
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    # Créer un fichier temporaire pour la base de test
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)

    # Engine de test avec fichier SQLite (partagé entre les threads)
    test_engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        echo=False,
    )
    Base.metadata.create_all(bind=test_engine)
    TestSession = sessionmaker(bind=test_engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    # Créer une app de test
    test_app = FastAPI(title="PEAN Test")

    test_app.dependency_overrides[get_db] = override_get_db

    # Middleware CORS
    test_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @test_app.get("/api/health")
    async def health_check():
        return {"status": "ok", "version": "1.0.0", "app": "PEAN Test"}

    # Importer et enregistrer les routes
    from api.auth.router import router as auth_router
    from api.teachers.router import router as teacher_router
    from api.sessions.router import router as sessions_router
    from api.exams.router import router as exams_router
    from api.students.router import router as student_router
    from api.grading.router import router as grading_router
    from api.admin.router import router as admin_router

    test_app.include_router(auth_router, prefix="/api/auth", tags=["Authentification"])
    test_app.include_router(teacher_router, prefix="/api/teacher", tags=["Enseignant"])
    test_app.include_router(sessions_router, prefix="/api/teacher/sessions", tags=["Sessions"])
    test_app.include_router(exams_router, prefix="/api/exams", tags=["Examens"])
    test_app.include_router(student_router, prefix="/api", tags=["Étudiant"])
    test_app.include_router(grading_router, prefix="/api/grading", tags=["Correction"])
    test_app.include_router(admin_router, prefix="/api/admin", tags=["Administration"])

    with TestClient(test_app) as c:
        yield c

    # Nettoyage
    try:
        os.unlink(db_path)
    except OSError:
        pass


class TestAuthRoutes:
    """Tests des routes d'authentification."""

    def test_register_success(self, client):
        """Vérifie l'inscription réussie."""
        response = client.post("/api/auth/register", json={
            "email": "new.teacher@univ.edu",
            "password": "securepass123",
            "full_name": "Nouvel Enseignant",
            "institution": "Université de Test",
            "discipline": "Physique",
        })
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["teacher"]["email"] == "new.teacher@univ.edu"

    def test_register_duplicate_email(self, client):
        """Vérifie le rejet d'un email déjà utilisé."""
        client.post("/api/auth/register", json={
            "email": "dup@univ.edu",
            "password": "securepass123",
            "full_name": "Test",
            "institution": "Univ",
            "discipline": "Maths",
        })
        response = client.post("/api/auth/register", json={
            "email": "dup@univ.edu",
            "password": "securepass123",
            "full_name": "Test2",
            "institution": "Univ",
            "discipline": "Maths",
        })
        assert response.status_code == 409

    def test_login_success(self, client):
        """Vérifie la connexion réussie."""
        # D'abord s'inscrire (récupère le verify_token en mode DEBUG)
        reg_resp = client.post("/api/auth/register", json={
            "email": "login.test@univ.edu",
            "password": "securepass123",
            "full_name": "Login Test",
            "institution": "Univ",
            "discipline": "Chimie",
        })
        assert reg_resp.status_code == 201
        reg_data = reg_resp.json()

        # Vérifier l'email avant de pouvoir se connecter
        verify_token = reg_data.get("verify_token")
        assert verify_token is not None, "Le verify_token doit être présent en mode DEBUG"
        verify_resp = client.post("/api/auth/verify-email", json={
            "token": verify_token,
        })
        assert verify_resp.status_code == 200

        # Puis se connecter
        response = client.post("/api/auth/login", json={
            "email": "login.test@univ.edu",
            "password": "securepass123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

    def test_login_invalid_credentials(self, client):
        """Vérifie le rejet de mauvais identifiants."""
        response = client.post("/api/auth/login", json={
            "email": "wrong@univ.edu",
            "password": "wrongpassword",
        })
        assert response.status_code == 401
