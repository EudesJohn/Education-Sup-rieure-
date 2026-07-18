"""Tests du module d'authentification — routeurs /api/auth/*.

Les tokens JWT sont générés avec la clé de test JWT_SECRET_KEY="test-secret-key-for-pean-tests-only".
Les appels DB sont mockés au niveau des modules qui les importent (api.auth.router, core.dependencies).
"""

from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from core.security import create_access_token


# ============================================================
# Helpers
# ============================================================

def _auth_header(teacher_id: int = 1) -> dict:
    """Génère un header Authorization valide pour les tests."""
    token = create_access_token(
        data={"sub": str(teacher_id), "type": "access"},
        expires_delta=timedelta(hours=1),
    )
    return {"Authorization": f"Bearer {token}"}


def _mock_teacher(overrides=None) -> dict:
    """Enseignant factice pour les tests."""
    data = {
        "id": 1, "email": "test@test.com", "full_name": "Dr Test",
        "institution": "Univ", "discipline": "Maths",
        "institution_ids": [], "subject_ids": [],
        "avatar_url": None, "is_verified": True, "is_2fa_enabled": False,
        "role": "teacher", "created_at": "2025-06-01T10:00:00Z",
        "login_attempts": 0, "locked_until": None, "twofa_secret": None,
        "password_hash": "",
    }
    if overrides:
        data.update(overrides)
    return data


# ============================================================
# POST /api/auth/register
# ============================================================

class TestRegister:
    """Tests d'inscription."""

    def test_register_success(self, client):
        """Inscription réussie → 201 + tokens."""
        with patch("api.auth.router.get_teacher_by_email", return_value=None), \
             patch("core.db.get_institution_by_id", return_value={"id": 1, "name": "Université de Test"}), \
             patch("core.db.get_subject_by_id", return_value={"id": 1, "name": "Mathématiques"}), \
             patch("api.auth.router.create_teacher", return_value=_mock_teacher({"id": 2, "email": "new@teacher.com", "is_verified": False})), \
             patch("api.auth.router.email_service.send_verification_email", new_callable=AsyncMock) as mock_email:

            resp = client.post("/api/auth/register", json={
                "email": "new@teacher.com",
                "password": "StrongPass1",
                "full_name": "Nouveau Prof",
                "institution_id": 1,
                "subject_id": 1,
            })

        assert resp.status_code == 201
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["teacher"]["email"] == "new@teacher.com"
        mock_email.assert_awaited_once()

    def test_register_duplicate_email(self, client):
        """Inscription avec email existant → 409."""
        with patch("api.auth.router.get_teacher_by_email", return_value={"id": 1, "email": "existing@test.com"}):
            resp = client.post("/api/auth/register", json={
                "email": "existing@test.com",
                "password": "StrongPass1",
                "full_name": "Déjà Pris",
                "institution": "Univ",
                "discipline": "Maths",
            })

        assert resp.status_code == 409
        assert "existe déjà" in resp.json()["detail"]

    def test_register_missing_institution(self, client):
        """Inscription sans institution → 400."""
        with patch("api.auth.router.get_teacher_by_email", return_value=None):
            resp = client.post("/api/auth/register", json={
                "email": "noinst@teacher.com",
                "password": "StrongPass1",
                "full_name": "No Inst",
            })
        assert resp.status_code == 400
        assert "institution" in resp.json()["detail"].lower()

    def test_register_weak_password(self, client):
        """Mot de passe trop court → 422."""
        resp = client.post("/api/auth/register", json={
            "email": "weak@teacher.com",
            "password": "123",
            "full_name": "Weak",
            "institution": "Univ",
            "discipline": "Maths",
        })
        assert resp.status_code == 422


# ============================================================
# POST /api/auth/login
# ============================================================

