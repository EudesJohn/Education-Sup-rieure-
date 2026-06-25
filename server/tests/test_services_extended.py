"""Tests étendus pour les services critiques — cas limites non couverts ailleurs.

Complète les tests de test_services.py, test_generator.py, test_qcm.py.
Couvre les cas limites de GenerationEngine, QCMCorrectionService, StudentService,
et le SessionWatchdog.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.generator import GenerationEngine
from services.qcm_correction import QCMCorrectionService
from services.student import StudentService
from services.session_watchdog import _check_and_close_expired


# ============================================================
# GenerationEngine — cas limites supplémentaires
# ============================================================

class TestGenerationEngineEdgeCases:
    """Tests des cas limites du générateur non couverts dans test_generator.py."""

    def setup_method(self):
        self.engine = GenerationEngine()

    def test_validate_capacity_large_numbers(self, mock_supabase):
        """Grands nombres : validation correcte."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1}, {"id": 2},
        ]):
            is_valid, error = self.engine.validate_capacity([{"id": 1}], 500000)
            assert is_valid is False  # 2 < 500000

    def test_generate_exams_empty_students(self, mock_supabase):
        """Aucun étudiant → liste vide."""
        session = {"id": 1, "student_count": 0}
        exams = self.engine.generate_exams(session, [], [])
        assert exams == []

    def test_generate_exams_single_student_single_exercise(self, mock_supabase):
        """Cas minimal : 1 étudiant, 1 exercice, 1 variante."""
        session = {"id": 1, "student_count": 1}
        exercises = [{
            "id": 1, "title": "Ex1", "difficulty": "easy",
            "points": 10, "instructions": "Faites", "exercise_type": "open",
        }]
        students = [{"student_name": "A", "student_number": "ETU001"}]

        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1, "variant_order": 1, "content": "A", "data_overrides": None},
        ]), patch("services.generator.create_generated_exam", return_value={
            "id": 1, "sha256_hash": "a" * 64, "status": "pending",
        }):
            exams = self.engine.generate_exams(session, exercises, students)
            assert len(exams) == 1
            assert exams[0]["status"] == "pending"

    def test_generate_exams_different_teachers_isolation(self, mock_supabase):
        """Deux sessions différentes n'interfèrent pas."""
        with patch("services.generator.get_variants_by_exercise", return_value=[
            {"id": 1, "variant_order": 1, "content": "A", "data_overrides": None},
        ]), patch("services.generator.create_generated_exam") as mock_create:
            mock_create.return_value = {"id": 1, "sha256_hash": "h", "status": "pending"}

            exams_a = self.engine.generate_exams(
                {"id": 1, "student_count": 1},
                [{"id": 1, "title": "Ex", "difficulty": "easy", "points": 10,
                  "instructions": "", "exercise_type": "open"}],
                [{"student_name": "A", "student_number": "ETU001"}],
            )
            exams_b = self.engine.generate_exams(
                {"id": 2, "student_count": 1},
                [{"id": 1, "title": "Ex", "difficulty": "easy", "points": 10,
                  "instructions": "", "exercise_type": "open"}],
                [{"student_name": "B", "student_number": "ETU002"}],
            )
            assert len(exams_a) == 1
            assert len(exams_b) == 1


# ============================================================
# QCMCorrectionService — cas limites supplémentaires
# ============================================================

class TestQCMCorrectionEdgeCases:
    """Tests des cas limites de la correction QCM.

    Patch get_supabase dans services.qcm_correction (import local).
    """

    @pytest.fixture(autouse=True)
    def _patch_qcm_supabase(self, mock_supabase):
        with patch("services.qcm_correction.get_supabase", return_value=mock_supabase):
            yield

    def setup_method(self):
        self.service = QCMCorrectionService()

    def test_correct_with_distractor_analysis(self, mock_supabase):
        """Correction QCM avec analyse des distracteurs incluse."""
        mock_exec = MagicMock()
        mock_exec.data = [{"id": 1, "correct_answer": '{"options": [{"id": "a", "text": "Vrai", "correct": true}, {"id": "b", "text": "Faux", "correct": false}]}'}]
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = self.service.auto_correct_qcm(
            exam_content='[{"exercise_id": 1, "exercise_type": "qcm", "points": 10}]',
            submission_content="Exercice 1: a",
        )
        assert len(result.get("distractor_analysis", [])) > 0
        assert result["qcm_score"] == 10.0

    def test_correct_exercise_not_found(self, mock_supabase):
        """ID exercice non trouvé dans la base → pas de crash."""
        mock_exec = MagicMock()
        mock_exec.data = []  # Aucun exercice trouvé
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value = mock_exec

        result = self.service.auto_correct_qcm(
            exam_content='[{"exercise_id": 999, "exercise_type": "qcm", "points": 10}]',
            submission_content="Exercice 1: a",
        )
        assert result["qcm_results"] == []
        assert result["qcm_score"] == 0.0


# ============================================================
# StudentService — cas limites supplémentaires
# ============================================================

