"""Build engines: finding arduino-cli and fbuild, preparing fbuild's project
and vendored libraries, and running a build tool as a cancellable phase.

Also owns the engine choice (`/api/engine`) and arduino-cli setup endpoints
(locate, install, cores).
"""
from __future__ import annotations

import codecs
import functools
import io
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import sysconfig
import tarfile
import threading
import time
import urllib.request
import zipfile
from pathlib import Path

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse, StreamingResponse

router = APIRouter()

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
# root. Source checkouts keep the helper's machine state beside it when the env
# var is absent.
_DATA_DIR = Path(os.environ.get("FLS_DATA_DIR") or _HELPER_DIR)
_CONFIG_PATH = _DATA_DIR / ".helper-config.json"
_BIN_DIR = _DATA_DIR / "bin"  # where a self-installed arduino-cli lands

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
# Arduino uses its own immutable cache, so fbuild's optional-library staging
# cannot hide Audio.h underneath an Arduino compile. Never replace user libs.
_ARDUINO_AUDIO_LIB_DIR = _DATA_DIR / ".arduino-libraries" / "ESP32-audioI2S"
_PLAYER_AUDIO_VERSION = "3.0.12"
_arduino_audio_lock = threading.Lock()
_FBUILD_ESP_DMX_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "esp_dmx"
# HUB75 scan-panel output (docs/design/hub75-output.md) — FastLED
# has no native HUB75 driver, so a HUB75 MatrixOutput route needs this DMA
# library instead. Vendored the same lazy way as ESP32-audioI2S/esp_dmx above.
_FBUILD_HUB75_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "ESP32-HUB75-MatrixPanel-DMA"
# SAMD51 INMP441 capture uses Adafruit's receive-capable ZeroI2S driver and
# its ZeroDMA dependency. Both are fetched only when a generated sketch names
# ZeroI2S, just like the other optional hardware libraries below.
_FBUILD_ZERO_I2S_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "Adafruit_ZeroI2S"
_FBUILD_ZERO_DMA_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "Adafruit_ZeroDMA"
_FBUILD_LVGL_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "lvgl"
# IR receive (D-05a). Pinned, and fetched only when a sketch includes it, so a
# graph with no receiver does not compile or link the decoder.
_FBUILD_IRREMOTE_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "IRremote"
_IRREMOTE_VERSION = "4.7.1"
_IRREMOTE_INCLUDE = "#include <IRremote.hpp>"
# Pololu VL53L0X driver for the laser distance sensor. Its start-up and calibration
# sequence is the library's, so the exact release the codegen was written against is pinned.
_FBUILD_VL53L0X_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "VL53L0X"
_VL53L0X_VERSION = "1.3.1"
_VL53L0X_INCLUDE = "#include <VL53L0X.h>"
# Pololu VL53L1X driver, pinned for the same reason as the VL53L0X.
_FBUILD_VL53L1X_LIB_DIR = _FBUILD_PROJECT_DIR / "lib" / "VL53L1X"
_VL53L1X_VERSION = "1.3.1"
_VL53L1X_INCLUDE = "#include <VL53L1X.h>"
_FBUILD_LV_CONF_PATH = _FBUILD_LVGL_LIB_DIR.parent / "lv_conf.h"

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
/* ESP32: lv_init() takes the pool from internal heap, not a static array.
 * Classic ESP32 caps all static data at about 122 KiB, and a 64 KiB array
 * there left an SD player with a custom screen unable to link. The pool stays
 * in internal RAM, so free heap after lv_init() is unchanged. Generated
 * sketches read FLS_LVGL_POOL_FROM_HEAP and check for a free block first. */
#if defined(ESP32)
#define FLS_LVGL_POOL_FROM_HEAP 1
#define LV_MEM_POOL_INCLUDE <esp_heap_caps.h>
#define LV_MEM_POOL_ALLOC(size) heap_caps_malloc((size), MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT)
#endif
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


def _remove_build_cache_tree(path: Path) -> None:
    """Remove an exact vendored cache directory, including read-only git packs."""
    def make_writable_and_retry(func, name, _error):
        os.chmod(name, stat.S_IWRITE)
        func(name)

    shutil.rmtree(path, onerror=make_writable_and_retry)


