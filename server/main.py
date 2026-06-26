"""Point d'entrée principal de l'API PEAN."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from core.config import get_settings
from core.logging_config import setup_logging, RequestIDMiddleware
from services.session_watchdog import watchdog_loop

logger = logging.getLogger("pean.main")
settings = get_settings()

# Tâche background du watchdog
_watchdog_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Gestion du cycle de vie de l'application."""
    global _watchdog_task
    _watchdog_task = asyncio.create_task(watchdog_loop())
    logger.info("Watchdog de session démarré")
    yield
    if _watchdog_task is not None:
        _watchdog_task.cancel()
        try:
            await _watchdog_task
        except asyncio.CancelledError:
            pass
        logger.info("Watchdog de session arrêté")


# Configurer le logging avant tout
setup_logging()

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# Middleware Request ID (avant CORS pour tracer toutes les requêtes)
app.add_middleware(RequestIDMiddleware)

# Middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=10,
)


# Exception handler global — garantit les headers CORS même sur les 500
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Capture toutes les exceptions non gérées et renvoie un JSON avec CORS."""
    logger.exception(f"Exception non gérée sur {request.method} {request.url.path}: {exc}")
    origin = request.headers.get("origin", "")
    response = JSONResponse(
        status_code=500,
        content={"detail": "Erreur interne du serveur. Veuillez réessayer."},
    )
    if origin in settings.CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
    elif "*" in settings.CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif settings.CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = settings.CORS_ORIGINS[0]
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """Handler spécifique pour les 500."""
    return await global_exception_handler(request, exc)


@app.get("/")
async def root():
    """Redirige vers la documentation interactive."""
    return RedirectResponse(url="/api/docs")


@app.get("/api/health")
async def health_check():
    """Vérification de l'état de l'API."""
    return {"status": "ok", "version": settings.APP_VERSION, "app": settings.APP_NAME}


@app.get("/api/debug/dependencies")
async def debug_dependencies():
    """Diagnostic des dépendances et configurations."""
    import importlib
    results = {"status": "ok", "checks": []}

    # 1. Vérifier les variables d'environnement
    env_checks = {
        "GROQ_API_KEY": bool(os.environ.get("GROQ_API_KEY", "")),
        "SUPABASE_URL": bool(os.environ.get("SUPABASE_URL", "")),
        "SUPABASE_SERVICE_KEY": bool(os.environ.get("SUPABASE_SERVICE_KEY", "")),
        "SUPABASE_ANON_KEY": bool(os.environ.get("SUPABASE_ANON_KEY", "")),
        "JWT_SECRET_KEY": bool(os.environ.get("JWT_SECRET_KEY", "")),
        "FRONTEND_URL": bool(os.environ.get("FRONTEND_URL", "")),
    }
    results["checks"].append({"name": "environment_variables", "ok": all(env_checks.values()), "details": env_checks})

    # 2. Vérifier les imports critiques
    required_modules = [
        "fitz",  # PyMuPDF
        "docx",  # python-docx
        "httpx",
        "supabase",
        "jose",
        "bcrypt",
    ]
    import_checks = {}
    for mod_name in required_modules:
        try:
            importlib.import_module(mod_name)
            import_checks[mod_name] = True
        except ImportError:
            import_checks[mod_name] = False
    results["checks"].append({"name": "imports", "ok": all(import_checks.values()), "details": import_checks})

    # 3. Tester Supabase
    try:
        from core.supabase_client import get_supabase
        sb = get_supabase()
        r = sb.table("exam_sessions").select("id").limit(1).execute()
        supabase_ok = True
        supabase_detail = f"ok (query returned {len(r.data) if r.data else 0} rows)"
    except Exception as e:
        supabase_ok = False
        supabase_detail = f"error: {e}"
    results["checks"].append({"name": "supabase_connection", "ok": supabase_ok, "detail": supabase_detail})

    # 4. Tester Groq (sans consommer de tokens — juste la validation de clé)
    groq_key = os.environ.get("GROQ_API_KEY", "")
    if groq_key:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {groq_key}"},
                )
                groq_ok = resp.status_code == 200
                if resp.status_code == 200:
                    models = resp.json().get("data", [])
                    groq_detail = f"HTTP 200: {len(models)} models available"
                else:
                    err = resp.json().get("error", {}).get("message", "unknown")
                    groq_detail = f"HTTP {resp.status_code}: {err}"
        except Exception as e:
            groq_ok = False
            groq_detail = f"connection error: {e}"
    else:
        groq_ok = False
        groq_detail = "GROQ_API_KEY not set"
    results["checks"].append({"name": "groq_api", "ok": groq_ok, "detail": groq_detail})

    results["overall_ok"] = all(c["ok"] for c in results["checks"])
    return results


@app.get("/api/debug/test-groq")
async def debug_test_groq():
    """Test Groq generation with short content to see raw response."""
    from services.qcm_generator import QCMGenerator
    gen = QCMGenerator()
    result = await gen.generate(
        content="La photosynthèse est le processus par lequel les plantes vertes utilisent la lumière du soleil pour convertir le dioxyde de carbone et l'eau en glucose et en oxygène.",
        num_questions=2,
        exercise_type="qcm",
        total_score=20,
    )
    return result


@app.get("/api/debug/test-upload-flow")
async def debug_test_upload_flow():
    """Test the full upload-exam flow (without DB writes) to isolate the crash."""
    import traceback
    from services.qcm_generator import QCMGenerator

    content = "La photosynthese est le processus par lequel les plantes vertes utilisent la lumiere du soleil pour convertir le dioxyde de carbone et l'eau en glucose et en oxygene."

    results = {}

    # Step 1: QCM generation
    try:
        gen = QCMGenerator()
        result = await gen.generate(content, num_questions=2, exercise_type="qcm", total_score=20)
        results["step1_generate"] = "ok" if "questions" in result else f"error: {result.get('error')}"
        if "questions" in result:
            results["questions_count"] = len(result["questions"])
    except Exception as e:
        results["step1_generate"] = f"CRASH: {type(e).__name__}: {e}"
        results["step1_traceback"] = traceback.format_exc()

    # Step 2: Validate
    if "questions" in result:
        try:
            gen = QCMGenerator()
            warnings = gen.validate_questions(result["questions"])
            results["step2_validate"] = f"ok ({len(warnings)} warnings)"
            results["warnings"] = warnings
        except Exception as e:
            results["step2_validate"] = f"CRASH: {type(e).__name__}: {e}"
            results["step2_traceback"] = traceback.format_exc()

    return results


# Import et enregistrement des routes
from api.auth.router import router as auth_router
from api.teachers.router import router as teacher_router
from api.sessions.router import router as sessions_router
from api.exams.router import router as exams_router
from api.students.router import router as student_router
from api.grading.router import router as grading_router
from api.admin.router import router as admin_router
from api.judge.router import router as judge_router
from api.export.router import router as export_router
from api.references.router import router as references_router
from api.documents.router import router as documents_router
from api.student_lists.router import router as student_lists_router
from api.annotations.router import router as annotations_router
from api.access_codes import router as access_codes_router
from api.students_manager import router as students_manager_router
from api.ws import router as ws_router

app.include_router(auth_router, prefix="/api/auth", tags=["Authentification"])
app.include_router(teacher_router, prefix="/api/teacher", tags=["Enseignant"])
app.include_router(sessions_router, prefix="/api/teacher/sessions", tags=["Sessions"])
app.include_router(exams_router, prefix="/api/exams", tags=["Examens"])
app.include_router(student_router, prefix="/api", tags=["Étudiant"])
app.include_router(grading_router, prefix="/api/grading", tags=["Correction"])
app.include_router(admin_router, prefix="/api/admin", tags=["Administration"])
app.include_router(judge_router, prefix="/api/judge", tags=["Éditeur de code"])
app.include_router(export_router, prefix="/api/export", tags=["Export"])
app.include_router(references_router, prefix="/api/references", tags=["Références"])
app.include_router(documents_router, prefix="/api/teacher", tags=["Dossiers pédagogiques"])
app.include_router(student_lists_router, prefix="/api/teacher", tags=["Listes étudiants"])
app.include_router(annotations_router, prefix="/api", tags=["Annotations"])
app.include_router(access_codes_router, prefix="/api", tags=["Codes d'accès"])
app.include_router(students_manager_router, prefix="/api", tags=["Dossiers pédagogiques"])
app.include_router(ws_router, prefix="/ws", tags=["WebSocket"])
