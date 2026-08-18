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
SAFE_KEYS = (
    "safeGeneralPurpose", "generallyConvenientDigitalPins",
    "preferredGeneralPurpose", "alwaysSafeGeneralPurpose",
    "usableWithPeripheralAwareness",
)
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


def gpios_in_board_token(token: str, aliases: dict[str, int]) -> list[int]:
    """GPIO numbers in one manifest token, including board-level aliases.

    Newer manifests carry explicit `gpioMap` tables because their silkscreens
    use names such as D6, A4, SDA, and GP28 instead of GPIO numbers. Keep the
    same conservative sentence rejection as `gpios_in_token`: aliases are only
    resolved from a short identifier or slash-delimited pin label, never prose.
    """
    direct = gpios_in_token(token)
    if direct:
        return direct
    if len(token) > 40 or "." in token or "," in token:
        return []
    resolved: list[int] = []
    candidates = [token, *(part.strip() for part in token.split("/"))]
    for candidate in candidates:
        # A trailing tilde is the common PWM marker on Arduino pin labels.
        normalised = candidate.strip().rstrip("~")
        if normalised in aliases and aliases[normalised] not in resolved:
            resolved.append(aliases[normalised])
    return resolved


def collect(section: dict, keys: tuple[str, ...], aliases: dict[str, int]) -> dict[int, str]:
    """Pin -> reason for every structured entry under `keys`."""
    out: dict[int, str] = {}
    for key in keys:
        value = section.get(key)
        if value is None:
            continue
        shared_note = section.get(NOTE_FOR.get(key, ""), "") if isinstance(section, dict) else ""
        if isinstance(value, dict):
            for token, reason in value.items():
                for gpio in gpios_in_board_token(str(token), aliases):
                    out.setdefault(gpio, str(reason))
        elif isinstance(value, list):
            for item in value:
                for gpio in gpios_in_board_token(str(item), aliases):
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


def expansion_pins(board: dict, aliases: dict[str, int]) -> dict[int, str]:
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
            for gpio in gpios_in_board_token(str(label), aliases):
                out[gpio] = f"On the {name} rail, not a main header pin."
    return out


def build_safety(board: dict) -> tuple[dict | None, list[str]]:
    section = board.get("pinSafetySummary")
    if not isinstance(section, dict):
        return None, []
    aliases = alias_map(board)
    safe = sorted(collect(section, SAFE_KEYS, aliases))
    caution = collect(section, CAUTION_KEYS, aliases)
    reserved = collect(section, RESERVED_KEYS, aliases)
    # Rail structure overrides the allowlist — see expansion_pins().
    reserved.update(expansion_pins(board, aliases))
    # A pin cannot be both. Reserved is the strongest claim and wins, then
    # caution — the app's own validator rejects overlaps, so resolve here.
    caution = {g: r for g, r in caution.items() if g not in reserved}
    safe = [g for g in safe if g not in reserved and g not in caution]
    return {"safeGeneralPurpose": safe, "useWithCaution": caution,
            "boardReservedOrNotExposed": reserved}, prose_notes(section)


def first_gpio(value, aliases: dict[str, int] | None = None) -> int | None:
    nums = gpios_in_board_token(str(value), aliases or {})
    return nums[0] if nums else None


