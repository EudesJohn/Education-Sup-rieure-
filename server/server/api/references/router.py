"""Routeur public pour les listes de référence (établissements, matières, classes, années)."""

from fastapi import APIRouter, Query

from core.db import (
    list_institutions,
    list_subjects,
    list_academic_years,
    list_filieres,
    list_classes,
    list_class_students,
)

router = APIRouter()


@router.get("/institutions")
def get_institutions():
    """Liste publique des établissements."""
    return list_institutions()


@router.get("/subjects")
def get_subjects():
    """Liste publique des matières."""
    return list_subjects()


@router.get("/academic-years")
def get_academic_years():
    """Liste des années scolaires (pour les menus déroulants)."""
    return list_academic_years()


@router.get("/filieres")
def get_filieres(
    institution_id: int | None = Query(None, alias="institution_id"),
):
    """Liste des filières, filtrée par établissement."""
    return list_filieres(institution_id=institution_id)


@router.get("/classes")
def get_classes(
    filiere_id: int | None = Query(None, alias="filiere_id"),
    academic_year_id: int | None = Query(None, alias="academic_year_id"),
):
    """Liste des classes, filtrée par filière et/ou année scolaire."""
    return list_classes(filiere_id=filiere_id, academic_year_id=academic_year_id)


@router.get("/class-students")
def get_class_students(
    class_id: int | None = Query(None, alias="class_id"),
):
    """Liste des étudiants d'une classe.

    Utilisé par le professeur pour voir les effectifs d'une classe.
    """
    if not class_id:
        return []
    return list_class_students(class_id)