# arduino-cli FQBN -> PlatformIO platform/board, mirroring `BOARDS` in
# `src/state/upload/uploadStore.ts`. `psram_memory_type` maps this repo's PSRAM option
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
            16: {
                "flash_size": "16MB", "partitions": "huge_app.csv",
                "arduino_options": {
                    "FlashSize": "16M", "PartitionScheme": "app3M_fat9M_16MB",
                },
            },
        },
        "psram_memory_type": {
            # Hardware trace (2026-08-24): QIO reset-loops in the ROM loader;
            # DIO is the flash mode, independently of the octal PSRAM bus.
            "opi":  {"memory_type": "dio_opi",  "flash_size": "16MB", "partitions": "default_16MB.csv",
                     "flash_mode": "dio", "f_flash": "80000000L",
                     "arduino_options": {
                         "FlashSize": "16M", "PartitionScheme": "app3M_fat9M_16MB",
                     }},
            "qspi": {"memory_type": "qio_qspi", "flash_size": "8MB",  "partitions": "default_8MB.csv",
                     "flash_mode": "qio", "f_flash": "80000000L",
                     "arduino_options": {
                         "FlashSize": "8M", "PartitionScheme": "default_8MB",
                     }},
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
    # Wireless-Tag WT32-ETH01: classic ESP32 with a LAN8720A on its EMAC.
    # The core's board definition and PlatformIO's both carry the 4 MB flash.
    "esp32:esp32:wt32-eth01": {"platform": "espressif32", "board": "wt32-eth01"},
    "arduino:avr:uno": {"platform": "atmelavr", "board": "uno"},
    "arduino:avr:nano": {"platform": "atmelavr", "board": "nanoatmega328new"},
    "arduino:avr:leonardo": {"platform": "atmelavr", "board": "leonardo"},
    "arduino:avr:mega": {"platform": "atmelavr", "board": "megaatmega2560"},
    # Arduino calls the board `nona4809` in its FQBN; PlatformIO/fbuild calls
    # the same Nano Every target `nano_every`.
    "arduino:megaavr:nona4809": {"platform": "atmelmegaavr", "board": "nano_every"},
    "esp32:esp32:esp32s2": {"usb_cdc": True, "platform": "espressif32", "board": "esp32-s2-saola-1"},
    "esp32:esp32:esp32c3": {"usb_cdc": True, "platform": "espressif32", "board": "esp32-c3-devkitm-1"},
    "esp32:esp32:esp32c6": {"platform": "espressif32", "board": "esp32-c6-devkitc-1"},
    # Arduino Nano ESP32. Its core numbers pins D0-D13 and A0-A7 by default;
    # every generated sketch uses GPIO numbers, so select the core's GPIO
    # numbering (and its PlatformIO equivalent). Its partition menu has no
    # huge_app, so keep the board's own 16MB table.
    "esp32:esp32:nano_nora": {
        "platform": "espressif32", "board": "arduino_nano_esp32",
        "build_flags": ["-DBOARD_USES_HW_GPIO_NUMBERS"],
        "arduino_options": {"PinNumbers": "byGPIONumber", "PartitionScheme": "default"},
    },
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
    # Confirmed against fbuild's board-support reference for a bare SAMD21
    # Arduino Zero, but not yet build-tested here — see the "(experimental)"
    # note on this board in `src/state/upload/uploadStore.ts`.
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
    # STM32duino names no board by these ids: arduino-cli picks a series board
    # (GenF1, GenF4, Nucleo_144) and the chip by its `pnum` menu value.
    # `_arduino_fqbn` swaps them in; the app and fbuild keep the short ids.
    "STMicroelectronics:stm32:bluepill_f103c8": {
        "platform": "ststm32", "board": "bluepill_f103c8",
        "arduino_board": "STMicroelectronics:stm32:GenF1", "arduino_options": {"pnum": "BLUEPILL_F103C8"},
    },
    "STMicroelectronics:stm32:blackpill_f411ce": {
        "platform": "ststm32", "board": "blackpill_f411ce",
        "arduino_board": "STMicroelectronics:stm32:GenF4", "arduino_options": {"pnum": "BLACKPILL_F411CE"},
    },
    "STMicroelectronics:stm32:nucleo_f429zi": {
        "platform": "ststm32", "board": "nucleo_f429zi",
        "arduino_board": "STMicroelectronics:stm32:Nucleo_144", "arduino_options": {"pnum": "NUCLEO_F429ZI"},
    },
    "STMicroelectronics:stm32:nucleo_f439zi": {
        "platform": "ststm32", "board": "nucleo_f439zi",
        "arduino_board": "STMicroelectronics:stm32:Nucleo_144", "arduino_options": {"pnum": "NUCLEO_F439ZI"},
    },
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
    options = dict(option.split("=", 1) for option in parts[3].split(",") if "=" in option) if len(parts) > 3 else {}
    psram_id = _FQBN_PSRAM_VALUES.get(options.get("PSRAM"))
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


def _arduino_fqbn(
    fqbn: str, flash_mb: int | None = None, usb_cdc: bool = False,
) -> str:
    """Resolve the physical ESP32 module into Arduino menu options.

    The selected Board node supplies facts a generic FQBN cannot express: flash
    size, PSRAM package, and which USB socket ``Serial`` uses. fbuild resolves
    those through a generated environment; arduino-cli needs the equivalent
    ``FlashSize``, ``PartitionScheme`` and ``CDCOnBoot`` menu values appended to
    the FQBN. Only combinations declared in ``_PIO_BOARDS`` are applied, so an
    unknown module is never guessed to have more flash than its board manifest.

    A board whose arduino-cli id differs from the app's (``arduino_board``)
    is renamed here, with the menu values that select it (``arduino_options``),
    such as the ``pnum`` STM32duino needs to know the chip.
    """
    base, psram_id = _parse_fqbn(fqbn)
    meta = _PIO_BOARDS.get(base)
    if meta is None:
        return fqbn

    parts = fqbn.split(":", 3)
    options = parts[3].split(",") if len(parts) == 4 and parts[3] else []

    # The Player is intentionally a USB-flashed, non-OTA image. Match fbuild's
    # huge_app.csv default so audio-heavy ESP32 sketches are not constrained by
    # Arduino's 1.31 MB dual-OTA slot. A physical flash/PSRAM variant below may
    # replace this with the board core's size-specific menu choice.
    resolved: dict[str, str] = dict(meta.get("arduino_options", {}))
    psram_meta = meta.get("psram_memory_type", {}).get(psram_id)
    if psram_meta:
        resolved.update(psram_meta.get("arduino_options", {}))
    elif flash_mb and flash_mb in meta.get("flash_variants", {}):
        resolved.update(
            meta["flash_variants"][flash_mb].get("arduino_options", {}))
    if meta.get("platform") == "espressif32" and "PartitionScheme" not in resolved:
        resolved["PartitionScheme"] = "huge_app"
    if usb_cdc and meta.get("usb_cdc"):
        resolved["CDCOnBoot"] = "cdc"

    option_indexes = {
        option.partition("=")[0]: index for index, option in enumerate(options)
    }
    for key, value in resolved.items():
        encoded = f"{key}={value}"
        if key in option_indexes:
            options[option_indexes[key]] = encoded
        else:
            option_indexes[key] = len(options)
            options.append(encoded)
    base = meta.get("arduino_board", base)
    return f"{base}:{','.join(options)}" if options else base


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
        # Upstream spells EIC_IRQn, which SAMD51 builds already alias to
        # EIC_0_IRQn through their build_flags. Rewriting the source instead
        # named a SAMD51-only IRQ in the tree every SAMD21 shares, so undo it
        # wherever an earlier helper applied it.
        text = text.replace("NVIC_DisableIRQ(EIC_0_IRQn)", "NVIC_DisableIRQ(EIC_IRQn)")
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


def _clone_player_audio_lib(library_dir):
    library_dir.parent.mkdir(parents=True, exist_ok=True)
    if library_dir.exists():
        _remove_build_cache_tree(library_dir)
    return (yield from _run_phase(
        "vendor ESP32-audioI2S",
        ["git", "clone", "--progress", "--branch", _PLAYER_AUDIO_VERSION, "--depth", "1",
         "https://github.com/schreibfaul1/ESP32-audioI2S.git", str(library_dir)],
    ))


def _ensure_arduino_audio_lib():
    """Use the same pinned player API even when the user's Arduino lib is old."""
    with _arduino_audio_lock:
        marker = _ARDUINO_AUDIO_LIB_DIR / ".fls-version"
        header = _ARDUINO_AUDIO_LIB_DIR / "src" / "Audio.h"
        if header.is_file() and marker.is_file() and marker.read_text(encoding="utf-8") == _PLAYER_AUDIO_VERSION:
            return 0
        yield f"\n=== vendoring ESP32-audioI2S {_PLAYER_AUDIO_VERSION} for Arduino (first Player build only) ===\n"
        rc = yield from _clone_player_audio_lib(_ARDUINO_AUDIO_LIB_DIR)
        if rc != 0 or not header.is_file():
            yield "[error] failed to prepare the pinned Arduino player audio library\n"
            return rc or -1
        marker.write_text(_PLAYER_AUDIO_VERSION, encoding="utf-8")
        return 0


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
    # Replaces a `-nopsram` fork checkout if one is cached. That fork is built
    # for a classic ESP32 with no PSRAM; this player targets an ESP32-S3 with
    # it, which is what upstream v3 wants.
    #
    # Pinned to 3.0.12, NOT the default branch: the library is rewritten often
    # enough that tracking its head carries no stability guarantee.
    rc = yield from _clone_player_audio_lib(_FBUILD_AUDIO_LIB_DIR)
    if rc != 0:
        yield "[error] failed to vendor ESP32-audioI2S — the Player build below will fail on Audio.h\n"
    _fbuild_audio_lib_ready = rc == 0
    return rc


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


_fbuild_irremote_lib_ready = False


def _irremote_checkout_matches_pin(path: Path) -> bool:
    """True only for a complete checkout of the pinned Arduino-IRremote release."""
    properties = path / "library.properties"
    header = path / "src" / "IRremote.hpp"
    try:
        versions = {
            line.partition("=")[2].strip()
            for line in properties.read_text(encoding="utf-8").splitlines()
            if line.startswith("version=")
        }
    except (OSError, UnicodeDecodeError):
        return False
    return header.is_file() and versions == {_IRREMOTE_VERSION}


def _ensure_fbuild_irremote_lib():
    """Vendor the pinned Arduino-IRremote release the first time a sketch includes it.

    A checkout of a different version is discarded. The pin is what the
    generated decoder macros were written against, so a cached newer tag is
    not a compatible substitute.
    """
    global _fbuild_irremote_lib_ready
    if _fbuild_irremote_lib_ready and _irremote_checkout_matches_pin(_FBUILD_IRREMOTE_LIB_DIR):
        return
    if _irremote_checkout_matches_pin(_FBUILD_IRREMOTE_LIB_DIR):
        _fbuild_irremote_lib_ready = True
        return
    yield f"\n=== vendoring Arduino-IRremote {_IRREMOTE_VERSION} (first IR build only) ===\n"
    _FBUILD_IRREMOTE_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    if _FBUILD_IRREMOTE_LIB_DIR.exists():
        _remove_build_cache_tree(_FBUILD_IRREMOTE_LIB_DIR)
    rc = yield from _run_phase(
        "vendor Arduino-IRremote",
        ["git", "clone", "--progress", "--branch", f"v{_IRREMOTE_VERSION}", "--depth", "1",
         "https://github.com/Arduino-IRremote/Arduino-IRremote.git", str(_FBUILD_IRREMOTE_LIB_DIR)],
    )
    if rc != 0 or not _irremote_checkout_matches_pin(_FBUILD_IRREMOTE_LIB_DIR):
        yield (
            f"[error] failed to vendor Arduino-IRremote {_IRREMOTE_VERSION}. "
            f"IR sketches need that exact release: arduino-cli lib install IRremote@{_IRREMOTE_VERSION}\n"
        )
        return
    _fbuild_irremote_lib_ready = True


def _arduino_irremote_matches_pin() -> bool:
    """Check the CLI's configured sketchbook without starting library management."""
    try:
        proc = subprocess.run(
            _ARDUINO_BASE + ["config", "dump", "--format", "json"],
            capture_output=True, text=True, timeout=10,
        )
        if proc.returncode != 0:
            return False
        payload = json.loads(proc.stdout)
        if not isinstance(payload, dict):
            return False
        config = payload.get("config", payload)
        if not isinstance(config, dict):
            return False
        directories = config.get("directories")
        if not isinstance(directories, dict):
            return False
        user_dir = directories.get("user")
        if not isinstance(user_dir, str) or not user_dir.strip():
            return False
        return _irremote_checkout_matches_pin(Path(user_dir) / "libraries" / "IRremote")
    except (OSError, subprocess.SubprocessError, ValueError):
        # Unavailable config must not prevent the normal install/repair path.
        return False


def _ensure_arduino_irremote_lib():
    """Install the pinned release only when its configured checkout is missing."""
    if _arduino_irremote_matches_pin():
        return 0
    rc = yield from _run_phase(
        f"install Arduino-IRremote {_IRREMOTE_VERSION}",
        _ARDUINO_BASE + ["lib", "install", f"IRremote@{_IRREMOTE_VERSION}", "--no-deps"],
    )
    if rc != 0:
        yield (
            f"[error] failed to install Arduino-IRremote {_IRREMOTE_VERSION}. Check the network connection or run "
            f"'arduino-cli lib install IRremote@{_IRREMOTE_VERSION}' and try again.\n"
        )
        return rc
    return 0


def _vl53l0x_checkout_matches_pin(path: Path) -> bool:
    """True only for a complete checkout of the pinned Pololu VL53L0X release."""
    try:
        versions = {
            line.partition("=")[2].strip()
            for line in (path / "library.properties").read_text(encoding="utf-8").splitlines()
            if line.startswith("version=")
        }
    except (OSError, UnicodeDecodeError):
        return False
    return (path / "VL53L0X.h").is_file() and versions == {_VL53L0X_VERSION}


def _ensure_fbuild_vl53l0x_lib():
    """Vendor the pinned Pololu VL53L0X release the first time a sketch includes it."""
    if _vl53l0x_checkout_matches_pin(_FBUILD_VL53L0X_LIB_DIR):
        return
    yield f"\n=== vendoring Pololu VL53L0X {_VL53L0X_VERSION} (first laser-distance build only) ===\n"
    _FBUILD_VL53L0X_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    if _FBUILD_VL53L0X_LIB_DIR.exists():
        _remove_build_cache_tree(_FBUILD_VL53L0X_LIB_DIR)
    rc = yield from _run_phase(
        "vendor Pololu VL53L0X",
        ["git", "clone", "--progress", "--branch", _VL53L0X_VERSION, "--depth", "1",
         "https://github.com/pololu/vl53l0x-arduino.git", str(_FBUILD_VL53L0X_LIB_DIR)],
    )
    if rc != 0 or not _vl53l0x_checkout_matches_pin(_FBUILD_VL53L0X_LIB_DIR):
        yield (
            f"[error] failed to vendor Pololu VL53L0X {_VL53L0X_VERSION}. "
            "Laser-distance sketches need that exact release.\n"
        )


def _ensure_arduino_vl53l0x_lib():
    """Ask arduino-cli for the same Pololu VL53L0X release fbuild vendors."""
    rc = yield from _run_phase(
        f"install Pololu VL53L0X {_VL53L0X_VERSION}",
        _ARDUINO_BASE + ["lib", "install", f"VL53L0X@{_VL53L0X_VERSION}", "--no-deps"],
    )
    if rc != 0:
        yield (
            f"[error] failed to install Pololu VL53L0X {_VL53L0X_VERSION}. Check the network connection or run "
            f"'arduino-cli lib install VL53L0X@{_VL53L0X_VERSION}' and try again.\n"
        )
        return rc
    return 0


def _vl53l1x_checkout_matches_pin(path: Path) -> bool:
    """True only for a complete checkout of the pinned Pololu VL53L1X release."""
    try:
        versions = {
            line.partition("=")[2].strip()
            for line in (path / "library.properties").read_text(encoding="utf-8").splitlines()
            if line.startswith("version=")
        }
    except (OSError, UnicodeDecodeError):
        return False
    return (path / "VL53L1X.h").is_file() and versions == {_VL53L1X_VERSION}


def _ensure_fbuild_vl53l1x_lib():
    """Vendor the pinned Pololu VL53L1X release the first time a sketch includes it."""
    if _vl53l1x_checkout_matches_pin(_FBUILD_VL53L1X_LIB_DIR):
        return
    yield f"\n=== vendoring Pololu VL53L1X {_VL53L1X_VERSION} (first VL53L1X build only) ===\n"
    _FBUILD_VL53L1X_LIB_DIR.parent.mkdir(parents=True, exist_ok=True)
    if _FBUILD_VL53L1X_LIB_DIR.exists():
        _remove_build_cache_tree(_FBUILD_VL53L1X_LIB_DIR)
    rc = yield from _run_phase(
        "vendor Pololu VL53L1X",
        ["git", "clone", "--progress", "--branch", _VL53L1X_VERSION, "--depth", "1",
         "https://github.com/pololu/vl53l1x-arduino.git", str(_FBUILD_VL53L1X_LIB_DIR)],
    )
    if rc != 0 or not _vl53l1x_checkout_matches_pin(_FBUILD_VL53L1X_LIB_DIR):
        yield (
            f"[error] failed to vendor Pololu VL53L1X {_VL53L1X_VERSION}. "
            "VL53L1X sketches need that exact release.\n"
        )


def _ensure_arduino_vl53l1x_lib():
    """Ask arduino-cli for the same Pololu VL53L1X release fbuild vendors."""
    rc = yield from _run_phase(
        f"install Pololu VL53L1X {_VL53L1X_VERSION}",
        _ARDUINO_BASE + ["lib", "install", f"VL53L1X@{_VL53L1X_VERSION}", "--no-deps"],
    )
    if rc != 0:
        yield (
            f"[error] failed to install Pololu VL53L1X {_VL53L1X_VERSION}. Check the network connection or run "
            f"'arduino-cli lib install VL53L1X@{_VL53L1X_VERSION}' and try again.\n"
        )
        return rc
    return 0


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

# Force UTF-8 across the ESP32 toolchain — its bundled Python (esptool, ...)
# prints build output through the locale codec (cp1252 on Windows) and dies with
# UnicodeEncodeError on the first non-cp1252 character.
_TOOLCHAIN_ENV = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}


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


