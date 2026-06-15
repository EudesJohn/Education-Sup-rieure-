"""Routeur pour l'exécution de code (éditeur de code des examens de programmation).

⚠️ ATTENTION — SÉCURITÉ : L'exécution de code arbitraire sur le serveur
est DANGEREUSE. Les endpoints /run et /submit sont désactivés tant qu'un
environnement isolé (Judge0 / Docker-in-Docker) n'est pas en place.

Voir : server/services/code_executor.py (lignes 1-5)
      SECURITY_REPORT.md — FINDING CR-01, CR-02, CR-03
"""

from fastapi import APIRouter, HTTPException, status

from core.dependencies import verify_student_session
from schemas.judge import (
    CodeRunRequest,
    CodeRunResponse,
    CodeSubmitRequest,
    CodeSubmitResponse,
    LanguageInfo,
)
from services.code_executor import CodeExecutor, LANGUAGE_CONFIG

router = APIRouter()
executor = CodeExecutor()


@router.get("/languages", response_model=list[LanguageInfo])
def list_languages():
    """Liste les langages de programmation disponibles pour les exercices."""
    return [
        LanguageInfo(
            id=lang_id,
            name=config.get("name", lang_id.title()),
            extension=config.get("extension", ".txt"),
        )
        for lang_id, config in LANGUAGE_CONFIG.items()
    ]


@router.post("/run", response_model=CodeRunResponse)
async def run_code(data: CodeRunRequest):
    """Exécute du code (test rapide, sans sauvegarde).

    ⛔ DÉSACTIVÉ POUR SÉCURITÉ — L'exécution de code arbitraire
    sur le serveur hôte n'est pas isolée (subprocess.run).
    """
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "L'exécution de code est temporairement désactivée pour des raisons "
            "de sécurité. Veuillez utiliser un environnement local (IDE) pour "
            "tester votre code. Cette fonctionnalité sera rétablie avec un "
            "environnement isolé (Judge0)."
        ),
    )


@router.post("/submit", response_model=CodeSubmitResponse)
async def submit_code(data: CodeSubmitRequest):
    """Soumet du code avec des cas de test pour vérification.

    ⛔ DÉSACTIVÉ POUR SÉCURITÉ — Même raison que /run.
    """
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=(
            "L'exécution de code est temporairement désactivée pour des raisons "
            "de sécurité. Veuillez utiliser un environnement local (IDE) pour "
            "tester votre code. Cette fonctionnalité sera rétablie avec un "
            "environnement isolé (Judge0)."
        ),
    )
