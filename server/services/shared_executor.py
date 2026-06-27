"""Helpers partagés entre les exécuteurs de code (CodeExecutor, PistonExecutor).

Centralise la logique de comparaison des résultats de test et la construction
des dicts de résultat, évitant la duplication entre exécuteur local et distant.
"""

import time
from typing import Any


# Limites de sécurité communes aux deux exécuteurs
MAX_CODE_SIZE = 100_000          # Taille max du code source (100 Ko)
MAX_TEST_CASES = 20              # Nombre max de cas de test
TOTAL_TIMEOUT_SECONDS = 60       # Timeout total wall-clock


def make_test_result(
    description: str,
    passed: bool,
    input_val: str,
    expected: str,
    actual_output: str,
    error: str | None = None,
) -> dict[str, Any]:
    """Construit un dict de résultat de test normalisé.

    Utilisé par les deux exécuteurs pour garantir un format identique.
    """
    return {
        "description": description,
        "passed": passed,
        "input": input_val,
        "expected_output": expected,
        "actual_output": actual_output,
        "error": error,
    }


def compare_and_format(
    stdout: str,
    expected_output: str,
    stderr: str = "",
    error: str | None = None,
    exit_code: int = 0,
) -> tuple[bool, str, str | None]:
    """Compare stdout à expected_output et retourne le verdict.

    Applique rstrip() bilatéral pour ignorer les différences de whitespace
    finale (convention standard des plateformes de programmation compétitive).

    Args:
        stdout: La sortie standard réelle.
        expected_output: La sortie attendue (sera rstrippée).
        stderr: La sortie d'erreur réelle (pour fallback actual_output).
        error: Message d'erreur éventuel.
        exit_code: Code de sortie du processus.

    Retourne:
        (is_passed, actual_output, final_error)
    """
    actual = stdout.rstrip()
    expected = expected_output.rstrip()

    if error:
        # Erreur système ou compilation : préserver les détails techniques
        return False, (stderr or stdout or error), error

    if exit_code != 0:
        # Erreur d'exécution runtime
        return False, (stderr or stdout), None

    # Succès : comparer les sorties
    return actual == expected, actual, None


def build_timeout_skip(
    test_cases: list[dict],
    start_index: int,
    message: str = "Temps total d'exécution dépassé — tests suivants ignorés",
) -> list[dict[str, Any]]:
    """Génère les résultats 'ignoré' pour les tests après un timeout.

    Args:
        test_cases: La liste complète des cas de test.
        start_index: Index à partir duquel générer les résultats ignorés.
        message: Message d'erreur à associer.

    Retourne:
        Liste de dicts de résultat pour les tests ignorés.
    """
    results = []
    for i in range(start_index, len(test_cases)):
        tc = test_cases[i]
        results.append(make_test_result(
            description=tc.get("description", f"Test #{i + 1}"),
            passed=False,
            input_val=tc.get("input", ""),
            expected=tc.get("expected_output", ""),
            actual_output="",
            error=message,
        ))
    return results


def detect_global_system_error(
    results: list[dict],
    total: int,
    passed: int,
) -> str | None:
    """Détecte une cause d'erreur système unique partagée par tous les échecs.

    Si tous les tests non-passés ont la même erreur système (Timeout,
    saturation, service down), la retourne comme erreur globale.

    Args:
        results: La liste des résultats de test.
        total: Le nombre total de tests.
        passed: Le nombre de tests réussis.

    Retourne:
        L'erreur globale si détectée, None sinon.
    """
    system_keywords = [
        "Timeout", "saturé", "indisponible",
        "Erreur du service", "Erreur de communication",
    ]
    system_errors = [
        r["error"] for r in results
        if r.get("error") and not r["passed"]
        and any(kw in (r["error"] or "") for kw in system_keywords)
    ]
    if len(system_errors) == (total - passed) and system_errors:
        unique = list(set(system_errors))
        if len(unique) == 1:
            return unique[0]
    return None
