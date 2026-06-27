"""Service d'exécution de code via Piston API (https://github.com/engineer-man/piston).

Utilisé en production (Vercel) où les compilateurs C, C++, Java ne sont pas installés.
Fonctionne aussi pour Python, JavaScript et 50+ langages.

API publique gratuite : https://emkc.org/api/v2/piston
Aucune clé API requise — limites : ~5 req/s, usage raisonnable.

⚠️  Le code étudiant est envoyé à un service tiers (emkc.org).
"""

import asyncio
import logging
import time
from typing import Any, Optional

import httpx

from core.config import get_settings
from services.shared_executor import (
    MAX_CODE_SIZE,
    MAX_TEST_CASES,
    TOTAL_TIMEOUT_SECONDS,
    make_test_result,
    build_timeout_skip,
    detect_global_system_error,
)

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

# Erreurs système Piston — ne pas continuer les tests suivants si rencontrées
_SYSTEM_ERROR_SIGNALS = {"SIGKILL", "SIGTERM", "SIGSEGV"}


# URLs autorisées pour l'API Piston
_ALLOWED_PISTON_DOMAINS = {"emkc.org", "piston.codex.repl.it"}


class PistonExecutionError(Exception):
    """Erreur lors de l'exécution via Piston API."""
    pass


class PistonExecutor:
    """Exécute du code via l'API Piston (asynchrone).

    Utilise l'API publique gratuite (https://emkc.org/api/v2/piston)
    comme backend d'exécution. Supporte 50+ langages.

    Tous les appels HTTP sont asynchrones — n'appelle pas httpx.AsyncClient
    en dehors d'un event loop.
    """

    def __init__(self, api_url: str | None = None, timeout: int | None = None):
        settings = get_settings()
        self.api_url = (api_url or settings.PISTON_API_URL).rstrip("/")
        self.timeout = timeout or settings.PISTON_TIMEOUT

        # Validation du domaine Piston (anti-SSRF)
        self._validate_piston_url()

    @staticmethod
    def _validate_piston_url(url: str | None = None, strict: bool = True) -> None:
        """Valide que l'URL Piston pointe vers un domaine autorisé.

        Vérification anti-SSRF : empêche la redirection des requêtes
        vers des services internes via une mauvaise configuration.
        """
        target = url or get_settings().PISTON_API_URL
        if not strict:
            return
        from urllib.parse import urlparse
        parsed = urlparse(target)
        domain = parsed.hostname or ""
        # Vérifier que le domaine correspond à un domaine autorisé
        allowed = _ALLOWED_PISTON_DOMAINS
        if not any(domain == d or domain.endswith("." + d) for d in allowed):
            logger.warning(
                "Domaine Piston non standard : %s. "
                "Domaines autorisés : %s",
                domain, ", ".join(sorted(allowed)),
            )

    def _resolve_language(self, language: str) -> tuple[str, str]:
        """Convertit le nom de langage PEAN en (nom Piston, version)."""
        lang = language.lower()
        if lang not in LANGUAGE_MAP:
            raise PistonExecutionError(
                f"Langage non configuré dans PEAN : '{lang}'. "
                f"Supportés : {', '.join(sorted(LANGUAGE_MAP.keys()))}"
            )
        return LANGUAGE_MAP[lang]

    async def _post_request(
        self,
        client: httpx.AsyncClient,
        payload: dict,
    ) -> httpx.Response:
        """POST vers Piston avec retry sur 429 (rate limiting)."""
        max_retries = 2
        for attempt in range(max_retries + 1):
            resp = await client.post(
                f"{self.api_url}/execute",
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code != 429:
                return resp
            # Rate limited — backoff exponentiel avant réessai
            if attempt < max_retries:
                wait = 1.0 * (attempt + 1)
                logger.warning(
                    "Rate limit Piston (429), tentative %d/%d, attente %.1fs",
                    attempt + 1, max_retries, wait,
                )
                await asyncio.sleep(wait)
        return resp  # Dernière réponse 429 après épuisement des retry

    @staticmethod
    def _safe_float(value: Any, default: float = 0.0) -> float:
        """Convertit une valeur en float, retourne default en cas d'échec."""
        try:
            return float(value) if value is not None else default
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _validate_code_size(code: str) -> None:
        """Vérifie que le code source ne dépasse pas la limite."""
        if len(code) > MAX_CODE_SIZE:
            raise PistonExecutionError(
                f"Code source trop volumineux ({len(code)} caractères, "
                f"maximum {MAX_CODE_SIZE})."
            )

    async def execute(
        self,
        code: str,
        language: str,
        stdin: str = "",
    ) -> dict[str, Any]:
        """Exécute du code via Piston API (asynchrone).

        Args:
            code: Le code source à exécuter.
            language: Langage de programmation (python, java, cpp, c, etc.)
            stdin: Entrée standard.

        Retourne:
            dict avec stdout, stderr, exit_code, time_seconds, error
        """
        self._validate_code_size(code)
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
            # Les langages compilés exécutent compile PUIS run séquentiellement
            # Le timeout httpx doit couvrir les deux phases
            "compile_timeout": self.timeout * 1000,
            "run_timeout": self.timeout * 1000,
        }

        # Timeout httpx séparé : connect court (10s), read long (couvre compile+run)
        timeout_cfg = httpx.Timeout(
            connect=10.0,
            read=self.timeout * 2 + 10,
            write=10.0,
        )

        try:
            async with httpx.AsyncClient(timeout=timeout_cfg) as client:
                resp = await self._post_request(client, payload)

            if resp.status_code == 429:
                return {
                    "stdout": "",
                    "stderr": "",
                    "exit_code": -1,
                    "time_seconds": 0,
                    "error": (
                        "Service d'exécution temporairement saturé. "
                        "Réessaie dans quelques instants."
                    ),
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

            # Extraire le timing de la réponse Piston (avec conversion safe)
            compile_time = self._safe_float(
                (data.get("compile") or {}).get("time")
            )
            run_time = self._safe_float(run.get("time"))
            total_time = round(compile_time + run_time, 3)

            # Timeout détecté par Piston (SIGKILL suffit, exit_code facultatif)
            if signal == "SIGKILL":
                return {
                    "stdout": stdout,
                    "stderr": (
                        stderr
                        or output
                        or "Temps d'exécution dépassé"
                    ),
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

            # Compilation réussie — transmettre les warnings
            compile_warnings = ""
            if compile_data and compile_data.get("code", 0) == 0:
                warn_stderr = compile_data.get("stderr", "").strip()
                warn_stdout = compile_data.get("stdout", "").strip()
                if warn_stderr or warn_stdout:
                    compile_warnings = (
                        "[Avertissements de compilation]\n"
                        + (warn_stderr or warn_stdout)
                    )

            # Si exit_code != 0, stderr contient l'erreur
            error = None
            if exit_code != 0:
                error = stderr or output or f"Process exited with code {exit_code}"

            # Préfixer stderr avec les warnings de compilation si présents
            final_stderr = stderr
            if compile_warnings:
                final_stderr = (
                    compile_warnings
                    + ("\n" + stderr if stderr else "")
                )

            return {
                "stdout": stdout,
                "stderr": final_stderr,
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
        except PistonExecutionError:
            raise  # Propage les erreurs métier (langage non supporté, code trop long)
        except Exception as e:
            logger.exception("Erreur inattendue Piston API pour %s", language)
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": 0,
                "error": f"Erreur de communication avec le service d'exécution : {e}",
            }

    async def execute_with_test_cases(
        self,
        code: str,
        language: str,
        test_cases: list[dict],
    ) -> dict[str, Any]:
        """Exécute le code contre des cas de test via Piston API.

        Note: Piston ne supporte pas la compilation unique + exécutions multiples
        comme le fait l'exécuteur local. Chaque cas de test est envoyé séparément.
        Un timeout global (wall-clock) TOTAL_TIMEOUT_SECONDS protège contre
        les dépassements Vercel.

        Args:
            code: Le code source.
            language: Le langage de programmation.
            test_cases: Liste de dicts avec 'input' et 'expected_output'.

        Retourne:
            dict avec passed, total, results[], execution_time
        """
        self._validate_code_size(code)
        results = []
        passed_count = 0
        total_time = 0.0
        max_test_cases = min(len(test_cases), MAX_TEST_CASES)
        wall_start = time.monotonic()
        system_failure = False  # Si True, tous les tests suivants sont ignorés

        for i, tc in enumerate(test_cases[:max_test_cases]):
            # Vérifier le timeout wall-clock avant chaque test
            if time.monotonic() - wall_start >= TOTAL_TIMEOUT_SECONDS:
                results.append(make_test_result(
                    description=tc.get("description", f"Test #{i + 1}"),
                    passed=False,
                    input_val=tc.get("input", ""),
                    expected=tc.get("expected_output", ""),
                    actual_output="",
                    error="Temps total d'exécution dépassé — tests suivants ignorés",
                ))
                continue

            # Early-abort : si Piston est clairement down, ne pas continuer
            if system_failure:
                results.append(make_test_result(
                    description=tc.get("description", f"Test #{i + 1}"),
                    passed=False,
                    input_val=tc.get("input", ""),
                    expected=tc.get("expected_output", ""),
                    actual_output="",
                    error="Service d'exécution indisponible — tests précédents ont échoué avec une erreur système",
                ))
                continue

            tc_input = tc.get("input", "")
            expected = tc.get("expected_output", "").rstrip()
            description = tc.get("description", f"Test #{i + 1}")

            try:
                output = await self.execute(
                    code=code,
                    language=language,
                    stdin=tc_input,
                )
            except PistonExecutionError as e:
                # Erreur métier (code trop long, langage non supporté) — stoppe tout
                for j in range(i, max_test_cases):
                    tc_error = test_cases[j]
                    results.append(make_test_result(
                        description=tc_error.get("description", f"Test #{j + 1}"),
                        passed=False,
                        input_val=tc_error.get("input", ""),
                        expected=tc_error.get("expected_output", ""),
                        actual_output="",
                        error=str(e),
                    ))
                return {
                    "passed": 0,
                    "total": len(test_cases),
                    "results": results,
                    "execution_time": round(total_time, 3),
                }

            total_time += output.get("time_seconds", 0)

            actual = output.get("stdout", "").rstrip()
            error_out = output.get("error")

            # Détecter une erreur système Piston pour early-abort
            exit_code = output.get("exit_code", 0)
            signal = output.get("signal")
            is_system_error = (
                error_out is not None
                and exit_code == -1
                and (
                    "Timeout" in (error_out or "")
                    or "saturé" in (error_out or "")
                    or "Erreur du service" in (error_out or "")
                    or "Erreur de communication" in (error_out or "")
                    or signal in _SYSTEM_ERROR_SIGNALS
                )
            )
            if is_system_error:
                system_failure = True

            if error_out:
                is_passed = False
                # Préserver stderr/stdout dans actual_output, pas seulement le message d'erreur
                actual_output = (
                    output.get("stderr", "")
                    or output.get("stdout", "")
                    or error_out
                )
            elif exit_code != 0:
                is_passed = False
                actual_output = output["stderr"] or output["stdout"]
            else:
                is_passed = actual == expected
                actual_output = actual

            if is_passed:
                passed_count += 1

            results.append(make_test_result(
                description=description,
                passed=is_passed,
                input_val=tc_input,
                expected=expected,
                actual_output=actual_output,
                error=error_out,
            ))

        # Si des tests ont été ignorés (limite max_test_cases), les signaler
        skipped = build_timeout_skip(test_cases, max_test_cases,
                                      "Test ignoré (maximum 20 tests autorisés)")
        results.extend(skipped)

        # Détecter si toutes les erreurs sont la même cause système
        global_error = detect_global_system_error(
            results, len(test_cases), passed_count,
        )

        return {
            "passed": passed_count,
            "total": len(test_cases),
            "results": results,
            "execution_time": round(total_time, 3),
            "error": global_error,
        }


def should_use_remote(language: str) -> bool:
    """Détermine si un langage nécessite l'exécution distante (Piston).

    Les langages compilés (C, C++, Java, Go, Rust, TypeScript)
    ne sont pas disponibles sur Vercel — ils passent par Piston.
    """
    settings = get_settings()
    if not settings.PISTON_ENABLED:
        return False
    lang = language.lower()
    if lang in REMOTE_ONLY_LANGUAGES:
        return True
    # Sur Vercel (PISTON_ENABLED=True), même Python/JS peuvent passer
    # par Piston si configuré. Le fallback est le CodeExecutor local.
    return False
