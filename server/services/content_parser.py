"""Analyse et structuration du contenu d'épreuve.

Permet de détecter automatiquement les exercices, les blocs de code,
et de produire un JSON structuré à partir d'un texte brut (mode partagé).
"""

import re
import json
from typing import Any


def parse_exam_content(raw: str) -> list[dict[str, Any]]:
    """Analyse un texte d'épreuve et retourne une liste structurée d'exercices.

    Détection :
    - Séparation par numéros (1., 2., …) ou titres Markdown (###)
    - Blocs de code entre ``` (délimitent un exercice de type 'code')
    - Texte libre → type 'open'
    """
    lines = raw.split("\n")
    exercises: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    in_code_block = False
    code_buffer: list[str] = []
    text_buffer: list[str] = []
    exercise_counter = 0
    pending_title: str | None = None

    # Patterns pour détecter un nouvel exercice
    numbered_pattern = re.compile(r'^\s*(?:(\d+)[.)]|-\s)\s*(.*)')
    heading_pattern = re.compile(r'^#{1,4}\s+(.*)')

    def _flush_exercises():
        nonlocal current, text_buffer, code_buffer, pending_title
        if text_buffer or code_buffer:
            content = "\n".join(text_buffer).strip()
            code = "\n".join(code_buffer).strip()
            if content or code:
                if not current:
                    current = {"exercise_id": 0, "title": pending_title or "", "exercise_type": "open", "content": ""}
                if code:
                    current["exercise_type"] = "code"
                    code_text = code
                    if content:
                        code_text = content + "\n\n```\n" + code + "\n```"
                    current["content"] = code_text
                else:
                    current["content"] = content
                exercises.append(current)

        text_buffer = []
        code_buffer = []
        pending_title = None

    for line in lines:
        stripped = line.strip()

        # Gestion des blocs de code
        if stripped.startswith("```"):
            if in_code_block:
                in_code_block = False
                # Le bloc de code termine l'exercice en cours
                _flush_exercises()
                current = None
            else:
                in_code_block = True
                # Avant le bloc, on avait du texte → c'est l'énoncé
                _flush_exercises()
                current = None
            continue

        if in_code_block:
            code_buffer.append(line)
            continue

        # Détection d'un titre/nouvel exercice
        heading_match = heading_pattern.match(stripped)
        if heading_match:
            _flush_exercises()
            exercise_counter += 1
            title = heading_match.group(1).strip()
            current = {
                "exercise_id": exercise_counter,
                "title": title,
                "exercise_type": "open",
                "content": "",
                "points": 10,
            }
            pending_title = None
            continue

        numbered_match = numbered_pattern.match(stripped)
        if numbered_match and (not text_buffer or len(text_buffer) <= 2):
            num = int(numbered_match.group(1)) if numbered_match.group(1) else exercise_counter + 1
            rest = numbered_match.group(2).strip()
            # Si on a déjà du contenu, c'est la fin de l'exercice précédent
            if text_buffer and current:
                _flush_exercises()
            exercise_counter = num
            current = {
                "exercise_id": exercise_counter,
                "title": rest or f"Question {exercise_counter}",
                "exercise_type": "open",
                "content": "",
                "points": 10,
            }
            if rest:
                pending_title = rest
            continue

        # Ligne normale → on accumule
        # Mais d'abord vérifier si on peut extraire un titre depuis une ligne en début
        if not text_buffer and not current and stripped and not stripped.startswith(("#", "//")):
            pass  # La première ligne significative sera le contexte

        text_buffer.append(line)

    # Dernier flush
    _flush_exercises()

    # Si aucun exercice détecté, on crée un seul exercice avec tout le contenu
    if not exercises:
        exercises.append({
            "exercise_id": 1,
            "title": "Exercice unique",
            "exercise_type": "open",
            "content": raw,
            "points": 10,
        })

    # Réattribuer les ID séquentiellement
    for i, ex in enumerate(exercises):
        ex["exercise_id"] = i + 1
        ex["instructions"] = ""
        if "exercise_type" not in ex:
            ex["exercise_type"] = "open"

    return exercises


def is_likely_code(text: str) -> bool:
    """Détection heuristique : le texte ressemble-t-il à du code ?"""
    if not text.strip():
        return False
    lines = text.strip().split("\n")
    if len(lines) < 2:
        return False
    code_indicators = 0
    for line in lines:
        stripped = line.strip()
        if any(kw in stripped for kw in ("def ", "class ", "import ", "from ", "return ", "if ", "elif ", "else:", "for ", "while ", "try:", "except", "with ", "async ", "await ")):
            code_indicators += 1
        if stripped.endswith(":") and not stripped.startswith("#"):
            code_indicators += 0.5
        if "(" in stripped and ")" in stripped and ("{" in stripped or ";" in stripped):
            code_indicators += 1
        if stripped.startswith("//") or stripped.startswith("#"):
            code_indicators += 0.5
    return code_indicators >= 2
