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
import time
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, UploadFile
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


# ── Compile / upload / serial helpers ─────────────────────────────────────────
CHUNK = 1024  # serial transfer block size — must match PROVISION_CHUNK (frontend)

# Force UTF-8 across the ESP32 toolchain — its bundled Python (esptool, ...)
# prints build output through the locale codec (cp1252 on Windows) and dies with
# UnicodeEncodeError on the first non-cp1252 character.
_TOOLCHAIN_ENV = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}


def _make_sketch(name: str, ino: str):
    """Write `ino` to a temp <name>/<name>.ino (arduino-cli needs the folder name
    to match the sketch). Returns (work_dir, sketch_dir); caller removes work_dir."""
    work = Path(tempfile.mkdtemp(prefix="fls_"))
    sketch_dir = work / name
    sketch_dir.mkdir()
    (sketch_dir / f"{name}.ino").write_text(ino, encoding="utf-8")
    return work, sketch_dir


def _run_phase(label, args):
    """Run one arduino-cli phase, yielding its output lines; returns the exit code."""
    yield f"\n=== {label} ===\n$ {' '.join(args)}\n"
    try:
        proc = subprocess.Popen(
            args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1, env=_TOOLCHAIN_ENV,
        )
    except Exception as e:
        yield f"[error] failed to launch arduino-cli: {e}\n"
        return -1
    for line in proc.stdout:
        yield line
    proc.wait()
    yield f"[{label} exit code: {proc.returncode}]\n"
    return proc.returncode


def _compile_upload(label, sketch_dir, fqbn, port):
    """Compile, then (if a port is given) upload a sketch. Returns the exit code."""
    rc = yield from _run_phase(f"{label} · compile", _ARDUINO_BASE + ["compile", "-v", "--fqbn", fqbn, str(sketch_dir)])
    if rc != 0:
        return rc
    if not port:
        yield "  (no port selected — compiled only)\n"
        return 0
    return (yield from _run_phase(f"{label} · upload", _ARDUINO_BASE + ["upload", "-v", "-p", port, "--fqbn", fqbn, str(sketch_dir)]))


def _serial_send(port, payloads):
    """Host side of the provisioner protocol: PING -> READY, then PUT each file in
    CHUNK blocks with a per-block ack. Yields progress lines; returns True on ok."""
    try:
        import serial  # pyserial — lazy so the module still loads without it
    except ImportError:
        yield "[error] pyserial not installed — pip install -r backend/requirements.txt\n"
        return False

    yield f"\n=== Transfer to SD ({len(payloads)} file(s)) ===\n"
    time.sleep(2.0)  # let the board reboot into the freshly-flashed provisioner

    ser = None
    for _ in range(5):
        try:
            ser = serial.Serial(port, 115200, timeout=5)
            break
        except Exception as e:
            yield f"  opening {port}… ({e})\n"
            time.sleep(1.0)
    if ser is None:
        yield f"[error] could not open {port}\n"
        return False

    def line():
        return ser.readline().decode(errors="replace").strip()

    try:
        ser.dtr = False
        ser.rts = False
        ready = False
        for _ in range(8):
            ser.reset_input_buffer()
            ser.write(b"PING\n")
            ser.flush()
            if line() == "READY":
                ready = True
                break
            time.sleep(0.5)
        if not ready:
            yield "[error] board did not report READY (SD mounted?)\n"
            return False

        for path, data in payloads:
            yield f"  -> {path} ({len(data)} bytes)\n"
            ser.reset_input_buffer()
            ser.write(f"PUT {path} {len(data)}\n".encode())
            ser.flush()
            if line() != "OK":
                yield f"[error] device refused {path}\n"
                return False
            sent = 0
            while sent < len(data):
                block = data[sent:sent + CHUNK]
                ser.write(block)
                ser.flush()
                if line() != "A":
                    yield f"[error] lost ack for {path} at byte {sent}\n"
                    return False
                sent += len(block)
            if line() != "DONE":
                yield f"[error] {path} was not confirmed\n"
                return False
        ser.write(b"END\n")
        ser.flush()
        line()
        yield "  SD transfer complete.\n"
        return True
    finally:
        ser.close()


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
    work, sketch_dir = _make_sketch(SKETCH, ino)

    def stream():
        try:
            rc = yield from _compile_upload("Sketch", sketch_dir, fqbn, port)
            if rc == 0 and port:
                yield "\nUpload complete.\n"
            elif rc != 0:
                yield (f"\n*** FAILED (exit code {rc}) *** If upload couldn't connect, put the "
                       "board in download mode (hold BOOT, tap RST) and retry.\n")
        finally:
            shutil.rmtree(work, ignore_errors=True)

    return StreamingResponse(stream(), media_type="text/plain")


@app.post("/api/upload-show")
async def upload_show(
    meta: str = Form(...),
    provisioner: str = Form(...),
    player: str = Form(...),
    files: list[UploadFile] = File(default=[]),
):
    """Music-sync upload: flash the provisioner, stream the songs/shows onto the
    SD card over serial, then compile + upload the player. Streams logs as text.

    `meta` is JSON {"fqbn", "port", "paths": [...]} where `paths[i]` is the SD
    destination for `files[i]` (e.g. "/music/song.mp3", "/shows/song.show").
    """
    if not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    info = json.loads(meta)
    fqbn = (info.get("fqbn") or _DEFAULT_FQBN).strip()
    port = (info.get("port") or "").strip()
    paths = info.get("paths") or []
    # Read every upload into memory now (sync generator can't await later).
    payloads = []
    for i, uf in enumerate(files):
        data = await uf.read()
        payloads.append((paths[i] if i < len(paths) else f"/{uf.filename}", data))

    def stream():
        prov_work = play_work = None
        try:
            if not port:
                yield "[error] a serial port is required to write the SD card\n"
                return
            prov_work, prov_dir = _make_sketch("provisioner", provisioner)
            rc = yield from _compile_upload("Provisioner", prov_dir, fqbn, port)
            if rc != 0:
                yield f"\n*** Provisioner flash failed (exit {rc}) ***\n"
                return
            ok = yield from _serial_send(port, payloads)
            if not ok:
                yield "\n*** SD transfer failed — not flashing the player ***\n"
                return
            play_work, play_dir = _make_sketch("player", player)
            rc = yield from _compile_upload("Player", play_dir, fqbn, port)
            yield ("\nAll done — songs/shows are on the card and the player is flashed.\n"
                   if rc == 0 else f"\n*** Player flash failed (exit {rc}) ***\n")
        finally:
            for w in (prov_work, play_work):
                if w:
                    shutil.rmtree(w, ignore_errors=True)

    return StreamingResponse(stream(), media_type="text/plain")
