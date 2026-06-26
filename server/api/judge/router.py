"""Routeur pour l'exécution de code (éditeur de code des examens de programmation).

Sécurité :
  - Active uniquement si settings.ENABLE_CODE_EXECUTION = True (dev local)
  - Vérifie la session active + épreuve non soumise
  - Exécution isolée : subprocess avec timeout, mémoire limitée,
    environnement minimal (pas de credentials), temp dir restrictif
  - Toutes les exécutions sont tracées dans la table code_executions
  - En production (Vercel), désactivé par défaut — pas de Docker sandbox
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from core.config import get_settings
from core.db import (
    create_code_execution,
    get_session_by_code,
    get_session_exams,
)
from core.dependencies import verify_student_session
from schemas.judge import (
    CodeRunRequest,
    CodeRunResponse,
    CodeSubmitRequest,
    CodeSubmitResponse,
    LanguageInfo,
)
from services.code_executor import CodeExecutor, LANGUAGE_CONFIG
from services.piston_executor import PistonExecutor, should_use_remote

logger = logging.getLogger(__name__)

router = APIRouter()
settings = get_settings()


def _require_code_execution():
    """Lève 503 si l'exécution de code est désactivée."""
    if not settings.ENABLE_CODE_EXECUTION:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "L'exécution de code est désactivée sur cet environnement "
                "(production). Pour tester localement, définissez "
                "ENABLE_CODE_EXECUTION=True dans votre .env."
            ),
        )


def _get_session_from_code(session_code: str) -> dict:
    """Résout un code de session en objet session (ou 404)."""
    session = get_session_by_code(session_code.upper())
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session introuvable",
        )
    return session


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

    L'étudiant peut tester son code pendant l'examen. Le résultat
    (stdout/stderr/exit_code/time) est tracé dans code_executions
    pour audit.
    """
    _require_code_execution()

    # Vérifier que l'étudiant a une session active
    exam = verify_student_session(data.session_code, data.student_number)
    session = _get_session_from_code(data.session_code)

    # Choisir l'exécuteur selon le langage
    if should_use_remote(data.language):
        executor = PistonExecutor(timeout=settings.PISTON_TIMEOUT)
    else:
        executor = CodeExecutor(max_time=settings.CODE_EXECUTION_MAX_TIME)

    result = executor.execute(
        code=data.code,
        language=data.language,
        stdin=data.stdin or "",
    )

    # Tracer l'exécution
    try:
        create_code_execution({
            "session_id": session["id"],
            "code": data.code,
            "language": data.language,
            "stdin": data.stdin or None,
            "stdout": result.get("stdout", ""),
            "stderr": result.get("stderr", ""),
            "exit_code": result.get("exit_code", -1),
            "time_seconds": result.get("time_seconds", 0.0),
            "test_results": None,
        })
    except Exception as e:
        logger.warning("Impossible de tracer l'exécution : %s", e)

    return CodeRunResponse(
        stdout=result.get("stdout", ""),
        stderr=result.get("stderr", ""),
        exit_code=result.get("exit_code", -1),
        time_seconds=result.get("time_seconds", 0.0),
        error=result.get("error"),
    )


@router.post("/submit", response_model=CodeSubmitResponse)
async def submit_code(data: CodeSubmitRequest):
    """Soumet du code avec des cas de test pour vérification.

    Compile une fois (langages compilés), exécute chaque cas de test
    sans recompilation. Le résultat complet est tracé dans
    code_executions pour audit et historique.
    """
    _require_code_execution()

    # Vérifier que l'étudiant a une session active
    exam = verify_student_session(data.session_code, data.student_number)
    session = _get_session_from_code(data.session_code)

    test_cases = [
        {"input": tc.input, "expected_output": tc.expected_output,
         "description": tc.description or f"Test #{i + 1}"}
        for i, tc in enumerate(data.test_cases)
    ]

    # Choisir l'exécuteur selon le langage
    if should_use_remote(data.language):
        executor = PistonExecutor(timeout=settings.PISTON_TIMEOUT)
    else:
        executor = CodeExecutor(max_time=settings.CODE_EXECUTION_MAX_TIME)

    result = executor.execute_with_test_cases(
        code=data.code,
        language=data.language,
        test_cases=test_cases,
    )

    # Tracer l'exécution
    try:
        create_code_execution({
            "session_id": session["id"],
            "code": data.code,
            "language": data.language,
            "stdin": None,
            "stdout": json.dumps(result.get("results", []), ensure_ascii=False),
            "stderr": "",
            "exit_code": 0,
            "time_seconds": result.get("execution_time", 0.0),
            "test_results": json.dumps({
                "passed": result.get("passed", 0),
                "total": result.get("total", 0),
            }, ensure_ascii=False),
        })
    except Exception as e:
        logger.warning("Impossible de tracer la soumission : %s", e)

    # Convertir les résultats au format Pydantic
    from schemas.judge import TestResult
    results_pydantic = []
    for r in result.get("results", []):
        results_pydantic.append(TestResult(
            description=r.get("description"),
            passed=r.get("passed", False),
            input=r.get("input", ""),
            expected_output=r.get("expected_output", ""),
            actual_output=r.get("actual_output", ""),
            error=r.get("error"),
        ))

    return CodeSubmitResponse(
        passed=result.get("passed", 0),
        total=result.get("total", 0),
        results=results_pydantic,
        execution_time=result.get("execution_time", 0.0),
    )
