#!/usr/bin/env python3
"""Import Blender renders still used as bundled UI artwork.

Canonical board and part packages are handled by the two catalogue importers.
Six older models still live at the Blender Assets root.  Four additional
bundled imports are fallbacks or direct component artwork for canonical parts.
All retain their established filenames so existing UI imports stay stable.

    python scripts/import-legacy-component-assets.py \
        "C:/Users/User/Desktop/Blender Assets"
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required: pip install Pillow")


REPO = Path(__file__).resolve().parent.parent
OUTPUT = REPO / "src" / "assets" / "components"
WEBP_QUALITY = 82

ASSETS = {
    "330ohm_blue_axial_resistor_top_down.png": "330ohm-blue-axial-resistor.webp",
    "5v_psu_birdseye_transparent.png": "5v-psu.webp",
    "button_module.png": "button-module.webp",
    "encoder_module.png": "encoder-module.webp",
    "Panasonic_EEUFR0J102B_top_down.png": "panasonic-eeufr0j102b-1000uf.webp",
    "potentiometer_module.png": "potentiometer-module.webp",
}

CANONICAL_ASSETS = {
    "Parts/inmp441-i2s-microphone/inmp441-i2s-microphone.png": (
        "inmp441-i2s-microphone.webp",
        "inmp441-breakout.webp",
    ),
    "Parts/max98357a-i2s-amplifier/max98357a-i2s-amplifier.png": (
        "max98357a-i2s-amplifier.webp",
    ),
    "Parts/sn74ahct125n-dip14/sn74ahct125n-dip14.png": (
        "sn74ahct125n-dip14.webp",
    ),
}


def main() -> int:
    if len(sys.argv) != 2:
        sys.exit(f"usage: {Path(sys.argv[0]).name} <blender-assets-root>")
    source_root = Path(sys.argv[1])
    if not source_root.is_dir():
        sys.exit(f"not a directory: {source_root}")

    missing = [name for name in (*ASSETS, *CANONICAL_ASSETS) if not (source_root / name).is_file()]
    if missing:
        sys.exit("missing legacy renders:\n  " + "\n  ".join(missing))

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for source_name, destination_name in ASSETS.items():
        source = source_root / source_name
        destination = OUTPUT / destination_name
        with Image.open(source) as image:
            image.save(destination, "WEBP", quality=WEBP_QUALITY, method=6)
            size = f"{image.width}x{image.height}"
        print(f"  + {destination_name}  {size}")
    for source_name, destination_names in CANONICAL_ASSETS.items():
        source = source_root / source_name
        with Image.open(source) as image:
            size = f"{image.width}x{image.height}"
            for destination_name in destination_names:
                destination = OUTPUT / destination_name
                image.save(destination, "WEBP", quality=WEBP_QUALITY, method=6)
                print(f"  + {destination_name}  {size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
