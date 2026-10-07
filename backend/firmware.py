"""Compiling, uploading and talking to a board: sketch workspaces, size and
overflow reports, the compile-only capacity check, serial ports and the serial
monitor, and the compile, upload and show-upload endpoints.
"""
from __future__ import annotations

import contextlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

import streaming
import toolchain

router = APIRouter()

# ── Compile / upload / serial helpers ─────────────────────────────────────────
# These three must match the provisioner's constants exactly — see
# `provisionerSketchGenerator.ts` (PROVISION_CHUNK / PROVISION_BAUD). The device
# is generated and flashed by the same release as this file, so they move
# together, but a mismatch stalls a transfer rather than failing it loudly.
CHUNK = 4096            # serial transfer block size — must match PROVISION_CHUNK
PROVISION_BAUD = 921600  # negotiated after the handshake; falls back to 115200


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
_SKETCH_DIR_ROOT = toolchain._DATA_DIR / "sketches"

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
    if "#include <Audio.h>" in ino:
        # Arduino CLI 1.5.1 can reuse the sketch object after --library selects
        # a different Audio.h, linking old method signatures against the new
        # library. Tie source identity to the pinned API without discarding
        # the expensive library cache on every build.
        ino = f"// FLS-PLAYER-AUDIO: {toolchain._PLAYER_AUDIO_VERSION}\n{ino}"
    if toolchain._IRREMOTE_INCLUDE in ino:
        # Same reason: a pin bump must change the sketch bytes arduino-cli
        # hashes, or it will link an IR sketch against the previous release.
        ino = f"// FLS-IRREMOTE: {toolchain._IRREMOTE_VERSION}\n{ino}"
    if toolchain._VL53L0X_INCLUDE in ino:
        # Same reason: a pin bump must change the sketch bytes arduino-cli hashes.
        ino = f"// FLS-VL53L0X: {toolchain._VL53L0X_VERSION}\n{ino}"
    if toolchain._VL53L1X_INCLUDE in ino:
        ino = f"// FLS-VL53L1X: {toolchain._VL53L1X_VERSION}\n{ino}"
    lock = _sketch_dir_lock(name)
    if lock.acquire(blocking=False):
        try:
            sketch_dir = _SKETCH_DIR_ROOT / name
            sketch_dir.mkdir(parents=True, exist_ok=True)
            toolchain._write_if_changed(sketch_dir / f"{name}.ino", ino)
            if toolchain._LVGL_INCLUDE_MARKER in ino:
                toolchain._write_if_changed(sketch_dir / "lv_conf.h", toolchain._lv_conf_for_sketch(ino))
            yield sketch_dir
        finally:
            lock.release()
        return
    work = Path(tempfile.mkdtemp(prefix="fls_"))
    try:
        sketch_dir = work / name
        sketch_dir.mkdir()
        (sketch_dir / f"{name}.ino").write_text(ino, encoding="utf-8")
        if toolchain._LVGL_INCLUDE_MARKER in ino:
            (sketch_dir / "lv_conf.h").write_text(toolchain._lv_conf_for_sketch(ino), encoding="utf-8")
        yield sketch_dir
    finally:
        shutil.rmtree(work, ignore_errors=True)


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


def _overflow_region_kind(region: str) -> str | None:
    """Map common linker region names to the resource the user can change."""
    name = region.lower().lstrip(".")
    if any(marker in name for marker in ("text", "irom", "flash", "rodata")):
        return "flash"
    if any(marker in name for marker in ("dram", "iram", "bss", "data", "noinit")):
        return "ram"
    return None


def _overflow_details(lines) -> list[tuple[str, int, str | None]]:
    """Return each linker region's largest reported overflow."""
    largest_by_region: dict[str, int] = {}
    for region, amount in _LD_OVERFLOW_RE.findall("".join(lines)):
        byte_count = int(amount.replace(",", ""))
        largest_by_region[region] = max(byte_count, largest_by_region.get(region, 0))
    return [
        (region, amount, _overflow_region_kind(region))
        for region, amount in largest_by_region.items()
    ]


