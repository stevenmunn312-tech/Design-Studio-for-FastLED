"""Design Studio for FastLED — local upload helper.

A tiny FastAPI service the browser app talks to so it can compile and upload
sketches to a board over USB — the browser can't launch a local CLI itself.
Mirrors the proven setup from the Matrix Studio backend.

Two build engines are supported: `arduino-cli` (the default when installed)
and `fbuild` (FastLED's own PlatformIO-compatible build tool, available as an
explicit experimental choice). `_active_engine()` picks one; `/api/engine`
lets the UI query or override the choice.

Run (from the repo root):

    python -m venv backend/.venv
    backend/.venv/Scripts/activate            # Windows  (or: source backend/.venv/bin/activate)
    pip install -r backend/requirements.txt
    uvicorn app:app --reload --port 8008 --app-dir backend

Every endpoint degrades gracefully when neither engine is installed, so the
studio keeps working (it just falls back to showing copy-paste commands).
"""
from __future__ import annotations

import codecs
import contextlib
import functools
import io
import json
import os
import platform
import re
import shutil
import socket
import stat
import subprocess
import sys
import sysconfig
import tarfile
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

import asyncio
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
# A frozen desktop bundle is normally installed in a read-only/application
# directory, so all mutable helper state can be redirected to a per-user data
# root. Source checkouts keep the historical backend-local paths when the env
# var is absent.
_DATA_DIR = Path(os.environ.get("FLS_DATA_DIR") or _HELPER_DIR)
_CONTENT_DIR = _DATA_DIR if os.environ.get("FLS_DATA_DIR") else _HELPER_DIR.parent
_CONFIG_PATH = _DATA_DIR / ".helper-config.json"
_BIN_DIR = _DATA_DIR / "bin"  # where a self-installed arduino-cli lands

# Saved node-graph patterns ("My Patterns") live as one JSON file each in this
# folder at the repo root, so users can share a pattern by simply sending the
# file. The browser can't write arbitrary folders, so it round-trips through the
# /api/patterns endpoints below. Override the location with FLS_PATTERNS_DIR.
_PATTERNS_DIR = Path(os.environ.get("FLS_PATTERNS_DIR") or (_CONTENT_DIR / "My Patterns"))
_PROJECT_FILE_SUFFIX = ".fastled-project.json"
_PROJECTS_DIR = Path(os.environ.get("FLS_PROJECTS_DIR") or (_CONTENT_DIR / "Projects"))

# Board-manager URLs for the third-party cores we can install, so `core install`
# works against a fresh CLI that has never seen them.
_CORE_URLS = {
    "esp32:esp32": "https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json",
    "rp2040:rp2040": "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json",
    "teensy:avr": "https://www.pjrc.com/teensy/package_teensy_index.json",
    "esp8266:esp8266": "http://arduino.esp8266.com/stable/package_esp8266com_index.json",
    "adafruit:samd": "https://adafruit.github.io/arduino-board-index/package_adafruit_index.json",
    "adafruit:nrf52": "https://adafruit.github.io/arduino-board-index/package_adafruit_index.json",
    "STMicroelectronics:stm32": "https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json",
}


def _core_version_fields(entry: dict) -> tuple[str, str, str]:
    """Return (id, installed, latest) from one `core list --format json` entry.
    Handles both the older (`ID`/`Installed`/`Latest`) and current
    (`id`/`installed_version`/`latest_version`) arduino-cli JSON key casing."""
    cid = entry.get("id") or entry.get("ID") or ""
    installed = entry.get("installed_version") or entry.get("Installed") or ""
    latest = entry.get("latest_version") or entry.get("Latest") or ""
    return cid, installed, latest


def _load_config() -> dict:
    try:
        return json.loads(_CONFIG_PATH.read_text())
    except Exception:
        return {}


def _save_config(cfg: dict) -> None:
    try:
        _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
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
# own toolchain/framework on first use. It remains available as an explicit
# experimental choice, but arduino-cli is the default while fbuild's confirmed
# ESP32 no-op delay is unresolved (see `_active_engine`).
_FBUILD_BIN: str | None = None
_ESPTOOL_BIN: str | None = None


def _find_fbuild() -> str | None:
    saved = _load_config().get("fbuild")
    if saved and Path(saved).exists():
        return saved
    env = os.environ.get("FBUILD_BIN")
    if env and Path(env).exists():
        return env
    return shutil.which("fbuild")


def _refresh_fbuild() -> None:
    global _FBUILD_BIN, _ESPTOOL_BIN
    _FBUILD_BIN = _find_fbuild()
    _ESPTOOL_BIN = _find_interpreter_esptool()


def _find_interpreter_esptool() -> str | None:
    """Resolve the esptool installed with this helper's Python runtime.

    fbuild 2.5.21 still spawns ``esptool`` by bare name. It forwards the
    requesting client's PATH to its long-lived daemon (FastLED/fbuild#1234),
    so putting this exact directory first binds that spawn to the esptool from
    our pinned requirements instead of whichever unrelated copy happens to be
    on the machine-wide PATH. Frozen desktop builds carry the executable in
    their sibling ``tools`` directory rather than a Python scripts directory.
    """
    executable = "esptool.exe" if os.name == "nt" else "esptool"
    candidates = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "tools" / executable)
    try:
        scripts = sysconfig.get_path("scripts")
    except (AttributeError, KeyError, TypeError):
        scripts = None
    if scripts:
        candidates.append(Path(scripts) / executable)
    # A venv on POSIX and some Windows Python layouts put console scripts
    # directly beside the interpreter.
    candidates.append(Path(sys.executable).resolve().parent / executable)
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


_refresh_fbuild()


def _active_engine() -> str:
    """Which build engine to use. A saved `engine` preference wins if that
    engine is actually available; otherwise prefer arduino-cli. fbuild remains
    the automatic fallback when it is the only installed engine."""
    saved = _load_config().get("engine")
    if saved == "fbuild" and _FBUILD_BIN:
        return "fbuild"
    if saved == "arduino-cli" and _ARDUINO_CLI:
        return "arduino-cli"
    return "arduino-cli" if _ARDUINO_CLI else ("fbuild" if _FBUILD_BIN else "arduino-cli")


# ── fbuild project scaffold ───────────────────────────────────────────────────
# fbuild runs a persistent background daemon bound to whichever project
# directory first started it, so (unlike arduino-cli) each compile can't use a
# fresh temp directory — everything shares this one stable project. Only
# `src/main.ino` is rewritten per request; the `[env:*]` sections (one per
# `BOARDS` entry, plus PSRAM variants) are static.
_FBUILD_PROJECT_DIR = _DATA_DIR / ".fbuild-project"
_FBUILD_SRC_DIR = _FBUILD_PROJECT_DIR / "src"
_FBUILD_INI_PATH = _FBUILD_PROJECT_DIR / "platformio.ini"
_FBUILD_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "FastLED"
# The music-sync Player sketch (playerSketchGenerator.ts) additionally needs
# ESP32-audioI2S. Vendored the same way as FastLED, but lazily — only the
# Player build path needs it, so it's not fetched for every ordinary compile.
_FBUILD_AUDIO_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "ESP32-audioI2S"
_FBUILD_ESP_DMX_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "esp_dmx"
# HUB75 scan-panel output (docs/development/design/hub75-output.md) — FastLED
# has no native HUB75 driver, so a HUB75 MatrixOutput route needs this DMA
# library instead. Vendored the same lazy way as ESP32-audioI2S/esp_dmx above.
_FBUILD_HUB75_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "ESP32-HUB75-MatrixPanel-DMA"
# SAMD51 INMP441 capture uses Adafruit's receive-capable ZeroI2S driver and
# its ZeroDMA dependency. Both are fetched only when a generated sketch names
# ZeroI2S, just like the other optional hardware libraries below.
_FBUILD_ZERO_I2S_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "Adafruit_ZeroI2S"
_FBUILD_ZERO_DMA_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "Adafruit_ZeroDMA"
_FBUILD_LVGL_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "lvgl"
_FBUILD_LV_CONF_PATH = _FBUILD_LVGL_LIB_DIR.parent / "lv_conf.h"
_FBUILD_OPTIONAL_LIB_STASH_DIR = _FBUILD_PROJECT_DIR / ".optional-libs"

# The custom Display emitter targets this API exactly. Do not float to a branch:
# LVGL minor releases can change both the public API and the configuration
# surface, and a cached checkout must not make two identical sketches compile
# against different runtimes.
_LVGL_VERSION = "9.5.0"
_LVGL_INCLUDE_MARKER = "#include <lvgl.h>"

# One deliberately small configuration shared by both build engines. LVGL's
# defaults enable almost its entire widget catalogue; Studio emits only the
# eight widgets below. Font switches are specialized per sketch from the
# FLS-LVGL-FONTS marker, so a 14 px screen does not pull every authored size
# into flash. Keeping the header here lets the
# helper write it beside either a reusable Arduino sketch or the fbuild-local
# LVGL checkout without depending on a source-tree data file in desktop builds.
_LV_CONF_TEXT = """\
#ifndef LV_CONF_H
#define LV_CONF_H

#define LV_COLOR_DEPTH 16
#define LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN
#define LV_MEM_SIZE (64 * 1024U)
#define LV_MEM_POOL_EXPAND_SIZE 0
#define LV_USE_OS LV_OS_NONE
#define LV_USE_LOG 0
#define LV_USE_ASSERT_NULL 1
#define LV_USE_ASSERT_MALLOC 1
#define LV_USE_FLOAT 0
#define LV_USE_MATRIX 0

#define LV_FONT_MONTSERRAT_8 0
#define LV_FONT_MONTSERRAT_10 0
#define LV_FONT_MONTSERRAT_12 0
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_16 0
#define LV_FONT_MONTSERRAT_18 0
#define LV_FONT_MONTSERRAT_20 0
#define LV_FONT_MONTSERRAT_22 0
#define LV_FONT_MONTSERRAT_24 0
#define LV_FONT_MONTSERRAT_26 0
#define LV_FONT_MONTSERRAT_28 0
#define LV_FONT_MONTSERRAT_30 0
#define LV_FONT_MONTSERRAT_32 0
#define LV_FONT_MONTSERRAT_34 0
#define LV_FONT_MONTSERRAT_36 0
#define LV_FONT_MONTSERRAT_38 0
#define LV_FONT_MONTSERRAT_40 0
#define LV_FONT_MONTSERRAT_42 0
#define LV_FONT_MONTSERRAT_44 0
#define LV_FONT_MONTSERRAT_46 0
#define LV_FONT_MONTSERRAT_48 0
#define LV_FONT_DEFAULT &lv_font_montserrat_14

#define LV_USE_ANIMIMG 0
#define LV_USE_ARC 1
#define LV_USE_ARCLABEL 0
#define LV_USE_BAR 1
#define LV_USE_BUTTON 1
#define LV_USE_BUTTONMATRIX 0
#define LV_USE_CALENDAR 0
#define LV_USE_CANVAS 0
#define LV_USE_CHART 0
#define LV_USE_CHECKBOX 0
#define LV_USE_DROPDOWN 0
#define LV_USE_IMAGE 1
#define LV_USE_IMAGEBUTTON 0
#define LV_USE_KEYBOARD 0
#define LV_USE_LABEL 1
#define LV_USE_LED 1
#define LV_USE_LINE 0
#define LV_USE_LIST 0
#define LV_USE_LOTTIE 0
#define LV_USE_MENU 0
#define LV_USE_MSGBOX 0
#define LV_USE_ROLLER 0
#define LV_USE_SCALE 0
#define LV_USE_SLIDER 1
#define LV_USE_SPAN 0
#define LV_USE_SPINBOX 0
#define LV_USE_SPINNER 0
#define LV_USE_SWITCH 1
#define LV_USE_TABLE 0
#define LV_USE_TABVIEW 0
#define LV_USE_TEXTAREA 0
#define LV_USE_TILEVIEW 0
#define LV_USE_WIN 0

#define LV_USE_THEME_DEFAULT 0
#define LV_USE_THEME_SIMPLE 0
#define LV_USE_THEME_MONO 0
#define LV_USE_FLEX 0
#define LV_USE_GRID 0
#define LV_USE_OBSERVER 0
#define LV_BUILD_EXAMPLES 0
#define LV_BUILD_DEMOS 0

#endif
"""

_LVGL_FONT_SIZES = tuple(range(8, 50, 2))
_LVGL_FONT_MARKER_RE = re.compile(r"^// FLS-LVGL-FONTS:([0-9,]+)$", re.MULTILINE)


def _lv_conf_for_sketch(ino: str) -> str:
    """Enable only the pinned LVGL bitmap fonts named by generated source."""
    requested = {
        int(size)
        for marker in _LVGL_FONT_MARKER_RE.findall(ino)
        for size in marker.split(",")
        if size.isdigit() and int(size) in _LVGL_FONT_SIZES
    }
    if not requested:
        requested = {14}
    config = _LV_CONF_TEXT
    for size in _LVGL_FONT_SIZES:
        config = config.replace(
            f"#define LV_FONT_MONTSERRAT_{size} {1 if size == 14 else 0}",
            f"#define LV_FONT_MONTSERRAT_{size} {1 if size in requested else 0}",
        )
    config = config.replace(
        "#define LV_FONT_DEFAULT &lv_font_montserrat_14",
        f"#define LV_FONT_DEFAULT &lv_font_montserrat_{min(requested)}",
    )
    return config

# fbuild currently compiles every library directory under the project's local
# `lib/`, even when the sketch does not include that library. That makes lazy
# hardware dependencies contaminate unrelated targets: for example, a SAMD51
# microphone sketch used to fail inside the previously cached ESP32-audioI2S
# library. Keep the cache, but expose only the optional libraries named by the
# current sketch while the (project-wide locked) build runs.
_FBUILD_OPTIONAL_LIBRARIES = (
    (_FBUILD_AUDIO_LIB_DIR, ("#include <Audio.h>",)),
    (_FBUILD_ESP_DMX_LIB_DIR, ("#include <esp_dmx.h>",)),
    (_FBUILD_HUB75_LIB_DIR, ("#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>",)),
    (_FBUILD_ZERO_I2S_LIB_DIR, ("#include <Adafruit_ZeroI2S.h>",)),
    # ZeroI2S includes ZeroDMA, so both must enter and leave the local library
    # search path together.
    (_FBUILD_ZERO_DMA_LIB_DIR, ("#include <Adafruit_ZeroI2S.h>",)),
    (_FBUILD_LVGL_LIB_DIR, (_LVGL_INCLUDE_MARKER,)),
)


def _remove_build_cache_tree(path: Path) -> None:
    """Remove an exact vendored cache directory, including read-only git packs."""
    def make_writable_and_retry(func, name, _error):
        os.chmod(name, stat.S_IWRITE)
        func(name)

    shutil.rmtree(path, onerror=make_writable_and_retry)


def _restore_stranded_fbuild_optional_libraries() -> None:
    """Recover libraries left staged by a process interrupted mid-build."""
    if not _FBUILD_OPTIONAL_LIB_STASH_DIR.exists():
        return
    local_lib_root = _FBUILD_LIB_DIR.parent
    local_lib_root.mkdir(parents=True, exist_ok=True)
    for staged in _FBUILD_OPTIONAL_LIB_STASH_DIR.iterdir():
        library_dir = local_lib_root / staged.name
        if staged.is_dir() and not library_dir.exists():
            staged.rename(library_dir)
    try:
        _FBUILD_OPTIONAL_LIB_STASH_DIR.rmdir()
    except OSError:
        # A duplicate/stale entry is safer left alone than deleted. It can only
        # exist after an interrupted/manual cache edit and is outside `lib/`,
        # so it cannot affect compilation.
        pass


@contextlib.contextmanager
def _fbuild_libraries_for_sketch(ino: str):
    """Temporarily hide cached optional libraries unused by this sketch."""
    _restore_stranded_fbuild_optional_libraries()
    moved: list[tuple[Path, Path]] = []
    try:
        required = {
            library_dir.resolve()
            for library_dir, include_markers in _FBUILD_OPTIONAL_LIBRARIES
            if any(marker in ino for marker in include_markers)
        }
        # FastLED is the one universal local dependency. Everything else is a
        # hardware-specific cache entry and must opt in via a header marker
        # above. Scanning the directory also quarantines old/transitive entries
        # from earlier fbuild runs (for example ESP8266Audio), not just the
        # dependencies this version of the helper knows how to vendor.
        local_lib_root = _FBUILD_LIB_DIR.parent
        if not local_lib_root.exists():
            yield
            return
        for library_dir in local_lib_root.iterdir():
            if (
                not library_dir.is_dir()
                or library_dir.resolve() == _FBUILD_LIB_DIR.resolve()
                or library_dir.resolve() in required
            ):
                continue
            _FBUILD_OPTIONAL_LIB_STASH_DIR.mkdir(parents=True, exist_ok=True)
            staged = _FBUILD_OPTIONAL_LIB_STASH_DIR / library_dir.name
            library_dir.rename(staged)
            moved.append((library_dir, staged))
        yield
    finally:
        for library_dir, staged in reversed(moved):
            if staged.exists() and not library_dir.exists():
                staged.rename(library_dir)
        try:
            _FBUILD_OPTIONAL_LIB_STASH_DIR.rmdir()
        except OSError:
            pass

