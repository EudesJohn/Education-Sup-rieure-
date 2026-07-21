"""Service de generation d'exercices par IA a partir de contenu pedagogique.

Utilise Groq API (modele 70B) pour produire des questions avec variantes.
Support multi-type : qcm, open, code, mixed.
Inclut retry, validation stricte, et redistribution des points.
"""

import json
import logging
import re
from typing import Optional

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompts système avec exemples concrets pour chaque type d'exercice.
# Le format .format() est utilisé sur system_prompt ; les doubles accolades
# {{}} échappent les accolades littérales dans le JSON d'exemple.
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_QCM = """Tu generes des QCM a partir d'un contenu pedagogique.

REGLES :
- Chaque question a EXACTEMENT 4 choix : A), B), C), D).
- correct_answer = lettre majuscule seule (ex: "A").
- Les 3 autres choix doivent etre des pieges pedagogiques plausibles.
- 4 a 6 variantes UNIQUES : formulation, contexte, ordre des choix differents.
- Chaque variante a "content" = enonce variant, "data_overrides" = {"choices": ["A) ...","B) ...","C) ...","D) ..."]}.

EXEMPLE DE QUESTION QCM :
{
  "title": "Structures de controle en Python",
  "subject": "Informatique",
  "difficulty": "easy",
  "instructions": "Quelle instruction permet de repeter un bloc tant qu'une condition est vraie ?",
  "points": 0,
  "exercise_type": "qcm",
  "correct_answer": "B",
  "variants": [
    {
      "variant_order": 0,
      "content": "Quelle instruction permet de repeter un bloc tant qu'une condition est vraie ?",
      "data_overrides": {
        "choices": ["A) for", "B) while", "C) if", "D) switch"]
      }
    },
    {
      "variant_order": 1,
      "content": "Quel mot-cle Python cree une boucle a condition d'arret ?",
      "data_overrides": {
        "choices": ["A) for", "B) loop", "C) while", "D) repeat"]
      }
    }
  ]
}"""

SYSTEM_PROMPT_OPEN = """Tu generes des questions ouvertes (redaction) a partir d'un contenu.

REGLES :
- Question precise qui guide la reflexion de l'etudiant.
- correct_answer = elements de reponse attendus (bareme indicatif).
- 4 a 5 variantes : formulations, angles, contextes differents.
- Ne pas utiliser le format QCM (pas de choix A/B/C/D).

EXEMPLE DE QUESTION OUVERTE :
{
  "title": "Algorithmes de tri",
  "subject": "Informatique",
  "difficulty": "medium",
  "instructions": "Comparez les complexites temporelles du tri fusion et du tri bulle.",
  "points": 0,
  "exercise_type": "open",
  "correct_answer": "Tri fusion : O(n log n) dans tous les cas. Tri bulle : O(n^2) pire cas, O(n) meilleur cas.",
  "variants": [
    {
      "variant_order": 0,
      "content": "Comparez les complexites temporelles du tri fusion et du tri bulle.",
      "data_overrides": {}
    },
    {
      "variant_order": 1,
      "content": "Expliquez pourquoi le tri rapide est souvent plus performant que le tri par insertion.",
      "data_overrides": {}
    }
  ]
}"""

SYSTEM_PROMPT_CODE = """Tu generes des exercices de programmation.

REGLES :
- Enonce clair avec contraintes et un ou deux exemples.
- correct_answer = solution de reference (code complet).
- language = python|javascript|java|cpp|sql.
- 4 a 5 variantes : enonce, donnees, contraintes differents.
- data_overrides = {"test_cases": [{"input": "...", "expected_output": "..."}]}

EXEMPLE D'EXERCICE CODE :
{
  "title": "Somme des pairs",
  "subject": "Programmation",
  "difficulty": "easy",
  "instructions": "Ecrivez une fonction qui calcule la somme des nombres pairs d'une liste.",
  "points": 0,
  "exercise_type": "code",
  "correct_answer": "def somme_pairs(liste):\n    return sum(x for x in liste if x % 2 == 0)",
  "language": "python",
  "variants": [
    {
      "variant_order": 0,
      "content": "Ecrivez une fonction qui calcule la somme des nombres pairs d'une liste.",
      "data_overrides": {
        "test_cases": [
          {"input": "somme_pairs([1,2,3,4,5])", "expected_output": "6"},
          {"input": "somme_pairs([])", "expected_output": "0"}
        ]
      }
    }
  ]
}"""


