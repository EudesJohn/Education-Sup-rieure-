"""Routeur d'authentification : inscription, connexion, JWT, 2FA."""

import secrets
import logging
from datetime import datetime, timezone, timedelta

import pyotp
import qrcode
import qrcode.image.svg
from fastapi import Depends, HTTPException, Request, status
from fastapi.routing import APIRouter
from io import StringIO

from core.config import get_settings
from core.db import get_teacher_by_id, get_teacher_by_email, create_teacher, update_teacher
from core.dependencies import get_current_teacher
from core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from core.supabase_client import cache
from schemas.auth import (
    EmailVerify,
    ForgotPassword,
    PasswordChange,
    ResetPassword,
    TeacherLogin,
    TeacherRegister,
    TeacherResponse,
    TeacherUpdate,
    TokenRefresh,
    TokenResponse,
    TwoFASetup,
    TwoFAVerify,
    TwoFAVerifyLogin,
)
from services.email_service import email_service
from services.rate_limiter import RateLimiter

settings = get_settings()

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(
    data: TeacherRegister,
    request: Request,
    _: None = Depends(RateLimiter(max_requests=3, window_seconds=3600)),
):
    """Inscription d'un nouvel enseignant. (3 req/h max par IP)"""
    # Vérifier si l'email existe déjà
    existing = get_teacher_by_email(data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte avec cet email existe déjà",
        )

    # Créer l'enseignant
    teacher = create_teacher({
        "email": data.email,
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "institution": data.institution,
        "discipline": data.discipline,
    })

    # Générer les tokens
    access_token = create_access_token(
        data={"sub": str(teacher["id"])},
        expires_delta=timedelta(minutes=60),
    )
    refresh_token = create_refresh_token(data={"sub": str(teacher["id"])})

    # Générer un token de vérification d'email
    verify_token = create_access_token(
        data={"sub": str(teacher["id"]), "type": "email_verify"},
        expires_delta=timedelta(hours=24),
    )

    # Envoyer l'email de vérification
    await email_service.send_verification_email(teacher["email"], verify_token)
    logger = logging.getLogger("pean.auth")
    logger.info("Nouvel enseignant inscrit : %s (verify: %s...)",
                 teacher["email"], verify_token[:20])

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        teacher=TeacherResponse.model_validate(teacher),
        verify_token=verify_token if settings.DEBUG else None,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: TeacherLogin,
    request: Request,
    _: None = Depends(RateLimiter(max_requests=5, window_seconds=900)),
):
    """Connexion d'un enseignant. (5 req/15min max par IP)"""
    teacher = get_teacher_by_email(data.email)

    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
        )

    # Vérifier si le compte est verrouillé
    if teacher.get("locked_until"):
        locked_until = teacher["locked_until"]
        if isinstance(locked_until, str):
            locked_until = datetime.fromisoformat(locked_until)
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        now_utc = datetime.now(timezone.utc)
        if locked_until > now_utc:
            remaining = int((locked_until - now_utc).total_seconds())
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Compte temporairement verrouillé. Réessayez dans {remaining} secondes.",
            )

    # Vérifier le mot de passe
    if not verify_password(data.password, teacher["password_hash"]):
        new_attempts = teacher["login_attempts"] + 1
        update_data = {"login_attempts": new_attempts}
        if new_attempts >= 5:
            update_data["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        update_teacher(teacher["id"], update_data)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
        )

    # Vérifier si l'email a été vérifié (sauf pour les admins)
    if not teacher["is_verified"] and teacher["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Veuillez vérifier votre adresse email avant de vous connecter. "
                   "Un email de vérification a été envoyé lors de l'inscription.",
            headers={"X-Need-Verification": "true"},
        )

    # Vérifier si 2FA est activée
    if teacher["is_2fa_enabled"] and teacher.get("twofa_secret"):
        # Étape 1 : Login avec mot de passe OK, renvoyer un temp_token
        temp_token = create_access_token(
            data={"sub": str(teacher["id"]), "type": "2fa_pending"},
            expires_delta=timedelta(minutes=5),
        )
        return TokenResponse(
            access_token="",  # Pas encore de token complet
            refresh_token="",
            teacher=TeacherResponse.model_validate(teacher),
            twofa_required=True,
            temp_token=temp_token,
        )

    # Réinitialiser les tentatives
    update_teacher(teacher["id"], {"login_attempts": 0, "locked_until": None})

    # Générer les tokens
    access_token = create_access_token(
        data={"sub": str(teacher["id"])},
        expires_delta=timedelta(minutes=60),
    )
    refresh_token = create_refresh_token(data={"sub": str(teacher["id"])})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        teacher=TeacherResponse.model_validate(teacher),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(data: TokenRefresh):
    """Rafraîchir un token JWT avec un refresh token."""
    payload = decode_token(data.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalide ou expiré",
        )

    new_access = create_access_token(
        data={"sub": payload["sub"]},
        expires_delta=timedelta(minutes=60),
    )

    return TokenResponse(
        access_token=new_access,
        refresh_token=data.refresh_token,
        teacher=None,  # Le client a déjà les infos
    )


