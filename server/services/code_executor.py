"""Service d'execution de code pour les examens de programmation.

ATTENTION - Ce service execute du code etudiant arbitraire sur le serveur.

    Mesures de protection appliquées :
      - Répertoire temporaire avec permissions restrictives (0o700)
      - Timeout configurable (settings.CODE_EXECUTION_MAX_TIME)
      - Limitation mémoire via setrlimit (Unix)
      - Abaissement des privilèges → utilisateur ``nobody`` (Unix, si root)
      - Désactivation du réseau via ``unshare(CLONE_NEWNET)`` (Linux)
      - Environnement minimal (PATH seul, pas de variables sensibles)

    ACTIVATION :
      Mettre ENABLE_CODE_EXECUTION=True dans .env (dev local uniquement).
      Désactivé par défaut en production (Vercel). Aucun Docker sandbox
      n'est utilisé — ce service exécute en subprocess direct.

    Pour la PRODUCTION, remplacez par Judge0 ou exécution Docker isolée
    si l'exécution de code étudiant est requise côté serveur.
"""

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

import logging

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

# Temps d'exécution maximum par soumission (en secondes) — depuis settings
MAX_EXECUTION_TIME = get_settings().CODE_EXECUTION_MAX_TIME
# Taille mémoire maximale (en KB) — approximation via "ulimit" sur Unix
MAX_MEMORY_KB = get_settings().CODE_EXECUTION_MAX_MEMORY_MB * 1024  # 256 MB default

# Mapping langage → commandes de compilation et exécution
LANGUAGE_CONFIG: dict[str, dict] = {
    "python": {
        "extension": ".py",
        "run_command": ["{interpreter}", "{file}"],
    },
    "javascript": {
        "extension": ".js",
        "run_command": ["node", "{file}"],
    },
    "typescript": {
        "extension": ".ts",
        "compile_command": ["npx", "tsc", "--outDir", "{outdir}", "{file}"],
        "run_compiled": ["node", "{outfile}"],
    },
    "java": {
        "extension": ".java",
        "compile_command": ["javac", "{file}"],
        "run_command": ["java", "-cp", "{dir}", "{classname}"],
    },
    "cpp": {
        "extension": ".cpp",
        "compile_command": ["g++", "{file}", "-o", "{outfile}", "-std=c++17"],
        "run_command": ["{outfile}"],
    },
    "c": {
        "extension": ".c",
        "compile_command": ["gcc", "{file}", "-o", "{outfile}", "-std=c11"],
        "run_command": ["{outfile}"],
    },
    "go": {
        "extension": ".go",
        "run_command": ["go", "run", "{file}"],
    },
    "rust": {
        "extension": ".rs",
        "compile_command": ["rustc", "{file}", "-o", "{outfile}"],
        "run_command": ["{outfile}"],
    },
    "php": {
        "extension": ".php",
        "run_command": ["php", "{file}"],
    },
    "ruby": {
        "extension": ".rb",
        "run_command": ["ruby", "{file}"],
    },
    "r": {
        "extension": ".R",
        "run_command": ["Rscript", "{file}"],
    },
    "bash": {
        "extension": ".sh",
        "run_command": ["bash", "{file}"],
    },
    "sqlite": {
        "extension": ".sql",
        "run_command": ["sqlite3", ":memory:", "-init", "{file}"],
    },
}


class CodeExecutionError(Exception):
    """Erreur lors de l'exécution du code."""
    pass


