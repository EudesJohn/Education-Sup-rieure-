"""Routeur pour l'import et la gestion des listes d'étudiants.

CDC v2.2 — RF-02 : Import et Vérification de la Liste des Étudiants

Permet à l'enseignant de :
1. Uploader un fichier (CSV/XLSX/PDF) → parsing + preview
2. Valider et sauvegarder la liste
3. Gérer plusieurs listes (multi-groupes)
4. Associer une liste à une session
5. Vérifier la cohérence liste vs configuration session
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request, status

from core.db import (
    create_student_list,
    get_student_list,
    get_teacher_lists,
    update_student_list,
    delete_student_list,
    create_list_entries,
    get_list_entries,
    get_student_by_matricule,
    update_list_entry,
    delete_list_entry,
    count_list_entries,
    update_session,
    get_session_by_id,
    create_audit_log,
)
from core.dependencies import get_current_teacher
from core.supabase_client import cache
from schemas.student_lists import (
    StudentListCreate,
    StudentListUpdate,
    StudentListResponse,
    ListEntryUpdate,
    ListAssignRequest,
    ManualStudentEntry,
    ManualStudentListCreate,
)
from services.student_list_parser import StudentListParser, ParseResult

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Listes étudiants"])
parser = StudentListParser()


# ============================================================
# IMPORT & UPLOAD
# ============================================================

@router.post("/student-lists/upload", status_code=200)
async def upload_student_list(
    file: UploadFile = File(...),
    teacher: dict = Depends(get_current_teacher),
):
    """Étape 1 : Uploader un fichier CSV/XLSX/PDF → parsing + preview.

    Retourne un aperçu des données parsées avec détection des colonnes.
    L'enseignant peut vérifier avant de valider définitivement.
    """
    # Valider l'extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nom de fichier invalide")

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ('csv', 'xlsx', 'xls', 'pdf'):
        raise HTTPException(
            status_code=400,
            detail=f"Format de fichier non supporté : '.{ext}'. Formats acceptés : .csv, .xlsx, .xls, .pdf"
        )

    # Lire le contenu
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erreur de lecture du fichier : {str(e)}")

    if not content or len(content) == 0:
        raise HTTPException(status_code=400, detail="Fichier vide")

    # Limiter la taille à 10 Mo
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 10 Mo)")

    # Parser le fichier
    result: ParseResult = parser.parse(file.filename, content)

    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)

    # Journaliser l'import
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "student_list_upload",
        "resource_type": "student_list",
        "details": json.dumps({
            "filename": file.filename,
            "rows_detected": result.total_rows,
            "errors": len(result.error_rows),
        }),
    })

    # Retourner la preview
    return {
        "headers": result.headers,
        "column_mapping": {
            "student_name": result.column_mapping.student_name if result.column_mapping else None,
            "student_number": result.column_mapping.student_number if result.column_mapping else None,
            "email": result.column_mapping.email if result.column_mapping else None,
            "class_name": result.column_mapping.class_name if result.column_mapping else None,
        },
        "confidence": result.column_mapping.confidence if result.column_mapping else 0.0,
        "total_rows": result.total_rows,
        "preview_rows": result.entries[:10],  # 10 premières lignes
        "error_rows": result.error_rows,
        "warnings": result.warnings,
        "original_filename": file.filename,
        "file_type": ext,
    }


@router.post("/student-lists/manual", status_code=201)
def create_manual_student_list(
    data: ManualStudentListCreate,
    teacher: dict = Depends(get_current_teacher),
):
    """Creer une liste d'etudiants saisie manuellement (sans fichier)."""
    # Creer la liste
    list_data = {
        "teacher_id": teacher["id"],
        "name": data.name,
        "groupe": data.groupe,
        "file_type": "manual",
        "student_count": len(data.students),
        "status": "active",
    }
    lst = create_student_list(list_data)
    if not lst:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de la liste")

    # Creer les entrees
    entries = [
        {
            "list_id": lst["id"],
            "student_name": s.student_name,
            "student_number": s.student_number,
            "email": s.email,
            "row_index": i,
        }
        for i, s in enumerate(data.students)
    ]
    create_list_entries(entries)

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "student_list_created",
        "resource_type": "student_list",
        "details": json.dumps({
            "list_name": data.name,
            "entries_count": len(data.students),
            "source": "manual",
        }),
    })

    return {
        "id": lst["id"],
        "name": lst["name"],
        "student_count": len(data.students),
        "message": f"Liste '{data.name}' créée avec {len(data.students)} étudiant(s)",
    }


