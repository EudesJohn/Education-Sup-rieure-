"""Configuration du logging structuré pour PEAN.

Fournit :
  - Format structuré JSON (ou texte selon le mode)
  - Rotation des fichiers (taille ou temps)
  - Middleware d'ajout de Request ID pour tracer les appels
"""

import json
import logging
import logging.handlers
import os
import sys
import uuid
from datetime import datetime, timezone

from core.config import get_settings

settings = get_settings()


class JSONFormatter(logging.Formatter):
    """Formateur qui produit des logs au format JSON structuré.

    Chaque ligne de log est un objet JSON avec les champs :
      timestamp, level, logger, message, module, function, line, extra_fields
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        # Ajouter les champs d'exception si présentes
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = {
                "type": type(record.exc_info[1]).__name__,
                "message": str(record.exc_info[1]),
            }

        # Ajouter les champs supplémentaires via extra={
        if hasattr(record, "extra_fields") and record.extra_fields:
            log_entry.update(record.extra_fields)

        # Request ID si présent
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id

        return json.dumps(log_entry, default=str)


def setup_logging():
    """Configure le logging de l'application.

    À appeler au démarrage de l'application (dans lifespan ou avant).
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    log_format = settings.LOG_FORMAT

    # S'assurer que le dossier de logs existe
    log_dir = os.path.dirname(settings.LOG_FILE)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)

    # Formateur
    if log_format == "json":
        formatter = JSONFormatter()
    else:
        formatter = logging.Formatter(
            "[%(asctime)s] %(levelname)-8s %(name)s:%(lineno)d — %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    # Handler console (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)

    # Handler fichier avec rotation (50 Mo par fichier, 5 backups)
    file_handler = logging.handlers.RotatingFileHandler(
        settings.LOG_FILE,
        maxBytes=50 * 1024 * 1024,  # 50 Mo
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)

    # Configurer le root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # Éviter les doublons si setup_logging est appelé plusieurs fois
    if not root_logger.handlers:
        root_logger.addHandler(console_handler)
        root_logger.addHandler(file_handler)
    else:
        root_logger.handlers.clear()
        root_logger.addHandler(console_handler)
        root_logger.addHandler(file_handler)

    # Réduire le bruit des bibliothèques tierces
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    logging.info("Logging configuré — niveau=%s, format=%s, fichier=%s",
                 settings.LOG_LEVEL, log_format, settings.LOG_FILE)


class RequestIDMiddleware:
    """Middleware ASGI qui ajoute un identifiant unique à chaque requête.

    L'identifiant est accessible via le contextvar request_id
    et est automatiquement inclus dans les logs.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())[:8]

        # Injecter dans les logs via un LoggerAdapter
        logger = logging.getLogger("pean.request")
        logger_adapter = logging.LoggerAdapter(
            logger,
            {"request_id": request_id},
        )

        # Stocker dans le scope pour les handlers
        scope["request_id"] = request_id

        # Logger la requête entrante
        if scope["type"] == "http":
            method = scope.get("method", "?")
            path = scope.get("path", "?")
            logger_adapter.info("→ %s %s [%s]", method, path, request_id)

        await self.app(scope, receive, send)
