"""Per-user data locations shared by the upload helper and the desktop launcher.

Saved projects and patterns belong to the person, not to a checkout or an
installed bundle, so both a source checkout and the desktop app keep them under
the operating system's per-user application-data folder.
"""
from __future__ import annotations

import os
import platform
from pathlib import Path


def default_data_dir(system: str | None = None) -> Path:
    """Return the per-user mutable-data root for the active OS."""
    name = system or platform.system()
    if name == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        return base / "Design Studio for FastLED"
    if name == "Darwin":
        return Path.home() / "Library" / "Application Support" / "Design Studio for FastLED"
    base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    return base / "design-studio-for-fastled"
