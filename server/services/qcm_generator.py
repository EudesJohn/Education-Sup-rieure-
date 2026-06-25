"""Service de génération de QCM par IA à partir de contenu pédagogique.

À partir d'un texte (extrait de PDF/Word ou saisi manuellement),
utilise Groq API pour produire des questions QCM avec variantes.
"""

import json
import logging
import re
from typing import Optional

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)

# Schéma de la réponse attendue
# {
#   "questions": [
#     {
#       "title": "Question 1",
#       "subject": "Mathematiques",
#       "difficulty": "medium",
#       "instructions": "Quelle est la capitale de la France ?",
#       "points": 10,
#       "exercise_type": "qcm",
#       "correct_answer": "Paris",
#       "variants": [
#         {
#           "variant_order": 0,
#           "content": "Quelle est la capitale de la France ?\nA) Paris\nB) Londres\nC) Berlin\nD) Madrid",
#           "data_overrides": null
#         },
#         ...
#       ]
#     },
#     ...
#   ]
# }


SYSTEM_PROMPT = """Tu es un professeur expert en pedagogie. Tu dois generer des questions QCM
a partir du contenu fourni. Chaque question doit etre precise et evaluer la comprehension.

Pour chaque question, genere 3 variantes differentes :
- Variante 0 : question originale avec ordre aleatoire des reponses
- Variante 1 : question reformulee avec ordre different des reponses
- Variante 2 : question avec exemples/chiffres changes (quand applicable)

Regles :
- Chaque variante doit avoir EXACTEMENT les memes choix de reponses mais dans un ordre different
- La bonne reponse doit toujours etre presente
- Les questions doivent evaluer la comprehension, pas la memorisation
- 4 choix de reponses par question (A, B, C, D)
- Le champ correct_answer doit indiquer la lettre de la bonne reponse (A, B, C ou D)
- Le champ content doit contenir la question + les 4 choix
- Le champ data_overrides peut contenir un JSON avec des surcharges optionnelles ou null

Important : retoune UNIQUEMENT un JSON valide, pas d'explication supplementaire.

Format de sortie :
{
  "questions": [
    {
      "title": "Titre court de la question",
      "subject": "Matiere detectee",
      "difficulty": "easy|medium|hard",
      "instructions": "Enonce complet de la question",
      "points": 10,
      "exercise_type": "qcm",
      "correct_answer": "A|B|C|D",
      "variants": [
        {
          "variant_order": 0,
          "content": "Question ?\nA) Choix 1\nB) Choix 2\nC) Choix 3\nD) Choix 4",
          "data_overrides": null
        },
        {
          "variant_order": 1,
          "content": "Version reformulee ?\nA) Choix 3\nB) Choix 1\nC) Choix 4\nD) Choix 2",
          "data_overrides": null
        },
        {
          "variant_order": 2,
          "content": "Autre version ?\nA) Choix 2\nB) Choix 4\nC) Choix 1\nD) Choix 3",
          "data_overrides": null
        }
      ]
    }
  ]
}
"""


class QCMGenerator:
    """Genere des questions QCM avec variantes via Groq API."""

    GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        self.model = "llama-3.3-70b-versatile"
        self.max_tokens = 8192
        self.temperature = 0.4

    async def generate(self, content: str, num_questions: int = 5) -> dict:
        """Generer des QCM a partir du contenu fourni.

        Args:
            content: Texte du cours / epreuve
            num_questions: Nombre de questions a generer

        Returns:
            dict avec "questions" ou {"error": "..."}
        """
        if not self.api_key:
            return {"error": "GROQ_API_KEY non configurée - IA désactivée"}

        user_prompt = (
            f"Genere exactement {num_questions} questions QCM a partir du contenu suivant.\n\n"
            f"---CONTENU PEDAGOGIQUE---\n{content}\n---FIN---\n\n"
            f"Produis {num_questions} questions avec 3 variantes chacune au format JSON."
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
                            {"role": "system", "content": SYSTEM_PROMPT},
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
                    return {"error": "L'IA n'a pas généré de questions", "raw": raw}
                return {"questions": questions, "count": len(questions)}

        except httpx.TimeoutException:
            logger.error("Timeout lors de l'appel Groq pour generation QCM")
            return {"error": "L'IA a mis trop de temps à répondre (timeout)"}
        except json.JSONDecodeError as e:
            logger.error("Erreur de parsing JSON: %s", e)
            return {"error": "Réponse invalide de l'IA", "raw": raw if 'raw' in dir() else None}
        except Exception as e:
            logger.exception("Erreur lors de l'appel Groq")
            return {"error": str(e)}

    def validate_questions(self, questions: list[dict]) -> list[str]:
        """Valider la structure des questions generees."""
        warnings = []
        for i, q in enumerate(questions):
            if "variants" not in q or len(q["variants"]) < 1:
                warnings.append(f"Question {i+1}: pas de variantes")
            if "correct_answer" not in q:
                warnings.append(f"Question {i+1}: pas de reponse")
            if "points" not in q:
                q["points"] = 10
            if "difficulty" not in q:
                q["difficulty"] = "medium"
            if "exercise_type" not in q:
                q["exercise_type"] = "qcm"
            if "title" not in q:
                q["title"] = f"Question {i+1}"
            if "instructions" not in q:
                q["instructions"] = ""
        return warnings