# arduino-cli FQBN -> PlatformIO platform/board, mirroring `BOARDS` in
# `src/state/uploadStore.ts`. `psram_memory_type` maps this repo's PSRAM option
# id (`opi`/`qspi`, from `PsramOption.id`) to the PlatformIO board_build/upload
# overrides a real PSRAM module needs. The stock `board` ids below (e.g.
# `esp32-s3-devkitc-1`) are themselves the *no-PSRAM* variant's manifest — its
# `board_upload.flash_size`/`board_build.partitions` default to that module's
# 8MB/no-PSRAM layout, so `board_build.arduino.memory_type` alone (the
# previous, hardware-tested-false approach) silently kept building against an
# 8MB, no-PSRAM profile even once "opi" was selected. `flash_size`/`partitions`
# here override those to match the flash size the PSRAM option's label
# actually implies (see `PsramOption.label` in `uploadStore.ts`, e.g. "OPI
# (R8 modules, e.g. N16R8)" -> 16MB flash). Hardware-tested (2026-07-15) on a
# real ESP32-S3 N16R8 module against fbuild/PlatformIO's espressif32 platform:
# this flash_size/partitions fix is confirmed correct (the board now reports
# ESP.getFlashChipSize() == 16MB instead of silently building against 8MB).
#
# Flash and PSRAM bus modes are independent. The N16R8 bench module needs DIO
# flash plus octal PSRAM, which Arduino-ESP32 names `dio_opi`. The earlier
# `qio_opi` profile forced both the bootloader and app image headers to QIO. A
# real full upload then reset-looped before the second-stage bootloader could
# start (`TG0WDT_SYS_RST`/`RTCWDT_RTC_RST`, `mode:QIO`, `ets_loader.c 78`) on
# both the UART bridge and native USB paths (2026-08-24).
#
# Before QIO was forced, the image header stayed DIO but the SDK libraries were
# still selected from `qio_opi`; that inconsistent pairing booted but reported
# "wrong PSRAM line mode" and `psramFound()` false. `dio_opi` makes all three
# facts agree: DIO boot image, DIO-flash SDK libraries, and OPI PSRAM libraries.
# An upload writes bootloader.bin too, so the mode must be correct here rather
# than relying on whatever bootloader happened to be on the board already.
#
# The module facts that note asked for, read off the die with
# `esptool --chip esp32s3 flash_id` (2026-08-21):
#
#     Features:  Wi-Fi, BT 5 (LE), Dual Core + LP Core, 240MHz,
#                Embedded PSRAM 8MB (AP_3v3)
#     Detected flash size:          16MB
#     Flash type set in eFuse:      quad (4 data lines)
#     Chip: ESP32-S3 (QFN56) rev v0.2, 40MHz crystal, USB-Serial/JTAG
#
# So the PSRAM is real and octal and the flash is 16MB. The eFuse's `quad`
# report describes the flash bus width/capability; it did not prove that this
# board boots in QIO mode. The UART boot trace above is the authority for the
# actual image mode this physical board accepts.
#
# Note also what these numbers say about the *non*-PSRAM env below: it carries
# no `flash_size` override, so it builds against the stock board id's 8MB
# manifest on a chip with 16MB. That is the same silent mismatch the paragraph
# above describes fixing for the PSRAM options, still present for the default
# one — and it means the capacity meter measures against half this board's real
# ceiling. Fixing it properly means taking the size from the selected physical
# board profile (which names the exact module) rather than from the generic
# FQBN, since an N8 module must not be told it has 16MB.
_PIO_BOARDS: dict[str, dict] = {
    "esp32:esp32:esp32s3": {
        "platform": "espressif32", "board": "esp32-s3-devkitc-1",
        # Two sockets: a UART bridge and the chip's own USB-Serial/JTAG. Which
        # one `Serial` reaches is a build-time decision, so both envs exist and
        # the caller says which cable is in. See `_usb_cdc_from`.
        "usb_cdc": True,
        # The stock `esp32-s3-devkitc-1` id is the N8 manifest — 8MB, no PSRAM.
        # N16 modules are common (the bench's own is an N16R8, confirmed by
        # esptool: 16MB flash, 8MB octal PSRAM), and with no variant here they
        # built and measured against 8MB. `huge_app.csv` keeps the same ~3MB app
        # slot; what changes is that the other 8MB stops being invisible.
        "flash_variants": {
            16: {"flash_size": "16MB", "partitions": "huge_app.csv"},
        },
        "psram_memory_type": {
            # Hardware trace (2026-08-24): QIO reset-loops in the ROM loader;
            # DIO is the flash mode, independently of the octal PSRAM bus.
            "opi":  {"memory_type": "dio_opi",  "flash_size": "16MB", "partitions": "default_16MB.csv",
                     "flash_mode": "dio", "f_flash": "80000000L"},
            "qspi": {"memory_type": "qio_qspi", "flash_size": "8MB",  "partitions": "default_8MB.csv",
                     "flash_mode": "qio", "f_flash": "80000000L"},
        },
    },
    "esp32:esp32:esp32": {
        "platform": "espressif32", "board": "esp32dev",
        "psram_memory_type": {
            "qspi": {"memory_type": "qio_qspi", "flash_size": "4MB", "partitions": "default.csv"},
        },
    },
    # 30-pin DOIT DevKit v1 (ESP32-WROOM-32D, silk "ESP-32D"). Same classic
    # ESP32 silicon as `esp32dev` above, but PlatformIO ships a dedicated board
    # definition for it, so use that rather than aliasing to the generic one.
    # No PSRAM: WROOM-32D modules carry none.
    "esp32:esp32:esp32doit-devkit-v1": {"platform": "espressif32", "board": "esp32doit-devkit-v1"},
    "arduino:avr:uno": {"platform": "atmelavr", "board": "uno"},
    "arduino:avr:nano": {"platform": "atmelavr", "board": "nanoatmega328new"},
    "arduino:avr:leonardo": {"platform": "atmelavr", "board": "leonardo"},
    "arduino:avr:mega": {"platform": "atmelavr", "board": "megaatmega2560"},
    "arduino:megaavr:nona4809": {"platform": "atmelmegaavr", "board": "nona4809"},
    "esp32:esp32:esp32s2": {"usb_cdc": True, "platform": "espressif32", "board": "esp32-s2-saola-1"},
    "esp32:esp32:esp32c3": {"usb_cdc": True, "platform": "espressif32", "board": "esp32-c3-devkitm-1"},
    "esp32:esp32:esp32c6": {"platform": "espressif32", "board": "esp32-c6-devkitc-1"},
    "esp32:esp32:esp32h2": {"platform": "espressif32", "board": "esp32-h2-devkitc-1"},
    "esp8266:esp8266:nodemcuv2": {"platform": "espressif8266", "board": "nodemcuv2"},
    "teensy:avr:teensy41": {"platform": "teensy", "board": "teensy41"},
    "teensy:avr:teensy40": {"platform": "teensy", "board": "teensy40"},
    "teensy:avr:teensyMM": {"platform": "teensy", "board": "teensymm"},
    "teensy:avr:teensy36": {"platform": "teensy", "board": "teensy36"},
    "teensy:avr:teensy35": {"platform": "teensy", "board": "teensy35"},
    "teensy:avr:teensy31": {"platform": "teensy", "board": "teensy31"},
    "teensy:avr:teensy30": {"platform": "teensy", "board": "teensy30"},
    "teensy:avr:teensyLC": {"platform": "teensy", "board": "teensyLC"},
    "rp2040:rp2040:rpipico": {"platform": "raspberrypi", "board": "pico"},
    "rp2040:rp2040:rpipico2": {"platform": "raspberrypi", "board": "rpipico2"},
    "rp2040:rp2040:adafruit_kb2040": {"platform": "raspberrypi", "board": "adafruit_kb2040"},
    "arduino:samd:nano_33_iot": {"platform": "atmelsam", "board": "nano_33_iot"},
    "arduino:sam:arduino_due_x": {"platform": "atmelsam", "board": "due"},
    # Confirmed against fbuild's board-support reference for a bare SAMD21
    # Arduino Zero, but not yet build-tested here — see the "(experimental)"
    # note on this board in `src/state/uploadStore.ts`.
    "arduino:samd:arduino_zero_native": {"platform": "atmelsam", "board": "zeroUSB"},
    "adafruit:samd:adafruit_feather_m0": {"platform": "atmelsam", "board": "adafruit_feather_m0"},
    "adafruit:samd:adafruit_qtpy_m0": {"platform": "atmelsam", "board": "adafruit_qtpy_m0"},
    # fbuild's atmelsam adapter currently drops the Arduino board/architecture
    # defines when compiling vendored local-library unity files. Repeat the
    # exact MCU identity here so FastLED selects its SAMD51 implementation in
    # both the sketch TU and library TUs.
    "adafruit:samd:adafruit_feather_m4": {
        "platform": "atmelsam", "board": "adafruit_feather_m4",
        "build_flags": ["-DARDUINO_ARCH_SAMD", "-D__SAMD51__", "-D__SAMD51J19A__", "-DEIC_IRQn=EIC_0_IRQn", "-DFASTLED_FORCE_SOFTWARE_SPI=1"],
    },
    "adafruit:samd:adafruit_grandcentral_m4": {
        "platform": "atmelsam", "board": "adafruit_grandcentral_m4",
        "build_flags": ["-DARDUINO_ARCH_SAMD", "-D__SAMD51__", "-D__SAMD51P20A__", "-DEIC_IRQn=EIC_0_IRQn", "-DFASTLED_FORCE_SOFTWARE_SPI=1"],
    },
    "adafruit:samd:adafruit_matrixportal_m4": {
        "platform": "atmelsam", "board": "adafruit_matrixportal_m4",
        "build_flags": ["-DARDUINO_ARCH_SAMD", "-D__SAMD51__", "-D__SAMD51J19A__", "-DEIC_IRQn=EIC_0_IRQn", "-DFASTLED_FORCE_SOFTWARE_SPI=1"],
    },
    "STMicroelectronics:stm32:bluepill_f103c8": {"platform": "ststm32", "board": "bluepill_f103c8"},
    "STMicroelectronics:stm32:blackpill_f411ce": {"platform": "ststm32", "board": "blackpill_f411ce"},
    "STMicroelectronics:stm32:nucleo_f429zi": {"platform": "ststm32", "board": "nucleo_f429zi"},
    "STMicroelectronics:stm32:nucleo_f439zi": {"platform": "ststm32", "board": "nucleo_f439zi"},
    "arduino:renesas_uno:unor4wifi": {"platform": "renesas-ra", "board": "uno_r4_wifi"},
    "adafruit:nrf52:pca10056": {"platform": "nordicnrf52", "board": "nrf52840_dk"},
}

# arduino-cli's FQBN "menu option" suffix (e.g. `PSRAM=opi`) -> our PSRAM id.
_FQBN_PSRAM_VALUES = {"opi": "opi", "enabled": "qspi"}

_fbuild_project_ready = False

# fbuild's project scaffold is a single shared directory (see above) — only one
# `main.ino` at a time, so two overlapping builds (e.g. a real Upload racing
# the live capacity meter's compile-only check, or two rapid-fire capacity
# checks while a user is still editing) can interleave a write with a build
# and corrupt each other's output. Observed in practice as a compile that
# reports success but produces no parseable size line, or an unrelated build
# failure that a caller could easily misread as a real capacity overflow.
# Every `_compile_upload_fbuild` run holds this for its whole duration so
# fbuild compiles are always serialized project-wide.
class _FbuildBuildLock:
    """Serialises fbuild runs project-wide, and survives an abandoned holder.

    Not a bare `threading.Lock`, because the holder is a **generator**:
    `_compile_upload_fbuild` acquires on entry and releases in a `finally`, and
    a generator's `finally` only runs on exhaustion, close, or garbage
    collection. A client that stops consuming an upload stream leaves that
    generator suspended at a `yield` *still holding the lock*, with no
    subprocess running and nothing to release it — every later build then waits
    the full timeout and fails, with the helper otherwise perfectly healthy.
    Observed on 2026-08-16 during classic-ESP32 bring-up.

    Two properties fix that:

    * **Progress stamping.** `touch()` is called for every chunk a running
      build emits, so "is anyone actually working?" is answerable. Only the
      true holder can stamp: a suspended generator is not executing at all.
    * **Reclaim on staleness.** A waiter may take a lock whose holder has
      emitted nothing for `_FBUILD_LOCK_STALE_S`. That is deliberately longer
      than the wait timeout, so a slow-but-live build is never stolen from by
      the first waiter that runs out of patience — it is only reclaimed once
      it has been silent for twice as long as anyone is willing to wait.

    Release is token-checked. When a stale lock is reclaimed the original
    holder may still be collected later and call `release()`; without the token
    that stale call would free the *new* holder's lock and reintroduce exactly
    the concurrent-scaffold corruption this exists to prevent.
    """

    def __init__(self):
        self._cond = threading.Condition()
        self._held_by = None
        self._progress_at = 0.0
        self._next_token = 1

    def _grant(self):
        token = self._next_token
        self._next_token += 1
        self._held_by = token
        self._progress_at = time.monotonic()
        return token

    def acquire(self, timeout, stale_after):
        """Token on success, None if the wait timed out. Never blocks forever."""
        deadline = time.monotonic() + timeout
        with self._cond:
            while True:
                if self._held_by is None:
                    return self._grant()
                if time.monotonic() - self._progress_at >= stale_after:
                    self._held_by = None
                    return self._grant()
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return None
                self._cond.wait(min(remaining, 1.0))

    def release(self, token):
        with self._cond:
            if self._held_by != token:
                return  # stale holder, already reclaimed — must not free the new one
            self._held_by = None
            self._cond.notify_all()

    def touch(self):
        """Stamp progress. A no-op when unheld, so the arduino-cli path (which
        shares `_run_phase` but takes no lock) costs nothing."""
        with self._cond:
            if self._held_by is not None:
                self._progress_at = time.monotonic()

    def seconds_since_progress(self):
        with self._cond:
            return None if self._held_by is None else time.monotonic() - self._progress_at


_fbuild_build_lock = _FbuildBuildLock()

# A build can legitimately run long (a cold toolchain/library clone), but if
# one is ever genuinely wedged (a hung subprocess, an interrupted git clone
# leaving a stale lock file, ...), every later build/upload/capacity-check
# request would otherwise queue on `_fbuild_build_lock` forever with zero
# output — the UI just shows "Starting…" indefinitely with no error and no
# way to tell a slow build from a stuck one. Bound the wait instead so a
# stuck build fails fast and visibly rather than silently wedging everything
# that comes after it.
_FBUILD_LOCK_TIMEOUT_S = 180

# How long a holder must emit nothing before a waiter may take the lock from
# it. Deliberately longer than the wait above: a build that is merely slow gets
# more rope than any single waiter has patience for, so the first request to
# time out never steals from live work — only a holder that has been silent for
# twice that long is treated as abandoned.
_FBUILD_LOCK_STALE_S = _FBUILD_LOCK_TIMEOUT_S * 2

# How long each slice of the wait is. The wait is taken in slices rather than
# one blocking call so a queued build can say it is queued — see the acquire
# loop in `_compile_upload_fbuild`.
_FBUILD_LOCK_POLL_S = 5


def _env_id(
    base_fqbn: str, psram_id: str | None = None, flash_mb: int | None = None,
    usb_cdc: bool = False,
) -> str:
    slug = re.sub(r"[^A-Za-z0-9_]", "_", base_fqbn)
    if psram_id:
        # A PSRAM option already pins its own flash size (see psram_memory_type),
        # so those two never combine.
        slug = f"{slug}_{psram_id}"
    elif flash_mb:
        slug = f"{slug}_f{flash_mb}"
    # CDC is orthogonal to both — it is about which socket the cable is in, not
    # what the module contains — so it composes with whatever is above.
    return f"{slug}_cdc" if usb_cdc else slug