def _missing_engine(label, engine, hint):
    """Refuse a build whose engine binary is not installed.

    Every HTTP entry point checks this and answers 400, but the two compile
    generators are also called directly — `scripts/compile-fixtures/compile-display-smoke.py`
    runs the display fixture matrix through them — and neither checked. fbuild
    was the worse of the two: `_FBUILD_BIN` is None, so building its argument
    list raised `TypeError: sequence item 0: expected str instance, NoneType
    found` from inside `_run_phase`, a stack trace where a sentence belongs.
    arduino-cli degraded to `_ARDUINO_BASE == []` and reported "failed to
    launch compile", naming the subcommand as though it were the program.

    Yields the same `=== ✗ label: … ===` shape as the other refusals in this
    module and returns the (rc, phase) pair callers expect, so nothing reached
    the board and the caller can say so.
    """
    yield f"\n=== ✗ {label}: {engine} was not found ===\n"
    yield f"  {hint}\n"
    yield "  Nothing was compiled or sent to the board.\n"
    return -1, "compile"


def _run_phase(label, args, sink=None, cwd=None, tool_env=None):
    """Run one build-tool phase (arduino-cli or fbuild), yielding its output
    lines; returns the exit code. If `sink` (a list) is given, each output line
    is also appended to it so the caller can inspect the phase output (e.g. to
    parse the flash/RAM size report)."""
    _begin_build_run()
    # A None here means an engine binary went unresolved upstream. Report it as
    # a launch failure rather than raising out of the generator mid-stream: the
    # caller is streaming this to a log or the Output console, and a TypeError
    # there loses both the run and the reason for it.
    if not args or args[0] is None:
        yield f"[error] {label}: no build tool to run — the engine binary was not found\n"
        return -1
    yield f"\n=== {label} ===\n$ {' '.join(str(arg) for arg in args)}\n"
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


@router.get("/api/engine")
def get_engine():
    return {"ok": True, "engine": _active_engine(), "fbuild": bool(_FBUILD_BIN), "arduinoCli": bool(_ARDUINO_CLI)}


@router.post("/api/engine")
def set_engine(payload: dict = Body(...)):
    """Persist a build-engine preference. Body: {"engine": "fbuild" | "arduino-cli"}."""
    engine = (payload.get("engine") or "").strip()
    if engine not in ("fbuild", "arduino-cli"):
        return JSONResponse({"ok": False, "error": "engine must be 'fbuild' or 'arduino-cli'"}, status_code=400)
    cfg = _load_config()
    cfg["engine"] = engine
    _save_config(cfg)
    return {"ok": True, "engine": _active_engine()}


# ── arduino-cli management ────────────────────────────────────────────────────
@router.post("/api/arduino-cli/locate")
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


@router.post("/api/arduino-cli/install")
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


@router.get("/api/cores")
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


@router.post("/api/core/install")
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


@router.post("/api/core/updates")
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


@router.post("/api/core/upgrade")
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
