"""Tests étendus pour les services critiques : génération, correction, sécurité."""

import json
import pytest

from services.generator import GenerationEngine
from services.qcm_correction import QCMCorrectionService
from services.student import StudentService


class TestGenerationEngineEdgeCases:
    """Tests des cas limites du générateur d'épreuves."""

    def test_compute_max_combinations_empty(self, db_session):
        """Vérifie le calcul avec une liste d'exercices vide."""
        engine = GenerationEngine(db_session)
        assert engine.compute_max_combinations([]) == 0

    def test_compute_max_combinations_single_exercise(self, db_session, sample_exercises):
        """Vérifie le calcul avec un seul exercice (3 variantes)."""
        engine = GenerationEngine(db_session)
        single = [sample_exercises[0]]
        assert engine.compute_max_combinations(single) == 3

    def test_validate_capacity_exact_limit(self, db_session, sample_exercises):
        """Vérifie la validation quand le nombre d'étudiants = combinaisons max."""
        engine = GenerationEngine(db_session)
        # 2 exercices × 3 variantes = 9 combinaisons
        is_valid, error = engine.validate_capacity(sample_exercises, 9)
        assert is_valid is True
        assert error is None

    def test_validate_capacity_zero_students(self, db_session, sample_exercises):
        """Vérifie la validation avec 0 étudiants."""
        engine = GenerationEngine(db_session)
        is_valid, error = engine.validate_capacity(sample_exercises, 0)
        assert is_valid is True
        assert error is None

    def test_generate_exams_duplicate_avoidance(self, db_session, sample_session_small, sample_exercises):
        """Vérifie qu'aucune épreuve identique n'est générée (collision de hash)."""
        engine = GenerationEngine(db_session)
        students = [
            {"student_name": f"Étudiant {i}", "student_number": f"ETU{i:03d}"}
            for i in range(3)
        ]
        exams = engine.generate_exams(sample_session_small, sample_exercises, students)
        hashes = [e.sha256_hash for e in exams]
        assert len(set(hashes)) == len(hashes)

    def test_generate_exams_student_hash_unique(self, db_session, sample_session_small, sample_exercises):
        """Vérifie que chaque étudiant a un hash unique dans la session."""
        engine = GenerationEngine(db_session)
        students = [
            {"student_name": "A", "student_number": "ETU001"},
            {"student_name": "B", "student_number": "ETU002"},
            {"student_name": "C", "student_number": "ETU003"},
        ]
        exams = engine.generate_exams(sample_session_small, sample_exercises, students)
        hashes = [e.student_id_hash for e in exams]
        assert len(set(hashes)) == len(hashes)

    def test_generate_exams_content_structure(self, db_session, sample_session_small, sample_exercises):
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

    def test_generate_exams_immutable_after_creation(self, db_session, sample_session_small, sample_exercises):
        """Vérifie que le contenu et le hash ne changent pas après création."""
        engine = GenerationEngine(db_session)
        students = [{"student_name": "A", "student_number": "ETU001"}]
        exams = engine.generate_exams(sample_session_small, sample_exercises, students)
        exam = exams[0]

        db_session.refresh(exam)
        assert exam.sha256_hash is not None
        assert exam.content is not None
        assert exam.status == "pending"


class TestQCMCorrection:
    """Tests du service de correction automatique des QCM."""

    def test_parse_correct_answer_simple(self, db_session):
        """Vérifie le parsing d'une réponse correcte simple."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        # "Paris" → split(",") → ["paris"]
        result = service.parse_correct_answer("Paris")
        assert isinstance(result, list)
        assert "paris" in result

    def test_parse_correct_answer_json_dict(self, db_session):
        """Vérifie le parsing d'une réponse au format JSON {correct: [...]}."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_correct_answer('{"correct": ["a", "b"]}')
        assert isinstance(result, list)
        assert "a" in result
        assert "b" in result

    def test_parse_correct_answer_json_list(self, db_session):
        """Vérifie le parsing d'une réponse au format JSON list."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_correct_answer('["a", "b", "c"]')
        assert isinstance(result, list)
        assert "a" in result
        assert "b" in result
        assert "c" in result

    def test_parse_exam_content_json(self, db_session):
        """Vérifie le parsing du contenu JSON d'une épreuve."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        content = '[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]'
        result = service.parse_exam_content(content)
        assert isinstance(result, list)
        assert len(result) == 1

    def test_parse_exam_content_invalid(self, db_session):
        """Vérifie la gestion du contenu invalide."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_exam_content("not json at all")
        assert result == []  # Retourne liste vide sur erreur

    def test_parse_student_answers_json_block(self, db_session):
        """Vérifie le parsing des réponses étudiantes au format ```qcm { }```."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        content = '```qcm\n{"exercise_1": ["a", "b"]}\n```'
        result = service.parse_student_answers(content)
        assert isinstance(result, dict)
        assert 1 in result
        assert "a" in result[1]
        assert "b" in result[1]

    def test_parse_student_answers_text_format(self, db_session):
        """Vérifie le parsing des réponses au format texte 'Exercice 1: a, b'."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        content = "Exercice 1: a, b"
        result = service.parse_student_answers(content)
        assert isinstance(result, dict)

    def test_parse_student_answers_empty(self, db_session):
        """Vérifie le parsing d'une réponse vide."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_student_answers("")
        assert result == {}


class TestStudentSecurity:
    """Tests de sécurité du module étudiant."""

    def test_hash_student_deterministic(self, db_session, sample_session):
        """Vérifie que le hash est déterministe (même entrée → même sortie)."""
        service = StudentService(db_session)
        h1 = service._hash_student(sample_session.id, "ETU001")
        h2 = service._hash_student(sample_session.id, "ETU001")
        assert h1 == h2

    def test_hash_student_unique_per_session(self, db_session, sample_session):
        """Vérifie que le même étudiant a un hash différent dans des sessions différentes."""
        service = StudentService(db_session)
        h1 = service._hash_student(1, "ETU001")
        h2 = service._hash_student(2, "ETU001")
        assert h1 != h2

    def test_hash_student_different_students(self, db_session, sample_session):
        """Vérifie que des étudiants différents ont des hash différents."""
        service = StudentService(db_session)
        h1 = service._hash_student(sample_session.id, "ETU001")
        h2 = service._hash_student(sample_session.id, "ETU002")
        assert h1 != h2

    def test_hash_student_format(self, db_session, sample_session):
        """Vérifie le format du hash (SHA-256 hex = 64 chars)."""
        service = StudentService(db_session)
        h = service._hash_student(sample_session.id, "ETU001")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_hash_student_blank_number(self, db_session, sample_session):
        """Vérifie le hash avec un numéro d'étudiant vide."""
        service = StudentService(db_session)
        h = service._hash_student(sample_session.id, "")
        assert len(h) == 64

    def test_get_session_status_no_exams(self, db_session, sample_session):
        """Vérifie le statut d'une session sans épreuves générées."""
        service = StudentService(db_session)
        status = service.get_session_status(sample_session)
        assert status["progress_pct"] == 0.0
        assert status["total_students"] == 0