def _parse_fqbn(fqbn: str) -> tuple[str, str | None]:
    """`"esp32:esp32:esp32s3:PSRAM=opi"` -> `("esp32:esp32:esp32s3", "opi")`."""
    parts = fqbn.split(":")
    base = ":".join(parts[:3])
    opt = parts[3] if len(parts) > 3 else None
    psram_id = _FQBN_PSRAM_VALUES.get(opt.split("=", 1)[1]) if opt and "=" in opt else None
    return base, psram_id


def _flash_mb_from(payload: dict) -> int | None:
    """The module's real flash size, as the frontend read it off the selected
    board profile. Absent or unusable means "use the board id's own manifest",
    which is what every board with no recorded module size keeps doing."""
    try:
        value = int(payload.get("flashMb") or 0)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _usb_cdc_from(payload: dict) -> bool:
    """Whether the sketch's `Serial` should be the native USB port.

    A fact about the user's cable, not a preference: an ESP32-S3 exposes both a
    UART bridge and a native USB-Serial/JTAG socket, and `Serial` reaches
    exactly one of them. Guess wrong and the serial monitor is blank, the RTC
    handshake times out, the SD show's file transfer never starts and live
    streaming drops every frame — all silently, because nothing is broken, the
    two ends are just talking past each other.
    """
    return payload.get("usbCdcOnBoot") is True


def _fbuild_env_for_fqbn(
    fqbn: str, flash_mb: int | None = None, usb_cdc: bool = False,
) -> str | None:
    """The env to build, given the FQBN and — when the caller knows it — how much
    flash the physical module actually has.

    `flash_mb` comes from the board profile the user picked, not from the FQBN:
    `esp32:esp32:esp32s3` is generic, and the stock PlatformIO board id behind it
    is the *N8* manifest. On a 16MB module that silently builds and measures
    against half the real flash, which is what the capacity meter then reports.
    Only sizes the board declares a variant for are honoured — an N8 part must
    never be told it has 16MB.
    """
    base, psram_id = _parse_fqbn(fqbn)
    meta = _PIO_BOARDS.get(base)
    if meta is None:
        return None
    if psram_id and psram_id not in meta.get("psram_memory_type", {}):
        psram_id = None  # unsupported/unknown option — build without it rather than fail
    # Only offered where the board actually has a native USB socket to choose.
    usb_cdc = usb_cdc and bool(meta.get("usb_cdc"))
    if psram_id:
        return _env_id(base, psram_id, None, usb_cdc)
    if flash_mb and flash_mb in meta.get("flash_variants", {}):
        return _env_id(base, None, flash_mb, usb_cdc)
    return _env_id(base, None, None, usb_cdc)


def _write_if_changed(path: Path, text: str) -> bool:
    """Write `text` to `path` only when it differs from what is already there.
    True if the file was actually written.

    Every build tool downstream of the fbuild project scaffold decides what to
    recompile from mtimes, so rewriting a file with the bytes it already has
    costs a rebuild and buys nothing. Two writers here used to do exactly that
    on every run — the sketch (`_write_fbuild_main`) and the vendored FastLED
    patches (`_patch_fastled_samd51_build`) — which is why a re-upload of an
    unchanged design still recompiled its largest translation unit, relinked,
    and rebuilt whichever FastLED objects include a patched header.

    Reading the file back to compare is far cheaper than the compile a
    needless touch triggers; an unreadable or missing file just falls through
    to the write."""
    try:
        if path.read_text(encoding="utf-8") == text:
            return False
    except (OSError, UnicodeDecodeError):
        pass
    path.write_text(text, encoding="utf-8")
    return True


def _write_fbuild_ini() -> None:
    lines: list[str] = []
    for base_fqbn, meta in _PIO_BOARDS.items():
        # arduino-cli/Arduino IDE always define CORE_DEBUG_LEVEL (from the "Core
        # Debug Level" board menu); PlatformIO/fbuild's espressif32 platform
        # doesn't, so anything referencing it (e.g. ESP32-audioI2S's Audio.h)
        # fails to compile without this — a known PlatformIO+esp32 gotcha, not
        # specific to this project.
        #
        # ESP32-HUB75-MatrixPanel-DMA (vendored lazily by _ensure_fbuild_hub75_lib)
        # depends on Adafruit_GFX by default, which we don't vendor — confirmed by
        # a real build failure ("Adafruit_GFX.h: No such file or directory") once
        # a HUB75 sketch actually reached this compile step. -DNO_GFX=1 (the
        # library's own documented build flag, doc/BuildOptions.md) drops that
        # dependency entirely: MatrixPanel_I2S_DMA stops inheriting from
        # Adafruit_GFX, but every method our codegen calls — begin(),
        # setBrightness8(), clearScreen(), drawPixelRGB888() — is declared
        # unconditionally in the header, not part of the GFX API, so nothing we
        # emit needs Adafruit_GFX. Set unconditionally rather than only for HUB75
        # builds (this static ini is written once for every env, not per
        # request) — the macro is inert for every sketch that doesn't include the
        # HUB75 header.
        base_flags = list(meta.get("build_flags", []))
        if meta["platform"] == "espressif32":
            base_flags.extend(("-DCORE_DEBUG_LEVEL=0", "-DNO_GFX=1"))
        # The stock dual-OTA `default.csv` partition table caps each app slot at
        # 0x140000 (1,310,720 bytes) on a typical 4MB-flash ESP32 module. The
        # music-sync Player sketch (ESP32-audioI2S's codec support pushes it well
        # past 1.7MB) doesn't fit, and esptool writes the oversized image anyway —
        # the failure only shows up as a bootloader "Image length ... doesn't fit
        # in partition length 1310720" boot loop, with no build-time error. This
        # app always flashes fresh over USB (no OTA), so trade the second OTA
        # slot and some of the unused SPIFFS region for one ~3MB app partition
        # (`huge_app.csv`, the same table Arduino IDE's "Huge APP" option uses)
        # instead. PSRAM variants below already set their own larger table.
        is_esp32 = meta["platform"] == "espressif32"

        # Every env below is written twice on a board with a native USB socket:
        # once as-is, once with `Serial` routed to it. See `_usb_cdc_from` for
        # why that has to be chosen rather than defaulted — it depends on which
        # of the board's two sockets the cable is in, and both wrong answers
        # fail silently. Emitting the pair here keeps CDC orthogonal to the PSRAM
        # and flash variants rather than multiplying them out by hand.
        cdc_choices = (False, True) if meta.get("usb_cdc") else (False,)

        def env_block(psram_id, flash_mb, extra_flags=(), extra_lines=()):
            block = []
            for cdc in cdc_choices:
                flags = [*base_flags, *extra_flags,
                         *(["-DARDUINO_USB_CDC_ON_BOOT=1"] if cdc else [])]
                block += [
                    f"[env:{_env_id(base_fqbn, psram_id, flash_mb, cdc)}]",
                    f"platform = {meta['platform']}", f"board = {meta['board']}",
                    "framework = arduino",
                    *([f"build_flags = {' '.join(flags)}"] if flags else []),
                    *extra_lines, "",
                ]
            return block

        lines += env_block(
            None, None,
            extra_lines=["board_build.partitions = huge_app.csv"] if is_esp32 else [],
        )
        # One env per flash size the board is actually sold in, so a bigger
        # module is measured and partitioned against its own flash rather than
        # the stock board id's. Declared per board (see `flash_variants`) rather
        # than assumed for every size: the manifest has to match the part.
        for flash_mb, flash_meta in meta.get("flash_variants", {}).items():
            lines += env_block(None, flash_mb, extra_lines=[
                f"board_upload.flash_size = {flash_meta['flash_size']}",
                f"board_build.partitions = {flash_meta['partitions']}",
            ])
        for psram_id, psram_meta in meta.get("psram_memory_type", {}).items():
            lines += env_block(psram_id, None, extra_flags=["-DBOARD_HAS_PSRAM"], extra_lines=[
                # Use the common PlatformIO/fbuild override, not the older
                # Arduino-nested spelling. PlatformIO accepts both, but fbuild
                # 2.5.18 strips `board_build.arduino.memory_type` to the
                # unrecognised key `arduino.memory_type` and silently falls
                # back to `<flash_mode>_qspi`. On an N16R8 that selected
                # dio_qspi despite this profile saying dio_opi, producing the
                # runtime "quad_psram: wrong PSRAM line mode" failure.
                f"board_build.memory_type = {psram_meta['memory_type']}",
                f"board_upload.flash_size = {psram_meta['flash_size']}",
                # State the flash mode the memory_type already implies, so the
                # app image header agrees with the bootloader on the part. See
                # the note above _PIO_BOARDS: a QIO image against a DIO
                # bootloader boot-loops, and a DIO image against a QIO one boots
                # but reports psramFound() false — the same disagreement from
                # either side. Only on the PSRAM variants: the plain env is for
                # an unknown module whose stock default is DIO, and forcing QIO
                # there would inflict that mismatch on an N8.
                *([f"board_build.flash_mode = {psram_meta['flash_mode']}",
                   f"board_build.f_flash = {psram_meta['f_flash']}"]
                  if psram_meta.get("flash_mode") else []),
                f"board_build.partitions = {psram_meta['partitions']}",
            ])
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
    fastled_sentinel = _FBUILD_LIB_DIR / "src" / "fl" / "stl" / "stdint.h"
    if not (_FBUILD_LIB_DIR / "library.json").exists() or not fastled_sentinel.exists():
        yield "\n=== vendoring FastLED (first run only) ===\n"
        _FBUILD_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
        # A cancelled/failed checkout can leave library.json behind while most
        # source files are staged as deleted. Treat that as a corrupt build
        # cache and replace this exact vendored directory.
        if _FBUILD_LIB_DIR.exists():
            _remove_build_cache_tree(_FBUILD_LIB_DIR)
        # `--progress`: git draws its counters only when stderr is a
        # terminal, and ours is a pipe — without it a clone of any size is
        # a silent wait, indistinguishable from a hang. `_iter_stream_lines`
        # is what lets those counters through, since git writes them with
        # carriage returns rather than newlines.
        rc = yield from _run_phase(
            "vendor FastLED",
            ["git", "clone", "--progress", "--depth", "1", "https://github.com/FastLED/FastLED.git", str(_FBUILD_LIB_DIR)],
        )
        if rc != 0:
            yield "[error] failed to vendor FastLED — the build below will fail on FastLED.h\n"
    _patch_fastled_samd51_build()
    _fbuild_project_ready = True


def _patch_fastled_samd51_build() -> None:
    """Apply narrow upstream SAMD51 compile fixes to the vendored FastLED.

    FastLED 3.10.4+ currently names SAMD21-only PMUX/EIC constants in its
    SAMD51 ISR source, and its unused SAMD51 quad-SPI implementation returns
    obsolete result types. Studio does not use the quad-SPI path; stubbing its
    buffer acquisition keeps ordinary FastLED controllers and the audio
    processor buildable until upstream lands equivalent fixes. Its generic
    Arduino audio unit also cannot include ``I2S.h`` on SAMD51 because the
    core's ``I2S`` peripheral macro expands inside that header token. Studio's
    SAMD51 code uses its own ZeroI2S adapter, so disable that unused generic
    backend on SAMD51 only.

    Every write here goes through `_write_if_changed`. This runs once per
    helper process, against a vendored tree that is almost always already
    patched, and these are headers: rewriting one with its own bytes rebuilt
    every FastLED object that includes it on the next build — three of them on
    an ESP32-S3 re-upload that had changed nothing at all.
    """
    isr = _FBUILD_LIB_DIR / "src" / "platforms" / "arm" / "samd" / "isr_samd.hpp"
    if isr.exists():
        text = isr.read_text(encoding="utf-8")
        text = text.replace("PORT_PMUX_PMUXO_A", "PORT_PMUX_PMUXO(0)")
        text = text.replace("PORT_PMUX_PMUXE_A", "PORT_PMUX_PMUXE(0)")
        text = text.replace("NVIC_DisableIRQ(EIC_IRQn)", "NVIC_DisableIRQ(EIC_0_IRQn)")
        _write_if_changed(isr, text)

    quad = _FBUILD_LIB_DIR / "src" / "platforms" / "arm" / "d51" / "spi_hw_4_samd51.cpp.hpp"
    if quad.exists():
        text = quad.read_text(encoding="utf-8")
        start = text.find("DMABuffer SPIQuadSAMD51::acquireDMABuffer(size_t bytes_per_lane) {")
        end = text.find("\nbool SPIQuadSAMD51::transmit", start)
        if start >= 0 and end > start:
            stub = (
                "DMABuffer SPIQuadSAMD51::acquireDMABuffer(size_t bytes_per_lane) {\n"
                "    (void)bytes_per_lane;\n"
                "    return DMABuffer(SPIError::NOT_SUPPORTED);\n"
                "}\n"
            )
            text = text[:start] + stub + text[end:]
            _write_if_changed(quad, text)

    audio = _FBUILD_LIB_DIR / "src" / "fl" / "audio" / "audio_input.cpp.hpp"
    if audio.exists():
        text = audio.read_text(encoding="utf-8")
        old = (
            "  #elif defined(FL_IS_TEENSY)\n"
            "    // Teensy uses the PJRC Audio backend when enabled, never generic Arduino I2S.\n"
            "    #define FASTLED_USES_ARDUINO_AUDIO_INPUT 0\n"
            "  #elif FL_HAS_INCLUDE(<Arduino.h>)"
        )
        new = (
            "  #elif defined(FL_IS_TEENSY)\n"
            "    // Teensy uses the PJRC Audio backend when enabled, never generic Arduino I2S.\n"
            "    #define FASTLED_USES_ARDUINO_AUDIO_INPUT 0\n"
            "  #elif defined(FL_IS_SAMD51)\n"
            "    // Studio supplies a ZeroI2S IInput adapter on SAMD51.\n"
            "    #define FASTLED_USES_ARDUINO_AUDIO_INPUT 0\n"
            "  #elif FL_HAS_INCLUDE(<Arduino.h>)"
        )
        if old in text:
            _write_if_changed(audio, text.replace(old, new))

    arduino_audio = _FBUILD_LIB_DIR / "src" / "platforms" / "arduino" / "audio_input.hpp"
    if arduino_audio.exists():
        text = arduino_audio.read_text(encoding="utf-8")
        old = (
            '#elif defined(FL_IS_SAMD21)\n'
            '#define ARDUINO_I2S_FULLY_SUPPORTED 0\n'
            '#define ARDUINO_I2S_BROKEN_REASON "I2S not supported on SAMD21"\n'
            '#elif FL_HAS_INCLUDE(<I2S.h>)'
        )
        new = (
            '#elif defined(FL_IS_SAMD21)\n'
            '#define ARDUINO_I2S_FULLY_SUPPORTED 0\n'
            '#define ARDUINO_I2S_BROKEN_REASON "I2S not supported on SAMD21"\n'
            '#elif defined(FL_IS_SAMD51)\n'
            '#define ARDUINO_I2S_FULLY_SUPPORTED 0\n'
            '#define ARDUINO_I2S_BROKEN_REASON "Studio uses ZeroI2S on SAMD51"\n'
            '#elif FL_HAS_INCLUDE(<I2S.h>)'
        )
        if old in text:
            text = text.replace(old, new)
        # fbuild's dependency scanner evaluates header tokens before the C++
        # platform branch can discard them. On Adafruit SAMD51, the core macro
        # named `I2S` expands the token in both __has_include(<I2S.h>) and
        # #include <I2S.h> into a peripheral address, yielding an impossible
        # path such as `((I2s *)0x43002800UL).h`. None of Studio's supported
        # mic targets uses this generic FastLED adapter (each has a selected
        # backend above), so remove those two tokens from the vendored unity
        # build instead of allowing an unused source path to break SAMD51.
        text = text.replace(
            "#elif FL_HAS_INCLUDE(<I2S.h>)",
            "#elif 0 // Studio mic targets use their selected IInput adapter",
        )
        text = text.replace(
            "#include <I2S.h>",
            "// Generic Arduino I2S include disabled by the Studio build helper.",
        )
        _write_if_changed(arduino_audio, text)

    # The generated SAMD51 sketches use clockless LEDs and explicitly select
    # FastLED's software-SPI fallback. Honour that selection before FastLED's
    # new SAMD dispatcher includes its still-experimental hardware SPI adapter,
    # which has an unnecessary transitive <SPI.h> dependency under fbuild.
    for relative in ("platforms/spi_device_proxy.h", "platforms/spi_output_template.h"):
        dispatcher = _FBUILD_LIB_DIR / "src" / relative
        if dispatcher.exists():
            text = dispatcher.read_text(encoding="utf-8")
            text = text.replace(
                "#elif defined(FL_IS_SAM) || defined(FL_IS_SAMD)",
                "#elif (defined(FL_IS_SAM) || defined(FL_IS_SAMD)) && !defined(FASTLED_FORCE_SOFTWARE_SPI)",
            )
            _write_if_changed(dispatcher, text)


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
    # Named for the header the sketch includes, which is also what tells a
    # `-nopsram` fork checkout apart from this one: that fork ships only
    # Audio_nopsram.h, so a stale one misses here and is replaced below.
    if (_FBUILD_AUDIO_LIB_DIR / "src" / "Audio.h").exists():
        _fbuild_audio_lib_ready = True
        return
    yield "\n=== vendoring ESP32-audioI2S (first run only) ===\n"
    _FBUILD_AUDIO_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    # Replaces a `-nopsram` fork checkout if one is cached. That fork is built
    # for a classic ESP32 with no PSRAM; this player targets an ESP32-S3 with
    # it, which is what upstream v3 wants.
    #
    # Pinned to 3.0.12, NOT the default branch: the library is rewritten often
    # enough that tracking its head carries no stability guarantee.
    if _FBUILD_AUDIO_LIB_DIR.exists():
        # Not a bare rmtree: a previous vendoring left a .git behind, and git's
        # pack files are read-only, which on Windows makes rmtree raise
        # PermissionError. Raised here it escapes mid-stream from a generator
        # inside a StreamingResponse, so the upload stops dead after the
        # "vendoring" line with nothing said. That is what
        # `_remove_build_cache_tree` is for, and the FastLED cache already used
        # it — this path never had a replacement exercised on Windows.
        _remove_build_cache_tree(_FBUILD_AUDIO_LIB_DIR)
    rc = yield from _run_phase(
        "vendor ESP32-audioI2S",
        ["git", "clone", "--progress", "--branch", "3.0.12", "--depth", "1",
         "https://github.com/schreibfaul1/ESP32-audioI2S.git", str(_FBUILD_AUDIO_LIB_DIR)],
    )
    if rc != 0:
        yield "[error] failed to vendor ESP32-audioI2S — the Player build below will fail on Audio.h\n"
    _fbuild_audio_lib_ready = True


