"""Service d'exécution de code via Piston API (https://github.com/engineer-man/piston).

Utilisé en production (Vercel) où les compilateurs C, C++, Java ne sont pas installés.
Fonctionne aussi pour Python, JavaScript et 50+ langages.

API publique gratuite : https://emkc.org/api/v2/piston
Aucune clé API requise — limites : ~5 req/s, usage raisonnable.
"""

import logging
from typing import Any, Optional

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)

# Mapping des noms de langage PEAN → Piston
# Format: (piston_language, piston_version)
# Versions épinglées pour éviter les surprises après une mise à jour Piston.
# Mettre à jour périodiquement ou quand un étudiant signale un problème.
LANGUAGE_MAP: dict[str, tuple[str, str]] = {
    "python": ("python", "3.10.0"),
    "javascript": ("javascript", "18.3.0"),
    "typescript": ("typescript", "5.0.3"),
    "java": ("java", "17.0.7"),
    "cpp": ("c++", "12.2.0"),
    "c": ("c", "12.2.0"),
    "go": ("go", "1.20.4"),
    "rust": ("rust", "1.69.0"),
    "php": ("php", "8.2.3"),
    "ruby": ("ruby", "3.2.1"),
    "r": ("r", "4.3.1"),
    "bash": ("bash", "5.2.15"),
    "sqlite": ("sqlite", "3.40.1"),
}

# Langages nécessitant un compilateur (non disponibles sur Vercel en local)
REMOTE_ONLY_LANGUAGES = {"c", "cpp", "java", "go", "rust", "typescript"}

# Temps total maximum pour execute_with_test_cases (évite le timeout Vercel maxDuration)
TOTAL_TIMEOUT_SECONDS = 60


class PistonExecutionError(Exception):
    """Erreur lors de l'exécution via Piston API."""
    pass


