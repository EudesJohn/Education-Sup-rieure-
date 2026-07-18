"""Tests des dépendances d'authentification (middleware JWT, rôle).

Utilise le mock Supabase via conftest. Teste get_current_teacher,
RoleChecker, et verify_student_session en isolation.
"""

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


# ============================================================
# get_current_teacher
# ============================================================

class TestGetCurrentTeacher:
    """Tests de la dépendance get_current_teacher."""

    def test_valid_token_returns_teacher(self):
        """Token JWT valide → retourne l'enseignant."""
        from unittest.mock import patch as _patch
        from core.security import create_access_token
        from core.dependencies import get_current_teacher

        token = create_access_token(data={"sub": "1", "type": "access"})
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with _patch("core.dependencies.get_teacher_by_id", return_value={
            "id": 1, "email": "test@test.com", "full_name": "Dr Test",
        }):
            teacher = get_current_teacher(credentials)
            assert teacher["id"] == 1
            assert teacher["email"] == "test@test.com"

    def test_invalid_token_raises(self):
        """Token JWT invalide → HTTPException 401."""
        from core.dependencies import get_current_teacher

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="invalid.jwt.token")

        with pytest.raises(HTTPException) as exc:
            get_current_teacher(credentials)
        assert exc.value.status_code == 401

    def test_missing_sub_raises(self):
        """Token sans 'sub' → HTTPException 401."""
        from core.security import create_access_token
        from core.dependencies import get_current_teacher

        token = create_access_token(data={"type": "access"})  # pas de 'sub'
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with pytest.raises(HTTPException) as exc:
            get_current_teacher(credentials)
        assert exc.value.status_code == 401

    def test_wrong_token_type_raises(self):
        """Token de type refresh → HTTPException 401."""
        from core.security import create_access_token
        from core.dependencies import get_current_teacher

        token = create_access_token(data={"sub": "1", "type": "refresh"})
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with pytest.raises(HTTPException) as exc:
            get_current_teacher(credentials)
        assert exc.value.status_code == 401

    def test_nonexistent_teacher_raises(self):
        """Token valide mais enseignant supprimé → HTTPException 404."""
        from unittest.mock import patch as _patch
        from core.security import create_access_token
        from core.dependencies import get_current_teacher

        token = create_access_token(data={"sub": "999", "type": "access"})
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

        with _patch("core.dependencies.get_teacher_by_id", return_value=None):
            with pytest.raises(HTTPException) as exc:
                get_current_teacher(credentials)
            assert exc.value.status_code == 404


# ============================================================
# RoleChecker
# ============================================================

class TestRoleChecker:
    """Tests du RoleChecker."""

    def test_allowed_role_passes(self):
        """Rôle autorisé → retourne l'enseignant."""
        from core.dependencies import RoleChecker
        checker = RoleChecker(allowed_roles=["teacher", "admin"])

        teacher = {"id": 1, "role": "teacher"}
        result = checker(teacher)
        assert result["id"] == 1

    def test_admin_role_passes(self):
        """Rôle admin autorisé."""
        from core.dependencies import RoleChecker
        checker = RoleChecker(allowed_roles=["admin"])

        teacher = {"id": 1, "role": "admin"}
        result = checker(teacher)
        assert result["role"] == "admin"

    def test_forbidden_role_raises(self):
        """Rôle non autorisé → HTTPException 403."""
        from core.dependencies import RoleChecker
        checker = RoleChecker(allowed_roles=["admin"])

        teacher = {"id": 1, "role": "teacher"}

        with pytest.raises(HTTPException) as exc:
            checker(teacher)
        assert exc.value.status_code == 403

    def test_multiple_roles_one_match(self):
        """Un des rôles autorisés correspond."""
        from core.dependencies import RoleChecker
        checker = RoleChecker(allowed_roles=["moderator", "admin"])

        with pytest.raises(HTTPException) as exc:
            checker({"id": 1, "role": "teacher"})
        assert exc.value.status_code == 403


# ============================================================
# verify_student_session
# ============================================================

class TestVerifyStudentSession:
    """Tests de la dépendance verify_student_session."""

    def test_active_session_found(self):
        """Session active + étudiant trouvé → retourne l'épreuve."""
        from core.dependencies import verify_student_session
        from core.security import hash_student_identifier

        expected_hash = hash_student_identifier(1, "ETU001")

        # verify_student_session utilise des imports locaux (from core.db import ...)
        with patch("core.dependencies.get_session_by_code", return_value={"id": 1, "status": "active"}), \
             patch("core.db.get_session_exams", return_value=[
                 {"id": 10, "student_id_hash": expected_hash, "status": "started"},
             ]):
            exam = verify_student_session("TEST123", "ETU001")
            assert exam["id"] == 10

    def test_session_not_found(self):
        """Session inexistante → 404."""
        from core.dependencies import verify_student_session

        with patch("core.dependencies.get_session_by_code", return_value=None):
            with pytest.raises(HTTPException) as exc:
                verify_student_session("NONE", "ETU001")
            assert exc.value.status_code == 404

    def test_session_inactive(self):
        """Session inactive → 403."""
        from core.dependencies import verify_student_session

        with patch("core.dependencies.get_session_by_code", return_value={"id": 1, "status": "draft"}):
            with pytest.raises(HTTPException) as exc:
                verify_student_session("DRAFT", "ETU001")
            assert exc.value.status_code == 403

    def test_student_not_found(self):
        """Étudiant non trouvé dans la session → 404."""
        from core.dependencies import verify_student_session

        with patch("core.dependencies.get_session_by_code", return_value={"id": 1, "status": "active"}), \
             patch("core.db.get_session_exams", return_value=[]):

            with pytest.raises(HTTPException) as exc:
                verify_student_session("TEST123", "NOBODY")
            assert exc.value.status_code == 404

    def test_already_submitted(self):
        """Épreuve déjà soumise → 403."""
        from core.dependencies import verify_student_session
        from core.security import hash_student_identifier

        expected_hash = hash_student_identifier(1, "ETU001")

        with patch("core.dependencies.get_session_by_code", return_value={"id": 1, "status": "active"}), \
             patch("core.db.get_session_exams", return_value=[
                 {"id": 10, "student_id_hash": expected_hash, "status": "submitted"},
             ]):

            with pytest.raises(HTTPException) as exc:
                verify_student_session("TEST123", "ETU001")
            assert exc.value.status_code == 403
