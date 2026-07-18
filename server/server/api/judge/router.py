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
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status

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

# Rate limiter simple (in-memory) — protège contre les abus par adresse IP
# Compteur de requêtes par IP sur une fenêtre glissante de 60s
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_MAX = 30          # max requêtes par fenêtre
RATE_LIMIT_WINDOW = 60       # fenêtre en secondes


def _check_rate_limit(request: Request) -> None:
    """Vérifie le rate limiting par IP.

    Note: en production Vercel (serverless), chaque fonction est indépendante.
    Ce rate limiter est best-effort et ne protège que les déploiements
    avec état partagé (uvicorn multi-workers, Docker). Pour Vercel,
    utiliser le Vercel Firewall pour la limitation en périphérie.
    """
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    timestamps = _rate_limit_store[client_ip]
    # Nettoyer les entrées hors fenêtre
    _rate_limit_store[client_ip] = [t for t in timestamps if t > window_start]
    if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX:
        logger.warning("Rate limit atteint pour IP %s", client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de requêtes. Réessaie dans quelques instants.",
        )
    _rate_limit_store[client_ip].append(now)


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
    """Résout un code de session en objet session (ou 404, ou 503)."""
    _require_code_execution()
    session = get_session_by_code(session_code.upper())
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session introuvable",
        )
    return session


def _get_session_id(exam: dict, session_code: str) -> int:
    """Extrait l'ID de session de l'épreuve, avec fallback DB.

    verify_student_session() valide la session + étudiant en un appel.
    L'épreuve retournée contient session_id, évitant un second appel
    get_session_by_code() qui était auparavant doublonné.
    """
    sid = exam.get("session_id")
    if sid is not None:
        return sid
    # Fallback si le champ session_id n'est pas dans l'épreuve
    session = _get_session_from_code(session_code)
    return session["id"]


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
async def run_code(data: CodeRunRequest, request: Request):
    """Exécute du code (test rapide, sans sauvegarde).

    L'étudiant peut tester son code pendant l'examen. Le résultat
    (stdout/stderr/exit_code/time) est tracé dans code_executions
    pour audit.
    """
    _require_code_execution()
    _check_rate_limit(request)

    # Vérifier que l'étudiant a une session active
    exam = verify_student_session(data.session_code, data.student_number)
    session_id = _get_session_id(exam, data.session_code)

    # Choisir l'exécuteur selon le langage
    if should_use_remote(data.language):
        executor = PistonExecutor(timeout=settings.PISTON_TIMEOUT)
    else:
        executor = CodeExecutor(max_time=settings.CODE_EXECUTION_MAX_TIME)

    # Exécution asynchrone pour Piston, synchrone pour local
    if should_use_remote(data.language):
        result = await executor.execute(
            code=data.code,
            language=data.language,
            stdin=data.stdin or "",
        )
    else:
        result = executor.execute(
            code=data.code,
            language=data.language,
            stdin=data.stdin or "",
        )

    # Tracer l'exécution
    try:
        create_code_execution({
            "session_id": session_id,
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
async def submit_code(data: CodeSubmitRequest, request: Request):
    """Soumet du code avec des cas de test pour vérification.

    Compile une fois (langages compilés), exécute chaque cas de test
    sans recompilation. Le résultat complet est tracé dans
    code_executions pour audit et historique.
    """
    _require_code_execution()
    _check_rate_limit(request)

    # Vérifier que l'étudiant a une session active
    exam = verify_student_session(data.session_code, data.student_number)
    session_id = _get_session_id(exam, data.session_code)

    test_cases = [
        {"input": tc.input, "expected_output": tc.expected_output,
         "description": tc.description or f"Test #{i + 1}"}
        for i, tc in enumerate(data.test_cases)
    ]

    # Choisir l'exécuteur selon le langage
    if should_use_remote(data.language):
        executor = PistonExecutor(timeout=settings.PISTON_TIMEOUT)
        result = await executor.execute_with_test_cases(
            code=data.code,
            language=data.language,
            test_cases=test_cases,
        )
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
            "session_id": session_id,
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
        error=result.get("error"),
    )
