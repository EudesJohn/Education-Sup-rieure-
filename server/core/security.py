"""Sécurité : JWT, hash, 2FA."""

from datetime import datetime, timedelta, timezone
import hashlib as _hashlib
import hmac as _hmac
from typing import Optional

import bcrypt as _bcrypt
from jose import JWTError, jwt

from core.config import get_settings

settings = get_settings()


def hash_password(password: str) -> str:
    """Hash un mot de passe avec bcrypt."""
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Vérifie un mot de passe contre son hash."""
    if plain_password is None:
        return False
    return _bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crée un token JWT d'accès.

    Si ``data`` contient déjà une clé ``type`` (ex: ``type="email_verify"``),
    elle est conservée. Sinon, la valeur par défaut ``"access"`` est utilisée.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.JWT_EXPIRATION_MINUTES)
    )
    to_encode["exp"] = expire
    to_encode.setdefault("type", "access")
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """Crée un token JWT de rafraîchissement."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.JWT_REFRESH_EXPIRATION_DAYS
    )
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Décode et valide un token JWT."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def hash_student_identifier(session_id: int, student_number: str) -> str:
    """Génère un hash unique et déterministe pour un étudiant dans une session.

    Utilise HMAC-SHA256 avec la secret key JWT comme sel (salt),
    garantissant que même avec le matricule et l'ID de session,
    un attaquant ne peut pas recalculer le hash sans connaître la clé.
    """
    raw = f"{student_number}:{session_id}"
    return _hmac.new(
        settings.JWT_SECRET_KEY.encode(), raw.encode(), _hashlib.sha256
    ).hexdigest()
