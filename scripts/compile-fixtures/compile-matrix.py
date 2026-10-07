"""Run the compile-fixture matrix serially and keep one log and summary.

Safe to leave running unattended. It never kills a compile: a killed or
overlapping arduino-cli run leaves a truncated cached object that fails the
next link. On Windows it asks the system to stay awake while it runs. It writes
the summary after every leg, so a partial run can still be read.

    python scripts/compile-fixtures/compile-matrix.py              # every leg
    python scripts/compile-fixtures/compile-matrix.py --list       # show the plan
    python scripts/compile-fixtures/compile-matrix.py --engine fbuild
    python scripts/compile-fixtures/compile-matrix.py --only ir/ --dry-run

To stop early, create a file named STOP in the run's output folder. The run
finishes the current compile and stops before the next one.

Results go to artifacts/compile-matrix/<timestamp>/: run.log, summary.md,
summary.json and each leg's runner output under legs/. Each runner also writes
its usual build log and JSON report beside the sketch. Before a leg runs, the
previous report for the same leg is read as a baseline, so the summary shows
size changes against the last recorded build (for example, after a toolchain
upgrade).
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend"))
import toolchain  # noqa: E402  (the same binaries the runners resolve)
CLASSIC = "esp32:esp32:esp32"
S3 = "esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB"


@dataclass(frozen=True)
class Leg:
    family: str
    runner: str
    engine: str
    sketch: Path
    fqbn: str | None = None  # None uses the runner's default
    tag: str | None = None
    label: str | None = None
    expected_failure: str | None = None  # a known upstream failure, recorded in the compile record

    @property
    def name(self) -> str:
        return f"{self.family}/{self.sketch.stem}" + (f"@{self.tag}" if self.tag else "")

    def output(self, suffix: str) -> Path:
        stem = f".{self.engine}.{self.tag}" if self.tag else f".{self.engine}"
        return self.sketch.with_suffix(f"{stem}{suffix}")

    def command(self) -> list[str]:
        command = [sys.executable, str(HERE / self.runner), self.engine, str(self.sketch)]
        if self.fqbn:
            command += ["--fqbn", self.fqbn]
        if self.tag:
            command += ["--tag", self.tag]
        if self.label:
            command += ["--label", self.label]
        return command


def display_legs(engine: str) -> list[Leg]:
    folder = ROOT / "artifacts" / "display-compile"
    s3 = ["normal", "show", "player", "isolated-tft", "headless", "disabled", "multi-panel",
          "part-families", "part-families-i2c", "part-parallel", "telemetry"]
    legs = [Leg("display", "compile-display-smoke.py", engine, folder / f"{name}.ino") for name in s3]
    legs.append(Leg("display", "compile-display-smoke.py", engine, folder / "classic-esp32-fixed.ino", CLASSIC, "classic"))
    if engine == "arduino-cli":
        # The fbuild half of the display record is the twelve fixtures above.
        legs += [Leg("display", "compile-display-smoke.py", engine, folder / f"{name}.ino") for name in ("template-led", "template-player")]
        legs.append(Leg("display", "compile-display-smoke.py", engine, folder / "classic-caption-level.ino", CLASSIC, "classic"))
        legs += [Leg("display", "compile-display-smoke.py", engine, folder / f"{name}.ino", CLASSIC, "cyd")
                 for name in ("cyd-run1", "cyd-custom", "cyd-custom-telemetry", "cyd-run2")]
    return legs


def custom_board_legs(engine: str) -> list[Leg]:
    folder = ROOT / "artifacts" / "custom-board-compile"
    return [Leg("custom-board", "compile-display-smoke.py", engine, folder / f"{board}-{mode}.ino",
                CLASSIC if board == "esp32" else None)
            for board in ("esp32", "esp32s3") for mode in ("normal", "show", "player")]


def ir_legs(engine: str) -> list[Leg]:
    folder = ROOT / "backend" / "sketches" / "ir-remote-fixtures"
    def leg(name: str, fqbn: str, tag: str, why: str | None = None) -> Leg:
        return Leg("ir", "compile-ir-smoke.py", engine, folder / f"{name}.ino", fqbn, tag, None, why)

    boot2 = "fbuild assembles RP2040 boot2 with a malformed -D (IR record)"
    renesas = "fbuild's Renesas core 1.2.2 misses <cstring> in IPAddress.cpp (IR record)"
    samd = "fbuild's atmelsam adapter omits ARDUINO_ARCH_SAMD on SAMD21 (IR record)"
    return [
        *(leg(name, "esp32:esp32:esp32s3", "esp32s3-rmt") for name in ("normal", "slideshow", "player", "learn")),
        *(leg(name, CLASSIC, "esp32") for name in ("normal", "slideshow", "player", "no-ir")),
        leg("normal", "arduino:avr:uno", "avr"),
        leg("normal", "arduino:megaavr:nona4809", "megaavr"),
        leg("normal", "esp8266:esp8266:nodemcuv2", "esp8266"),
        leg("normal", "teensy:avr:teensy41", "teensy"),
        leg("normal", "STMicroelectronics:stm32:blackpill_f411ce", "stm32"),
        leg("normal", "rp2040:rp2040:rpipico", "rp2040", boot2),
        leg("normal", "arduino:renesas_uno:unor4wifi", "renesas", renesas),
        leg("normal", "adafruit:samd:adafruit_feather_m0", "samd", samd),
        leg("no-ir", "adafruit:samd:adafruit_feather_m0", "samd", samd),
    ]


def time_of_flight_legs(engine: str) -> list[Leg]:
    # One real fbuild build of each closes the root-todo item for the pinned Pololu libraries.
    return [Leg(chip, "compile-presence-smoke.py", engine, ROOT / "backend" / "sketches" / f"{chip}-fixtures" / "normal.ino",
                CLASSIC, "esp32", "touchpad") for chip in ("vl53l0x", "vl53l1x")]


def ethernet_legs(engine: str) -> list[Leg]:
    folder = ROOT / "backend" / "sketches" / "ethernet-fixtures"
    targets = {"artnet": CLASSIC, "ntp": CLASSIC, "static": CLASSIC, "wifi": CLASSIC,
               "c3": "esp32:esp32:esp32c3", "c3-panel": "esp32:esp32:esp32c3",
               "s2": "esp32:esp32:esp32s2", "s3": "esp32:esp32:esp32s3"}
    return [Leg("ethernet", "compile-presence-smoke.py", engine, folder / f"{name}.ino", fqbn, fqbn.split(":")[2], "ethernet")
            for name, fqbn in targets.items()]


def power_switch_legs(engine: str) -> list[Leg]:
    folder = ROOT / "backend" / "sketches" / "power-switch-fixtures"
    targets = {name: CLASSIC for name in ("plain", "level-field", "level-wired", "gated", "mosfetti", "mixed")}
    targets |= {"gated-esp8266": "esp8266:esp8266:nodemcuv2", "mixed-esp8266": "esp8266:esp8266:nodemcuv2",
                "gated-rp2040": "rp2040:rp2040:rpipico", "mixed-rp2040": "rp2040:rp2040:rpipico",
                "gated-avr": "arduino:avr:uno", "mosfetti-avr": "arduino:avr:uno",
                "mixed-teensy": "teensy:avr:teensy41"}
    tags = {CLASSIC: "esp32", "esp8266:esp8266:nodemcuv2": "esp8266", "rp2040:rp2040:rpipico": "rp2040",
            "arduino:avr:uno": "avr", "teensy:avr:teensy41": "teensy"}
    return [Leg("power-switch", "compile-presence-smoke.py", engine, folder / f"{name}.ino", fqbn, tags[fqbn], "power-switch")
            for name, fqbn in targets.items()]


def plan() -> list[Leg]:
    """fbuild first (the toolchain-upgrade check), then the arduino-cli refresh."""
    return [
        *custom_board_legs("fbuild"), *display_legs("fbuild"), *ir_legs("fbuild"), *time_of_flight_legs("fbuild"),
        *ethernet_legs("fbuild"),
        *custom_board_legs("arduino-cli"), *display_legs("arduino-cli"), *ethernet_legs("arduino-cli"),
        *power_switch_legs("arduino-cli"),
    ]


GENERATORS = {"display": "display", "custom-board": "custom-board", "ir": "ir", "vl53l0x": "vl53l0x", "vl53l1x": "vl53l1x",
              "ethernet": "ethernet", "power-switch": "power-switch"}


def read_report(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def sizes(report: dict | None) -> tuple[int | None, int | None]:
    if not report:
        return None, None
    return (report.get("flash") or {}).get("usedBytes"), (report.get("ram") or {}).get("usedBytes")


def first_error(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    for pattern in (r"overflowed by [\d,]+ bytes", r"error: .+", r"build failed: .+", r"Error during build: .+"):
        match = re.search(pattern, text)
        if match:
            return match.group(0).strip()[:200]
    return ""


def tool_version(command: list[str]) -> str:
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
        return ((result.stdout or "") + (result.stderr or "")).strip().splitlines()[0]
    except (OSError, subprocess.SubprocessError, IndexError):
        return "unavailable"


def busy_compilers() -> list[str]:
    """Compiler processes that a new run must not overlap."""
    if sys.platform != "win32":
        return []
    names = ("arduino-cli.exe", "cc1.exe", "cc1plus.exe")
    try:
        listing = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True, check=False).stdout
    except OSError:
        return []
    return sorted({line.split(",")[0].strip('"') for line in listing.splitlines()
                   if line.split(",")[0].strip('"').lower() in names})


class KeepAwake:
    """Ask Windows not to sleep while the run holds this. Changes no settings."""

    def __enter__(self):
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)
        return self

    def __exit__(self, *_):
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def fmt_bytes(value: int | None) -> str:
    return "—" if value is None else f"{value:,}"


def fmt_delta(new: int | None, old: int | None) -> str:
    if new is None or old is None:
        return ""
    return f"{new - old:+,}"


def write_summary(out: Path, header: dict, rows: list[dict]) -> None:
    (out / "summary.json").write_text(json.dumps({**header, "legs": rows}, indent=2), encoding="utf-8")
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    lines = [
        "# Compile matrix",
        "",
        f"Started {header['started']}; {'finished ' + header['finished'] if header.get('finished') else 'still running or stopped'}.",
        "",
        f"- Git: `{header['git']}`",
        f"- fbuild: {header['fbuild']}",
        f"- arduino-cli: {header['arduino_cli']}",
        f"- Legs: {len(rows)} of {header['planned']}; " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())),
        "",
        "Baseline is the previous report for the same leg, from the engine version shown.",
        "",
        "| # | Leg | Engine | Status | Time | Flash | Δ flash | RAM | Δ RAM | Source | Baseline engine | Note |",
        "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['index']} | `{row['leg']}` | {row['engine']} | **{row['status']}** | {row['duration']} "
            f"| {fmt_bytes(row['flash'])} | {fmt_delta(row['flash'], row['baseline_flash'])} "
            f"| {fmt_bytes(row['ram'])} | {fmt_delta(row['ram'], row['baseline_ram'])} "
            f"| `{(row['source_sha256'] or '')[:12]}` | {row['baseline_engine'] or ''} | {row['note']} |")
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--engine", choices=("fbuild", "arduino-cli"), help="run only this engine's legs")
    parser.add_argument("--only", help="run only legs whose name contains this text, e.g. ir/ or custom-board/")
    parser.add_argument("--list", action="store_true", help="print the plan and exit")
    parser.add_argument("--dry-run", action="store_true", help="print each command without generating or compiling")
    parser.add_argument("--no-generate", action="store_true", help="compile the fixtures already on disk")
    args = parser.parse_args()

    legs = [leg for leg in plan()
            if (not args.engine or leg.engine == args.engine) and (not args.only or args.only in leg.name)]
    if args.list or args.dry_run:
        for index, leg in enumerate(legs, 1):
            expected = f"   (expected to fail: {leg.expected_failure})" if leg.expected_failure else ""
            print(f"{index:3} {leg.engine:11} {leg.name}{expected}")
            if args.dry_run:
                print("      " + " ".join(leg.command()))
        print(f"{len(legs)} legs")
        return 0

    busy = busy_compilers()
    if busy:
        print(f"Refusing to start: compiler processes are running ({', '.join(busy)}). "
              "Overlapping arduino-cli runs corrupt its cache. Wait for them to finish.")
        return 2

    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    out = ROOT / "artifacts" / "compile-matrix" / stamp
    (out / "legs").mkdir(parents=True, exist_ok=True)
    log = (out / "run.log").open("a", encoding="utf-8")

    def say(message: str) -> None:
        line = f"{datetime.now():%H:%M:%S} {message}"
        print(line, flush=True)
        log.write(line + "\n")
        log.flush()

    header = {
        "started": datetime.now().isoformat(timespec="seconds"),
        "git": tool_version(["git", "-C", str(ROOT), "log", "-1", "--format=%h %s"]),
        "fbuild": tool_version([toolchain._FBUILD_BIN, "--version"]) if toolchain._FBUILD_BIN else "not found",
        "arduino_cli": tool_version([toolchain._ARDUINO_CLI, "version"]) if toolchain._ARDUINO_CLI else "not found",
        "planned": len(legs),
    }
    pinned = re.search(r"^fbuild==(\S+)", (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8"), re.M)
    if pinned and pinned.group(1) not in header["fbuild"]:
        say(f"WARNING: installed {header['fbuild']} does not match the pinned fbuild=={pinned.group(1)}")
    say(f"Output: {out}")
    say(f"Git {header['git']} · {header['fbuild']} · {header['arduino_cli']}")

    rows: list[dict] = []
    failures = 0
    with KeepAwake():
        if not args.no_generate:
            for family in dict.fromkeys(leg.family for leg in legs):
                say(f"Generating {family} fixtures")
                result = subprocess.run(f"npm run gen:compile-fixtures -- {GENERATORS[family]}", shell=True, cwd=ROOT,
                                        capture_output=True, text=True, check=False)
                (out / "legs" / f"generate-{family}.txt").write_text(result.stdout + result.stderr, encoding="utf-8")
                if result.returncode != 0:
                    say(f"Generation of {family} failed; see legs/generate-{family}.txt. Stopping.")
                    write_summary(out, header, rows)
                    return 1

        for index, leg in enumerate(legs, 1):
            if (out / "STOP").exists():
                say("STOP file found; stopping before the next leg.")
                break
            baseline = read_report(leg.output(".json"))
            started = time.monotonic()
            started_utc = datetime.now(timezone.utc)
            say(f"[{index}/{len(legs)}] {leg.name} [{leg.engine}] starting")
            runner_log = out / "legs" / f"{index:03}-{leg.engine}-{leg.name.replace('/', '-').replace('@', '-')}.txt"
            with runner_log.open("w", encoding="utf-8") as handle:
                code = subprocess.run(leg.command(), cwd=ROOT, stdout=handle, stderr=subprocess.STDOUT, check=False).returncode
            seconds = int(time.monotonic() - started)

            report = read_report(leg.output(".json"))
            if report and datetime.fromisoformat(report.get("completed_utc", "1970-01-01T00:00:00+00:00")) < started_utc:
                report = None  # stale: the runner did not write a new one
            passed = code == 0 and bool(report) and report["result"][0] == 0
            build_log = leg.output(".log")
            if leg.expected_failure:
                status = "NOW PASSES" if passed else "expected fail"
            else:
                status = "PASS" if passed else ("FAIL" if report else "NO REPORT")
            note = leg.expected_failure if (leg.expected_failure and not passed) else ""
            if not passed and not leg.expected_failure:
                failures += 1
                note = first_error(build_log) or first_error(runner_log)
            if leg.engine == "fbuild" and "response file for the Windows command-length limit" in (
                    build_log.read_text(encoding="utf-8", errors="replace") if build_log.exists() else ""):
                note = (note + "; " if note else "") + "LVGL archive needed the §12 response-file recovery"
            flash, ram = sizes(report)
            old_flash, old_ram = sizes(baseline)
            rows.append({
                "index": index, "leg": leg.name, "engine": leg.engine, "status": status,
                "duration": f"{seconds // 60}m {seconds % 60:02}s", "exit_code": code,
                "flash": flash, "ram": ram, "baseline_flash": old_flash, "baseline_ram": old_ram,
                "baseline_engine": ((baseline or {}).get("toolchain") or {}).get("engine_version"),
                "source_sha256": (report or {}).get("source_sha256"), "fqbn": leg.fqbn,
                "build_log": display_path(build_log), "runner_output": display_path(runner_log),
                "note": note,
            })
            say(f"[{index}/{len(legs)}] {leg.name} [{leg.engine}] {status} in {rows[-1]['duration']}"
                + (f" · flash {fmt_bytes(flash)} ({fmt_delta(flash, old_flash) or 'no baseline'})" if flash else "")
                + (f" · {note}" if note else ""))
            write_summary(out, header, rows)

    header["finished"] = datetime.now().isoformat(timespec="seconds")
    write_summary(out, header, rows)
    say(f"Done: {len(rows)} legs, {failures} unexpected failure(s). Summary: {out / 'summary.md'}")
    log.close()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