def build_peripherals(board: dict) -> dict | None:
    section = board.get("commonPeripheralStartingPoints")
    if not isinstance(section, dict):
        return None
    out: dict = {}
    aliases = alias_map(board)

    mic = section.get("INMP441")
    if isinstance(mic, dict):
        # Key names vary by board: BCLK_SCK vs SCK_BCLK vs BCLK, SD_DOUT vs SD.
        ws = first_gpio(mic.get("WS_LRCLK") or mic.get("WS") or "", aliases)
        sck = first_gpio(mic.get("BCLK_SCK") or mic.get("SCK_BCLK") or mic.get("SCK") or mic.get("BCLK") or "", aliases)
        sd = first_gpio(mic.get("SD_DOUT") or mic.get("SD") or mic.get("DOUT") or "", aliases)
        if None not in (ws, sck, sd):
            out["inmp441"] = {"wsLrclk": ws, "sckBclk": sck, "sdDout": sd}

    amp = section.get("MAX98357") or section.get("MAX98357A")
    if isinstance(amp, dict):
        bclk, lrc, din = (first_gpio(amp.get(k) or "", aliases) for k in ("BCLK", "LRC", "DIN"))
        if None not in (bclk, lrc, din):
            out["max98357"] = {"bclk": bclk, "lrc": lrc, "din": din}

    led = section.get("FastLEDData") or section.get("FastLED")
    if isinstance(led, dict):
        default = first_gpio(led.get("recommendedDefault") or "", aliases)
        if default is not None:
            alts = [g for a in (led.get("commonAlternatives") or []) if (g := first_gpio(a, aliases)) is not None]
            entry = {"recommendedDefault": default, "commonAlternatives": alts}
            if led.get("selectionNote"):
                entry["selectionNote"] = str(led["selectionNote"])
            out["fastLedData"] = entry

    # Defaults are presented as a set that can be used together. Some source
    # manifests document alternative shared-bus wiring in prose, but the app's
    # compact summary has no way to communicate that mode switch. Prefer the
    # microphone, then keep only disjoint amplifier and LED defaults.
    used: set[int] = set()
    mic_entry = out.get("inmp441")
    if mic_entry:
        used.update(mic_entry.values())
    amp_entry = out.get("max98357")
    if amp_entry:
        amp_pins = set(amp_entry.values())
        if amp_pins & used:
            del out["max98357"]
        else:
            used.update(amp_pins)
    led_entry = out.get("fastLedData")
    if led_entry and led_entry["recommendedDefault"] in used:
        replacement = next((pin for pin in led_entry["commonAlternatives"] if pin not in used), None)
        if replacement is None:
            del out["fastLedData"]
        else:
            led_entry["recommendedDefault"] = replacement

    return out or None


def convert_render(folder: Path, board: dict, profile_id: str) -> dict | None:
    render = board.get("render") or {}
    name = render.get("file") or f"{profile_id}.png"
    src = folder / name
    if not src.is_file():
        return None
    OUT_RENDERS.mkdir(parents=True, exist_ok=True)
    dest = OUT_RENDERS / f"{profile_id}.webp"
    # A full catalogue import is intentionally repeatable while manifests are
    # being corrected. Avoid recompressing dozens of unchanged Cycles renders
    # on every run; Pillow can read the cached dimensions from the WebP header.
    if dest.is_file() and dest.stat().st_mtime >= src.stat().st_mtime:
        with Image.open(dest) as cached:
            return {"file": f"boards/{profile_id}.webp",
                    "widthPx": cached.width, "heightPx": cached.height}
    with Image.open(src) as img:
        img = img.convert("RGBA")
        if img.width > RENDER_MAX_W:
            h = round(img.height * RENDER_MAX_W / img.width)
            img = img.resize((RENDER_MAX_W, h), Image.LANCZOS)
        img.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
        return {"file": f"boards/{profile_id}.webp", "widthPx": img.width, "heightPx": img.height}


# --- Profile generation for boards with no authored pin map ------------------
RAIL_KEYS = ("rails", "headerColumnsUsbDownTopToBottom", "appPinMapTopToBottom",
             "pinLabelsUsbDownTopToBottom", "pinLabelsTopToBottom")

GROUND = {"GND", "G", "GND1", "GND2"}
POWER_OUT = {"3V3", "3.3V", "3V"}
POWER_IN = {"5V", "VBUS", "VIN", "VBAT", "VUSB", "BAT"}
CONTROL = {"EN", "RST", "RESET", "BOOT", "DB/DEBUG_TX"}


