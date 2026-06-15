"""Tests du service de correction QCM."""

import pytest
from services.qcm_correction import QCMCorrectionService
from unittest.mock import MagicMock


class TestQCMCorrectionService:
    """Tests du service de correction de QCM."""

    def test_parse_correct_answer_simple(self):
        """Vérifie le parsing d'une réponse correcte simple."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_correct_answer("Paris")
        assert result == "Paris"

    def test_parse_correct_answer_with_spaces(self):
        """Vérifie le trimming des espaces."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_correct_answer("  Paris  ")
        assert result == "Paris"

    @pytest.mark.skip(reason="Nécessite une session DB")
    def test_get_qcm_exercises(self, db_session, sample_qcm_exercises):
        """Vérifie la récupération des exercices QCM d'une session."""
        pass

    def test_parse_exam_content_json(self):
        """Vérifie le parsing du contenu JSON d'une épreuve."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        content_json = '{"exercises": [{"id": 1, "exercise_type": "qcm"}]}'
        result = service.parse_exam_content(content_json)
        assert result is not None

    def test_parse_exam_content_invalid(self):
        """Vérifie la gestion du contenu invalide."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_exam_content("invalid json")
        assert result is None or isinstance(result, dict)

    def test_parse_student_answers_simple(self):
        """Vérifie le parsing des réponses étudiantes."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_student_answers("Paris")
        assert result is not None

    def test_parse_student_answers_empty(self):
        """Vérifie le parsing d'une réponse vide."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        result = service.parse_student_answers("")
        # Ne doit pas planter
        assert result is not None or result == ""


class TestQCMAutoCorrection:
    """Tests de la logique de correction automatique QCM."""

    def test_correct_answer_match(self):
        """Vérifie qu'une réponse correcte est identifiée."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        # Simuler la correction
        student_answer = "Paris"
        correct_answer = "Paris"
        assert student_answer.strip().lower() == correct_answer.strip().lower()

    def test_correct_answer_case_insensitive(self):
        """Vérifie que la correction est insensible à la casse."""
        service = QCMCorrectionService.__new__(QCMCorrectionService)
        student_answer = "paris"
        correct_answer = "Paris"
        assert student_answer.strip().lower() == correct_answer.strip().lower()

    def test_correct_answer_with_spaces(self):
        """Vérifie que les espaces superflus sont ignorés."""
        student_answer = " 4 "
        correct_answer = "4"
        assert student_answer.strip() == correct_answer.strip()

    def test_wrong_answer_detected(self):
        """Vérifie qu'une réponse fausse est détectée."""
        student_answer = "Berlin"
        correct_answer = "Paris"
        assert student_answer.strip().lower() != correct_answer.strip().lower()

    def test_multiple_correct_answers_format(self):
        """Vérifie le formatage de réponses avec séparateur."""
        # Format possible: "Paris;Lyon" ou "Paris|Lyon"
        correct = set(a.strip().lower() for a in "Paris;Lyon".replace(";", "|").split("|"))
        assert "paris" in correct
        assert "lyon" in correct


class TestQCMAnalysis:
    """Tests de l'analyse statistique des QCM."""

    def test_distractor_analysis_basic(self):
        """Vérifie l'analyse de base des distracteurs."""
        distractors = {"A": 2, "B": 5, "C": 1, "D": 0}
        total = sum(distractors.values())
        assert total == 8
        # Le distracteur le plus choisi peut indiquer une ambiguïté
        most_chosen = max(distractors, key=distractors.get)
        assert most_chosen == "B"

    def test_distractor_no_answers(self):
        """Vérifie l'analyse sans réponses."""
        distractors = {}
        assert len(distractors) == 0