_fbuild_esp_dmx_lib_ready = False


def _ensure_fbuild_esp_dmx_lib():
    """Vendor esp_dmx (someweisguy/esp_dmx) on first DMX512 firmware build."""
    global _fbuild_esp_dmx_lib_ready
    if _fbuild_esp_dmx_lib_ready:
        return
    if (_FBUILD_ESP_DMX_LIB_DIR / "library.properties").exists():
        _fbuild_esp_dmx_lib_ready = True
        return
    yield "\n=== vendoring esp_dmx (first DMX512 build only) ===\n"
    _FBUILD_ESP_DMX_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    rc = yield from _run_phase(
        "vendor esp_dmx",
        ["git", "clone", "--progress", "--depth", "1", "https://github.com/someweisguy/esp_dmx.git", str(_FBUILD_ESP_DMX_LIB_DIR)],
    )
    if rc != 0:
        yield "[error] failed to vendor esp_dmx — DMX512 builds may fail on esp_dmx.h\n"
    _fbuild_esp_dmx_lib_ready = True


_fbuild_hub75_lib_ready = False


def _ensure_fbuild_hub75_lib():
    """Vendor ESP32-HUB75-MatrixPanel-DMA (mrcodetastic/ESP32-HUB75-MatrixPanel-DMA)
    on first HUB75 firmware build — same rationale as `_ensure_fbuild_audio_lib`/
    `_ensure_fbuild_esp_dmx_lib`: fbuild 2.4.0's `lib_deps` registry resolution
    doesn't work, so a vendored local lib is the only path that compiles."""
    global _fbuild_hub75_lib_ready
    if _fbuild_hub75_lib_ready:
        return
    if (_FBUILD_HUB75_LIB_DIR / "library.json").exists():
        _fbuild_hub75_lib_ready = True
        return
    yield "\n=== vendoring ESP32-HUB75-MatrixPanel-DMA (first HUB75 build only) ===\n"
    _FBUILD_HUB75_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    # Pinned to 3.0.14 (the newest non-prerelease tag as of 2026-08-08), not the
    # default branch — same "known-good tag, not a tracked branch" rule as the
    # other vendored libs above; re-pin deliberately (bump the tag here) rather
    # than floating.
    rc = yield from _run_phase(
        "vendor ESP32-HUB75-MatrixPanel-DMA",
        ["git", "clone", "--progress", "--branch", "3.0.14", "--depth", "1",
         "https://github.com/mrcodetastic/ESP32-HUB75-MatrixPanel-DMA.git", str(_FBUILD_HUB75_LIB_DIR)],
    )
    if rc != 0:
        yield "[error] failed to vendor ESP32-HUB75-MatrixPanel-DMA — HUB75 builds will fail on ESP32-HUB75-MatrixPanel-I2S-DMA.h\n"
    _fbuild_hub75_lib_ready = True


_fbuild_zero_i2s_lib_ready = False


def _ensure_fbuild_zero_i2s_lib():
    """Vendor the pinned SAMD51 I2S receive library and DMA dependency."""
    global _fbuild_zero_i2s_lib_ready
    if _fbuild_zero_i2s_lib_ready:
        return
    ready = (
        (_FBUILD_ZERO_I2S_LIB_DIR / "Adafruit_ZeroI2S.h").exists()
        and (_FBUILD_ZERO_DMA_LIB_DIR / "Adafruit_ZeroDMA.h").exists()
    )
    if ready:
        _fbuild_zero_i2s_lib_ready = True
        return
    yield "\n=== vendoring Adafruit ZeroI2S + ZeroDMA (first SAMD51 mic build only) ===\n"
    _FBUILD_ZERO_I2S_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    libraries = (
        ("Adafruit ZeroI2S", "1.2.4", "https://github.com/adafruit/Adafruit_ZeroI2S.git", _FBUILD_ZERO_I2S_LIB_DIR),
        ("Adafruit ZeroDMA", "1.1.4", "https://github.com/adafruit/Adafruit_ZeroDMA.git", _FBUILD_ZERO_DMA_LIB_DIR),
    )
    for label, tag, url, path in libraries:
        if path.exists():
            _remove_build_cache_tree(path)
        rc = yield from _run_phase(
            f"vendor {label}",
            ["git", "clone", "--progress", "--branch", tag, "--depth", "1", url, str(path)],
        )
        if rc != 0:
            yield f"[error] failed to vendor {label} — the SAMD51 microphone build will fail\n"
            return
    _fbuild_zero_i2s_lib_ready = True


_fbuild_lvgl_lib_ready = False


def _lvgl_checkout_matches_pin(path: Path) -> bool:
    """True only for a complete checkout of the exact supported LVGL release."""
    properties = path / "library.properties"
    public_header = path / "lvgl.h"
    try:
        versions = {
            line.partition("=")[2].strip()
            for line in properties.read_text(encoding="utf-8").splitlines()
            if line.startswith("version=")
        }
    except (OSError, UnicodeDecodeError):
        return False
    return public_header.is_file() and versions == {_LVGL_VERSION}


def _ensure_fbuild_lvgl_lib(ino: str = ""):
    """Vendor the pinned LVGL runtime and its deterministic configuration."""
    global _fbuild_lvgl_lib_ready
    if _fbuild_lvgl_lib_ready and _lvgl_checkout_matches_pin(_FBUILD_LVGL_LIB_DIR):
        _write_if_changed(_FBUILD_LV_CONF_PATH, _lv_conf_for_sketch(ino))
        return
    if _lvgl_checkout_matches_pin(_FBUILD_LVGL_LIB_DIR):
        _write_if_changed(_FBUILD_LV_CONF_PATH, _lv_conf_for_sketch(ino))
        _fbuild_lvgl_lib_ready = True
        return
    yield f"\n=== vendoring LVGL {_LVGL_VERSION} (first custom-display build only) ===\n"
    _FBUILD_LVGL_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    if _FBUILD_LVGL_LIB_DIR.exists():
        _remove_build_cache_tree(_FBUILD_LVGL_LIB_DIR)
    rc = yield from _run_phase(
        "vendor LVGL",
        ["git", "clone", "--progress", "--branch", f"v{_LVGL_VERSION}", "--depth", "1",
         "https://github.com/lvgl/lvgl.git", str(_FBUILD_LVGL_LIB_DIR)],
    )
    if rc != 0:
        yield "[error] failed to vendor pinned LVGL — custom Display builds will fail on lvgl.h\n"
        return
    if not _lvgl_checkout_matches_pin(_FBUILD_LVGL_LIB_DIR):
        yield (
            f"[error] the downloaded LVGL checkout is not the required {_LVGL_VERSION} release or is incomplete. "
            "Remove the cached lvgl directory and try again.\n"
        )
        return
    _write_if_changed(_FBUILD_LV_CONF_PATH, _lv_conf_for_sketch(ino))
    _fbuild_lvgl_lib_ready = True


_arduino_lvgl_lib_ready = False


def _ensure_arduino_lvgl_lib():
    """Ask arduino-cli for the same exact LVGL release used by fbuild."""
    global _arduino_lvgl_lib_ready
    if _arduino_lvgl_lib_ready:
        return 0
    rc = yield from _run_phase(
        f"install LVGL {_LVGL_VERSION}",
        _ARDUINO_BASE + ["lib", "install", f"lvgl@{_LVGL_VERSION}", "--no-deps"],
    )
    if rc != 0:
        yield (
            f"[error] failed to install LVGL {_LVGL_VERSION}. Check the network connection or run "
            f"'arduino-cli lib install lvgl@{_LVGL_VERSION}' and try again.\n"
        )
        return rc
    _arduino_lvgl_lib_ready = True
    return 0


def _write_fbuild_main(ino: str) -> None:
    # fbuild <= 2.5.15 preprocessed `.ino` into `main.ino.cpp`, auto-inserting
    # function prototypes *before* any user #includes — that broke FastLED-typed
    # helpers such as `CRGB kelvinToRGB(...)` because `CRGB` was still unknown at
    # that point. We worked around it by writing a plain `.cpp` to sidestep
    # Arduino sketch preprocessing entirely. fbuild 2.5.16 fixed the root cause
    # (FastLED/fbuild#1275: sketch #includes are now hoisted into the prelude
    # ahead of the generated prototypes), so plain `.ino` generation is restored
    # here — requirements.txt/constraints.txt pin fbuild>=2.5.16.
    #
    # Written only when the sketch actually differs (see `_write_if_changed`):
    # this is the project's largest translation unit, and touching it for an
    # identical re-upload cost a full recompile and relink of a firmware image
    # that was already sitting there.
    _write_if_changed(_FBUILD_SRC_DIR / "main.ino", ino)
    old_cpp = _FBUILD_SRC_DIR / "main.cpp"
    if old_cpp.exists():
        old_cpp.unlink()


app = FastAPI(title="Design Studio for FastLED Upload Helper")

# The studio is served from a different origin (the Vite dev server or the static
# site), so allow cross-origin calls from any localhost port.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _desktop_security_headers(request: Request, call_next):
    """Keep bundled static pages cross-origin isolated like Vite dev/preview.

    These headers are harmless on API-only helper responses and ensure the
    desktop launcher's same-process static site retains the browser capabilities
    used by the normal production preview.
    """
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    return response


# ── Compile / upload / serial helpers ─────────────────────────────────────────
# These three must match the provisioner's constants exactly — see
# `provisionerSketchGenerator.ts` (PROVISION_CHUNK / PROVISION_BAUD). The device
# is generated and flashed by the same release as this file, so they move
# together, but a mismatch stalls a transfer rather than failing it loudly.
CHUNK = 4096            # serial transfer block size — must match PROVISION_CHUNK
PROVISION_BAUD = 921600  # negotiated after the handshake; falls back to 115200

# Force UTF-8 across the ESP32 toolchain — its bundled Python (esptool, ...)
# prints build output through the locale codec (cp1252 on Windows) and dies with
# UnicodeEncodeError on the first non-cp1252 character.
_TOOLCHAIN_ENV = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}


# One reused directory per sketch name, so arduino-cli can find its own build
# cache again. It keys that cache on a hash of the *sketch path*
# (`~/.cache/arduino/sketches/<hash>` — `%LOCALAPPDATA%\arduino\sketches` on
# Windows), so the old `tempfile.mkdtemp()` per build meant every compile was a
# cache miss: the whole of FastLED rebuilt every time, and the result left
# behind. Measured on this machine before the change, that cache held 215
# directories and 16 GB, none of it ever reused.
#
# Only the compiled core survived across builds, in a separate path-independent
# cache — which is why arduino-cli was still faster than a cold fbuild but never
# got faster on a second run of the same design.
_SKETCH_DIR_ROOT = _DATA_DIR / "sketches"

# A shared directory needs a guard: a capacity check and an upload can run at
# once, and two builds writing different sketches into one folder would flash a
# binary built from the other one's source. Held for the whole compile, keyed by
# sketch name.
_sketch_dir_locks: dict[str, threading.Lock] = {}
_sketch_dir_locks_guard = threading.Lock()


def _sketch_dir_lock(name: str) -> threading.Lock:
    with _sketch_dir_locks_guard:
        return _sketch_dir_locks.setdefault(name, threading.Lock())


@contextlib.contextmanager
def _sketch_workspace(name: str, ino: str):
    """Yield the <name>/<name>.ino directory to compile `ino` from (arduino-cli
    needs the folder name to match the sketch).

    Normally that is the reused per-name directory, whose stable path is what
    lets arduino-cli hit its build cache. The sketch is written only if it
    differs, so a re-upload of an unchanged design doesn't invalidate the cached
    sketch object either.

    When another build already holds the directory, this falls back to a private
    temp directory and removes it afterwards — the pre-cache behaviour. Losing
    the cache costs a slow build; sharing the directory would cost a wrong one,
    and a second build waiting for the first would take just as long as the cold
    build it was trying to avoid."""
    lock = _sketch_dir_lock(name)
    if lock.acquire(blocking=False):
        try:
            sketch_dir = _SKETCH_DIR_ROOT / name
            sketch_dir.mkdir(parents=True, exist_ok=True)
            _write_if_changed(sketch_dir / f"{name}.ino", ino)
            if _LVGL_INCLUDE_MARKER in ino:
                _write_if_changed(sketch_dir / "lv_conf.h", _lv_conf_for_sketch(ino))
            yield sketch_dir
        finally:
            lock.release()
        return
    work = Path(tempfile.mkdtemp(prefix="fls_"))
    try:
        sketch_dir = work / name
        sketch_dir.mkdir()
        (sketch_dir / f"{name}.ino").write_text(ino, encoding="utf-8")
        if _LVGL_INCLUDE_MARKER in ino:
            (sketch_dir / "lv_conf.h").write_text(_lv_conf_for_sketch(ino), encoding="utf-8")
        yield sketch_dir
    finally:
        shutil.rmtree(work, ignore_errors=True)


# The build currently running, so a user who picked the wrong board can stop it
# instead of waiting out a compile they no longer want.
#
# Cancelling has to happen *here*, not by dropping the HTTP stream: the build
# runs inside a generator that holds `_fbuild_build_lock`, and abandoning it
# client-side leaves that lock held by a suspended generator with no subprocess
# to blame — the exact abandoned-holder case the lock's stale-reclaim exists to
# survive, which would then stall every later build for `_FBUILD_LOCK_STALE_S`.
# Killing the process makes `_run_phase` return normally, so the generator
# unwinds through its own `finally`: lock released, stashed libraries restored.
_active_build_lock = threading.Lock()
_active_build_proc: subprocess.Popen | None = None
_build_cancelled = False


def _register_build(proc: subprocess.Popen | None) -> None:
    global _active_build_proc
    with _active_build_lock:
        _active_build_proc = proc


def _build_was_cancelled() -> bool:
    with _active_build_lock:
        return _build_cancelled


def _begin_build_run() -> None:
    """Clear the cancelled flag as a new run starts, so one cancellation cannot
    label the next build."""
    global _build_cancelled
    with _active_build_lock:
        _build_cancelled = False


def _cancel_active_build() -> bool:
    """Stop the running build. True if there was one to stop.

    The whole tree, not just the front-end: fbuild delegates the compile to a
    long-lived `fbuild-daemon` child, so terminating the parent alone leaves the
    work running and the log silent.
    """
    global _build_cancelled
    with _active_build_lock:
        proc = _active_build_proc
        if proc is None or proc.poll() is not None:
            return False
        _build_cancelled = True
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)],
                           capture_output=True, check=False)
        else:
            proc.terminate()
    except Exception:
        return False
    return True


