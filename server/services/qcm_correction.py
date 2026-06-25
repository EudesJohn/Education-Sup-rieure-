"""Service de correction automatique des QCM.

Correction automatique des QCM avec calcul du score,
analyse des distracteurs choisis (per CDC RF-04, RF-07).
Plus de dépendance SQLAlchemy — utilise Supabase directement.
"""

import json
import logging
from typing import Optional

from core.supabase_client import get_supabase

logger = logging.getLogger(__name__)


class QCMCorrectionService:
    """Correction automatique des exercices de type QCM."""

    def parse_exam_content(self, exam_content: str) -> list[dict]:
        """Parse le contenu JSON de l'épreuve générée."""
        try:
            return json.loads(exam_content)
        except (json.JSONDecodeError, TypeError):
            return []

    def parse_student_answers(self, submission_content: str) -> dict[int, list[str]]:
        """Parse le contenu de la copie étudiante pour extraire les réponses QCM."""
        answers: dict[int, list[str]] = {}

        import re
        qcm_json_match = re.search(
            r'```qcm\s*(\{.*?\})\s*```', submission_content, re.DOTALL
        )
        if qcm_json_match:
            try:
                data = json.loads(qcm_json_match.group(1))
                for key, value in data.items():
                    ex_id = int(key.replace("exercise_", ""))
                    if isinstance(value, list):
                        answers[ex_id] = [str(v).strip().lower() for v in value]
                    elif isinstance(value, str):
                        answers[ex_id] = [
                            v.strip().lower() for v in value.split(",")
                        ]
            except (json.JSONDecodeError, ValueError, AttributeError):
                pass

        if not answers:
            text_pattern = re.finditer(
                r'(?:Exercice|exercice|QCM|qcm)\s*(\d+)\s*[:.,;]\s*(.+?)(?=\n|$)',
                submission_content,
            )
            for match in text_pattern:
                try:
                    ex_idx = int(match.group(1))
                    raw_options = match.group(2).strip()
                    options = [
                        o.strip().strip(".").strip().lower()
                        for o in raw_options.split(",")
                    ]
                    answers[ex_idx] = [o for o in options if o]
                except (ValueError, IndexError):
                    pass

        return answers

    def get_qcm_exercises(self, exam_parsed: list[dict]) -> list[tuple[int, int, str]]:
        """Retourne la liste des exercices QCM avec leur correct_answer.

        Requête via Supabase au lieu de SQLAlchemy.
        """
        qcm_ids = []
        id_to_points = {}
        for ex in exam_parsed:
            if ex.get("exercise_type") == "qcm":
                exercise_id = ex.get("exercise_id")
                if not exercise_id:
                    continue
                qcm_ids.append(exercise_id)
                id_to_points[exercise_id] = ex.get("points", 10)

        if not qcm_ids:
            return []

        # Requête Supabase : récupérer les exercices QCM par IDs
        supabase = get_supabase()
        result = supabase.table("exercises").select("id, correct_answer").in_("id", qcm_ids).execute()
        exercises = result.data or []
        exercise_map = {ex["id"]: ex for ex in exercises}

        qcm_exercises = []
        for exercise_id in qcm_ids:
            exercise = exercise_map.get(exercise_id)
            if exercise and exercise.get("correct_answer"):
                qcm_exercises.append((
                    exercise_id,
                    id_to_points[exercise_id],
                    exercise["correct_answer"],
                ))

        return qcm_exercises

    def parse_correct_answer(self, correct_answer: str) -> list[str]:
        """Parse la réponse correcte d'un QCM."""
        try:
            data = json.loads(correct_answer)
            if isinstance(data, dict):
                if "correct" in data:
                    return [str(o).strip().lower() for o in data["correct"]]
                if "answer" in data:
                    return [str(o).strip().lower() for o in data["answer"]]
                if "options" in data:
                    return [
                        str(opt["id"]).strip().lower()
                        for opt in data["options"]
                        if opt.get("correct") is True and "id" in opt
                    ]
            elif isinstance(data, list):
                return [str(o).strip().lower() for o in data]
        except (json.JSONDecodeError, TypeError):
            pass

        return [o.strip().lower() for o in correct_answer.split(",")]

    def analyze_distractors(
        self,
        exercise_id: int,
        correct_answers: list[str],
        student_answers: list[str],
        correct_answer_raw: str,
    ) -> list[dict]:
        """Analyse les distracteurs choisis par l'étudiant."""
        distractors = []
        try:
            data = json.loads(correct_answer_raw)
            if isinstance(data, dict) and "options" in data:
                for opt in data["options"]:
                    opt_id = str(opt.get("id", "")).strip().lower()
                    distractors.append({
                        "option": opt.get("text", opt_id) or opt_id,
                        "id": opt_id,
                        "correct": opt.get("correct", False),
                        "selected": opt_id in student_answers,
                        "is_distractor": not opt.get("correct", False),
                    })
        except (json.JSONDecodeError, TypeError):
            pass

        return distractors

    def auto_correct_qcm(
        self,
        exam_content: str,
        submission_content: str,
        grading_details: Optional[str] = None,
    ) -> dict:
        """Corrige automatiquement les QCM d'une copie."""
        exam_parsed = self.parse_exam_content(exam_content)
        student_answers = self.parse_student_answers(submission_content)

        if not exam_parsed:
            return {"qcm_score": 0.0, "qcm_max_score": 0.0, "qcm_results": [], "distractor_analysis": []}

        qcm_exercises = self.get_qcm_exercises(exam_parsed)

        if not qcm_exercises:
            return {"qcm_score": 0.0, "qcm_max_score": 0.0, "qcm_results": [], "distractor_analysis": []}

        weights = {}
        if grading_details:
            try:
                details = json.loads(grading_details)
                if isinstance(details, list):
                    for item in details:
                        if "exercise_id" in item and "points" in item:
                            weights[item["exercise_id"]] = float(item["points"])
                elif isinstance(details, dict):
                    weights = {int(k): float(v) for k, v in details.items()}
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

        total_score = 0.0
        total_max = 0.0
        qcm_results = []
        all_distractors = []

        for exercise_id, points, correct_answer_raw in qcm_exercises:
            max_points = weights.get(exercise_id, float(points))
            total_max += max_points

            correct_answers = self.parse_correct_answer(correct_answer_raw)

            ex_index = next(
                (i for i, ex in enumerate(exam_parsed) if ex.get("exercise_id") == exercise_id),
                None,
            )
            ex_num = ex_index + 1 if ex_index is not None else exercise_id

            student_opts = student_answers.get(ex_num, [])
            student_opts += student_answers.get(exercise_id, [])
            student_opts = list(set(student_opts))

            if not student_opts:
                qcm_results.append({
                    "exercise_id": exercise_id,
                    "exercise_title": exam_parsed[ex_index].get("exercise_title", "") if ex_index is not None else "",
                    "score": 0.0,
                    "max_points": max_points,
                    "correct_answers": correct_answers,
                    "student_answers": [],
                    "status": "not_answered",
                    "comment": "Question non répondue",
                })
                all_distractors.append({"exercise_id": exercise_id, "analysis": []})
                continue

            correct_count = sum(1 for ans in student_opts if ans in correct_answers)
            wrong_count = sum(1 for ans in student_opts if ans not in correct_answers)

            if correct_answers:
                raw_ratio = max(0, (correct_count - wrong_count * 0.5) / len(correct_answers))
                score = round(raw_ratio * max_points, 2)
            else:
                score = 0.0

            total_score += score

            ex_title = ""
            if ex_index is not None:
                ex_title = exam_parsed[ex_index].get("exercise_title", "")

            distractors = self.analyze_distractors(exercise_id, correct_answers, student_opts, correct_answer_raw)

            qcm_results.append({
                "exercise_id": exercise_id,
                "exercise_title": ex_title,
                "score": score,
                "max_points": max_points,
                "correct_answers": correct_answers,
                "student_answers": student_opts,
                "status": "corrected",
                "comment": f"{correct_count}/{len(correct_answers)} correct, {wrong_count} incorrect",
            })

            all_distractors.append({
                "exercise_id": exercise_id,
                "exercise_title": ex_title,
                "analysis": distractors,
            })

        return {
            "qcm_score": round(total_score, 2),
            "qcm_max_score": total_max,
            "qcm_results": qcm_results,
            "distractor_analysis": all_distractors,
        }
