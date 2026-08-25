#!/usr/bin/env python3
"""Import Blender *part* assets into the app's part catalogue.

The sibling of `import-board-assets.py`, for everything that is not a board:
microphones, amplifiers, storage modules, LED outputs, support parts.

    python scripts/import-part-assets.py "C:/Users/User/Desktop/Blender Assets/Parts"

Reads each `<asset-root>/<part-id>/part.json`, converts the raw Cycles PNG to
WebP under `public/parts/`, and emits a generated TypeScript module.

## Why the app should not hand-declare these numbers

Every `part.json` records `dimensionsMm` verified against a datasheet or a
fabrication print — that is a rule of the modelling brief, not a courtesy. The
app had been declaring footprints from memory instead, and two of the three it
had guessed were wrong: the MAX98357A by nearly half its length, and a ring's
diameter by a formula that is off at both ends of the range. The hardware view
exists to show parts at true relative scale, so a wrong millimetre figure is
not a cosmetic issue — it is the view telling a quiet lie about the bench.

Importing the measurements removes the opportunity to guess.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")

REPO = Path(__file__).resolve().parent.parent
OUT_TS = REPO / "src" / "build" / "generated" / "partCatalogueData.ts"
OUT_RENDERS = REPO / "public" / "parts"

# Matches the board importer. Parts are rendered at 12 px/mm clamped to
# 400-1200 px, so they arrive already sized for display; only the encoding
# changes here.
WEBP_QUALITY = 82

CATEGORIES = {
    "microphone", "amplifier", "storage", "led-output",
    "input-control", "audio-source", "support",
}


def convert_render(part_id: str, part_dir: Path, render: dict) -> dict | None:
    """PNG -> WebP under public/parts. Returns the app-facing render record."""
    name = render.get("file")
    if not name:
        return None
    source = part_dir / name
    if not source.exists():
        print(f"  ! {part_id}: render {name} missing", file=sys.stderr)
        return None

    OUT_RENDERS.mkdir(parents=True, exist_ok=True)
    dest = OUT_RENDERS / f"{part_id}.webp"
    with Image.open(source) as img:
        img.save(dest, "WEBP", quality=WEBP_QUALITY, method=6)
        width, height = img.width, img.height

    out = {"file": f"parts/{part_id}.webp", "widthPx": width, "heightPx": height}
    # Recorded rather than recomputed: the asset states the density it actually
    # achieved, which is below the 12 px/mm target for parts over ~100 mm
    # because the 1200 px cap wins. Recomputing here would silently disagree.
    if isinstance(render.get("pxPerMm"), (int, float)):
        out["pxPerMm"] = round(float(render["pxPerMm"]), 3)
    return out


def read_part(part_dir: Path) -> dict | None:
    manifest = part_dir / "part.json"
    if not manifest.exists():
        return None
    data = json.loads(manifest.read_text(encoding="utf-8"))

    part_id = data.get("partId") or part_dir.name
    dims = data.get("dimensionsMm") or {}
    width, height = dims.get("width"), dims.get("height")
    if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
        print(f"  ! {part_id}: no usable dimensionsMm — skipped", file=sys.stderr)
        return None

    category = data.get("category")
    if category not in CATEGORIES:
        print(f"  ! {part_id}: unknown category {category!r}", file=sys.stderr)

    entry = {
        "partId": part_id,
        "label": data.get("label") or part_id,
        "category": category,
        "dimensionsMm": {"width": float(width), "height": float(height)},
    }
    for key in ("manufacturer", "logicVoltage"):
        if data.get(key):
            entry[key] = data[key]
    if data.get("pinLabelsLeftToRight"):
        entry["pinLabelsLeftToRight"] = data["pinLabelsLeftToRight"]
    if data.get("notes"):
        entry["notes"] = data["notes"]
    # The pixel geometry an LED output needs: form plus count or width/height.
    if data.get("ledLayout"):
        entry["ledLayout"] = data["ledLayout"]
    # An auxiliary display's driver contract. Carried through for the same
    # reason dimensionsMm is: a resolution typed into the app is a resolution
    # that can disagree with the panel, and every fixed layout is computed
    # from it.
    display = data.get("display")
    if display:
        resolution = display.get("resolutionPx")
        if (isinstance(resolution, list) and len(resolution) == 2
                and all(isinstance(n, int) and n > 0 for n in resolution)
                and display.get("controller") and display.get("interface")):
            entry["display"] = {
                "controller": display["controller"],
                "resolutionPx": [resolution[0], resolution[1]],
                "interface": display["interface"],
                "touchController": display.get("touchController") or None,
            }
        else:
            print(f"  ! {part_id}: display block is incomplete — skipped",
                  file=sys.stderr)

    render = convert_render(part_id, part_dir, data.get("render") or {})
    if render:
        entry["render"] = render
    return entry


def main() -> int:
    if len(sys.argv) < 2:
        sys.exit(f"usage: {Path(sys.argv[0]).name} <asset-root>")
    root = Path(sys.argv[1])
    if not root.is_dir():
        sys.exit(f"not a directory: {root}")

    entries = []
    for part_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        entry = read_part(part_dir)
        if entry:
            entries.append(entry)
            print(f"  + {entry['partId']}  {entry['dimensionsMm']['width']}x"
                  f"{entry['dimensionsMm']['height']} mm")

    if not entries:
        sys.exit("no parts found")

    body = ",\n".join(
        f"  {json.dumps(e['partId'])}: " + json.dumps(e, indent=2, ensure_ascii=False)
        .replace("\n", "\n  ")
        for e in entries
    )
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text(
        "// GENERATED FILE — do not edit by hand.\n"
        "// Produced by scripts/import-part-assets.py from the Blender part assets.\n"
        "//\n"
        "// Every dimension here is verified against a datasheet or fabrication\n"
        "// print in the asset's own part.json. Do not replace one with a figure\n"
        "// measured off a photograph or remembered — the hardware view draws parts\n"
        "// at true relative scale, so these numbers are load-bearing.\n\n"
        "import type { PartCatalogueEntry } from '../../state/partCatalogue'\n\n"
        "export const PART_CATALOGUE_DATA: Record<string, PartCatalogueEntry> = {\n"
        f"{body},\n"
        "}\n",
        encoding="utf-8",
    )
    print(f"\nWrote {len(entries)} parts to {OUT_TS.relative_to(REPO)}")
    print(f"Renders in {OUT_RENDERS.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
