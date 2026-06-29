"""Configuration de l'application PEAN — Supabase + Groq."""

import json
from typing import Any

from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "PEAN - Plateforme d'Évaluation Académique Numérique"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Supabase (UNIQUE base de données + storage)
    SUPABASE_URL: str = ""  # https://xxx.supabase.co
    SUPABASE_ANON_KEY: str = ""  # Clé anon public
    SUPABASE_SERVICE_KEY: str = ""  # Service role key (pour le backend)

    # JWT — PAS DE VALEUR PAR DÉFAUT EN PRODUCTION !
    JWT_SECRET_KEY: str = ""  # DOIT être définie via .env
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60
    JWT_REFRESH_EXPIRATION_DAYS: int = 7

    # Sécurité
    PASSWORD_MIN_LENGTH: int = 8
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    # Uploads
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: list = ["pdf", "docx", "png", "jpg", "jpeg"]

    # IA Correction — Groq UNIQUEMENT
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_MAX_TOKENS: int = 4096
    GROQ_TEMPERATURE: float = 0.3

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/pean.log"
    LOG_FORMAT: str = "json"  # json ou text

    # Email (SMTP)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    FROM_EMAIL: str = "noreply@pean.education"
    FRONTEND_URL: str = "http://localhost:5173"

    # Code Execution Sandbox
    ENABLE_CODE_EXECUTION: bool = False  # Sécurité : activer seulement en dev local
    CODE_EXECUTION_MAX_TIME: int = 30   # secondes max par exécution
    CODE_EXECUTION_MAX_MEMORY_MB: int = 256

    # Remote Code Execution (Piston API — pour C, C++, Java sur Vercel)
    PISTON_API_URL: str = "https://emkc.org/api/v2/piston"
    PISTON_ENABLED: bool = True
    PISTON_TIMEOUT: int = 30  # secondes

    # 2FA
    TWOFA_ISSUER: str = "PEAN"

    # CORS — Supporte les formats JSON ["url1","url2"] OU csv url1,url2
    CORS_ORIGINS: list = [
        "http://localhost:5173",  # Vite dev
        "http://localhost:3000",  # React alternative
        "http://localhost:5174",
        "https://education-sup-rieure-r1h3.vercel.app",  # Frontend Vercel
    ]
    CORS_ORIGINS_EXTRA: str = ""  # URLs additionnelles séparées par virgule

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> list:
        """Accepter à la fois le format JSON et le format chaîne simple."""
        if isinstance(v, str):
            # Essayer de parser comme JSON d'abord
            v_stripped = v.strip()
            if v_stripped.startswith("["):
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        return parsed
                except json.JSONDecodeError:
                    pass
            # Fallback : séparer par virgule
            return [url.strip() for url in v_stripped.split(",") if url.strip()]
        if isinstance(v, list):
            return v
        return []

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()

    # Validation bloquante au démarrage
    if not settings.JWT_SECRET_KEY or settings.JWT_SECRET_KEY in (
        "changez-moi-en-production-svp",
        "dev-key-pean-2026-a-changer-en-prod",
        "dev-key-local-pean-2026",
        "local-dev-key-2026-for-testing-only",
        "your-secret-key-here",
    ):
        import sys
        print("=" * 60, file=sys.stderr)
        print("  ERREUR CRITIQUE : JWT_SECRET_KEY non définie ou encore", file=sys.stderr)
        print("  la valeur par défaut !", file=sys.stderr)
        print("  Générer une clé : openssl rand -hex 32", file=sys.stderr)
        print("  et définir JWT_SECRET_KEY dans .env", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        raise RuntimeError("JWT_SECRET_KEY n'est pas configurée correctement")

    # Validation Supabase
    if not settings.SUPABASE_URL:
        import sys
        print("=" * 60, file=sys.stderr)
        print("  ERREUR CRITIQUE : SUPABASE_URL non définie !", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        raise RuntimeError("SUPABASE_URL doit être configurée")

    if not settings.SUPABASE_SERVICE_KEY:
        import sys
        print("=" * 60, file=sys.stderr)
        print("  ERREUR CRITIQUE : SUPABASE_SERVICE_KEY non définie !", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        raise RuntimeError("SUPABASE_SERVICE_KEY doit être configurée")

    # Fusionner les CORS supplémentaires depuis la variable d'env
    extra = settings.CORS_ORIGINS_EXTRA
    if extra:
        settings.CORS_ORIGINS.extend(
            [url.strip() for url in extra.split(",") if url.strip()]
        )

    # Ajouter FRONTEND_URL s'il n'est pas déjà dans la liste
    frontend = settings.FRONTEND_URL
    if frontend and frontend not in settings.CORS_ORIGINS:
        settings.CORS_ORIGINS.append(frontend)

    # Supprimer les doublons éventuels
    seen = set()
    deduped = []
    for url in settings.CORS_ORIGINS:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    settings.CORS_ORIGINS = deduped

    return settings
