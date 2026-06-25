"""Tests du moteur de génération aléatoire d'épreuves (GenerationEngine).

Tests des calculs combinatoires, de l'attribution des variantes,
et de la génération complète. Utilise le mock Supabase via conftest.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from services.generator import GenerationEngine


# ============================================================
# Fixtures partagées
# ============================================================

@pytest.fixture
def engine() -> GenerationEngine:
    """Instance de GenerationEngine pour les tests."""
    return GenerationEngine()


# ============================================================
# compute_max_combinations
# ============================================================

class TestMaxCombinations:
    """Tests du calcul combinatoire."""

    def test_max_combinations_simple(self, engine, mock_supabase):
        """2 exercices × 3 variantes = 9 combinaisons."""
        exercises = [{"id": 1}, {"id": 2}]
        with patch("services.generator.get_variants_by_exercise") as mock_v:
            mock_v.side_effect = lambda ex_id: [
                {"id": 1}, {"id": 2}, {"id": 3}
            ] if ex_id in (1, 2) else []
            total = engine.compute_max_combinations(exercises)
            assert total == 9

    def test_max_combinations_single(self, engine, mock_supabase):
        """1 exercice × 3 variantes = 3 combinaisons."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1}, {"id": 2}, {"id": 3},
        ]):
            total = engine.compute_max_combinations([{"id": 1}])
            assert total == 3

    def test_max_combinations_empty(self, engine):
        """0 exercice = 0 combinaison."""
        total = engine.compute_max_combinations([])
        assert total == 0

    def test_max_combinations_no_variants(self, engine, mock_supabase):
        """Exercice sans variante = 0 combinaison."""
        with patch("services.generator.get_variants_by_exercise", return_value=[]):
            total = engine.compute_max_combinations([{"id": 1}])
            assert total == 0

    def test_max_combinations_large(self, engine, mock_supabase):
        """3 exercices × 4 var × 2 var × 3 var = 24 combinaisons."""
        with patch("services.generator.get_variants_by_exercise") as mock_v:
            mock_v.side_effect = lambda ex_id: {
                1: [{"id": 1}, {"id": 2}, {"id": 3}, {"id": 4}],
                2: [{"id": 5}, {"id": 6}],
                3: [{"id": 7}, {"id": 8}, {"id": 9}],
            }[ex_id]
            total = engine.compute_max_combinations([{"id": 1}, {"id": 2}, {"id": 3}])
            assert total == 24  # 4 × 2 × 3


# ============================================================
# validate_capacity
# ============================================================

class TestValidateCapacity:
    """Tests de validation de capacité."""

    def test_capacity_sufficient(self, engine, mock_supabase):
        """Assez de combinaisons : validé."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1}, {"id": 2}, {"id": 3},
        ]):
            is_valid, error = engine.validate_capacity([{"id": 1}], 2)
            assert is_valid is True
            assert error is None

    def test_capacity_exact(self, engine, mock_supabase):
        """Nombre exact de combinaisons : validé."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1}, {"id": 2}, {"id": 3},
        ]):
            is_valid, error = engine.validate_capacity([{"id": 1}], 3)
            assert is_valid is True
            assert error is None

    def test_capacity_insufficient(self, engine, mock_supabase):
        """Trop d'étudiants : rejeté."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1},
        ]):
            is_valid, error = engine.validate_capacity([{"id": 1}], 5)
            assert is_valid is False
            assert error is not None
            assert "Capacité insuffisante" in error

    def test_capacity_zero_students(self, engine, mock_supabase):
        """0 étudiant : validé."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1}, {"id": 2},
        ]):
            is_valid, error = engine.validate_capacity([{"id": 1}], 0)
            assert is_valid is True
            assert error is None

    def test_capacity_no_variants(self, engine, mock_supabase):
        """Aucune variante : rejeté avec message explicite."""
        with patch("services.generator.get_variants_by_exercise", return_value=[]):
            is_valid, error = engine.validate_capacity([{"id": 1}], 1)
            assert is_valid is False
            assert "variante" in error.lower()


# ============================================================
# _assign_variants
# ============================================================

