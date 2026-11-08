"""Per-user locations shared by the upload helper and the desktop launcher.

Two roots, both outside any checkout or installed bundle:

- The content folder holds the person's own work (Projects, My Patterns). It
  sits in their Documents folder, where people look for their files and where
  uninstalling the app cannot take it: an MSIX (Microsoft Store) package's
  AppData is redirected into the package and deleted with it.
- The data folder holds what the app can rebuild: helper configuration,
  downloaded toolchains, build caches and the desktop window's profile.
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


APP_FOLDER_NAME = "Design Studio for FastLED"


def default_content_dir(system: str | None = None) -> Path:
    """Return the folder for saved projects and patterns, inside Documents."""
    return documents_dir(system or platform.system()) / APP_FOLDER_NAME


def documents_dir(system: str) -> Path:
    """The user's Documents folder, following a Windows folder redirection."""
    if system == "Windows":
        try:
            import ctypes

            CSIDL_PERSONAL, MAX_PATH = 5, 260
            buffer = ctypes.create_unicode_buffer(MAX_PATH)
            if ctypes.windll.shell32.SHGetFolderPathW(None, CSIDL_PERSONAL, None, 0, buffer) == 0 and buffer.value:
                return Path(buffer.value)
        except (AttributeError, OSError):
            pass  # not on Windows (tests pass a system name), or no shell
    return Path.home() / "Documents"