def _overflow_message(fqbn: str, lines, measured: dict[str, int] | None = None) -> str:
    """Explain an overflow using region-specific facts and useful remedies."""
    details = _overflow_details(lines)
    kinds = {kind for _, _, kind in details if kind is not None}
    body: list[str] = [f"\n=== ✗ Too big for {fqbn} ===\n"]

    if details:
        for region, amount, kind in details:
            label = f"{kind.upper()} " if kind else ""
            body.append(f"  {label}region `{region}` overflowed by {amount:,} bytes.\n")
    elif measured:
        readings = ", ".join(f"{kind} {percent}%" for kind, percent in measured.items())
        body.append(f"  The build linked, but it does not fit: {readings}.\n")
        kinds.update(measured)
    else:
        body.append("  This design is larger than a linker memory region can hold.\n")

    if "ram" in kinds:
        body.extend((
            "  To reduce RAM, use fewer or smaller screens and displays, or move\n",
            "  LED buffers to PSRAM on a PSRAM-equipped board.\n",
            "  Flash partition schemes do not increase RAM.\n",
        ))
    if "flash" in kinds:
        body.extend((
            "  To reduce flash, try fewer patterns in the collection, a smaller\n",
            "  matrix, or fewer heavy nodes (Image / audio / field) — or choose a\n",
            "  board or ESP32 partition scheme with more flash.\n",
        ))
    if not kinds:
        body.extend((
            "  See the linker output, reduce the resources stored in that region, or\n",
            "  choose a board with more of that memory.\n",
        ))
    body.append("  [size-error] won't fit on this board\n")
    return "".join(body)


# Successful builds retained for upload-only retries. Every fresh compile
# invalidates its workspace entry before touching shared build artifacts.
_compiled_uploads: dict[str, tuple] = {}


@toolchain._reports_total_time
def _compile_upload(
    label, sketch_dir, fqbn, port, output_dir=None, usb_cdc=False, flash_mb=None,
    reuse_compiled: bool = False,
):
    """Compile, then (if a port is given) upload a sketch. Returns
    (exit code, phase) where phase is "compile" or "upload" — the phase the
    run ended in, so callers can tailor the failure message (a compile failure
    never touched the board; only an upload failure warrants download-mode
    advice).

    Compiling is also the size gate: arduino-cli refuses to link a binary that
    overflows flash/RAM, so an over-capacity design fails here and never reaches
    the upload step. We translate that (otherwise cryptic) failure into a clear
    message, and on success surface the headroom / warn when it's tight."""
    if not toolchain._ARDUINO_CLI:
        return (yield from toolchain._missing_engine(
            label, "arduino-cli",
            "Point the helper at a binary or install one from Board & Port, "
            "or switch the engine to fbuild.",
        ))
    fqbn = toolchain._arduino_fqbn(fqbn, flash_mb, usb_cdc)
    build_key = str(sketch_dir.resolve())
    build_identity = (fqbn, tuple(
        (path.name, path.read_text(encoding="utf-8"))
        for path in sorted(sketch_dir.glob("*.ino"))
    ))
    if reuse_compiled:
        if _compiled_uploads.get(build_key) != build_identity:
            yield "[error] Compiled firmware is no longer available. Close mapping and start again.\n"
            return -1, "upload"
        yield "  Reusing compiled firmware — skipping compilation.\n"
    else:
        _compiled_uploads.pop(build_key, None)
        compile_lines = []
        uses_lvgl = any(
            toolchain._LVGL_INCLUDE_MARKER in path.read_text(encoding="utf-8")
            for path in sketch_dir.glob("*.ino")
        )
        if uses_lvgl:
            rc = yield from toolchain._ensure_arduino_lvgl_lib()
            if rc != 0:
                return rc, "compile"
        compile_args = toolchain._ARDUINO_BASE + ["compile", "-v", "--fqbn", fqbn]
        uses_ir = any(toolchain._IRREMOTE_INCLUDE in path.read_text(encoding="utf-8") for path in sketch_dir.glob("*.ino"))
        if uses_ir:
            rc = yield from toolchain._ensure_arduino_irremote_lib()
            if rc != 0:
                return rc, "compile"
        uses_vl53l0x = any(toolchain._VL53L0X_INCLUDE in path.read_text(encoding="utf-8") for path in sketch_dir.glob("*.ino"))
        if uses_vl53l0x:
            rc = yield from toolchain._ensure_arduino_vl53l0x_lib()
            if rc != 0:
                return rc, "compile"
        uses_vl53l1x = any(toolchain._VL53L1X_INCLUDE in path.read_text(encoding="utf-8") for path in sketch_dir.glob("*.ino"))
        if uses_vl53l1x:
            rc = yield from toolchain._ensure_arduino_vl53l1x_lib()
            if rc != 0:
                return rc, "compile"
        uses_audio = any("#include <Audio.h>" in path.read_text(encoding="utf-8") for path in sketch_dir.glob("*.ino"))
        if uses_audio:
            rc = yield from toolchain._ensure_arduino_audio_lib()
            if rc != 0:
                return rc, "compile"
            compile_args += ["--library", str(toolchain._ARDUINO_AUDIO_LIB_DIR)]
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
        if output_dir is not None:
            # arduino-cli keeps its artifacts in a cache directory it names itself;
            # this copies them somewhere the caller can read. Only the firmware
            # export asks for it, so an ordinary upload's build is unchanged.
            compile_args += ["--output-dir", str(output_dir)]
        compile_args.append(str(sketch_dir))
        rc = yield from toolchain._run_phase(
            f"{label} · compile", compile_args,
            sink=compile_lines,
        )
        if rc != 0:
            # A capacity overflow is the interesting failure — say so plainly so the
            # UI can show "won't fit" instead of a wall of linker errors.
            if _looks_like_overflow(compile_lines):
                yield _overflow_message(fqbn, compile_lines)
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

        _compiled_uploads[build_key] = build_identity
        yield "  [compiled] firmware ready for upload\n"

    if not port:
        yield "  (no port selected — compiled only)\n"
        return 0, "compile"
    with _flashing():   # keeps `board list` off the port — see serial_ports()
        rc = yield from toolchain._run_phase(f"{label} · upload", toolchain._ARDUINO_BASE + ["upload", "-v", "-p", port, "--fqbn", fqbn, str(sketch_dir)])
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
# ESP8266 core 3.x uses its own segmented size report instead of Arduino's
# standard two sentences. Keep the two totals the capacity UI can compare;
# IRAM is reported separately by that core and is not general dynamic RAM.
_ESP8266_FLASH_BYTES_RE = re.compile(
    r"Code in flash[^\r\n]*used (\d+) / (\d+) bytes \((\d+)%\)", re.I
)
_ESP8266_RAM_BYTES_RE = re.compile(
    r"Variables and constants in RAM[^\r\n]*used (\d+) / (\d+) bytes \((\d+)%\)", re.I
)


