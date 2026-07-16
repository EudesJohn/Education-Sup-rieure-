"""Service de generation d'exercices par IA a partir de contenu pedagogique.

A partir d'un texte (extrait de PDF/Word ou saisi manuellement),
utilise Groq API pour produire des questions avec variantes.

Support multi-type : qcm, open, code, mixed.
Calcule automatiquement les points par question.
"""

import json
import logging
import re
from typing import Optional

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)

# Prompts concis pour minimiser la taille de la requete Groq (eviter 413)
# ATTENTION : les {} dans les exemples JSON sont echappees en {{}}
# car .format() est appele sur system_prompt. Toute {non-placeholder}
# provoque une KeyError.

SYSTEM_PROMPT_QCM = """Genere des QCM a partir du contenu fourni.

REGLES :
- 4 choix (A/B/C/D). correct_answer = lettre seule.
- Pieges pedagogiques plausibles.
- 5 a 6 variantes UNIQUES : formulation, donnees, contexte, ordre des choix differents.
- Chaque variante : content = enonce, data_overrides = {{"choices": ["A)...","B)...","C)...","D)..."]}}"""

SYSTEM_PROMPT_OPEN = """Genere des questions ouvertes (redaction) a partir du contenu fourni.

REGLES :
- Question precise guidant la reflexion.
- correct_answer = elements de reponse attendus (bareme indicatif).
- 4 a 5 variantes : formulations, angles, contextes differents."""

SYSTEM_PROMPT_CODE = """Genere des exercices de code a partir du contenu fourni.

REGLES :
- Enonce clair avec contraintes, un ou deux exemples.
- Cas de test (input -> expected_output).
- correct_answer = solution de reference.
- language = python|javascript|java|cpp|sql
- 4 a 5 variantes : enonce, donnees, contraintes differents.
- data_overrides = {{"test_cases": [{{"input":"...","expected_output":"..."}}]}}"""


def _build_system_prompt(exercise_type: str) -> str:
    """Construit le prompt systeme concis selon le type d'exercice."""
    base = (
        "Tu es un professeur expert. "
        "Genere exactement {num_questions} questions au format JSON, "
        "notees sur {total_score}, points=0 par question (redistribution auto).\n"
    )
    type_rules = {
        "qcm": SYSTEM_PROMPT_QCM,
        "open": SYSTEM_PROMPT_OPEN,
        "code": SYSTEM_PROMPT_CODE,
    }
    if exercise_type in type_rules:
        body = type_rules[exercise_type]
    else:
        # mixed
        body = (
            "GENERE UN MELANGE de types : QCM + ouvert + code (si technique).\n"
            "Chaque question a 'exercise_type': 'qcm'|'open'|'code'.\n"
            + SYSTEM_PROMPT_QCM + "\n" + SYSTEM_PROMPT_OPEN + "\n" + SYSTEM_PROMPT_CODE
        )

    output_format = """
FORMAT SORTIE (JSON uniquement) :
{{"questions":[
  {{"title":"Titre","subject":"Matiere","difficulty":"easy|medium|hard",
   "instructions":"Enonce","points":0,"exercise_type":"TYPE",
   "correct_answer":"...","language":"...",
   "variants":[{{"content":"Enonce variant","data_overrides":{{...}}}}]}
]}}"""
    return base + body + output_format


