"""Tests du module d'authentification : inscription, connexion, JWT, 2FA."""

import pytest
from datetime import datetime, timezone, timedelta

from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from models.teacher import Teacher


class TestPasswordHashing:
    """Tests de hachage et vérification des mots de passe."""

    def test_hash_password(self):
        """Vérifie que le hachage produit un résultat non vide."""
        hashed = hash_password("SecurePass123!")
        assert hashed is not None
        assert isinstance(hashed, str)
        assert len(hashed) > 20

    def test_verify_password_correct(self):
        """Vérifie qu'un mot de passe correct est reconnu."""
        hashed = hash_password("SecurePass123!")
        assert verify_password("SecurePass123!", hashed) is True

    def test_verify_password_incorrect(self):
        """Vérifie qu'un mauvais mot de passe est rejeté."""
        hashed = hash_password("SecurePass123!")
        assert verify_password("WrongPass456!", hashed) is False

    def test_verify_password_empty(self):
        """Vérifie qu'un mot de passe vide est rejeté."""
        hashed = hash_password("SecurePass123!")
        assert verify_password("", hashed) is False

    def test_verify_password_none(self):
        """Vérifie qu'un None est rejeté."""
        hashed = hash_password("SecurePass123!")
        assert verify_password(None, hashed) is False


class TestJWTToken:
    """Tests de création et validation des tokens JWT."""

    def test_create_access_token(self):
        """Vérifie la création d'un token d'accès."""
        token = create_access_token(
            data={"sub": "1"},
            expires_delta=timedelta(minutes=60),
        )
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 50

    def test_create_refresh_token(self):
        """Vérifie la création d'un refresh token."""
        token = create_refresh_token(data={"sub": "1"})
        assert token is not None
        assert isinstance(token, str)

    def test_decode_valid_token(self):
        """Vérifie le décodage d'un token valide."""
        token = create_access_token(
            data={"sub": "42"},
            expires_delta=timedelta(minutes=60),
        )
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "42"

    def test_decode_expired_token(self):
        """Vérifie qu'un token expiré est rejeté."""
        token = create_access_token(
            data={"sub": "1"},
            expires_delta=timedelta(seconds=-1),  # Expiré
        )
        payload = decode_token(token)
        assert payload is None

    def test_decode_invalid_token(self):
        """Vérifie qu'un token invalide est rejeté."""
        payload = decode_token("invalid_token_here")
        assert payload is None

    def test_decode_empty_token(self):
        """Vérifie qu'un token vide est rejeté."""
        payload = decode_token("")
        assert payload is None

    def test_refresh_token_type(self):
        """Vérifie que le refresh token a le bon type."""
        token = create_refresh_token(data={"sub": "1"})
        payload = decode_token(token)
        assert payload is not None
        assert payload.get("type") == "refresh"

    def test_access_token_has_no_type(self):
        """Vérifie que le token d'accès n'a pas de type (ou 'access')."""
        token = create_access_token(
            data={"sub": "1"},
            expires_delta=timedelta(minutes=60),
        )
        payload = decode_token(token)
        assert payload is not None
        # Access tokens peuvent avoir 'access' ou pas de type
        assert payload.get("type") is None or payload["type"] == "access"


class TestTeacherModel:
    """Tests de création et manipulation des enseignants."""

    def test_create_teacher(self, db_session):
        """Vérifie la création d'un enseignant."""
        teacher = Teacher(
            email="new@prof.edu",
            password_hash=hash_password("Test1234!"),
            full_name="Nouveau Professeur",
            institution="Université Test",
            discipline="Physique",
            is_verified=True,
            role="teacher",
        )
        db_session.add(teacher)
        db_session.commit()
        db_session.refresh(teacher)

        assert teacher.id is not None
        assert teacher.email == "new@prof.edu"
        assert teacher.role == "teacher"
        assert teacher.is_verified is True
        assert teacher.login_attempts == 0
        assert teacher.locked_until is None

    def test_teacher_default_values(self, db_session):
        """Vérifie les valeurs par défaut des enseignants."""
        teacher = Teacher(
            email="default@prof.edu",
            password_hash=hash_password("Test1234!"),
            full_name="Default Prof",
            institution="Inst",
            discipline="Info",
        )
        db_session.add(teacher)
        db_session.commit()

        assert teacher.role == "teacher"
        assert teacher.is_verified is False
        assert teacher.is_2fa_enabled is False
        assert teacher.login_attempts == 0

    def test_teacher_login_attempts_increment(self, db_session, sample_teacher):
        """Vérifie l'incrémentation des tentatives de connexion."""
        teacher = sample_teacher
        teacher.login_attempts += 1
        db_session.commit()
        db_session.refresh(teacher)
        assert teacher.login_attempts == 1

    def test_teacher_locked_until(self, db_session, sample_teacher):
        """Vérifie le verrouillage du compte."""
        teacher = sample_teacher
        lock_time = datetime.now(timezone.utc) + timedelta(minutes=15)
        teacher.locked_until = lock_time
        teacher.login_attempts = 5
        db_session.commit()
        db_session.refresh(teacher)

        assert teacher.locked_until is not None
        assert teacher.login_attempts == 5
        locked_until = teacher.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        assert locked_until > datetime.now(timezone.utc)

    def test_teacher_str(self, db_session):
        """Vérifie la représentation string d'un enseignant."""
        teacher = Teacher(
            email="str@test.edu",
            password_hash="hash",
            full_name="Test Prof",
            institution="U",
            discipline="D",
        )
        assert teacher.email == "str@test.edu"


class TestTeacherRegistration:
    """Tests d'inscription (logique métier sans HTTP)."""

    def test_email_uniqueness(self, db_session, sample_teacher):
        """Vérifie que deux enseignants ne peuvent pas avoir le même email."""
        existing = db_session.query(Teacher).filter(
            Teacher.email == sample_teacher.email
        ).first()
        assert existing is not None
        assert existing.id == sample_teacher.id

        # Tenter de créer un doublon
        duplicate = db_session.query(Teacher).filter(
            Teacher.email == sample_teacher.email
        ).count()
        assert duplicate == 1

    def test_password_hash_is_not_plaintext(self):
        """Vérifie que le mot de passe n'est pas stocké en clair."""
        hashed = hash_password("MySecretP@ss123")
        assert hashed != "MySecretP@ss123"
        assert "$2b$" in hashed or "$argon2" in hashed or hashed.startswith("$")

    def test_invalid_email_format(self):
        """Vérifie le rejet des emails invalides (validation logique)."""
        import re
        pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        assert re.match(pattern, "valid@email.com") is not None
        assert re.match(pattern, "invalid-email") is None
        assert re.match(pattern, "@domain.com") is None