@router.get("/me", response_model=TeacherResponse)
def get_me(teacher: dict = Depends(get_current_teacher)):
    """Récupérer les informations de l'enseignant connecté."""
    return TeacherResponse.model_validate(teacher)


@router.put("/me", response_model=TeacherResponse)
def update_me(
    data: TeacherUpdate,
    teacher: dict = Depends(get_current_teacher),
):
    """Mettre à jour le profil de l'enseignant."""
    update_data = data.model_dump(exclude_unset=True)
    teacher = update_teacher(teacher["id"], update_data)
    return TeacherResponse.model_validate(teacher)


@router.post("/change-password")
def change_password(
    data: PasswordChange,
    teacher: dict = Depends(get_current_teacher),
):
    """Changer le mot de passe."""
    if not verify_password(data.current_password, teacher["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mot de passe actuel incorrect",
        )
    update_teacher(teacher["id"], {"password_hash": hash_password(data.new_password)})
    return {"message": "Mot de passe modifié avec succès"}


@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPassword,
    request: Request,
):
    """Demande de réinitialisation de mot de passe.

    Génère un token de réinitialisation valable 30 minutes.
    En production, ce token serait envoyé par email.
    """
    teacher = get_teacher_by_email(data.email)
    if not teacher:
        # Ne pas révéler si l'email existe ou pas (sécurité)
        return {
            "message": "Si cet email existe, un lien de réinitialisation a été envoyé.",
            "reset_token": None,
        }

    # Générer un token de réinitialisation
    reset_token = secrets.token_urlsafe(48)
    await cache.set(
        f"password_reset:{reset_token}",
        str(teacher["id"]),
        ttl=1800,  # 30 minutes
    )

    # En production, envoyer un email ici
    # send_reset_email(teacher.email, reset_token)

    logger = logging.getLogger("pean.auth")
    logger.info("Token de réinitialisation généré pour %s", teacher["email"])

    return {
        "message": "Si cet email existe, un lien de réinitialisation a été envoyé.",
        "reset_token": reset_token if request.url.hostname in ("localhost", "127.0.0.1") else None,
    }


@router.post("/reset-password")
async def reset_password(
    data: ResetPassword,
):
    """Réinitialisation du mot de passe avec un token."""
    # Vérifier le token
    teacher_id_str = await cache.get(f"password_reset:{data.token}")
    if not teacher_id_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token invalide ou expiré",
        )

    teacher = get_teacher_by_id(int(teacher_id_str))
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enseignant non trouvé",
        )

    # Changer le mot de passe
    update_teacher(teacher["id"], {
        "password_hash": hash_password(data.password),
        "login_attempts": 0,
        "locked_until": None,
    })

    # Invalider le token
    await cache.delete(f"password_reset:{data.token}")

    return {"message": "Mot de passe réinitialisé avec succès"}


@router.post("/verify-email")
async def verify_email(
    data: EmailVerify,
):
    """Vérification de l'adresse email d'un enseignant."""
    payload = decode_token(data.token)
    if payload is None or payload.get("type") != "email_verify":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de vérification invalide ou expiré",
        )

    teacher_id = payload.get("sub")
    if teacher_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token invalide",
        )

    teacher = get_teacher_by_id(int(teacher_id))
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enseignant non trouvé",
        )

    if teacher["is_verified"]:
        return {"message": "Email déjà vérifié"}

    update_teacher(teacher["id"], {"is_verified": True})

    return {"message": "Email vérifié avec succès"}


