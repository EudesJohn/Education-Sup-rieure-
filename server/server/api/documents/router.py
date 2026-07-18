"""Routeur pour la gestion des dossiers pédagogiques.

CDC v2.2 — RF-06 : Gestion IA des Dossiers Pédagogiques

Fonctionnalités :
1. Upload + classification IA d'un document
2. CRUD des documents
3. Recherche intelligente (full-text + sémantique)
4. Suggestions pédagogiques pour une session
5. Rapport de session généré par IA
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request, status

from core.db import (
    create_pedagogical_document,
    get_pedagogical_document,
    list_pedagogical_documents,
    update_pedagogical_document,
    delete_pedagogical_document,
    search_pedagogical_documents,
    count_pedagogical_documents,
    get_session_by_id,
    create_audit_log,
)
from core.dependencies import get_current_teacher
from services.document_ai import DocumentAIService, document_ai_service
from services.storage import StorageService
from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Dossiers pédagogiques"])
storage_service = StorageService()


# ============================================================
# UPLOAD + CLASSIFICATION IA
# ============================================================

@router.post("/documents/upload", status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    teacher: dict = Depends(get_current_teacher),
):
    """Uploader un document pédagogique → stockage + classification IA.

    Le fichier est stocké dans Supabase Storage (bucket 'documents').
    L'IA analyse le contenu pour classifier : matière, niveau, type, mots-clés.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    allowed = {"pdf", "docx", "doc", "txt", "md", "ppt", "pptx", "odt", "html"}
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté : '.{ext}'. Formats acceptés : {', '.join(sorted(allowed))}"
        )

    # Lire le fichier
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur de lecture : {str(e)}")

    if not content:
        raise HTTPException(status_code=400, detail="Fichier vide")

    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 50 Mo)")

    # Upload vers Supabase Storage
    doc_title = title or file.filename.rsplit('.', 1)[0]
    try:
        file_url = storage_service.upload_file(
            bucket="documents",
            object_name=f"{teacher['id']}/{file.filename}",
            data=content,
            content_type=file.content_type or "application/octet-stream",
        )
    except Exception as e:
        logger.exception("Erreur upload storage")
        raise HTTPException(status_code=500, detail=f"Erreur de stockage : {str(e)}")

    # Extraire un préfixe du contenu pour l'analyse IA
    try:
        content_preview = content.decode("utf-8", errors="replace")[:3000]
    except Exception:
        content_preview = f"[Fichier binaire : {ext}, {len(content)} octets]"

    # Classification IA
    classification = await document_ai_service.classify_document(
        title=doc_title,
        content_preview=content_preview,
        filename=file.filename,
    )

    ai_classification = {
        "subject": classification.subject,
        "academic_level": classification.academic_level,
        "document_type": classification.document_type,
        "keywords": classification.keywords,
        "summary": classification.summary,
        "confidence": classification.confidence,
    }

    # Créer l'entrée en base
    doc_record = create_pedagogical_document({
        "teacher_id": teacher["id"],
        "title": doc_title,
        "description": description or classification.summary or None,
        "subject": classification.subject if classification.subject != "Non classifié" else None,
        "academic_level": classification.academic_level if classification.academic_level != "Non spécifié" else None,
        "document_type": classification.document_type,
        "file_type": ext,
        "file_url": file_url,
        "file_size": len(content),
        "original_filename": file.filename,
        "ai_classification": json.dumps(ai_classification),
        "ai_classified_at": "now()",
        "status": "active",
    })

    if not doc_record:
        raise HTTPException(status_code=500, detail="Erreur lors de la création du document")

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "document_uploaded",
        "resource_type": "pedagogical_document",
        "resource_id": doc_record["id"],
        "details": json.dumps({
            "title": doc_title,
            "file_type": ext,
            "file_size": len(content),
            "classification": classification.document_type,
        }),
    })

    return {
        "id": doc_record["id"],
        "title": doc_record["title"],
        "subject": doc_record.get("subject"),
        "document_type": doc_record["document_type"],
        "academic_level": doc_record.get("academic_level"),
        "file_url": doc_record.get("file_url"),
        "file_type": doc_record["file_type"],
        "file_size": doc_record["file_size"],
        "original_filename": doc_record["original_filename"],
        "ai_classification": ai_classification,
        "message": f"Document '{doc_title}' importé et classifié avec succès",
    }


