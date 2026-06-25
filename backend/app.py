"""FastLED Studio — local upload helper.

A tiny FastAPI service the browser app talks to so it can compile and upload
sketches to a board over USB via `arduino-cli` — the browser can't launch a
local CLI itself. Mirrors the proven setup from the Matrix Studio backend.

Run (from the repo root):

    python -m venv backend/.venv
    backend/.venv/Scripts/activate            # Windows  (or: source backend/.venv/bin/activate)
    pip install -r backend/requirements.txt
    uvicorn app:app --reload --port 8008 --app-dir backend

Every endpoint degrades gracefully when arduino-cli isn't installed, so the
studio keeps working (it just falls back to showing copy-paste commands).
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

# ── arduino-cli resolution ────────────────────────────────────────────────────
# Resolve the CLI (env override > PATH > the binary the Arduino IDE bundles) and
# its config file, so it sees the ESP32 core + FastLED library the IDE installed.
_DEFAULT_FQBN = "esp32:esp32:esp32s3"
_ARDUINO_CFG = Path(os.environ.get("LOCALAPPDATA", "")) / "Arduino15" / "arduino-cli.yaml"
SKETCH = "fastled_pattern"


def _find_arduino_cli() -> str | None:
    env = os.environ.get("ARDUINO_CLI")
    if env and Path(env).exists():
        return env
    onpath = shutil.which("arduino-cli")
    if onpath:
        return onpath
    bundled = (
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files"))
        / "Arduino IDE" / "resources" / "app" / "lib" / "backend" / "resources" / "arduino-cli.exe"
    )
    return str(bundled) if bundled.exists() else None


_ARDUINO_CLI = _find_arduino_cli()
# Pass the IDE's config explicitly (when present) so we use the same core/lib install.
_ARDUINO_BASE = (
    [_ARDUINO_CLI] + (["--config-file", str(_ARDUINO_CFG)] if _ARDUINO_CFG.exists() else [])
    if _ARDUINO_CLI
    else []
)

app = FastAPI(title="FastLED Studio Upload Helper")

# The studio is served from a different origin (the Vite dev server or the static
# site), so allow cross-origin calls from any localhost port.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    """Liveness + whether arduino-cli is available (so the UI can show status)."""
    version = None
    if _ARDUINO_CLI:
        try:
            proc = subprocess.run([_ARDUINO_CLI, "version"], capture_output=True, text=True, timeout=15)
            version = (proc.stdout or "").strip() or None
        except Exception:
            version = None
    return {"ok": True, "arduinoCli": bool(_ARDUINO_CLI), "version": version}


@app.get("/api/serial/ports")
def serial_ports():
    """List connected boards/ports via `arduino-cli board list --format json`."""
    if not _ARDUINO_CLI:
        return {"ok": False, "error": "arduino-cli not found", "ports": []}
    try:
        proc = subprocess.run(
            _ARDUINO_BASE + ["board", "list", "--format", "json"],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(proc.stdout or "{}")
    except Exception as e:
        return {"ok": False, "error": str(e), "ports": []}
    # arduino-cli 1.x: {"detected_ports": [{"port": {...}, "matching_boards": [...]}]}
    raw = data.get("detected_ports", data) if isinstance(data, dict) else data
    ports = []
    for entry in raw or []:
        port = entry.get("port", entry) if isinstance(entry, dict) else {}
        if port.get("protocol") and port.get("protocol") != "serial":
            continue  # skip network ports
        boards = entry.get("matching_boards") or [] if isinstance(entry, dict) else []
        ports.append({
            "address": port.get("address"),
            "label": port.get("label") or port.get("address"),
            "protocol": port.get("protocol", "serial"),
            "boards": [{"name": b.get("name"), "fqbn": b.get("fqbn")} for b in boards],
        })
    return {"ok": True, "ports": ports}


@app.post("/api/upload")
def upload(payload: dict = Body(...)):
    """Compile a raw `.ino` and upload it to the board, streaming logs as text.

    Body: {"ino": "<sketch source>", "fqbn": "esp32:esp32:esp32s3", "port": "COM5"}.
    Compiles first; uploads only if that succeeds and a port was given.
    """
    if not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    ino = payload.get("ino") or ""
    fqbn = (payload.get("fqbn") or _DEFAULT_FQBN).strip()
    port = (payload.get("port") or "").strip()

    # arduino-cli requires the entry .ino to be named after its parent folder.
    work = Path(tempfile.mkdtemp(prefix="fls_up_"))
    sketch_dir = work / SKETCH
    sketch_dir.mkdir()
    (sketch_dir / f"{SKETCH}.ino").write_text(ino, encoding="utf-8")

    # Force UTF-8 across the ESP32 toolchain — its bundled Python (esptool,
    # gen_esp32part, ...) prints build output through the locale codec (cp1252 on
    # Windows) and dies with UnicodeEncodeError on the first non-cp1252 character.
    up_env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}

    def run_phase(label, args):
        yield f"\n=== {label} ===\n$ {' '.join(args)}\n"
        try:
            proc = subprocess.Popen(
                args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1, env=up_env,
            )
        except Exception as e:
            yield f"[error] failed to launch arduino-cli: {e}\n"
            return -1
        for line in proc.stdout:
            yield line
        proc.wait()
        yield f"[{label} exit code: {proc.returncode}]\n"
        return proc.returncode

    def stream():
        try:
            rc = yield from run_phase("Compile", _ARDUINO_BASE + ["compile", "-v", "--fqbn", fqbn, str(sketch_dir)])
            if rc != 0:
                yield f"\n*** COMPILE FAILED (exit code {rc}) *** Not uploading.\n"
                return
            if not port:
                yield "\nCompiled successfully. No port selected, so nothing was uploaded.\n"
                return
            rc = yield from run_phase("Upload", _ARDUINO_BASE + ["upload", "-v", "-p", port, "--fqbn", fqbn, str(sketch_dir)])
            yield (
                "\nUpload complete.\n" if rc == 0
                else f"\n*** UPLOAD FAILED (exit code {rc}) *** If it couldn't connect, put the "
                     "board in download mode (hold BOOT, tap RST) and retry.\n"
            )
        finally:
            shutil.rmtree(work, ignore_errors=True)

    return StreamingResponse(stream(), media_type="text/plain")
