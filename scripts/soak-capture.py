"""Capture a device-telemetry soak from a bench board. See docs/development/testing/display-budget-bench.md.

Reads FLS_STAT lines from a running board and reports the four figures HW-11's
soak asks for: heap drift, device resets, frame rate early against late, and the
lowest heap. Writes every line as it arrives, so a run interrupted at minute 50
still has fifty minutes of evidence.

    python scripts/soak-capture.py COM6 --minutes 60
"""
import argparse
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import serial

OUT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "bench"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("port")
parser.add_argument("--baud", type=int, default=115200)
parser.add_argument("--minutes", type=float, default=60.0)
args = parser.parse_args()

"""
Buffer, don't flush per line.

A touched panel emits raw touchx/touchy samples far faster than the two-second
stats line, and the first version of this flushed to disk on every one of them.
Under a sustained press the host fell behind the OS serial buffer, which cost
460 truncated lines and six minutes of coverage off the end of a one-hour run.
Flush on the stats lines only: they are the evidence, they arrive every two
seconds, and the raw samples are context.
"""
FLUSH_EVERY = 2.0


def parse(body):
    return {k: float(v) for k, v in re.findall(r"(\w+)=([-\d.]+)", body)}


def slope_bytes_per_hour(points):
    """Least squares over the whole run, as `deviceTelemetry.ts` does, so one
    collection dip cannot invent a leak. Refuses under 3 samples."""
    n = len(points)
    if n < 3:
        return None
    mean_t = sum(t for t, _ in points) / n
    mean_h = sum(h for _, h in points) / n
    den = sum((t - mean_t) ** 2 for t, _ in points)
    if den == 0:
        return None
    return (sum((t - mean_t) * (h - mean_h) for t, h in points) / den) * 3600.0


OUT_DIR.mkdir(parents=True, exist_ok=True)
out = OUT_DIR / ("soak-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".log")
samples, resets, truncated, raw_touch = [], [], 0, 0
started = time.time()
last_flush = started
last_uptime = None

try:
    link = serial.Serial(args.port, args.baud, timeout=2)
except Exception as exc:  # noqa: BLE001 - surface the OS message and stop
    print(f"could not open {args.port}: {exc}")
    sys.exit(1)

with out.open("w", encoding="utf-8") as log:
    log.write(f"# soak on {args.port} at {args.baud}, started {datetime.now(timezone.utc).isoformat()}\n")
    try:
        while time.time() - started < args.minutes * 60:
            try:
                line = link.readline().decode("utf-8", "replace").strip()
            except Exception as exc:  # noqa: BLE001
                log.write(f"# read error: {exc}\n")
                break
            if "FLS_STAT" not in line:
                continue
            elapsed = time.time() - started
            log.write(f"{elapsed:8.1f} {line}\n")
            body = line.split("FLS_STAT", 1)[1].strip()
            if not body:
                truncated += 1
                continue
            fields = parse(body)
            if "touchx" in fields:
                raw_touch += 1
                continue
            if "uptime" not in fields:
                truncated += 1
                continue
            """
            A reboot, not merely a decrease.

            The first version called any fall in uptime a reset and reported one
            that had not happened: under a burst of raw touch samples the host
            read a stale buffered line, uptime appeared to step back 104 seconds
            of a 3,914-second run, and `minheap` was identical either side —
            which a genuine reboot cannot be, since it re-derives from a fresh
            boot. A reboot restarts the counter, so require a fall to near zero.
            """
            if last_uptime is not None and fields["uptime"] < last_uptime * 0.5 and fields["uptime"] < 60:
                resets.append((last_uptime, fields["uptime"]))
                log.write(f"# RESET: uptime {last_uptime:.0f} -> {fields['uptime']:.0f}\n")
            elif last_uptime is not None and fields["uptime"] < last_uptime:
                log.write(f"# out-of-order line ignored: uptime {last_uptime:.0f} -> {fields['uptime']:.0f}\n")
                continue
            last_uptime = fields["uptime"]
            samples.append((elapsed, fields))
            if time.time() - last_flush >= FLUSH_EVERY:
                log.flush()
                last_flush = time.time()
    finally:
        link.close()

if not samples:
    print("no telemetry captured — is `Report telemetry` set on the Board, and the sketch uploaded since?")
    sys.exit(1)

heap = [(t, f["heap"]) for t, f in samples if "heap" in f]
fps = [(t, f["fps"]) for t, f in samples if "fps" in f]
touch = [f["touchms"] for _, f in samples if "touchms" in f]
span = samples[-1][0]
early = [v for t, v in fps if t <= 600]
late = [v for t, v in fps if t >= span - 600]
drift = slope_bytes_per_hour(heap)

report = [
    f"run length        : {span / 60:.1f} min, {len(samples)} stat samples",
    f"board uptime span : {samples[0][1]['uptime']:.0f} -> {samples[-1][1]['uptime']:.0f} s",
    f"device resets     : {len(resets)}" + (f"  {resets}" if resets else "   (must be zero)"),
    f"heap first / last : {heap[0][1]:.0f} / {heap[-1][1]:.0f}" if heap else "",
    f"heap min / max    : {min(h for _, h in heap):.0f} / {max(h for _, h in heap):.0f}" if heap else "",
    f"heap drift        : {drift:.1f} bytes/hour" if drift is not None else "heap drift        : not enough samples",
    f"lowest heap (dev) : {min(f['minheap'] for _, f in samples if 'minheap' in f):.0f}",
    f"fps first 10 min  : mean {sum(early) / len(early):.2f} (n={len(early)})" if early else "",
    f"fps last 10 min   : mean {sum(late) / len(late):.2f} (n={len(late)})" if late else "",
    f"touch samples     : {len(touch)}" + (f", worst {max(touch):.1f} ms" if touch else " (nobody pressed the glass)"),
    f"raw touch lines   : {raw_touch}   truncated lines: {truncated}",
]
summary = "\n".join(line for line in report if line)
with out.open("a", encoding="utf-8") as log:
    log.write("\n# SUMMARY\n" + summary + "\n")
print("log:", out)
print(summary)
