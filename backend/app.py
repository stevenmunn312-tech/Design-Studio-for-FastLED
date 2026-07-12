"""FastLED Studio — local upload helper.

A tiny FastAPI service the browser app talks to so it can compile and upload
sketches to a board over USB — the browser can't launch a local CLI itself.
Mirrors the proven setup from the Matrix Studio backend.

Two build engines are supported: `fbuild` (FastLED's own PlatformIO-compatible
build tool — preferred when installed, since it manages its own toolchains and
needs no per-board core install) and `arduino-cli` (the original engine, kept
as a fallback). `_active_engine()` picks one; `/api/engine` lets the UI query
or override the choice.

Run (from the repo root):

    python -m venv backend/.venv
    backend/.venv/Scripts/activate            # Windows  (or: source backend/.venv/bin/activate)
    pip install -r backend/requirements.txt
    uvicorn app:app --reload --port 8008 --app-dir backend

Every endpoint degrades gracefully when neither engine is installed, so the
studio keeps working (it just falls back to showing copy-paste commands).
"""
from __future__ import annotations

import io
import json
import os
import platform
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

import threading

from fastapi import Body, FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

# ── arduino-cli resolution ────────────────────────────────────────────────────
# Resolve the CLI (saved path > env override > PATH > the IDE's bundled binary >
# our own installed copy) and its config file, so it sees the ESP32 core + FastLED
# library. The resolved path is persisted so a user-located/installed CLI sticks
# across restarts.
_DEFAULT_FQBN = "esp32:esp32:esp32s3"
_ARDUINO_CFG = Path(os.environ.get("LOCALAPPDATA", "")) / "Arduino15" / "arduino-cli.yaml"
SKETCH = "fastled_pattern"

_HELPER_DIR = Path(__file__).parent
_CONFIG_PATH = _HELPER_DIR / ".helper-config.json"
_BIN_DIR = _HELPER_DIR / "bin"  # where a self-installed arduino-cli lands

# Saved node-graph patterns ("My Patterns") live as one JSON file each in this
# folder at the repo root, so users can share a pattern by simply sending the
# file. The browser can't write arbitrary folders, so it round-trips through the
# /api/patterns endpoints below. Override the location with FLS_PATTERNS_DIR.
_PATTERNS_DIR = Path(os.environ.get("FLS_PATTERNS_DIR") or (_HELPER_DIR.parent / "My Patterns"))
_PROJECT_FILE_SUFFIX = ".fastled-project.json"
_PROJECTS_DIR = Path(os.environ.get("FLS_PROJECTS_DIR") or (_HELPER_DIR.parent / "Projects"))

# Board-manager URLs for the third-party cores we can install, so `core install`
# works against a fresh CLI that has never seen them.
_CORE_URLS = {
    "esp32:esp32": "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json",
    "rp2040:rp2040": "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json",
    "teensy:avr": "https://www.pjrc.com/teensy/package_teensy_index.json",
}


def _load_config() -> dict:
    try:
        return json.loads(_CONFIG_PATH.read_text())
    except Exception:
        return {}


def _save_config(cfg: dict) -> None:
    try:
        _CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    except Exception:
        pass


def _find_arduino_cli() -> str | None:
    saved = _load_config().get("arduinoCli")
    if saved and Path(saved).exists():
        return saved
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
    if bundled.exists():
        return str(bundled)
    local = _BIN_DIR / ("arduino-cli.exe" if os.name == "nt" else "arduino-cli")
    return str(local) if local.exists() else None


# Mutable module state: locating/installing the CLI at runtime updates these.
_ARDUINO_CLI: str | None = None
_ARDUINO_BASE: list[str] = []


def _refresh_cli() -> None:
    """Recompute the resolved CLI path + base args (run at import and after the
    CLI is located or installed)."""
    global _ARDUINO_CLI, _ARDUINO_BASE
    _ARDUINO_CLI = _find_arduino_cli()
    # Pass the IDE's config explicitly (when present) so we use the same core/lib install.
    _ARDUINO_BASE = (
        [_ARDUINO_CLI] + (["--config-file", str(_ARDUINO_CFG)] if _ARDUINO_CFG.exists() else [])
        if _ARDUINO_CLI
        else []
    )


_refresh_cli()


# ── fbuild resolution ─────────────────────────────────────────────────────────
# fbuild (https://github.com/FastLED/fbuild, `pip install fbuild`) is FastLED's
# own PlatformIO-compatible build tool. It removes most of arduino-cli's
# lifecycle management (per-board core install, FastLED lib install) — a board
# just needs one `[env:X]` section in `platformio.ini` and fbuild downloads its
# own toolchain/framework on first use. Preferred engine when present; falls
# back to arduino-cli otherwise (see `_active_engine`).
_FBUILD_BIN: str | None = None


def _find_fbuild() -> str | None:
    saved = _load_config().get("fbuild")
    if saved and Path(saved).exists():
        return saved
    env = os.environ.get("FBUILD_BIN")
    if env and Path(env).exists():
        return env
    return shutil.which("fbuild")


def _refresh_fbuild() -> None:
    global _FBUILD_BIN
    _FBUILD_BIN = _find_fbuild()


_refresh_fbuild()


def _active_engine() -> str:
    """Which build engine to use. A saved `engine` preference wins if that
    engine is actually available; otherwise prefer fbuild (fewer moving parts)
    and fall back to arduino-cli."""
    saved = _load_config().get("engine")
    if saved == "fbuild" and _FBUILD_BIN:
        return "fbuild"
    if saved == "arduino-cli" and _ARDUINO_CLI:
        return "arduino-cli"
    return "fbuild" if _FBUILD_BIN else "arduino-cli"


# ── fbuild project scaffold ───────────────────────────────────────────────────
# fbuild runs a persistent background daemon bound to whichever project
# directory first started it, so (unlike arduino-cli) each compile can't use a
# fresh temp directory — everything shares this one stable project. Only
# `src/main.cpp` is rewritten per request; the `[env:*]` sections (one per
# `BOARDS` entry, plus PSRAM variants) are static.
_FBUILD_PROJECT_DIR = _HELPER_DIR / ".fbuild-project"
_FBUILD_SRC_DIR = _FBUILD_PROJECT_DIR / "src"
_FBUILD_INI_PATH = _FBUILD_PROJECT_DIR / "platformio.ini"
_FBUILD_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "FastLED"
# The music-sync Player sketch (playerSketchGenerator.ts) additionally needs
# ESP32-audioI2S. Vendored the same way as FastLED, but lazily — only the
# Player build path needs it, so it's not fetched for every ordinary compile.
_FBUILD_AUDIO_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "ESP32-audioI2S"

