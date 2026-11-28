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
# name -> (width, height) at scale 100. Square logos are the icon itself; the
# wide tile centres it on the background colour. The unqualified file is the
# fallback the manifest names; build.py indexes the qualified copies into
# resources.pri, which is how Windows picks the size it needs.
MSIX_LOGOS = {
    "StoreLogo": (50, 50),
    "Square44x44Logo": (44, 44),
    "Square150x150Logo": (150, 150),
    "Wide310x150Logo": (310, 150),
}
# The source is 512 px, so scale-400 only for the logos it still covers.
MSIX_SCALES = {
    "StoreLogo": [100, 125, 150, 200, 400],
    "Square44x44Logo": [100, 125, 150, 200, 400],
    "Square150x150Logo": [100, 125, 150, 200],
    "Wide310x150Logo": [100, 125, 150, 200],
}
# Start, the taskbar, search and Alt+Tab ask for Square44x44Logo by pixel size.
# The icon carries its own dark rounded square, so the unplated forms (dark
# and light theme) are the icon itself rather than a mark on a coloured plate.
TARGET_SIZES = [16, 20, 24, 30, 32, 36, 40, 44, 48, 60, 64, 72, 80, 96, 256]
TARGET_FORMS = ["", "_altform-unplated", "_altform-lightunplated"]


def square(icon: Image.Image, size: int) -> Image.Image:
    return icon.resize((size, size), Image.LANCZOS)


def tile(icon: Image.Image, width: int, height: int) -> Image.Image:
    if width == height:
        return square(icon, width)
    canvas = Image.new("RGBA", (width, height), BACKGROUND)
    mark = square(icon, height)
    # Composite, not paste: paste with a mask also copies the icon's
    # transparent rounded corners into the tile's alpha.
    canvas.alpha_composite(mark, ((width - height) // 2, 0))
    return canvas


def msix_logos() -> dict[str, tuple[int, int]]:
    """Every MSIX logo file name with its pixel size."""
    logos: dict[str, tuple[int, int]] = {}
    for name, (width, height) in MSIX_LOGOS.items():
        logos[f"{name}.png"] = (width, height)
        for scale in MSIX_SCALES[name]:
            logos[f"{name}.scale-{scale}.png"] = (round(width * scale / 100), round(height * scale / 100))
    for size in TARGET_SIZES:
        for form in TARGET_FORMS:
            logos[f"Square44x44Logo.targetsize-{size}{form}.png"] = (size, size)
    return logos


def main() -> None:
    icon = Image.open(SOURCE).convert("RGBA")
    msix = OUT / "msix"
    msix.mkdir(parents=True, exist_ok=True)
    for stale in msix.glob("*.png"):
        stale.unlink()
    icon.save(OUT / "app.ico", sizes=[(s, s) for s in ICO_SIZES])
    logos = msix_logos()
    for name, (width, height) in logos.items():
        tile(icon, width, height).save(msix / name, optimize=True)
    print(f"Wrote {OUT / 'app.ico'} and {len(logos)} MSIX logos")


if __name__ == "__main__":
    main()
