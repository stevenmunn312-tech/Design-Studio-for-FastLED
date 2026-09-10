"""Compile generated display fixtures with the helper's real build paths; never flash."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import app as helper  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("engine", choices=("arduino-cli", "fbuild"))
parser.add_argument("sketch", type=Path)
parser.add_argument("--fqbn", default="esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB")
parser.add_argument("--tag", help="suffix for keeping reports from more than one target")
args = parser.parse_args()
ino = args.sketch.read_text(encoding="utf-8")
report_stem = f".{args.engine}.{args.tag}" if args.tag else f".{args.engine}"
log_path = args.sketch.with_suffix(f"{report_stem}.log")
lines = []


def command_text(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
        return ((result.stdout or "") + (result.stderr or "")).strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def git_revision(path):
    if not path.exists():
        return None
    value = command_text(["git", "-C", str(path), "rev-parse", "HEAD"])
    return value.splitlines()[-1] if value else None


def drain(generator, log):
    try:
        while True:
            line = next(generator)
            lines.append(line)
            log.write(line)
            log.flush()
    except StopIteration as stop:
        return stop.value


with log_path.open("w", encoding="utf-8") as log:
    print(f"Compiling {args.sketch.name} with {args.engine}; log: {log_path}", flush=True)
    if args.engine == "fbuild":
        result = drain(helper._compile_upload_fbuild("Display smoke", ino, args.fqbn, "", 16), log)
        sizes = helper._fbuild_size_bytes_report(lines)
    else:
        # One serialized workspace per board reuses the library cache across
        # every fixture built for it. Keyed on the board, not on one stable
        # name, because arduino-cli caches per sketch *path*: sharing a
        # directory between an S3 and a classic ESP32 makes each run evict the
        # other's cores and rebuild all of FastLED.
        board = "".join(ch if ch.isalnum() else "_" for ch in args.fqbn.split(":")[2] if ch != ":")
        with helper._sketch_workspace(f"display_smoke_{board or 'board'}", ino) as workspace:
            result = drain(helper._compile_upload("Display smoke", workspace, args.fqbn, ""), log)
        sizes = helper._size_bytes_report(lines)
toolchain = {
    "engine_version": command_text(
        [helper._FBUILD_BIN, "--version"] if args.engine == "fbuild"
        else [helper._ARDUINO_CLI, "version"]
    ),
    "lvgl_pin": helper._LVGL_VERSION,
    "player_audio_pin": helper._PLAYER_AUDIO_VERSION,
}
if args.engine == "arduino-cli":
    toolchain["installed_cores"] = command_text([helper._ARDUINO_CLI, "core", "list"])
    toolchain["installed_display_libraries"] = command_text([helper._ARDUINO_CLI, "lib", "list"])
else:
    toolchain["vendored_fastled_sha"] = git_revision(helper._FBUILD_LIB_DIR)
    toolchain["vendored_lvgl_sha"] = git_revision(helper._FBUILD_LVGL_LIB_DIR)
    toolchain["vendored_player_audio_sha"] = git_revision(helper._FBUILD_AUDIO_LIB_DIR)

report = {
    "engine": args.engine, "sketch": args.sketch.name, "fqbn": args.fqbn,
    "source_sha256": hashlib.sha256(ino.encode("utf-8")).hexdigest(),
    "completed_utc": datetime.now(timezone.utc).isoformat(), "result": result,
    "toolchain": toolchain, **sizes,
}
args.sketch.with_suffix(f"{report_stem}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
if result[0]:
    print("".join(lines)[-6000:])
sys.exit(0 if result[0] == 0 else 1)
