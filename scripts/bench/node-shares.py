"""Upload one node-share bench sketch (scripts/bench/node-shares.ts) and print each node's ms per frame.

Uploads through the helper's own compile path, so run nothing else that compiles meanwhile.
"""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
import firmware  # noqa: E402
import serial  # noqa: E402

name, port = sys.argv[1], sys.argv[2]
fqbn = sys.argv[3] if len(sys.argv) > 3 else "esp8266:esp8266:d1_mini"
seconds = float(sys.argv[4]) if len(sys.argv) > 4 else 24
ino_path = ROOT / "artifacts" / "bench" / "node-shares" / name / f"{name}.ino"
ino = ino_path.read_text(encoding="utf-8")
labels = json.loads(re.search(r"// FLS_STAT nodes (\[.*\])", ino).group(1))

log = ino_path.with_suffix(".upload.log").open("w", encoding="utf-8")
with firmware._sketch_workspace(f"node_shares_{fqbn.split(':')[2]}", ino) as workspace:
    gen = firmware._compile_upload("Node-share bench", workspace, fqbn, port)
    try:
        while True:
            log.write(next(gen))
    except StopIteration as stop:
        result = stop.value
log.close()
print("result", result, flush=True)
if result[0] != 0:
    print(ino_path.with_suffix(".upload.log").read_text(encoding="utf-8")[-3000:])
    sys.exit(1)

stats = []
with serial.Serial(port, 115200, timeout=1) as link:
    end = time.time() + seconds
    while time.time() < end:
        line = link.readline().decode("utf-8", "replace").strip()
        if line.startswith("FLS_STAT"):
            stats.append(line)
            print(line, flush=True)

out = ino_path.with_suffix(".stats.txt")
out.write_text("\n".join(stats) + "\n", encoding="utf-8")
if stats:
    last = stats[-1]
    top = re.search(r"top=(\S+)", last)
    if top:
        print("--- per-node ms/frame (last interval) ---")
        for entry in top.group(1).split(","):
            index, ms = entry.split(":")
            print(f"{float(ms):8.2f}  {labels[int(index)]}")
