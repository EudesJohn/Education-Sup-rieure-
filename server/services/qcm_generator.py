"""Service de gÃ©nÃ©ration d'exercices par IA Ã  partir de contenu pÃ©dagogique.

Ã€ partir d'un texte (extrait de PDF/Word ou saisi manuellement),
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

# Prompts spÃ©cialisÃ©s par type d'exercice

SYSTEM_PROMPT_QCM = """Tu es un professeur expert en pedagogie. Tu dois generer des questions QCM a partir du contenu fourni. Chaque question doit evaluer la comprehension.

Regles QCM :
- 4 choix de reponses par question (A, B, C, D)
- La bonne reponse doit etre exacte (le champ correct_answer doit contenir uniquement la lettre : A, B, C ou D)
- Les mauvaises reponses doivent etre plausibles (pieges pedagogiques)
- Les questions doivent evaluer la comprehension, pas la memorisation brute
- Pour chaque question, genere 3 variantes avec ordre different des choix

Chaque variante doit avoir :
- le champ 'content' qui contient uniquement l'enonce de la question (sans les choix de reponses).
- le champ 'data_overrides' qui contient les 4 choix de reponses au format JSON : {{ "choices": ["A) ...", "B) ...", "C) ...", "D) ..."] }}"""

SYSTEM_PROMPT_OPEN = """Tu es un professeur expert en pedagogie. Tu dois generer des questions ouvertes (redaction) a partir du contenu fourni. Chaque question doit evaluer la comprehension et la capacite d'analyse.

Regles questions ouvertes :
- Questions qui demandent une reponse redigee (paragraphe, demonstration, analyse)
- La question doit etre precise et guider la reflexion
- Le champ correct_answer doit contenir les elements de reponse attendus (bareme indicatif)
- Pour chaque question, genere 2 variantes : reformulation et angle different

Le champ content de chaque variante contient l'enonce de la question uniquement.
Le champ correct_answer est le corrige indicatif avec les points cles attendus. """

SYSTEM_PROMPT_CODE = """Tu es un professeur expert en programmation. Tu dois generer des exercices de code a partir du contenu fourni. Chaque exercice doit evaluer la capacite a coder.

Regles exercices code :
- Enonce clair avec contraintes precis (entree, sortie, format)
- Un ou deux exemples pour illustrer
- Plusieurs cas de test (entree â†’ sortie attendue)
- DifficultÃ© progressive si plusieurs exercices
- Le champ correct_answer contient une solution de reference
- Le champ language doit etre : python, javascript, java, cpp, ou sql

Pour chaque exercice, genere 2 variantes :
- Variante 0 : version originale
- Variante 1 : version avec donnees modifiees (complexite ou contexte different)

Chaque variante a un champ data_overrides contenant les cas de test :
"data_overrides": {{ "test_cases": [{{"input": "...", "expected_output": "..."}}] }} """


def _build_system_prompt(exercise_type: str) -> str:
    """Construit le prompt systeme en fonction du type d'exercice."""
    base_intro = "Tu es un professeur expert en pedagogie. Tu dois generer des questions a partir du contenu fourni."
    base_rules = """
Chaque question doit evaluer la comprehension, pas la memorisation.
Chaque question a un champ 'difficulty': 'easy' | 'medium' | 'hard'.
Chaque question a des variantes pour limiter la triche entre etudiants.

IMPORTANT - Points :
L'examen est note sur {total_score} avec {num_questions} questions.
Ne t'inquiete pas de la distribution des points, mets points=0 pour chaque question.
Le systeme redistribuera automatiquement les points apres la generation.

IMPORTANT : retourne UNIQUEMENT un JSON valide, pas d'explication.
Format de sortie :
{{
  "questions": [
    {{
      "title": "Titre court",
      "subject": "Matiere detectee",
      "difficulty": "easy|medium|hard",
      "instructions": "Enonce complet de la question",
      "points": {points_per_question},
      "exercise_type": "{exercise_type}",
      "correct_answer": "...",
      "language": "...",  // uniquement pour type code
      "variants": [...]
    }}
  ]
}}
"""
    if exercise_type == "qcm":
        return base_intro + "\n\n" + SYSTEM_PROMPT_QCM + "\n\n" + base_rules
    elif exercise_type == "open":
        return base_intro + "\n\n" + SYSTEM_PROMPT_OPEN + "\n\n" + base_rules
    elif exercise_type == "code":
        return base_intro + "\n\n" + SYSTEM_PROMPT_CODE + "\n\n" + base_rules
    else:  # mixed
        mix_section = """
MIXTE : tu dois generer un melange de TYPES de questions :
- Environ la moitie de questions QCM (choix multiples)
- L'autre moitie de questions ouvertes (redaction)
- Si le contenu est technique, inclus des exercices de code

Adapte les types au contenu pedagogique fourni.
Chaque question precise son type dans 'exercise_type': 'qcm' | 'open' | 'code'.
Pour chaque question de type 'qcm', respecte les regles suivantes :
- Le champ 'content' de ses variantes contient uniquement l'enonce de la question (sans les choix de reponses).
- Le champ 'data_overrides' de ses variantes contient les 4 choix au format JSON : {{ "choices": ["A) ...", "B) ...", "C) ...", "D) ..."] }}
- Le champ correct_answer contient uniquement la lettre : A, B, C ou D.
- Les code ont correct_answer = solution de reference et language = langage.
"""
        return base_intro + "\n\n" + mix_section + "\n\n" + base_rules