def alias_map(board: dict) -> dict[str, int]:
    """Alias -> GPIO, harvested from entries written as "A0/GPIO18".

    Several boards silkscreen their headers with aliases only ("A0", "SDA",
    "MOSI") and never print the GPIO number, so the rail labels alone cannot be
    resolved. The safety and peripheral sections spell both out, so they are the
    only reliable bridge. `D<n>` is deliberately not inferred as GPIO n: it
    holds on the Feather ESP32 v2 and not on the XIAO, where D0 is GPIO1.
    """
    out: dict[str, int] = {}
    for field in ("gpioMap", "gpioAliases"):
        explicit = board.get(field)
        if not isinstance(explicit, dict):
            continue
        for alias, value in explicit.items():
            if isinstance(value, int):
                names = [str(alias), *str(alias).split("/")]
                for name in names:
                    out[name.strip().rstrip("~")] = value
                continue
            numbers = gpios_in_token(str(value))
            if numbers:
                names = [str(alias), *str(alias).split("/")]
                for name in names:
                    out[name.strip().rstrip("~")] = numbers[0]
    sources: list = []
    safety = board.get("pinSafetySummary")
    if isinstance(safety, dict):
        for value in safety.values():
            if isinstance(value, list):
                sources.extend(str(v) for v in value)
            elif isinstance(value, dict):
                sources.extend(str(k) for k in value)
    for token in sources:
        if "/" not in token or len(token) > 40 or "." in token:
            continue
        nums = GPIO_TOKEN.findall(token)
        if len(nums) != 1:
            continue
        for part in token.split("/"):
            part = part.strip()
            if part and not GPIO_TOKEN.fullmatch(part):
                out.setdefault(part, int(nums[0]))

    # On non-Espressif Arduino cores, D<n> is the number passed to pin APIs.
    # Do not apply that rule to ESP32/ESP8266 boards: their D aliases are often
    # silk names with a different underlying GPIO (the XIAO's D0 is GPIO1).
    fqbn = str(board.get("fqbn") or "").lower()
    if not fqbn.startswith(("esp32:", "esp8266:")):
        for rail in (board.get("rails") or {}).values():
            labels = rail if isinstance(rail, list) else (
                (rail.get("labelsTopToBottom") or rail.get("labelsLeftToRight"))
                if isinstance(rail, dict) else None)
            for raw in labels if isinstance(labels, list) else []:
                for part in str(raw).split("/"):
                    match = re.fullmatch(r"D(\d+)~?", part.strip(), re.I)
                    if match:
                        out.setdefault(f"D{match.group(1)}", int(match.group(1)))

    # Raspberry Pi Pico headers use GP<n>; the Arduino-Pico core accepts the
    # same number directly. This spelling is unambiguous across the asset set.
    for rail in (board.get("rails") or {}).values():
        labels = rail if isinstance(rail, list) else (
            (rail.get("labelsTopToBottom") or rail.get("labelsLeftToRight"))
            if isinstance(rail, dict) else None)
        for raw in labels if isinstance(labels, list) else []:
            for part in str(raw).split("/"):
                match = re.fullmatch(r"GP(\d+)", part.strip(), re.I)
                if match:
                    out.setdefault(f"GP{match.group(1)}", int(match.group(1)))
    return out


def resolve_gpio(label: str, aliases: dict[str, int]) -> int | None:
    label = label.strip()
    explicit = GPIO_TOKEN.findall(label)
    if explicit:
        return int(explicit[0])
    # A bare number is the GPIO number — the DevKitC and LOLIN silkscreens
    # print pins that way.
    if label.isdigit():
        return int(label)
    for part in [label, *(p.strip() for p in label.split("/"))]:
        normalised = part.rstrip("~")
        if normalised in aliases:
            return aliases[normalised]
    return None


def pin_role(label: str, gpio: int | None) -> str:
    upper = label.strip().upper()
    if upper in GROUND:
        return "ground"
    if upper in POWER_OUT:
        return "power-out"
    if upper in POWER_IN:
        return "power-in"
    if "USB" in upper and gpio is None:
        return "usb"
    if gpio is not None:
        return "gpio"
    if upper in CONTROL:
        return "reserved"
    return "reserved"


def side_for(rail_name: str) -> str | None:
    name = rail_name.lower()
    if "left" in name:
        return "left"
    if "right" in name:
        return "right"
    if "bottom" in name or "expansion" in name:
        return "bottom"
    if "top" in name:
        return "top"
    return None


