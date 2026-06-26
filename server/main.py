"""Point d'entrée principal de l'API PEAN."""

import asyncio
import logging
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