def _build_system_prompt(exercise_type: str) -> str:
    """Construit le prompt systeme avec exemple selon le type d'exercice."""
    base = (
        "Tu es un professeur expert en pedagogie. "
        "Genere EXACTEMENT {num_questions} questions au format JSON. "
        "Les questions sont notees sur {total_score} points. "
        "Chaque question a points=0 (la redistribution est automatique).\n\n"
    )
    type_rules = {
        "qcm": SYSTEM_PROMPT_QCM,
        "open": SYSTEM_PROMPT_OPEN,
        "code": SYSTEM_PROMPT_CODE,
    }
    if exercise_type in type_rules:
        body = type_rules[exercise_type]
    else:
        # mixed : melange equilibre de QCM + ouvert + code
        body = (
            "GENERE UN MELANGE EQUILIBRE de types : environ 1/3 QCM, 1/3 questions ouvertes, "
            "1/3 exercices de code (si le contenu s'y prete).\n"
            "Chaque question a 'exercise_type': 'qcm' | 'open' | 'code'.\n"
            "Respecte les regles specifiques de chaque type.\n\n"
            + SYSTEM_PROMPT_QCM + "\n" + SYSTEM_PROMPT_OPEN + "\n" + SYSTEM_PROMPT_CODE
        )

    output_format = """
FORMAT DE SORTIE (JSON uniquement — pas de texte avant ni apres) :
{"questions": [
  {
    "title": "Titre court et descriptif",
    "subject": "Matiere",
    "difficulty": "easy|medium|hard",
    "instructions": "Enonce complet de la question",
    "points": 0,
    "exercise_type": "qcm|open|code",
    "correct_answer": "Reponse attendue (lettre pour QCM, texte pour open, code pour code)",
    "language": "python|javascript|java|cpp|sql|null",
    "variants": [
      {
        "variant_order": 0,
        "content": "Enonce de la variante 1",
        "data_overrides": { "choices": [...] ou "test_cases": [...] }
      }
    ]
  }
]}
IMPORTANT : Ne genere que le JSON. Pas de texte avant, pas de texte apres."""
    return base + body + output_format