@router.post("/student-lists/confirm", status_code=201)
async def confirm_student_list(
    data: dict,
    teacher: dict = Depends(get_current_teacher),
):
    """Étape 2 : Confirmer la création de la liste après revue de la preview.

    Body (JSON) :
    {
        "name": "L2 Maths 2025-26",
        "groupe": "Groupe A",
        "column_mapping": {
            "student_name": "Nom",
            "student_number": "Matricule"
        },
        "entries": [ ... ]  // Tableau d'entrées validées
    }
    """
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Le nom de la liste est requis")

    column_mapping = data.get("column_mapping", {})
    entries = data.get("entries", [])

    if not entries:
        raise HTTPException(status_code=400, detail="Aucune entrée valide à importer")

    if not column_mapping.get("student_name") or not column_mapping.get("student_number"):
        raise HTTPException(
            status_code=400,
            detail="Les colonnes 'Nom' et 'Matricule' doivent être spécifiées"
        )

    groupe = data.get("groupe")
    original_filename = data.get("original_filename")
    file_type = data.get("file_type", "csv")

    # Créer la liste
    list_record = create_student_list({
        "teacher_id": teacher["id"],
        "name": name,
        "groupe": groupe,
        "original_filename": original_filename,
        "file_type": file_type,
        "student_count": len(entries),
        "column_mapping": json.dumps(column_mapping, ensure_ascii=False),
        "status": "active",
    })

    if not list_record:
        raise HTTPException(status_code=500, detail="Erreur lors de la création de la liste")

    # Insérer les entrées
    db_entries = []
    for idx, entry in enumerate(entries):
        db_entries.append({
            "list_id": list_record["id"],
            "student_name": entry.get("student_name", "").strip(),
            "student_number": entry.get("student_number", "").strip(),
            "email": entry.get("email") or None,
            "class_name": entry.get("class_name") or None,
            "row_index": idx + 1,
        })

    created_entries = create_list_entries(db_entries)

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "student_list_created",
        "resource_type": "student_list",
        "resource_id": list_record["id"],
        "details": json.dumps({
            "name": name,
            "entries_count": len(created_entries),
        }),
    })

    return {
        "list": StudentListResponse(
            id=list_record["id"],
            teacher_id=list_record["teacher_id"],
            name=list_record["name"],
            groupe=list_record.get("groupe"),
            original_filename=list_record.get("original_filename"),
            file_type=list_record["file_type"],
            student_count=len(created_entries),
            status=list_record["status"],
            created_at=list_record["created_at"],
            updated_at=list_record["updated_at"],
        ),
        "entries_count": len(created_entries),
        "message": f"Liste '{name}' créée avec {len(created_entries)} étudiants",
    }


# ============================================================
# CRUD LISTES
# ============================================================

@router.get("/student-lists")
def list_student_lists(
    status_filter: Optional[str] = Query(None, alias="status"),
    teacher: dict = Depends(get_current_teacher),
):
    """Lister toutes les listes d'étudiants de l'enseignant."""
    lists = get_teacher_lists(teacher["id"], status=status_filter)
    return [
        StudentListResponse(
            id=lst["id"],
            teacher_id=lst["teacher_id"],
            name=lst["name"],
            groupe=lst.get("groupe"),
            original_filename=lst.get("original_filename"),
            file_type=lst["file_type"],
            student_count=lst["student_count"],
            status=lst["status"],
            created_at=lst["created_at"],
            updated_at=lst["updated_at"],
        )
        for lst in lists
    ]


