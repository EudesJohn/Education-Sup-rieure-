"""Tests API d'intégration : sessions, correction, export, étudiant."""

import os
import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.database import Base, get_db
from models.teacher import Teacher
from services.rate_limiter import _local_store


@pytest.fixture(autouse=True)
def clear_rate_limiter():
    """Nettoie le cache du rate limiter entre chaque test."""
    _local_store._buckets.clear()
    yield


@pytest.fixture
def setup_app():
    """Fixture partagée : app FastAPI avec base SQLite fichier temporaire."""
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    os.environ["JWT_SECRET_KEY"] = "test-secret-key-pean-2026"

    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    os.close(db_fd)

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

    test_app = FastAPI(title="PEAN Test")
    test_app.dependency_overrides[get_db] = override_get_db
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

    from api.auth.router import router as auth_router
    from api.teachers.router import router as teacher_router
    from api.sessions.router import router as sessions_router
    from api.exams.router import router as exams_router
    from api.students.router import router as student_router
    from api.grading.router import router as grading_router
    from api.admin.router import router as admin_router
    from api.export.router import router as export_router

    test_app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
    test_app.include_router(teacher_router, prefix="/api/teacher", tags=["Teacher"])
    test_app.include_router(sessions_router, prefix="/api/teacher/sessions", tags=["Sessions"])
    test_app.include_router(exams_router, prefix="/api/exams", tags=["Exams"])
    test_app.include_router(student_router, prefix="/api", tags=["Étudiant"])
    test_app.include_router(grading_router, prefix="/api/grading", tags=["Correction"])
    test_app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
    test_app.include_router(export_router, prefix="/api/export", tags=["Export"])

    def get_db_session():
        return TestSession()

    with TestClient(test_app) as client:
        yield {"client": client, "engine": test_engine, "db_path": db_path, "get_db_session": get_db_session}

    try:
        os.unlink(db_path)
    except OSError:
        pass


def register_and_login(client, email, get_db_session, password="securepass123"):
    """Helper : inscrit un enseignant vérifié, retourne les headers auth."""
    resp = client.post("/api/auth/register", json={
        "email": email, "password": password,
        "full_name": "Teacher Test", "institution": "Univ Test", "discipline": "Maths",
    })
    assert resp.status_code in (201, 409), f"Inscription échouée: {resp.text}"

    # Marquer comme vérifié directement en DB
    db = get_db_session()
    try:
        teacher = db.query(Teacher).filter(Teacher.email == email).first()
        if teacher and not teacher.is_verified:
            teacher.is_verified = True
            db.commit()
    finally:
        db.close()

    login_resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_resp.status_code == 200, f"Login échoué: {login_resp.text}"
    return {"Authorization": f"Bearer {login_resp.json()['access_token']}"}


class TestSessionsAPI:
    def test_create_session(self, setup_app):
        client, db = setup_app["client"], setup_app["get_db_session"]
        headers = register_and_login(client, "create.session@test.univ.edu", db)
        resp = client.post("/api/teacher/sessions/", json={
            "title": "Examen de Maths", "subject": "Mathématiques",
            "description": "Test de niveau", "duration_seconds": 3600,
            "student_count": 30, "grading_system": "20", "correction_mode": "ai_assisted",
        }, headers=headers)
        assert resp.status_code in (200, 201), f"Création session échouée: {resp.text}"
        assert "title" in resp.json()
        assert "access_code" in resp.json()

    def test_create_session_no_auth(self, setup_app):
        resp = setup_app["client"].post("/api/teacher/sessions/", json={
            "title": "Examen", "subject": "Maths", "student_count": 10,
        })
        assert resp.status_code in (401, 403)

    def test_list_sessions(self, setup_app):
        client, db = setup_app["client"], setup_app["get_db_session"]
        headers = register_and_login(client, "list.test@test.univ.edu", db)
        client.post("/api/teacher/sessions/", json={
            "title": "Session 1", "subject": "Maths",
            "duration_seconds": 3600, "student_count": 10,
        }, headers=headers)
        resp = client.get("/api/teacher/sessions/", headers=headers)
        assert resp.status_code == 200
        assert len(resp.json().get("items", [])) > 0

    def test_get_session_detail(self, setup_app):
        client, db = setup_app["client"], setup_app["get_db_session"]
        headers = register_and_login(client, "detail.test@test.univ.edu", db)
        create_resp = client.post("/api/teacher/sessions/", json={
            "title": "Detail Session", "subject": "Physique",
            "duration_seconds": 3600, "student_count": 15,
        }, headers=headers)
        assert create_resp.status_code in (200, 201), f"Création échouée: {create_resp.text}"
        session_id = create_resp.json()["id"]
        resp = client.get(f"/api/teacher/sessions/{session_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["title"] == "Detail Session"

    def test_get_session_not_found(self, setup_app):
        client, db = setup_app["client"], setup_app["get_db_session"]
        headers = register_and_login(client, "notfound@test.univ.edu", db)
        resp = client.get("/api/teacher/sessions/99999", headers=headers)
        assert resp.status_code == 404

    def test_delete_session_draft(self, setup_app):
        client, db = setup_app["client"], setup_app["get_db_session"]
        headers = register_and_login(client, "delete.test@test.univ.edu", db)
        create_resp = client.post("/api/teacher/sessions/", json={
            "title": "To Delete", "subject": "Chimie",
            "duration_seconds": 3600, "student_count": 5,
        }, headers=headers)
        assert create_resp.status_code in (200, 201), f"Création échouée: {create_resp.text}"
        resp = client.delete(f"/api/teacher/sessions/{create_resp.json()['id']}", headers=headers)
        assert resp.status_code == 200


class TestGradingAPI:
    def test_list_submissions_no_auth(self, setup_app):
        resp = setup_app["client"].get("/api/grading/sessions/1/submissions")
        assert resp.status_code in (401, 403)

    def test_session_results_no_submissions(self, setup_app):
        client, db = setup_app["client"], setup_app["get_db_session"]
        headers = register_and_login(client, "grading.test@test.univ.edu", db)
        create_resp = client.post("/api/teacher/sessions/", json={
            "title": "Grading Test", "subject": "Maths",
            "duration_seconds": 3600, "student_count": 5,
        }, headers=headers)
        assert create_resp.status_code in (200, 201), f"Création échouée: {create_resp.text}"
        resp = client.get(f"/api/grading/sessions/{create_resp.json()['id']}/results", headers=headers)
        assert resp.status_code == 200


class TestExportAPI:
    def test_export_csv_no_auth(self, setup_app):
        resp = setup_app["client"].get("/api/export/sessions/1/csv")
        assert resp.status_code in (401, 403)

    def test_export_excel_no_auth(self, setup_app):
        resp = setup_app["client"].get("/api/export/sessions/1/excel")
        assert resp.status_code in (401, 403)

    def test_export_pdf_no_auth(self, setup_app):
        resp = setup_app["client"].get("/api/export/sessions/1/pdf")
        assert resp.status_code in (401, 403)

    def test_export_csv_session_not_found(self, setup_app):
        client, db = setup_app["client"], setup_app["get_db_session"]
        headers = register_and_login(client, "export.test@test.univ.edu", db)
        resp = client.get("/api/export/sessions/99999/csv", headers=headers)
        assert resp.status_code == 404


class TestHealthAPI:
    def test_health_endpoint(self, setup_app):
        resp = setup_app["client"].get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "PEAN" in data["app"]