# ============================================================
# CRUD DOCUMENTS
# ============================================================

@router.get("/documents")
def list_documents(
    document_type: Optional[str] = Query(None, alias="type"),
    subject: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les documents pédagogiques de l'enseignant."""
    docs = list_pedagogical_documents(
        teacher_id=teacher["id"],
        document_type=document_type,
        subject=subject,
        limit=limit,
        offset=offset,
    )

    enriched = []
    for doc in docs:
        classification = doc.get("ai_classification")
        enriched.append({
            "id": doc["id"],
            "title": doc["title"],
            "description": doc.get("description"),
            "subject": doc.get("subject"),
            "academic_level": doc.get("academic_level"),
            "document_type": doc["document_type"],
            "file_type": doc.get("file_type"),
            "file_url": doc.get("file_url"),
            "file_size": doc.get("file_size"),
            "original_filename": doc.get("original_filename"),
            "tags": doc.get("tags"),
            "is_favorite": doc.get("is_favorite", False),
            "ai_classification": json.loads(classification) if classification and isinstance(classification, str) else classification,
            "download_count": doc.get("download_count", 0),
            "status": doc["status"],
            "created_at": doc["created_at"],
        })

    return enriched


@router.get("/documents/counts")
def get_document_counts(
    teacher: dict = Depends(get_current_teacher),
):
    """Compter les documents par type."""
    return count_pedagogical_documents(teacher["id"])


@router.get("/documents/{doc_id}")
def get_document_detail(
    doc_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Détail d'un document pédagogique."""
    doc = get_pedagogical_document(doc_id)
    if not doc or doc["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Document non trouvé")

    classification = doc.get("ai_classification")
    return {
        "id": doc["id"],
        "title": doc["title"],
        "description": doc.get("description"),
        "subject": doc.get("subject"),
        "academic_level": doc.get("academic_level"),
        "document_type": doc["document_type"],
        "file_type": doc.get("file_type"),
        "file_url": doc.get("file_url"),
        "file_size": doc.get("file_size"),
        "original_filename": doc.get("original_filename"),
        "tags": doc.get("tags"),
        "is_favorite": doc.get("is_favorite", False),
        "author": doc.get("author"),
        "year": doc.get("year"),
        "source_url": doc.get("source_url"),
        "ai_classification": json.loads(classification) if classification and isinstance(classification, str) else classification,
        "download_count": doc.get("download_count", 0),
        "reference_count": doc.get("reference_count", 0),
        "status": doc["status"],
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
    }


@router.put("/documents/{doc_id}")
def update_document(
    doc_id: int,
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Modifier les métadonnées d'un document."""
    doc = get_pedagogical_document(doc_id)
    if not doc or doc["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Document non trouvé")

    allowed_fields = {
        "title", "description", "subject", "academic_level",
        "document_type", "tags", "is_favorite", "author", "year", "source_url",
    }
    update_data = {k: v for k, v in data.items() if k in allowed_fields and v is not None}

    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ valide à mettre à jour")

    updated = update_pedagogical_document(doc_id, update_data)
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour")

    return {"id": updated["id"], **update_data, "message": "Document mis à jour"}


@router.delete("/documents/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer un document."""
    doc = get_pedagogical_document(doc_id)
    if not doc or doc["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Document non trouvé")

    # Supprimer aussi le fichier du storage
    if doc.get("file_url"):
        try:
            # Extraire le path depuis l'URL
            path = "/".join(doc["file_url"].split("/")[-2:])
            storage_service.delete_file("documents", path)
        except Exception as e:
            logger.warning("Impossible de supprimer le fichier du storage : %s", e)

    delete_pedagogical_document(doc_id)

    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "document_deleted",
        "resource_type": "pedagogical_document",
        "resource_id": doc_id,
        "details": json.dumps({"title": doc["title"]}),
    })

    return None


# ============================================================
# RECHERCHE
# ============================================================

@router.post("/documents/search")
async def search_documents(
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Recherche intelligente dans les documents pédagogiques.

    Body : { "query": "intégrales doubles", "limit": 10 }
    Utilise la recherche full-text PostgreSQL + fallback IA.
    """
    query = data.get("query", "").strip()
    if not query or len(query) < 2:
        raise HTTPException(status_code=400, detail="Requête trop courte (min 2 caractères)")

    limit = min(data.get("limit", 10), 50)

    # Recherche full-text PostgreSQL
    results = search_pedagogical_documents(teacher["id"], query, limit=limit)

    return {
        "query": query,
        "total": len(results),
        "results": [
            {
                "id": r["id"],
                "title": r["title"],
                "subject": r.get("subject"),
                "document_type": r["document_type"],
                "file_type": r.get("file_type"),
                "snippet": (r.get("description") or "")[:250],
                "file_url": r.get("file_url"),
                "created_at": r["created_at"],
            }
            for r in results
        ],
    }


# ============================================================
# SUGGESTIONS PÉDAGOGIQUES
# ============================================================

@router.get("/sessions/{session_id}/suggestions")
async def get_session_suggestions(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Générer des suggestions pédagogiques pour une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    # Récupérer les exercices et documents liés
    supabase = get_supabase()
    exercises = supabase.table("exercises").select("*").eq("teacher_id", teacher["id"]).limit(20).execute()
    docs = list_pedagogical_documents(teacher["id"], limit=20)

    suggestions = await document_ai_service.generate_suggestions(
        session_title=session.get("title", ""),
        subject=session.get("subject", ""),
        student_count=session.get("student_count", 0),
        exercises=exercises.data or [],
        documents=docs,
    )

    return {
        "session_id": session_id,
        "suggestions": [
            {
                "category": s.category,
                "title": s.title,
                "description": s.description,
                "priority": s.priority,
                "reason": s.reason,
            }
            for s in suggestions
        ],
    }


# ============================================================
# RAPPORT DE SESSION
# ============================================================

@router.get("/sessions/{session_id}/ai-report")
async def generate_ai_report(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Générer un rapport de session avec analyse IA."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    supabase = get_supabase()

    # Récupérer les épreuves générées pour cette session
    exams_result = supabase.table("generated_exams").select("id, content") \
        .eq("session_id", session_id) \
        .limit(100) \
        .execute()
    generated_exams = exams_result.data or []
    exam_ids = [e["id"] for e in generated_exams]

    # Récupérer les soumissions via generated_exam_id (pas de session_id direct sur submissions)
    submissions = []
    corrections = []
    for exam_id in exam_ids:
        sub = supabase.table("submissions").select("*") \
            .eq("generated_exam_id", exam_id) \
            .maybe_single() \
            .execute()
        if sub and sub.data:
            submissions.append(sub.data)
            corr = supabase.table("corrections").select("*") \
                .eq("submission_id", sub.data["id"]) \
                .maybe_single() \
                .execute()
            if corr and corr.data:
                corrections.append(corr.data)

    exercises = [{"content": e.get("content")} for e in generated_exams]

    report = await document_ai_service.generate_session_report(
        session=session,
        submissions=submissions,
        corrections=corrections,
        exercises=exercises,
    )

    return {
        "session_id": session_id,
        "session_title": session.get("title"),
        "summary": report.summary,
        "highlights": report.highlights,
        "recommendations": report.recommendations,
        "statistics": report.statistics,
        "generated_at": "now()",
    }
