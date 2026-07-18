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

    # Post-traitement : détection de code pour les exercices marqués "open"
    # qui contiennent du code sans les triple backticks
    for ex in exercises:
        if ex.get("exercise_type") == "open":
            content = ex.get("content", "")
            if is_likely_code(content):
                ex["exercise_type"] = "code"
                ex["language"] = detect_language(content)

    # Si aucun exercice détecté, on crée un seul exercice avec tout le contenu
    if not exercises:
        ex_type = "code" if is_likely_code(raw) else "open"
        exercises.append({
            "exercise_id": 1,
            "title": "Exercice unique",
            "exercise_type": ex_type,
            "content": raw,
            "points": 10,
        })
        if ex_type == "code":
            exercises[0]["language"] = detect_language(raw)

    # Réattribuer les ID séquentiellement
    for i, ex in enumerate(exercises):
        ex["exercise_id"] = i + 1
        ex["instructions"] = ""
        if "exercise_type" not in ex:
            ex["exercise_type"] = "open"

    return exercises


# Signature heuristiques de langages de programmation
CODE_PATTERNS = {
    "python": [
        r'\bdef\s+\w+\s*\(', r'\bclass\s+\w+', r'\bimport\s+\w+', r'\bfrom\s+\w+\s+import',
        r'\bprint\s*\(', r'\bif\s+__name__\s*==', r'\breturn\s+\w+', r'\bfor\s+\w+\s+in\s+',
        r'\bwhile\s+\w+\s*:', r'\btry\s*:', r'\bexcept\s+\w+\s*:', r'\bwith\s+\w+\s+as\s+',
        r'\basync\s+def\s+', r'\bawait\s+\w+', r'lambda\s+\w+\s*:',
        r'\bif\s+\w+\s*:', r'\belif\s+\w+\s*:', r'\belse\s*:', r'\braise\s+\w+',
    ],
    "javascript": [
        r'\bfunction\s+\w+\s*\(', r'\bconst\s+\w+\s*=', r'\blet\s+\w+\s*=', r'\bvar\s+\w+\s*=',
        r'\bconsole\.\w+', r'\bexport\s+(default\s+)?(function|const|class)',
        r'\bimport\s+.*\s+from\s+', r'\barrow\s*=>', r'=>\s*\{',
        r'\bdocument\.\w+', r'\bwindow\.\w+', r'\baddEventListener\s*\(',
        r'\bPromise\s*\(', r'\basync\s+function', r'\bawait\s+\w+',
        r'\brequire\s*\(', r'module\.exports',
    ],
    "java": [
        r'\bpublic\s+(static\s+)?(void|int|String|boolean|double|float|long)\s+\w+\s*\(',
        r'\bclass\s+\w+\s*\{', r'\binterface\s+\w+', r'\bSystem\.out\.',
        r'\bprivate\s+\w+', r'\bprotected\s+\w+', r'\bimport\s+java\.',
        r'@Override', r'@Test', r'@GetMapping', r'@PostMapping',
        r'\bnew\s+\w+\(\)', r'\bnull\b', r'\btrue\b', r'\bfalse\b',
        r'\bString\[\]', r'\bpublic\s+class',
    ],
    "cpp": [
        r'#include\s*<', r'#define\s+\w+', r'int\s+main\s*\(', r'std::',
        r'cout\s*<<', r'cin\s*>>', r'printf\s*\(', r'scanf\s*\(',
        r'\btemplate\s*<', r'using\s+namespace', r'#pragma\s+',
        r'->\s*\w+\s*\(', r'&\s*\w+\s*=',
    ],
    "sql": [
        r'\bSELECT\b.*\bFROM\b', r'\bINSERT\s+INTO\b', r'\bCREATE\s+TABLE\b',
        r'\bALTER\s+TABLE\b', r'\bDROP\s+TABLE\b', r'\bJOIN\s+\w+\s+ON\b',
        r'\bWHERE\b.*\b=\b', r'\bGROUP\s+BY\b', r'\bORDER\s+BY\b',
        r'\bHAVING\b', r'\bUNION\b', r'\bUPDATE\s+\w+\s+SET\b',
        r'\bDELETE\s+FROM\b', r'\bCOUNT\s*\(', r'\bSUM\s*\(',
    ],
    "go": [
        r'\bfunc\s+\w+\s*\(', r'\bpackage\s+\w+', r'\bimport\s*\(',
        r'\bdefer\s+\w+', r'\bgo\s+\w+', r'\bchan\s+\w+',
        r'\berror\b', r'\bnil\b',
    ],
    "rust": [
        r'\bfn\s+\w+\s*\(', r'\blet\s+mut\s+\w+', r'\bimpl\s+\w+',
        r'\bstruct\s+\w+', r'\benum\s+\w+', r'\bmatch\s+\w+\s*\{',
        r'\bprintln!\s*\(', r'\bunsafe\s*\{',
    ],
}


def is_likely_code(text: str) -> bool:
    """Détection heuristique : le texte ressemble-t-il à du code ?

    Parcourt toutes les signatures de langages connus.
    Retourne True si suffisamment d'indicateurs sont trouvés.
    """
    if not text.strip():
        return False
    lines = text.strip().split("\n")
    if len(lines) < 2:
        return False

    code_indicators = 0
    total_lines = len(lines)

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "//", "/*", "*", "--")):
            # Les commentaires sont un indicateur de code
            if stripped and stripped[0] in ("#", "/", "-", "*"):
                code_indicators += 0.5
            continue

        # Vérifier tous les patterns de tous les langages
        for lang, patterns in CODE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, stripped, re.IGNORECASE):
                    code_indicators += 1
                    break  # Un seul pattern par langage compte

        # Indicateurs génériques
        if stripped.endswith(("{", "}")):
            code_indicators += 0.3
        if stripped.endswith(";") and len(stripped) > 5:
            code_indicators += 0.5
        if "(" in stripped and ")" in stripped and ("{" in stripped or ";" in stripped):
            code_indicators += 0.5
        if stripped.startswith("for") or stripped.startswith("while"):
            code_indicators += 0.5
        if "=" in stripped and ("+" in stripped or "-" in stripped or "*" in stripped):
            code_indicators += 0.3
        if stripped.count(" ") < 3 and len(stripped) > 30:
            # Ligne longue sans espaces = code minifié ou expression complexe
            code_indicators += 0.3

    # Normaliser : il faut au moins 2 indicateurs significatifs
    # ou un ratio d'indicateurs par ligne suffisant
    threshold = 2.0 if total_lines < 10 else max(2.0, total_lines * 0.15)
    return code_indicators >= threshold


def detect_language(text: str) -> str:
    """Détecte le langage de programmation le plus probable dans le texte.

    Retourne le nom du langage (python, javascript, java, cpp, sql, go, rust)
    ou 'python' par défaut si aucun pattern ne correspond clairement.
    """
    if not text.strip():
        return "python"

    scores: dict[str, float] = {}
    for line in text.strip().split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        for lang, patterns in CODE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, stripped, re.IGNORECASE):
                    scores[lang] = scores.get(lang, 0) + 1.5
                    break  # Un seul match par langage par ligne

    if scores:
        best = max(scores, key=scores.get)
        return best
    return "python"