# arduino-cli FQBN -> PlatformIO platform/board, mirroring `BOARDS` in
# `src/state/uploadStore.ts`. `psram_memory_type` maps this repo's PSRAM option
# id (`opi`/`qspi`, from `PsramOption.id`) to the `board_build.arduino.memory_type`
# PlatformIO expects — not yet hardware-validated (see CLAUDE.md PSRAM section).
_PIO_BOARDS: dict[str, dict] = {
    "esp32:esp32:esp32s3": {
        "platform": "espressif32", "board": "esp32-s3-devkitc-1",
        "psram_memory_type": {"opi": "qio_opi", "qspi": "qio_qspi"},
    },
    "esp32:esp32:esp32": {
        "platform": "espressif32", "board": "esp32dev",
        "psram_memory_type": {"qspi": "qio_qspi"},
    },
    "arduino:avr:uno": {"platform": "atmelavr", "board": "uno"},
    "arduino:avr:nano": {"platform": "atmelavr", "board": "nanoatmega328new"},
    "teensy:avr:teensy41": {"platform": "teensy", "board": "teensy41"},
    "rp2040:rp2040:rpipico": {"platform": "raspberrypi", "board": "pico"},
}

# arduino-cli's FQBN "menu option" suffix (e.g. `PSRAM=opi`) -> our PSRAM id.
_FQBN_PSRAM_VALUES = {"opi": "opi", "enabled": "qspi"}

_fbuild_project_ready = False


def _env_id(base_fqbn: str, psram_id: str | None = None) -> str:
    slug = re.sub(r"[^A-Za-z0-9_]", "_", base_fqbn)
    return f"{slug}_{psram_id}" if psram_id else slug


def _parse_fqbn(fqbn: str) -> tuple[str, str | None]:
    """`"esp32:esp32:esp32s3:PSRAM=opi"` -> `("esp32:esp32:esp32s3", "opi")`."""
    parts = fqbn.split(":")
    base = ":".join(parts[:3])
    opt = parts[3] if len(parts) > 3 else None
    psram_id = _FQBN_PSRAM_VALUES.get(opt.split("=", 1)[1]) if opt and "=" in opt else None
    return base, psram_id


def _fbuild_env_for_fqbn(fqbn: str) -> str | None:
    base, psram_id = _parse_fqbn(fqbn)
    meta = _PIO_BOARDS.get(base)
    if meta is None:
        return None
    if psram_id and psram_id not in meta.get("psram_memory_type", {}):
        psram_id = None  # unsupported/unknown option — build without it rather than fail
    return _env_id(base, psram_id)


def _write_fbuild_ini() -> None:
    lines: list[str] = []
    for base_fqbn, meta in _PIO_BOARDS.items():
        # arduino-cli/Arduino IDE always define CORE_DEBUG_LEVEL (from the "Core
        # Debug Level" board menu); PlatformIO/fbuild's espressif32 platform
        # doesn't, so anything referencing it (e.g. ESP32-audioI2S's Audio.h)
        # fails to compile without this — a known PlatformIO+esp32 gotcha, not
        # specific to this project.
        base_flags = ["-DCORE_DEBUG_LEVEL=0"] if meta["platform"] == "espressif32" else []
        lines += [
            f"[env:{_env_id(base_fqbn)}]", f"platform = {meta['platform']}", f"board = {meta['board']}", "framework = arduino",
            *([f"build_flags = {' '.join(base_flags)}"] if base_flags else []), "",
        ]
        for psram_id, mem_type in meta.get("psram_memory_type", {}).items():
            lines += [
                f"[env:{_env_id(base_fqbn, psram_id)}]",
                f"platform = {meta['platform']}", f"board = {meta['board']}", "framework = arduino",
                f"build_flags = {' '.join([*base_flags, '-DBOARD_HAS_PSRAM'])}",
                f"board_build.arduino.memory_type = {mem_type}", "",
            ]
    _FBUILD_INI_PATH.write_text("\n".join(lines), encoding="utf-8")


def _ensure_fbuild_project():
    """Idempotent scaffold, run before the first fbuild compile. A generator so
    the one-time FastLED vendor-clone streams into the caller's log.

    FastLED is vendored into `lib/FastLED` (PlatformIO's local-lib
    auto-discovery) rather than declared via `lib_deps` — as of fbuild 2.4.0,
    registry `lib_deps` resolution isn't implemented yet (`fbuild sync` marks
    it `unresolved` and the build fails with `FastLED.h: No such file or
    directory`); a vendored local lib sidesteps that entirely."""
    global _fbuild_project_ready
    if _fbuild_project_ready:
        return
    _FBUILD_SRC_DIR.mkdir(parents=True, exist_ok=True)
    _write_fbuild_ini()
    if not (_FBUILD_LIB_DIR / "library.json").exists():
        yield "\n=== vendoring FastLED (first run only) ===\n"
        _FBUILD_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
        rc = yield from _run_phase(
            "vendor FastLED",
            ["git", "clone", "--depth", "1", "https://github.com/FastLED/FastLED.git", str(_FBUILD_LIB_DIR)],
        )
        if rc != 0:
            yield "[error] failed to vendor FastLED — the build below will fail on FastLED.h\n"
    _fbuild_project_ready = True


_fbuild_audio_lib_ready = False


def _ensure_fbuild_audio_lib():
    """Vendor ESP32-audioI2S (schreibfaul1/ESP32-audioI2S), same rationale as
    `_ensure_fbuild_project`'s FastLED vendoring — fbuild 2.4.0's `lib_deps`
    registry resolution doesn't work. Only the Player sketch (`#include
    <Audio.h>`) needs this, so it's fetched lazily on first Player build rather
    than unconditionally for every compile."""
    global _fbuild_audio_lib_ready
    if _fbuild_audio_lib_ready:
        return
    if (_FBUILD_AUDIO_LIB_DIR / "library.json").exists():
        _fbuild_audio_lib_ready = True
        return
    yield "\n=== vendoring ESP32-audioI2S (first run only) ===\n"
    _FBUILD_AUDIO_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    rc = yield from _run_phase(
        "vendor ESP32-audioI2S",
        ["git", "clone", "--depth", "1", "https://github.com/schreibfaul1/ESP32-audioI2S.git", str(_FBUILD_AUDIO_LIB_DIR)],
    )
    if rc != 0:
        yield "[error] failed to vendor ESP32-audioI2S — the Player build below will fail on Audio.h\n"
    _fbuild_audio_lib_ready = True


def _write_fbuild_main(ino: str) -> None:
    # fbuild preprocesses `.ino` into `main.ino.cpp`, auto-inserting function
    # prototypes before any user includes. That breaks FastLED-typed helpers
    # such as `CRGB kelvinToRGB(...)` because `CRGB` is still unknown there.
    # Writing a plain `.cpp` sidesteps Arduino sketch preprocessing entirely.
    cpp = ino if "#include <Arduino.h>" in ino else f"#include <Arduino.h>\n{ino}"
    (_FBUILD_SRC_DIR / "main.cpp").write_text(cpp, encoding="utf-8")
    old_ino = _FBUILD_SRC_DIR / "main.ino"
    if old_ino.exists():
        old_ino.unlink()


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


