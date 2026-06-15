"""Configuration de l'application PEAN — Supabase + Groq."""

from pydantic_settings import BaseSettings
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

    # 2FA
    TWOFA_ISSUER: str = "PEAN"

    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:5173",  # Vite dev
        "http://localhost:3000",  # React alternative
        "http://localhost:5174",
        "https://education-sup-rieure-r1h3.vercel.app",  # Frontend Vercel
    ]
    CORS_ORIGINS_EXTRA: str = ""  # URLs additionnelles séparées par virgule

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

    return settings