def _iter_stream_lines(stream):
    """Yield a subprocess's output as lines, treating a bare CR as a break.

    Build tools draw progress in place, with a carriage return and no newline:
    esptool's `Writing at 0x0001a000... (42 %)`, git clone's `Receiving
    objects:  61%`. Iterating the pipe by newline holds every one of those in
    the buffer until the tool finally emits one — so a flash sat at "Starting…"
    or one stale percentage and then jumped to 100% in a single burst at the
    end, and a clone said nothing at all for its whole duration.

    Read in chunks off the raw pipe rather than through a text wrapper, so a
    chunk surfaces as soon as the OS has it instead of when a line completes.
    """
    decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
    pending = ""
    while True:
        chunk = stream.read(4096)
        if not chunk:
            break
        pending += decoder.decode(chunk)
        while True:
            cr, lf = pending.find("\r"), pending.find("\n")
            if cr < 0 and lf < 0:
                break
            index = min(position for position in (cr, lf) if position >= 0)
            segment = pending[:index]
            broke_on_return = pending[index] == "\r"
            # CRLF is one break, not two.
            width = 2 if broke_on_return and pending[index + 1:index + 2] == "\n" else 1
            pending = pending[index + width:]
            # A bare CR with nothing before it is a tool repositioning the
            # cursor, not a blank line worth logging. A real newline is.
            if segment or not broke_on_return:
                yield segment + "\n"
    pending += decoder.decode(b"", final=True)
    if pending:
        yield pending + "\n"