def _run_phase(label, args, sink=None, cwd=None):
    """Run one build-tool phase (arduino-cli or fbuild), yielding its output
    lines; returns the exit code. If `sink` (a list) is given, each output line
    is also appended to it so the caller can inspect the phase output (e.g. to
    parse the flash/RAM size report)."""
    yield f"\n=== {label} ===\n$ {' '.join(args)}\n"
    try:
        proc = subprocess.Popen(
            args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1, env=_TOOLCHAIN_ENV, cwd=cwd,
        )
    except Exception as e:
        yield f"[error] failed to launch {args[0]}: {e}\n"
        return -1
    for line in proc.stdout:
        if sink is not None:
            sink.append(line)
        yield line
    proc.wait()
    yield f"[{label} exit code: {proc.returncode}]\n"
    return proc.returncode


# arduino-cli prints these at the end of a successful compile. The percentages
# are measured against the board's real limits (for ESP32 that's the app
# *partition*, not the whole chip), so parsing them is authoritative.
_FLASH_RE = re.compile(r"Sketch uses (\d+) bytes \((\d+)%\) of program storage", re.I)
_RAM_RE = re.compile(r"Global variables use (\d+) bytes \((\d+)%\) of dynamic memory", re.I)

# Substrings the linker/toolchain emit when the binary is too big to fit. These
# vary by core (AVR: "region `text' overflowed"; ESP32: "will not fit in
# region"; etc.), so match loosely — the compile has already failed regardless.
_OVERFLOW_MARKERS = (
    "overflowed by", "will not fit in region", "section exceeds",
    "does not fit in region", "sketch too big", "flash overflow",
    "not enough room", "exceeds the maximum",
)

# Warn (but still upload) once usage crosses this — little headroom left.
_SIZE_WARN_PCT = 90


def _size_report(lines):
    """Pull flash/RAM usage percentages out of a compile phase's output.
    Returns {"flash": pct|None, "ram": pct|None} (percentages, ints)."""
    text = "".join(lines)
    flash = _FLASH_RE.search(text)
    ram = _RAM_RE.search(text)
    return {
        "flash": int(flash.group(2)) if flash else None,
        "ram": int(ram.group(2)) if ram else None,
    }


def _looks_like_overflow(lines):
    text = "".join(lines).lower()
    return any(marker in text for marker in _OVERFLOW_MARKERS)


def _compile_upload(label, sketch_dir, fqbn, port):
    """Compile, then (if a port is given) upload a sketch. Returns
    (exit code, phase) where phase is "compile" or "upload" — the phase the
    run ended in, so callers can tailor the failure message (a compile failure
    never touched the board; only an upload failure warrants download-mode
    advice).

    Compiling is also the size gate: arduino-cli refuses to link a binary that
    overflows flash/RAM, so an over-capacity design fails here and never reaches
    the upload step. We translate that (otherwise cryptic) failure into a clear
    message, and on success surface the headroom / warn when it's tight."""
    compile_lines = []
    rc = yield from _run_phase(
        f"{label} · compile", _ARDUINO_BASE + ["compile", "-v", "--fqbn", fqbn, str(sketch_dir)],
        sink=compile_lines,
    )
    if rc != 0:
        # A capacity overflow is the interesting failure — say so plainly so the
        # UI can show "won't fit" instead of a wall of linker errors.
        if _looks_like_overflow(compile_lines):
            yield (
                f"\n=== ✗ Too big for {fqbn} ===\n"
                "  This design is larger than the board can hold. Try fewer\n"
                "  patterns in the collection, a smaller matrix, or fewer heavy\n"
                "  nodes (Image / audio / field) — or pick a board (or ESP32\n"
                "  partition scheme) with more space.\n"
                "  [size-error] won't fit on this board\n"
            )
        return rc, "compile"

    report = _size_report(compile_lines)
    if report["flash"] is not None:
        ram = f" · ram {report['ram']}%" if report["ram"] is not None else ""
        yield f"  [size] flash {report['flash']}%{ram}\n"
        tight = [
            f"{kind} {report[kind]}%"
            for kind in ("flash", "ram")
            if report[kind] is not None and report[kind] >= _SIZE_WARN_PCT
        ]
        if tight:
            yield f"  [size-warning] little headroom left ({', '.join(tight)})\n"

    if not port:
        yield "  (no port selected — compiled only)\n"
        return 0, "compile"
    rc = yield from _run_phase(f"{label} · upload", _ARDUINO_BASE + ["upload", "-v", "-p", port, "--fqbn", fqbn, str(sketch_dir)])
    return rc, "upload"


# fbuild prints its size report as e.g. "Flash: 4.45KB / 31.50KB (14.1%)" and
# "RAM:   367 bytes / 2.00KB (17.9%)" — same idea as arduino-cli's report, a
# different line shape.
_FBUILD_FLASH_RE = re.compile(r"Flash:\s*[\d.]+\s*\w*\s*/\s*[\d.]+\s*\w*\s*\((\d+(?:\.\d+)?)%\)", re.I)
_FBUILD_RAM_RE = re.compile(r"RAM:\s*[\d.]+\s*\w*\s*/\s*[\d.]+\s*\w*\s*\((\d+(?:\.\d+)?)%\)", re.I)


def _fbuild_size_report(lines):
    text = "".join(lines)
    flash = _FBUILD_FLASH_RE.search(text)
    ram = _FBUILD_RAM_RE.search(text)
    return {
        "flash": int(float(flash.group(1))) if flash else None,
        "ram": int(float(ram.group(1))) if ram else None,
    }


def _compile_upload_fbuild(label, ino, fqbn, port):
    """fbuild-engine counterpart to `_compile_upload` — same (rc, phase)
    contract, so callers don't need to know which engine ran."""
    yield from _ensure_fbuild_project()
    env = _fbuild_env_for_fqbn(fqbn)
    if env is None:
        yield f"\n=== ✗ {label}: no fbuild board mapping for {fqbn} ===\n"
        return -1, "compile"
    _write_fbuild_main(ino)

    compile_lines = []
    rc = yield from _run_phase(
        f"{label} · compile", [_FBUILD_BIN, "build", "-e", env, "-v", "--no-timestamp"],
        sink=compile_lines, cwd=_FBUILD_PROJECT_DIR,
    )
    if rc != 0:
        if _looks_like_overflow(compile_lines):
            yield (
                f"\n=== ✗ Too big for {fqbn} ===\n"
                "  This design is larger than the board can hold. Try fewer\n"
                "  patterns in the collection, a smaller matrix, or fewer heavy\n"
                "  nodes (Image / audio / field) — or pick a board (or ESP32\n"
                "  partition scheme) with more space.\n"
                "  [size-error] won't fit on this board\n"
            )
        return rc, "compile"

    report = _fbuild_size_report(compile_lines)
    if report["flash"] is not None:
        ram = f" · ram {report['ram']}%" if report["ram"] is not None else ""
        yield f"  [size] flash {report['flash']}%{ram}\n"
        tight = [
            f"{kind} {report[kind]}%"
            for kind in ("flash", "ram")
            if report[kind] is not None and report[kind] >= _SIZE_WARN_PCT
        ]
        if tight:
            yield f"  [size-warning] little headroom left ({', '.join(tight)})\n"

    if not port:
        yield "  (no port selected — compiled only)\n"
        return 0, "compile"
    rc = yield from _run_phase(
        f"{label} · upload", [_FBUILD_BIN, "deploy", "-e", env, "-p", port, "--skip-build", "--no-timestamp"],
        cwd=_FBUILD_PROJECT_DIR,
    )
    return rc, "upload"