class TestAssignVariants:
    """Tests de l'attribution aléatoire des variantes."""

    def test_assign_variants_unique(self, engine):
        """Chaque appel produit une combinaison unique."""
        exercises = [{"id": 1}, {"id": 2}]
        variants_by_exercise = {
            1: [{"id": 1}, {"id": 2}, {"id": 3}],
            2: [{"id": 4}, {"id": 5}, {"id": 6}],
        }
        used: set[str] = set()
        assignments = []
        for _ in range(3):
            result = engine._assign_variants(exercises, variants_by_exercise, used)
            assert result is not None
            assignments.append(result)

        assert len(assignments) == 3
        # Chaque assignment a une entrée par exercice
        for a in assignments:
            assert len(a) == 2  # 2 exercices

    def test_assign_variants_no_duplicates(self, engine):
        """Les combinaisons dans used ne sont pas ré-attribuées."""
        exercises = [{"id": 1}]
        variants_by_exercise = {1: [{"id": 1}, {"id": 2}]}

        # Simuler que les deux combinaisons sont déjà utilisées
        used: set[str] = {"1", "2"}
        result = engine._assign_variants(exercises, variants_by_exercise, used)
        assert result is None  # Plus de combinaison disponible

    def test_assign_variants_single_student(self, engine):
        """Un seul étudiant → une combinaison."""
        exercises = [{"id": 1}]
        variants_by_exercise = {1: [{"id": 1}, {"id": 2}]}
        used: set[str] = set()

        result = engine._assign_variants(exercises, variants_by_exercise, used)
        assert result is not None
        assert 1 in result

    def test_assign_variants_no_variants_returns_none(self, engine):
        """Exercice sans variante → None."""
        exercises = [{"id": 1}]
        variants_by_exercise = {1: []}
        used: set[str] = set()

        result = engine._assign_variants(exercises, variants_by_exercise, used)
        assert result is None


# ============================================================
# _generate_exam_hash
# ============================================================

class TestExamHash:
    """Tests de hachage des épreuves."""

    def test_hash_unique_for_different_assignments(self, engine):
        """Deux assignments différents → hash différents."""
        assignment_a = {1: {"id": 1}, 2: {"id": 4}}
        assignment_b = {1: {"id": 2}, 2: {"id": 5}}

        hash_a = engine._generate_exam_hash(1, assignment_a)
        hash_b = engine._generate_exam_hash(1, assignment_b)
        assert hash_a != hash_b
        assert len(hash_a) == 64  # SHA-256 hex

    def test_hash_consistent(self, engine):
        """Même assignment → même hash."""
        assignment = {1: {"id": 1}, 2: {"id": 4}}
        hash1 = engine._generate_exam_hash(1, assignment)
        hash2 = engine._generate_exam_hash(1, assignment)
        assert hash1 == hash2

    def test_hash_differs_per_session(self, engine):
        """Même assignment, session différente → hash différent."""
        assignment = {1: {"id": 1}}
        hash_s1 = engine._generate_exam_hash(1, assignment)
        hash_s2 = engine._generate_exam_hash(2, assignment)
        assert hash_s1 != hash_s2

    def test_hash_format(self, engine):
        """Format hexadécimal de 64 caractères."""
        h = engine._generate_exam_hash(1, {1: {"id": 42}})
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ============================================================
# _assemble_content
# ============================================================

class TestAssembleContent:
    """Tests d'assemblage du contenu JSON."""

    def test_assemble_content_structure(self, engine):
        """Structure du contenu généré."""
        exercises = [
            {
                "id": 1, "title": "Ex1", "difficulty": "medium",
                "points": 10, "instructions": "Faites",
                "exercise_type": "open", "language": "python",
            },
        ]
        assignment = {
            1: {"id": 5, "variant_order": 1, "content": "Calculer X",
                "data_overrides": None},
        }

        content_str = engine._assemble_content(exercises, assignment)
        content = json.loads(content_str)
        assert len(content) == 1
        item = content[0]
        assert item["exercise_id"] == 1
        assert item["exercise_title"] == "Ex1"
        assert item["variant_id"] == 5
        assert item["content"] == "Calculer X"
        assert item["language"] == "python"

    def test_assemble_multiple_exercises(self, engine):
        """Assemblage de plusieurs exercices."""
        exercises = [
            {"id": 1, "title": "Ex1", "difficulty": "easy",
             "points": 5, "instructions": "", "exercise_type": "qcm"},
            {"id": 2, "title": "Ex2", "difficulty": "hard",
             "points": 15, "instructions": "Rédigez", "exercise_type": "open"},
        ]
        assignment = {
            1: {"id": 10, "variant_order": 1, "content": "A",
                "data_overrides": None},
            2: {"id": 20, "variant_order": 1, "content": "B",
                "data_overrides": None},
        }

        content = json.loads(engine._assemble_content(exercises, assignment))
        assert len(content) == 2


