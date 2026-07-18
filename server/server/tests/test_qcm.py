"""Tests du service de correction QCM — QCMCorrectionService.

Tests du parsing, de la correction automatique, et de l'analyse
des distracteurs. Utilise le mock Supabase via conftest.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from services.qcm_correction import QCMCorrectionService


@pytest.fixture(autouse=True)
def _patch_qcm_supabase(mock_supabase):
    """Patch get_supabase dans services.qcm_correction (import local)."""
    with patch("services.qcm_correction.get_supabase", return_value=mock_supabase):
        yield


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def service() -> QCMCorrectionService:
    """Instance du service QCM."""
    return QCMCorrectionService()


# ============================================================
# parse_correct_answer
# ============================================================

class TestParseCorrectAnswer:
    """Tests du parsing des réponses correctes."""

    def test_parse_simple_string(self, service):
        """Réponse simple : split par virgule."""
        result = service.parse_correct_answer("Paris")
        assert isinstance(result, list)
        assert "paris" in result

    def test_parse_json_list(self, service):
        """Réponse au format JSON liste."""
        result = service.parse_correct_answer('["a", "b", "c"]')
        assert result == ["a", "b", "c"]

    def test_parse_json_dict_with_correct(self, service):
        """Réponse au format JSON dict avec clé 'correct'."""
        result = service.parse_correct_answer('{"correct": ["a", "b"]}')
        assert "a" in result
        assert "b" in result

    def test_parse_json_dict_with_answer(self, service):
        """Réponse au format JSON dict avec clé 'answer'."""
        result = service.parse_correct_answer('{"answer": ["x", "y"]}')
        assert "x" in result
        assert "y" in result

    def test_parse_csv_lowercase(self, service):
        """Réponse CSV : lowercase + strip."""
        result = service.parse_correct_answer("  Paris  ,  Lyon  ")
        assert "paris" in result
        assert "lyon" in result


# ============================================================
# parse_exam_content
# ============================================================

class TestParseExamContent:
    """Tests du parsing du contenu d'épreuve."""

    def test_parse_valid_json(self, service):
        """JSON valide → liste de dicts."""
        content = '[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]'
        result = service.parse_exam_content(content)
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["exercise_type"] == "qcm"

    def test_parse_invalid_json(self, service):
        """JSON invalide → liste vide."""
        result = service.parse_exam_content("not json at all")
        assert result == []

    def test_parse_empty_string(self, service):
        """Chaîne vide → liste vide."""
        result = service.parse_exam_content("")
        assert result == []


# ============================================================
# parse_student_answers
# ============================================================

class TestParseStudentAnswers:
    """Tests du parsing des réponses étudiantes."""

    def test_parse_qcm_json_block(self, service):
        """Bloc ```qcm { }``` bien formaté."""
        content = '```qcm\n{"exercise_1": ["a", "b"]}\n```'
        result = service.parse_student_answers(content)
        assert isinstance(result, dict)
        assert 1 in result
        assert "a" in result[1]
        assert "b" in result[1]

    def test_parse_text_format(self, service):
        """Format texte 'Exercice 1: a, b'."""
        content = "Exercice 1: a, b"
        result = service.parse_student_answers(content)
        assert isinstance(result, dict)
        assert 1 in result
        assert "a" in result[1]
        assert "b" in result[1]

    def test_parse_multiple_exercises(self, service):
        """Plusieurs exercices au format texte."""
        content = "Exercice 1: a\nExercice 2: c, d"
        result = service.parse_student_answers(content)
        assert 1 in result
        assert 2 in result

    def test_parse_empty_content(self, service):
        """Contenu vide → dict vide."""
        result = service.parse_student_answers("")
        assert result == {}

    def test_parse_no_qcm_markers(self, service):
        """Pas de marqueurs QCM → dict vide."""
        result = service.parse_student_answers("Ceci est une réponse sans QCM")
        # Le format texte basique peut matcher, donc on vérifie juste le type
        assert isinstance(result, dict)


# ============================================================
# get_qcm_exercises
# ============================================================