def _upload_result_lines(rc, phase, port):
    """Shared status messaging after a compile/upload run, whichever engine ran it."""
    if rc == 0 and port:
        yield "\nUpload complete.\n"
    elif rc != 0 and phase == "compile":
        yield (f"\n*** BUILD FAILED (exit code {rc}) *** The sketch didn't compile, so "
               "nothing was sent to the board — see the errors above.\n")
    elif rc != 0:
        yield (f"\n*** UPLOAD FAILED (exit code {rc}) *** The sketch compiled, but flashing "
               "failed. If it couldn't connect, put the board in download mode "
               "(hold BOOT, tap RST) and retry.\n")


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
    """Liveness + which build engine is active + arduino-cli availability (so
    the UI can show status). `arduinoCli`/`version` are kept as-is even when
    fbuild is the active engine, since older frontend builds only read those."""
    version = None
    if _ARDUINO_CLI:
        try:
            proc = subprocess.run([_ARDUINO_CLI, "version"], capture_output=True, text=True, timeout=15)
            version = (proc.stdout or "").strip() or None
        except Exception:
            version = None
    fbuild_version = None
    if _FBUILD_BIN:
        try:
            proc = subprocess.run([_FBUILD_BIN, "--version"], capture_output=True, text=True, timeout=15)
            fbuild_version = (proc.stdout or "").strip() or None
        except Exception:
            fbuild_version = None
    return {
        "ok": True,
        "arduinoCli": bool(_ARDUINO_CLI),
        "version": version,
        "engine": _active_engine(),
        "fbuild": bool(_FBUILD_BIN),
        "fbuildVersion": fbuild_version,
    }


@app.get("/api/engine")
def get_engine():
    return {"ok": True, "engine": _active_engine(), "fbuild": bool(_FBUILD_BIN), "arduinoCli": bool(_ARDUINO_CLI)}


@app.post("/api/engine")
def set_engine(payload: dict = Body(...)):
    """Persist a build-engine preference. Body: {"engine": "fbuild" | "arduino-cli"}."""
    engine = (payload.get("engine") or "").strip()
    if engine not in ("fbuild", "arduino-cli"):
        return JSONResponse({"ok": False, "error": "engine must be 'fbuild' or 'arduino-cli'"}, status_code=400)
    cfg = _load_config()
    cfg["engine"] = engine
    _save_config(cfg)
    return {"ok": True, "engine": _active_engine()}


@app.get("/api/serial/ports")
def serial_ports():
    """List serial ports for the upload dropdown.

    Merges two sources so nothing is missed:
      1. `arduino-cli board list` — richer (includes matching board names/FQBNs).
      2. pyserial's OS-level enumeration — catches generic USB-serial adapters
         (CH340/CH343/CP210x/FTDI) that arduino-cli's discovery often does NOT
         report, which is why a CH343 (e.g. COM4) can show up in Device Manager
         yet be absent from the dropdown.
    Keyed by a normalised address so the same port from both sources is merged.
    """
    by_addr: dict[str, dict] = {}

    def norm(addr):
        return (addr or "").strip().upper()

    # 1) arduino-cli detected ports (board/FQBN matches when recognised)
    if _ARDUINO_CLI:
        try:
            proc = subprocess.run(
                _ARDUINO_BASE + ["board", "list", "--format", "json"],
                capture_output=True, text=True, timeout=30,
            )
            data = json.loads(proc.stdout or "{}")
            # arduino-cli 1.x: {"detected_ports": [{"port": {...}, "matching_boards": [...]}]}
            raw = data.get("detected_ports", data) if isinstance(data, dict) else data
            for entry in raw or []:
                port = entry.get("port", entry) if isinstance(entry, dict) else {}
                if port.get("protocol") and port.get("protocol") != "serial":
                    continue  # skip network ports
                addr = port.get("address")
                if not addr:
                    continue
                boards = entry.get("matching_boards") or [] if isinstance(entry, dict) else []
                by_addr[norm(addr)] = {
                    "address": addr,
                    "label": port.get("label") or addr,
                    "protocol": port.get("protocol", "serial"),
                    "boards": [{"name": b.get("name"), "fqbn": b.get("fqbn")} for b in boards],
                }
        except Exception:
            pass  # fall through to pyserial below

    # 2) pyserial OS-level ports (the catch-all)
    try:
        from serial.tools import list_ports
        for p in list_ports.comports():
            key = norm(p.device)
            if not key:
                continue
            desc = (p.description or "").strip()
            label = f"{p.device} ({desc})" if desc and desc.lower() != "n/a" else p.device
            if key in by_addr:
                # Enrich a bare arduino-cli entry with the OS description.
                if by_addr[key]["label"] in (p.device, None) and desc:
                    by_addr[key]["label"] = label
            else:
                by_addr[key] = {"address": p.device, "label": label, "protocol": "serial", "boards": []}
    except Exception:
        pass

    return {"ok": True, "ports": sorted(by_addr.values(), key=lambda x: x["address"])}


@app.get("/api/serial/monitor")
def serial_monitor(port: str, baud: int = 115200):
    """Stream text received from a board until the browser disconnects.

    The endpoint owns the port only for the lifetime of this response.  That
    keeps serial monitoring opt-in and lets an upload reclaim the same port as
    soon as the frontend aborts the stream.
    """
    if not port:
        return JSONResponse({"ok": False, "error": "a serial port is required"}, status_code=400)
    if baud < 300 or baud > 4_000_000:
        return JSONResponse({"ok": False, "error": "unsupported baud rate"}, status_code=400)
    if _stream_active() and _stream_port == port:
        return JSONResponse({"ok": False, "error": "port is in use by a live stream — stop it first"}, status_code=409)

    def stream():
        try:
            import serial
        except ImportError:
            yield b"[error] pyserial is not installed\n"
            return

        ser = None
        try:
            ser = serial.Serial(port, baud, timeout=0.2)
            # Avoid deliberately asserting the common auto-reset lines while
            # monitoring. Some USB bridges may still pulse them when opened.
            ser.dtr = False
            ser.rts = False
            yield f"[serial] connected to {port} at {baud} baud\n".encode()
            while True:
                data = ser.read(ser.in_waiting or 1)
                if data:
                    yield data
        except GeneratorExit:
            return
        except Exception as e:
            yield f"[error] {e}\n".encode(errors="replace")
        finally:
            if ser is not None and ser.is_open:
                ser.close()

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")


