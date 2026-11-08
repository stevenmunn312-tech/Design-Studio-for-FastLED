"""Render the desktop launcher icon and the MSIX (Microsoft Store) logos.

The outputs are committed, so packaging needs no image library. Re-run after
changing public/icon-512.png:

    python scripts/assets/make-desktop-icons.py

Requires Pillow. Writes desktop/assets/app.ico (the launcher executable and
window icon) and desktop/assets/msix/*.png (the logos AppxManifest.xml names).
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "public" / "icon-512.png"
OUT = ROOT / "desktop" / "assets"
# --bg-primary in src/themes/tokens.css; the source icon's own background.
BACKGROUND = (0x0D, 0x0F, 0x12, 255)

ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
# name -> (width, height). Square logos are the icon itself; the wide tile
# centres it on the background colour.
MSIX_LOGOS = {
    "StoreLogo.png": (50, 50),
    "Square44x44Logo.png": (44, 44),
    "Square44x44Logo.targetsize-44_altform-unplated.png": (44, 44),
    "Square150x150Logo.png": (150, 150),
    "Wide310x150Logo.png": (310, 150),
}


def square(icon: Image.Image, size: int) -> Image.Image:
    return icon.resize((size, size), Image.LANCZOS)


def tile(icon: Image.Image, width: int, height: int) -> Image.Image:
    if width == height:
        return square(icon, width)
    canvas = Image.new("RGBA", (width, height), BACKGROUND)
    mark = square(icon, height)
    canvas.paste(mark, ((width - height) // 2, 0), mark)
    return canvas


def main() -> None:
    icon = Image.open(SOURCE).convert("RGBA")
    (OUT / "msix").mkdir(parents=True, exist_ok=True)
    icon.save(OUT / "app.ico", sizes=[(s, s) for s in ICO_SIZES])
    for name, (width, height) in MSIX_LOGOS.items():
        tile(icon, width, height).save(OUT / "msix" / name, optimize=True)
    print(f"Wrote {OUT / 'app.ico'} and {len(MSIX_LOGOS)} MSIX logos")


if __name__ == "__main__":
    main()