class TestStudentServiceEdgeCases:
    """Tests des cas limites — hash étudiant et statut de session."""

    def setup_method(self):
        from services.student import StudentService
        self.service = StudentService()

    def test_hash_student_blank_number(self):
        """Hash avec un numéro d'étudiant vide."""
        from core.security import hash_student_identifier
        h = hash_student_identifier(1, "")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_hash_student_long_number(self):
        """Hash avec un très long numéro d'étudiant."""
        from core.security import hash_student_identifier
        h = hash_student_identifier(1, "ETU" + "0" * 100)
        assert len(h) == 64

    def test_hash_student_special_chars(self):
        """Hash avec caractères spéciaux."""
        from core.security import hash_student_identifier
        h = hash_student_identifier(1, "étudiant-123!@#")
        assert len(h) == 64

    def test_get_session_status_no_exams(self, mock_supabase):
        """Statut d'une session sans épreuves."""
        session = {"id": 1, "title": "Test", "status": "active"}
        with patch("services.student.get_session_exams", return_value=[]):
            status = self.service.get_session_status(session)
            assert status["total_students"] == 0
            assert status["progress_pct"] == 0.0
            assert status["pending"] == 0
            assert status["in_progress"] == 0
            assert status["submitted"] == 0

    def test_get_session_status_with_data(self, mock_supabase):
        """Statut avec des examens à différents stades."""
        session = {"id": 1, "title": "Examen", "status": "active"}
        exams = [
            {"id": 1, "status": "pending"},
            {"id": 2, "status": "started"},
            {"id": 3, "status": "started"},
            {"id": 4, "status": "submitted"},
            {"id": 5, "status": "submitted"},
            {"id": 6, "status": "submitted"},
        ]
        with patch("services.student.get_session_exams", return_value=exams):
            status = self.service.get_session_status(session)
            assert status["total_students"] == 6
            assert status["pending"] == 1
            assert status["in_progress"] == 2
            assert status["submitted"] == 3
            assert status["progress_pct"] == 50.0

    def test_get_session_status_all_pending(self, mock_supabase):
        """Tous les examens en attente."""
        session = {"id": 1, "title": "Nouveau", "status": "active"}
        with patch("services.student.get_session_exams", return_value=[
            {"id": 1, "status": "pending"},
            {"id": 2, "status": "pending"},
        ]):
            status = self.service.get_session_status(session)
            assert status["progress_pct"] == 0.0


# ============================================================
# SessionWatchdog
# ============================================================

class TestSessionWatchdog:
    """Tests du watchdog de session (auto-submission).

    Tous les patches ciblent services.session_watchdog (module-level imports),
    sauf get_expired_exams (import local dans la fonction).
    """

    @pytest.fixture(autouse=True)
    def _patch_expired_exams(self):
        with patch("core.db.get_expired_exams", return_value=[]):
            yield

    def test_check_and_close_no_sessions(self, mock_supabase):
        """Aucune session active → 0 auto-submissions."""
        with patch("services.session_watchdog.get_active_sessions", return_value=[]):
            import asyncio
            result = asyncio.run(_check_and_close_expired())
            assert result == 0

    def test_check_and_close_not_expired(self, mock_supabase):
        """Session active mais pas encore expirée → 0."""
        from datetime import datetime, timezone, timedelta
        future = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

        with patch("services.session_watchdog.get_active_sessions", return_value=[
            {"id": 1, "status": "active", "scheduled_start": future,
             "duration_seconds": 3600, "title": "Future", "teacher_id": 1},
        ]):
            import asyncio
            result = asyncio.run(_check_and_close_expired())
            assert result == 0

    def test_check_and_close_no_scheduled_start(self, mock_supabase):
        """Session sans scheduled_start → ignorée."""
        with patch("services.session_watchdog.get_active_sessions", return_value=[
            {"id": 1, "status": "active", "scheduled_start": None,
             "duration_seconds": 3600},
        ]):
            import asyncio
            result = asyncio.run(_check_and_close_expired())
            assert result == 0

    def test_check_and_close_expired_no_exams(self, mock_supabase):
        """Session expirée sans examens → 0."""
        from datetime import datetime, timezone, timedelta
        past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

        with patch("services.session_watchdog.get_active_sessions", return_value=[
            {"id": 1, "status": "active", "scheduled_start": past,
             "duration_seconds": 3600, "title": "Passée", "teacher_id": 1},
        ]), patch("services.session_watchdog.update_session"), \
             patch("services.session_watchdog.get_session_exams", return_value=[]):

            import asyncio
            result = asyncio.run(_check_and_close_expired())
            assert result == 0

    def test_expired_exams_auto_submitted(self, mock_supabase):
        """Examens expirés auto-soumis."""
        from datetime import datetime, timezone, timedelta
        past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

        with patch("services.session_watchdog.get_active_sessions", return_value=[
            {"id": 1, "status": "active", "scheduled_start": past,
             "duration_seconds": 3600, "title": "Passée", "teacher_id": 1,
             "grading_system": "20", "access_code": "CODE123"},
        ]), patch("services.session_watchdog.update_session"), \
             patch("services.session_watchdog.get_session_exams", return_value=[
                 {"id": 10, "status": "started"},
                 {"id": 11, "status": "started"},
             ]), \
             patch("services.session_watchdog.get_submission_by_exam", return_value=None), \
             patch("services.session_watchdog.create_submission", return_value={"id": 100}), \
             patch("services.session_watchdog.update_generated_exam"), \
             patch("core.db.get_expired_exams", return_value=[]), \
             patch("services.student.get_session_exams"):

            import asyncio
            result = asyncio.run(_check_and_close_expired())
            # 2 examens started → 2 auto-submissions
            assert result == 2
