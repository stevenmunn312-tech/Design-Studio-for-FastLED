"""Compile generated display fixtures with the helper's real build paths; never flash."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend import app as helper  # noqa: E402

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("engine", choices=("arduino-cli", "fbuild"))
parser.add_argument("sketch", type=Path)
parser.add_argument("--fqbn", default="esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB")
args = parser.parse_args()
ino = args.sketch.read_text(encoding="utf-8")
log_path = args.sketch.with_suffix(f".{args.engine}.log")
lines = []


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
        # One serialized workspace reuses the library cache across all three
        # variants. Its stable name is retained from the first normal fixture.
        with helper._sketch_workspace("display_smoke_normal", ino) as workspace:
            result = drain(helper._compile_upload("Display smoke", workspace, args.fqbn, ""), log)
        sizes = helper._size_bytes_report(lines)
report = {
    "engine": args.engine, "sketch": args.sketch.name, "fqbn": args.fqbn,
    "source_sha256": hashlib.sha256(ino.encode("utf-8")).hexdigest(),
    "completed_utc": datetime.now(timezone.utc).isoformat(), "result": result, **sizes,
}
args.sketch.with_suffix(f".{args.engine}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
if result[0]:
    print("".join(lines)[-6000:])
sys.exit(0 if result[0] == 0 else 1)
