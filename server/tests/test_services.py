"""Tests pour les services de l'application."""

import json
import pytest
from services.generator import GenerationEngine
from services.student import StudentService


class TestGenerationEngine:
    """Tests du moteur de génération aléatoire."""

    def test_compute_max_combinations(self, db_session, sample_exercises):
        """Vérifie le calcul du nombre de combinaisons possibles."""
        engine = GenerationEngine(db_session)
        max_combos = engine.compute_max_combinations(sample_exercises)

        # 2 exercices × 3 variantes chacun = 9 combinaisons
        assert max_combos == 9

    def test_validate_capacity_sufficient(self, db_session, sample_exercises):
        """Vérifie la validation quand la capacité est suffisante."""
        engine = GenerationEngine(db_session)
        is_valid, error = engine.validate_capacity(sample_exercises, 5)
        assert is_valid is True
        assert error is None

    def test_validate_capacity_insufficient(self, db_session, sample_exercises):
        """Vérifie la validation quand la capacité est insuffisante."""
        engine = GenerationEngine(db_session)
        is_valid, error = engine.validate_capacity(sample_exercises, 100)
        assert is_valid is False
        assert error is not None
        assert "Capacité insuffisante" in error

    def test_generate_exams(self, db_session, sample_session_small, sample_exercises):
        """Teste la génération complète d'épreuves."""
        engine = GenerationEngine(db_session)

        students = [
            {"student_name": "Alice", "student_number": "ETU001"},
            {"student_name": "Bob", "student_number": "ETU002"},
            {"student_name": "Charlie", "student_number": "ETU003"},
        ]

        exams = engine.generate_exams(sample_session_small, sample_exercises, students)
        assert len(exams) == 3

        # Vérifier que toutes les épreuves ont des hash uniques
        hashes = [e.sha256_hash for e in exams]
        assert len(set(hashes)) == 3

        # Vérifier que le contenu est du JSON valide
        for exam in exams:
            content = json.loads(exam.content)
            assert len(content) == 2  # 2 exercices

    def test_generated_content_structure(self, db_session, sample_session_small, sample_exercises):
        """Vérifie la structure du contenu généré."""
        engine = GenerationEngine(db_session)

        students = [{"student_name": "Test", "student_number": "ETU001"}]
        exams = engine.generate_exams(sample_session_small, sample_exercises, students)
        content = json.loads(exams[0].content)

        for item in content:
            assert "exercise_id" in item
            assert "exercise_title" in item
            assert "points" in item
            assert "variant_id" in item
            assert "variant_order" in item
            assert "content" in item
            assert "instructions" in item


class TestStudentService:
    """Tests du service étudiant."""

    @pytest.mark.asyncio
    async def test_get_session_by_code(self, db_session, sample_session):
        """Vérifie la recherche de session par code."""
        service = StudentService(db_session)
        session = await service.get_session_by_code("TEST1234")
        assert session is not None
        assert session.id == sample_session.id

    @pytest.mark.asyncio
    async def test_get_session_by_code_invalid(self, db_session):
        """Vérifie le retour None pour un code invalide."""
        service = StudentService(db_session)
        session = await service.get_session_by_code("INVALID")
        assert session is None

    def test_get_session_status(self, db_session, sample_session):
        """Vérifie le calcul des statistiques de session."""
        service = StudentService(db_session)
        status = service.get_session_status(sample_session)

        assert status["session_id"] == sample_session.id
        assert status["total_students"] == 0  # Aucune épreuve générée
        assert status["pending"] == 0
        assert status["in_progress"] == 0
        assert status["submitted"] == 0
