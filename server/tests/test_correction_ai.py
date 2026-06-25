"""Tests du service de correction IA — AICorrectionService.

Mocke l'API Groq (httpx) et les appels core.db.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ============================================================
# Tests du prompt builder
# ============================================================

class TestAICorrectionPrompt:
    """Tests de construction du prompt de correction."""

    def setup_method(self):
        from services.correction_ai import AICorrectionService
        self.service = AICorrectionService()

    def test_build_prompt_includes_exam_content(self):
        """Le prompt contient le contenu de l'épreuve."""
        prompt = self.service._build_correction_prompt(
            exam_content='[{"exercise_id": 1, "title": "Calcul"}]',
            submission_content='Réponse: 42',
            grading_system="20",
            max_score=20.0,
        )
        assert any("Calcul" in m["content"] for m in prompt)
        assert any("Réponse: 42" in m["content"] for m in prompt)

    def test_build_prompt_system_role(self):
        """Le premier message est system."""
        prompt = self.service._build_correction_prompt(
            exam_content="test", submission_content="test",
            grading_system="20", max_score=20.0,
        )
        assert prompt[0]["role"] == "system"
        assert prompt[1]["role"] == "user"

    def test_build_prompt_with_grading_details_list(self):
        """Barème détaillé au format liste."""
        prompt = self.service._build_correction_prompt(
            exam_content="test", submission_content="test",
            grading_system="20", max_score=20.0,
            grading_details='[{"title": "Exercice 1", "points": 8}]',
        )
        full_text = " ".join(m["content"] for m in prompt)
        assert "Exercice 1" in full_text
        assert "8 points" in full_text

    def test_build_prompt_with_grading_details_dict(self):
        """Barème détaillé au format dict."""
        prompt = self.service._build_correction_prompt(
            exam_content="test", submission_content="test",
            grading_system="20", max_score=20.0,
            grading_details='{"exercice_1": 10, "exercice_2": 10}',
        )
        full_text = " ".join(m["content"] for m in prompt)
        assert "exercice_1" in full_text
        assert "10 points" in full_text

    def test_build_prompt_with_qcm_results(self):
        """Ajout des résultats QCM dans le prompt."""
        qcm_results = [
            {"exercise_id": 1, "exercise_title": "QCM 1", "score": 8.0, "max_points": 10},
        ]
        prompt = self.service._build_correction_prompt(
            exam_content="test", submission_content="test",
            grading_system="20", max_score=20.0,
            qcm_results=qcm_results,
        )
        full_text = " ".join(m["content"] for m in prompt)
        assert "QCM 1" in full_text
        assert "8.0/10" in full_text
        assert "déjà corrigés" in full_text


# ============================================================
# Tests du calcul de note finale
# ============================================================

class TestFinalScore:
    """Tests du calcul de la note finale selon le système de notation."""

    def setup_method(self):
        from services.correction_ai import AICorrectionService
        self.service = AICorrectionService()

    def test_system_20(self):
        """Système /20."""
        score = self.service._calculate_final_score(15.5, "20", 20.0)
        assert score == 15.5

    def test_system_100(self):
        """Système /100."""
        score = self.service._calculate_final_score(15.0, "100", 20.0)
        assert score == 75.0  # (15/20) * 100

    def test_system_10(self):
        """Système /10."""
        score = self.service._calculate_final_score(15.0, "10", 20.0)
        assert score == 7.5  # (15/20) * 10

    def test_system_50(self):
        """Système /50."""
        score = self.service._calculate_final_score(15.0, "50", 20.0)
        assert score == 37.5  # (15/20) * 50

    def test_system_letter_a(self):
        """Système lettre : A."""
        score = self.service._calculate_final_score(18.0, "letter", 20.0)
        assert score == "A"

    def test_system_letter_f(self):
        """Système lettre : F."""
        score = self.service._calculate_final_score(5.0, "letter", 20.0)
        assert score == "F"

    def test_system_letter_b(self):
        """Système lettre : B."""
        score = self.service._calculate_final_score(15.0, "letter", 20.0)
        assert score == "B"

    def test_system_unknown(self):
        """Système inconnu : retourne le score brut."""
        score = self.service._calculate_final_score(12.0, "custom", 20.0)
        assert score == 12.0


# ============================================================
# Tests de correct_submission (avec mocks)
# ============================================================

