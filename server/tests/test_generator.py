"""Tests du moteur de génération aléatoire d'épreuves (section 7.1 du CDC)."""

import pytest
from services.generator import GenerationEngine
from models.generated_exam import GeneratedExam


class TestGeneratorCombinatorics:
    """Tests des calculs combinatoires du générateur."""

    def test_max_combinations_simple(self):
        """2 exercices × 3 variantes = 6 combinaisons."""
        engine = GenerationEngine()
        exercises = [{"variant_count": 3}, {"variant_count": 2}]
        total = engine.compute_max_combinations(exercises)
        assert total == 6

    def test_max_combinations_large(self):
        """3 ex × 4 var × 2 var = 24 combinaisons."""
        engine = GenerationEngine()
        exercises = [{"variant_count": 3}, {"variant_count": 4}, {"variant_count": 2}]
        total = engine.compute_max_combinations(exercises)
        assert total == 24

    def test_max_combinations_single(self):
        """1 exercice × 1 variante = 1 combinaison."""
        engine = GenerationEngine()
        exercises = [{"variant_count": 1}]
        total = engine.compute_max_combinations(exercises)
        assert total == 1

    def test_max_combinations_empty(self):
        """0 exercice = 0 combinaison."""
        engine = GenerationEngine()
        total = engine.compute_max_combinations([])
        assert total == 0

    def test_max_combinations_no_variants(self):
        """Exercice sans variante = 0 combinaison."""
        engine = GenerationEngine()
        exercises = [{"variant_count": 0}]
        total = engine.compute_max_combinations(exercises)
        assert total == 0


class TestGeneratorValidation:
    """Tests de validation de capacité."""

    def test_validate_capacity_sufficient(self):
        """Vérifie qu'assez de combinaisons est validé."""
        engine = GenerationEngine()
        result = engine.validate_capacity(6, 3)
        assert result is True

    def test_validate_capacity_exact(self):
        """Vérifie qu'exactement le bon nombre est validé."""
        engine = GenerationEngine()
        result = engine.validate_capacity(5, 5)
        assert result is True

    def test_validate_capacity_insufficient(self):
        """Vérifie qu'un stock insuffisant est rejeté."""
        engine = GenerationEngine()
        result = engine.validate_capacity(3, 5)
        assert result is False

    def test_validate_capacity_zero_students(self):
        """Vérifie que 0 étudiant = validé."""
        engine = GenerationEngine()
        result = engine.validate_capacity(10, 0)
        assert result is True

    def test_validate_capacity_large_numbers(self):
        """Vérifie la validation pour de grands nombres."""
        engine = GenerationEngine()
        result = engine.validate_capacity(1000000, 500000)
        assert result is True


class TestGeneratorAssignment:
    """Tests de l'attribution aléatoire des variantes."""

    def test_assign_variants_unique(self):
        """Vérifie que chaque étudiant reçoit une combinaison unique."""
        engine = GenerationEngine()
        exercises = [
            {"id": 1, "variants": [{"id": 1}, {"id": 2}, {"id": 3}]},
            {"id": 2, "variants": [{"id": 4}, {"id": 5}, {"id": 6}]},
        ]
        assignments = engine._assign_variants(exercises, student_count=3)

        assert len(assignments) == 3
        # Vérifier l'unicité
        combos = set()
        for student_assignment in assignments:
            variant_tuple = tuple(
                v["variant_id"] for v in student_assignment["variants"]
            )
            combos.add(variant_tuple)
        assert len(combos) == 3  # Tous uniques

    def test_assign_variants_single_student(self):
        """Vérifie l'attribution pour un seul étudiant."""
        engine = GenerationEngine()
        exercises = [
            {"id": 1, "variants": [{"id": 1}, {"id": 2}]},
        ]
        assignments = engine._assign_variants(exercises, student_count=1)
        assert len(assignments) == 1
        assert len(assignments[0]["variants"]) == 1

    def test_assign_variants_respects_exercise_count(self):
        """Vérifie que le nombre d'exercices est conservé."""
        engine = GenerationEngine()
        exercises = [
            {"id": 1, "variants": [{"id": 1}, {"id": 2}]},
            {"id": 2, "variants": [{"id": 3}, {"id": 4}]},
            {"id": 3, "variants": [{"id": 5}, {"id": 6}]},
        ]
        assignments = engine._assign_variants(exercises, student_count=2)
        assert len(assignments) == 2
        for a in assignments:
            assert len(a["variants"]) == 3  # 3 exercices

    def test_assign_variants_student_count(self, db_session, sample_session_small, sample_exercises):
        """Vérifie que le nombre d'épreuves générées = nombre d'étudiants."""
        engine = GenerationEngine()
        # Passer les variantes sous forme de dictionnaire
        exercises_data = [
            {
                "id": ex.id,
                "variants": [
                    {"id": v.id, "variant_order": v.variant_order}
                    for v in ex.variants
                ],
            }
            for ex in sample_exercises
        ]
        assignments = engine._assign_variants(
            exercises_data,
            student_count=sample_session_small.student_count,
        )
        assert len(assignments) == sample_session_small.student_count


class TestGeneratorHashing:
    """Tests de hachage et traçabilité des épreuves."""

    def test_content_hash_unique(self):
        """Vérifie que deux contenus différents ont des hash différents."""
        engine = GenerationEngine()
        content1 = {"exercises": [{"id": 1, "variant": 1}]}
        content2 = {"exercises": [{"id": 1, "variant": 2}]}

        hash1 = engine._hash_content(content1)
        hash2 = engine._hash_content(content2)
        assert hash1 != hash2
        assert len(hash1) == 64  # SHA-256 hex

    def test_content_hash_consistent(self):
        """Vérifie que le même contenu a toujours le même hash."""
        engine = GenerationEngine()
        content = {"exercises": [{"id": 1, "variant": 1, "data": "test"}]}
        hash1 = engine._hash_content(content)
        hash2 = engine._hash_content(content)
        assert hash1 == hash2

    def test_content_hash_includes_content(self):
        """Vérifie que le hash est basé sur le contenu JSON."""
        engine = GenerationEngine()
        content_a = {"a": 1}
        content_b = {"a": 2}
        assert engine._hash_content(content_a) != engine._hash_content(content_b)
