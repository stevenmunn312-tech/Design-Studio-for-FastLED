#!/usr/bin/env python3
"""Import Blender board assets into the app's board capability data.

Reads each `<asset-root>/<profile-id>/board.json`, normalises it, converts the
raw Cycles PNG render to WebP, and emits a generated TypeScript module that
`boardProfiles.ts` merges into its hand-authored profiles.

    python scripts/import-board-assets.py "C:/Users/User/Desktop/Blender Assets/Boards"

Why a merge rather than a wholesale generation: the existing profiles carry
hand-checked pin maps and anchors that are covered by tests and, for several
boards, confirmed against hardware in hand. This importer adds capability data
(pin safety, peripheral starting pins, processor/memory, render) and leaves
those maps alone.

## Pin attribution is deliberately conservative

The asset set uses ~28 different key names for pin safety across boards, with
three value shapes: token lists (`["GPIO2", "D12/GPIO12"]`), pin-keyed dicts
(`{"GPIO19-GPIO20": "Native USB"}`), and free prose.

Only the first two are attributed to pins. Prose is carried as a displayed note
and never parsed for pin numbers, because prose routinely mentions a pin in
order to say it is *fine*:

    "GPIO16 and GPIO17 are reserved on ESP32-WROVER modules; they are
     available on WROOM/WROOM-32D boards."

Mining that sentence would mark GPIO16/17 unusable on a WROOM board, which is
worse than having no data. Protection comes from the allowlist instead: a pin
absent from `safeGeneralPurpose` reports as `unknown`, never `safe`.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

REPO = Path(__file__).resolve().parent.parent
OUT_TS = REPO / "src" / "build" / "generated" / "boardCapabilityData.ts"
OUT_RENDERS = REPO / "public" / "boards"

# Widest the render is ever displayed, doubled for high-DPI. The raw Cycles
# output is ~800x1600 and 1 MB; this keeps it sharp at a fraction of the bytes.
RENDER_MAX_W = 700
WEBP_QUALITY = 82

# --- Safety vocabulary -------------------------------------------------------
# Every key below carries pin *identifiers*, either as a list of tokens or as a
# dict keyed by token/range. Keys not listed here are prose and become notes.
SAFE_KEYS = ("safeGeneralPurpose", "generallyConvenientDigitalPins")
# `bootCaution` is a token list on some boards and prose sentences on others.
# Both are safe to list here: gpios_in_token() rejects anything sentence-shaped,
# so the prose form contributes nothing rather than mis-attributing.
CAUTION_KEYS = ("bootStrappingCaution", "bootCaution", "inputOnly",
                "useWithCaution", "boardSpecificCautions")
RESERVED_KEYS = (
    "moduleUnavailable", "boardReservedOrNotExposed",
    "avoidOrUnavailable", "onboardNotOnMainLogicRails",
)
# Prose that explains a structured list, pulled in as the reason for its pins.
NOTE_FOR = {
    "bootStrappingCaution": "bootStrappingNote",
    "inputOnly": "inputOnlyNote",
    "moduleUnavailable": "moduleUnavailableNote",
}

GPIO_TOKEN = re.compile(r"GPIO\s*(\d+)", re.I)


def gpios_in_token(token: str) -> list[int]:
    """GPIO numbers named by a single identifier or range.

    Handles "GPIO7", "D8 / GPIO7", "A2/GPIO34", "GPIO19-GPIO20", "GPIO11-GPIO14".
    Returns [] for anything sentence-shaped, which is how prose is rejected.
    """
    # A token is short and has no sentence punctuation. Anything longer is prose
    # that happens to sit in a list, and must not be attributed.
    if len(token) > 40 or "." in token or "," in token:
        return []
    found = [int(m) for m in GPIO_TOKEN.findall(token)]
    if not found:
        return []
    # "GPIO19-GPIO20" and "GPIO11-GPIO14" are inclusive ranges. A token like
    # "D8 / GPIO7" also yields one number, so only expand on a real dash range.
    if len(found) == 2 and re.search(r"\d\s*[-–]\s*(GPIO)?\s*\d", token, re.I):
        lo, hi = sorted(found)
        if hi - lo <= 32:
            return list(range(lo, hi + 1))
    return found


def collect(section: dict, keys: tuple[str, ...]) -> dict[int, str]:
    """Pin -> reason for every structured entry under `keys`."""
    out: dict[int, str] = {}
    for key in keys:
        value = section.get(key)
        if value is None:
            continue
        shared_note = section.get(NOTE_FOR.get(key, ""), "") if isinstance(section, dict) else ""
        if isinstance(value, dict):
            for token, reason in value.items():
                for gpio in gpios_in_token(str(token)):
                    out.setdefault(gpio, str(reason))
        elif isinstance(value, list):
            for item in value:
                for gpio in gpios_in_token(str(item)):
                    out.setdefault(gpio, shared_note or key)
    return out


def prose_notes(section: dict) -> list[str]:
    """Free-text safety commentary, shown to the user but never parsed for pins."""
    structured = set(SAFE_KEYS + CAUTION_KEYS + RESERVED_KEYS) | set(NOTE_FOR.values())
    notes: list[str] = []
    for key, value in section.items():
        if key in structured:
            continue
        if isinstance(value, str):
            notes.append(value)
        elif isinstance(value, list):
            notes.extend(str(v) for v in value if isinstance(v, str))
        elif isinstance(value, dict):
            notes.extend(f"{k}: {v}" for k, v in value.items())
    return notes


def expansion_pins(board: dict) -> dict[int, str]:
    """Pins that live on an expansion rail rather than a main header.

    A manifest can contradict itself here, and one does: the XIAO ESP32S3 lists
    GPIO39-42 in `safeGeneralPurpose` while its own `rails.bottomExpansion`
    groups them as underside pads, which is exactly the "valid on the chip,
    unreachable on the board" trap this data exists to close. The rail
    structure is the more reliable of the two, so it wins.
    """
    rails = board.get("rails")
    out: dict[int, str] = {}
    if not isinstance(rails, dict):
        return out
    for name, rail in rails.items():
        if not re.search(r"expansion|underside|pad", str(name), re.I):
            continue
        labels = rail.get("labelsTopToBottom") or rail.get("labelsLeftToRight") or [] \
            if isinstance(rail, dict) else rail
        for label in labels if isinstance(labels, list) else []:
            for gpio in gpios_in_token(str(label)):
                out[gpio] = f"On the {name} rail, not a main header pin."
    return out


def build_safety(board: dict) -> tuple[dict | None, list[str]]:
    section = board.get("pinSafetySummary")
    if not isinstance(section, dict):
        return None, []
    safe = sorted(collect(section, SAFE_KEYS))
    caution = collect(section, CAUTION_KEYS)
    reserved = collect(section, RESERVED_KEYS)
    # Rail structure overrides the allowlist — see expansion_pins().
    reserved.update(expansion_pins(board))
    # A pin cannot be both. Reserved is the strongest claim and wins, then
    # caution — the app's own validator rejects overlaps, so resolve here.
    caution = {g: r for g, r in caution.items() if g not in reserved}
    safe = [g for g in safe if g not in reserved and g not in caution]
    return {"safeGeneralPurpose": safe, "useWithCaution": caution,
            "boardReservedOrNotExposed": reserved}, prose_notes(section)


def first_gpio(value) -> int | None:
    nums = gpios_in_token(str(value))
    return nums[0] if nums else None


def build_peripherals(board: dict) -> dict | None:
    section = board.get("commonPeripheralStartingPoints")
    if not isinstance(section, dict):
        return None
    out: dict = {}

    mic = section.get("INMP441")
    if isinstance(mic, dict):
        # Key names vary by board: BCLK_SCK vs SCK_BCLK vs BCLK, SD_DOUT vs SD.
        ws = first_gpio(mic.get("WS_LRCLK") or mic.get("WS") or "")
        sck = first_gpio(mic.get("BCLK_SCK") or mic.get("SCK_BCLK") or mic.get("SCK") or mic.get("BCLK") or "")
        sd = first_gpio(mic.get("SD_DOUT") or mic.get("SD") or mic.get("DOUT") or "")
        if None not in (ws, sck, sd):
            out["inmp441"] = {"wsLrclk": ws, "sckBclk": sck, "sdDout": sd}

    amp = section.get("MAX98357") or section.get("MAX98357A")
    if isinstance(amp, dict):
        bclk, lrc, din = (first_gpio(amp.get(k) or "") for k in ("BCLK", "LRC", "DIN"))
        if None not in (bclk, lrc, din):
            out["max98357"] = {"bclk": bclk, "lrc": lrc, "din": din}

    led = section.get("FastLEDData") or section.get("FastLED")
    if isinstance(led, dict):
        default = first_gpio(led.get("recommendedDefault") or "")
        if default is not None:
            alts = [g for a in (led.get("commonAlternatives") or []) if (g := first_gpio(a)) is not None]
            entry = {"recommendedDefault": default, "commonAlternatives": alts}
            if led.get("selectionNote"):
                entry["selectionNote"] = str(led["selectionNote"])
            out["fastLedData"] = entry

    return out or None


def convert_render(folder: Path, board: dict, profile_id: str) -> dict | None:
    render = board.get("render") or {}
    name = render.get("file") or f"{profile_id}.png"
    src = folder / name
    if not src.is_file():
        return None
    OUT_RENDERS.mkdir(parents=True, exist_ok=True)
    dest = OUT_RENDERS / f"{profile_id}.webp"
    with Image.open(src) as img:
        img = img.convert("RGBA")
        if img.width > RENDER_MAX_W:
            h = round(img.height * RENDER_MAX_W / img.width)
            img = img.resize((RENDER_MAX_W, h), Image.LANCZOS)
        img.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
        return {"file": f"boards/{profile_id}.webp", "widthPx": img.width, "heightPx": img.height}


def ts_literal(value, indent: int = 2) -> str:
    pad = " " * indent
    if isinstance(value, dict):
        if not value:
            return "{}"
        rows = []
        for k, v in value.items():
            key = k if re.fullmatch(r"[A-Za-z_$][\w$]*", str(k)) else json.dumps(str(k))
            rows.append(f"{pad}  {key}: {ts_literal(v, indent + 2)},")
        return "{\n" + "\n".join(rows) + f"\n{pad}}}"
    if isinstance(value, list):
        if not value:
            return "[]"
        if all(isinstance(v, (int, float)) for v in value):
            return "[" + ", ".join(str(v) for v in value) + "]"
        rows = [f"{pad}  {ts_literal(v, indent + 2)}," for v in value]
        return "[\n" + "\n".join(rows) + f"\n{pad}]"
    if isinstance(value, str):
        return json.dumps(value)
    return json.dumps(value)


def main() -> int:
    if len(sys.argv) < 2:
        return int(bool(sys.exit(__doc__)))
    root = Path(sys.argv[1])
    if not root.is_dir():
        sys.exit(f"Not a directory: {root}")

    imported: dict[str, dict] = {}
    skipped: list[str] = []

    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        manifest = folder / "board.json"
        if not manifest.is_file():
            skipped.append(f"{folder.name}: no board.json")
            continue
        try:
            board = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            skipped.append(f"{folder.name}: unparseable board.json ({exc})")
            continue

        profile_id = board.get("boardProfileId") or board.get("profileId") or folder.name
        entry: dict = {}

        safety, notes = build_safety(board)
        if safety:
            entry["pinSafety"] = safety
        if notes:
            entry["safetyNotes"] = notes

        peripherals = build_peripherals(board)
        if peripherals:
            entry["peripheralPins"] = peripherals

        if isinstance(board.get("processor"), str):
            entry["processor"] = board["processor"]
        mem = board.get("memory")
        if isinstance(mem, dict) and "flashMb" in mem:
            entry["memory"] = {"flashMb": mem["flashMb"], "psramMb": mem.get("psramMb", 0)}

        render = convert_render(folder, board, profile_id)
        if render:
            entry["render"] = render

        if not entry:
            skipped.append(f"{folder.name}: nothing importable")
            continue
        imported[profile_id] = entry

    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    rows = "\n".join(
        f"  {json.dumps(pid)}: {ts_literal(entry, 2)},"
        for pid, entry in sorted(imported.items()))
    OUT_TS.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Produced by scripts/import-board-assets.py from the Blender board assets.\n"
        "// Merged into BOARD_PROFILES by boardProfiles.ts; hand-authored pin maps win.\n"
        "\n"
        "import type { BoardCapabilityData } from '../boardCapabilities'\n"
        "\n"
        "export const BOARD_CAPABILITY_DATA: Record<string, BoardCapabilityData> = {\n"
        f"{rows}\n"
        "}\n",
        encoding="utf-8")

    print(f"imported {len(imported)} board(s) -> {OUT_TS.relative_to(REPO)}")
    for pid, entry in sorted(imported.items()):
        bits = []
        if "pinSafety" in entry:
            s = entry["pinSafety"]
            bits.append(f"{len(s['safeGeneralPurpose'])} safe / "
                        f"{len(s['useWithCaution'])} caution / "
                        f"{len(s['boardReservedOrNotExposed'])} reserved")
        if "peripheralPins" in entry:
            bits.append(f"{len(entry['peripheralPins'])} peripheral(s)")
        if "render" in entry:
            bits.append(f"render {entry['render']['widthPx']}x{entry['render']['heightPx']}")
        print(f"  {pid}: {'; '.join(bits) or 'no capability data'}")
    for line in skipped:
        print(f"  SKIPPED {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