def _size_bytes_report(lines):
    """arduino-cli counterpart to `_fbuild_size_bytes_report` — returns
    {"flash": {"usedBytes", "limitBytes", "percent"} | None, "ram": ... | None}."""
    text = "".join(lines)
    result: dict = {"flash": None, "ram": None}
    fm = _FLASH_BYTES_RE.search(text)
    if not fm:
        fm = _ESP8266_FLASH_BYTES_RE.search(text)
    if fm:
        if fm.re is _FLASH_BYTES_RE:
            result["flash"] = {"usedBytes": int(fm.group(1)), "percent": int(fm.group(2)), "limitBytes": int(fm.group(3))}
        else:
            result["flash"] = {"usedBytes": int(fm.group(1)), "limitBytes": int(fm.group(2)), "percent": int(fm.group(3))}
    rm = _RAM_BYTES_RE.search(text)
    if not rm:
        rm = _ESP8266_RAM_BYTES_RE.search(text)
    if rm:
        if rm.re is _RAM_BYTES_RE:
            result["ram"] = {"usedBytes": int(rm.group(1)), "percent": int(rm.group(2)), "limitBytes": int(rm.group(3))}
        else:
            result["ram"] = {"usedBytes": int(rm.group(1)), "limitBytes": int(rm.group(2)), "percent": int(rm.group(3))}
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
_LD_OVERFLOW_RE = re.compile(
    r"region\s+[`']?([\w.-]+)[`']?\s+overflowed by\s+([\d,]+)\s+bytes",
    re.I,
)
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


def _fbuild_lvgl_archive_command(lines, env, toolchain_root=None):
    """Recognize only fbuild's Windows LVGL archiver spawn failure.

    fbuild through 2.5.26 passes every object on the command line (library_compiler.rs,
    archive_objects), exceeding CreateProcess's limit for LVGL 9.5.0. Restrict
    recovery to existing objects in this environment and an installed fbuild
    toolchain; compiler diagnostics must never become arbitrary commands.
    """
    root = toolchain._FBUILD_PROJECT_DIR.resolve()
    library = (root / ".fbuild" / "build" / env / "release" / "lib" / "lvgl").resolve()
    if not library.is_relative_to(root):
        return None
    cache = (toolchain_root or Path.home() / ".fbuild").resolve()
    marker = "local library 'lvgl' failed to compile: failed to spawn "
    for line in lines:
        if marker not in line or "os error 206" not in line:
            continue
        try:
            args, _ = json.JSONDecoder().raw_decode(line.split(marker, 1)[1])
            if not isinstance(args, list) or len(args) < 4 or not all(isinstance(arg, str) for arg in args):
                continue
            ar = Path(args[0]).resolve()
            if not ar.is_relative_to(cache) or "toolchains" not in ar.parts or not ar.is_file():
                continue
            if not re.fullmatch(r"[a-zA-Z0-9_-]+-ar\.exe", ar.name) or args[1] != "rcs":
                continue
            archive = (root / args[2]).resolve()
            objects = [(root / arg).resolve() for arg in args[3:]]
            if archive != library / "liblvgl.a" or not objects:
                continue
            if any(obj.parent != library / "obj" or obj.suffix != ".o" or not obj.is_file() for obj in objects):
                continue
            return ar, archive, objects
        except (ValueError, OSError, TypeError):
            continue
    return None