@router.get("/student-lists/{list_id}")
def get_student_list_detail(
    list_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Détail d'une liste avec ses entrées."""
    lst = get_student_list(list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    entries = get_list_entries(list_id)

    return {
        "list": StudentListResponse(
            id=lst["id"],
            teacher_id=lst["teacher_id"],
            name=lst["name"],
            groupe=lst.get("groupe"),
            original_filename=lst.get("original_filename"),
            file_type=lst["file_type"],
            student_count=lst["student_count"],
            status=lst["status"],
            created_at=lst["created_at"],
            updated_at=lst["updated_at"],
        ),
        "entries": entries,
        "column_mapping": json.loads(lst.get("column_mapping") or "{}"),
    }


@router.put("/student-lists/{list_id}")
def update_student_list_route(
    list_id: int,
    data: StudentListUpdate,
    teacher: dict = Depends(get_current_teacher),
):
    """Modifier les métadonnées d'une liste (nom, groupe, statut)."""
    lst = get_student_list(list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    update_data = data.model_dump(exclude_unset=True)
    updated = update_student_list(list_id, update_data)
    if not updated:
        raise HTTPException(status_code=500, detail="Erreur lors de la mise à jour")

    return StudentListResponse(
        id=updated["id"],
        teacher_id=updated["teacher_id"],
        name=updated["name"],
        groupe=updated.get("groupe"),
        original_filename=updated.get("original_filename"),
        file_type=updated["file_type"],
        student_count=updated["student_count"],
        status=updated["status"],
        created_at=updated["created_at"],
        updated_at=updated["updated_at"],
    )


@router.delete("/student-lists/{list_id}", status_code=204)
def delete_student_list_route(
    list_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer une liste d'étudiants (cascade supprime les entrées)."""
    lst = get_student_list(list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    delete_student_list(list_id)

    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "student_list_deleted",
        "resource_type": "student_list",
        "resource_id": list_id,
        "details": json.dumps({"name": lst["name"]}),
    })

    return None


# ============================================================
# GESTION DES ENTRÉES INDIVIDUELLES
# ============================================================

@router.put("/student-lists/{list_id}/entries/{entry_id}")
def update_list_entry_route(
    list_id: int,
    entry_id: int,
    data: ListEntryUpdate,
    teacher: dict = Depends(get_current_teacher),
):
    """Modifier une entrée individuelle dans une liste."""
    lst = get_student_list(list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    update_data = data.model_dump(exclude_unset=True)
    updated = update_list_entry(entry_id, update_data)
    if not updated:
        raise HTTPException(status_code=404, detail="Entrée non trouvée")

    return updated


@router.delete("/student-lists/{list_id}/entries/{entry_id}", status_code=204)
def delete_list_entry_route(
    list_id: int,
    entry_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Supprimer une entrée d'une liste."""
    lst = get_student_list(list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    delete_list_entry(entry_id)
    return None


# ============================================================
# ASSOCIATION LISTE ↔ SESSION
# ============================================================

@router.post("/sessions/{session_id}/assign-list")
def assign_list_to_session(
    session_id: int,
    data: ListAssignRequest,
    teacher: dict = Depends(get_current_teacher),
):
    """Associer une liste d'étudiants à une session d'examen.

    Vérifie la cohérence : le nombre d'entrées dans la liste doit correspondre
    au nombre d'étudiants configuré pour la session (avec alerte si différent).
    """
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    lst = get_student_list(data.list_id)
    if not lst or lst["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Liste non trouvée")

    if lst["status"] != "active":
        raise HTTPException(status_code=400, detail="La liste n'est pas active")

    # Vérifier la cohérence des effectifs
    entries_count = count_list_entries(data.list_id)
    session_count = session["student_count"]
    warnings = []

    if entries_count != session_count:
        warnings.append(
            f"La liste '{lst['name']}' contient {entries_count} étudiants, "
            f"mais la session est configurée pour {session_count} étudiants."
        )

    # Associer la liste à la session
    update_session(session_id, {"student_list_id": data.list_id})

    # Mettre à jour le student_count si nécessaire
    if entries_count != session_count:
        update_session(session_id, {"student_count": entries_count})
        warnings.append(f"Le nombre d'étudiants de la session a été ajusté à {entries_count}.")

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "list_assigned_to_session",
        "resource_type": "session",
        "resource_id": session_id,
        "details": json.dumps({
            "list_id": data.list_id,
            "list_name": lst["name"],
            "entries_count": entries_count,
        }),
    })

    return {
        "session_id": session_id,
        "list_id": data.list_id,
        "list_name": lst["name"],
        "entries_count": entries_count,
        "session_student_count": entries_count,
        "warnings": warnings,
        "message": f"Liste '{lst['name']}' associée à la session",
    }


@router.get("/sessions/{session_id}/list-status")
def get_session_list_status(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Vérifier l'état de la liste associée à une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    list_id = session.get("student_list_id")
    if not list_id:
        return {
            "has_list": False,
            "list": None,
            "status": "no_list",
            "message": "Aucune liste n'est associée à cette session",
        }

    lst = get_student_list(list_id)
    if not lst:
        return {
            "has_list": False,
            "list": None,
            "status": "list_deleted",
            "message": "La liste associée a été supprimée",
        }

    entries_count = count_list_entries(list_id)
    session_count = session["student_count"]
    is_consistent = entries_count == session_count

    return {
        "has_list": True,
        "list": {
            "id": lst["id"],
            "name": lst["name"],
            "groupe": lst.get("groupe"),
            "file_type": lst["file_type"],
            "student_count": entries_count,
        },
        "status": "consistent" if is_consistent else "inconsistent",
        "is_consistent": is_consistent,
        "entries_count": entries_count,
        "session_student_count": session_count,
        "message": None if is_consistent else
            f"Incohérence : {entries_count} étudiants dans la liste vs {session_count} configurés",
    }
