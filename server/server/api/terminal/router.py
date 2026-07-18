"""Terminal WebSocket interactif pour l'exécution de code étudiant.

Endpoint :
  /ws/terminal/{session_code}  → terminal interactif bidirectionnel

Protocole de messages (JSON) :

  Client → Serveur :
    {"type": "run", "code": "...", "language": "python"}   # démarrer l'exécution
    {"type": "input", "data": "42\\n"}                    # envoyer une ligne stdin
    {"type": "kill"}                                       # tuer le process

  Serveur → Client :
    {"type": "started"}                                    # process lancé
    {"type": "output", "stream": "stdout", "data": "..."}  # sortie stdout
    {"type": "output", "stream": "stderr", "data": "..."}  # sortie stderr
    {"type": "output", "stream": "system", "data": "..."}  # message système
    {"type": "exit", "code": 0, "time_seconds": 1.23}     # process terminé (OK)
    {"type": "exit", "code": -1, ..., "error": "..."}     # process terminé (erreur/timeout)
    {"type": "error", "data": "message"}                  # erreur système pré-exécution
"""

import asyncio
import json
import logging
import os
import re
import shutil
import stat
import sys
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from core.config import get_settings
from services.code_executor import LANGUAGE_CONFIG

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_CODE_SIZE = 100_000  # 100 Ko — seuil de sécurité


def _build_env(workdir: Path) -> dict[str, str]:
    """Environnement minimal et sécurisé pour le sous-processus.

    Aucune variable d'environnement serveur (tokens, DB, etc.) n'est transmise.
    """
    env: dict[str, str] = {
        "PATH": os.environ.get("PATH", "/usr/bin:/usr/local/bin"),
        "TMPDIR": str(workdir),
        "TEMP": str(workdir),
        "TMP": str(workdir),
    }
    if os.name == "nt":
        for key in ("SYSTEMROOT", "COMSPEC", "PATHEXT"):
            val = os.environ.get(key)
            if val:
                env[key] = val
    lang = os.environ.get("LANG")
    if lang:
        env["LANG"] = lang
    return env


def _format_cmd(template: list[str], filepath: str, workdir: Path) -> list[str]:
    """Substitue les variables dans un template de commande."""
    p = Path(filepath)
    return [
        arg.replace("{file}", filepath)
           .replace("{dir}", str(workdir))
           .replace("{outdir}", str(workdir))
           .replace("{outfile}", str(workdir / p.stem))
           .replace("{classname}", p.stem)
           .replace("{interpreter}", sys.executable)
        for arg in template
    ]