# ── Live streaming (Adalight) ─────────────────────────────────────────────────
# A lightweight alternative to a compile+flash cycle: once the tiny generic
# Adalight receiver sketch (src/codegen/streamReceiverGenerator.ts) is flashed
# once, the already-computed live-preview frames can be pushed straight to the
# board over the same serial port at interactive rates. Unlike every other
# serial use in this file, the port has to stay open *across* many small
# per-frame requests (reopening it every frame would blow the frame budget),
# so it's held in module state between /api/stream/start and /api/stream/stop
# rather than scoped to one request's generator lifetime.
_stream_lock = threading.Lock()
_stream_serial = None
_stream_port: str | None = None
_stream_baud: int = 0


def _stream_active() -> bool:
    return _stream_serial is not None


@app.post("/api/stream/start")
def stream_start(payload: dict = Body(...)):
    """Open (or reuse) a serial port for a live-streaming session.

    Body: {"port": "COM5", "baud": 115200}.
    """
    global _stream_serial, _stream_port, _stream_baud
    port = (payload.get("port") or "").strip()
    baud = int(payload.get("baud") or 115200)
    if not port:
        return JSONResponse({"ok": False, "error": "a serial port is required"}, status_code=400)
    try:
        import serial
    except ImportError:
        return JSONResponse({"ok": False, "error": "pyserial is not installed"}, status_code=500)
    with _stream_lock:
        if _stream_serial is not None:
            if _stream_port == port and _stream_baud == baud:
                return {"ok": True}
            try:
                _stream_serial.close()
            except Exception:
                pass
            _stream_serial = None
        try:
            ser = serial.Serial(port, baud, timeout=0)
            # Avoid pulsing the common auto-reset lines on open — the receiver
            # sketch is already running, a reset would just show a black frame.
            ser.dtr = False
            ser.rts = False
        except Exception as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=400)
        _stream_serial = ser
        _stream_port = port
        _stream_baud = baud
    return {"ok": True}


@app.post("/api/stream/frame")
async def stream_frame(request: Request):
    """Write one pre-framed Adalight packet straight to the open stream port.

    The body is already the exact bytes to send (header + checksum + RGB data,
    built client-side by `src/utils/adalight.ts`) — this endpoint is deliberately
    just a thin pipe so per-frame overhead stays minimal.
    """
    body = await request.body()
    with _stream_lock:
        if _stream_serial is None:
            return JSONResponse({"ok": False, "error": "stream not started"}, status_code=409)
        try:
            _stream_serial.write(body)
        except Exception as e:
            # A write failure (e.g. the board was unplugged) ends the session —
            # the frontend should call /api/stream/start again to resume.
            try:
                _stream_serial.close()
            except Exception:
                pass
            _stream_serial = None
            return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True}


@app.post("/api/stream/stop")
def stream_stop():
    global _stream_serial, _stream_port, _stream_baud
    with _stream_lock:
        if _stream_serial is not None:
            try:
                _stream_serial.close()
            except Exception:
                pass
        _stream_serial = None
        _stream_port = None
        _stream_baud = 0
    return {"ok": True}


@app.get("/api/stream/status")
def stream_status():
    return {"ok": True, "streaming": _stream_active(), "port": _stream_port, "baud": _stream_baud}


# ── arduino-cli management ────────────────────────────────────────────────────
@app.post("/api/arduino-cli/locate")
def locate_cli(payload: dict = Body(...)):
    """Point the helper at a user-supplied arduino-cli binary and persist it.

    Body: {"path": "C:/tools/arduino-cli.exe"}. Validated by running `version`.
    """
    path = (payload.get("path") or "").strip().strip('"')
    if not path or not Path(path).exists():
        return JSONResponse({"ok": False, "error": "no file at that path"}, status_code=400)
    try:
        proc = subprocess.run([path, "version"], capture_output=True, text=True, timeout=20)
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.strip() or "non-zero exit")
    except Exception as e:
        return JSONResponse({"ok": False, "error": f"not a working arduino-cli: {e}"}, status_code=400)
    cfg = _load_config()
    cfg["arduinoCli"] = path
    _save_config(cfg)
    _refresh_cli()
    return {"ok": True, "version": (proc.stdout or "").strip()}


def _cli_asset() -> tuple[str, str, str] | None:
    """(asset-name, archive-ext, binary-name) for this OS/arch, or None."""
    sys_, mach = platform.system(), platform.machine().lower()
    if sys_ == "Windows":
        return ("Windows_64bit", "zip", "arduino-cli.exe")
    if sys_ == "Linux":
        arch = "ARM64" if mach in ("aarch64", "arm64") else "64bit"
        return (f"Linux_{arch}", "tar.gz", "arduino-cli")
    if sys_ == "Darwin":
        arch = "ARM64" if mach in ("aarch64", "arm64") else "64bit"
        return (f"macOS_{arch}", "tar.gz", "arduino-cli")
    return None


@app.post("/api/arduino-cli/install")
def install_cli():
    """Download the official arduino-cli binary into backend/bin and use it.
    Streams progress as text."""
    asset = _cli_asset()

    def stream():
        if not asset:
            yield f"[error] no arduino-cli build for {platform.system()}/{platform.machine()}\n"
            return
        name, ext, binary = asset
        url = f"https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_{name}.{ext}"
        yield f"Downloading {url}\n"
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                total = int(resp.headers.get("Content-Length") or 0)
                buf = io.BytesIO()
                read = 0
                last = -1
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    buf.write(chunk)
                    read += len(chunk)
                    if total:
                        pct = read * 100 // total
                        if pct != last and pct % 10 == 0:
                            last = pct
                            yield f"  …{pct}%\n"
                buf.seek(0)
        except Exception as e:
            yield f"[error] download failed: {e}\n"
            return

        yield "Extracting…\n"
        try:
            _BIN_DIR.mkdir(parents=True, exist_ok=True)
            dest = _BIN_DIR / binary
            if ext == "zip":
                with zipfile.ZipFile(buf) as zf:
                    member = next(m for m in zf.namelist() if m.endswith(binary))
                    dest.write_bytes(zf.read(member))
            else:
                with tarfile.open(fileobj=buf, mode="r:gz") as tf:
                    member = next(m for m in tf.getmembers() if m.name.endswith(binary))
                    src = tf.extractfile(member)
                    dest.write_bytes(src.read() if src else b"")
            if os.name != "nt":
                dest.chmod(0o755)
        except Exception as e:
            yield f"[error] extract failed: {e}\n"
            return

        cfg = _load_config()
        cfg["arduinoCli"] = str(dest)
        _save_config(cfg)
        _refresh_cli()
        # Initialise a config so cores/libs can be installed afterwards.
        try:
            subprocess.run(_ARDUINO_BASE + ["config", "init"], capture_output=True, text=True, timeout=30)
        except Exception:
            pass
        yield f"arduino-cli installed at {dest}\n"

    return StreamingResponse(stream(), media_type="text/plain")