@router.get("/2fa/setup")
def setup_2fa(
    teacher: dict = Depends(get_current_teacher),
):
    """Configurer l'authentification 2FA (TOTP).

    Génère un secret TOTP et retourne l'URI du QR code
    à scanner avec Google Authenticator / Authy.
    """
    if teacher.get("twofa_secret") and teacher["is_2fa_enabled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La 2FA est déjà activée. Désactivez-la d'abord pour la reconfigurer.",
        )

    # Générer un nouveau secret TOTP
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning_uri = totp.provisioning_uri(
        name=teacher["email"],
        issuer_name=settings.TWOFA_ISSUER or "PEAN",
    )

    # Sauvegarder temporairement le secret (pas encore activé)
    update_teacher(teacher["id"], {
        "twofa_secret": secret,
        "is_2fa_enabled": False,
    })

    # Générer le QR code en SVG
    qr = qrcode.make(provisioning_uri, image_factory=qrcode.image.svg.SvgImage)
    stream = StringIO()
    qr.save(stream)
    qr_svg = stream.getvalue()

    return {
        "secret": secret,
        "provisioning_uri": provisioning_uri,
        "qr_code_svg": qr_svg,
        "message": "Scannez le QR code avec votre application d'authentification, "
                   "puis confirmez avec /2fa/verify",
    }


@router.post("/2fa/verify")
def verify_2fa_setup(
    data: TwoFAVerify,
    teacher: dict = Depends(get_current_teacher),
):
    """Vérifier et activer la 2FA après configuration.

    Valide que le code TOTP saisi par l'utilisateur est correct,
    puis active définitivement la 2FA.
    """
    if not teacher.get("twofa_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun secret 2FA trouvé. Utilisez /2fa/setup d'abord.",
        )

    totp = pyotp.TOTP(teacher["twofa_secret"])
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code 2FA invalide. Vérifiez l'heure de votre appareil et réessayez.",
        )

    update_teacher(teacher["id"], {"is_2fa_enabled": True})

    return {"message": "2FA activée avec succès"}


@router.post("/2fa/disable")
def disable_2fa(
    data: TwoFAVerify,
    teacher: dict = Depends(get_current_teacher),
):
    """Désactiver la 2FA (nécessite un code valide)."""
    if not teacher.get("twofa_secret") or not teacher["is_2fa_enabled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La 2FA n'est pas activée.",
        )

    totp = pyotp.TOTP(teacher["twofa_secret"])
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code 2FA invalide.",
        )

    update_teacher(teacher["id"], {
        "twofa_secret": None,
        "is_2fa_enabled": False,
    })

    return {"message": "2FA désactivée avec succès"}


@router.post("/2fa/verify-login")
def verify_2fa_login(
    data: TwoFAVerifyLogin,
):
    """Seconde étape de connexion : vérification du code 2FA.

    Après un login réussi (mot de passe correct), l'utilisateur reçoit
    un temp_token. Il doit fournir un code TOTP valide pour obtenir
    le token d'accès complet.
    """
    payload = decode_token(data.temp_token)
    if payload is None or payload.get("type") != "2fa_pending":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token temporaire invalide ou expiré",
        )

    teacher = get_teacher_by_id(int(payload["sub"]))
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Enseignant non trouvé",
        )

    if not teacher.get("twofa_secret"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La 2FA n'est pas configurée",
        )

    totp = pyotp.TOTP(teacher["twofa_secret"])
    if not totp.verify(data.code, valid_window=1):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Code 2FA invalide",
        )

    # 2FA OK → générer les tokens finals
    access_token = create_access_token(
        data={"sub": str(teacher["id"])},
        expires_delta=timedelta(minutes=60),
    )
    refresh_token = create_refresh_token(data={"sub": str(teacher["id"])})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        teacher=TeacherResponse.model_validate(teacher),
    )


@router.post("/resend-verification")
async def resend_verification(
    teacher: dict = Depends(get_current_teacher),
):
    """Renvoyer l'email de vérification."""
    if teacher["is_verified"]:
        return {"message": "Email déjà vérifié"}

    # Générer un nouveau token de vérification
    verify_token = create_access_token(
        data={"sub": str(teacher["id"]), "type": "email_verify"},
        expires_delta=timedelta(hours=24),
    )

    # Envoyer l'email
    await email_service.send_verification_email(teacher["email"], verify_token)

    logger = logging.getLogger("pean.auth")
    logger.info("Nouveau token de vérification pour %s", teacher["email"])

    return {
        "message": "Email de vérification envoyé",
        "verify_token": verify_token if settings.DEBUG else None,
    }