def _format_duration(seconds: float) -> str:
    """Elapsed wall-clock the way a person would say it: `8.4s`, `1m 04s`,
    `1h 02m 03s`. Sub-minute keeps a decimal (the difference between a 2s and a
    9s flash is worth seeing); above that the seconds are padded, so successive
    runs line up against each other in the log."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes, secs = divmod(int(round(seconds)), 60)
    if minutes < 60:
        return f"{minutes}m {secs:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m {secs:02d}s"


def _reports_total_time(compile_upload):
    """Wrap a compile/upload generator so every run ends with one
    `[time] total ...` line, whichever engine ran it.

    Both engines already time their own phases in `_run_phase`, but the number
    people ask for is the whole thing, and neither tool prints it. Wrapping
    here rather than emitting at each `return` is what keeps the two paths from
    drifting: the fbuild path alone has seven exits (lock timeout, no board
    mapping, overflow, compile failure, compile-only, deploy, engine gap), and
    any one left un-instrumented would be a run that silently reported no time.

    The clock starts before the fbuild build lock is acquired, so a build that
    spent two minutes queued behind another says so -- that wait is part of
    what the user sat through. `busy` is the one phase with nothing to report:
    it never compiled or flashed anything, and a duration printed beside
    "DID NOT RUN" would read as a build that took that long."""
    @functools.wraps(compile_upload)
    def timed(*args, **kwargs):
        started = time.monotonic()
        rc, phase = yield from compile_upload(*args, **kwargs)
        if phase != "busy":
            yield f"  [time] total {_format_duration(time.monotonic() - started)}\n"
        return rc, phase
    return timed


def _run_phase(label, args, sink=None, cwd=None, tool_env=None):
    """Run one build-tool phase (arduino-cli or fbuild), yielding its output
    lines; returns the exit code. If `sink` (a list) is given, each output line
    is also appended to it so the caller can inspect the phase output (e.g. to
    parse the flash/RAM size report)."""
    _begin_build_run()
    yield f"\n=== {label} ===\n$ {' '.join(args)}\n"
    started = time.monotonic()
    try:
        proc = subprocess.Popen(
            args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            bufsize=0,
            env=tool_env if tool_env is not None else _TOOLCHAIN_ENV,
            cwd=cwd,
        )
    except Exception as e:
        yield f"[error] failed to launch {args[0]}: {e}\n"
        return -1
    _register_build(proc)
    for line in _iter_stream_lines(proc.stdout):
        if sink is not None:
            sink.append(line)
        # Evidence that this build is alive. Only a running holder reaches here,
        # so a generator abandoned mid-stream stops stamping and eventually
        # becomes reclaimable — see `_FbuildBuildLock`. A no-op for the
        # arduino-cli path, which shares this helper but holds no lock.
        _fbuild_build_lock.touch()
        yield line
    proc.wait()
    elapsed = time.monotonic() - started
    _register_build(None)
    if _build_was_cancelled():
        # Said before the exit code, and in a form `parseStatus` checks first:
        # a killed process exits non-zero, and reporting that as a build failure
        # would send the user looking for a fault in a graph they simply changed
        # their mind about.
        yield "\n*** CANCELLED *** Stopped at your request — nothing was sent to the board.\n"
        return proc.returncode
    yield f"[{label} exit code: {proc.returncode} · {_format_duration(elapsed)}]\n"
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


@_reports_total_time
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
    uses_lvgl = any(
        _LVGL_INCLUDE_MARKER in path.read_text(encoding="utf-8")
        for path in sketch_dir.glob("*.ino")
    )
    if uses_lvgl:
        rc = yield from _ensure_arduino_lvgl_lib()
        if rc != 0:
            return rc, "compile"
    compile_args = _ARDUINO_BASE + ["compile", "-v", "--fqbn", fqbn]
    if uses_lvgl:
        # The sketch directory is already on Arduino's include path. This flag
        # makes every separately compiled LVGL translation unit include the
        # generated header instead of falling back to LVGL's broad defaults.
        # LVGL itself is C while the generated sketch is C++, so both compiler
        # recipes need the define; setting only cpp.extra_flags configures the
        # caller but leaves the runtime compiled with its default catalogue.
        compile_args += [
            "--build-property", "compiler.c.extra_flags=-DLV_CONF_INCLUDE_SIMPLE",
            "--build-property", "compiler.cpp.extra_flags=-DLV_CONF_INCLUDE_SIMPLE",
        ]
    compile_args.append(str(sketch_dir))
    rc = yield from _run_phase(
        f"{label} · compile", compile_args,
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
    with _flashing():   # keeps `board list` off the port — see serial_ports()
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
    # An over-100% figure is reported, not discarded. fbuild's ESP32 RAM line
    # used to include sections that are not the board's usable internal SRAM
    # ("RAM: 1.28MB / 320.00KB (409.2%)" from a build that fitted), and this
    # returned None rather than mislead. That upstream bug is fixed (2.5.17,
    # verified on 2.5.21), and the guard turned out to hide the opposite and
    # worse case: on AVR, fbuild reports "build succeeded" for an image at
    # 135.4% of flash and 2059.8% of RAM, and discarding the RAM figure took
    # away the loudest evidence that the firmware cannot run. `_over_capacity`
    # below is what acts on it.
    return {
        "flash": int(float(flash.group(1))) if flash else None,
        "ram": int(float(ram.group(1))) if ram else None,
    }


# ── Compile-only capacity check ───────────────────────────────────────────────
# The live controller-capacity meter (frontend) wants the real used/limit byte
# counts, not just the percentage `_size_report`/`_fbuild_size_report` return —
# those two stay untouched (existing tests pin their exact shape) and these
# byte-level counterparts are used only by `/api/compile-check` below.

# Same sentence as `_FLASH_RE`/`_RAM_RE` above, widened to also capture the
# trailing "Maximum is N bytes" clause arduino-cli prints on the same line.
_FLASH_BYTES_RE = re.compile(
    r"Sketch uses (\d+) bytes \((\d+)%\) of program storage[^.]*\.\s*Maximum is (\d+) bytes", re.I
)
_RAM_BYTES_RE = re.compile(
    r"Global variables use (\d+) bytes \((\d+)%\) of dynamic memory[^.]*\.\s*Maximum is (\d+) bytes", re.I
)


def _size_bytes_report(lines):
    """arduino-cli counterpart to `_fbuild_size_bytes_report` — returns
    {"flash": {"usedBytes", "limitBytes", "percent"} | None, "ram": ... | None}."""
    text = "".join(lines)
    result: dict = {"flash": None, "ram": None}
    fm = _FLASH_BYTES_RE.search(text)
    if fm:
        result["flash"] = {"usedBytes": int(fm.group(1)), "percent": int(fm.group(2)), "limitBytes": int(fm.group(3))}
    rm = _RAM_BYTES_RE.search(text)
    if rm:
        result["ram"] = {"usedBytes": int(rm.group(1)), "percent": int(rm.group(2)), "limitBytes": int(rm.group(3))}
    return result


# fbuild prints e.g. "Flash: 4.45KB / 31.50KB (14.1%)" — used/total share one
# line per metric, but the unit (bytes/KB/MB) can differ between the two sides.
_FBUILD_BYTES_RE = re.compile(
    r"(Flash|RAM):\s*([\d.]+)\s*(\w*)\s*/\s*([\d.]+)\s*(\w*)\s*\((\d+(?:\.\d+)?)%\)", re.I
)
_SIZE_UNIT_MULT = {"": 1, "B": 1, "BYTES": 1, "KB": 1024, "MB": 1024 * 1024}


def _size_unit_to_bytes(value: float, unit: str) -> int:
    return round(value * _SIZE_UNIT_MULT.get(unit.strip().upper(), 1))


def _fbuild_size_bytes_report(lines):
    """Byte-level counterpart to `_fbuild_size_report` — returns
    {"flash": {"usedBytes", "limitBytes", "percent"} | None, "ram": ... | None}.
    Reports an over-100% figure rather than dropping it, for the reason given in
    `_fbuild_size_report`."""
    text = "".join(lines)
    result: dict = {"flash": None, "ram": None}
    for m in _FBUILD_BYTES_RE.finditer(text):
        kind = m.group(1).lower()
        pct = float(m.group(6))
        result[kind] = {
            "usedBytes": _size_unit_to_bytes(float(m.group(2)), m.group(3)),
            "limitBytes": _size_unit_to_bytes(float(m.group(4)), m.group(5)),
            "percent": round(pct),
        }
    return result


# A genuine flash/RAM overflow is usually a *hard linker failure* — ld refuses
# to produce an .elf at all, so fbuild never reaches the step that prints its
# own "Flash:"/"RAM:" summary. There's still real data in that failure,
# though: ld reports exactly how many bytes a region overflowed by, and
# fbuild always prints the board's memory budget up front (win or lose), so
# the two together are enough to compute a genuine over-100% percentage
# instead of a bare "won't fit".
_LD_OVERFLOW_RE = re.compile(r"region [`']([\w.]+)' overflowed by (\d+) bytes", re.I)
_FBUILD_MEMORY_RE = re.compile(r"Memory:\s*([\d.]+)\s*(\w+)\s*Flash,\s*([\d.]+)\s*(\w+)\s*RAM", re.I)


def _over_capacity(report) -> list[str]:
    """Which of flash/RAM a *successful* fbuild build reported over 100%.

    A build tool refusing to link an image that cannot fit is the size gate the
    whole upload path leans on -- arduino-cli enforces it, and `_compile_upload`
    says so. fbuild does not: on an Arduino Uno (31.50KB flash, 2.00KB RAM) it
    reports

        Flash: 42.64KB / 31.50KB (135.4%)
        RAM:   41.20KB / 2.00KB (2059.8%)
        build succeeded in 1.2s

    and emits a .hex, exit code 0. Nothing downstream would have caught that:
    the linker printed no overflow marker for `_looks_like_overflow` to find,
    and the percentages were the only evidence there was. So a successful build
    that measures over 100% is treated as the overflow it is."""
    return [
        kind for kind in ("flash", "ram")
        if report.get(kind) is not None and report[kind] > 100
    ]


def _fbuild_overflow_estimate(lines):
    """Derive {"flash": {...} | None, "ram": {...} | None} from a hard linker
    overflow — same shape as `_fbuild_size_bytes_report`/`_fbuild_cached_size`
    so callers can treat all three interchangeably. `None` for a side that
    wasn't mentioned (or whose region name doesn't look flash/RAM-shaped)."""
    text = "".join(lines)
    mem = _FBUILD_MEMORY_RE.search(text)
    if not mem:
        return {"flash": None, "ram": None}
    flash_max = _size_unit_to_bytes(float(mem.group(1)), mem.group(2))
    ram_max = _size_unit_to_bytes(float(mem.group(3)), mem.group(4))

    result: dict = {"flash": None, "ram": None}
    for region, amount in _LD_OVERFLOW_RE.findall(text):
        is_ram = "ram" in region.lower()
        limit = ram_max if is_ram else flash_max
        if limit <= 0:
            continue
        used = limit + int(amount)
        metric = {"usedBytes": used, "limitBytes": limit, "percent": round(used / limit * 100)}
        key = "ram" if is_ram else "flash"
        # ld sometimes repeats the same region's error more than once — keep
        # the largest reported overflow for that region. Compared on the raw
        # byte count, not the rounded percent, since two overflows can easily
        # round to the same percentage on a large region.
        if result[key] is None or metric["usedBytes"] > result[key]["usedBytes"]:
            result[key] = metric
    return result


def _drain_compile(gen):
    """Run a `_compile_upload`/`_compile_upload_fbuild` generator to completion,
    collecting its yielded log lines and returning `(lines, (rc, phase))` — used
    by the compile-only capacity check, which wants one final JSON result
    instead of a streamed log."""
    lines = []
    try:
        while True:
            lines.append(next(gen))
    except StopIteration as stop:
        return lines, stop.value


@_reports_total_time
def _compile_upload_fbuild(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
    """fbuild-engine counterpart to `_compile_upload` — same (rc, phase)
    contract, so callers don't need to know which engine ran.

    Holds `_fbuild_build_lock` for the whole run: fbuild's project scaffold is
    one shared directory (see above), so a second build starting before this
    one finishes would overwrite `main.ino` and interleave `fbuild build`
    output — serializing here is what makes that impossible rather than just
    unlikely. The acquire is timeout-bounded (see `_FBUILD_LOCK_TIMEOUT_S`)
    so a genuinely wedged build fails fast and visibly instead of silently
    starving every later build/upload/capacity-check request forever."""
    # Take the wait in slices instead of one blocking `acquire`, and narrate it.
    # The UI derives its status from this stream, so a build queued behind
    # another one used to produce no output at all for up to
    # `_FBUILD_LOCK_TIMEOUT_S` — the Upload button sat on "Starting…" for three
    # minutes with nothing to distinguish queued from compiling from wedged.
    # Saying so costs one line and turns a mystery into a wait.
    token = _fbuild_build_lock.acquire(0, _FBUILD_LOCK_STALE_S)
    if token is None:
        waited = 0.0
        yield ("\n  [waiting] the build directory is busy with another build — "
               "queued behind it, nothing is wrong\n")
        while token is None and waited < _FBUILD_LOCK_TIMEOUT_S:
            step = min(_FBUILD_LOCK_POLL_S, _FBUILD_LOCK_TIMEOUT_S - waited)
            token = _fbuild_build_lock.acquire(step, _FBUILD_LOCK_STALE_S)
            waited += step
            if token is None and waited < _FBUILD_LOCK_TIMEOUT_S:
                yield f"  [waiting] still queued ({int(waited)}s of {int(_FBUILD_LOCK_TIMEOUT_S)}s)…\n"
    if token is None:
        yield (
            f"\n=== ✗ {label}: another fbuild build is still running (waited "
            f"{_FBUILD_LOCK_TIMEOUT_S}s) ===\n"
            "  Builds are serialized because they share one project directory.\n"
            "  Nothing was compiled or sent to the board — your sketch is fine.\n"
            "  Wait for the other build to finish and try again; if it never\n"
            f"  does, it is treated as abandoned after {_FBUILD_LOCK_STALE_S}s and\n"
            "  the next attempt takes over automatically.\n"
        )
        return -1, "busy"
    try:
        yield from _ensure_fbuild_project()
        if "#include <esp_dmx.h>" in ino:
            yield from _ensure_fbuild_esp_dmx_lib()
        if "#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>" in ino:
            yield from _ensure_fbuild_hub75_lib()
        if "#include <Adafruit_ZeroI2S.h>" in ino:
            yield from _ensure_fbuild_zero_i2s_lib()
        if _LVGL_INCLUDE_MARKER in ino:
            yield from _ensure_fbuild_lvgl_lib(ino)
        env = _fbuild_env_for_fqbn(fqbn, flash_mb, usb_cdc)
        if env is None:
            yield f"\n=== ✗ {label}: no fbuild board mapping for {fqbn} ===\n"
            return -1, "compile"
        compile_lines = []
        with _fbuild_libraries_for_sketch(ino):
            _write_fbuild_main(ino)
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
        over = _over_capacity(report)
        if over:
            measured = ", ".join(f"{kind} {report[kind]}%" for kind in over)
            yield (
                f"\n=== \u2717 Too big for {fqbn} ===\n"
                f"  The build linked, but it does not fit: {measured}.\n"
                "  Try fewer patterns in the collection, a smaller matrix, or fewer\n"
                "  heavy nodes (Image / audio / field) - or pick a board (or ESP32\n"
                "  partition scheme) with more space.\n"
                "  [size-error] won't fit on this board\n"
            )
            return -1, "compile"
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
        deploy_args = [
            _FBUILD_BIN, "deploy", "-e", env, "-p", port,
            "--skip-build", "--no-timestamp",
        ]
        deploy_env = None
        if env.startswith("esp32_"):
            # Focused 2.5.21 deploy-path experiment. The two remaining
            # differences from the shell esptool control were fbuild's high
            # per-board baud and its bare-name tool lookup. Hold both constant:
            # use esptool's default 115200 and put the executable installed with
            # this helper's interpreter first on PATH. fbuild#1234 carries the
            # requesting PATH through to the daemon that performs the spawn.
            if not _ESPTOOL_BIN:
                yield (
                    "  [engine-gap] The pinned esptool executable is missing, so the "
                    "fbuild ESP32 deploy experiment cannot run. Switch to the "
                    "arduino-cli engine and try again.\n"
                )
                return -1, "upload"
            deploy_args.extend(["-b", "115200"])
            deploy_env = {
                **_TOOLCHAIN_ENV,
                "PATH": str(Path(_ESPTOOL_BIN).parent)
                + os.pathsep
                + _TOOLCHAIN_ENV.get("PATH", ""),
            }
            yield f"  [deploy experiment] baud 115200 · esptool {_ESPTOOL_BIN}\n"
        # esptool (spawned fresh by each `deploy`) intermittently loses the race
        # against Windows fully releasing the port after a *previous* flash's
        # hard reset (or another brief holder, e.g. the frontend's live serial
        # monitor tearing down) — "Could not open COM5 ... PermissionError(13,
        # 'Access is denied.')". It isn't a real hardware problem and clears up
        # on its own within a couple seconds, so retry a couple times before
        # surfacing it as a failure.
        upload_lines = []
        for attempt in range(3):
            upload_lines = []
            with _flashing():   # keeps `board list` off the port — see serial_ports()
                rc = yield from _run_phase(
                    f"{label} · upload", deploy_args,
                    sink=upload_lines, cwd=_FBUILD_PROJECT_DIR, tool_env=deploy_env,
                )
            if rc == 0:
                break
            port_busy = any("access is denied" in line.lower() or "port is busy" in line.lower() for line in upload_lines)
            if not port_busy or attempt == 2:
                break
            yield f"  [retry] {port} looked busy (still releasing from a previous flash?) — retrying in 2s…\n"
            time.sleep(2.0)
        # fbuild's own deployer doesn't cover every platform it can compile for
        # yet (e.g. Espressif8266, as of 2.5.4) — arduino-cli's mature per-board
        # upload tooling still handles those, so point at the working fallback
        # instead of leaving a bare "deployer ... not yet implemented" error.
        if rc != 0 and any("not yet implemented" in line.lower() for line in upload_lines):
            yield "  [engine-gap] fbuild can't flash this board yet. Switch to the arduino-cli engine and try again.\n"
        return rc, "upload"
    finally:
        _fbuild_build_lock.release(token)


def _upload_result_lines(rc, phase, port):
    """Shared status messaging after a compile/upload run, whichever engine ran it."""
    if rc == 0 and port:
        yield "\nUpload complete.\n"
    elif phase == "busy":
        # Never blame the sketch here: nothing was compiled. Saying "the sketch
        # didn't compile" sends the user to inspect a graph that is fine.
        yield ("\n*** DID NOT RUN *** Another build was already using the build "
               "directory. Nothing was compiled or sent to the board.\n")
    elif _build_was_cancelled():
        pass  # already said so, in _run_phase, before the exit code
    elif rc != 0 and phase == "compile":
        yield (f"\n*** BUILD FAILED (exit code {rc}) *** The sketch didn't compile, so "
               "nothing was sent to the board — see the errors above.\n")
    elif rc != 0:
        yield (f"\n*** UPLOAD FAILED (exit code {rc}) *** The sketch compiled, but flashing "
               "failed. If it couldn't connect, put the board in download mode "
               "(hold BOOT, tap RST) and retry.\n")


def _serial_send(port, payloads):
    """Host side of the file-transfer protocol: PING -> READY, then PUT each file
    in CHUNK blocks with a per-block ack. Yields progress lines; returns True on
    ok. The device end is the player sketch (it carries the receiver itself);
    the standalone provisioner speaks the same protocol."""
    try:
        import serial  # pyserial — lazy so the module still loads without it
    except ImportError:
        yield "[error] pyserial not installed — pip install -r backend/requirements.txt\n"
        return False

    yield f"\n=== Transfer to SD ({len(payloads)} file(s)) ===\n"
    time.sleep(2.0)  # let the board reboot into the freshly-flashed player

    ser = None
    for _ in range(5):
        candidate = None
        try:
            # A block ack (below) can take much longer than typical serial I/O:
            # the first SD write to a fresh file on a large, freshly-formatted
            # card has to walk the FAT for a free cluster, which can take many
            # seconds even though the write itself succeeds. A short timeout
            # here reads as a lost ack and aborts the whole transfer.
            #
            # Configure DTR/RTS before opening. On Windows, Serial(port, ...)
            # opens immediately with both control lines asserted; on an
            # ESP32-S3 native USB-Serial/JTAG port that pulse sends the freshly
            # flashed board back into ROM download mode. Clearing the lines
            # afterward is too late — the transfer then sees only "ESP-ROM"
            # and the player never receives PING. This mirrors serial_monitor.
            candidate = serial.Serial()
            candidate.port = port
            candidate.baudrate = 115200
            candidate.timeout = 20
            candidate.dtr = False
            candidate.rts = False
            candidate.open()
            ser = candidate
            break
        except Exception as e:
            if candidate is not None:
                try:
                    candidate.close()
                except Exception:
                    pass
            yield f"  opening {port}… ({e})\n"
            time.sleep(1.0)
    if ser is None:
        yield f"[error] could not open {port}\n"
        return False

    def line():
        return ser.readline().decode(errors="replace").strip()

    try:
        # Read the boot greeting before anything resets the input buffer.
        #
        # A board that cannot mount the card prints "ERR sd-mount-failed" and
        # halts, never answering a PING again. The retry loop below clears the
        # buffer before each attempt, which used to discard that line, so a card
        # that simply had no power produced ~165s of silence and a guess
        # ("did not report READY (SD mounted?)") when the board had already
        # said precisely what was wrong. Observed 2026-08-16.
        #
        # The player also greets with whatever it is doing ("Playing: …"), which
        # is not READY — the PING loop below is what establishes contact.
        ser.timeout = 3
        greeting = line()
        ser.timeout = 20
        if greeting:
            yield f"  board says: {greeting}\n"
        if greeting.startswith("ERR sd-mount"):
            yield ("[error] the board could not mount the SD card — it is halted.\n"
                   "  Check the card is inserted and formatted FAT32, that the reader has\n"
                   "  power, and that its CS pin matches the SD Card node.\n")
            return False

        ready = greeting == "READY"
        last = greeting
        attempt = 0
        while not ready and attempt < 8:
            attempt += 1
            ser.reset_input_buffer()
            ser.write(b"PING\n")
            ser.flush()
            reply = line()
            if reply == "READY":
                ready = True
                break
            if reply:
                last = reply
                yield f"  board says: {reply}\n"
            else:
                # Say something every attempt. Silence here is indistinguishable
                # from a hang, and this loop can run for well over two minutes.
                yield f"  waiting for the board ({attempt}/8)…\n"
            time.sleep(0.5)
        if not ready:
            detail = f" — last reply: {last}" if last else " — it sent nothing at all"
            yield (f"[error] the board never reported READY{detail}\n"
                   "  If it sent nothing, check power and that the player flashed.\n")
            return False

        # Raise the link now that the board has proven it is alive. A song is
        # megabytes: at 115200 that is ~11 minutes, which makes the feature
        # unusable. The handshake stays at 115200 so first contact can never be
        # what fails, and the new rate is verified with a PING before any file
        # is sent — a bridge that cannot hold it falls back rather than
        # corrupting a transfer.
        ser.write(f"BAUD {PROVISION_BAUD}\n".encode())
        ser.flush()
        if line() == "OK":
            time.sleep(0.15)  # device flushes its "OK" and switches
            ser.baudrate = PROVISION_BAUD
            fast = False
            for _ in range(5):
                ser.reset_input_buffer()
                ser.write(b"PING\n")
                ser.flush()
                if line() == "READY":
                    fast = True
                    break
                time.sleep(0.2)
            if fast:
                yield f"  link raised to {PROVISION_BAUD} baud\n"
            else:
                ser.baudrate = 115200
                ser.reset_input_buffer()
                yield "  [warn] board did not answer at the higher rate — continuing at 115200\n"
        else:
            yield "  [warn] board kept the link at 115200 (older sketch?)\n"

        for path, data in payloads:
            yield f"  -> {path} ({len(data)} bytes)\n"
            ser.reset_input_buffer()
            ser.write(f"PUT {path} {len(data)}\n".encode())
            ser.flush()
            if line() != "OK":
                yield f"[error] device refused {path}\n"
                return False
            sent = 0
            # Report roughly every 5%. A multi-megabyte song is minutes of
            # transfer, and a log that says nothing at all for that long is
            # indistinguishable from a hang — which is exactly how a genuine
            # stall was misread during bring-up.
            step = max(len(data) // 20, CHUNK)
            next_report = step
            started = time.monotonic()
            while sent < len(data):
                block = data[sent:sent + CHUNK]
                ser.write(block)
                ser.flush()
                if line() != "A":
                    yield f"[error] lost ack for {path} at byte {sent}\n"
                    return False
                sent += len(block)
                if sent >= next_report and sent < len(data):
                    elapsed = time.monotonic() - started
                    rate = sent / elapsed / 1024 if elapsed > 0 else 0
                    eta = (len(data) - sent) / (sent / elapsed) if sent and elapsed > 0 else 0
                    yield f"     {sent * 100 // len(data)}%  {rate:.0f} KB/s  ~{eta:.0f}s left\n"
                    next_report = sent + step
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


_WINDOWS_EDITION_LABELS = {
    "Core": "Home",
    "CoreN": "Home N",
    "CoreSingleLanguage": "Home Single Language",
    "Professional": "Pro",
    "ProfessionalN": "Pro N",
    "Enterprise": "Enterprise",
    "EnterpriseN": "Enterprise N",
    "Education": "Education",
    "EducationN": "Education N",
}


def _system_info() -> dict:
    """Exact host OS name/build for the hardware validation report's Host OS
    field — no browser API can expose this (User-Agent Client Hints only give
    a coded Windows release marker, never the real build number)."""
    system = platform.system()
    if system == "Windows":
        try:
            build = sys.getwindowsversion().build  # type: ignore[attr-defined]
            release = "11" if build >= 22000 else "10"
            version_label = f"10.0.{build}"
        except Exception:
            build = None
            release = platform.release()
            version_label = platform.version()
        try:
            edition = _WINDOWS_EDITION_LABELS.get(platform.win32_edition())  # type: ignore[attr-defined]
        except Exception:
            edition = None
        os_label = f"Windows {release}" + (f" {edition}" if edition else "")
    elif system == "Darwin":
        mac_release, _, _ = platform.mac_ver()
        os_label = f"macOS {mac_release}" if mac_release else "macOS"
        version_label = mac_release or platform.release()
    elif system == "Linux":
        try:
            info = platform.freedesktop_os_release()  # type: ignore[attr-defined]
            os_label = info.get("PRETTY_NAME") or f"Linux {platform.release()}"
        except Exception:
            os_label = f"Linux {platform.release()}"
        version_label = platform.release()
    else:
        os_label = system or "Unknown"
        version_label = platform.release()
    return {
        "ok": True,
        "os": os_label,
        "osVersion": version_label,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/api/system-info")
def system_info():
    return _system_info()


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
    #
    # Skipped while a flash is running: `board list` *opens* every serial port
    # to identify what is on it, holding each for several seconds. If that
    # lands while esptool is trying to connect, the flash dies with a bare
    # "Access is denied" that looks like a stuck monitor, a wedged driver, or a
    # dead board — none of which it is. Cost hours on 2026-08-16. pyserial's
    # enumeration below needs no open and still lists the port, so the dropdown
    # keeps working during an upload; only the board-name enrichment pauses.
    if _ARDUINO_CLI and not _flash_in_progress():
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
                    "vid": None,
                    "pid": None,
                    "serialNumber": None,
                    "manufacturer": None,
                    "product": None,
                    "interface": None,
                    "location": None,
                    "hwid": None,
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
                by_addr[key].update({
                    "vid": getattr(p, "vid", None),
                    "pid": getattr(p, "pid", None),
                    "serialNumber": getattr(p, "serial_number", None),
                    "manufacturer": getattr(p, "manufacturer", None),
                    "product": getattr(p, "product", None),
                    "interface": getattr(p, "interface", None),
                    "location": getattr(p, "location", None),
                    "hwid": getattr(p, "hwid", None),
                })
            else:
                by_addr[key] = {
                    "address": p.device,
                    "label": label,
                    "protocol": "serial",
                    "boards": [],
                    "vid": getattr(p, "vid", None),
                    "pid": getattr(p, "pid", None),
                    "serialNumber": getattr(p, "serial_number", None),
                    "manufacturer": getattr(p, "manufacturer", None),
                    "product": getattr(p, "product", None),
                    "interface": getattr(p, "interface", None),
                    "location": getattr(p, "location", None),
                    "hwid": getattr(p, "hwid", None),
                }
    except Exception:
        pass

    return {"ok": True, "ports": sorted(by_addr.values(), key=lambda x: x["address"])}


# The active serial monitor's open port, so a flash can reclaim it.
#
# Relying on the client disconnect alone does not work: the monitor is a
# generator, and Starlette only notices a dropped client when a body write
# fails, so a quiet board can hold the port indefinitely after the browser has
# aborted. The frontend already calls stopSerial() before every upload — the
# abort was never the problem, the release was. Tracking the handle here makes
# reclaiming it explicit rather than a race against disconnect detection.
_monitor_lock = threading.Lock()
_monitor_serial = None
_monitor_port: str | None = None


# Number of flashes in flight. `board list` opens every serial port to probe
# it, so it must not run while esptool is trying to connect — see serial_ports().
# A counter rather than a flag: the show pipeline flashes three times in one
# request, and nested/overlapping phases must not clear it early.
_flash_lock = threading.Lock()
_flash_count = 0


def _flash_in_progress() -> bool:
    with _flash_lock:
        return _flash_count > 0


@contextlib.contextmanager
def _flashing():
    """Mark a flash as running for the duration of the block."""
    global _flash_count
    with _flash_lock:
        _flash_count += 1
    try:
        yield
    finally:
        with _flash_lock:
            _flash_count -= 1


def _release_monitor(port: str) -> bool:
    """Close the serial monitor if it holds `port`. True if one was closed."""
    global _monitor_serial, _monitor_port
    with _monitor_lock:
        if _monitor_serial is None or _monitor_port != port:
            return False
        try:
            _monitor_serial.close()
        except Exception:
            pass
        _monitor_serial = None
        _monitor_port = None
        return True


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

        global _monitor_serial, _monitor_port
        ser = None
        try:
            # Configure the control lines *before* opening, not after.
            #
            # `serial.Serial(port, ...)` opens immediately, and Windows asserts
            # DTR and RTS on open — so clearing them on the next line is already
            # too late: the pulse has happened. On an ESP32 those lines drive the
            # auto-reset circuit (EN and GPIO0), and on a native USB-Serial/JTAG
            # part the ROM reads that same combination as "enter download mode".
            # Observed on an ESP32-S3: attaching the monitor reset the board into
            # `boot:0x0 (DOWNLOAD(USB/UART0))`, waiting for a download that was
            # never coming, with the freshly flashed sketch never running.
            #
            # Building the port unopened lets pyserial apply the state we want as
            # part of the open itself.
            ser = serial.Serial()
            ser.port = port
            ser.baudrate = baud
            ser.timeout = 0.2
            ser.dtr = False
            ser.rts = False
            ser.open()
            with _monitor_lock:
                _monitor_serial, _monitor_port = ser, port
            yield f"[serial] connected to {port} at {baud} baud\n".encode()
            while True:
                data = ser.read(ser.in_waiting or 1)
                # Yield even with nothing to send. A generator can only be
                # closed at a `yield`, so yielding solely when data arrives
                # means a *quiet* board has no cancellation point: the client
                # aborts, this loop keeps reading, and the port stays open. The
                # next upload then fails with "Access is denied" — which is
                # what a freshly flashed, silent provisioner produced on
                # 2026-08-16. The empty chunk costs nothing on the wire and
                # gives the read timeout a chance to release the port.
                # A closed handle means a flash reclaimed the port (see
                # _release_monitor); end the stream instead of erroring.
                if not ser.is_open:
                    yield b"\n[serial] port released for upload\n"
                    return
                yield data if data else b""
        except GeneratorExit:
            return
        except Exception as e:
            yield f"[error] {e}\n".encode(errors="replace")
        finally:
            with _monitor_lock:
                if _monitor_serial is ser:
                    _monitor_serial = None
                    _monitor_port = None
            if ser is not None and ser.is_open:
                ser.close()

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")


@app.post("/api/rtc/set")
def set_rtc_time(payload: dict = Body(...)):
    """Set a DS3231 through a Studio-generated sketch already on the board.

    This is deliberately a narrow protocol rather than an arbitrary serial
    write endpoint: the browser may send one validated local civil timestamp,
    and firmware must explicitly acknowledge that it wrote the RTC.
    """
    import datetime as _datetime
    import re as _re

    port = str(payload.get("port") or "").strip()
    value = str(payload.get("dateTime") or "").strip()
    match = _re.fullmatch(r"(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})", value)
    if not port:
        return JSONResponse({"ok": False, "error": "a serial port is required"}, status_code=400)
    if not match:
        return JSONResponse({"ok": False, "error": "dateTime must use YYYY-MM-DD HH:MM:SS"}, status_code=400)
    try:
        _datetime.datetime(*map(int, match.groups()))
    except ValueError:
        return JSONResponse({"ok": False, "error": "dateTime is not a real calendar time"}, status_code=400)
    if _flash_in_progress():
        return JSONResponse({"ok": False, "error": "an upload is using the serial port"}, status_code=409)
    if _stream_active() and _stream_port == port:
        return JSONResponse({"ok": False, "error": "port is in use by a live stream — stop it first"}, status_code=409)

    _release_monitor(port)
    try:
        import serial
        ser = serial.Serial(port, 115200, timeout=3, write_timeout=3)
        ser.dtr = False
        ser.rts = False
        try:
            # Give USB CDC/bridge boards a moment after opening, then discard
            # boot chatter before issuing the one explicit command.
            time.sleep(0.25)
            if hasattr(ser, "reset_input_buffer"):
                ser.reset_input_buffer()
            ser.write(f"FLS_RTC_SET {value}\n".encode("ascii"))
            ser.flush()
            deadline = time.monotonic() + 3.0
            serial_message = ""
            while time.monotonic() < deadline:
                reply = ser.readline().decode(errors="replace").strip()
                if reply.startswith("RTC clock set "):
                    serial_message = reply
                if reply == "FLS_RTC_OK":
                    return {"ok": True, "dateTime": value, "serialMessage": serial_message or "RTC clock set successfully"}
                if reply == "FLS_RTC_ERROR":
                    return JSONResponse({
                        "ok": False,
                        "error": "the board could not write the DS3231",
                        "serialMessage": serial_message or "RTC clock set failed",
                    }, status_code=502)
            return JSONResponse({"ok": False, "error": "the board did not acknowledge the RTC command; upload the current sketch first"}, status_code=504)
        finally:
            ser.close()
    except Exception as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=503)


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
            # write_timeout bounds how long a write can block: without it pyserial
            # defaults to an indefinite blocking write, and if the receiver ever
            # falls behind (e.g. mid `FastLED.show()` with interrupts disabled)
            # long enough to back up the OS/driver output buffer, a write would
            # hang forever — see stream_frame's off-thread dispatch for why that
            # matters beyond just this one request.
            ser = serial.Serial(port, baud, timeout=0, write_timeout=1.0)
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


# A hard backstop above pyserial's own `write_timeout` (1.0s, set in
# stream_start). In practice a stalled receiver has been observed to make
# Serial.write() block far past that configured timeout on Windows — a known
# limitation of pyserial's overlapped-I/O write path with some USB-serial
# drivers, which don't reliably signal the timeout back through
# GetOverlappedResult when the device stops draining its input buffer. When
# that happens, `write_timeout` alone leaves the write hung forever, which
# used to wedge _stream_lock permanently (every later frame/stop/start request
# would then also block acquiring it) with no error ever surfacing — the
# stream just silently froze. This timeout is enforced independently at the
# asyncio layer, and closing the port's handle from here is what actually
# unblocks (or invalidates) the wedged write in its worker thread, since nothing
# else can interrupt a stuck blocking syscall in Python.
_STREAM_WRITE_TIMEOUT_S = 2.0


def _stream_write_sync(ser, body: bytes) -> None:
    """Blocking write on an already-open port object — runs in a worker
    thread. Takes `ser` directly (rather than reading the module global)
    so it never needs to hold `_stream_lock` for the write itself — only a
    quick snapshot/clear of the shared reference needs the lock, so one
    wedged write can't block every other stream request behind it."""
    ser.write(body)


