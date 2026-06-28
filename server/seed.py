"""Script de seed — Crée des comptes de test via Supabase.

Usage :
    python seed.py                        # Seed par défaut (dev)
    python seed.py --prod                 # Crée uniquement le compte admin

Pour la production, créer un compte admin manuellement via l'API :
    curl -X POST /api/auth/register \
      -H "Content-Type: application/json" \
      -d '{"email":"admin@votre-domaine.com","password":"MOT_DE_PASSE_FORT","full_name":"Admin","institution":"Votre Établissement","discipline":"Administration"}'
"""

import sys
import os
import logging
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timezone, timedelta
from core.config import get_settings
from core.db import (
    get_teacher_by_email,
    create_teacher,
    create_session,
    get_session_by_code,
    get_exercise_by_id,
    create_exercise,
    create_variant,
)
from core.security import hash_password

settings = get_settings()
is_prod = "--prod" in sys.argv


def seed():
    inserted_teachers = []

    if not is_prod:
        # ============= COMPTES ENSEIGNANTS (dev uniquement) =============
        teachers_data = [
            {
                "email": "prof.maths@universite.edu",
                "password": "password123",
                "full_name": "Dr. Sophie Martin",
                "institution": "Université Paris-Saclay",
                "discipline": "Mathématiques",
                "is_verified": True,
                "role": "teacher",
            },
            {
                "email": "prof.physique@universite.edu",
                "password": "password123",
                "full_name": "Prof. Thomas Bernard",
                "institution": "Université Lyon 1",
                "discipline": "Physique-Chimie",
                "is_verified": True,
                "role": "teacher",
            },
            {
                "email": "prof.info@universite.edu",
                "password": "password123",
                "full_name": "Mme. Claire Dubois",
                "institution": "Université Paris Cité",
                "discipline": "Informatique",
                "is_verified": True,
                "role": "teacher",
            },
        ]

    # ============= COMPTE ADMIN (toujours créé) =============
    admin_email = "admin@pean.edu"
    existing = get_teacher_by_email(admin_email)
    if not existing:
        create_teacher({
            "email": admin_email,
            "password_hash": hash_password(os.environ.get("ADMIN_PASSWORD", "admin123")),
            "full_name": "Administrateur PEAN",
            "institution": "PEAN",
            "discipline": "Administration",
            "is_verified": True,
            "role": "admin",
        })
        print(f"   Admin créé : {admin_email}")
        print(f"     AVERTISSEMENT : CHANGER LE MOT DE PASSE APRÈS LA PREMIÈRE CONNEXION !")
        inserted_teachers.append(admin_email)
    else:
        print(f"  ⏭  Admin déjà existant")

    if is_prod:
        print()
        print("=" * 50)
        print("  Seed production terminé !")
        print("=" * 50)
        print(f"  Admin : {admin_email}")
        print(f"    Utilisez la variable ADMIN_PASSWORD pour définir le mot de passe")
        print()
        return

    # ============= COMPTES ENSEIGNANTS =============
    for t in teachers_data:
        existing = get_teacher_by_email(t["email"])
        if not existing:
            create_teacher({
                "email": t["email"],
                "password_hash": hash_password(t["password"]),
                "full_name": t["full_name"],
                "institution": t["institution"],
                "discipline": t["discipline"],
                "is_verified": t["is_verified"],
                "role": t.get("role", "teacher"),
            })
            inserted_teachers.append(t["email"])
            print(f"   Enseignant créé : {t['full_name']} ({t['email']})")
        else:
            print(f"  ⏭  Déjà existant : {t['email']}")

    print()

    # ============= SESSIONS DE TEST =============
    prof_maths = get_teacher_by_email("prof.maths@universite.edu")
    prof_physique = get_teacher_by_email("prof.physique@universite.edu")
    prof_info = get_teacher_by_email("prof.info@universite.edu")

    if prof_maths:
        sessions_data = [
            {
                "teacher_id": prof_maths["id"],
                "title": "Partiel S1 — Analyse",
                "subject": "Mathématiques",
                "duration_seconds": 5400,
                "student_count": 45,
                "access_code": "MATH2024",
                "status": "active",
                "grading_system": "20",
                "correction_mode": "ai_assisted",
            },
            {
                "teacher_id": prof_maths["id"],
                "title": "DS — Algèbre Linéaire",
                "subject": "Mathématiques",
                "duration_seconds": 3600,
                "student_count": 38,
                "access_code": "ALGEB24",
                "status": "draft",
                "grading_system": "20",
                "correction_mode": "ai_only",
            },
        ]
        for s in sessions_data:
            existing = get_session_by_code(s["access_code"])
            if not existing:
                create_session(s)
                print(f"   Session créée : {s['title']} (code: {s['access_code']})")
            else:
                print(f"  ⏭  Session déjà existante : {s['access_code']}")

    if prof_physique:
        existing = get_session_by_code("PHYS2024")
        if not existing:
            create_session({
                "teacher_id": prof_physique["id"],
                "title": "TP — Thermodynamique",
                "subject": "Physique",
                "duration_seconds": 7200,
                "student_count": 30,
                "access_code": "PHYS2024",
                "status": "active",
                "grading_system": "20",
                "correction_mode": "ai_assisted",
            })
            print("   Session créée : TP — Thermodynamique (code: PHYS2024)")
        else:
            print("  ⏭  Session déjà existante : PHYS2024")

    if prof_info:
        existing = get_session_by_code("PYTHON24")
        if not existing:
            create_session({
                "teacher_id": prof_info["id"],
                "title": "CC — Programmation Python",
                "subject": "Informatique",
                "duration_seconds": 4500,
                "student_count": 50,
                "access_code": "PYTHON24",
                "status": "active",
                "grading_system": "20",
                "correction_mode": "ai_only",
            })
            print("   Session créée : CC — Programmation Python (code: PYTHON24)")
        else:
            print("  ⏭  Session déjà existante : PYTHON24")

    print()

    # ============= EXERCICES DE TEST =============
    if prof_maths:
        exercises_data = [
            {
                "teacher_id": prof_maths["id"],
                "title": "Calcul de dérivée",
                "subject": "Mathématiques",
                "difficulty": "easy",
                "exercise_type": "open",
                "instructions": "Calculez la dérivée de f(x) = 3x³ - 5x² + 2x - 7.",
                "correct_answer": "f'(x) = 9x² - 10x + 2",
                "points": 4,
            },
            {
                "teacher_id": prof_maths["id"],
                "title": "Limite et continuité",
                "subject": "Mathématiques",
                "difficulty": "medium",
                "exercise_type": "open",
                "instructions": "Étudiez la limite en +∞ de f(x) = (2x² + 3x - 1) / (x² - x + 1).",
                "correct_answer": "lim = 2. Asymptote horizontale y = 2.",
                "points": 6,
            },
            {
                "teacher_id": prof_maths["id"],
                "title": "Intégrale double",
                "subject": "Mathématiques",
                "difficulty": "hard",
                "exercise_type": "open",
                "instructions": "Calculez ∬_D (x² + y²) dx dy où D est le disque unité.",
                "correct_answer": "π/2",
                "points": 8,
            },
        ]
        for ex_data in exercises_data:
            existing = None
            # Vérifier si l'exercice existe déjà (requête simplifiée)
            from core.supabase_client import get_supabase
            supabase = get_supabase()
            result = supabase.table("exercises").select("id").eq("title", ex_data["title"]).eq("teacher_id", prof_maths["id"]).maybe_single().execute()
            existing = result.data

            if not existing:
                exercise = create_exercise(ex_data)
                if exercise:
                    print(f"   Exercice créé : {ex_data['title']}")
                    # Variantes de test
                    for i in range(1, 4):
                        create_variant({
                            "exercise_id": exercise["id"],
                            "variant_order": i,
                            "content": f"Variante {i} — {ex_data['title']} (version {i})",
                        })
            else:
                print(f"  ⏭  Exercice déjà existant : {ex_data['title']}")

    print()
    print("=" * 50)
    print("  Seed terminé avec succès !")
    print("=" * 50)
    print()
    print(" Identifiants de test :")
    print()
    print("   Admin :")
    print("     admin@pean.edu               / admin123")
    print()
    print("   Enseignants :")
    print("     prof.maths@universite.edu    / password123")
    print("     prof.physique@universite.edu / password123")
    print("     prof.info@universite.edu     / password123")
    print()
    print("   Codes d'accès étudiants :")
    print("     MATH2024  — Partiel Analyse (Maths)")
    print("     PHYS2024  — TP Thermodynamique (Physique)")
    print("     PYTHON24  — CC Programmation Python (Info)")
    print("     ALGEB24   — DS Algèbre Linéaire (Brouillon)")
    print()


if __name__ == "__main__":
    seed()