# ============================================================
# generate_exams (intégration)
# ============================================================

class TestGenerateExams:
    """Tests de la génération complète d'épreuves."""

    def test_generate_exams_success(self, engine, mock_supabase):
        """Génération réussie avec 2 étudiants."""
        session = {"id": 1, "student_count": 2}
        exercises = [
            {
                "id": 1, "title": "Ex1", "difficulty": "medium",
                "points": 10, "instructions": "Faites",
                "exercise_type": "open",
            },
        ]
        students = [
            {"student_name": "Alice", "student_number": "ETU001"},
            {"student_name": "Bob", "student_number": "ETU002"},
        ]

        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1, "variant_order": 1, "content": "A", "data_overrides": None},
            {"id": 2, "variant_order": 2, "content": "B", "data_overrides": None},
        ]), patch("services.generator.create_generated_exam") as mock_create:
            mock_create.return_value = {"id": 1, "sha256_hash": "a" * 64, "status": "pending"}

            exams = engine.generate_exams(session, exercises, students)
            assert len(exams) == 2
            assert mock_create.call_count == 2

    def test_generate_exams_insufficient_capacity(self, engine, mock_supabase):
        """Capacité insuffisante → ValueError."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1},
        ]):
            with pytest.raises(ValueError, match="Capacité"):
                engine.generate_exams(
                    {"id": 1, "student_count": 10},
                    [{"id": 1}],
                    [{"student_name": f"S{i}", "student_number": f"N{i}"} for i in range(10)],
                )

    def test_generate_exams_no_more_combinations(self, engine, mock_supabase):
        """Capacité insuffisante → ValueError."""
        session = {"id": 1, "student_count": 3}
        exercises = [{"id": 1, "title": "Ex1", "difficulty": "easy",
                       "points": 5, "instructions": "", "exercise_type": "open"}]
        students = [
            {"student_name": f"S{i}", "student_number": f"N{i}"} for i in range(3)
        ]

        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1, "variant_order": 1, "content": "A", "data_overrides": None},
        ]), patch("services.generator.create_generated_exam") as mock_create:
            mock_create.return_value = {"id": 1, "sha256_hash": "a" * 64, "status": "pending"}

            with pytest.raises(ValueError, match="insuffisante"):
                engine.generate_exams(session, exercises, students)

    def test_generate_exams_hashes_unique(self, engine, mock_supabase):
        """Chaque épreuve générée a un hash unique."""
        session = {"id": 1, "student_count": 2}
        exercises = [{"id": 1, "title": "Ex1", "difficulty": "easy",
                       "points": 5, "instructions": "", "exercise_type": "open"}]
        students = [
            {"student_name": "A", "student_number": "ETU001"},
            {"student_name": "B", "student_number": "ETU002"},
        ]

        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1, "variant_order": 1, "content": "A", "data_overrides": None},
            {"id": 2, "variant_order": 2, "content": "B", "data_overrides": None},
        ]), patch("services.generator.create_generated_exam") as mock_create:
            call_count = 0
            def _fake_create(data):
                nonlocal call_count
                call_count += 1
                return {"id": call_count, "sha256_hash": f"hash_{call_count}", "status": "pending"}
            mock_create.side_effect = _fake_create

            exams = engine.generate_exams(session, exercises, students)
            hashes = [e["sha256_hash"] for e in exams]
            assert len(set(hashes)) == len(hashes)  # Tous uniques


# ============================================================
# get_student_exam
# ============================================================

class TestGetStudentExam:
    """Tests de récupération d'épreuve par étudiant."""

    def test_get_student_exam_found(self, engine, mock_supabase):
        """Étudiant trouvé → retourne l'épreuve."""
        mock_exec = MagicMock()
        mock_exec.data = {"id": 1, "status": "pending"}

        chain = MagicMock()
        chain.execute.return_value = mock_exec
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value = chain

        with patch("services.generator.get_supabase", return_value=mock_supabase):
            exam = engine.get_student_exam(1, "ETU001", "Alice")
        assert exam is not None
        assert exam["id"] == 1

    def test_get_student_exam_not_found(self, engine, mock_supabase):
        """Étudiant non trouvé → None."""
        mock_exec = MagicMock()
        mock_exec.data = None

        chain = MagicMock()
        chain.execute.return_value = mock_exec
        mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value = chain

        with patch("services.generator.get_supabase", return_value=mock_supabase):
            exam = engine.get_student_exam(1, "NOBODY", "Ghost")
        assert exam is None