async def _stream_fail(ser, error: str, status: int) -> JSONResponse:
    """A write failed or timed out — force the port closed and clear the
    session so the frontend's next frame/start sees a clean failure instead
    of silently going nowhere. Closing here (not from the possibly still-
    blocked write thread) is what lets an orphaned wedged write eventually
    unblock, since `Serial.close()` cancels a pending Windows overlapped I/O."""
    global _stream_serial
    with _stream_lock:
        if _stream_serial is ser:
            _stream_serial = None
    try:
        ser.close()
    except Exception:
        pass
    return JSONResponse({"ok": False, "error": error}, status_code=status)


@app.post("/api/stream/frame")
async def stream_frame(request: Request):
    """Write one pre-framed Adalight packet straight to the open stream port.

    The body is already the exact bytes to send (header + checksum + RGB data,
    built client-side by `src/utils/adalight.ts`) — this endpoint is deliberately
    just a thin pipe so per-frame overhead stays minimal.

    The write itself runs via `asyncio.to_thread` rather than inline: this
    process runs a single asyncio event loop, and `Serial.write()` can block
    for up to the port's `write_timeout` if the receiver falls behind. An
    inline blocking write would freeze every other request the helper is
    serving, not just this one — previously this could wedge live streaming
    silently (the frontend's fetch just never resolves) once enough backlog
    built up. `asyncio.wait_for` adds a second, independent bound on top of
    pyserial's own `write_timeout` — see `_STREAM_WRITE_TIMEOUT_S`.
    """
    body = await request.body()
    with _stream_lock:
        ser = _stream_serial
    if ser is None:
        return JSONResponse({"ok": False, "error": "stream not started"}, status_code=409)
    try:
        await asyncio.wait_for(asyncio.to_thread(_stream_write_sync, ser, body), timeout=_STREAM_WRITE_TIMEOUT_S)
    except asyncio.TimeoutError:
        return await _stream_fail(ser, "write timed out — the port may be wedged; stream stopped", 500)
    except Exception as e:
        return await _stream_fail(ser, str(e), 500)
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


# ── Art-Net / DMX preview helper ─────────────────────────────────────────────
# The browser preview can't bind UDP sockets directly, so the local helper keeps
# one listener alive across requests and exposes cached universe snapshots over
# HTTP.
_ARTNET_LIVE_TTL_S = 2.0
_artnet_lock = threading.Lock()
_artnet_socket: socket.socket | None = None
_artnet_thread: threading.Thread | None = None
_artnet_stop_event: threading.Event | None = None
_artnet_port: int = 6454
_artnet_error: str | None = None
_artnet_snapshots: dict[int, dict] = {}


def _artnet_blank_channels() -> list[int]:
    return [0] * 512


def _artnet_last_packet_ms(snapshot: dict | None) -> int | None:
    if not snapshot or snapshot.get("last_packet_at") is None:
        return None
    return int(float(snapshot["last_packet_at"]) * 1000)


def _artnet_is_live(snapshot: dict | None, now: float | None = None) -> bool:
    if not snapshot or snapshot.get("last_packet_at") is None:
        return False
    now = time.time() if now is None else now
    return now - float(snapshot["last_packet_at"]) <= _ARTNET_LIVE_TTL_S


def _artnet_listening_locked() -> bool:
    return _artnet_socket is not None and _artnet_thread is not None and _artnet_thread.is_alive()


def _artnet_stop_listener(clear_error: bool = False) -> None:
    global _artnet_socket, _artnet_thread, _artnet_stop_event, _artnet_port, _artnet_snapshots, _artnet_error
    with _artnet_lock:
        sock = _artnet_socket
        thread = _artnet_thread
        stop_event = _artnet_stop_event
        _artnet_socket = None
        _artnet_thread = None
        _artnet_stop_event = None
        _artnet_snapshots = {}
        if clear_error:
            _artnet_error = None
    if stop_event is not None:
        stop_event.set()
    if sock is not None:
        try:
            sock.close()
        except Exception:
            pass
    if thread is not None and thread.is_alive():
        thread.join(timeout=1.0)


def _artnet_listener_loop(sock: socket.socket, stop_event: threading.Event) -> None:
    global _artnet_socket, _artnet_thread, _artnet_stop_event, _artnet_error
    try:
        while not stop_event.is_set():
            try:
                packet, _addr = sock.recvfrom(1024)
            except socket.timeout:
                continue
            except OSError:
                if stop_event.is_set():
                    break
                raise
            if len(packet) < 18 or not packet.startswith(b"Art-Net\x00"):
                continue
            opcode = packet[8] | (packet[9] << 8)
            if opcode != 0x5000:
                continue
            universe = packet[14] | (packet[15] << 8)
            count = min(((packet[16] << 8) | packet[17]), 512)
            if len(packet) < 18 + count:
                continue
            channels = _artnet_blank_channels()
            payload = packet[18:18 + count]
            channels[:len(payload)] = payload
            now = time.time()
            with _artnet_lock:
                previous = _artnet_snapshots.get(universe)
                prev_at = float(previous["last_packet_at"]) if previous and previous.get("last_packet_at") is not None else None
                packet_rate = (1.0 / max(0.001, now - prev_at)) if prev_at is not None else 0.0
                _artnet_snapshots[universe] = {
                    "channels": channels,
                    "last_packet_at": now,
                    "packet_rate": packet_rate,
                    "valid": True,
                }
                _artnet_error = None
    except Exception as exc:
        with _artnet_lock:
            _artnet_error = str(exc)
    finally:
        with _artnet_lock:
            if _artnet_socket is sock:
                _artnet_socket = None
            if _artnet_stop_event is stop_event:
                _artnet_stop_event = None
            _artnet_thread = None
        try:
            sock.close()
        except Exception:
            pass


@app.post("/api/artnet/start")
def artnet_start(payload: dict = Body(...)):
    global _artnet_socket, _artnet_thread, _artnet_stop_event, _artnet_port, _artnet_error
    port = int(payload.get("port") or 6454)
    if port < 1 or port > 65535:
        return JSONResponse({"ok": False, "error": "UDP port must be between 1 and 65535"}, status_code=400)
    with _artnet_lock:
        if _artnet_listening_locked() and _artnet_port == port:
            return {"ok": True}
    _artnet_stop_listener(clear_error=True)
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(("0.0.0.0", port))
        sock.settimeout(0.25)
    except Exception as exc:
        try:
            sock.close()
        except Exception:
            pass
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    stop_event = threading.Event()
    thread = threading.Thread(target=_artnet_listener_loop, args=(sock, stop_event), daemon=True, name="artnet-listener")
    with _artnet_lock:
        _artnet_socket = sock
        _artnet_thread = thread
        _artnet_stop_event = stop_event
        _artnet_port = port
        _artnet_error = None
    thread.start()
    return {"ok": True}


@app.post("/api/artnet/stop")
def artnet_stop():
    _artnet_stop_listener(clear_error=True)
    return {"ok": True}


@app.get("/api/artnet/status")
def artnet_status(universe: int = 0):
    with _artnet_lock:
        snapshot = _artnet_snapshots.get(universe)
        listening = _artnet_listening_locked()
        port = _artnet_port
        error = _artnet_error
    return {
        "ok": True,
        "listening": listening,
        "port": port,
        "live": _artnet_is_live(snapshot),
        "packetRate": float(snapshot.get("packet_rate") or 0.0) if snapshot else 0.0,
        "lastPacketAt": _artnet_last_packet_ms(snapshot),
        "error": error,
    }


