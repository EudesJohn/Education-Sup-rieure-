"""Routeur pour l'exécution de code (éditeur de code des examens de programmation).

Architecture :
  - Python, JavaScript → exécution locale (CodeExecutor, subprocess)
  - C, C++, Java, Go, Rust, TypeScript → Piston API (distant, 50+ langages)

Sécurité :
  - Active uniquement si settings.ENABLE_CODE_EXECUTION = True
  - Vérifie la session active + épreuve non soumise
  - Exécution locale : subprocess avec timeout, mémoire limitée,
    environnement minimal (pas de credentials), temp dir restrictif
  - Exécution distante : via API Piston gratuite (emkc.org)
  - Toutes les exécutions sont tracées dans la table code_executions
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
    TestResult,
)
from services.code_executor import CodeExecutor, LANGUAGE_CONFIG as LOCAL_LANG_CONFIG
from services.piston_executor import PistonExecutor, should_use_remote, LANGUAGE_MAP as REMOTE_LANG_MAP

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


# Extension par défaut par langage
_LANG_EXTENSIONS: dict[str, str] = {
    "python": ".py", "javascript": ".js", "typescript": ".ts",
    "java": ".java", "cpp": ".cpp", "c": ".c",
    "go": ".go", "rust": ".rs", "php": ".php",
    "ruby": ".rb", "r": ".r", "bash": ".sh", "sqlite": ".sql",
}


@router.get("/languages", response_model=list[LanguageInfo])
def list_languages():
    """Liste les langages de programmation disponibles pour les exercices.

    Inclut les langages gérés localement (Python, JavaScript) et ceux
    passant par Piston API (C, C++, Java, Go, Rust, etc.).
    """
    seen: set[str] = set()
    result: list[LanguageInfo] = []

    # 1) Langages du exécuteur local
    for lang_id, config in LOCAL_LANG_CONFIG.items():
        if lang_id in seen:
            continue
        seen.add(lang_id)
        result.append(LanguageInfo(
            id=lang_id,
            name=config.get("name", lang_id.title()),
            extension=config.get("extension", _LANG_EXTENSIONS.get(lang_id, ".txt")),
        ))

    # 2) Langages Piston-only (non couverts par le local)
    for lang_id in REMOTE_LANG_MAP:
        if lang_id in seen:
            continue
        seen.add(lang_id)
        result.append(LanguageInfo(
            id=lang_id,
            name=lang_id.title(),
            extension=_LANG_EXTENSIONS.get(lang_id, ".txt"),
        ))

    return result


@router.post("/run", response_model=CodeRunResponse)
async def run_code(data: CodeRunRequest):
    """Exécute du code (test rapide, sans sauvegarde).

    L'étudiant peut tester son code pendant l'examen. Le résultat
    (stdout/stderr/exit_code/time) est tracé dans code_executions
    pour audit.
    """
    _require_code_execution()

    # Vérifier que l'étudiant a une session active
    verify_student_session(data.session_code, data.student_number)
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
    verify_student_session(data.session_code, data.student_number)
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