def _recover_fbuild_lvgl_archive(lines, env):
    if platform.system() != "Windows":
        return False
    command = _fbuild_lvgl_archive_command(lines, env)
    if command is None:
        return False
    ar, archive, objects = command
    response = archive.parent / "lvgl-objects.rsp"
    # GCC response files accept quoted forward-slash paths, including spaces.
    response.write_text("\n".join(f'"{obj.as_posix()}"' for obj in objects) + "\n", encoding="utf-8")
    yield "\n  [build] Archiving LVGL with a response file for the Windows command-length limit.\n"
    rc = yield from toolchain._run_phase("archive LVGL", [str(ar), "rcs", str(archive), f"@{response}"], cwd=toolchain._FBUILD_PROJECT_DIR)
    return rc == 0


def _run_fbuild_compile(label, env, sink):
    """Stream compilation, deferring its failure status until recovery is tried.

    The upload UI treats any nonzero phase-exit marker as a final error. Keep
    the diagnostics visible but don't report a recoverable archive attempt as
    the outcome of the whole upload.
    """
    phase_label = f"{label} · compile"
    phase = toolchain._run_phase(phase_label, [toolchain._FBUILD_BIN, "build", "-e", env, "-v", "--no-timestamp"],
                       sink=sink, cwd=toolchain._FBUILD_PROJECT_DIR)
    deferred = []
    try:
        while True:
            line = next(phase)
            if line.startswith(f"[{phase_label} exit code:") and not line.startswith(f"[{phase_label} exit code: 0 "):
                deferred.append(line)
            else:
                yield line
    except StopIteration as stop:
        return stop.value, deferred