class PistonExecutor:
    """Exécute du code via l'API Piston.

    Utilise l'API publique gratuite (https://emkc.org/api/v2/piston)
    comme backend d'exécution. Supporte 50+ langages.
    """

    def __init__(self, api_url: str | None = None, timeout: int | None = None):
        settings = get_settings()
        self.api_url = (api_url or settings.PISTON_API_URL).rstrip("/")
        self.timeout = timeout or settings.PISTON_TIMEOUT

    def _resolve_language(self, language: str) -> tuple[str, str]:
        """Convertit le nom de langage PEAN en (nom Piston, version)."""
        lang = language.lower()
        if lang not in LANGUAGE_MAP:
            raise PistonExecutionError(
                f"Langage non supporté par Piston : '{lang}'. "
                f"Supportés : {', '.join(sorted(LANGUAGE_MAP.keys()))}"
            )
        return LANGUAGE_MAP[lang]

    def execute(
        self,
        code: str,
        language: str,
        stdin: str = "",
    ) -> dict[str, Any]:
        """Exécute du code via Piston API.

        Args:
            code: Le code source à exécuter.
            language: Langage de programmation (python, java, cpp, c, etc.)
            stdin: Entrée standard.

        Retourne:
            dict avec stdout, stderr, exit_code, time_seconds, error
        """
        piston_lang, piston_version = self._resolve_language(language)

        payload = {
            "language": piston_lang,
            "version": piston_version,
            "files": [
                {
                    "name": f"main.{language}",
                    "content": code,
                }
            ],
            "stdin": stdin,
            "args": [],
            "compile_timeout": self.timeout * 1000,
            "run_timeout": self.timeout * 1000,
        }

        try:
            with httpx.Client(timeout=self.timeout + 5) as client:
                resp = client.post(
                    f"{self.api_url}/execute",
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

            if resp.status_code == 429:
                return {
                    "stdout": "",
                    "stderr": "",
                    "exit_code": -1,
                    "time_seconds": 0,
                    "error": "Service d'exécution temporairement saturé. Réessaie dans quelques instants.",
                }

            resp.raise_for_status()
            data = resp.json()

            # Piston renvoie run (et parfois compile)
            run = data.get("run", {})
            stdout = run.get("stdout", "")
            stderr = run.get("stderr", "")
            output = run.get("output", "")
            exit_code = run.get("code", 0)
            signal = run.get("signal")

            # Extraire le timing de la réponse Piston
            compile_time = (data.get("compile") or {}).get("time", 0) or 0
            run_time = run.get("time", 0) or 0
            total_time = round(compile_time + run_time, 3)

            # Timeout détecté par Piston
            if signal == "SIGKILL" and exit_code is None:
                return {
                    "stdout": stdout,
                    "stderr": "Temps d'exécution dépassé",
                    "exit_code": -1,
                    "time_seconds": self.timeout,
                    "error": "Temps d'exécution dépassé",
                }

            # Compilation error
            compile_data = data.get("compile")
            if compile_data and compile_data.get("code", 0) != 0:
                compile_stderr = compile_data.get("stderr", "")
                compile_output = compile_data.get("output", "")
                return {
                    "stdout": compile_data.get("stdout", ""),
                    "stderr": compile_stderr or compile_output or "Erreur de compilation",
                    "exit_code": compile_data.get("code", -1),
                    "time_seconds": compile_time,
                    "error": "Erreur de compilation",
                }

            # Si exit_code != 0, stderr contient l'erreur
            error = None
            if exit_code != 0:
                error = stderr or output or f"Process exited with code {exit_code}"

            return {
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": exit_code,
                "time_seconds": total_time,
                "error": error,
            }

        except httpx.TimeoutException:
            logger.error("Timeout Piston API pour %s", language)
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": self.timeout,
                "error": "Le service d'exécution a mis trop de temps à répondre",
            }
        except httpx.HTTPStatusError as e:
            logger.error("Erreur HTTP %d Piston API: %s", e.response.status_code, e)
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": 0,
                "error": f"Erreur du service d'exécution (HTTP {e.response.status_code})",
            }
        except Exception as e:
            logger.exception("Erreur inattendue Piston API pour %s", language)
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": 0,
                "error": f"Erreur de communication avec le service d'exécution : {e}",
            }

    def execute_with_test_cases(
        self,
        code: str,
        language: str,
        test_cases: list[dict],
    ) -> dict[str, Any]:
        """Exécute le code contre des cas de test via Piston API.

        Note: Piston ne supporte pas la compilation unique + exécutions multiples
        comme le fait l'exécuteur local. Chaque cas de test est envoyé séparément.
        Un timeout global TOTAL_TIMEOUT_SECONDS protège contre les dépassements.

        Args:
            code: Le code source.
            language: Le langage de programmation.
            test_cases: Liste de dicts avec 'input' et 'expected_output'.

        Retourne:
            dict avec passed, total, results[], execution_time
        """
        results = []
        passed_count = 0
        total_time = 0.0
        max_test_cases = min(len(test_cases), 20)  # sécurité : max 20 tests

        for i, tc in enumerate(test_cases[:max_test_cases]):
            # Vérifier le timeout global avant chaque test
            if total_time >= TOTAL_TIMEOUT_SECONDS:
                results.append({
                    "description": tc.get("description", f"Test #{i + 1}"),
                    "passed": False,
                    "input": tc.get("input", ""),
                    "expected_output": tc.get("expected_output", ""),
                    "actual_output": "",
                    "error": "Temps total d'exécution dépassé — tests suivants ignorés",
                })
                continue

            tc_input = tc.get("input", "")
            expected = tc.get("expected_output", "").rstrip()
            description = tc.get("description", f"Test #{i + 1}")

            output = self.execute(
                code=code,
                language=language,
                stdin=tc_input,
            )
            total_time += output.get("time_seconds", 0)

            actual = output.get("stdout", "").rstrip()
            error_out = output.get("error")

            if error_out:
                is_passed = False
                actual_output = error_out
            elif output["exit_code"] != 0:
                is_passed = False
                actual_output = output["stderr"] or output["stdout"]
            else:
                is_passed = actual == expected
                actual_output = actual

            if is_passed:
                passed_count += 1

            results.append({
                "description": description,
                "passed": is_passed,
                "input": tc_input,
                "expected_output": expected,
                "actual_output": actual_output,
                "error": error_out,
            })

        # Si des tests ont été ignorés (limite max_test_cases), les signaler
        for i in range(max_test_cases, len(test_cases)):
            results.append({
                "description": test_cases[i].get("description", f"Test #{i + 1}"),
                "passed": False,
                "input": test_cases[i].get("input", ""),
                "expected_output": test_cases[i].get("expected_output", ""),
                "actual_output": "",
                "error": "Test ignoré (maximum 20 tests autorisés)",
            })

        return {
            "passed": passed_count,
            "total": len(test_cases),
            "results": results,
            "execution_time": round(total_time, 3),
        }


def should_use_remote(language: str) -> bool:
    """Détermine si un langage nécessite l'exécution distante (Piston).

    Les langages compilés (C, C++, Java, Go, Rust, TypeScript)
    ne sont pas disponibles sur Vercel — ils passent par Piston.
    """
    settings = get_settings()
    if not settings.PISTON_ENABLED:
        return False
    return language.lower() in REMOTE_ONLY_LANGUAGES