class TestCorrectSubmission:
    """Tests de la méthode correct_submission avec API mockée."""

    def setup_method(self):
        from services.correction_ai import AICorrectionService
        self.service = AICorrectionService()

    def test_correct_submission_success(self):
        """Correction réussie → retourne un dict avec scores."""
        mock_submission = {"id": 1, "generated_exam_id": 10, "content": "Réponse: 42"}
        mock_exam = {"id": 10, "session_id": 100, "content": '[{"exercise_id": 1}]'}
        mock_session = {"id": 100, "grading_system": "20",
                        "grading_details": None}
        mock_groq_response = {
            "score": 15.0,
            "feedback": "Bon travail",
            "detailed_scores": [{"exercise": "Ex1", "score": 15}],
            "strengths": ["Raisonnement clair"],
            "weaknesses": ["Calcul final erroné"],
            "overall_assessment": "Bien",
        }

        patches = [
            patch("services.correction_ai.get_submission_by_id", return_value=mock_submission),
            patch("services.correction_ai.get_generated_exam_by_id", return_value=mock_exam),
            patch("services.correction_ai.get_session_by_id", return_value=mock_session),
            patch("services.correction_ai.get_correction_by_submission", return_value=None),
            patch("services.correction_ai.create_correction", return_value={
                "id": 1, "submission_id": 1, "correction_status": "ai_corrected",
                "ai_score": 15.0, "final_score": 15.0,
            }),
            patch.object(self.service, "_call_ai_provider", new=AsyncMock(return_value=mock_groq_response)),
            patch("services.correction_ai.QCMCorrectionService.auto_correct_qcm", return_value={
                "qcm_score": 0.0, "qcm_max_score": 0.0,
                "qcm_results": [], "distractor_analysis": [],
            }),
        ]

        for p in patches:
            p.start()

        try:
            import asyncio
            result = asyncio.run(self.service.correct_submission(1))
            assert result["correction_status"] == "ai_corrected"
            assert result["ai_score"] is not None
        finally:
            for p in patches:
                p.stop()

    def test_correct_submission_submission_not_found(self):
        """Soumission introuvable → ValueError."""
        with patch("services.correction_ai.get_submission_by_id", return_value=None):
            import asyncio
            with pytest.raises(ValueError, match="introuvable"):
                asyncio.run(self.service.correct_submission(999))

    def test_correct_submission_exam_not_found(self):
        """Épreuve introuvable → ValueError."""
        with patch("services.correction_ai.get_submission_by_id", return_value={"id": 1, "generated_exam_id": 999}):
            with patch("services.correction_ai.get_generated_exam_by_id", return_value=None):
                import asyncio
                with pytest.raises(ValueError, match="introuvable"):
                    asyncio.run(self.service.correct_submission(1))

    def test_correct_submission_api_fallback_qcm(self):
        """Échec API Groq avec QCM → fallback sur score QCM."""
        mock_submission = {"id": 2, "generated_exam_id": 20, "content": "test"}
        mock_exam = {"id": 20, "session_id": 200, "content": '[{"exercise_id": 1, "exercise_type": "qcm"}]'}
        mock_session = {"id": 200, "grading_system": "20", "grading_details": None}

        patches = [
            patch("services.correction_ai.get_submission_by_id", return_value=mock_submission),
            patch("services.correction_ai.get_generated_exam_by_id", return_value=mock_exam),
            patch("services.correction_ai.get_session_by_id", return_value=mock_session),
            patch("services.correction_ai.get_correction_by_submission", return_value=None),
            patch("services.correction_ai.create_correction", return_value={
                "id": 2, "correction_status": "ai_corrected",
            }),
            patch.object(self.service, "_call_ai_provider",
                         new=AsyncMock(side_effect=Exception("API Error"))),
            patch("services.correction_ai.QCMCorrectionService.auto_correct_qcm", return_value={
                "qcm_score": 8.0, "qcm_max_score": 10.0,
                "qcm_results": [{"exercise_id": 1, "score": 8, "max_points": 10}],
                "distractor_analysis": [],
            }),
        ]

        for p in patches:
            p.start()

        try:
            import asyncio
            result = asyncio.run(self.service.correct_submission(2))
            assert result["correction_status"] == "ai_corrected"
            # Vérifie que le score QCM est utilisé malgré l'erreur API
        finally:
            for p in patches:
                p.stop()

    def test_correct_submission_api_fallback_no_qcm(self):
        """Échec API Groq sans QCM → status pending."""
        mock_submission = {"id": 3, "generated_exam_id": 30, "content": "test"}
        mock_exam = {"id": 30, "session_id": 300, "content": '[{"exercise_id": 1}]'}
        mock_session = {"id": 300, "grading_system": "20", "grading_details": None}

        patches = [
            patch("services.correction_ai.get_submission_by_id", return_value=mock_submission),
            patch("services.correction_ai.get_generated_exam_by_id", return_value=mock_exam),
            patch("services.correction_ai.get_session_by_id", return_value=mock_session),
            patch("services.correction_ai.get_correction_by_submission", return_value=None),
            patch("services.correction_ai.create_correction", return_value={
                "id": 3, "correction_status": "pending",
            }),
            patch.object(self.service, "_call_ai_provider",
                         new=AsyncMock(side_effect=Exception("API Error"))),
            patch("services.correction_ai.QCMCorrectionService.auto_correct_qcm", return_value={
                "qcm_score": 0.0, "qcm_max_score": 0.0,
                "qcm_results": [], "distractor_analysis": [],
            }),
        ]

        for p in patches:
            p.start()

        try:
            import asyncio
            result = asyncio.run(self.service.correct_submission(3))
            assert result["correction_status"] == "pending"
        finally:
            for p in patches:
                p.stop()


# ============================================================
# Tests de teacher_review
# ============================================================

class TestTeacherReview:
    """Tests de la révision par l'enseignant."""

    def setup_method(self):
        from services.correction_ai import AICorrectionService
        self.service = AICorrectionService()

    def test_teacher_review_success(self):
        """Révision réussie → statut teacher_reviewed + nouveau score."""
        with patch("core.db.get_correction_by_id", return_value={
            "id": 1, "submission_id": 1, "correction_status": "ai_corrected",
        }), patch("services.correction_ai.update_correction") as mock_update:
            result = self.service.teacher_review(
                correction_id=1, teacher_id=1,
                teacher_score=18.0, teacher_feedback="Excellent travail",
            )
            assert result["correction_status"] == "teacher_reviewed"
            mock_update.assert_called_once()

    def test_teacher_review_not_found(self):
        """Correction introuvable → ValueError."""
        with patch("core.db.get_correction_by_id", return_value=None):
            with pytest.raises(ValueError, match="introuvable"):
                self.service.teacher_review(
                    correction_id=999, teacher_id=1,
                    teacher_score=10.0, teacher_feedback="Ok",
                )