class QCMGenerator:
    """Genere des exercices avec variantes via Groq API."""

    GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
    MAX_CONTENT_CHARS = 4000  # Limite pour eviter 413 Payload Too Large de Groq

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        # Modele rapide pour respecter le timeout Vercel (10s par defaut)
        self.model = "llama-3.1-8b-instant"
        self.max_tokens = 4096
        self.temperature = 0.3

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
            return {"error": "GROQ_API_KEY non configurÃ©e - IA dÃ©sactivÃ©e"}

        if exercise_type not in ("qcm", "open", "code", "mixed"):
            exercise_type = "mixed"

        points_per_question = round(total_score / num_questions, 2) if num_questions > 0 else float(total_score)

        system_prompt = _build_system_prompt(exercise_type)

        # Remplacer les placeholders dans le prompt
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
            content = content[:self.MAX_CONTENT_CHARS] + "\n\n[...suite tronquee pour respecter la limite de l'API IA...]"

        type_label = {"qcm": "QCM", "open": "questions ouvertes", "code": "exercices de code", "mixed": "questions variees (QCM + redaction + code)"}

        user_prompt = (
            f"Genere exactement {num_questions} {type_label.get(exercise_type, 'questions')} "
            f"a partir du contenu suivant.\n\n"
            f"---CONTENU PEDAGOGIQUE---\n{content}\n---FIN---\n\n"
            f"Produis {num_questions} questions avec leurs variantes au format JSON."
        )

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
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
                    return {"error": "L'IA n'a pas gÃ©nÃ©rÃ© de questions", "raw": raw}
                # Laisser les points tels quels (le systeme redistribuera)
                # pour garantir que la somme = total_score exactement
                return {"questions": questions, "count": len(questions)}

        except httpx.TimeoutException:
            logger.error("Timeout lors de l'appel Groq pour generation")
            return {"error": "L'IA a mis trop de temps Ã  rÃ©pondre (timeout)"}
        except json.JSONDecodeError as e:
            logger.error("Erreur de parsing JSON: %s", e)
            return {"error": "RÃ©ponse invalide de l'IA", "raw": raw if 'raw' in dir() else None}
        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            logger.error("Erreur HTTP %d depuis Groq: %s", status, e)
            if status == 429:
                return {"error": "Service IA temporairement saturé. Attends quelques instants puis réessaie."}
            elif status == 402 or status == 403:
                return {"error": "Clé API IA invalide ou crédits épuisés. Contacte l'administrateur."}
            elif status == 413:
                return {"error": "Le contenu fourni est trop long pour l'IA. Réduis le texte ou decoupe-le en plusieurs parties."}
            return {"error": f"Erreur du service IA (HTTP {status}). Réessaie plus tard."}
        except Exception as e:
            logger.exception("Erreur lors de l'appel Groq")
            return {"error": "Erreur inattendue du service IA. Réessaie."}

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
                q["exercise_type"] = "open"
            if "title" not in q:
                q["title"] = f"Question {i+1}"
            if "instructions" not in q:
                q["instructions"] = ""
            # Pour les exercices de code, verifier le language
            if q.get("exercise_type") == "code" and "language" not in q:
                q["language"] = "python"
                warnings.append(f"Question {i+1}: code sans language, dÃ©faut python")
        return warnings


