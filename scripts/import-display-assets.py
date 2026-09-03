#!/usr/bin/env python3
"""Import the external display design pack into the app's asset registry.

    python scripts/import-display-assets.py "C:/Users/User/Desktop/Player Controls"

The sibling of `import-part-assets.py`, for the freeform `Display` editor
rather than the hardware bench. Reads the pack's own manifests, copies the
vector masters and theme tokens under `public/display-assets/`, and emits a
generated TypeScript module that `src/state/displayAssets.ts` wraps.

## Why the import happens here and not at runtime

A display document persists an asset *id*, never a path. The pack lives in a
working folder on one machine; a workspace that stored `C:/Users/.../Custom UI
Kit/semantic-icons/svg/power.svg` would be unopenable everywhere else and would
leak the author's directory layout into a shared file. So the boundary is this
script: it is the only thing that ever sees the pack's own paths, and what
crosses into the repository is a stable id, a site-relative file, and the few
facts the editor and the firmware baker need.

Only the vector masters and theme JSON are imported. The pack's PNG rasters are
regenerable from those, and the plan bakes only the sizes, tints and states a
generated screen actually uses — so committing five raster sizes would be
committing the thing we deliberately do not bake from.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_TS = REPO / "src" / "build" / "generated" / "displayAssetCatalogueData.ts"
OUT_ASSETS = REPO / "public" / "display-assets"
PUBLIC_DIR = "display-assets"

ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*(?::[a-z0-9]+(?:[-.][a-z0-9]+)*)?$")
VIEWBOX_RE = re.compile(r'viewBox\s*=\s*"([-\d.\s]+)"')

# A tintable glyph bakes as an 8-bit alpha mask; a background is full RGB565.
# Stated here because the estimate has to mean the same thing to the editor's
# budget warning and to whatever eventually writes the PROGMEM table.
GLYPH_BYTES_PER_PIXEL = 1
BACKGROUND_BYTES_PER_PIXEL = 2


def fail(message: str) -> None:
    sys.exit(f"import-display-assets: {message}")


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing {path}")
    except json.JSONDecodeError as error:
        fail(f"{path} is not valid JSON: {error}")
    return {}


def pack_file(root: Path, relative: str) -> Path:
    """Resolve a manifest path inside the pack, refusing anything that escapes it."""
    if not relative or relative.startswith("/") or "\\" in relative:
        fail(f"manifest path must be pack-relative with forward slashes: {relative!r}")
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root.resolve()):
        fail(f"manifest path escapes the pack root: {relative!r}")
    if not resolved.is_file():
        fail(f"manifest names a file that does not exist: {relative!r}")
    return resolved


def svg_dimensions(path: Path) -> tuple[int, int]:
    match = VIEWBOX_RE.search(path.read_text(encoding="utf-8"))
    if not match:
        fail(f"{path.name} has no viewBox; dimensions cannot be derived")
    parts = match.group(1).split()
    if len(parts) != 4:
        fail(f"{path.name} has a malformed viewBox")
    return round(float(parts[2])), round(float(parts[3]))


class Catalogue:
    def __init__(self) -> None:
        self.entries: dict[str, dict] = {}

    def add(self, entry: dict) -> None:
        asset_id = entry["id"]
        if not ID_RE.match(asset_id):
            fail(f"asset id {asset_id!r} does not match category:name[:variant]")
        if asset_id in self.entries:
            fail(f"duplicate asset id {asset_id!r}")
        self.entries[asset_id] = entry


def copy_asset(source: Path, destination_relative: str) -> str:
    destination = OUT_ASSETS / destination_relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    return f"{PUBLIC_DIR}/{destination_relative}"


def glyph_entry(
    catalogue: Catalogue,
    root: Path,
    asset_id: str,
    label: str,
    category: str,
    relative: str,
    destination: str,
    tintable: bool,
    slots: list[str],
) -> None:
    source = pack_file(root, relative)
    width, height = svg_dimensions(source)
    catalogue.add({
        "id": asset_id,
        "category": category,
        "label": label,
        "slots": slots,
        "width": width,
        "height": height,
        "tintable": tintable,
        "format": "svg",
        "file": copy_asset(source, destination),
        "bytesPerPixel": GLYPH_BYTES_PER_PIXEL,
    })


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        fail('usage: import-display-assets.py "<pack root>"')
    root = Path(argv[1]).expanduser()
    if not root.is_dir():
        fail(f"pack root is not a directory: {root}")

    kit = root / "Custom UI Kit"
    if not kit.is_dir():
        fail(f"pack root has no 'Custom UI Kit' directory: {root}")

    manifest = read_json(kit / "asset-manifest.json")
    if manifest.get("schemaVersion") != 1:
        fail(f"unsupported asset manifest schemaVersion {manifest.get('schemaVersion')!r}")
    pack_version = str(manifest.get("packVersion", ""))
    if not re.match(r"^\d+\.\d+\.\d+$", pack_version):
        fail(f"pack version {pack_version!r} is not a semantic version")

    catalogue = Catalogue()

    for icon in manifest.get("semanticIcons", []):
        name = icon["id"].split(":", 1)[1]
        glyph_entry(
            catalogue, kit, icon["id"], icon["label"], "icon", icon["svg"],
            f"icons/{name}.svg", bool(icon.get("tintable", True)), ["icon", "image"],
        )

    for glyph in manifest.get("widgetPalette", []):
        name = glyph["id"].split(":", 1)[1]
        glyph_entry(
            catalogue, kit, glyph["id"], glyph["label"], "widget-glyph", glyph["svg"],
            f"widgets/{name}.svg", True, [],
        )

    for background in manifest.get("backgrounds", []):
        source = pack_file(kit, background["svg"])
        theme = background["theme"]
        width = int(background["width"])
        height = int(background["height"])
        catalogue.add({
            "id": background["id"],
            "category": "background",
            "label": f"{theme} {width}x{height}",
            "slots": [],
            "width": width,
            "height": height,
            "tintable": False,
            "format": "svg",
            "file": copy_asset(source, f"backgrounds/{theme}/{width}x{height}.svg"),
            "bytesPerPixel": BACKGROUND_BYTES_PER_PIXEL,
        })

    for theme in manifest.get("themes", []):
        source = pack_file(kit, theme["tokens"])
        tokens = read_json(source)
        if tokens.get("schemaVersion") != 1:
            fail(f"{theme['id']} tokens have unsupported schemaVersion")
        slug = theme["id"].split(":", 1)[1]
        catalogue.add({
            "id": theme["id"],
            "category": "theme",
            "label": theme["name"],
            "slots": [],
            "width": 0,
            "height": 0,
            "tintable": False,
            "format": "json",
            "file": copy_asset(source, f"themes/{slug}.json"),
            "bytesPerPixel": 0,
        })

    for template in manifest.get("templates", []):
        name = template["id"].split(":", 1)[1]
        vector = f"template-previews/svg/{name}.svg"
        source = pack_file(kit, vector if (kit / vector).is_file() else template["preview"])
        width, height = svg_dimensions(source) if source.suffix == ".svg" else (320, 240)
        catalogue.add({
            "id": template["id"],
            "category": "template-preview",
            "label": template["label"],
            "slots": [],
            "width": width,
            "height": height,
            "tintable": False,
            "format": source.suffix.lstrip("."),
            "file": copy_asset(source, f"templates/{name}{source.suffix}"),
            "bytesPerPixel": 0,
        })

    # The 18 themed player-control sets live beside the kit rather than inside
    # it, so their ids are assembled from the kit's own reference contract and
    # the pack manifest's set list — never from a directory listing, which would
    # let a stray folder mint an id.
    reference = read_json(kit / "player-controls-reference.json")
    controls = reference.get("controls", [])
    sets = read_json(root / "manifest.json").get("sets", [])
    for control_set in sets:
        slug = control_set["id"]
        for control in controls:
            control_id = control["id"]
            glyph_entry(
                catalogue, root, f"control:{slug}:{control_id}",
                f"{control_set['name']} {control['label']}", "control",
                f"{slug}/svg/{control_id}.svg",
                f"controls/{slug}/{control_id}.svg", True, ["icon", "image"],
            )

    if not catalogue.entries:
        fail("the pack produced no assets")

    catalogue_json = json.dumps(catalogue.entries, indent=2, ensure_ascii=False)
    header = "\n".join([
        "// GENERATED FILE - do not edit by hand.",
        "// Produced by scripts/import-display-assets.py from the display design pack.",
        "//",
        "// Every entry is addressed by its stable id. A display document persists",
        "// that id and nothing else: the pack's own working-folder paths stop at the",
        "// import script, and `file` here is site-relative so a workspace opens the",
        "// same way on any machine.",
    ])
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text(
        header
        + "\n\n"
        + "import type { DisplayAssetEntry } from '../../state/displayAssets'"
        + "\n\n"
        + f"export const DISPLAY_ASSET_PACK_VERSION = {json.dumps(pack_version)}"
        + "\n\n"
        + "export const DISPLAY_ASSET_CATALOGUE_DATA: "
        + "Record<string, DisplayAssetEntry> = "
        + catalogue_json
        + "\n",
        encoding="utf-8",
    )

    by_category: dict[str, int] = {}
    for entry in catalogue.entries.values():
        by_category[entry["category"]] = by_category.get(entry["category"], 0) + 1
    print(f"imported {len(catalogue.entries)} assets from pack {pack_version}")
    for category in sorted(by_category):
        print(f"  {category:<18} {by_category[category]}")
    print(f"  -> {OUT_TS.relative_to(REPO)}")
    print(f"  -> {OUT_ASSETS.relative_to(REPO)}/")


if __name__ == "__main__":
    main(sys.argv)
