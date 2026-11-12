"""Rebuild each known fbuild fault as a tiny project and say whether it is still there.

Every workaround in docs/runbooks/fbuild-workarounds.md that a two-file
project can show has a probe here. Run it after moving the fbuild pin:

    backend/.venv/Scripts/python scripts/compile-fixtures/fbuild-probes.py
    backend/.venv/Scripts/python scripts/compile-fixtures/fbuild-probes.py --only wifis3 pico-w

A probe is PRESENT when the build fails the way the runbook describes, GONE
when it builds (the workaround can be retired), and CHANGED when it fails
another way. The projects are written under tmp/fbuild-probes/ and built one
at a time with the fbuild beside this interpreter, never one found on PATH.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import firmware  # noqa: E402

WORK = ROOT / "tmp" / "fbuild-probes"
FASTLED = ROOT / "backend" / ".fbuild-project" / "lib" / "FastLED"

BLINK = """#include <Arduino.h>
void setup() { pinMode(LED_BUILTIN, OUTPUT); }
void loop() { digitalWrite(LED_BUILTIN, HIGH); delay(500); digitalWrite(LED_BUILTIN, LOW); delay(500); }
"""

FASTLED_SKETCH = """#include <Arduino.h>
#include <FastLED.h>
CRGB leds[16];
void setup() { FastLED.addLeds<WS2812B, 5, GRB>(leds, 16); }
void loop() { fill_solid(leds, 16, CRGB::Red); FastLED.show(); delay(20); }
"""


@dataclass(frozen=True)
class Probe:
    name: str
    where: str  # runbook section or upstream issue
    platform: str
    board: str
    sketch: str
    present: str  # regex the log matches while the fault is there
    lib_deps: str = ""
    fastled: bool = False  # copy the helper's vendored FastLED into lib/
    command: str = "build"
    # The fault is that a line is missing from a failed build, not that it fails.
    absent: str = ""


PROBES = [
    Probe("overflow-no-size", "§5, #1658", "espressif32", "esp32-s3-devkitc-1",
          "#include <Arduino.h>\nstatic uint8_t big[400000];\n"
          "void setup() { big[0] = 1; }\nvoid loop() { big[millis() % 400000]++; }\n",
          r"overflowed by \d+ bytes", absent=r"^(?:Flash|RAM):\s"),
    Probe("esp8266-wifi-link", "§15, #1994", "espressif8266", "d1_mini",
          '#include <ESP8266WiFi.h>\nvoid setup() { WiFi.begin("ssid", "password"); }\nvoid loop() {}\n',
          r"undefined reference"),
    Probe("wifis3", "§16", "renesas-ra", "uno_r4_wifi",
          '#include <WiFiS3.h>\nvoid setup() { WiFi.begin("ssid", "password"); }\nvoid loop() {}\n',
          r"WiFiS3\.h: No such file"),
    Probe("nrf52-lto", "§17", "nordicnrf52", "nrf52840_dk", FASTLED_SKETCH,
          r"offset out of range", fastled=True),
    Probe("pico-w", "boards mapped", "raspberrypi", "rpipicow", BLINK, r"undefined reference to `cyw43_"),
    Probe("r4-minima", "boards mapped", "renesas-ra", "uno_r4_minima", BLINK,
          r"(?:bsp_api|common_data)\.h: No such file"),
    Probe("xiaoble", "boards mapped", "nordicnrf52", "xiaoble_adafruit", BLINK, r"variant\.h: No such file"),
    Probe("lib-deps-git-ref", "§1", "espressif32", "esp32dev", BLINK, r"invalid Zip archive",
          lib_deps="https://github.com/schreibfaul1/ESP32-audioI2S.git#3.0.12", command="install"),
    Probe("lib-deps-registry", "§1", "atmelavr", "uno", BLINK, r"not in fbuild's registry index",
          lib_deps="adafruit/Adafruit Zero DMA Library@1.1.4"),
]


def fbuild_binary() -> str:
    beside = Path(sys.executable).parent / ("fbuild.exe" if sys.platform == "win32" else "fbuild")
    if beside.exists():
        return str(beside)
    raise SystemExit(f"no fbuild beside {sys.executable}; run this with the helper's interpreter")


def write_project(probe: Probe) -> Path:
    project = WORK / probe.name
    if project.exists():
        shutil.rmtree(project)
    (project / "src").mkdir(parents=True)
    ini = [f"[env:{probe.board}]", f"platform = {probe.platform}", f"board = {probe.board}", "framework = arduino"]
    if probe.lib_deps:
        ini.append(f"lib_deps = {probe.lib_deps}")
    (project / "platformio.ini").write_text("\n".join(ini) + "\n", encoding="utf-8")
    (project / "src" / "main.cpp").write_text(probe.sketch, encoding="utf-8")
    if probe.fastled:
        shutil.copytree(FASTLED, project / "lib" / "FastLED", ignore=shutil.ignore_patterns(".git"))
    return project


def run(probe: Probe, binary: str) -> tuple[str, str]:
    if probe.fastled and not FASTLED.exists():
        return "SKIPPED", "no vendored FastLED yet: build one sketch in the app with fbuild first"
    project = write_project(probe)
    args = [binary, probe.command, str(project), "-e", probe.board]
    if probe.command == "build":
        args = [binary, str(project), "build", "-e", probe.board, "-v", "--no-timestamp"]
    for attempt in range(2):
        result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
        log = result.stdout + result.stderr
        # §14: the daemon can refuse to start just after the last one exited.
        if "daemon did not become healthy" not in log:
            break
        time.sleep(15)
    (project / "build.log").write_text(log, encoding="utf-8")
    hit = re.search(probe.present, log)
    if result.returncode == 0:
        return "GONE", "builds"
    if hit and probe.absent and re.search(probe.absent, log, re.M):
        return "GONE", "the failed build now prints a size line"
    if hit:
        detail = hit.group(0)
        if probe.name == "overflow-no-size":
            estimate = firmware._fbuild_overflow_estimate(log.splitlines(keepends=True))
            got = next((entry for entry in (estimate.get("ram"), estimate.get("flash")) if entry), None)
            detail += f"; the helper's estimate reads {got['percent']}%" if got else "; THE HELPER'S ESTIMATE READS NOTHING"
        return "PRESENT", detail
    last = next((line for line in reversed(log.splitlines()) if "error" in line.lower()), "no error line")
    return "CHANGED", last.strip()[:160]


def long_paths() -> tuple[str, str]:
    """#1673 is a documentation request: fbuild fails at random past MAX_PATH
    unless Windows long paths are on. Reading the setting is all a probe can
    do without changing the machine."""
    if sys.platform != "win32":
        return "N/A", "not Windows"
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\FileSystem") as key:
            value, _ = winreg.QueryValueEx(key, "LongPathsEnabled")
    except OSError:
        value = 0
    return ("ON" if value == 1 else "OFF"), "LongPathsEnabled; ESP32 builds need it on (#1673)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", nargs="+", default=[], help="probe names to run")
    args = parser.parse_args()
    unknown = set(args.only) - {probe.name for probe in PROBES} - {"long-paths"}
    if unknown:
        parser.error(f"unknown probe: {', '.join(sorted(unknown))}")
    binary = fbuild_binary()
    version = subprocess.run([binary, "--version"], capture_output=True, text=True, check=False).stdout.strip()
    print(f"{version} ({binary})")
    WORK.mkdir(parents=True, exist_ok=True)
    rows = []
    if not args.only or "long-paths" in args.only:
        rows.append(("long-paths", "#1673", *long_paths()))
    for probe in PROBES:
        if args.only and probe.name not in args.only:
            continue
        print(f"  building {probe.name} ...", flush=True)
        rows.append((probe.name, probe.where, *run(probe, binary)))
    width = max(len(row[0]) for row in rows)
    for name, where, status, detail in rows:
        print(f"{name:<{width}}  {status:<8} {where:<14} {detail}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