@app.get("/api/artnet/snapshot")
def artnet_snapshot(universe: int = 0):
    with _artnet_lock:
        snapshot = _artnet_snapshots.get(universe)
    return {
        "ok": True,
        "universe": universe,
        "valid": bool(snapshot and snapshot.get("valid")),
        "live": _artnet_is_live(snapshot),
        "packetRate": float(snapshot.get("packet_rate") or 0.0) if snapshot else 0.0,
        "lastPacketAt": _artnet_last_packet_ms(snapshot),
        "channels": list(snapshot["channels"]) if snapshot else _artnet_blank_channels(),
    }


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

    Body: {"core": "esp32:esp32", "url": "..."}. For third-party cores the
    matching board-manager URL is registered first — either the built-in
    `_CORE_URLS` mapping, or an explicit `url` (a user-added custom board).
    """
    if not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    core = (payload.get("core") or "").strip()
    if not core:
        return JSONResponse({"ok": False, "error": "no core given"}, status_code=400)
    url = (payload.get("url") or "").strip() or _CORE_URLS.get(core)

    def stream():
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


@app.post("/api/core/updates")
def core_updates(payload: dict = Body(default={})):
    """Check installed board cores for available updates.

    Body: {"urls": ["..."]} — optional extra board-manager URLs (e.g. custom
    boards added via the UI) to register before refreshing the index, so a
    freshly-added board's updates are visible even after a config reset.
    Returns {"ok": true, "updates": [{"core", "installed", "latest"}]}.
    """
    if not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found", "updates": []}, status_code=400)
    urls = [u.strip() for u in (payload.get("urls") or []) if isinstance(u, str) and u.strip()]
    for url in urls:
        try:
            subprocess.run(
                _ARDUINO_BASE + ["config", "add", "board_manager.additional_urls", url],
                capture_output=True, text=True, timeout=15, env=_TOOLCHAIN_ENV,
            )
        except Exception:
            pass
    try:
        subprocess.run(
            _ARDUINO_BASE + ["core", "update-index"],
            capture_output=True, text=True, timeout=60, env=_TOOLCHAIN_ENV,
        )
    except Exception:
        pass
    try:
        proc = subprocess.run(
            _ARDUINO_BASE + ["core", "list", "--format", "json"],
            capture_output=True, text=True, timeout=30, env=_TOOLCHAIN_ENV,
        )
        data = json.loads(proc.stdout or "[]")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e), "updates": []}, status_code=500)
    items = data.get("platforms", data) if isinstance(data, dict) else data
    updates = []
    for entry in items or []:
        if not isinstance(entry, dict):
            continue
        cid, installed, latest = _core_version_fields(entry)
        if cid and installed and latest and installed != latest:
            updates.append({"core": cid, "installed": installed, "latest": latest})
    return {"ok": True, "updates": updates}


@app.post("/api/core/upgrade")
def core_upgrade(payload: dict = Body(default={})):
    """Upgrade installed board cores to their latest version, streaming progress.

    Body: {"cores": ["esp32:esp32", ...], "urls": [...]}. `cores` empty/omitted
    upgrades every outdated core (plain `core upgrade`). `urls` are registered
    first, same as /api/core/updates.
    """
    if not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    cores = [c.strip() for c in (payload.get("cores") or []) if isinstance(c, str) and c.strip()]
    urls = [u.strip() for u in (payload.get("urls") or []) if isinstance(u, str) and u.strip()]

    def stream():
        for url in urls:
            yield from _run_phase(
                "register board URL",
                _ARDUINO_BASE + ["config", "add", "board_manager.additional_urls", url],
            )
        yield from _run_phase("update index", _ARDUINO_BASE + ["core", "update-index"])
        if cores:
            for core in cores:
                yield from _run_phase(f"upgrade {core}", _ARDUINO_BASE + ["core", "upgrade", core])
        else:
            yield from _run_phase("upgrade all", _ARDUINO_BASE + ["core", "upgrade"])
        yield "\nUpdate complete.\n"

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
    # A serial monitor on the same port blocks esptool with a bare
    # PermissionError. The frontend aborts it before every upload, but that
    # abort alone does not guarantee release — Starlette only notices a dropped
    # client when a body write fails, and a quiet board never triggers one — so
    # reclaim the handle explicitly instead of racing disconnect detection.
    if port:
        _release_monitor(port)

    flash_mb = _flash_mb_from(payload)
    usb_cdc = _usb_cdc_from(payload)

    if engine == "fbuild":
        def stream():
            rc, phase = yield from _compile_upload_fbuild("Sketch", ino, fqbn, port, flash_mb, usb_cdc)
            yield from _upload_result_lines(rc, phase, port)
        return StreamingResponse(stream(), media_type="text/plain")

    def stream():
        with _sketch_workspace(SKETCH, ino) as sketch_dir:
            rc, phase = yield from _compile_upload("Sketch", sketch_dir, fqbn, port)
            yield from _upload_result_lines(rc, phase, port)

    return StreamingResponse(stream(), media_type="text/plain")


@app.post("/api/build/cancel")
def cancel_build():
    """Stop the build in progress, if there is one.

    Idempotent and safe to call when nothing is running — the UI offers it
    whenever an upload is busy, and a build that finished a moment earlier is
    not an error worth reporting."""
    return JSONResponse({"ok": True, "cancelled": _cancel_active_build()})


@app.post("/api/compile-check")
def compile_check(payload: dict = Body(...)):
    """Compile-only capacity check for the live controller-capacity meter: runs
    the same compile a real Upload would (no port, so nothing is flashed) and
    returns one JSON result with the toolchain's real flash/RAM size report,
    instead of a streamed log.

    Body: {"ino": "<sketch source>", "fqbn": "esp32:esp32:esp32s3[:PSRAM=opi]"}.
    """
    engine = _active_engine()
    if engine == "fbuild" and not _FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)

    ino = (payload.get("ino") or "").strip()
    fqbn = (payload.get("fqbn") or _DEFAULT_FQBN).strip()
    if not ino:
        return JSONResponse({"ok": False, "error": "no sketch to compile"}, status_code=400)

    if engine == "fbuild":
        flash_mb = _flash_mb_from(payload)
        usb_cdc = _usb_cdc_from(payload)
        lines, (rc, phase) = _drain_compile(
            _compile_upload_fbuild("Capacity check", ino, fqbn, "", flash_mb, usb_cdc))
        sizes = _fbuild_size_bytes_report(lines)
        # A no-op incremental build (nothing changed since the last compile)
        # skips fbuild's own "Flash:"/"RAM:" line entirely — fall back to its
        # persisted size-cache file rather than reporting an empty result for
        # a build that actually succeeded.
        # A genuine overflow is usually a hard linker failure with no size
        # summary at all (see `_fbuild_overflow_estimate`) — derive the actual
        # over-100% percentage from the linker's own error instead of leaving
        # the frontend with nothing but "won't fit".
        if rc != 0 and sizes.get("flash") is None and sizes.get("ram") is None:
            estimate = _fbuild_overflow_estimate(lines)
            if estimate.get("flash") or estimate.get("ram"):
                sizes = estimate
    else:
        with _sketch_workspace(SKETCH, ino) as sketch_dir:
            lines, (rc, phase) = _drain_compile(_compile_upload("Capacity check", sketch_dir, fqbn, ""))
            sizes = _size_bytes_report(lines)

    ok = rc == 0
    # Nothing was compiled: the request waited out `_FBUILD_LOCK_TIMEOUT_S`
    # behind another build (commonly the user's own Upload) and gave up. The
    # upload path already refuses to blame the sketch for this — the meter used
    # to, reporting "Compile failed — see helper log" for a design that had not
    # been built at all, next to an Upload that then succeeded. It is a
    # not-measured state, so the frontend retries rather than showing a verdict.
    busy = not ok and phase == "busy"
    # Either kind of evidence: the linker refusing to produce an image, or a
    # build that succeeded while measuring over its own board limits (see
    # `_over_capacity`) -- the second prints no linker marker at all.
    measured_over = any(
        (sizes.get(kind) or {}).get("percent", 0) > 100 for kind in ("flash", "ram")
    )
    overflow = not ok and not busy and (_looks_like_overflow(lines) or measured_over)
    if ok:
        error = None
    elif busy:
        error = "Another build is running — not measured"
    elif overflow:
        error = "Design is too large for this board"
    else:
        error = "Compile failed — see helper log"
    return JSONResponse({
        "ok": ok,
        "overflow": overflow,
        "busy": busy,
        "engine": engine,
        "target": fqbn,
        "flash": sizes.get("flash"),
        "ram": sizes.get("ram"),
        "error": error,
        # Tail of the log only on failure, so the frontend can surface *why*
        # without the endpoint always shipping the full compile transcript.
        "log": None if ok else "".join(lines)[-4000:],
    })


@app.post("/api/upload-show")
async def upload_show(
    meta: str = Form(...),
    player: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    provisioner: str = Form(default=""),
):
    """Music-sync upload: compile + flash the player, then stream the songs and
    shows onto the SD card through it. Streams logs as text.

    `meta` is JSON {"fqbn", "port", "paths": [...], "flashMb",
    "usbCdcOnBoot"} where `paths[i]` is the SD destination for `files[i]`
    (e.g. "/music/song.mp3", "/shows/song.show") and the optional hardware
    fields carry the same Board-node target facts as an ordinary upload.

    The player carries the file-receive protocol itself, so this is one build
    and one flash. It used to be three: a pre-flight compile, a whole separate
    provisioner sketch flashed purely to write the card, then the player over
    the top. `provisioner` is accepted and ignored so an older frontend keeps
    working; nothing is flashed from it.
    """
    engine = _active_engine()
    if engine == "fbuild" and not _FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not _ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    info = json.loads(meta)
    fqbn = (info.get("fqbn") or _DEFAULT_FQBN).strip()
    port = (info.get("port") or "").strip()
    flash_mb = _flash_mb_from(info)
    usb_cdc = _usb_cdc_from(info)
    if port and _stream_active() and _stream_port == port:
        return JSONResponse({"ok": False, "error": "port is in use by a live stream — stop it first"}, status_code=409)
    # A serial monitor on the same port blocks esptool with a bare
    # PermissionError. The frontend aborts it before every upload, but that
    # abort alone does not guarantee release — Starlette only notices a dropped
    # client when a body write fails, and a quiet board never triggers one — so
    # reclaim the handle explicitly instead of racing disconnect detection.
    if port:
        _release_monitor(port)
    paths = info.get("paths") or []
    # Read every upload into memory now (sync generator can't await later).
    payloads = []
    for i, uf in enumerate(files):
        data = await uf.read()
        payloads.append((paths[i] if i < len(paths) else f"/{uf.filename}", data))

    def _build_flash(label, ino, target_port=None):
        """Compile+flash one sketch through the active engine. `target_port` of
        "" compiles without flashing.

        The player gets its own sketch workspace (named from the label), so its
        build cache and an ordinary sketch's never displace each other — they
        are different programs that happen to be built by the same helper."""
        use_port = port if target_port is None else target_port
        if engine == "fbuild":
            if label.startswith("Player"):
                yield from _ensure_fbuild_audio_lib()
            return (yield from _compile_upload_fbuild(label, ino, fqbn, use_port, flash_mb, usb_cdc))
        with _sketch_workspace(label.split()[0].lower(), ino) as sketch_dir:
            return (yield from _compile_upload(label, sketch_dir, fqbn, use_port))

    def stream():
        if not port:
            yield "[error] a serial port is required to write the SD card\n"
            return
        # Flash the player first, then push the files through it.
        #
        # The player is by far the likeliest build to fail — every collected
        # pattern contributes static render buffers, and a classic ESP32
        # runs out of DRAM well before it runs out of flash. Building it
        # first means a design that could never fit costs one compile to
        # discover, with the board and the card both untouched. The old
        # order learned the same thing only after flashing a provisioner
        # over the user's firmware and pushing a multi-megabyte song across
        # the wire: twelve minutes to find out (observed 2026-08-16).
        #
        # It also means a failed transfer is now cheap to retry — the board
        # is already running the receiver, so nothing needs rebuilding.
        rc, phase = yield from _build_flash("Player", player)
        if rc != 0:
            yield (f"\n*** Player build failed (exit {rc}) — nothing was flashed "
                   "and the card was not touched ***\n"
                   "  Remove patterns from the collection or reduce the matrix size,\n"
                   "  then try again.\n"
                   if phase == "compile" else
                   f"\n*** Player flash failed (exit {rc}) — if it couldn't connect, put "
                   "the board in download mode (hold BOOT, tap RST) and retry ***\n")
            return
        if not payloads:
            # The card-reader path already wrote the files; this call is
            # only here to flash the player.
            yield "\nAll done — the player is flashed.\n"
            return
        # The transfer owns the port for minutes on a full song, so keep
        # `board list` off it for the whole time — not just during esptool.
        with _flashing():
            ok = yield from _serial_send(port, payloads)
        if not ok:
            yield ("\n*** SD transfer failed — the player is flashed, so retrying "
                   "sends the files again without another build ***\n")
            return
        yield "\nAll done — songs/shows are on the card and the player is flashed.\n"

    return StreamingResponse(stream(), media_type="text/plain")



# ── SD card in a reader ───────────────────────────────────────────────────────
# Serial is the universal path, but it is slow: a 7 MB song is minutes even at
# 921600. When the user has a card reader, writing the files straight to the
# mounted volume is seconds — so the studio offers it as a checkbox and drives
# it through these two endpoints.
#
# Only removable volumes are ever listed or written to. That is the whole guard
# here: the browser names a destination directory, and without the restriction
# this endpoint would be a "write anywhere on the host" primitive.

_SD_SUBDIRS = ("music", "shows")


def _removable_drives() -> list[dict]:
    """Mounted removable volumes, as {path, label, freeBytes, totalBytes}.

    Deliberately conservative: a volume this cannot positively identify as
    removable is left out. Missing a card reader is an inconvenience the user
    can work around with the serial path; offering the system disk as a
    destination is not.
    """
    out: list[dict] = []

    def _entry(path: str, label: str) -> dict | None:
        try:
            usage = shutil.disk_usage(path)
        except OSError:
            return None  # a reader with no card in it
        return {"path": path, "label": label, "freeBytes": usage.free, "totalBytes": usage.total}

    if platform.system() == "Windows":
        import ctypes

        DRIVE_REMOVABLE = 2
        kernel32 = ctypes.windll.kernel32
        mask = kernel32.GetLogicalDrives()
        for i in range(26):
            if not mask & (1 << i):
                continue
            root = f"{chr(ord('A') + i)}:{os.sep}"
            if kernel32.GetDriveTypeW(ctypes.c_wchar_p(root)) != DRIVE_REMOVABLE:
                continue
            name = ctypes.create_unicode_buffer(261)
            try:
                kernel32.GetVolumeInformationW(
                    ctypes.c_wchar_p(root), name, 261, None, None, None, None, 0
                )
            except OSError:
                pass
            entry = _entry(root, name.value or "Removable disk")
            if entry:
                out.append(entry)
        return out

    if platform.system() == "Darwin":
        # /Volumes holds every mount; the boot volume is the one to exclude.
        boot = os.path.realpath("/")
        for name in sorted(os.listdir("/Volumes")) if os.path.isdir("/Volumes") else []:
            path = os.path.join("/Volumes", name)
            if not os.path.ismount(path) or os.path.realpath(path) == boot:
                continue
            entry = _entry(path, name)
            if entry:
                out.append(entry)
        return out

    # Linux: the desktop automounters put user-visible media under these two.
    # A card mounted by hand elsewhere is not discoverable this way, which is
    # the conservative half of the trade above.
    for base in ("/media", "/run/media"):
        if not os.path.isdir(base):
            continue
        roots = [os.path.join(base, d) for d in sorted(os.listdir(base))]
        # /media/<user>/<label> on most distros, /media/<label> on some.
        for root in roots:
            candidates = (
                [os.path.join(root, d) for d in sorted(os.listdir(root))]
                if os.path.isdir(root) and not os.path.ismount(root)
                else [root]
            )
            for path in candidates:
                if not os.path.ismount(path):
                    continue
                entry = _entry(path, os.path.basename(path))
                if entry:
                    out.append(entry)
    return out


@app.get("/api/removable-drives")
def removable_drives():
    """Mounted removable volumes the studio may write an SD card layout to."""
    try:
        return {"ok": True, "drives": _removable_drives()}
    except Exception as e:  # a platform quirk must not break the upload tab
        return {"ok": False, "error": str(e), "drives": []}


def _sd_destination(drive: str, path: str) -> Path:
    """Resolve one SD path ("/music/song.mp3") under `drive`, or raise.

    The subdirectory is checked against a fixed list and the filename is
    reduced to its basename, so nothing the browser sends can climb out of the
    chosen volume.
    """
    parts = [seg for seg in path.replace("\\", "/").split("/") if seg not in ("", ".", "..")]
    if len(parts) != 2 or parts[0].lower() not in _SD_SUBDIRS:
        raise ValueError(f"refusing to write {path!r} — expected /music/… or /shows/…")
    root = Path(drive).resolve()
    dest = (root / parts[0].lower() / os.path.basename(parts[1])).resolve()
    if root not in dest.parents:
        raise ValueError(f"refusing to write outside {drive}")
    return dest


@app.post("/api/sd-copy")
async def sd_copy(
    meta: str = Form(...),
    files: list[UploadFile] = File(default=[]),
):
    """Write the songs and shows straight onto a card in a reader.

    `meta` is JSON {"drive", "paths": [...]} where `paths[i]` is the SD
    destination for `files[i]`. A file already present at the same size is
    skipped — that is what makes "the music is already on the card, just update
    the shows" the fast common case rather than a re-copy of every song.

    Streams progress as text, like the upload endpoints.
    """
    info = json.loads(meta)
    drive = (info.get("drive") or "").strip()
    paths = info.get("paths") or []

    allowed = {d["path"] for d in _removable_drives()}
    if drive not in allowed:
        # Either the card was pulled between listing and writing, or something
        # named a volume that was never offered. Both are refusals, not writes.
        return JSONResponse(
            {"ok": False, "error": f"{drive or '(none)'} is not a mounted removable drive"},
            status_code=400,
        )

    payloads = []
    for i, uf in enumerate(files):
        payloads.append((paths[i] if i < len(paths) else f"/{uf.filename}", await uf.read()))

    def stream():
        yield f"=== Writing to {drive} ({len(payloads)} file(s)) ===\n"
        written = skipped = 0
        try:
            for sd_path, data in payloads:
                dest = _sd_destination(drive, sd_path)
                if dest.exists() and dest.stat().st_size == len(data):
                    # Size alone, not a hash: a song is megabytes and the point
                    # of this path is speed. A same-name same-size file that is
                    # somehow different content is a case the serial path shares.
                    yield f"  = {sd_path} (already on the card)\n"
                    skipped += 1
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                # Write beside the target and rename, so a card pulled mid-write
                # leaves the previous file intact instead of a truncated one the
                # player would try to open.
                tmp = dest.with_suffix(dest.suffix + ".part")
                with open(tmp, "wb") as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, dest)
                yield f"  -> {sd_path} ({len(data)} bytes)\n"
                written += 1
            yield f"\nCard written — {written} file(s) copied, {skipped} already present.\n"
        except Exception as e:
            yield f"\n[error] {e}\n"

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
        # Give the dialog a real topmost owner. Without one, Windows can place
        # this helper-process dialog behind the browser/desktop shell; the API
        # request then waits forever while the menu action appears to do
        # nothing.
        "$owner = New-Object System.Windows.Forms.Form; "
        "$owner.TopMost = $true; "
        "$owner.ShowInTaskbar = $false; "
        "$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None; "
        "$owner.Width = 1; $owner.Height = 1; "
        "$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen; "
        "$dialog = New-Object System.Windows.Forms.SaveFileDialog; "
        "$dialog.InitialDirectory = $env:FLS_DIALOG_INITIAL_DIR; "
        "$dialog.FileName = $env:FLS_DIALOG_FILE_NAME; "
        "$dialog.Filter = 'Design Studio for FastLED Project (*.fastled-project.json)|*.fastled-project.json|All Files (*.*)|*.*'; "
        "$dialog.AddExtension = $true; "
        "$dialog.DefaultExt = 'fastled-project.json'; "
        "$owner.Show(); $owner.Activate(); "
        "try { if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) } } "
        "finally { $owner.Close(); $owner.Dispose() }"
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
        "$dialog.Filter = 'Design Studio for FastLED Project (*.json)|*.json|All Files (*.*)|*.*'; "
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
                ("Design Studio for FastLED Project", "*.fastled-project.json"),
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
                ("Design Studio for FastLED Project", "*.json"),
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
