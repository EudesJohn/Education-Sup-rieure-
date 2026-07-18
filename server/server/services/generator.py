"""Moteur de génération aléatoire d'épreuves — Supabase.

À partir d'un modèle d'exercices avec variantes, produit N épreuves uniques.
Plus de dépendance SQLAlchemy — utilise Supabase.
"""

import hashlib
import json
import random
from typing import Optional

from core.db import (
    get_exercise_by_id,
    get_variants_by_exercise,
    create_generated_exam,
)
from core.security import hash_student_identifier
from core.supabase_client import get_supabase


class GenerationEngine:
    """Moteur de génération et d'assemblage d'épreuves personnalisées."""

    def compute_max_combinations(self, exercises: list[dict]) -> int:
        """Calcule le nombre maximum d'épreuves uniques possibles."""
        if not exercises:
            return 0
        total = 1
        for ex in exercises:
            n_variants = len(get_variants_by_exercise(ex["id"]))
            if n_variants == 0:
                return 0
            total *= n_variants
        return total

    def validate_capacity(self, exercises: list[dict], student_count: int) -> tuple[bool, Optional[str]]:
        """Vérifie que le stock de combinaisons suffit."""
        max_combos = self.compute_max_combinations(exercises)

        if max_combos == 0 and student_count > 0:
            return False, "Chaque exercice doit avoir au moins une variante."

        if max_combos < student_count:
            return False, (
                f"Capacité insuffisante : {max_combos} épreuves uniques possibles, "
                f"mais {student_count} étudiants déclarés. "
                f"Ajoutez des variantes ou réduisez le nombre d'étudiants."
            )

        return True, None

    def _assign_variants(
        self, exercises: list[dict], variants_by_exercise: dict[int, list[dict]], used_combinations: set[str]
    ) -> Optional[dict[int, dict]]:
        """Tire aléatoirement une combinaison de variantes pour chaque exercice."""
        for _attempt in range(50):
            combo_key_parts = []
            assignment: dict[int, dict] = {}

            for ex in exercises:
                variants = variants_by_exercise.get(ex["id"], [])
                if not variants:
                    return None
                variant = random.choice(variants)
                assignment[ex["id"]] = variant
                combo_key_parts.append(str(variant["id"]))

            combo_key = ":".join(sorted(combo_key_parts))
            if combo_key not in used_combinations:
                used_combinations.add(combo_key)
                return assignment

        return None

    def _assemble_content(self, exercises: list[dict], assignment: dict[int, dict]) -> str:
        """assemble le contenu JSON de l'épreuve."""
        parts = []
        for ex in exercises:
            variant = assignment[ex["id"]]
            parts.append({
                "exercise_id": ex["id"],
                "exercise_title": ex["title"],
                "difficulty": ex["difficulty"],
                "points": ex["points"],
                "instructions": ex["instructions"],
                "exercise_type": ex["exercise_type"],
                "language": ex.get("language"),
                "variant_id": variant["id"],
                "variant_order": variant["variant_order"],
                "content": variant["content"],
                "data_overrides": json.loads(variant.get("data_overrides") or "null"),
            })

        return json.dumps(parts, ensure_ascii=False)

    def _generate_exam_hash(self, session_id: int, assignment: dict[int, dict]) -> str:
        """Génère un hash SHA-256 unique pour une combinaison de variantes."""
        variant_ids = sorted(v["id"] for v in assignment.values())
        raw = f"{session_id}:{variant_ids}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def generate_exams(
        self,
        session: dict,
        exercises: list[dict],
        student_identifiers: list[dict],
    ) -> list[dict]:
        """Génère N épreuves uniques pour une session.

        Args:
            session: La session d'examen (dict)
            exercises: Liste des exercices avec leurs variantes
            student_identifiers: Liste de dicts avec les infos des étudiants

        Retourne la liste des GeneratedExam créés.
        """
        is_valid, error_msg = self.validate_capacity(exercises, session["student_count"])
        if not is_valid:
            raise ValueError(error_msg)

        # Précharger toutes les variantes pour éviter N+1
        variants_by_exercise: dict[int, list[dict]] = {}
        for ex in exercises:
            variants_by_exercise[ex["id"]] = get_variants_by_exercise(ex["id"])

        used_combinations: set[str] = set()
        generated_exams: list[dict] = []

        for student_info in student_identifiers:
            assignment = self._assign_variants(exercises, variants_by_exercise, used_combinations)
            if assignment is None:
                raise RuntimeError(
                    "Impossible de trouver une combinaison unique pour tous les étudiants."
                )

            student_number = student_info.get("student_number", student_info.get("id", ""))
            student_name = student_info.get("student_name", student_info.get("name", ""))

            student_hash = hash_student_identifier(session["id"], student_number)

            variant_ids = sorted(v["id"] for v in assignment.values())
            combo_raw = f"{session['id']}:{variant_ids}"
            variant_combo_hash = hashlib.sha256(combo_raw.encode()).hexdigest()

            sha256_hash = self._generate_exam_hash(session["id"], assignment)
            content = self._assemble_content(exercises, assignment)

            exam = create_generated_exam({
                "session_id": session["id"],
                "student_id_hash": student_hash,
                "variant_combo_hash": variant_combo_hash,
                "sha256_hash": sha256_hash,
                "content": content,
                "status": "pending",
            })

            if exam:
                generated_exams.append(exam)

        return generated_exams

    def get_student_exam(self, session_id: int, student_number: str, student_name: str) -> Optional[dict]:
        """Récupère l'épreuve attribuée à un étudiant."""
        student_hash = hash_student_identifier(session_id, student_number)

        supabase = get_supabase()
        result = supabase.table("generated_exams").select("*").eq("session_id", session_id).eq("student_id_hash", student_hash).maybe_single().execute()
        return result.data