@app.get("/api/cores")
def cores():
    """List installed board cores (so the board manager can show status)."""
    if not _ARDUINO_CLI:
        return {"ok": False, "cores": []}
    try:
        proc = subprocess.run(
            _ARDUINO_BASE + ["core", "list", "--format", "json"],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(proc.stdout or "[]")
    except Exception as e:
        return {"ok": False, "error": str(e), "cores": []}
    # arduino-cli 1.x: {"platforms": [{"id": ...}]}; older: a bare list.
    items = data.get("platforms", data) if isinstance(data, dict) else data
    ids = [p.get("id") for p in (items or []) if isinstance(p, dict) and p.get("id")]
    return {"ok": True, "cores": ids}


@app.post("/api/core/install")
def core_install(payload: dict = Body(...)):
    """Install a board core (and the FastLED lib), streaming progress as text.

    Body: {"core": "esp32:esp32"}. For third-party cores the matching
    board-manager URL is registered first.
    """
    if not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    core = (payload.get("core") or "").strip()
    if not core:
        return JSONResponse({"ok": False, "error": "no core given"}, status_code=400)

    def stream():
        url = _CORE_URLS.get(core)
        if url:
            yield from _run_phase(
                "register board URL",
                _ARDUINO_BASE + ["config", "add", "board_manager.additional_urls", url],
            )
        rc = yield from _run_phase("update index", _ARDUINO_BASE + ["core", "update-index"])
        rc = yield from _run_phase(f"install {core}", _ARDUINO_BASE + ["core", "install", core])
        if rc == 0:
            yield from _run_phase("install FastLED", _ARDUINO_BASE + ["lib", "install", "FastLED"])
            yield f"\n{core} ready.\n"
        else:
            yield f"\n*** core install failed (exit {rc}) ***\n"

    return StreamingResponse(stream(), media_type="text/plain")


@app.post("/api/upload")
def upload(payload: dict = Body(...)):
    """Compile a raw `.ino` and upload it to the board, streaming logs as text.

    Body: {"ino": "<sketch source>", "fqbn": "esp32:esp32:esp32s3", "port": "COM5"}.
    Compiles first; uploads only if that succeeds and a port was given.
    """
    engine = _active_engine()
    if engine == "fbuild" and not _FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    ino = payload.get("ino") or ""
    fqbn = (payload.get("fqbn") or _DEFAULT_FQBN).strip()
    port = (payload.get("port") or "").strip()
    if port and _stream_active() and _stream_port == port:
        return JSONResponse({"ok": False, "error": "port is in use by a live stream — stop it first"}, status_code=409)

    if engine == "fbuild":
        def stream():
            rc, phase = yield from _compile_upload_fbuild("Sketch", ino, fqbn, port)
            yield from _upload_result_lines(rc, phase, port)
        return StreamingResponse(stream(), media_type="text/plain")

    work, sketch_dir = _make_sketch(SKETCH, ino)

    def stream():
        try:
            rc, phase = yield from _compile_upload("Sketch", sketch_dir, fqbn, port)
            yield from _upload_result_lines(rc, phase, port)
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
    engine = _active_engine()
    if engine == "fbuild" and not _FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    info = json.loads(meta)
    fqbn = (info.get("fqbn") or _DEFAULT_FQBN).strip()
    port = (info.get("port") or "").strip()
    if port and _stream_active() and _stream_port == port:
        return JSONResponse({"ok": False, "error": "port is in use by a live stream — stop it first"}, status_code=409)
    paths = info.get("paths") or []
    # Read every upload into memory now (sync generator can't await later).
    payloads = []
    for i, uf in enumerate(files):
        data = await uf.read()
        payloads.append((paths[i] if i < len(paths) else f"/{uf.filename}", data))

    def _build_flash(label, ino, work_slot):
        """Compile+flash one sketch (provisioner or player) through the active
        engine. `work_slot` is a single-item list used as an out-param for the
        arduino-cli temp dir, so the caller's `finally` can clean it up."""
        if engine == "fbuild":
            if label == "Player":
                yield from _ensure_fbuild_audio_lib()
            return (yield from _compile_upload_fbuild(label, ino, fqbn, port))
        work, sketch_dir = _make_sketch(label.lower(), ino)
        work_slot[0] = work
        return (yield from _compile_upload(label, sketch_dir, fqbn, port))

    def stream():
        prov_work: list = [None]
        play_work: list = [None]
        try:
            if not port:
                yield "[error] a serial port is required to write the SD card\n"
                return
            rc, phase = yield from _build_flash("Provisioner", provisioner, prov_work)
            if rc != 0:
                yield (f"\n*** Provisioner build failed (exit {rc}) — nothing was flashed ***\n"
                       if phase == "compile" else
                       f"\n*** Provisioner flash failed (exit {rc}) — if it couldn't connect, put "
                       "the board in download mode (hold BOOT, tap RST) and retry ***\n")
                return
            ok = yield from _serial_send(port, payloads)
            if not ok:
                yield "\n*** SD transfer failed — not flashing the player ***\n"
                return
            rc, phase = yield from _build_flash("Player", player, play_work)
            if rc == 0:
                yield "\nAll done — songs/shows are on the card and the player is flashed.\n"
            else:
                yield (f"\n*** Player build failed (exit {rc}) — the board is still running the provisioner ***\n"
                       if phase == "compile" else
                       f"\n*** Player flash failed (exit {rc}) — if it couldn't connect, put the "
                       "board in download mode (hold BOOT, tap RST) and retry ***\n")
        finally:
            for w in (prov_work[0], play_work[0]):
                if w:
                    shutil.rmtree(w, ignore_errors=True)

    return StreamingResponse(stream(), media_type="text/plain")


# ── Saved patterns ("My Patterns") ────────────────────────────────────────────
# Each pattern is one JSON file (the SavedPattern the frontend store uses). The
# pattern's `id` is the stable identity; the filename is derived from its name
# purely so the folder is human-readable and shareable.
import re as _re  # local alias — only the patterns endpoints need it


def _sanitize_filename(name: str) -> str:
    """A safe, human-readable basename for a pattern file. Strips path
    separators and characters illegal on Windows, collapses whitespace, and
    trims length — never returns something that could escape the folder."""
    cleaned = _re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name or "").strip().rstrip(". ")
    cleaned = _re.sub(r"\s+", " ", cleaned)
    return cleaned[:80] or "pattern"


def _patterns_dir() -> Path:
    _PATTERNS_DIR.mkdir(parents=True, exist_ok=True)
    return _PATTERNS_DIR


def _projects_dir() -> Path:
    _PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    return _PROJECTS_DIR


def _iter_pattern_files():
    try:
        return sorted(_patterns_dir().glob("*.json"))
    except Exception:
        return []


def _iter_project_files():
    try:
        return sorted(_projects_dir().glob("*.json"))
    except Exception:
        return []


def _remove_files_for_id(pattern_id: str) -> None:
    """Delete any existing file(s) holding this pattern id, so a save that
    renames (and thus changes the derived filename) doesn't leave a stale copy."""
    for f in _iter_pattern_files():
        try:
            if json.loads(f.read_text(encoding="utf-8")).get("id") == pattern_id:
                f.unlink(missing_ok=True)
        except Exception:
            continue