class CodeExecutor:
    """Exécute du code étudiant dans un environnement isolé."""

    def __init__(self, max_time: int = MAX_EXECUTION_TIME):
        self.max_time = max_time

    def _build_env(self, workdir: Path) -> dict[str, str]:
        """Construit un environnement minimal sécurisé pour l'exécution.

        N'inclut AUCUNE variable d'environnement du serveur (DB creds,
        tokens API, etc.). Seul PATH est conservé pour trouver les
        compilateurs/interpretes.
        """
        env: dict[str, str] = {
            "PATH": os.environ.get("PATH", "/usr/bin:/usr/local/bin"),
            "TMPDIR": str(workdir),
            "TEMP": str(workdir),
            "TMP": str(workdir),
        }
        # Windows nécessite SYSTEMROOT et COMSPEC
        if os.name == "nt":
            for key in ("SYSTEMROOT", "COMSPEC", "PATHEXT"):
                val = os.environ.get(key)
                if val:
                    env[key] = val
        # Préserver LANG pour l'encodage UTF-8 dans les sous-processus
        lang = os.environ.get("LANG")
        if lang:
            env["LANG"] = lang
        return env

    def _apply_isolation(self) -> None:
        """Applique les mesures d'isolation au processus enfant (Unix uniquement).

        Appelé dans ``preexec_fn`` du subprocess avant l'exécution du code :
          1. Limite mémoire via ``setrlimit``
          2. Abaissement des privilèges → utilisateur ``nobody``
          3. Désactivation du réseau via ``unshare(CLONE_NEWNET)`` (Linux)
        """
        # 1. Limite mémoire
        if MAX_MEMORY_KB > 0:
            try:
                import resource
                resource.setrlimit(
                    resource.RLIMIT_AS,
                    (MAX_MEMORY_KB * 1024, MAX_MEMORY_KB * 1024),
                )
            except (ImportError, ResourceWarning, ValueError):
                pass

        # 1b. Limite nombre de processus (anti fork-bomb) et descripteurs
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
            resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))
        except (ImportError, ValueError, ResourceWarning):
            pass

        # 2. Abaissement des privilèges (uniquement si root)
        try:
            if os.getuid() == 0:
                import pwd
                nobody = pwd.getpwnam("nobody")
                os.setgid(nobody.pw_gid)
                os.setuid(nobody.pw_uid)
        except (ImportError, AttributeError, KeyError, PermissionError):
            pass

        # 3. Désactivation du réseau (Linux uniquement)
        try:
            import ctypes
            import ctypes.util
            CLONE_NEWNET = 0x40000000
            libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)
            if libc:
                libc.unshare(ctypes.c_int(CLONE_NEWNET))
        except Exception:
            pass

    def _get_config(self, language: str) -> dict:
        """Récupère la configuration pour un langage donné."""
        config = LANGUAGE_CONFIG.get(language.lower())
        if not config:
            raise CodeExecutionError(
                f"Langage non supporté : '{language}'. "
                f"Supportés : {', '.join(LANGUAGE_CONFIG.keys())}"
            )
        return config

    def _write_source_file(self, workdir: Path, code: str, config: dict) -> str:
        """Écrit le code source dans un fichier temporaire.

        Pour Java, détecte automatiquement le nom de la classe publique
        pour que ``javac`` trouve la classe sans erreur de nom de fichier.
        """
        ext = config["extension"]

        if ext == ".java":
            # Cherche "public class XXX" ou "public final class XXX" etc.
            m = re.search(
                r'\bpublic\s+(?:final\s+|abstract\s+)?class\s+(\w+)',
                code,
            )
            class_name = m.group(1) if m else "Solution"
            filename = f"{class_name}{ext}"
        else:
            filename = f"solution{ext}"

        filepath = workdir / filename
        filepath.write_text(code, encoding="utf-8")
        return str(filepath)

    def _format_command(
        self, cmd_template: list[str], filepath: str, workdir: Path, config: dict
    ) -> list[str]:
        """Formate une commande avec les variables de substitution.

        Utilise sys.executable pour {interpreter} afin d'éviter les shims
        (comme le shim modern-python de Claude Code) qui interceptent
        le binaire ``python`` dans le PATH et cassent l'exécution en subprocess.
        """
        p = Path(filepath)
        return [
            (
                arg.replace("{file}", filepath)
                .replace("{dir}", str(workdir))
                .replace("{outdir}", str(workdir))
                .replace("{outfile}", str(workdir / p.stem))
                .replace("{classname}", p.stem)
                .replace("{interpreter}", sys.executable)
            )
            for arg in cmd_template
        ]

    def _compile_code(
        self, filepath: str, workdir: Path, config: dict, start_time: float
    ) -> tuple[Optional[list[str]], Optional[dict]]:
        """Compile le code source si nécessaire.

        Retourne (run_cmd, None) en cas de succès, ou (None, error_dict) en cas d'échec.
        run_cmd est la commande à exécuter ensuite (``run_compiled`` ou ``run_command``).
        """
        has_compile = "compile_command" in config
        run_key = "run_compiled" if "run_compiled" in config else "run_command"

        if has_compile:
            cmd = self._format_command(
                config["compile_command"], filepath, workdir, config
            )
            logger.info(f"Compilation: {' '.join(cmd)}")
            try:
                comp = subprocess.run(
                    cmd,
                    cwd=str(workdir),
                    capture_output=True,
                    text=True,
                    timeout=self.max_time,
                    env=self._build_env(workdir),
                    preexec_fn=self._apply_isolation if os.name != "nt" else None,
                )
                if comp.returncode != 0:
                    return None, {
                        "stdout": "",
                        "stderr": comp.stderr or comp.stdout,
                        "exit_code": comp.returncode,
                        "time_seconds": round(time.time() - start_time, 3),
                        "error": "Erreur de compilation",
                    }
            except subprocess.TimeoutExpired:
                return None, {
                    "stdout": "",
                    "stderr": "",
                    "exit_code": -1,
                    "time_seconds": self.max_time,
                    "error": "Temps de compilation dépassé",
                }

        # Commande d'exécution (post-compilation ou directe)
        run_cmd = self._format_command(
            config[run_key], filepath, workdir, config
        )
        return run_cmd, None

    def _run_code(
        self, cmd: list[str], workdir: Path, stdin: str, start_time: float
    ) -> dict:
        """Exécute une commande et retourne le résultat."""
        logger.info(f"Exécution: {' '.join(cmd)}")
        try:
            result = subprocess.run(
                cmd,
                cwd=str(workdir),
                capture_output=True,
                text=True,
                timeout=self.max_time,
                input=stdin if stdin else None,
                env=self._build_env(workdir),
                preexec_fn=self._apply_isolation if os.name != "nt" else None,
            )
            elapsed = round(time.time() - start_time, 3)
            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.returncode,
                "time_seconds": elapsed,
                "error": None,
            }
        except subprocess.TimeoutExpired:
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": self.max_time,
                "error": f"Temps d'exécution dépassé ({self.max_time}s max)",
            }

    def execute(
        self,
        code: str,
        language: str,
        stdin: str = "",
    ) -> dict:
        """Exécute du code et retourne stdout, stderr, exit_code.

        Args:
            code: Le code source à exécuter.
            language: Le langage de programmation (python, java, cpp, etc.)
            stdin: Entrée standard à fournir au programme.

        Retourne:
            dict avec stdout, stderr, exit_code, time_seconds, error
        """
        if len(code) > MAX_CODE_SIZE:
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": 0,
                "error": f"Code source trop volumineux ({len(code)} caractères, "
                         f"maximum {MAX_CODE_SIZE}).",
            }
        config = self._get_config(language)
        workdir = Path(tempfile.mkdtemp(prefix="pean_code_"))
        # Permissions restrictives : owner uniquement
        try:
            workdir.chmod(stat.S_IRWXU)
        except Exception:
            pass
        start_time = time.time()

        try:
            filepath = self._write_source_file(workdir, code, config)

            # Compilation (si nécessaire) + récupération de la commande d'exécution
            run_cmd, error = self._compile_code(filepath, workdir, config, start_time)
            if error:
                return error

            # Exécution
            return self._run_code(run_cmd, workdir, stdin, start_time)

        except CodeExecutionError as e:
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": round(time.time() - start_time, 3),
                "error": str(e),
            }
        except FileNotFoundError as e:
            lang = language.lower()
            missing_cmd = str(e).split("]")[-1].strip() if "]" in str(e) else str(e)
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": round(time.time() - start_time, 3),
                "error": (
                    f"Exécutable '{missing_cmd}' introuvable pour le langage '{lang}'. "
                    f"Vérifiez que {lang} est installé sur le serveur."
                ),
            }
        except Exception as e:
            logger.exception(f"Erreur inattendue lors de l'exécution {language}")
            return {
                "stdout": "",
                "stderr": "",
                "exit_code": -1,
                "time_seconds": round(time.time() - start_time, 3),
                "error": f"Erreur interne : {str(e)}",
            }
        finally:
            # Nettoyage du répertoire temporaire
            try:
                shutil.rmtree(str(workdir), ignore_errors=True)
            except Exception:
                pass

    def execute_with_test_cases(
        self,
        code: str,
        language: str,
        test_cases: list[dict],
    ) -> dict:
        """Exécute le code contre des cas de test.

        Compile une seule fois (pour les langages compilés), puis exécute
        chaque cas de test sans recompilation.

        Note: la comparaison utilise rstrip() bilatéral sur stdout et
        expected_output pour ignorer les différences de whitespace finale
        (convention standard des plateformes de programmation).

        Args:
            code: Le code source.
            language: Le langage de programmation.
            test_cases: Liste de dicts avec 'input' et 'expected_output'.

        Retourne:
            dict avec passed, total, results[], execution_time, error
        """
        if len(code) > MAX_CODE_SIZE:
            return {
                "passed": 0,
                "total": len(test_cases),
                "results": [],
                "execution_time": 0,
                "error": f"Code source trop volumineux ({len(code)} caractères, "
                         f"maximum {MAX_CODE_SIZE}).",
            }

        results = []
        passed_count = 0
        total_time = 0.0
        max_test_cases = min(len(test_cases), MAX_TEST_CASES)
        wall_start = time.time()

        # Phase 1 : configuration et compilation unique
        config = self._get_config(language)
        workdir = Path(tempfile.mkdtemp(prefix="pean_code_"))
        # Permissions restrictives : owner uniquement
        try:
            workdir.chmod(stat.S_IRWXU)
        except Exception:
            pass
        start_time = time.time()

        try:
            filepath = self._write_source_file(workdir, code, config)
            run_cmd, error = self._compile_code(filepath, workdir, config, start_time)
            if error:
                # Échec de compilation → tous les tests échouent
                for i, tc in enumerate(test_cases[:max_test_cases]):
                    results.append(make_test_result(
                        description=tc.get("description", f"Test #{i + 1}"),
                        passed=False,
                        input_val=tc.get("input", ""),
                        expected=tc.get("expected_output", "").rstrip(),
                        actual_output=error["error"],
                        error=error["error"],
                    ))
                # Signaler les tests ignorés
                skipped = build_timeout_skip(
                    test_cases, max_test_cases,
                    "Test ignoré (maximum 20 tests autorisés)",
                )
                results.extend(skipped)
                return {
                    "passed": 0,
                    "total": len(test_cases),
                    "results": results,
                    "execution_time": round(time.time() - start_time, 3),
                }

            # Phase 2 : exécution de chaque cas de test sans recompilation
            for i, tc in enumerate(test_cases[:max_test_cases]):
                # Vérifier le timeout global avant chaque test
                if time.time() - wall_start >= TOTAL_TIMEOUT_SECONDS:
                    results.append(make_test_result(
                        description=tc.get("description", f"Test #{i + 1}"),
                        passed=False,
                        input_val=tc.get("input", ""),
                        expected=tc.get("expected_output", ""),
                        actual_output="",
                        error="Temps total d'exécution dépassé — tests suivants ignorés",
                    ))
                    continue

                tc_input = tc.get("input", "")
                expected = tc.get("expected_output", "").rstrip()
                description = tc.get("description", f"Test #{i + 1}")

                # On réinitialise le timer pour chaque run individuel
                output = self._run_code(run_cmd, workdir, tc_input, time.time())
                total_time += output.get("time_seconds", 0)

                actual = output.get("stdout", "").rstrip()
                error_out = output.get("error")

                if error_out:
                    is_passed = False
                    # Préserver stderr/stdout dans actual_output
                    actual_output = (
                        output.get("stderr", "")
                        or output.get("stdout", "")
                        or error_out
                    )
                elif output["exit_code"] != 0:
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

            # Signaler les tests ignorés (limite max_test_cases)
            skipped = build_timeout_skip(
                test_cases, max_test_cases,
                "Test ignoré (maximum 20 tests autorisés)",
            )
            results.extend(skipped)

        except CodeExecutionError as e:
            return {
                "passed": 0,
                "total": len(test_cases),
                "results": results or [],
                "execution_time": round(time.time() - start_time, 3),
                "error": str(e),
            }
        except Exception as e:
            logger.exception("Erreur inattendue execute_with_test_cases")
            return {
                "passed": 0,
                "total": len(test_cases),
                "results": results or [],
                "execution_time": round(time.time() - start_time, 3),
                "error": f"Erreur interne : {str(e)}",
            }
        finally:
            try:
                shutil.rmtree(str(workdir), ignore_errors=True)
            except Exception:
                pass

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
