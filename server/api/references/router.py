"""Routeur public pour les listes de référence (établissements, matières)."""

from fastapi import APIRouter

from core.db import list_institutions, list_subjects

router = APIRouter()


@router.get("/institutions")
def get_institutions():
    """Liste publique des établissements (pour le formulaire d'inscription)."""
    return list_institutions()


@router.get("/subjects")
def get_subjects():
    """Liste publique des matières (pour le formulaire d'inscription)."""
    return list_subjects()