class TestLogin:
    """Tests de connexion."""

    def test_login_success(self, client):
        """Connexion réussie → 200 + tokens."""
        from core.security import hash_password
        pw_hash = hash_password("GoodPass1")

        teacher = _mock_teacher({"password_hash": pw_hash})
        with patch("api.auth.router.get_teacher_by_email", return_value=teacher), \
             patch("api.auth.router.update_teacher"):

            resp = client.post("/api/auth/login", json={
                "email": "test@test.com",
                "password": "GoodPass1",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] != ""
        assert data["teacher"]["email"] == "test@test.com"

    def test_login_wrong_password(self, client):
        """Mauvais mot de passe → 401."""
        from core.security import hash_password
        pw_hash = hash_password("RealPass1")

        with patch("api.auth.router.get_teacher_by_email", return_value=_mock_teacher({
            "password_hash": pw_hash,
        })), patch("api.auth.router.update_teacher"):
            resp = client.post("/api/auth/login", json={
                "email": "test@test.com",
                "password": "WrongPass1",
            })
        assert resp.status_code == 401

    def test_login_nonexistent_email(self, client):
        """Email inexistant → 401."""
        with patch("api.auth.router.get_teacher_by_email", return_value=None):
            resp = client.post("/api/auth/login", json={
                "email": "nobody@test.com",
                "password": "Anything1",
            })
        assert resp.status_code == 401

    def test_login_unverified_email(self, client):
        """Email non vérifié → 403."""
        from core.security import hash_password
        pw_hash = hash_password("GoodPass1")

        with patch("api.auth.router.get_teacher_by_email", return_value=_mock_teacher({
            "is_verified": False, "password_hash": pw_hash,
        })), patch("api.auth.router.update_teacher"):
            resp = client.post("/api/auth/login", json={
                "email": "unverified@test.com",
                "password": "GoodPass1",
            })

        assert resp.status_code == 403
        assert "vérifier" in resp.json()["detail"].lower()

    def test_login_locked_account(self, client):
        """Compte verrouillé → 429."""
        from datetime import datetime, timezone, timedelta
        locked_until = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

        with patch("api.auth.router.get_teacher_by_email", return_value=_mock_teacher({
            "locked_until": locked_until, "password_hash": "anything",
        })):
            resp = client.post("/api/auth/login", json={
                "email": "locked@test.com",
                "password": "Anything1",
            })
        assert resp.status_code == 429


# ============================================================
# GET /api/auth/me  &  PUT /api/auth/me
# ============================================================

class TestMe:
    """Tests du profil enseignant."""

    def test_get_me_authenticated(self, client):
        """GET /me avec token valide → 200 + profil."""
        with patch("core.dependencies.get_teacher_by_id", return_value=_mock_teacher()):
            resp = client.get("/api/auth/me", headers=_auth_header(1))

        assert resp.status_code == 200
        assert resp.json()["email"] == "test@test.com"

    def test_get_me_unauthenticated(self, client):
        """GET /me sans token → 401 ou 403."""
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    def test_get_me_invalid_token(self, client):
        """GET /me avec token invalide → 401."""
        resp = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
        assert resp.status_code == 401

    def test_update_me(self, client):
        """PUT /me met à jour le profil."""
        updated = _mock_teacher({"full_name": "Dr Updated", "discipline": "Physique"})
        with patch("core.dependencies.get_teacher_by_id", return_value=_mock_teacher()), \
             patch("api.auth.router.update_teacher", return_value=updated):
            resp = client.put("/api/auth/me", json={
                "full_name": "Dr Updated",
                "discipline": "Physique",
            }, headers=_auth_header(1))

        assert resp.status_code == 200
        assert resp.json()["full_name"] == "Dr Updated"


# ============================================================
# POST /api/auth/refresh
# ============================================================

class TestRefresh:
    """Tests de rafraîchissement de token."""

    def test_refresh_success(self, client):
        """Refresh token valide → 200 + nouveau access_token."""
        from core.security import create_refresh_token
        rt = create_refresh_token(data={"sub": "1", "type": "refresh"})

        resp = client.post("/api/auth/refresh", json={"refresh_token": rt})
        assert resp.status_code == 200
        data = resp.json()
        assert data["access_token"] != ""

    def test_refresh_invalid_token(self, client):
        """Refresh token invalide → 401."""
        resp = client.post("/api/auth/refresh", json={"refresh_token": "not.a.token"})
        assert resp.status_code == 401

    def test_refresh_access_token_rejected(self, client):
        """Un access_token ne peut pas servir de refresh_token."""
        at = create_access_token(data={"sub": "1"})
        resp = client.post("/api/auth/refresh", json={"refresh_token": at})
        assert resp.status_code == 401


# ============================================================
# POST /api/auth/change-password
# ============================================================

class TestChangePassword:
    """Tests de changement de mot de passe."""

    def test_change_password_success(self, client):
        """Changement de mot de passe réussi."""
        from core.security import hash_password
        pw_hash = hash_password("OldPass1")

        with patch("core.dependencies.get_teacher_by_id", return_value=_mock_teacher({"password_hash": pw_hash})), \
             patch("api.auth.router.update_teacher") as mock_update:
            resp = client.post("/api/auth/change-password", json={
                "current_password": "OldPass1",
                "new_password": "NewPass123",
            }, headers=_auth_header(1))

        assert resp.status_code == 200
        assert "modifié" in resp.json()["message"]

    def test_change_password_wrong_current(self, client):
        """Mauvais mot de passe actuel → 400."""
        from core.security import hash_password
        pw_hash = hash_password("RealOld1")

        with patch("core.dependencies.get_teacher_by_id", return_value=_mock_teacher({"password_hash": pw_hash})):
            resp = client.post("/api/auth/change-password", json={
                "current_password": "WrongOld1",
                "new_password": "NewPass123",
            }, headers=_auth_header(1))
        assert resp.status_code == 400


# ============================================================
# POST /api/auth/verify-email
# ============================================================

class TestVerifyEmail:
    """Tests de vérification d'email."""

    def test_verify_email_success(self, client):
        """Vérification d'email réussie."""
        token = create_access_token(
            data={"sub": "1", "type": "email_verify"},
            expires_delta=timedelta(hours=24),
        )

        with patch("api.auth.router.get_teacher_by_id", return_value=_mock_teacher({"is_verified": False})), \
             patch("api.auth.router.update_teacher"):
            resp = client.post("/api/auth/verify-email", json={"token": token})

        assert resp.status_code == 200
        assert "vérifié" in resp.json()["message"]

    def test_verify_email_invalid_token(self, client):
        """Token invalide → 400."""
        resp = client.post("/api/auth/verify-email", json={"token": "bad.token.here"})
        assert resp.status_code == 400

    def test_verify_email_already_verified(self, client):
        """Email déjà vérifié → message explicite."""
        token = create_access_token(
            data={"sub": "1", "type": "email_verify"},
            expires_delta=timedelta(hours=24),
        )
        with patch("api.auth.router.get_teacher_by_id", return_value=_mock_teacher({"is_verified": True})):
            resp = client.post("/api/auth/verify-email", json={"token": token})
        assert resp.status_code == 200
        assert "déjà vérifié" in resp.json()["message"].lower()


# ============================================================
# POST /api/auth/forgot-password & /reset-password
# ============================================================

class TestPasswordReset:
    """Tests de réinitialisation de mot de passe."""

    def test_forgot_password_existing_email(self, client):
        """Demande de reset pour un email existant."""
        with patch("api.auth.router.get_teacher_by_email", return_value={"id": 1, "email": "reset@test.com"}), \
             patch("api.auth.router.cache") as mock_cache:
            mock_cache.set = AsyncMock(return_value=True)
            resp = client.post("/api/auth/forgot-password", json={
                "email": "reset@test.com",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert "message" in data

    def test_forgot_password_nonexistent(self, client):
        """Demande de reset pour un email inexistant → message générique."""
        with patch("api.auth.router.get_teacher_by_email", return_value=None), \
             patch("api.auth.router.cache") as mock_cache:
            resp = client.post("/api/auth/forgot-password", json={
                "email": "nobody@test.com",
            })

        assert resp.status_code == 200
        assert resp.json().get("reset_token") is None

    def test_reset_password_success(self, client):
        """Réinitialisation avec token valide."""
        with patch("api.auth.router.cache") as mock_cache, \
             patch("api.auth.router.get_teacher_by_id", return_value=_mock_teacher()), \
             patch("api.auth.router.update_teacher") as mock_update:
            mock_cache.get = AsyncMock(return_value="1")
            mock_cache.delete = AsyncMock(return_value=True)

            resp = client.post("/api/auth/reset-password", json={
                "token": "valid-reset-token-123",
                "password": "NewPass123",
            })

        assert resp.status_code == 200
        assert "réinitialisé" in resp.json()["message"]

    def test_reset_password_invalid_token(self, client):
        """Token invalide → 400."""
        with patch("api.auth.router.cache") as mock_cache:
            mock_cache.get = AsyncMock(return_value=None)
            resp = client.post("/api/auth/reset-password", json={
                "token": "expired-token",
                "password": "NewPass123",
            })

        assert resp.status_code == 400
        assert "invalide" in resp.json()["detail"].lower()


# ============================================================
# POST /api/auth/resend-verification
# ============================================================

class TestResendVerification:
    """Tests de renvoi d'email de vérification."""

    def test_resend_success(self, client):
        """Renvoi réussi."""
        with patch("core.dependencies.get_teacher_by_id", return_value=_mock_teacher({"is_verified": False})), \
             patch("api.auth.router.email_service.send_verification_email", new_callable=AsyncMock):
            resp = client.post("/api/auth/resend-verification", headers=_auth_header(1))

        assert resp.status_code == 200
        assert "envoyé" in resp.json()["message"].lower()

    def test_resend_already_verified(self, client):
        """Email déjà vérifié."""
        with patch("core.dependencies.get_teacher_by_id", return_value=_mock_teacher({"is_verified": True})):
            resp = client.post("/api/auth/resend-verification", headers=_auth_header(1))
        assert resp.status_code == 200
        assert "déjà vérifié" in resp.json()["message"].lower()
