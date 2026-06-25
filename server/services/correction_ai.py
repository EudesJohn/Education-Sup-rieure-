"""Service de correction intelligente par IA — Groq UNIQUEMENT.

Utilise l'API Groq (compatible OpenAI) avec le modèle llama-3.3-70b-versatile
pour corriger les copies d'étudiants.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from core.config import get_settings
from core.db import (
    get_submission_by_id,
    get_generated_exam_by_id,
    get_correction_by_submission,
    create_correction,
    update_correction,
    get_session_by_id,
)
from services.qcm_correction import QCMCorrectionService

logger = logging.getLogger(__name__)
settings = get_settings()


class AICorrectionService:
    """Correction intelligente des copies via Groq API."""

    def __init__(self):
        self.qcm_service = QCMCorrectionService()

    def _build_correction_prompt(
        self,
        exam_content: str,
        submission_content: str,
        grading_system: str,
        max_score: float,
        grading_details: Optional[str] = None,
        qcm_results: Optional[list[dict]] = None,
    ) -> list[dict]:
        """Construit le prompt de correction pour Groq."""
        grading_section = ""
        if grading_details:
            try:
                details = json.loads(grading_details)
                if isinstance(details, list):
                    grading_section = "\nBARÈME DÉTAILLÉ PAR EXERCICE :\n"
                    for item in details:
                        name = item.get("title", item.get("exercise", ""))
                        pts = item.get("points", item.get("max_points", ""))
                        grading_section += f"  - {name}: {pts} points\n"
                elif isinstance(details, dict):
                    grading_section = "\nBARÈME DÉTAILLÉ PAR EXERCICE :\n"
                    for ex, pts in details.items():
                        grading_section += f"  - {ex}: {pts} points\n"
            except (json.JSONDecodeError, TypeError):
                pass

        qcm_section = ""
        if qcm_results:
            qcm_section = "\nRÉSULTATS DE LA CORRECTION AUTOMATIQUE QCM :\n"
            for qcm in qcm_results:
                title = qcm.get("exercise_title", qcm.get("exercise_id", ""))
                score = qcm.get("score", 0)
                max_pts = qcm.get("max_points", 0)
                qcm_section += (
                    f"  - {title}: {score}/{max_pts}\n"
                )
            qcm_section += "\n⚠️ Ces QCM ont déjà été corrigés automatiquement.\n"

        system_prompt = f"""Tu es un enseignant expert chargé de corriger une copie d'examen.

RÈGLES DE CORRECTION :
1. Analyse la démarche de résolution, pas seulement la réponse finale.
2. Un raisonnement correct avec une erreur de calcul mineure doit être valorisé.
3. Identifie les erreurs conceptuelles et leur position dans le raisonnement.
4. Pour les QCM déjà corrigés automatiquement, vérifie la cohérence.

SYSTÈME DE NOTATION :
- Système : {grading_system}
- Note maximale : {max_score}
{grading_section}
{qcm_section}

Retourne UNIQUEMENT un objet JSON valide avec cette structure exacte :
{{
    "score": <note_sur_{max_score}_en_float>,
    "feedback": "<commentaire_pédagogique_détaillé_en_français>",
    "detailed_scores": [
        {{"exercise": "<titre_exercice>", "score": <note_exercice>, "max_points": <points_max>, "comment": "<commentaire_exercice>"}}
    ],
    "strengths": ["<point_fort_1>", "<point_fort_2>"],
    "weaknesses": ["<faiblesse_1>", "<faiblesse_2>"],
    "overall_assessment": "<appréciation_générale>"
}}
"""

        user_prompt = f"""ÉPREUVE ORIGINALE (contenu de référence) :
{exam_content}

COPIE DE L'ÉTUDIANT (réponse à corriger) :
{submission_content}