def _remove_project_files_for_id(project_id: str) -> None:
    for f in _iter_project_files():
        try:
            if json.loads(f.read_text(encoding="utf-8")).get("id") == project_id:
                f.unlink(missing_ok=True)
        except Exception:
            continue


def _unique_path(base: str, pattern_id: str) -> Path:
    """`<base>.json`, disambiguated only when a *different* pattern already owns
    that filename (rare — two patterns sharing a name)."""
    d = _patterns_dir()
    candidate = d / f"{base}.json"
    if candidate.exists():
        try:
            if json.loads(candidate.read_text(encoding="utf-8")).get("id") != pattern_id:
                candidate = d / f"{base}-{pattern_id}.json"
        except Exception:
            candidate = d / f"{base}-{pattern_id}.json"
    return candidate


def _unique_project_path(base: str, project_id: str) -> Path:
    d = _projects_dir()
    candidate = d / f"{base}{_PROJECT_FILE_SUFFIX}"
    if candidate.exists():
        try:
            if json.loads(candidate.read_text(encoding="utf-8")).get("id") != project_id:
                candidate = d / f"{base}-{project_id}{_PROJECT_FILE_SUFFIX}"
        except Exception:
            candidate = d / f"{base}-{project_id}{_PROJECT_FILE_SUFFIX}"
    return candidate


def _project_name_from_filename(name: str) -> str:
    base = re.sub(r"\.fastled-project\.json$", "", name, flags=re.I)
    base = re.sub(r"\.json$", "", base, flags=re.I)
    return base.strip() or "Untitled Project"


def _ensure_project_file_path(path: Path) -> Path:
    text = str(path)
    if text.lower().endswith(_PROJECT_FILE_SUFFIX.lower()):
        return path
    if text.lower().endswith(".json"):
        text = text[:-5]
    return Path(f"{text}{_PROJECT_FILE_SUFFIX}")