@router.websocket("/terminal/{session_code}")
async def interactive_terminal(websocket: WebSocket, session_code: str):
    """Terminal interactif WebSocket — exécute le code et streame I/O en temps réel."""

    settings = get_settings()

    if not settings.ENABLE_CODE_EXECUTION:
        await websocket.close(code=4003, reason="Exécution de code désactivée")
        return

    await websocket.accept()

    workdir: Path | None = None
    process: asyncio.subprocess.Process | None = None

    try:
        # ── 1. Attendre le message "run" ─────────────────────────────────────
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=30)
            msg = json.loads(raw)
        except asyncio.TimeoutError:
            await websocket.send_json({"type": "error", "data": "Timeout — aucun message reçu dans les 30s"})
            return
        except json.JSONDecodeError:
            await websocket.send_json({"type": "error", "data": "Message JSON invalide"})
            return

        if msg.get("type") != "run":
            await websocket.send_json({"type": "error", "data": "Premier message attendu : {type: 'run', code, language}"})
            return

        code: str = msg.get("code", "")
        language: str = msg.get("language", "python").lower()

        if len(code) > MAX_CODE_SIZE:
            await websocket.send_json({"type": "error", "data": f"Code trop volumineux ({len(code)} cars, max {MAX_CODE_SIZE})"})
            return

        config = LANGUAGE_CONFIG.get(language)
        if not config:
            langs = ", ".join(LANGUAGE_CONFIG.keys())
            await websocket.send_json({"type": "error", "data": f"Langage non supporté : '{language}'. Langages disponibles : {langs}"})
            return

        # ── 2. Préparer le répertoire temporaire et le fichier source ────────
        workdir = Path(tempfile.mkdtemp(prefix="pean_term_"))
        workdir.chmod(stat.S_IRWXU)

        ext = config["extension"]
        if ext == ".java":
            m = re.search(r'\bpublic\s+(?:final\s+|abstract\s+)?class\s+(\w+)', code)
            class_name = m.group(1) if m else "Solution"
            filename = f"{class_name}{ext}"
        else:
            filename = f"solution{ext}"

        filepath = workdir / filename
        filepath.write_text(code, encoding="utf-8")

        # ── 3. Compilation si nécessaire ─────────────────────────────────────
        if "compile_command" in config:
            compile_cmd = _format_cmd(config["compile_command"], str(filepath), workdir)
            await websocket.send_json({"type": "output", "stream": "system", "data": "⏳ Compilation en cours...\n"})
            try:
                comp = await asyncio.create_subprocess_exec(
                    *compile_cmd,
                    cwd=str(workdir),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=_build_env(workdir),
                )
                out_b, err_b = await asyncio.wait_for(comp.communicate(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "exit", "code": -1, "time_seconds": 0, "error": "Temps de compilation dépassé"})
                return

            if comp.returncode != 0:
                err_text = (err_b or out_b).decode("utf-8", errors="replace")
                await websocket.send_json({"type": "output", "stream": "stderr", "data": err_text})
                await websocket.send_json({"type": "exit", "code": comp.returncode, "time_seconds": 0, "error": "Erreur de compilation"})
                return

            await websocket.send_json({"type": "output", "stream": "system", "data": "✅ Compilation réussie\n"})

        # ── 4. Construire la commande d'exécution ────────────────────────────
        run_key = "run_compiled" if "run_compiled" in config else "run_command"
        run_cmd = _format_cmd(config[run_key], str(filepath), workdir)

        # ── 5. Lancer le process interactif ──────────────────────────────────
        start_time = time.time()
        max_time = settings.CODE_EXECUTION_MAX_TIME

        process = await asyncio.create_subprocess_exec(
            *run_cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(workdir),
            env=_build_env(workdir),
        )

        await websocket.send_json({"type": "started"})

        # ── 6. Tâches asyncio parallèles ─────────────────────────────────────

        async def stream_pipe(pipe: asyncio.StreamReader, stream_name: str) -> None:
            """Lit un pipe du process et envoie les chunks au WebSocket."""
            while True:
                chunk = await pipe.read(512)
                if not chunk:
                    break
                await websocket.send_json({
                    "type": "output",
                    "stream": stream_name,
                    "data": chunk.decode("utf-8", errors="replace"),
                })

        async def forward_stdin() -> None:
            """Reçoit les messages WS et les écrit dans stdin du process."""
            assert process.stdin is not None
            while True:
                try:
                    raw_msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.2)
                    inp = json.loads(raw_msg)
                    if inp.get("type") == "input":
                        data: str = inp.get("data", "")
                        process.stdin.write(data.encode("utf-8"))
                        await process.stdin.drain()
                    elif inp.get("type") == "kill":
                        process.kill()
                        return
                except asyncio.TimeoutError:
                    # Pas de message — vérifier si le process est toujours vivant
                    if process.returncode is not None:
                        return
                except (WebSocketDisconnect, Exception):
                    if process.returncode is None:
                        process.kill()
                    return

        assert process.stdout is not None
        assert process.stderr is not None

        stdout_task = asyncio.create_task(stream_pipe(process.stdout, "stdout"))
        stderr_task = asyncio.create_task(stream_pipe(process.stderr, "stderr"))
        stdin_task = asyncio.create_task(forward_stdin())

        # ── 7. Attendre la fin du process (avec timeout global) ───────────────
        try:
            await asyncio.wait_for(process.wait(), timeout=max_time)
        except asyncio.TimeoutError:
            await websocket.send_json({
                "type": "output",
                "stream": "system",
                "data": f"Temps d'exécution dépassé ({max_time}s max). Processus tué.\n",
            })
            process.kill()
            await process.wait()
            stdin_task.cancel()
            await asyncio.gather(
                asyncio.gather(stdout_task, stderr_task, return_exceptions=True),
                asyncio.gather(stdin_task, return_exceptions=True),
            )
            elapsed = round(time.time() - start_time, 3)
            await websocket.send_json({
                "type": "exit",
                "code": -1,
                "time_seconds": elapsed,
                "error": f"Temps d'exécution dépassé ({max_time}s max)",
            })
            return

        # Laisser le temps de drainer stdout/stderr restants
        stdin_task.cancel()
        await asyncio.gather(
            asyncio.gather(stdout_task, stderr_task, return_exceptions=True),
            asyncio.gather(stdin_task, return_exceptions=True),
        )

        elapsed = round(time.time() - start_time, 3)
        await websocket.send_json({
            "type": "exit",
            "code": process.returncode,
            "time_seconds": elapsed,
        })

    except WebSocketDisconnect:
        logger.info("Terminal WS déconnecté — session %s", session_code)
    except Exception as e:
        logger.exception("Erreur inattendue terminal WS session %s", session_code)
        try:
            await websocket.send_json({"type": "error", "data": f"Erreur interne : {str(e)}"})
        except Exception:
            pass
    finally:
        if process and process.returncode is None:
            try:
                process.kill()
            except Exception:
                pass
        if workdir:
            shutil.rmtree(str(workdir), ignore_errors=True)