Corrige cette copie en suivant les règles ci-dessus. Retourne UNIQUEMENT le JSON."""

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    async def _call_groq(self, prompt: list[dict]) -> dict:
        """Appelle l'API Groq (compatible OpenAI)."""
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": prompt,
                    "temperature": settings.GROQ_TEMPERATURE,
                    "max_tokens": settings.GROQ_MAX_TOKENS,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)

    async def _call_ai_provider(self, prompt: list[dict]) -> dict:
        """Appelle Groq (seul fournisseur)."""
        return await self._call_groq(prompt)

    def _calculate_final_score(self, ai_score: float, grading_system: str, max_score: float):
        if grading_system == "20":
            return round(ai_score, 2)
        elif grading_system == "100":
            return round((ai_score / max_score) * 100, 2)
        elif grading_system == "10":
            return round((ai_score / max_score) * 10, 2)
        elif grading_system == "50":
            return round((ai_score / max_score) * 50, 2)
        elif grading_system == "letter":
            ratio = ai_score / max_score if max_score > 0 else 0
            if ratio >= 0.9: return "A"
            elif ratio >= 0.7: return "B"
            elif ratio >= 0.5: return "C"
            elif ratio >= 0.4: return "D"
            else: return "F"
        else:
            return round(ai_score, 2)

    async def correct_submission(self, submission_id: int) -> dict:
        """Corrige une copie avec Groq et enregistre le résultat."""
        submission = get_submission_by_id(submission_id)
        if not submission:
            raise ValueError(f"Soumission #{submission_id} introuvable")

        exam = get_generated_exam_by_id(submission["generated_exam_id"])
        if not exam:
            raise ValueError(f"Épreuve #{submission['generated_exam_id']} introuvable")

        session = get_session_by_id(exam["session_id"])
        if not session:
            raise ValueError(f"Session #{exam['session_id']} introuvable")

        # Étape 1 : Correction automatique des QCM
        qcm_result = self.qcm_service.auto_correct_qcm(
            exam_content=exam["content"],
            submission_content=submission["content"],
            grading_details=session.get("grading_details"),
        )
        has_qcm = len(qcm_result.get("qcm_results", [])) > 0
        qcm_score = qcm_result.get("qcm_score", 0.0)
        qcm_max = qcm_result.get("qcm_max_score", 0.0)
        qcm_results_list = qcm_result.get("qcm_results", []) if has_qcm else None

        # Étape 2 : Construction du prompt
        prompt = self._build_correction_prompt(
            exam_content=exam["content"],
            submission_content=submission["content"],
            grading_system=session["grading_system"],
            max_score=20.0,
            grading_details=session.get("grading_details"),
            qcm_results=qcm_results_list,
        )

        try:
            # Étape 3 : Appel à Groq
            result = await self._call_ai_provider(prompt)
            ai_score = float(result["score"])
            ai_feedback = result.get("feedback", "")
            ai_detailed_scores = json.dumps(result.get("detailed_scores", []), ensure_ascii=False)

            # Fusion QCM + IA : moyenne pondérée (70% IA, 30% QCM auto)
            # L'IA reçoit déjà les résultats QCM dans son prompt, mais la correction
            # automatique QCM est objective (juste/faux). Le poids de 30% du QCM
            # reflète sa contribution typique à la note totale.
            if has_qcm and qcm_max > 0:
                normalized_qcm = round((qcm_score / qcm_max) * 20.0, 2) if qcm_max > 0 else 0.0
                final_ai_score = round((ai_score * 0.7) + (normalized_qcm * 0.3), 2)
            else:
                final_ai_score = ai_score

        except Exception as e:
            logger.error(f"Erreur correction IA pour submission #{submission_id}: {e}")
            if has_qcm and qcm_max > 0:
                correction = create_correction({
                    "submission_id": submission_id,
                    "ai_score": qcm_score,
                    "ai_feedback": "Correction QCM automatique effectuée. La correction IA a échoué.",
                    "ai_detailed_scores": json.dumps(qcm_result["qcm_results"], ensure_ascii=False),
                    "ai_corrected_at": datetime.now(timezone.utc).isoformat(),
                    "grading_system": session["grading_system"],
                    "max_score": 20.0,
                    "final_score": self._calculate_final_score(qcm_score, session["grading_system"], 20.0),
                    "correction_status": "ai_corrected",
                })
                return correction or {"id": None, "submission_id": submission_id, "correction_status": "ai_corrected"}

            correction = create_correction({
                "submission_id": submission_id,
                "grading_system": session["grading_system"],
                "max_score": 20.0,
                "correction_status": "pending",
            })
            return correction or {"id": None, "submission_id": submission_id, "correction_status": "pending"}

        # Étape 4 : Calcul de la note finale
        final_score = self._calculate_final_score(final_ai_score, session["grading_system"], 20.0)
        if isinstance(final_score, (int, float)):
            final_score = round(final_score, 2)

        # Vérifier si une correction existe déjà
        existing = get_correction_by_submission(submission_id)

        correction_data = {
            "ai_score": final_ai_score,
            "ai_feedback": ai_feedback,
            "ai_detailed_scores": ai_detailed_scores,
            "ai_corrected_at": datetime.now(timezone.utc).isoformat(),
            "final_score": final_score if isinstance(final_score, (int, float)) else 0.0,
            "correction_status": "ai_corrected",
        }

        if has_qcm and qcm_result.get("distractor_analysis"):
            existing_detailed = json.loads(ai_detailed_scores or "[]")
            combined = {
                "ai_detailed": existing_detailed,
                "qcm_details": qcm_result["qcm_results"],
                "distractor_analysis": qcm_result["distractor_analysis"],
            }
            correction_data["ai_detailed_scores"] = json.dumps(combined, ensure_ascii=False)

        if existing:
            update_correction(existing["id"], correction_data)
            return {**existing, **correction_data}

        result = create_correction({"submission_id": submission_id, **correction_data})
        return result or {"submission_id": submission_id, **correction_data}

    def teacher_review(
        self,
        correction_id: int,
        teacher_id: int,
        teacher_score: float,
        teacher_feedback: str,
    ) -> dict:
        """Permet à l'enseignant de réviser une correction IA."""
        from core.db import get_correction_by_id
        correction = get_correction_by_id(correction_id)
        if not correction:
            raise ValueError(f"Correction #{correction_id} introuvable")

        now = datetime.now(timezone.utc).isoformat()
        data = {
            "teacher_score": teacher_score,
            "teacher_feedback": teacher_feedback,
            "teacher_id": teacher_id,
            "teacher_corrected_at": now,
            "final_score": teacher_score,
            "correction_status": "teacher_reviewed",
            "corrected_at": now,
        }
        update_correction(correction_id, data)
        return {**correction, **data}
