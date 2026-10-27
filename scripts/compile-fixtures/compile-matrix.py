"""Run the compile-fixture matrix serially and keep one log and summary.

Safe to leave running unattended. It never kills a compile: a killed or
overlapping arduino-cli run leaves a truncated cached object that fails the
next link. On Windows it asks the system to stay awake while it runs. It writes
the summary after every leg, so a partial run can still be read.

    python scripts/compile-fixtures/compile-matrix.py              # the necessary arduino-cli legs
    python scripts/compile-fixtures/compile-matrix.py --list --engine all   # the v1 freeze plan, both engines
    python scripts/compile-fixtures/compile-matrix.py --engine fbuild --retry-failed   # only what failed last time
    scripts\compile-fixtures\run-fbuild.cmd [--retry-failed]   # the fbuild run, from Explorer or a terminal
    python scripts/compile-fixtures/compile-matrix.py --only ir/ --only ethernet/ --dry-run
    python scripts/compile-fixtures/compile-matrix.py --only dead-code/   # the D-09 corpus
    python scripts/compile-fixtures/compile-matrix.py --only dead-code/ --every   # all of it, about 250 sketches
    python scripts/compile-fixtures/compile-matrix.py --only pattern-collections/   # D-10 render-buffer RAM
    python scripts/compile-fixtures/compile-matrix.py --only show-sequencing/   # D-11 weights, sequence, ramps
    python scripts/compile-fixtures/compile-matrix.py --only led-drivers/   # HW-32 step 7 Board LED drivers

The candidates are every fixture of every family, on arduino-cli and, for the
boards its scaffold declares, on fbuild. A run regenerates them, then keeps
only the legs that prove something no other kept leg proves on that engine
and board: a library, configuration or conditional, or on arduino-cli a
FastLED, core or library name (`necessary`, `coverage`); --every keeps them
all. The
legs run grouped by engine, board and library set, so each build cache fills
once (`build_order`).

Development runs on arduino-cli alone, so that is the default engine;
--engine fbuild or all adds fbuild.

To stop early, create a file named STOP in the run's output folder. The run
finishes the current compile and stops before the next one. To resume, rerun the
same filters with --resume <that run's folder> (repeatable): a leg is skipped only when it
passed there, its regenerated sketch is byte-for-byte the one that passed, and
its toolchain fingerprint matches (engine and cores, FastLED flags for its
board, every pinned library). So after a code change only the sketches it
changed rebuild, and after a pin or flag change only the boards it reaches.

    python scripts/compile-fixtures/compile-matrix.py --only dead-code/ --resume artifacts/compile-matrix/2026-10-15_2205 --low-priority

--low-priority runs at Windows below-normal priority, which the compilers it
starts inherit, so the desktop stays usable during a long run.

Results go to artifacts/compile-matrix/<timestamp>/: run.log, summary.md,
summary.json and each leg's runner output under legs/. Each runner also writes
its usual build log and JSON report beside the sketch. Before a leg runs, the
previous report for the same leg is read as a baseline, so the summary shows
size changes against the last recorded build (for example, after a toolchain
upgrade).
"""
from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass, replace
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
ESP8266 = "esp8266:esp8266:nodemcuv2"
UNO = "arduino:avr:uno"
ENGINES = ("arduino-cli", "fbuild")
DISPLAY_RUNNER_FQBN = S3  # compile-display-smoke.py's default board


@dataclass(frozen=True)
class Leg:
    family: str
    runner: str
    sketch: Path
    fqbn: str | None = None  # None uses the runner's default
    tag: str | None = None
    label: str | None = None
    engine: str = "arduino-cli"

    @property
    def name(self) -> str:
        return f"{self.family}/{self.sketch.stem}" + (f"@{self.tag}" if self.tag else "")

    @property
    def key(self) -> str:
        return f"{self.engine}:{self.name}"

    @property
    def board(self) -> str:
        return self.fqbn or DISPLAY_RUNNER_FQBN

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


