"""Routeur d'authentification : inscription, connexion, JWT, 2FA."""

import secrets
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("pean.auth")

import pyotp
from fastapi import Depends, HTTPException, Request, status
from fastapi.routing import APIRouter

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
    """Inscription d'un nouvel enseignant. (3 req/h max par IP)

    Necessite un code d'invitation valide pour prevenir les inscriptions
    non autorisees (ex: etudiant qui contourne /etudiant pour creer un
    compte enseignant).

    Retourne directement les tokens d'acces — l'email est verifie
    automatiquement.
    """
    # 1. Valider le code d'invitation
    from core.db import validate_invitation_code, use_invitation_code
    inv = validate_invitation_code(data.invitation_code)
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Code d'invitation invalide, expiré ou déjà utilisé. "
                   "Contactez votre administrateur pour obtenir un nouveau code.",
        )

    # 2. Verifier si l'email existe deja
    existing = get_teacher_by_email(data.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un compte avec cet email existe déjà",
        )

    # 3. Resoudre les etablissements et matieres (multi ou simple)
    institution = data.institution or ""
    discipline = data.discipline or ""
    institution_ids = data.institution_ids or []
    subject_ids = data.subject_ids or []

    from core.db import get_institution_by_id, get_subject_by_id

    # Priorite aux nouveaux champs multi-selection
    if institution_ids:
        names = []
        for inst_id in institution_ids:
            inst = get_institution_by_id(inst_id)
            if inst:
                names.append(inst["name"])
        if names:
            institution = " / ".join(names)
    elif data.institution_id:
        inst = get_institution_by_id(data.institution_id)
        if inst:
            institution = inst["name"]

    if subject_ids:
        names = []
        for subj_id in subject_ids:
            subj = get_subject_by_id(subj_id)
            if subj:
                names.append(subj["name"])
        if names:
            discipline = " / ".join(names)
    elif data.subject_id:
        subj = get_subject_by_id(data.subject_id)
        if subj:
            discipline = subj["name"]

    if not institution:
        raise HTTPException(status_code=400, detail="Le champ institution ou institution_id est requis")
    if not discipline:
        raise HTTPException(status_code=400, detail="Le champ discipline ou subject_id est requis")

    # 4. Creer l'enseignant (compte actif directement)
    teacher = create_teacher({
        "email": data.email,
        "password_hash": hash_password(data.password),
        "full_name": data.full_name,
        "institution": institution,
        "discipline": discipline,
        "institution_ids": institution_ids,
        "subject_ids": subject_ids,
        "invitation_code_id": inv["id"],
        "is_verified": True,
    })

    # 5. Marquer le code comme utilise
    use_invitation_code(data.invitation_code, teacher["id"])

    # 6. Generer les tokens JWT avec les infos de rôle
    access_token = create_access_token(
        data={
            "sub": str(teacher["id"]),
            "role": teacher.get("role", "teacher"),
            "institution_id": teacher.get("institution_id"),
        },
        expires_delta=timedelta(minutes=60),
    )
    refresh_token = create_refresh_token(data={"sub": str(teacher["id"])})

    logger.info("Nouvel enseignant inscrit : %s", teacher["email"])

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        teacher=TeacherResponse.model_validate(teacher),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: TeacherLogin,
    request: Request,
    _: None = Depends(RateLimiter(max_requests=5, window_seconds=900)),
):
    """Connexion d'un enseignant. (5 req/15min max par IP)

    Le compte est cree directement actif — aucune verification email requise.
    """
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

    # Générer les tokens avec les infos de rôle
    access_token = create_access_token(
        data={
            "sub": str(teacher["id"]),
            "role": teacher.get("role", "teacher"),
            "institution_id": teacher.get("institution_id"),
        },
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

    # Récupérer les infos à jour de l'enseignant
    teacher = get_teacher_by_id(int(payload["sub"]))
    new_access = create_access_token(
        data={
            "sub": payload["sub"],
            "role": teacher.get("role", "teacher") if teacher else "teacher",
            "institution_id": teacher.get("institution_id") if teacher else None,
        },
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
    La génération du QR code est faite côté client.
    """
    if teacher.get("twofa_secret") and teacher["is_2fa_enabled"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La 2FA est déjà activée. Désactivez-la d'abord pour la reconfigurer.",
        )

    try:
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

        return {
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "message": "Scannez le QR code avec votre application d'authentification, "
                       "puis confirmez avec /2fa/verify",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la configuration 2FA: {str(e)}",
        )


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
        data={
            "sub": str(teacher["id"]),
            "role": teacher.get("role", "teacher"),
            "institution_id": teacher.get("institution_id"),
        },
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
    """Renvoyer l'email de vérification (nécessite auth)."""
    if teacher["is_verified"]:
        return {"message": "Email déjà vérifié"}

    # Générer un nouveau token de vérification
    verify_token = create_access_token(
        data={"sub": str(teacher["id"]), "type": "email_verify"},
        expires_delta=timedelta(hours=24),
    )

    # Envoyer l'email
    await email_service.send_verification_email(teacher["email"], verify_token)

    logger.info("Nouveau token de vérification pour %s", teacher["email"])

    return {
        "message": "Email de vérification envoyé",
        "verify_token": verify_token if settings.DEBUG else None,
    }


from pydantic import BaseModel as _BM

class _ResendVerificationPublic(_BM):
    email: str


@router.post("/resend-verification-email")
async def resend_verification_public(
    data: _ResendVerificationPublic,
    request: Request,
    _: None = Depends(RateLimiter(max_requests=3, window_seconds=300)),
):
    """Renvoyer l'email de vérification (sans auth — par email).

    Rate-limité à 3 req/5min par IP pour éviter le spam.
    Ne révèle pas si l'email existe ou pas (sécurité).
    """
    teacher = get_teacher_by_email(data.email.strip().lower())
    if not teacher or teacher["is_verified"]:
        # Retourner un message neutre — ne pas révéler si l'email existe
        return {
            "message": "Si cet email est associé à un compte non vérifié, "
                       "un email de vérification a été envoyé.",
        }

    # Générer un nouveau token
    verify_token = create_access_token(
        data={"sub": str(teacher["id"]), "type": "email_verify"},
        expires_delta=timedelta(hours=24),
    )

    # Envoyer l'email
    await email_service.send_verification_email(teacher["email"], verify_token)
    logger.info("Renvoi email de vérification pour %s", teacher["email"])

    return {
        "message": "Si cet email est associé à un compte non vérifié, "
                   "un email de vérification a été envoyé.",
        "verify_token": verify_token if settings.DEBUG else None,
    }