class QCMGenerator:
    """Genere des exercices avec variantes via Groq API."""

    GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
    MAX_CONTENT_CHARS = 8000  # Augmente la limite pour les documents longs
    MAX_RETRIES = 2           # Nombre de tentatives en cas de format invalide
    MIN_VARIANTS = 3          # Nombre minimum de variantes requis
    ACCEPTED_LANGUAGES = {"python", "javascript", "java", "cpp", "sql", "go", "rust"}
    QCM_LETTERS = {"A", "B", "C", "D"}

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.GROQ_API_KEY
        # Utilise le modele 70B de la config (comme le service de correction)
        self.model = settings.GROQ_MODEL  # "llama-3.3-70b-versatile"
        self.max_tokens = settings.GROQ_MAX_TOKENS
        # Temperature basse pour respect strict du format
        self.temperature = 0.2

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

        system_prompt = _build_system_prompt(exercise_type)

        # Remplacer les placeholders
        system_prompt = system_prompt.format(
            total_score=total_score,
            num_questions=num_questions,
            exercise_type=exercise_type,
        )

        # Tronquer le contenu si necessaire
        if len(content) > self.MAX_CONTENT_CHARS:
            logger.warning(
                "Contenu tronque de %d a %d caracteres",
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

        # Tentatives avec retry
        last_error = None
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                result = await self._call_groq(system_prompt, user_prompt, attempt)
                if "error" in result:
                    last_error = result["error"]
                    continue

                questions = result.get("questions", [])
                if not questions:
                    last_error = "L'IA n'a genere aucune question"
                    continue

                # Valider le nombre de questions
                if len(questions) != num_questions:
                    logger.warning(
                        "Nombre de questions incorrect : demande=%d, recu=%d (tentative %d)",
                        num_questions, len(questions), attempt + 1,
                    )

                # Valider la structure de chaque question
                validation_errors = self._validate_questions_strict(questions, exercise_type)
                if validation_errors:
                    last_error = "; ".join(validation_errors[:3])
                    logger.warning(
                        "Validation echouee (tentative %d) : %s",
                        attempt + 1, last_error,
                    )
                    # Si la validation est trop stricte, on accepte avec des warnings
                    # plutot que de rejeter completement
                    if attempt < self.MAX_RETRIES:
                        continue

                warnings = self._validate_questions_soft(questions)
                return {"questions": questions, "count": len(questions), "warnings": warnings}

            except httpx.TimeoutException:
                last_error = "L'IA a mis trop de temps a repondre (timeout)"
                logger.warning("Timeout (tentative %d)", attempt + 1)
                continue
            except json.JSONDecodeError as e:
                last_error = f"Reponse JSON invalide : {e}"
                logger.warning("JSON invalide (tentative %d): %s", attempt + 1, e)
                continue
            except Exception as e:
                logger.exception("Erreur inattendue (tentative %d)", attempt + 1)
                last_error = f"Erreur inattendue : {str(e)}"
                if attempt >= self.MAX_RETRIES:
                    break
                continue

        return {"error": last_error or "Echec de la generation apres plusieurs tentatives"}

    async def _call_groq(
        self, system_prompt: str, user_prompt: str, attempt: int = 0
    ) -> dict:
        """Appelle l'API Groq avec gestion d'erreur."""
        temperature = max(0.1, self.temperature - attempt * 0.05)  # Baisse progressivement

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
                    "temperature": temperature,
                    "max_tokens": self.max_tokens,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            data = response.json()
            # Securiser l'acces a la reponse de l'API Groq
            choices = data.get("choices")
            if not choices:
                error_data = data.get("error", {})
                error_msg = error_data.get("message", str(data)[:200]) if isinstance(error_data, dict) else str(data)[:200]
                return {"error": f"API Groq: {error_msg}"}
            message = choices[0].get("message", {})
            raw = message.get("content", "")
            if not raw:
                return {"error": "Reponse vide de l'API Groq"}
            return json.loads(raw)

    def _validate_questions_strict(
        self, questions: list[dict], exercise_type: str
    ) -> list[str]:
        """Validation stricte : rejette les questions mal formees.

        Retourne une liste d'erreurs. Vide = tout est valide.
        """
        errors = []
        for i, q in enumerate(questions):
            n = i + 1

            # Champs obligatoires
            for field in ("title", "instructions", "exercise_type", "correct_answer"):
                if not q.get(field):
                    errors.append(f"Question {n}: champ '{field}' manquant")
                    continue

            # Validation du type
            ex_type = q.get("exercise_type", "")
            if ex_type not in ("qcm", "open", "code"):
                errors.append(f"Question {n}: exercise_type invalide '{ex_type}'")

            # Validation QCM : correct_answer doit etre une lettre A/B/C/D
            if ex_type == "qcm":
                answer = q.get("correct_answer", "").strip().upper()
                if answer not in self.QCM_LETTERS:
                    errors.append(
                        f"Question {n}: correct_answer doit etre A, B, C ou D (recu: '{answer}')"
                    )

            # Validation code : language requis
            if ex_type == "code":
                lang = q.get("language", "").lower()
                if not lang:
                    errors.append(f"Question {n}: champ 'language' requis pour le type 'code'")
                elif lang not in self.ACCEPTED_LANGUAGES:
                    errors.append(
                        f"Question {n}: language '{lang}' non supporte "
                        f"(acceptes: {', '.join(sorted(self.ACCEPTED_LANGUAGES))})"
                    )

            # Validation des variantes
            variants = q.get("variants", [])
            if len(variants) < self.MIN_VARIANTS:
                errors.append(
                    f"Question {n}: minimum {self.MIN_VARIANTS} variantes requises, "
                    f"recu: {len(variants)}"
                )

            # Chaque variante doit avoir content et les bons champs
            for j, v in enumerate(variants):
                if not v.get("content", "").strip():
                    errors.append(f"Question {n}, variante {j+1}: 'content' vide")

            # Validation QCM : data_overrides doit contenir choices
            if ex_type == "qcm":
                for j, v in enumerate(variants):
                    overrides = v.get("data_overrides") or {}
                    choices = overrides.get("choices") if isinstance(overrides, dict) else None
                    if not choices or len(choices) != 4:
                        errors.append(
                            f"Question {n}, variante {j+1}: doit avoir 4 choix (A-D)"
                        )

        return errors

    def _validate_questions_soft(self, questions: list[dict]) -> list[str]:
        """Validation souple : retourne des warnings sans bloquer."""
        warnings = []
        for i, q in enumerate(questions):
            if "variants" not in q or len(q["variants"]) < 1:
                warnings.append(f"Question {i+1}: pas de variantes")
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
