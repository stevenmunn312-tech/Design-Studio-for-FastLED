"""Compile a generated sensor fixture through the helper's real build path; never flash.

Used by the presence-sensor, light-sensor and wired-Ethernet compile gates; --label keeps
each gate's arduino-cli workspace separate so neither evicts the other's cache.
"""
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
parser.add_argument("--fqbn", required=True)
parser.add_argument("--tag", required=True)
parser.add_argument("--label", default="presence", help="fixture family: presence, light or ethernet")
args = parser.parse_args()
ino = args.sketch.read_text(encoding="utf-8")
report_stem = f".{args.engine}.{args.tag}"
log_path = args.sketch.with_suffix(f"{report_stem}.log")
lines = []


def command_text(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=30, check=False)
        return ((result.stdout or "") + (result.stderr or "")).strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


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
    print(f"Compiling {args.sketch.name} for {args.fqbn} with {args.engine}; log: {log_path}", flush=True)
    if args.engine == "fbuild":
        result = drain(helper._compile_upload_fbuild(f"{args.label.capitalize()} sensor smoke", ino, args.fqbn, "", 16), log)
        sizes = helper._fbuild_size_bytes_report(lines)
    else:
        board = "".join(ch for ch in args.fqbn.split(":")[2] if ch.isalnum())
        # Keep one stable path per board so arduino-cli can reuse its library
        # objects as the normal/show/player/no-sensor source changes.
        with helper._sketch_workspace(f"{args.label}_smoke_{board}", ino) as workspace:
            result = drain(helper._compile_upload(f"{args.label.capitalize()} sensor smoke", workspace, args.fqbn, ""), log)
        sizes = helper._size_bytes_report(lines)

report = {
    "engine": args.engine,
    "sketch": args.sketch.name,
    "fqbn": args.fqbn,
    "source_sha256": hashlib.sha256(ino.encode("utf-8")).hexdigest(),
    "completed_utc": datetime.now(timezone.utc).isoformat(),
    "result": result,
    "toolchain": {
        "engine_version": command_text(
            [helper._FBUILD_BIN, "--version"] if args.engine == "fbuild"
            else [helper._ARDUINO_CLI, "version"]
        ),
    },
    **sizes,
}
args.sketch.with_suffix(f"{report_stem}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
if result[0]:
    print("".join(lines)[-6000:])
sys.exit(0 if result[0] == 0 else 1)