def build_profile(board: dict, profile_id: str) -> dict | None:
    """Anchors and pins for a board with no authored profile.

    Only `labelAlign` and per-side ordering are consumed by the pinout view, so
    anchors carry no pixel geometry — deriving coordinates here would invent
    precision the renderer does not use.
    """
    rails = next((board[k] for k in RAIL_KEYS if isinstance(board.get(k), dict)), None)
    if not rails:
        return None
    aliases = alias_map(board)
    anchors: list[dict] = []
    pins: list[dict] = []
    unresolved = 0

    for rail_name, rail in rails.items():
        side = side_for(rail_name)
        if side is None:
            continue
        labels = rail if isinstance(rail, list) else (
            (rail.get("labelsTopToBottom") or rail.get("labelsLeftToRight"))
            if isinstance(rail, dict) else None)
        if not isinstance(labels, list):
            continue  # several manifests carry `"bottom": null`
        prefix = re.sub(r"[^a-z0-9]", "", rail_name.lower())
        for index, raw in enumerate(labels):
            label = str(raw).strip()
            anchor_id = f"{prefix}-{index + 1}"
            gpio = resolve_gpio(label, aliases)
            role = pin_role(label, gpio)
            if role == "gpio" and gpio is None:
                unresolved += 1
            anchors.append({"id": anchor_id, "x": 0, "y": 0, "labelAlign": side})
            pin = {"id": anchor_id, "label": label, "role": role, "anchorId": anchor_id}
            if gpio is not None:
                pin["gpio"] = gpio
            pins.append(pin)

    # Sparse maps remain useful as board identities: the real render and
    # silkscreen labels let somebody recognise the controller in their hand.
    # Unresolved pins carry no GPIO number and therefore stay neutral in the UI
    # and cannot be mistaken for safe wiring advice. Record the limitation in a
    # visible caveat rather than dropping the whole board from the picker.
    signal = [p for p in pins if p["role"] in ("gpio", "reserved")]
    resolved = [p for p in signal if "gpio" in p]
    coverage_note = None
    if not pins:
        coverage_note = "This board has no header pin map in the imported manifest."
    elif signal and len(resolved) / len(signal) < 0.7:
        coverage_note = (
            f"Only {len(resolved)}/{len(signal)} signal pins could be tied to a "
            "numeric GPIO; unresolved labels are shown without pin advice."
        )

    fqbn = board.get("fqbn") or ""
    compatible = board.get("compatibleFqbns") or ([fqbn] if fqbn else [])
    dims = board.get("dimensionsMmInUsbDownRenderAxes") or {}
    landscape = dims.get("sourceLandscapeDimensions") or []
    width = (dims.get("pcbWidthAcrossHeaders") or dims.get("pcbWidthAcrossRails")
             or (board.get("dimensionsMm") or {}).get("width")
             or (landscape[0] if len(landscape) >= 2 else None))
    height = (dims.get("pcbHeightAlongHeaders") or dims.get("pcbHeightAlongRails")
              or (board.get("dimensionsMm") or {}).get("height")
              or (landscape[1] if len(landscape) >= 2 else None))

    return {
        "id": profile_id,
        "label": board.get("label") or board.get("boardVariant") or profile_id,
        "manufacturer": board.get("manufacturer") or "Unknown",
        "model": board.get("model") or board.get("boardVariant") or profile_id,
        "revision": board.get("revision") or "imported",
        "fqbn": fqbn,
        "compatibleFqbns": compatible,
        "dimensionsMm": {"width": width or 0, "height": height or 0},
        "sourceSummary": board.get("sourceConfidence")
            or "Imported from the board asset manifest.",
        "caveats": [
            "Generated from the board asset manifest and not hand-checked "
            "against a physical board.",
            *([coverage_note] if coverage_note else []),
        ],
        "notes": [],
        "pinAnchors": anchors,
        "pins": pins,
        "unresolvedGpioCount": unresolved,
    }


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
    profiles: dict[str, dict] = {}
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

        profile = build_profile(board, profile_id)
        if profile:
            profiles[profile_id] = profile

        if not entry:
            skipped.append(f"{folder.name}: nothing importable")
            continue
        imported[profile_id] = entry

    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    rows = "\n".join(
        f"  {json.dumps(pid)}: {ts_literal(entry, 2)},"
        for pid, entry in sorted(imported.items()))
    profile_rows = "\n".join(
        f"  {ts_literal({k: v for k, v in p.items() if k != 'unresolvedGpioCount'}, 2)},"
        for _, p in sorted(profiles.items()))
    OUT_TS.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Produced by scripts/import-board-assets.py from the Blender board assets.\n"
        "// Merged into BOARD_PROFILES by boardProfiles.ts; hand-authored pin maps win.\n"
        "\n"
        "import type { BoardCapabilityData, GeneratedBoardProfile } from '../boardCapabilities'\n"
        "\n"
        "export const BOARD_CAPABILITY_DATA: Record<string, BoardCapabilityData> = {\n"
        f"{rows}\n"
        "}\n"
        "\n"
        "/** Pin maps derived from the manifests. Only used where no profile is authored. */\n"
        "export const GENERATED_BOARD_PROFILES: GeneratedBoardProfile[] = [\n"
        f"{profile_rows}\n"
        "]\n",
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
    print(f"generated {len(profiles)} pin map(s)")
    for pid, p in sorted(profiles.items()):
        gpio = sum(1 for pin in p["pins"] if "gpio" in pin)
        flag = f"  UNRESOLVED {p['unresolvedGpioCount']}" if p["unresolvedGpioCount"] else ""
        print(f"  {pid}: {len(p['pins'])} pins, {gpio} with a GPIO number{flag}")
    for line in skipped:
        print(f"  SKIPPED {line}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