def manifest_names(folder: Path, generator: str) -> list[str]:
    """The sketches a generator's manifest lists, generating them first if it has never run."""
    manifest = folder / "manifest.json"
    if not manifest.exists():
        subprocess.run(f"npm run gen:compile-fixtures -- {generator}", shell=True, cwd=ROOT,
                       capture_output=True, text=True, check=False)
    try:
        return sorted(json.loads(manifest.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return []


def display_legs() -> list[Leg]:
    folder = ROOT / "artifacts" / "display-compile"
    s3 = ["normal", "show", "player", "isolated-tft", "headless", "disabled", "multi-panel", "shared-design",
          "part-families", "part-families-i2c", "part-parallel", "telemetry",
          "ili9341-fixed", "ili9341-custom", "ili9341-show", "ili9341-player", "ili9341-calibration", "ili9341-sd-video",
          "template-led", "template-player"]
    return [
        *(Leg("display", "compile-display-smoke.py", folder / f"{name}.ino") for name in s3),
        *(Leg("display", "compile-display-smoke.py", folder / f"{name}.ino", CLASSIC, "classic")
          for name in ("classic-esp32-fixed", "classic-caption-level")),
        *(Leg("display", "compile-display-smoke.py", folder / f"{name}.ino", CLASSIC, "cyd")
          for name in ("cyd-run1", "cyd-custom", "cyd-custom-telemetry", "cyd-run2")),
    ]


def custom_board_legs() -> list[Leg]:
    folder = ROOT / "artifacts" / "custom-board-compile"
    return [Leg("custom-board", "compile-display-smoke.py", folder / f"{board}-{mode}.ino",
                CLASSIC if board == "esp32" else None)
            for board in ("esp32", "esp32s3") for mode in ("normal", "show", "player")]


def control_graph_legs() -> list[Leg]:
    folder = ROOT / "artifacts" / "control-graph-compile"
    return [Leg("control-graph", "compile-display-smoke.py", folder / f"{mode}.ino")
            for mode in ("normal", "show", "player", "show-ntp", "player-ntp", "show-ethernet")]


def ir_legs() -> list[Leg]:
    folder = ROOT / "backend" / "sketches" / "ir-remote-fixtures"
    def leg(name: str, fqbn: str, tag: str) -> Leg:
        return Leg("ir", "compile-ir-smoke.py", folder / f"{name}.ino", fqbn, tag)

    return [
        *(leg(name, "esp32:esp32:esp32s3", "esp32s3-rmt") for name in ("normal", "slideshow", "player", "learn")),
        *(leg(name, CLASSIC, "esp32") for name in ("normal", "normal-debug", "slideshow", "player", "no-ir")),
        leg("normal", UNO, "avr"),
        leg("normal", "arduino:megaavr:nona4809", "megaavr"),
        leg("normal", ESP8266, "esp8266"),
        leg("normal", "teensy:avr:teensy41", "teensy"),
        leg("normal", "STMicroelectronics:stm32:blackpill_f411ce", "stm32"),
        leg("normal", "rp2040:rp2040:rpipico", "rp2040"),
        leg("normal", "arduino:renesas_uno:unor4wifi", "renesas"),
        leg("normal", "adafruit:samd:adafruit_feather_m0", "samd"),
        leg("no-ir", "adafruit:samd:adafruit_feather_m0", "samd"),
    ]


def ethernet_legs() -> list[Leg]:
    folder = ROOT / "backend" / "sketches" / "ethernet-fixtures"
    targets = {"artnet": CLASSIC, "ntp": CLASSIC, "static": CLASSIC, "wifi": CLASSIC,
               "c3": "esp32:esp32:esp32c3", "c3-panel": "esp32:esp32:esp32c3",
               "s2": "esp32:esp32:esp32s2", "s3": "esp32:esp32:esp32s3"}
    return [Leg("ethernet", "compile-presence-smoke.py", folder / f"{name}.ino", fqbn, fqbn.split(":")[2], "ethernet")
            for name, fqbn in targets.items()]


def board_link_legs() -> list[Leg]:
    """D-13: both boards of each board-link bench run, cut from one root graph."""
    folder = ROOT / "artifacts" / "board-link-compile"
    targets = {"run1-board1-player": (S3, "s3"), "run1-board2-xc4630": (CLASSIC, "classic"),
               "run2-board1-player": (S3, "s3"), "run2-board2-oled-encoder": (CLASSIC, "classic"),
               "run3-board1-esp32": (CLASSIC, "classic"),
               "run3-board2-esp8266-remote": ("esp8266:esp8266:d1_mini", "esp8266"),
               "run4-board1-player-follows": (S3, "s3"),
               "run5-board2-esp8266-follows": ("esp8266:esp8266:d1_mini", "esp8266")}
    return [Leg("board-links", "compile-display-smoke.py", folder / f"{name}.ino", fqbn, tag)
            for name, (fqbn, tag) in targets.items()]


def power_switch_legs() -> list[Leg]:
    folder = ROOT / "backend" / "sketches" / "power-switch-fixtures"
    targets = {name: CLASSIC for name in ("plain", "level-field", "level-wired", "gated", "mosfetti", "mixed", "yynmos4")}
    targets |= {"gated-esp8266": ESP8266, "mixed-esp8266": ESP8266,
                "gated-rp2040": "rp2040:rp2040:rpipico", "mixed-rp2040": "rp2040:rp2040:rpipico",
                "gated-avr": UNO, "mosfetti-avr": UNO, "mixed-teensy": "teensy:avr:teensy41"}
    tags = {CLASSIC: "esp32", ESP8266: "esp8266", "rp2040:rp2040:rpipico": "rp2040", UNO: "avr",
            "teensy:avr:teensy41": "teensy"}
    return [Leg("power-switch", "compile-presence-smoke.py", folder / f"{name}.ino", fqbn, tags[fqbn], "power-switch")
            for name, fqbn in targets.items()]


def peripheral_legs() -> list[Leg]:
    """One leg per sketch of each peripheral gate, on the board its compile record names."""
    folders = {"buzzer": "buzzer", "cooling-fan": "cooling-fan", "darlington": "darlington", "dfplayer": "dfplayer",
               "distance": "distance-sensor", "encoder": "encoder", "environment": "environment-sensor",
               "ina226": "ina226", "joystick": "joystick", "keypad": "keypad", "light": "light-sensor",
               "motion": "motion-sensor", "presence": "presence-sensor", "pwm-driver": "pwm-driver", "ssr": "ssr",
               "temperature": "temperature-sensor", "touch-button": "touch-button", "touchpad": "touchpad",
               "vl53l0x": "vl53l0x", "vl53l1x": "vl53l1x"}
    uno = {"buzzer-passive-uno", "buzzer-passive-ir-uno"}
    legs = []
    for family, folder_name in folders.items():
        folder = ROOT / "backend" / "sketches" / f"{folder_name}-fixtures"
        for name in manifest_names(folder, family):
            fqbn, tag = (UNO, "uno") if name in uno else (CLASSIC, "esp32")
            legs.append(Leg(family, "compile-presence-smoke.py", folder / f"{name}.ino", fqbn, tag, family))
    for family, fqbn, tag in (("nano-esp32", "esp32:esp32:nano_nora", "nano-esp32"),
                              ("wt32-eth01", "esp32:esp32:wt32-eth01", "wt32-eth01")):
        legs.append(Leg(family, "compile-presence-smoke.py",
                        ROOT / "backend" / "sketches" / f"{family}-fixtures" / f"{family}.ino", fqbn, tag, family))
    return legs


def pattern_node_legs() -> list[Leg]:
    """Every pattern-node phase on classic ESP32; Phase 8 also on S3; the RAM-priced phases also on ESP8266."""
    folder = ROOT / "backend" / "sketches" / "pattern-node-fixtures"
    esp8266 = {"phase1", "phase5", "phase5-32", "phase6-16", "phase6-64", "phase9-ring", "phase9-string",
               "phase10-string", "phase10-ring", "phase10-matrix"}
    legs = []
    for name in manifest_names(folder, "pattern-node"):
        targets = [("esp32:esp32:esp32s3", "esp32s3")] if name.endswith("-s3") else [(CLASSIC, "esp32")]
        if name in esp8266:
            targets.append((ESP8266, "esp8266"))
        legs += [Leg("pattern-node", "compile-presence-smoke.py", folder / f"{name}.ino", fqbn, tag, "pattern-node")
                 for fqbn, tag in targets]
    return legs


def corpus_legs(family: str, folder_name: str) -> list[Leg]:
    """A generated corpus on the display runner's default board (dead-code, show-sequencing, pattern-collections)."""
    folder = ROOT / "artifacts" / folder_name
    return [Leg(family, "compile-display-smoke.py", folder / f"{name}.ino")
            for name in manifest_names(folder, family)]


def lanes_legs() -> list[Leg]:
    """HW-32 step 6: one LED output split across data pins, per board family."""
    folder = ROOT / "artifacts" / "lanes-compile"
    targets = {"esp32s3": (None, None), "esp32": (CLASSIC, "esp32"), "uno": (UNO, "avr")}
    return [Leg("lanes", "compile-display-smoke.py", folder / f"{name}.ino", *targets[name.split("-")[0]])
            for name in manifest_names(folder, "lanes")]


def led_driver_legs() -> list[Leg]:
    """HW-32 step 7: one sketch per Board LED driver and family, each on its own FQBN."""
    folder = ROOT / "artifacts" / "led-driver-compile"
    manifest_names(folder, "led-drivers")
    try:
        entries = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [Leg("led-drivers", "compile-display-smoke.py", folder / f"{name}.ino",
                entry["fqbn"], entry["fqbn"].split(":")[2])
            for name, entry in sorted(entries.items())]


# Boards built on arduino-cli alone, though the fbuild scaffold declares them.
ARDUINO_CLI_ONLY = {
    "esp32:esp32:esp32h2": "fbuild 2.5.45 has no esp32-h2-devkitc-1 board definition",
}


def candidates() -> list[Leg]:
    """Every fixture leg on both engines; fbuild only for boards its scaffold declares."""
    legs = [
        *display_legs(), *custom_board_legs(), *control_graph_legs(), *ir_legs(), *ethernet_legs(),
        *board_link_legs(), *power_switch_legs(), *peripheral_legs(), *pattern_node_legs(),
        *corpus_legs("dead-code", "dead-code-compile"),
        *corpus_legs("pattern-collections", "pattern-collections-compile"),
        *corpus_legs("show-sequencing", "show-sequencing-compile"),
        *lanes_legs(), *led_driver_legs(),
    ]
    fbuild_boards = set(toolchain._PIO_BOARDS) - set(ARDUINO_CLI_ONLY)
    return [replace(leg, engine=engine) for engine in ENGINES for leg in legs
            if engine == "arduino-cli" or ":".join(leg.board.split(":")[:3]) in fbuild_boards]


# The generator behind each family's fixtures.
GENERATORS = {"display": "display", "custom-board": "custom-board", "control-graph": "control-graph", "ir": "ir",
              "ethernet": "ethernet", "board-links": "board-links", "power-switch": "power-switch",
              "pattern-node": "pattern-node", "dead-code": "dead-code", "pattern-collections": "pattern-collections",
              "show-sequencing": "show-sequencing", "lanes": "lanes", "led-drivers": "led-drivers",
              **{family: family for family in (
                  "buzzer", "cooling-fan", "darlington", "dfplayer", "distance", "encoder", "environment", "ina226",
                  "joystick", "keypad", "light", "motion", "presence", "pwm-driver", "ssr", "temperature",
                  "touch-button", "touchpad", "vl53l0x", "vl53l1x", "nano-esp32", "wt32-eth01")}}

# Kept on arduino-cli whatever else covers them: these legs exist to read RAM.
MEASURED_FAMILIES = {"pattern-collections"}

_COMMENT = re.compile(r"/\*.*?\*/|//[^\n]*", re.S)
_STRING = re.compile(r'"(?:\\.|[^"\\])*"')
_NUMBER = re.compile(r"\b\d[\w.]*\b")
# C++ words and the fixed-width types every core provides, never a reason to build.
_CPP_WORDS = set("""
    if else for while do switch case return sizeof static const constexpr inline void int float bool char
    unsigned signed long short double auto struct class typedef enum break continue default true false
    uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t size_t nullptr new delete volatile
    template typename namespace using public private this operator extern
""".split())
# Names codegen makes up itself: node-derived values and buffers, and its own helpers.
_GENERATED = re.compile(r"_|n_|buf_|field_|paldef_")


def coverage(sketch: Path, engine: str) -> set[str] | None:
    """What a build of the sketch proves on that engine and board.

    Both engines: every preprocessor line, numbers aside, so each library,
    configuration macro and conditional a sketch brings is built once per
    board. On arduino-cli also every name the sketch takes from FastLED, the
    core or a library: functions it calls, methods, types and constants it
    did not define itself. A FastLED or core change breaks a build through one
    of those names, so each compiles at least once per board. The generated
    arithmetic around them is the unit and host tests' to prove.

    fbuild builds the same code against nearly the same cores (ESP32 3.3.9
    against arduino-cli's 3.3.11), and every fbuild-only failure so far was in
    its board environments, library selection, flags or link, so it gets the
    preprocessor lines alone."""
    try:
        text = _COMMENT.sub("", sketch.read_text(encoding="utf-8"))
    except OSError:
        return None
    lines = text.splitlines()
    proved = {_NUMBER.sub("0", " ".join(line.split())) for line in lines if line.strip().startswith("#")}
    if engine == "fbuild":
        return proved
    code = _STRING.sub('""', "\n".join(line for line in lines if not line.strip().startswith("#")))
    defined = set(re.findall(r"\b([A-Za-z_]\w*)\s*\([^;{)]*\)\s*(?:const\s*)?\{", code))
    defined |= set(re.findall(r"\b(?:struct|class|enum)\s+([A-Za-z_]\w*)", code))
    defined |= set(re.findall(r"^\s*#define\s+([A-Za-z_]\w*)", text, re.M))
    used = set(re.findall(r"\b([A-Za-z_]\w*)\s*[(<]", code))  # calls and templates
    used |= set(re.findall(r"(?:\.|->|::)\s*([A-Za-z_]\w*)", code))  # members
    used |= set(re.findall(r"\b([A-Z][A-Za-z0-9_]*)\b", code))  # types and constants (CRGB, HIGH)
    return proved | {name for name in used - defined - _CPP_WORDS if not _GENERATED.match(name)}


def includes(sketch: Path) -> tuple[str, ...]:
    try:
        return tuple(sorted(set(re.findall(r"^\s*#include\s*[<\"]([^>\"]+)", sketch.read_text(encoding="utf-8"), re.M))))
    except OSError:
        return ()


def necessary(legs: list[Leg]) -> list[Leg]:
    """The legs that prove something no other kept leg proves on that engine and board (`coverage`).

    Greedy cover per (engine, FQBN): take the sketch adding the most unproved
    items until every item is proved. A missing sketch is kept, since nothing
    can vouch for it."""
    groups: dict[tuple[str, str], list[Leg]] = {}
    for leg in legs:
        groups.setdefault((leg.engine, leg.board), []).append(leg)
    kept = []
    for members in groups.values():
        seen = {leg: coverage(leg.sketch, leg.engine) for leg in sorted(members, key=lambda leg: leg.name)}
        chosen = [leg for leg, lines in seen.items()
                  if lines is None or (leg.engine == "arduino-cli" and leg.family in MEASURED_FAMILIES)]
        covered = set().union(*(seen[leg] or set() for leg in chosen))
        rest = [leg for leg in seen if leg not in chosen]
        while rest:
            best = max(rest, key=lambda leg: len(seen[leg] - covered))
            if not seen[best] - covered:
                break
            chosen.append(best)
            covered |= seen[best]
            rest.remove(best)
        kept += chosen
    return kept


def build_order(legs: list[Leg]) -> list[Leg]:
    """Engine, then exact FQBN, then library set, so each build cache fills once.

    arduino-cli builds every fixture for one FQBN in one folder
    (fixture_workspace.py), and fbuild one environment per board, so a board's
    legs run back to back. arduino-cli also wipes a folder whose build options
    change, and the extra library folders a sketch brings are among them, so
    within a board the legs that include the same libraries run together."""
    return sorted(legs, key=lambda leg: (ENGINES.index(leg.engine), leg.board, includes(leg.sketch), leg.name))


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
    # The compiler's own `file:line:col: error:` first: fbuild wraps it in a
    # "build failed: ... failed to compile <unit>" line that names no cause.
    match = re.search(r"([^\s]+?\.\w+):(\d+):\d+: (?:fatal )?error: (.+)", text)
    if match:
        # File name and line, not the full path into the build tree.
        name = re.split(r"[/\\]", match.group(1))[-1]
        return f"{name}:{match.group(2)}: {match.group(3).strip()}"[:240]
    for pattern in (r"overflowed by [\d,]+ bytes", r"error: .+", r"build failed: .+", r"Error during build: .+"):
        match = re.search(pattern, text)
        if match:
            return match.group(0).strip()[:240]
    return ""


def core_list() -> str:
    """The installed Arduino cores and their versions, one `id version` per line."""
    if not toolchain._ARDUINO_CLI:
        return "not found"
    try:
        result = subprocess.run([toolchain._ARDUINO_CLI, "core", "list", "--json"], capture_output=True, text=True,
                                timeout=60, check=False)
        platforms = json.loads(result.stdout or "{}").get("platforms", [])
        return "; ".join(sorted(f"{entry.get('id')} {entry.get('installed_version') or entry.get('installed')}"
                                for entry in platforms))
    except (OSError, subprocess.SubprocessError, ValueError, AttributeError):
        return "unavailable"


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


def sketch_sha256(sketch: Path) -> str | None:
    """The hash the runners record, over the sketch as they read it."""
    try:
        return hashlib.sha256(sketch.read_text(encoding="utf-8").encode("utf-8")).hexdigest()
    except OSError:
        return None


def toolchain_fingerprint(leg: Leg, header: dict) -> str:
    """Everything outside the sketch that decides whether a leg's build passes.

    The engine and its version, the installed cores, the FastLED flags for the
    leg's board and every pinned library. A resumed pass carries only when this
    and the sketch both match, so a pin or flag change rebuilds the boards it
    reaches and a sketch change rebuilds that sketch alone."""
    engine = header["fbuild"] if leg.engine == "fbuild" else f"{header['arduino_cli']} | {header['arduino_cores']}"
    parts = [leg.engine, engine, toolchain._fastled_build_flags(leg.board), toolchain._FASTLED_VERSION,
             toolchain._LVGL_VERSION, toolchain._PLAYER_AUDIO_VERSION, toolchain._IRREMOTE_VERSION,
             toolchain._VL53L0X_VERSION, toolchain._VL53L1X_VERSION]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def resumable_passes(run_dir: Path) -> dict[str, dict]:
    """`Leg.key` to summary row for every leg that passed in a previous run."""
    summary = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
    return {f"{row['engine']}:{row['leg']}": row for row in summary.get("legs", [])
            if row.get("status") == "PASS" and row.get("source_sha256") and row.get("toolchain")}


def shard(legs: list[Leg], index: int, count: int) -> list[Leg]:
    """Shard `index` (1-based) of `count`, for runs split across machines.

    A board's legs stay together where they can, so each machine downloads the
    fewest toolchains and reuses its caches: the ordered plan is cut into runs
    of one board, each run split into pieces of at most an equal share, and
    the pieces dealt largest first to the shard with the fewest legs. Every
    machine computes the same plan from the same commit, so the shards
    partition it."""
    share = -(-len(legs) // count)
    pieces: list[list[Leg]] = []
    for leg in legs:
        if pieces and pieces[-1][0].board == leg.board and pieces[-1][0].engine == leg.engine and len(pieces[-1]) < share:
            pieces[-1].append(leg)
        else:
            pieces.append([leg])
    shards: list[list[Leg]] = [[] for _ in range(count)]
    for piece in sorted(pieces, key=len, reverse=True):
        min(shards, key=len).extend(piece)
    return build_order(shards[index - 1])


def merge_runs(run_dirs: list[Path], out: Path) -> int:
    """One record from several shard runs, rows renumbered.

    A shard's run folder sits at `<shard root>/artifacts/compile-matrix/<stamp>`
    beside that shard's logs, so each log path is rewritten from the shard
    root, as the merged record's reader finds it."""
    summaries = [json.loads((run_dir / "summary.json").read_text(encoding="utf-8")) for run_dir in run_dirs]
    roots = [run_dir.parents[2] if run_dir.parent.name == "compile-matrix" else run_dir for run_dir in run_dirs]
    header = {key: value for key, value in summaries[0].items() if key != "legs"}
    header["planned"] = sum(summary.get("planned", 0) for summary in summaries)
    header["shards"] = [root.name for root in roots]

    def from_root(root: Path, path: str) -> str:
        return f"{root.as_posix()}/{path.replace(chr(92), '/')}"

    rows = [{**row, "shard": root.name, "build_log": from_root(root, row["build_log"]),
             "runner_output": from_root(root, row["runner_output"])}
            for root, summary in zip(roots, summaries) for row in summary.get("legs", [])]
    rows.sort(key=lambda row: (ENGINES.index(row["engine"]), board_of(row["fqbn"]), row["leg"]))
    for index, row in enumerate(rows, 1):
        row["index"] = index
    out.mkdir(parents=True, exist_ok=True)
    write_summary(out, header, rows)
    passed = sum(row["status"] == "PASS" for row in rows)
    print(f"Merged {len(run_dirs)} shards: {passed} passed, {len(rows) - passed} failed, "
          f"{header['planned'] - len(rows)} not run, of {header['planned']}.")
    for row in rows:
        if row["status"] != "PASS":
            print(f"  FAILED {row['leg']} on {board_of(row['fqbn'])}: {row['note'] or 'no error line found'}")
    return 0 if passed == header["planned"] else 1


def latest_run(engine: str) -> Path | None:
    """The newest run folder whose legs are all on `engine` (or both engines, for all)."""
    wanted = set(ENGINES) if engine == "all" else {engine}
    for run_dir in sorted((ROOT / "artifacts" / "compile-matrix").glob("*/"), reverse=True):
        try:
            legs = json.loads((run_dir / "summary.json").read_text(encoding="utf-8")).get("legs", [])
        except (OSError, ValueError):
            continue
        if legs and {row.get("engine") for row in legs} <= wanted:
            return run_dir
    return None


def board_of(fqbn: str | None) -> str:
    return (fqbn or DISPLAY_RUNNER_FQBN).split(":")[2]


def outcome_line(index: int, total: int, row: dict) -> str:
    """One finished build: what it was for, the result, how long, how big."""
    size = (f"flash {fmt_bytes(row['flash'])} B, RAM {fmt_bytes(row['ram'])} B" if row["flash"] is not None
            else "no size")
    line = f"[{index}/{total}] {row['leg']} on {board_of(row['fqbn'])}: {row['status']} in {row['duration']}, {size}"
    if row["status"] != "PASS":
        line += f"\n      {row['note'] or 'no error line found'}\n      log: {row['build_log']}"
    return line


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
        f"- Legs: {len(rows)} of {header.get('planned', 'unplanned')}; " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())),
        "",
    ]
    failed = [row for row in rows if row["status"] != "PASS"]
    if failed:
        lines += ["## Failed", "",
                  *(f"- `{row['leg']}` on {board_of(row['fqbn'])} ({row['engine']}): {row['note'] or 'no error line found'}."
                    f" Log: `{row['build_log']}`" for row in failed),
                  "", "After fixing them, rebuild only these (passes carry over):", "",
                  f"    python scripts/compile-fixtures/compile-matrix.py --engine {header.get('engine', 'fbuild')} --retry-failed",
                  ""]
    lines += [
        "Baseline is the previous report for the same leg, from the engine version shown.",
        "",
        "| # | Leg | Board | Engine | Status | Time | Flash | Δ flash | RAM | Δ RAM | Source | Baseline engine | Note |",
        "| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['index']} | `{row['leg']}` | {board_of(row['fqbn'])} | {row['engine']} | **{row['status']}** | {row['duration']} "
            f"| {fmt_bytes(row['flash'])} | {fmt_delta(row['flash'], row['baseline_flash'])} "
            f"| {fmt_bytes(row['ram'])} | {fmt_delta(row['ram'], row['baseline_ram'])} "
            f"| `{(row['source_sha256'] or '')[:12]}` | {row['baseline_engine'] or ''} | {row['note']} |")
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--engine", choices=("arduino-cli", "fbuild", "all"), default="arduino-cli",
                        help="run only this engine's legs (default arduino-cli)")
    parser.add_argument("--only", action="append",
                        help="run only legs whose name contains this text, e.g. ir/ or custom-board/; repeatable")
    parser.add_argument("--list", action="store_true", help="print the plan and exit")
    parser.add_argument("--dry-run", action="store_true", help="print each command without generating or compiling")
    parser.add_argument("--no-generate", action="store_true", help="compile the fixtures already on disk")
    parser.add_argument("--every", action="store_true",
                        help="run every candidate leg, not only the ones that compile something new")
    parser.add_argument("--resume", type=Path, action="append", metavar="RUN_DIR",
                        help="skip legs that passed in that run with an identical sketch (resume after STOP);"
                             " repeatable, later runs winning")
    parser.add_argument("--shard", metavar="I/N",
                        help="run only shard I of N of the plan (1-based), for runs split across machines")
    parser.add_argument("--merge", type=Path, nargs="+", metavar="RUN_DIR",
                        help="write one summary from these shard run folders into --merge-out, then exit")
    parser.add_argument("--merge-out", type=Path, default=ROOT / "artifacts" / "compile-matrix" / "merged")
    parser.add_argument("--retry-failed", action="store_true",
                        help="resume the newest earlier run on this engine: rebuild only what failed, did not run,"
                             " or changed since; carry every other pass")
    parser.add_argument("--low-priority", action="store_true",
                        help="run at below-normal priority on Windows; spawned compilers inherit it")
    args = parser.parse_args()
    if args.merge:
        return merge_runs(args.merge, args.merge_out)
    if args.retry_failed:
        previous = latest_run(args.engine)
        if previous is None:
            print(f"No earlier {args.engine} run to retry.")
            return 2
        args.resume = [*(args.resume or []), previous]

    wanted = [leg for leg in candidates()
              if args.engine in ("all", leg.engine) and (not args.only or any(text in leg.name for text in args.only))]

    def plan() -> list[Leg]:
        legs = build_order(wanted if args.every else necessary(wanted))
        if args.shard:
            index, count = (int(part) for part in args.shard.split("/"))
            legs = shard(legs, index, count)
        return legs

    if args.list or args.dry_run:
        # Judged from the fixtures on disk; a run regenerates them first.
        legs = plan()
        for index, leg in enumerate(legs, 1):
            print(f"{index:3} {leg.engine:11} {leg.board.split(':')[2]:22} {leg.name}")
            if args.dry_run:
                print("      " + " ".join(leg.command()))
        per_engine = ", ".join(f"{engine} {sum(leg.engine == engine for leg in legs)}"
                               for engine in ENGINES if any(leg.engine == engine for leg in legs))
        print(f"{len(legs)} legs of {len(wanted)} candidates ({per_engine})")
        return 0

    if args.low_priority and sys.platform == "win32":
        import ctypes
        BELOW_NORMAL_PRIORITY_CLASS = 0x4000
        ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS)

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
        "arduino_cores": core_list(),
        "engine": args.engine,
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
            for family in dict.fromkeys(leg.family for leg in wanted):
                say(f"Generating {family} fixtures")
                result = subprocess.run(f"npm run gen:compile-fixtures -- {GENERATORS[family]}", shell=True, cwd=ROOT,
                                        capture_output=True, text=True, check=False)
                (out / "legs" / f"generate-{family}.txt").write_text(result.stdout + result.stderr, encoding="utf-8")
                if result.returncode != 0:
                    say(f"Generation of {family} failed; see legs/generate-{family}.txt. Stopping.")
                    write_summary(out, header, rows)
                    return 1

        # The cover is judged on the sketches as just generated.
        legs = plan()
        header["planned"] = len(legs)
        say(f"Plan: {len(legs)} legs of {len(wanted)} candidates")

        resumed: dict[str, dict] = {}
        for run_dir in args.resume or []:
            resumed.update(resumable_passes(run_dir))
        if args.resume:
            say(f"Resuming {', '.join(display_path(run_dir) for run_dir in args.resume)}: "
                f"{len(resumed)} passed legs on record")
        for index, leg in enumerate(legs, 1):
            carried = resumed.get(leg.key)
            if (carried and carried["source_sha256"] == sketch_sha256(leg.sketch)
                    and carried["toolchain"] == toolchain_fingerprint(leg, header)):
                # Carried into this summary so it reads as the whole corpus.
                rows.append({**carried, "index": index,
                             "note": "carried from a resumed run; sketch and toolchain unchanged"})
                say(f"[{index}/{len(legs)}] {leg.name} on {leg.board.split(':')[2]}: passed before, unchanged, not rebuilt")
                continue
            if (out / "STOP").exists():
                say("STOP file found; stopping before the next leg.")
                break
            baseline = read_report(leg.output(".json"))
            started = time.monotonic()
            started_utc = datetime.now(timezone.utc)
            say(f"[{index}/{len(legs)}] {leg.name} on {leg.board.split(':')[2]} ({leg.engine}): building")
            runner_log = out / "legs" / f"{index:03}-{leg.engine}-{leg.name.replace('/', '-').replace('@', '-')}.txt"
            with runner_log.open("w", encoding="utf-8") as handle:
                code = subprocess.run(leg.command(), cwd=ROOT, stdout=handle, stderr=subprocess.STDOUT, check=False).returncode
            seconds = int(time.monotonic() - started)

            report = read_report(leg.output(".json"))
            if report and datetime.fromisoformat(report.get("completed_utc", "1970-01-01T00:00:00+00:00")) < started_utc:
                report = None  # stale: the runner did not write a new one
            passed = code == 0 and bool(report) and report["result"][0] == 0
            build_log = leg.output(".log")
            status = "PASS" if passed else ("FAIL" if report else "NO REPORT")
            note = ""
            if not passed:
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
                "toolchain": toolchain_fingerprint(leg, header),
                "build_log": display_path(build_log), "runner_output": display_path(runner_log),
                "note": note,
            })
            say(outcome_line(index, len(legs), rows[-1]))
            write_summary(out, header, rows)

    header["finished"] = datetime.now().isoformat(timespec="seconds")
    write_summary(out, header, rows)
    passed = sum(row["status"] == "PASS" for row in rows)
    say(f"Done: {passed} passed, {len(rows) - passed} failed, {len(legs) - len(rows)} not run, of {len(legs)}.")
    for row in rows:
        if row["status"] != "PASS":
            say(f"  FAILED {row['leg']} on {board_of(row['fqbn'])}: {row['note'] or 'no error line found'}")
    if passed < len(legs):
        say(f"Rebuild only the rest: python scripts/compile-fixtures/compile-matrix.py --engine {args.engine} --retry-failed")
    say(f"Record: {out / 'summary.md'}")
    log.close()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
