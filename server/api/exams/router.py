"""Routeur pour la gestion des examens et exercices."""

import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status

from core.config import get_settings
from core.dependencies import get_current_teacher
from core.db import (
    get_session_by_id,
    get_session_exams,
    create_generated_exam,
    update_generated_exam,
    get_exercise_by_id,
    get_variants_by_exercise,
    get_teacher_exercises,
    create_exercise,
    update_exercise,
    delete_exercise,
    create_variant,
)
from schemas.exercises import ExerciseCreate, ExerciseResponse, VariantCreate, VariantResponse
from services.storage import StorageService

router = APIRouter()
storage_service = StorageService()
settings = get_settings()


@router.get("/exercises")
def list_exercises(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les exercices de l'enseignant (pagine)."""
    all_exercises = get_teacher_exercises(teacher["id"])
    total = len(all_exercises)
    all_exercises.sort(key=lambda x: x["id"], reverse=True)
    exercises = all_exercises[skip : skip + limit]

    return {
        "items": [ExerciseResponse.model_validate(ex) for ex in exercises],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/exercises", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
def create_exercise_endpoint(
    data: ExerciseCreate,
    teacher: dict = Depends(get_current_teacher),
):
    """Creer un nouvel exercice."""
    exercise_data = data.model_dump()
    exercise_data["teacher_id"] = teacher["id"]
    exercise = create_exercise(exercise_data)
    if not exercise:
        raise HTTPException(
            status_code=500, detail="Erreur lors de la creation de l'exercice"
        )
    return ExerciseResponse.model_validate(exercise)


@router.get("/exercises/{exercise_id}", response_model=ExerciseResponse)
def get_exercise(
    exercise_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Recuperer un exercice avec ses variantes."""
    exercise = get_exercise_by_id(exercise_id)
    if not exercise or exercise["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Exercice non trouve")
    return ExerciseResponse.model_validate(exercise)


@router.put("/exercises/{exercise_id}", response_model=ExerciseResponse)
def update_exercise_endpoint(
    exercise_id: int,
    data: ExerciseCreate,
    teacher: dict = Depends(get_current_teacher),
):
    """Mettre a jour un exercice."""
    exercise = get_exercise_by_id(exercise_id)
    if not exercise or exercise["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Exercice non trouve")

    update_data = data.model_dump(exclude_unset=True)
    exercise = update_exercise(exercise_id, update_data)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercice non trouve")
    return ExerciseResponse.model_validate(exercise)


@router.delete("/exercises/{exercise_id}", status_code=204)
def delete_exercise_endpoint(
    exercise_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer un exercice et ses variantes."""
    exercise = get_exercise_by_id(exercise_id)
    if not exercise or exercise["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Exercice non trouve")

    delete_exercise(exercise_id)
    return None


@router.get("/exercises/{exercise_id}/variants", response_model=list[VariantResponse])
def list_variants(
    exercise_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les variantes d'un exercice."""
    exercise = get_exercise_by_id(exercise_id)
    if not exercise or exercise["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Exercice non trouve")

    variants = get_variants_by_exercise(exercise_id)
    return [VariantResponse.model_validate(v) for v in variants]


@router.post("/exercises/{exercise_id}/variants", response_model=VariantResponse, status_code=201)
def create_variant_endpoint(
    exercise_id: int,
    data: VariantCreate,
    teacher: dict = Depends(get_current_teacher),
):
    """Ajouter une variante a un exercice."""
    exercise = get_exercise_by_id(exercise_id)
    if not exercise or exercise["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Exercice non trouve")

    variant_data = data.model_dump()
    variant_data["exercise_id"] = exercise_id
    variant = create_variant(variant_data)
    if not variant:
        raise HTTPException(
            status_code=500, detail="Erreur lors de la creation de la variante"
        )
    return VariantResponse.model_validate(variant)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    teacher: dict = Depends(get_current_teacher),
):
    """Uploader un fichier d'epreuve vers Supabase Storage.

    Les fichiers sont stockes dans le bucket 'examens' et accessibles
    via une URL signee valable 24h.
    """
    allowed = settings.ALLOWED_EXTENSIONS
    ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Extension non autorisee. Autorisees : {', '.join(allowed)}",
        )

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    data = await file.read()
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"Fichier trop volumineux. Maximum : {settings.MAX_UPLOAD_SIZE_MB} MB",
        )

    try:
        file_stream = io.BytesIO(data)
        signed_url = storage_service.upload_exam_file(
            exam_id=0,
            filename=file.filename,
            file_data=file_stream,
            content_type=file.content_type or "application/octet-stream",
        )

        return {
            "filename": file.filename,
            "size": len(data),
            "url": signed_url,
            "message": "Fichier uploade avec succes vers Supabase Storage",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'upload : {str(e)}",
        )