class QCMGenerator:
    """Genere des exercices avec variantes via Groq API."""

    GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
    MAX_CONTENT_CHARS = 4000  # Limite pour eviter 413 Payload Too Large de Groq

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        self.model = "llama-3.1-8b-instant"
        self.max_tokens = 4096  # Suffisant pour QCM avec variantes
        self.temperature = 0.7

    async def generate(
        self,
        content: str,
        num_questions: int = 5,
        exercise_type: str = "mixed",
        total_score: int = 20,
    ) -> dict:
        """Generer des exercices a partir du contenu fourni.

        Args:
            content: Texte du cours / epreuve
            num_questions: Nombre de questions a generer
            exercise_type: Type d'exercice (qcm, open, code, mixed)
            total_score: Note totale de l'examen (ex: 20)

        Returns:
            dict avec "questions" ou {"error": "..."}
        """
        if not self.api_key:
            return {"error": "GROQ_API_KEY non configurée - IA désactivée"}

        if exercise_type not in ("qcm", "open", "code", "mixed"):
            exercise_type = "mixed"

        points_per_question = round(total_score / num_questions, 2) if num_questions > 0 else float(total_score)

        system_prompt = _build_system_prompt(exercise_type)

        # Remplacer les placeholders
        system_prompt = system_prompt.format(
            total_score=total_score,
            num_questions=num_questions,
            points_per_question=points_per_question,
            exercise_type=exercise_type,
        )

        # Tronquer le contenu pour eviter l'erreur 413 (Payload Too Large) de Groq
        if len(content) > self.MAX_CONTENT_CHARS:
            logger.warning(
                "Contenu tronque de %d a %d caracteres pour respecter la limite Groq",
                len(content), self.MAX_CONTENT_CHARS,
            )
            content = content[:self.MAX_CONTENT_CHARS] + "\n\n[...suite tronquee...]"

        type_label = {
            "qcm": "QCM", "open": "questions ouvertes",
            "code": "exercices de code", "mixed": "questions variees",
        }

        user_prompt = (
            f"Genere {num_questions} {type_label.get(exercise_type, 'questions')} "
            f"a partir du contenu suivant.\n\n"
            f"---CONTENU---\n{content}\n---FIN---"
        )

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    self.GROQ_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": self.temperature,
                        "max_tokens": self.max_tokens,
                        "response_format": {"type": "json_object"},
                    },
                )
                response.raise_for_status()
                data = response.json()
                raw = data["choices"][0]["message"]["content"]
                parsed = json.loads(raw)
                questions = parsed.get("questions", [])
                if not questions:
                    return {"error": "L'IA n'a pas generee de questions", "raw": raw}
                return {"questions": questions, "count": len(questions)}

        except httpx.TimeoutException:
            logger.error("Timeout lors de l'appel Groq")
            return {"error": "L'IA a mis trop de temps a repondre (timeout)"}
        except json.JSONDecodeError as e:
            logger.error("Erreur de parsing JSON: %s", e)
            return {"error": "Reponse invalide de l'IA", "raw": raw if 'raw' in locals() else None}
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            logger.error("Erreur HTTP %d depuis Groq: %s", status, e)
            if status == 429:
                return {"error": "Service IA temporairement sature. Reessaie dans quelques instants."}
            elif status == 402 or status == 403:
                return {"error": "Cle API IA invalide ou credits epuises."}
            elif status == 413:
                return {"error": "Le contenu fourni est trop long pour l'IA. Reduis le texte ou decoupe-le en plusieurs parties."}
            return {"error": f"Erreur du service IA (HTTP {status}). Reessaie plus tard."}
        except Exception as e:
            logger.exception("Erreur lors de l'appel Groq")
            return {"error": "Erreur inattendue du service IA. Reessaie."}

    def validate_questions(self, questions: list[dict]) -> list[str]:
        """Valider la structure des questions generees."""
        warnings = []
        for i, q in enumerate(questions):
            if "variants" not in q or len(q["variants"]) < 1:
                warnings.append(f"Question {i+1}: pas de variantes")
            if "correct_answer" not in q:
                warnings.append(f"Question {i+1}: pas de reponse")
            if "points" not in q:
                q["points"] = 0
            if "difficulty" not in q:
                q["difficulty"] = "medium"
            if "exercise_type" not in q:
                q["exercise_type"] = "open"
            if "title" not in q:
                q["title"] = f"Question {i+1}"
            if "instructions" not in q:
                q["instructions"] = ""
            if q.get("exercise_type") == "code" and "language" not in q:
                q["language"] = "python"
                warnings.append(f"Question {i+1}: code sans language, defaut python")
        return warnings