@toolchain._reports_total_time
def _compile_upload_fbuild(
    label, ino, fqbn, port, flash_mb=None, usb_cdc=False, reuse_compiled: bool = False,
):
    """fbuild-engine counterpart to `_compile_upload` — same (rc, phase)
    contract, so callers don't need to know which engine ran.

    Holds `_fbuild_build_lock` for the whole run: fbuild's project scaffold is
    one shared directory (see above), so a second build starting before this
    one finishes would overwrite `main.ino` and interleave `fbuild build`
    output — serializing here is what makes that impossible rather than just
    unlikely. The acquire is timeout-bounded (see `_FBUILD_LOCK_TIMEOUT_S`)
    so a genuinely wedged build fails fast and visibly instead of silently
    starving every later build/upload/capacity-check request forever."""
    # Before the lock: a build that cannot run should not make the next one
    # queue behind it.
    if not toolchain._FBUILD_BIN:
        return (yield from toolchain._missing_engine(
            label, "fbuild",
            "Install it with `pip install fbuild`, or switch the engine to arduino-cli.",
        ))
    # Take the wait in slices instead of one blocking `acquire`, and narrate it.
    # The UI derives its status from this stream, so a build queued behind
    # another one used to produce no output at all for up to
    # `_FBUILD_LOCK_TIMEOUT_S` — the Upload button sat on "Starting…" for three
    # minutes with nothing to distinguish queued from compiling from wedged.
    # Saying so costs one line and turns a mystery into a wait.
    token = toolchain._fbuild_build_lock.acquire(0, toolchain._FBUILD_LOCK_STALE_S)
    if token is None:
        waited = 0.0
        yield ("\n  [waiting] the build directory is busy with another build — "
               "queued behind it, nothing is wrong\n")
        while token is None and waited < toolchain._FBUILD_LOCK_TIMEOUT_S:
            step = min(toolchain._FBUILD_LOCK_POLL_S, toolchain._FBUILD_LOCK_TIMEOUT_S - waited)
            token = toolchain._fbuild_build_lock.acquire(step, toolchain._FBUILD_LOCK_STALE_S)
            waited += step
            if token is None and waited < toolchain._FBUILD_LOCK_TIMEOUT_S:
                yield f"  [waiting] still queued ({int(waited)}s of {int(toolchain._FBUILD_LOCK_TIMEOUT_S)}s)…\n"
    if token is None:
        yield (
            f"\n=== ✗ {label}: another fbuild build is still running (waited "
            f"{toolchain._FBUILD_LOCK_TIMEOUT_S}s) ===\n"
            "  Builds are serialized because they share one project directory.\n"
            "  Nothing was compiled or sent to the board — your sketch is fine.\n"
            "  Wait for the other build to finish and try again; if it never\n"
            f"  does, it is treated as abandoned after {toolchain._FBUILD_LOCK_STALE_S}s and\n"
            "  the next attempt takes over automatically.\n"
        )
        return -1, "busy"
    try:
        env = toolchain._fbuild_env_for_fqbn(fqbn, flash_mb, usb_cdc)
        if env is None:
            yield f"\n=== ✗ {label}: no fbuild board mapping for {fqbn} ===\n"
            return -1, "compile"
        build_key = "fbuild"
        build_identity = (ino, fqbn, flash_mb, usb_cdc, env)
        if reuse_compiled:
            if _compiled_uploads.get(build_key) != build_identity:
                yield "[error] Compiled firmware is no longer available. Close mapping and start again.\n"
                return -1, "upload"
            yield "  Reusing compiled firmware — skipping compilation.\n"
        else:
            _compiled_uploads.pop(build_key, None)
            yield from toolchain._ensure_fbuild_project()
            if "#include <Audio.h>" in ino:
                yield from toolchain._ensure_fbuild_audio_lib()
            if "#include <esp_dmx.h>" in ino:
                yield from toolchain._ensure_fbuild_esp_dmx_lib()
            if "#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>" in ino:
                yield from toolchain._ensure_fbuild_hub75_lib()
            if "#include <Adafruit_ZeroI2S.h>" in ino:
                yield from toolchain._ensure_fbuild_zero_i2s_lib()
            if toolchain._LVGL_INCLUDE_MARKER in ino:
                yield from toolchain._ensure_fbuild_lvgl_lib(ino)
            if toolchain._IRREMOTE_INCLUDE in ino:
                yield from toolchain._ensure_fbuild_irremote_lib()
            if toolchain._VL53L0X_INCLUDE in ino:
                yield from toolchain._ensure_fbuild_vl53l0x_lib()
            if toolchain._VL53L1X_INCLUDE in ino:
                yield from toolchain._ensure_fbuild_vl53l1x_lib()
            compile_lines = []
            toolchain._write_fbuild_main(ino)
            rc, deferred = yield from _run_fbuild_compile(label, env, compile_lines)
            if rc != 0 and not toolchain._build_was_cancelled() and (yield from _recover_fbuild_lvgl_archive(compile_lines, env)):
                # fbuild reuses the now-current archive and completes its own
                # link, capacity report and binary generation. Retry once only.
                rc = yield from toolchain._run_phase(
                    f"{label} · compile", [toolchain._FBUILD_BIN, "build", "-e", env, "-v", "--no-timestamp"],
                    sink=compile_lines, cwd=toolchain._FBUILD_PROJECT_DIR,
                )
            else:
                yield from deferred
            if rc != 0:
                if _looks_like_overflow(compile_lines):
                    yield _overflow_message(fqbn, compile_lines)
                return rc, "compile"

            report = _fbuild_size_report(compile_lines)
            over = _over_capacity(report)
            if over:
                yield _overflow_message(
                    fqbn,
                    compile_lines,
                    {kind: report[kind] for kind in over},
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

            _compiled_uploads[build_key] = build_identity
            yield "  [compiled] firmware ready for upload\n"

        if not port:
            yield "  (no port selected — compiled only)\n"
            return 0, "compile"
        deploy_args = [
            toolchain._FBUILD_BIN, "deploy", "-e", env, "-p", port,
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
            if not toolchain._ESPTOOL_BIN:
                yield (
                    "  [engine-gap] The pinned esptool executable is missing, so the "
                    "fbuild ESP32 deploy experiment cannot run. Switch to the "
                    "arduino-cli engine and try again.\n"
                )
                return -1, "upload"
            deploy_args.extend(["-b", "115200"])
            deploy_env = {
                **toolchain._TOOLCHAIN_ENV,
                "PATH": str(Path(toolchain._ESPTOOL_BIN).parent)
                + os.pathsep
                + toolchain._TOOLCHAIN_ENV.get("PATH", ""),
            }
            yield f"  [deploy experiment] baud 115200 · esptool {toolchain._ESPTOOL_BIN}\n"
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
                rc = yield from toolchain._run_phase(
                    f"{label} · upload", deploy_args,
                    sink=upload_lines, cwd=toolchain._FBUILD_PROJECT_DIR, tool_env=deploy_env,
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
        toolchain._fbuild_build_lock.release(token)


def _upload_result_lines(rc, phase, port):
    """Shared status messaging after a compile/upload run, whichever engine ran it."""
    if rc == 0 and port:
        yield "\nUpload complete.\n"
    elif phase == "busy":
        # Never blame the sketch here: nothing was compiled. Saying "the sketch
        # didn't compile" sends the user to inspect a graph that is fine.
        yield ("\n*** DID NOT RUN *** Another build was already using the build "
               "directory. Nothing was compiled or sent to the board.\n")
    elif toolchain._build_was_cancelled():
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
@router.get("/api/system-info")
def system_info():
    return _system_info()


@router.get("/api/health")
def health():
    """Liveness + which build engine is active + arduino-cli availability (so
    the UI can show status). `arduinoCli`/`version` are kept as-is even when
    fbuild is the active engine, since older frontend builds only read those."""
    version = None
    if toolchain._ARDUINO_CLI:
        try:
            proc = subprocess.run([toolchain._ARDUINO_CLI, "version"], capture_output=True, text=True, timeout=15)
            version = (proc.stdout or "").strip() or None
        except Exception:
            version = None
    fbuild_version = None
    if toolchain._FBUILD_BIN:
        try:
            proc = subprocess.run([toolchain._FBUILD_BIN, "--version"], capture_output=True, text=True, timeout=15)
            fbuild_version = (proc.stdout or "").strip() or None
        except Exception:
            fbuild_version = None
    return {
        "ok": True,
        "arduinoCli": bool(toolchain._ARDUINO_CLI),
        "version": version,
        "engine": toolchain._active_engine(),
        "fbuild": bool(toolchain._FBUILD_BIN),
        "fbuildVersion": fbuild_version,
    }


@router.get("/api/serial/ports")
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
    if toolchain._ARDUINO_CLI and not _flash_in_progress():
        try:
            proc = subprocess.run(
                toolchain._ARDUINO_BASE + ["board", "list", "--format", "json"],
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


@router.get("/api/serial/monitor")
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
    if streaming._stream_active() and streaming._stream_port == port:
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


@router.post("/api/rtc/set")
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
    if streaming._stream_active() and streaming._stream_port == port:
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


@router.post("/api/upload")
def upload(payload: dict = Body(...)):
    """Compile a raw `.ino` and upload it to the board, streaming logs as text.

    Body: {"ino": "<sketch source>", "fqbn": "esp32:esp32:esp32s3", "port": "COM5"}.
    Compiles first; uploads only if that succeeds and a port was given.
    """
    engine = toolchain._active_engine()
    if engine == "fbuild" and not toolchain._FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not toolchain._ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    ino = payload.get("ino") or ""
    fqbn = (payload.get("fqbn") or toolchain._DEFAULT_FQBN).strip()
    port = (payload.get("port") or "").strip()
    if port and streaming._stream_active() and streaming._stream_port == port:
        return JSONResponse({"ok": False, "error": "port is in use by a live stream — stop it first"}, status_code=409)
    # A serial monitor on the same port blocks esptool with a bare
    # PermissionError. The frontend aborts it before every upload, but that
    # abort alone does not guarantee release — Starlette only notices a dropped
    # client when a body write fails, and a quiet board never triggers one — so
    # reclaim the handle explicitly instead of racing disconnect detection.
    if port:
        _release_monitor(port)

    flash_mb = toolchain._flash_mb_from(payload)
    usb_cdc = toolchain._usb_cdc_from(payload)
    retry_options = {"reuse_compiled": True} if payload.get("reuseCompiled") is True else {}

    if engine == "fbuild":
        def stream():
            rc, phase = yield from _compile_upload_fbuild("Sketch", ino, fqbn, port, flash_mb, usb_cdc, **retry_options)
            yield from _upload_result_lines(rc, phase, port)
        return StreamingResponse(stream(), media_type="text/plain")

    def stream():
        with _sketch_workspace(toolchain.SKETCH, ino) as sketch_dir:
            rc, phase = yield from _compile_upload(
                "Sketch", sketch_dir, fqbn, port, usb_cdc=usb_cdc,
                flash_mb=flash_mb, **retry_options)
            yield from _upload_result_lines(rc, phase, port)

    return StreamingResponse(stream(), media_type="text/plain")


@router.post("/api/build/cancel")
def cancel_build():
    """Stop the build in progress, if there is one.

    Idempotent and safe to call when nothing is running — the UI offers it
    whenever an upload is busy, and a build that finished a moment earlier is
    not an error worth reporting."""
    return JSONResponse({"ok": True, "cancelled": toolchain._cancel_active_build()})


@router.post("/api/compile-check")
def compile_check(payload: dict = Body(...)):
    """Compile-only capacity check for the live controller-capacity meter: runs
    the same compile a real Upload would (no port, so nothing is flashed) and
    returns one JSON result with the toolchain's real flash/RAM size report,
    instead of a streamed log.

    Body: {"ino": "<sketch source>", "fqbn": "esp32:esp32:esp32s3[:PSRAM=opi]"}.
    """
    engine = toolchain._active_engine()
    if engine == "fbuild" and not toolchain._FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not toolchain._ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)

    ino = (payload.get("ino") or "").strip()
    fqbn = (payload.get("fqbn") or toolchain._DEFAULT_FQBN).strip()
    if not ino:
        return JSONResponse({"ok": False, "error": "no sketch to compile"}, status_code=400)

    if engine == "fbuild":
        flash_mb = toolchain._flash_mb_from(payload)
        usb_cdc = toolchain._usb_cdc_from(payload)
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
        flash_mb = toolchain._flash_mb_from(payload)
        usb_cdc = toolchain._usb_cdc_from(payload)
        with _sketch_workspace(toolchain.SKETCH, ino) as sketch_dir:
            lines, (rc, phase) = _drain_compile(_compile_upload(
                "Capacity check", sketch_dir, fqbn, "", usb_cdc=usb_cdc,
                flash_mb=flash_mb))
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


# -- Firmware image export ----------------------------------------------------
# Exporting a compiled image is two requests, not one. The POST streams the
# compile exactly as an upload does, because a build is minutes long and a
# silent wait reads as a hang; it ends in a marker line naming what it built.
# The browser then GETs that artifact by id. Returning the bytes from the same
# request would mean either holding the stream back until the end (the silent
# wait again) or base64 inside the log, split across chunk boundaries.
_EXPORT_DIR = toolchain._DATA_DIR / "exports"
# Read by the frontend to turn a finished stream into a download. Named in
# src/utils/logView.ts's ALWAYS_KEEP so the condensed console still shows it.
_EXPORT_MARKER = "[binary]"
# A firmware image is a megabyte or two and regenerable; keep the last few so a
# second export can't be served the first one's file, and no more.
_EXPORT_KEEP = 3

# What is worth handing someone, most useful first. An ESP32 `.merged.bin`
# flashes at offset 0 with nothing else needed, which is why it wins over the
# application image beside it: that one wants 0x10000 plus a bootloader and
# partition table already on the board. `firmware.bin` is fbuild's name for the
# application image; the bare `*.bin`/`*.hex` entries are the last resort for a
# toolchain that names its output something else entirely.
_EXPORT_PREFERENCE = (
    "*.merged.bin",
    "*.ino.bin",
    "firmware.bin",
    "*.ino.hex",
    "firmware.hex",
    "*.ino.uf2",
    "firmware.uf2",
    "*.bin",
    "*.hex",
)


def _prune_exports(keep=_EXPORT_KEEP):
    """Drop all but the newest `keep` exported artifacts."""
    try:
        kept = sorted(
            (path for path in _EXPORT_DIR.iterdir() if path.is_dir()),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        return
    for stale in kept[keep:]:
        shutil.rmtree(stale, ignore_errors=True)


def _export_artifact(build_dir: Path) -> Path | None:
    """The one file worth exporting out of a finished build's artifacts."""
    for pattern in _EXPORT_PREFERENCE:
        matches = sorted(build_dir.glob(pattern))
        if matches:
            return matches[0]
    return None


def _export_name(payload: dict, artifact: Path) -> str:
    """`<project><the artifact's own suffixes>`, with the project name reduced to
    something a filesystem and a Content-Disposition header both accept."""
    raw = str(payload.get("name") or toolchain.SKETCH).strip()
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", raw).strip("-._") or toolchain.SKETCH
    # `.ino.merged.bin` carries which image this is, and that matters when
    # flashing; `.ino` on its own does not.
    suffix = "".join(artifact.suffixes).replace(".ino", "") or artifact.suffix
    return f"{safe}{suffix}"


@router.post("/api/compile-binary")
def compile_binary(payload: dict = Body(...)):
    """Compile a sketch and keep the firmware image for download.

    Body: {"ino": ..., "fqbn": ..., "flashMb": ..., "usbCdcOnBoot": ..., "name": ...}.
    Streams the compile log as text/plain, ending in either
    `[binary] id=<id> name=<file> bytes=<n>` or `[binary] failed`. Nothing is
    sent to the board: this is the same compile an upload runs, with no port.
    """
    engine = toolchain._active_engine()
    if engine == "fbuild" and not toolchain._FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not toolchain._ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)

    ino = (payload.get("ino") or "").strip()
    fqbn = (payload.get("fqbn") or toolchain._DEFAULT_FQBN).strip()
    if not ino:
        return JSONResponse({"ok": False, "error": "no sketch to compile"}, status_code=400)
    flash_mb = toolchain._flash_mb_from(payload)
    usb_cdc = toolchain._usb_cdc_from(payload)

    def stream():
        _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        _prune_exports(_EXPORT_KEEP - 1)
        out_dir = _EXPORT_DIR / uuid.uuid4().hex
        out_dir.mkdir()
        try:
            if engine == "fbuild":
                rc, _phase = yield from _compile_upload_fbuild(
                    "Export binary", ino, fqbn, "", flash_mb, usb_cdc)
                # fbuild builds in place, so the artifacts have to be fetched
                # from the env's own output directory rather than directed to
                # one — the same env id the build itself resolved.
                env = toolchain._fbuild_env_for_fqbn(fqbn, flash_mb, usb_cdc)
                built = (
                    toolchain._FBUILD_PROJECT_DIR / ".fbuild" / "build" / env / "release"
                    if env else None
                )
            else:
                with _sketch_workspace(toolchain.SKETCH, ino) as sketch_dir:
                    rc, _phase = yield from _compile_upload(
                        "Export binary", sketch_dir, fqbn, "", output_dir=out_dir,
                        usb_cdc=usb_cdc, flash_mb=flash_mb)
                built = out_dir
            if rc != 0:
                yield f"\n{_EXPORT_MARKER} failed\n"
                return
            artifact = _export_artifact(built) if built and built.is_dir() else None
            if artifact is None:
                yield ("\n  The compile succeeded but produced no firmware image "
                       "this helper recognises.\n")
                yield f"{_EXPORT_MARKER} failed\n"
                return
            if artifact.parent != out_dir:
                artifact = Path(shutil.copy2(artifact, out_dir / artifact.name))
            # arduino-cli's --output-dir copies everything it built, and the
            # .elf/.map beside a 4MB image are 80MB nobody asked for. Only
            # `out_dir` is ever swept: on the fbuild path `built` is the
            # engine's own build directory, whose contents it still needs.
            for spare in out_dir.iterdir():
                if spare != artifact and spare.is_file():
                    spare.unlink(missing_ok=True)
            name = _export_name(payload, artifact)
            size = artifact.stat().st_size
            yield f"\n  Built {name} ({size // 1024} KB).\n"
            yield f"{_EXPORT_MARKER} id={out_dir.name} name={name} bytes={size}\n"
        except Exception as exc:  # the stream is the only channel back
            yield f"\n*** export failed: {exc} ***\n"
            yield f"{_EXPORT_MARKER} failed\n"

    return StreamingResponse(stream(), media_type="text/plain")


@router.get("/api/compile-binary/{artifact_id}")
def compile_binary_download(artifact_id: str):
    """Serve an image `/api/compile-binary` just built, by its id."""
    # The id is ours, and a request naming anything else is not asking for an
    # artifact — resolve it as a plain directory name rather than a path.
    if not re.fullmatch(r"[0-9a-f]{32}", artifact_id or ""):
        return JSONResponse({"ok": False, "error": "unknown artifact"}, status_code=404)
    out_dir = _EXPORT_DIR / artifact_id
    artifact = _export_artifact(out_dir) if out_dir.is_dir() else None
    if artifact is None:
        return JSONResponse({"ok": False, "error": "unknown artifact"}, status_code=404)
    return FileResponse(
        artifact, media_type="application/octet-stream", filename=artifact.name)


@router.post("/api/upload-show")
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
    engine = toolchain._active_engine()
    if engine == "fbuild" and not toolchain._FBUILD_BIN:
        return JSONResponse({"ok": False, "error": "fbuild not found"}, status_code=400)
    if engine == "arduino-cli" and not toolchain._ARDUINO_CLI:
        return JSONResponse({"ok": False, "error": "arduino-cli not found"}, status_code=400)
    info = json.loads(meta)
    fqbn = (info.get("fqbn") or toolchain._DEFAULT_FQBN).strip()
    port = (info.get("port") or "").strip()
    flash_mb = toolchain._flash_mb_from(info)
    usb_cdc = toolchain._usb_cdc_from(info)
    if port and streaming._stream_active() and streaming._stream_port == port:
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
            return (yield from _compile_upload_fbuild(label, ino, fqbn, use_port, flash_mb, usb_cdc))
        with _sketch_workspace(label.split()[0].lower(), ino) as sketch_dir:
            return (yield from _compile_upload(
                label, sketch_dir, fqbn, use_port, usb_cdc=usb_cdc,
                flash_mb=flash_mb))

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