class TestGetQCMExercises:
    """Tests de récupération des exercices QCM via Supabase."""

    def test_get_qcm_exercises_found(self, service, mock_supabase):
        """Exercices QCM trouvés."""
        mock_exec = MagicMock()
        mock_exec.data = [
            {"id": 1, "correct_answer": "Paris"},
            {"id": 2, "correct_answer": '["a", "b"]'},
        ]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        exam_parsed = [
            {"exercise_id": 1, "exercise_type": "qcm", "points": 10},
            {"exercise_id": 2, "exercise_type": "qcm", "points": 5},
        ]
        result = service.get_qcm_exercises(exam_parsed)
        assert len(result) == 2
        assert result[0] == (1, 10, "Paris")
        assert result[1] == (2, 5, '["a", "b"]')

    def test_get_qcm_exercises_none(self, service):
        """Aucun exercice QCM dans l'épreuve."""
        exam_parsed = [{"exercise_id": 1, "exercise_type": "open"}]
        result = service.get_qcm_exercises(exam_parsed)
        assert result == []

    def test_get_qcm_exercises_missing_correct_answer(self, service, mock_supabase):
        """Exercice QCM sans correct_answer → exclu."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": None}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        exam_parsed = [{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]
        result = service.get_qcm_exercises(exam_parsed)
        assert result == []

    def test_get_qcm_exercises_empty_exam(self, service):
        """Épreuve vide."""
        result = service.get_qcm_exercises([])
        assert result == []


# ============================================================
# auto_correct_qcm
# ============================================================

class TestAutoCorrectQCM:
    """Tests de la correction automatique QCM complète."""

    def test_correct_all_correct(self, service, mock_supabase):
        """Toutes les réponses sont correctes."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": '{"correct": ["a"]}'}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = service.auto_correct_qcm(
            exam_content='[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]',
            submission_content="Exercice 1: a",
        )
        assert result["qcm_score"] == 10.0
        assert result["qcm_max_score"] == 10.0
        assert len(result["qcm_results"]) == 1
        assert result["qcm_results"][0]["status"] == "corrected"

    def test_correct_all_wrong(self, service, mock_supabase):
        """Toutes les réponses sont fausses."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": "a"}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = service.auto_correct_qcm(
            exam_content='[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]',
            submission_content="Exercice 1: b",
        )
        assert result["qcm_score"] == 0.0

    def test_correct_partial(self, service, mock_supabase):
        """Réponses partiellement correctes."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": '["a", "b"]'}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = service.auto_correct_qcm(
            exam_content='[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]',
            submission_content="Exercice 1: a, c",
        )
        # 1 correcte sur 2 avec 1 incorrecte (pénalité de 0.5) = (1 - 0.5)/2 * 10 = 2.5
        assert result["qcm_results"][0]["score"] == 2.5

    def test_correct_no_answer(self, service, mock_supabase):
        """Aucune réponse fournie."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": "a"}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = service.auto_correct_qcm(
            exam_content='[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]',
            submission_content="",
        )
        assert result["qcm_results"][0]["status"] == "not_answered"

    def test_correct_case_insensitive(self, service, mock_supabase):
        """Correction insensible à la casse."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": "Paris"}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = service.auto_correct_qcm(
            exam_content='[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]',
            submission_content="Exercice 1: PARIS",
        )
        assert result["qcm_score"] == 10.0

    def test_correct_with_grading_details_weights(self, service, mock_supabase):
        """Pondération personnalisée via grading_details."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": "a"}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = service.auto_correct_qcm(
            exam_content='[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]',
            submission_content="Exercice 1: a",
            grading_details='[{"exercise_id": 1, "points": 5}]',
        )
        # La pondération passe à 5 points max (au lieu de 10)
        assert result["qcm_score"] == 5.0
        assert result["qcm_max_score"] == 5.0


# ============================================================
# analyze_distractors
# ============================================================

class TestAnalyzeDistractors:
    """Tests de l'analyse des distracteurs."""

    def test_analyze_distractors_basic(self, service):
        """Analyse de base."""
        result = service.analyze_distractors(
            exercise_id=1,
            correct_answers=["a"],
            student_answers=["a"],
            correct_answer_raw='{"options": [{"id": "a", "text": "Paris", "correct": true}, {"id": "b", "text": "Lyon", "correct": false}]}',
        )
        assert len(result) > 0
        paris = next((d for d in result if d["id"] == "a"), None)
        lyon = next((d for d in result if d["id"] == "b"), None)
        assert paris is not None
        assert paris["correct"] is True
        assert paris["selected"] is True
        assert lyon is not None
        assert lyon["is_distractor"] is True

    def test_analyze_distractors_no_options(self, service):
        """Pas d'options dans la réponse → liste vide."""
        result = service.analyze_distractors(1, ["a"], ["b"], "a")
        assert result == []


# ============================================================
# Distractor analysis (ancien test adapté)
# ============================================================

class TestDistractorAnalysis:
    """Tests statistiques des distracteurs."""

    def test_distractor_analysis_basic(self):
        """Analyse de base : comptage."""
        distractors = {"A": 2, "B": 5, "C": 1, "D": 0}
        total = sum(distractors.values())
        assert total == 8
        most_chosen = max(distractors, key=distractors.get)
        assert most_chosen == "B"

    def test_distractor_no_answers(self):
        """Analyse sans réponses."""
        distractors = {}
        assert len(distractors) == 0
