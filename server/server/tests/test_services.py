"""Tests pour les services de l'application (architecture Supabase).

Tests des services métier qui utilisent directement core.db (pas de SQLAlchemy).
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from services.generator import GenerationEngine
from services.student import StudentService


class TestGenerationEngine:
    """Tests du moteur de génération aléatoire (Supabase)."""

    def setup_method(self):
        self.engine = GenerationEngine()

    def test_compute_max_combinations(self, mock_supabase):
        """Vérifie le calcul du nombre de combinaisons possibles."""
        # Mock get_variants_by_exercise
        with patch("services.generator.get_variants_by_exercise") as mock_variants:
            # 3 variantes par exercice
            mock_variants.return_value = [{"id": 1}, {"id": 2}, {"id": 3}]

            exercises = [
                {"id": 1, "title": "Ex1"},
                {"id": 2, "title": "Ex2"},
            ]
            max_combos = self.engine.compute_max_combinations(exercises)
            assert max_combos == 9  # 3 × 3

    def test_compute_max_combinations_no_variants(self, mock_supabase):
        """Vérifie qu'aucune combinaison n'est possible sans variantes."""
        with patch("services.generator.get_variants_by_exercise") as mock_variants:
            mock_variants.return_value = []

            exercises = [{"id": 1}]
            max_combos = self.engine.compute_max_combinations(exercises)
            assert max_combos == 0

    def test_validate_capacity_sufficient(self, mock_supabase):
        """Vérifie la validation quand la capacité est suffisante."""
        with patch("services.generator.get_variants_by_exercise") as mock_variants:
            mock_variants.return_value = [{"id": 1}, {"id": 2}, {"id": 3}]

            exercises = [{"id": 1}]
            is_valid, error = self.engine.validate_capacity(exercises, 2)
            assert is_valid is True
            assert error is None

    def test_validate_capacity_insufficient(self, mock_supabase):
        """Vérifie la validation quand la capacité est insuffisante."""
        with patch("services.generator.get_variants_by_exercise") as mock_variants:
            mock_variants.return_value = [{"id": 1}]

            exercises = [{"id": 1}]
            is_valid, error = self.engine.validate_capacity(exercises, 5)
            assert is_valid is False
            assert error is not None

    def test_generate_exams_content_structure(self, mock_supabase):
        """Vérifie la structure du contenu généré."""
        session = {
            "id": 1,
            "teacher_id": 1,
            "student_count": 1,
            "title": "Test",
        }
        exercises = [
            {
                "id": 1,
                "title": "Ex1",
                "difficulty": "medium",
                "points": 10,
                "instructions": "Faites...",
                "exercise_type": "open",
                "_variants": [
                    {"id": 1, "variant_order": 1,
                     "content": "Variante 1", "data_overrides": None}
                ],
            }
        ]

        with patch("services.generator.get_variants_by_exercise") as mock_variants, \
             patch("services.generator.create_generated_exam") as mock_create:
            mock_variants.return_value = [
                {"id": 1, "variant_order": 1,
                 "content": "Variante 1", "data_overrides": None}
            ]
            mock_create.return_value = {
                "id": 1, "sha256_hash": "abc123",
                "variant_combo_hash": "def456",
                "content": "[]", "status": "pending"
            }

            students = [{"student_name": "Alice", "student_number": "ETU001"}]
            exams = self.engine.generate_exams(session, exercises, students)
            assert len(exams) == 1


class TestStudentService:
    """Tests du service étudiant (Supabase)."""

    def test_hash_student_deterministic(self):
        """Vérifie qu'un même étudiant a toujours le même hash."""
        from core.security import hash_student_identifier
        h1 = hash_student_identifier(1, "ETU001")
        h2 = hash_student_identifier(1, "ETU001")
        assert h1 == h2

    def test_hash_student_differs_per_session(self):
        """Vérifie que le hash change selon la session."""
        from core.security import hash_student_identifier
        h1 = hash_student_identifier(1, "ETU001")
        h2 = hash_student_identifier(2, "ETU001")
        assert h1 != h2

    def test_hash_student_differs_per_student(self):
        """Vérifie que deux étudiants ont des hash différents."""
        from core.security import hash_student_identifier
        h1 = hash_student_identifier(1, "ETU001")
        h2 = hash_student_identifier(1, "ETU002")
        assert h1 != h2

    def test_hash_student_format(self):
        """Vérifie le format du hash (SHA-256 hexadécimal)."""
        from core.security import hash_student_identifier
        h = hash_student_identifier(1, "ETU001")
        assert len(h) == 64  # SHA-256 hex
        assert all(c in "0123456789abcdef" for c in h)
