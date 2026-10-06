"""Indicator LEDs carried from a part's or board's manifest onto its render.

Shared by import-part-assets.py and import-board-assets.py. The manifests'
`indicators` are written by Blender Assets/Scripts/measure_part_indicators.py
in the source render's pixels; a board render is downscaled on import, so the
positions are scaled with it. An entry that does not describe a lit LED on
this picture is dropped and reported rather than drawn somewhere wrong.
"""
from __future__ import annotations

import sys

DRIVES = {"power", "channel", "signal", "voltage"}


def _colour(value) -> list[int] | None:
    if (isinstance(value, list) and len(value) == 3
            and all(isinstance(c, (int, float)) and 0 <= c <= 255 for c in value)):
        return [int(round(c)) for c in value]
    return None


def import_indicators(raw, source_width, source_height, scale: float, label: str) -> list[dict] | None:
    """Validated indicators in the imported render's pixels, or None."""
    if raw is None:
        return None
    if not isinstance(raw, list) or not isinstance(source_width, (int, float)) \
            or not isinstance(source_height, (int, float)):
        print(f"  ! {label}: indicators unreadable — skipped", file=sys.stderr)
        return None
    out = []
    for item in raw:
        rect = item.get("rectPx") if isinstance(item, dict) else None
        colour = _colour(item.get("color")) if isinstance(item, dict) else None
        drive = item.get("drive") if isinstance(item, dict) else None
        if (not isinstance(rect, list) or len(rect) != 4
                or not all(isinstance(n, (int, float)) for n in rect)
                or rect[0] < 0 or rect[1] < 0 or rect[2] <= 0 or rect[3] <= 0
                or rect[0] + rect[2] > source_width or rect[1] + rect[3] > source_height
                or colour is None or drive not in DRIVES):
            print(f"  ! {label}: indicator {item.get('name') if isinstance(item, dict) else item!r} "
                  "is not a lit LED inside the render — skipped", file=sys.stderr)
            continue
        entry = {
            "rectPx": [round(float(n) * scale, 1) for n in rect],
            "color": colour,
            "drive": drive,
        }
        if drive == "channel":
            channel = item.get("channel")
            if not isinstance(channel, int) or channel < 1:
                print(f"  ! {label}: channel indicator without a channel — skipped", file=sys.stderr)
                continue
            entry["channel"] = channel
        if drive == "voltage":
            colours = item.get("colorsByVoltage")
            table = {str(k): _colour(v) for k, v in colours.items()} if isinstance(colours, dict) else {}
            if not table or any(v is None for v in table.values()):
                print(f"  ! {label}: voltage indicator without its colours — skipped", file=sys.stderr)
                continue
            entry["colorsByVoltage"] = table
        out.append(entry)
    return out or None