def _show_windows_save_dialog(initial_dir: Path, initial_file: str) -> str | None:
    env = {
        **os.environ,
        "FLS_DIALOG_INITIAL_DIR": str(initial_dir),
        "FLS_DIALOG_FILE_NAME": initial_file,
    }
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$dialog = New-Object System.Windows.Forms.SaveFileDialog; "
        "$dialog.InitialDirectory = $env:FLS_DIALOG_INITIAL_DIR; "
        "$dialog.FileName = $env:FLS_DIALOG_FILE_NAME; "
        "$dialog.Filter = 'FastLED Studio Project (*.fastled-project.json)|*.fastled-project.json|All Files (*.*)|*.*'; "
        "$dialog.AddExtension = $true; "
        "$dialog.DefaultExt = 'fastled-project.json'; "
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }"
    )
    res = subprocess.run(
        ["powershell", "-NoProfile", "-STA", "-Command", script],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    return (res.stdout or "").strip() or None


def _show_windows_open_dialog(initial_dir: Path) -> str | None:
    env = {
        **os.environ,
        "FLS_DIALOG_INITIAL_DIR": str(initial_dir),
    }
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$dialog = New-Object System.Windows.Forms.OpenFileDialog; "
        "$dialog.InitialDirectory = $env:FLS_DIALOG_INITIAL_DIR; "
        "$dialog.Filter = 'FastLED Studio Project (*.json)|*.json|All Files (*.*)|*.*'; "
        "$dialog.Multiselect = $false; "
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }"
    )
    res = subprocess.run(
        ["powershell", "-NoProfile", "-STA", "-Command", script],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    return (res.stdout or "").strip() or None


def _show_tk_save_dialog(initial_dir: Path, initial_file: str) -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    try:
        path = filedialog.asksaveasfilename(
            parent=root,
            title="Save Project",
            initialdir=str(initial_dir),
            initialfile=initial_file,
            defaultextension=".fastled-project.json",
            filetypes=[
                ("FastLED Studio Project", "*.fastled-project.json"),
                ("All Files", "*.*"),
            ],
        )
        return path or None
    finally:
        root.destroy()


def _show_tk_open_dialog(initial_dir: Path) -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    try:
        path = filedialog.askopenfilename(
            parent=root,
            title="Open Project",
            initialdir=str(initial_dir),
            filetypes=[
                ("FastLED Studio Project", "*.json"),
                ("JSON", "*.json"),
                ("All Files", "*.*"),
            ],
        )
        return path or None
    finally:
        root.destroy()


def _show_project_save_dialog(initial_file: str) -> Path | None:
    initial_dir = _projects_dir()
    try:
        if platform.system() == "Windows":
            chosen = _show_windows_save_dialog(initial_dir, initial_file)
        else:
            chosen = _show_tk_save_dialog(initial_dir, initial_file)
    except Exception:
        try:
            chosen = _show_tk_save_dialog(initial_dir, initial_file)
        except Exception:
            return None
    return Path(chosen) if chosen else None


def _show_project_open_dialog() -> Path | None:
    initial_dir = _projects_dir()
    try:
        if platform.system() == "Windows":
            chosen = _show_windows_open_dialog(initial_dir)
        else:
            chosen = _show_tk_open_dialog(initial_dir)
    except Exception:
        try:
            chosen = _show_tk_open_dialog(initial_dir)
        except Exception:
            return None
    return Path(chosen) if chosen else None


@app.get("/api/patterns")
def list_patterns():
    """Every saved pattern on disk, newest first. `[]` when the folder is empty."""
    out = []
    for f in _iter_pattern_files():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("id") and data.get("name"):
                out.append(data)
        except Exception:
            continue  # skip an unreadable/hand-broken file rather than 500
    out.sort(key=lambda p: p.get("createdAt", 0), reverse=True)
    return {"ok": True, "dir": str(_PATTERNS_DIR), "patterns": out}


@app.post("/api/patterns")
def save_pattern(pattern: dict = Body(...)):
    """Write one pattern to its own file. Overwrites any existing file with the
    same `id` (so renames don't orphan the old file)."""
    pid = str(pattern.get("id") or "").strip()
    name = str(pattern.get("name") or "").strip()
    if not pid or not name or "subgraph" not in pattern:
        return JSONResponse({"ok": False, "error": "pattern needs id, name and subgraph"}, status_code=400)
    _remove_files_for_id(pid)
    path = _unique_path(_sanitize_filename(name), pid)
    # Defence in depth: never write outside the patterns folder.
    if _patterns_dir().resolve() not in path.resolve().parents:
        return JSONResponse({"ok": False, "error": "invalid pattern name"}, status_code=400)
    try:
        path.write_text(json.dumps(pattern, indent=2), encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "file": path.name}


@app.delete("/api/patterns/{pattern_id}")
def delete_pattern(pattern_id: str):
    """Delete the file(s) holding this pattern id."""
    _remove_files_for_id(pattern_id)
    return {"ok": True}


def _focus_windows_explorer(folder_name: str) -> bool:
    """Bring an already-open Explorer window for `folder_name` to the front.

    `os.startfile` reuses an existing Explorer window for the folder rather
    than opening a new one, and Windows' focus-stealing prevention then leaves
    that window sitting behind whatever app currently has focus (the browser).
    A single trick rarely beats that heuristic reliably across Windows
    versions, so this stacks three, checking `SetForegroundWindow`'s return
    value (0 = still blocked) before escalating:
      1. `AttachThreadInput` to the foreground thread + zero the
         foreground-lock timeout for the duration of the call.
      2. Minimize-then-restore — restoring from the taskbar is specifically
         exempt from the lock, so this forces the exemption path.
      3. Synthesize an Alt keypress first — a real input event on our thread
         resets the "last input" state the lock heuristic checks.
    Best-effort throughout: returns False (never raises) if the window can't
    be found, or all three still fail to focus it."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    # Explicit signatures — without these, ctypes defaults return types to
    # `c_int` (32-bit), silently truncating HWNDs on 64-bit Windows and making
    # every call below a no-op with no exception to show for it.
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.SetForegroundWindow.restype = wintypes.BOOL
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
    kernel32.GetCurrentThreadId.restype = wintypes.DWORD

    found: list[int] = []
    seen_titles: list[str] = []  # every Explorer window seen, for diagnostics if nothing matches

    # Substring, case-insensitive: with Explorer's "show full path in title
    # bar" option on, the title is the whole path (e.g. `...\My Patterns`),
    # not the bare folder name — an exact match would silently find nothing,
    # every time, on any machine with that option set.
    needle = folder_name.lower()

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def _enum(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, title, length + 1)
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        if cls.value in ("CabinetWClass", "ExploreWClass"):
            seen_titles.append(title.value)
            if needle in title.value.lower():
                found.append(hwnd)
        return True

    user32.EnumWindows(_enum, 0)
    if not found:
        print(f"[reveal] no Explorer window title matched {needle!r}; open Explorer windows: {seen_titles}")
        return False
    hwnd = found[-1]

    SPI_GETFOREGROUNDLOCKTIMEOUT = 0x2000
    SPI_SETFOREGROUNDLOCKTIMEOUT = 0x2001
    SPIF_SENDCHANGE = 0x2
    VK_MENU = 0x12
    KEYEVENTF_KEYUP = 0x2

    old_timeout = wintypes.DWORD(0)
    user32.SystemParametersInfoW(SPI_GETFOREGROUNDLOCKTIMEOUT, 0, ctypes.byref(old_timeout), 0)
    user32.SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, 0, SPIF_SENDCHANGE)

    fg_hwnd = user32.GetForegroundWindow()
    cur_thread = kernel32.GetCurrentThreadId()
    fg_thread = user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0
    attached = bool(fg_thread and fg_thread != cur_thread and user32.AttachThreadInput(cur_thread, fg_thread, True))
    try:
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE — un-minimize if needed
        ok = bool(user32.SetForegroundWindow(hwnd))

        if not ok:  # try #2: minimize-then-restore's exemption from the lock
            user32.ShowWindow(hwnd, 6)  # SW_MINIMIZE
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            ok = bool(user32.SetForegroundWindow(hwnd))

        if not ok:  # try #3: a synthesized Alt keypress resets the input lock
            user32.keybd_event(VK_MENU, 0, 0, 0)
            ok = bool(user32.SetForegroundWindow(hwnd))
            user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)

        user32.BringWindowToTop(hwnd)
    finally:
        if attached:
            user32.AttachThreadInput(cur_thread, fg_thread, False)
        user32.SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, old_timeout, SPIF_SENDCHANGE)
    return ok


@app.post("/api/patterns/reveal")
def reveal_patterns_folder():
    """Open the "My Patterns" folder in the OS file manager, focused."""
    path = _patterns_dir()
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(str(path))  # noqa: S606 — local-only helper, fixed folder
            # The window may take a beat to appear (new) or update (reused).
            for _ in range(20):
                try:
                    if _focus_windows_explorer(path.name):
                        break
                except Exception:
                    pass
                time.sleep(0.1)
        elif system == "Darwin":
            subprocess.run(["open", str(path)], check=True)
        else:
            subprocess.run(["xdg-open", str(path)], check=True)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True}


@app.get("/api/projects")
def list_projects():
    """Every saved project on disk, newest first."""
    out = []
    for f in _iter_project_files():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            workspace = data.get("workspace")
            if (isinstance(data, dict) and data.get("id") and data.get("name")
                    and isinstance(workspace, dict) and isinstance(workspace.get("nodes"), list)
                    and isinstance(workspace.get("edges"), list)):
                out.append(data)
        except Exception:
            continue
    out.sort(key=lambda project: project.get("updatedAt", project.get("createdAt", 0)), reverse=True)
    return {"ok": True, "dir": str(_PROJECTS_DIR), "projects": out}


@app.post("/api/projects")
def save_project(project: dict = Body(...)):
    """Write one project to its own file. Overwrites by stable id."""
    pid = str(project.get("id") or "").strip()
    name = str(project.get("name") or "").strip()
    workspace = project.get("workspace")
    if (not pid or not name or not isinstance(workspace, dict)
            or not isinstance(workspace.get("nodes"), list) or not isinstance(workspace.get("edges"), list)):
        return JSONResponse({"ok": False, "error": "project needs id, name and workspace"}, status_code=400)
    _remove_project_files_for_id(pid)
    path = _unique_project_path(_sanitize_filename(name), pid)
    if _projects_dir().resolve() not in path.resolve().parents:
        return JSONResponse({"ok": False, "error": "invalid project name"}, status_code=400)
    try:
        path.write_text(json.dumps(project, indent=2), encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "file": path.name}


@app.post("/api/projects/dialog/open")
def open_project_dialog():
    """Open a native OS file dialog and return the chosen project's raw JSON."""
    path = _show_project_open_dialog()
    if not path:
        return {"ok": False, "canceled": True}
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "canceled": False, "text": text, "name": path.name}


@app.post("/api/projects/dialog/save")
def save_project_dialog(project: dict = Body(...)):
    """Open a native OS save dialog, write the chosen project file, and return the saved payload."""
    pid = str(project.get("id") or "").strip()
    name = str(project.get("name") or "").strip()
    workspace = project.get("workspace")
    if (not pid or not name or not isinstance(workspace, dict)
            or not isinstance(workspace.get("nodes"), list) or not isinstance(workspace.get("edges"), list)):
        return JSONResponse({"ok": False, "error": "project needs id, name and workspace"}, status_code=400)

    initial_file = f"{_sanitize_filename(name)}{_PROJECT_FILE_SUFFIX}"
    path = _show_project_save_dialog(initial_file)
    if not path:
        return {"ok": False, "canceled": True}
    path = _ensure_project_file_path(path)

    saved_project = {
        **project,
        "name": _project_name_from_filename(path.name),
    }
    try:
        path.write_text(json.dumps(saved_project, indent=2), encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "canceled": False, "project": saved_project, "path": str(path)}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    """Delete the file(s) holding this project id."""
    _remove_project_files_for_id(project_id)
    return {"ok": True}
