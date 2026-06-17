"""Routeur pour la gestion des sessions d'examen."""

import hashlib
import json
import random
import string

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.db import (
    get_session_by_id,
    create_session,
    update_session,
    delete_session,
    get_teacher_sessions,
    get_session_exams,
    get_variants_by_exercise,
    create_generated_exam,
)
from core.dependencies import get_current_teacher
from core.supabase_client import get_supabase
from schemas.sessions import (
    ExamSessionCreate,
    ExamSessionUpdate,
    ExamSessionResponse,
    ExamGenerateRequest,
)

router = APIRouter()


def _generate_access_code() -> str:
    """Génère un code d'accès aléatoire unique pour une session."""
    chars = string.ascii_uppercase + string.digits
    # 8 caractères → 36^8 = 2 821 109 907 456 combinaisons
    return "".join(random.choices(chars, k=8))


@router.get("")
def list_sessions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les sessions de l'enseignant (pagine)."""
    sessions = get_teacher_sessions(teacher["id"])
    total = len(sessions)
    paginated = sessions[skip : skip + limit]

    return {
        "items": [ExamSessionResponse.model_validate(s) for s in paginated],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("", response_model=ExamSessionResponse, status_code=201)
def create_session_route(
    data: ExamSessionCreate,
    teacher: dict = Depends(get_current_teacher),
):
    """Creer une nouvelle session d'examen."""
    session_data = data.model_dump()
    session_data["teacher_id"] = teacher["id"]

    # Generer un code d'acces unique
    supabase = get_supabase()
    for _attempt in range(10):
        code = _generate_access_code()
        existing = supabase.table("exam_sessions").select("id").eq("access_code", code).maybe_single().execute()
        if not existing or not existing.data:
            session_data["access_code"] = code
            break
    else:
        raise HTTPException(status_code=500, detail="Erreur lors de la génération du code d'accès")

    created = create_session(session_data)
    if not created:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de la session")
    return ExamSessionResponse.model_validate(created)


@router.post("/{session_id}/generate-exams", status_code=status.HTTP_201_CREATED)
def generate_exams(
    session_id: int,
    data: ExamGenerateRequest,
    teacher: dict = Depends(get_current_teacher),
):
    """Genere des epreuves uniques pour chaque etudiant a partir des exercices selectionnes.

    Pour chaque etudiant, le moteur tire aleatoirement une combinaison de variantes,
    garantissant que chaque epreuve est unique.
    """
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    if session["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail="Seules les sessions en brouillon peuvent recevoir de nouvelles épreuves",
        )

    # Recuperer les exercices avec leurs variantes
    supabase = get_supabase()
    exercises_result = (
        supabase.table("exercises")
        .select("*")
        .in_("id", data.exercise_ids)
        .eq("teacher_id", teacher["id"])
        .execute()
    )
    exercises = exercises_result.data

    if len(exercises) != len(data.exercise_ids):
        found_ids = {ex["id"] for ex in exercises}
        missing = set(data.exercise_ids) - found_ids
        raise HTTPException(
            status_code=404,
            detail=f"Exercices introuvables : {missing}",
        )

    # Verifier que tous les exercices ont des variantes et les charger
    for ex in exercises:
        variants = get_variants_by_exercise(ex["id"])
        if not variants:
            raise HTTPException(
                status_code=400,
                detail=f"L'exercice '{ex['title']}' (id={ex['id']}) n'a aucune variante. Ajoutez-en avant de générer.",
            )
        ex["_variants"] = variants

    # Preparer les identifiants etudiants
    if data.student_identifiers:
        student_ids = data.student_identifiers
        if len(student_ids) != session["student_count"]:
            raise HTTPException(
                status_code=400,
                detail=f"Nombre d'etudiants fourni ({len(student_ids)}) different du nombre declare ({session['student_count']})",
            )
    else:
        # Auto-generer des identifiants sequentiels
        student_ids = [
            {
                "student_name": f"Etudiant {i + 1}",
                "student_number": f"PEAN_{session['id']}_{i + 1:04d}",
            }
            for i in range(session["student_count"])
        ]

    # Generer les epreuves uniques
    used_combinations: set[str] = set()
    generated_exams = []

    for student_info in student_ids:
        # Tirer aleatoirement une combinaison unique de variantes
        assignment: dict[int, dict] = {}
        for _attempt in range(50):
            combo_parts = []
            temp_assignment: dict[int, dict] = {}
            for ex in exercises:
                variant = random.choice(ex["_variants"])
                temp_assignment[ex["id"]] = variant
                combo_parts.append(str(variant["id"]))
            combo_key = ":".join(sorted(combo_parts))
            if combo_key not in used_combinations:
                used_combinations.add(combo_key)
                assignment = temp_assignment
                break
        else:
            raise HTTPException(
                status_code=400,
                detail="Impossible de trouver une combinaison unique pour tous les etudiants. "
                "Le nombre de combinaisons est insuffisant.",
            )

        # Assembler le contenu JSON de l'epreuve
        content_parts = []
        for ex in exercises:
            variant = assignment[ex["id"]]
            content_parts.append({
                "exercise_id": ex["id"],
                "exercise_title": ex["title"],
                "difficulty": ex["difficulty"],
                "points": ex["points"],
                "instructions": ex["instructions"],
                "exercise_type": ex["exercise_type"],
                "language": ex["language"],
                "variant_id": variant["id"],
                "variant_order": variant["variant_order"],
                "content": variant["content"],
                "data_overrides": json.loads(variant.get("data_overrides") or "null"),
            })

        content_json = json.dumps(content_parts, ensure_ascii=False)

        # Hashes
        student_raw = f"{student_info['student_number']}:{session['id']}"
        student_hash = hashlib.sha256(student_raw.encode()).hexdigest()

        variant_ids = sorted(v["id"] for v in assignment.values())
        combo_raw = f"{session['id']}:{variant_ids}"
        variant_combo_hash = hashlib.sha256(combo_raw.encode()).hexdigest()
        sha256_raw = f"{session['id']}:{variant_ids}"
        sha256_hash = hashlib.sha256(sha256_raw.encode()).hexdigest()

        exam_data = {
            "session_id": session["id"],
            "student_id_hash": student_hash,
            "variant_combo_hash": variant_combo_hash,
            "sha256_hash": sha256_hash,
            "content": content_json,
            "status": "pending",
        }
        created_exam = create_generated_exam(exam_data)
        if created_exam:
            generated_exams.append(created_exam)

    # Calculer le nombre maximum de combinaisons
    max_combinations = 1
    for ex in exercises:
        max_combinations *= len(ex["_variants"])

    return {
        "generated": len(generated_exams),
        "message": f"{len(generated_exams)} epreuves uniques generees avec succes",
        "max_combinations": max_combinations,
        "exams": [
            {
                "id": e["id"],
                "sha256_hash": e["sha256_hash"],
                "status": e["status"],
            }
            for e in generated_exams
        ],
    }


@router.get("/{session_id}")
def get_session(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Recuperer une session avec les infos de generation d'epreuves."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    result = ExamSessionResponse.model_validate(session).model_dump()
    exams = get_session_exams(session["id"])
    result["exams_generated"] = len(exams)
    result["exams_pending"] = sum(1 for e in exams if e["status"] == "pending")
    result["exams_started"] = sum(1 for e in exams if e["status"] == "started")
    result["exams_submitted"] = sum(1 for e in exams if e["status"] == "submitted")
    return result


@router.put("/{session_id}", response_model=ExamSessionResponse)
def update_session_route(
    session_id: int,
    data: ExamSessionUpdate,
    teacher: dict = Depends(get_current_teacher),
):
    """Mettre a jour une session d'examen."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    if session["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail="Seules les sessions en brouillon peuvent être modifiées",
        )

    update_data = data.model_dump(exclude_unset=True)
    updated = update_session(session_id, update_data)
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour de la session")
    return ExamSessionResponse.model_validate(updated)


@router.delete("/{session_id}", status_code=204)
def delete_session_route(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer une session d'examen."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    if session["status"] == "active":
        raise HTTPException(
            status_code=400,
            detail="Impossible de supprimer une session active. Terminez-la d'abord.",
        )

    delete_session(session_id)
    return None


@router.post("/{session_id}/launch", response_model=ExamSessionResponse)
def launch_session(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lancer une session d'examen."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    if session["status"] != "draft":
        raise HTTPException(
            status_code=400,
            detail="La session n'est pas en mode brouillon",
        )

    updated = update_session(session_id, {"status": "active"})
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors du lancement de la session")
    return ExamSessionResponse.model_validate(updated)


@router.post("/{session_id}/complete", response_model=ExamSessionResponse)
def complete_session(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Terminer une session d'examen active."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    if session["status"] != "active":
        raise HTTPException(
            status_code=400,
            detail="Seules les sessions actives peuvent être terminées",
        )

    updated = update_session(session_id, {"status": "completed"})
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la terminaison de la session")
    return ExamSessionResponse.model_validate(updated)
