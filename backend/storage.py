"""The user's saved work on disk: the pattern library ("My Patterns") and
project files, with the native open/save dialogs and folder reveal.
"""
from __future__ import annotations

import contextlib
import json
import os
import platform
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from user_data import default_data_dir

router = APIRouter()

# Saved projects and patterns are the user's own work, so every mode keeps them
# in the per-user data folder, never inside a checkout or an installed bundle.
_CONTENT_DIR = Path(os.environ.get("FLS_DATA_DIR") or default_data_dir())

# Saved node-graph patterns ("My Patterns") live as one JSON file each in this
# folder, so users can share a pattern by simply sending the file. The browser
# can't write arbitrary folders, so it round-trips through the
# /api/patterns endpoints below. Override the location with FLS_PATTERNS_DIR.
_PATTERNS_DIR = Path(os.environ.get("FLS_PATTERNS_DIR") or (_CONTENT_DIR / "My Patterns"))
_PROJECT_FILE_SUFFIX = ".fastled-project.json"
_PROJECTS_DIR = Path(os.environ.get("FLS_PROJECTS_DIR") or (_CONTENT_DIR / "Projects"))
# Source checkouts kept "My Patterns" at the repository root until the library
# moved to the per-user data folder; startup moves those files across once.
_LEGACY_PATTERNS_DIR = Path(__file__).parent.parent / "My Patterns"
_project_file_lock = threading.RLock()


# ── Saved patterns ("My Patterns") ────────────────────────────────────────────
# Each pattern is one JSON file (the SavedPattern the frontend store uses). The
# pattern's `id` is the stable identity; the filename is derived from its name
# purely so the folder is human-readable and shareable.
import re as _re  # local alias — only the patterns endpoints need it


# Windows treats these as devices even with an extension (`CON.json` will not
# create a file). The stem is what the check looks at, before `.json` or
# `.fastled-project.json` is appended.
_WINDOWS_DEVICE_NAMES = _re.compile(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$", _re.IGNORECASE)


def _sanitize_filename(name: str) -> str:
    """A safe, human-readable basename for a pattern file. Strips path
    separators and characters illegal on Windows, collapses whitespace, and
    trims length — never returns something that could escape the folder."""
    cleaned = _re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name or "").strip().rstrip(". ")
    cleaned = _re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned[:80] or "pattern"
    stem, dot, rest = cleaned.partition(".")
    if _WINDOWS_DEVICE_NAMES.fullmatch(stem):
        stem = f"{stem}_"
        cleaned = f"{stem}.{rest}" if dot else stem
    return cleaned


def _patterns_dir() -> Path:
    _PATTERNS_DIR.mkdir(parents=True, exist_ok=True)
    return _PATTERNS_DIR


def _migrate_legacy_patterns(legacy: Path, target: Path) -> int:
    """Move every pattern file from `legacy` into `target`, then remove `legacy`
    once it is empty. A name already taken by a different file gets a suffix,
    so no pattern is overwritten or left behind. Returns the files moved."""
    if not legacy.is_dir() or (target.exists() and legacy.resolve() == target.resolve()):
        return 0
    target.mkdir(parents=True, exist_ok=True)
    moved = 0
    for src in sorted(legacy.glob("*.json")):
        dest = target / src.name
        if dest.exists():
            if dest.read_bytes() == src.read_bytes():
                src.unlink()
                continue
            dest = target / f"{src.stem}-{uuid.uuid4().hex[:8]}.json"
        shutil.move(str(src), str(dest))
        moved += 1
    with contextlib.suppress(OSError):
        legacy.rmdir()
    return moved


def _projects_dir() -> Path:
    _PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    return _PROJECTS_DIR


def _iter_pattern_files():
    try:
        return sorted(_patterns_dir().glob("*.json"))
    except Exception:
        return []


def _iter_project_files():
    try:
        return sorted(_projects_dir().glob("*.json"))
    except Exception:
        return []


def _remove_files_for_id(pattern_id: str) -> None:
    """Delete any existing file(s) holding this pattern id, so a save that
    renames (and thus changes the derived filename) doesn't leave a stale copy."""
    for f in _iter_pattern_files():
        try:
            if json.loads(f.read_text(encoding="utf-8")).get("id") == pattern_id:
                f.unlink(missing_ok=True)
        except Exception:
            continue


def _remove_project_files_for_id(project_id: str, keep: Path | None = None) -> None:
    for f in _iter_project_files():
        if f == keep:
            continue
        try:
            if json.loads(f.read_text(encoding="utf-8")).get("id") == project_id:
                f.unlink(missing_ok=True)
        except Exception:
            continue


def _unique_path(base: str, pattern_id: str) -> Path:
    """`<base>.json`, disambiguated only when a *different* pattern already owns
    that filename (rare — two patterns sharing a name)."""
    d = _patterns_dir()
    candidate = d / f"{base}.json"
    if candidate.exists():
        try:
            if json.loads(candidate.read_text(encoding="utf-8")).get("id") != pattern_id:
                candidate = d / f"{base}-{pattern_id}.json"
        except Exception:
            candidate = d / f"{base}-{pattern_id}.json"
    return candidate


def _unique_project_path(base: str, project_id: str) -> Path:
    d = _projects_dir()
    candidate = d / f"{base}{_PROJECT_FILE_SUFFIX}"
    if candidate.exists():
        try:
            if json.loads(candidate.read_text(encoding="utf-8")).get("id") != project_id:
                candidate = d / f"{base}-{project_id}{_PROJECT_FILE_SUFFIX}"
        except Exception:
            candidate = d / f"{base}-{project_id}{_PROJECT_FILE_SUFFIX}"
    return candidate


def _project_name_from_filename(name: str) -> str:
    base = re.sub(r"\.fastled-project\.json$", "", name, flags=re.I)
    base = re.sub(r"\.json$", "", base, flags=re.I)
    return base.strip() or "Untitled Project"


def _ensure_project_file_path(path: Path) -> Path:
    text = str(path)
    if text.lower().endswith(_PROJECT_FILE_SUFFIX.lower()):
        return path
    if text.lower().endswith(".json"):
        text = text[:-5]
    return Path(f"{text}{_PROJECT_FILE_SUFFIX}")


def _show_windows_save_dialog(initial_dir: Path, initial_file: str) -> str | None:
    env = {
        **os.environ,
        "FLS_DIALOG_INITIAL_DIR": str(initial_dir),
        "FLS_DIALOG_FILE_NAME": initial_file,
    }
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        # Give the dialog a real topmost owner. Without one, Windows can place
        # this helper-process dialog behind the browser/desktop shell; the API
        # request then waits forever while the menu action appears to do
        # nothing.
        "$owner = New-Object System.Windows.Forms.Form; "
        "$owner.TopMost = $true; "
        "$owner.ShowInTaskbar = $false; "
        "$owner.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None; "
        "$owner.Width = 1; $owner.Height = 1; "
        "$owner.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen; "
        "$dialog = New-Object System.Windows.Forms.SaveFileDialog; "
        "$dialog.InitialDirectory = $env:FLS_DIALOG_INITIAL_DIR; "
        "$dialog.FileName = $env:FLS_DIALOG_FILE_NAME; "
        "$dialog.Filter = 'Design Studio for FastLED Project (*.fastled-project.json)|*.fastled-project.json|All Files (*.*)|*.*'; "
        "$dialog.AddExtension = $true; "
        "$dialog.DefaultExt = 'fastled-project.json'; "
        "$owner.Show(); $owner.Activate(); "
        "try { if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) } } "
        "finally { $owner.Close(); $owner.Dispose() }"
    )
    res = subprocess.run(
        ["powershell", "-NoProfile", "-STA", "-Command", script],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    return (res.stdout or "").strip() or None


def _show_windows_open_dialog(initial_dir: Path) -> str | None:
    env = {
        **os.environ,
        "FLS_DIALOG_INITIAL_DIR": str(initial_dir),
    }
    script = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$dialog = New-Object System.Windows.Forms.OpenFileDialog; "
        "$dialog.InitialDirectory = $env:FLS_DIALOG_INITIAL_DIR; "
        "$dialog.Filter = 'Design Studio for FastLED Project (*.json)|*.json|All Files (*.*)|*.*'; "
        "$dialog.Multiselect = $false; "
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }"
    )
    res = subprocess.run(
        ["powershell", "-NoProfile", "-STA", "-Command", script],
        capture_output=True,
        text=True,
        env=env,
        check=False,
    )
    return (res.stdout or "").strip() or None


def _show_tk_save_dialog(initial_dir: Path, initial_file: str) -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    try:
        path = filedialog.asksaveasfilename(
            parent=root,
            title="Save Project",
            initialdir=str(initial_dir),
            initialfile=initial_file,
            defaultextension=".fastled-project.json",
            filetypes=[
                ("Design Studio for FastLED Project", "*.fastled-project.json"),
                ("All Files", "*.*"),
            ],
        )
        return path or None
    finally:
        root.destroy()


def _show_tk_open_dialog(initial_dir: Path) -> str | None:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    root.update()
    try:
        path = filedialog.askopenfilename(
            parent=root,
            title="Open Project",
            initialdir=str(initial_dir),
            filetypes=[
                ("Design Studio for FastLED Project", "*.json"),
                ("JSON", "*.json"),
                ("All Files", "*.*"),
            ],
        )
        return path or None
    finally:
        root.destroy()


def _show_project_save_dialog(initial_file: str) -> Path | None:
    initial_dir = _projects_dir()
    try:
        if platform.system() == "Windows":
            chosen = _show_windows_save_dialog(initial_dir, initial_file)
        else:
            chosen = _show_tk_save_dialog(initial_dir, initial_file)
    except Exception:
        try:
            chosen = _show_tk_save_dialog(initial_dir, initial_file)
        except Exception:
            return None
    return Path(chosen) if chosen else None


def _show_project_open_dialog() -> Path | None:
    initial_dir = _projects_dir()
    try:
        if platform.system() == "Windows":
            chosen = _show_windows_open_dialog(initial_dir)
        else:
            chosen = _show_tk_open_dialog(initial_dir)
    except Exception:
        try:
            chosen = _show_tk_open_dialog(initial_dir)
        except Exception:
            return None
    return Path(chosen) if chosen else None


@router.get("/api/patterns")
def list_patterns():
    """Every saved pattern on disk, newest first. `[]` when the folder is empty."""
    out = []
    for f in _iter_pattern_files():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("id") and data.get("name"):
                out.append(data)
        except Exception:
            continue  # skip an unreadable/hand-broken file rather than 500
    out.sort(key=lambda p: p.get("createdAt", 0), reverse=True)
    return {"ok": True, "dir": str(_PATTERNS_DIR), "patterns": out}


@router.post("/api/patterns")
def save_pattern(pattern: dict = Body(...)):
    """Write one pattern to its own file. Overwrites any existing file with the
    same `id` (so renames don't orphan the old file)."""
    pid = str(pattern.get("id") or "").strip()
    name = str(pattern.get("name") or "").strip()
    if not pid or not name or "subgraph" not in pattern:
        return JSONResponse({"ok": False, "error": "pattern needs id, name and subgraph"}, status_code=400)
    _remove_files_for_id(pid)
    path = _unique_path(_sanitize_filename(name), pid)
    # Defence in depth: never write outside the patterns folder.
    if _patterns_dir().resolve() not in path.resolve().parents:
        return JSONResponse({"ok": False, "error": "invalid pattern name"}, status_code=400)
    try:
        path.write_text(json.dumps(pattern, indent=2), encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "file": path.name}


@router.delete("/api/patterns/{pattern_id}")
def delete_pattern(pattern_id: str):
    """Delete the file(s) holding this pattern id."""
    _remove_files_for_id(pattern_id)
    return {"ok": True}


def _focus_windows_explorer(folder_name: str) -> bool:
    """Bring an already-open Explorer window for `folder_name` to the front.

    `os.startfile` reuses an existing Explorer window for the folder rather
    than opening a new one, and Windows' focus-stealing prevention then leaves
    that window sitting behind whatever app currently has focus (the browser).
    A single trick rarely beats that heuristic reliably across Windows
    versions, so this stacks three, checking `SetForegroundWindow`'s return
    value (0 = still blocked) before escalating:
      1. `AttachThreadInput` to the foreground thread + zero the
         foreground-lock timeout for the duration of the call.
      2. Minimize-then-restore — restoring from the taskbar is specifically
         exempt from the lock, so this forces the exemption path.
      3. Synthesize an Alt keypress first — a real input event on our thread
         resets the "last input" state the lock heuristic checks.
    Best-effort throughout: returns False (never raises) if the window can't
    be found, or all three still fail to focus it."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    # Explicit signatures — without these, ctypes defaults return types to
    # `c_int` (32-bit), silently truncating HWNDs on 64-bit Windows and making
    # every call below a no-op with no exception to show for it.
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    user32.SetForegroundWindow.restype = wintypes.BOOL
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.BringWindowToTop.argtypes = [wintypes.HWND]
    user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
    kernel32.GetCurrentThreadId.restype = wintypes.DWORD

    found: list[int] = []
    seen_titles: list[str] = []  # every Explorer window seen, for diagnostics if nothing matches

    # Substring, case-insensitive: with Explorer's "show full path in title
    # bar" option on, the title is the whole path (e.g. `...\My Patterns`),
    # not the bare folder name — an exact match would silently find nothing,
    # every time, on any machine with that option set.
    needle = folder_name.lower()

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def _enum(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        title = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, title, length + 1)
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        if cls.value in ("CabinetWClass", "ExploreWClass"):
            seen_titles.append(title.value)
            if needle in title.value.lower():
                found.append(hwnd)
        return True

    user32.EnumWindows(_enum, 0)
    if not found:
        print(f"[reveal] no Explorer window title matched {needle!r}; open Explorer windows: {seen_titles}")
        return False
    hwnd = found[-1]

    SPI_GETFOREGROUNDLOCKTIMEOUT = 0x2000
    SPI_SETFOREGROUNDLOCKTIMEOUT = 0x2001
    SPIF_SENDCHANGE = 0x2
    VK_MENU = 0x12
    KEYEVENTF_KEYUP = 0x2

    old_timeout = wintypes.DWORD(0)
    user32.SystemParametersInfoW(SPI_GETFOREGROUNDLOCKTIMEOUT, 0, ctypes.byref(old_timeout), 0)
    user32.SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, 0, SPIF_SENDCHANGE)

    fg_hwnd = user32.GetForegroundWindow()
    cur_thread = kernel32.GetCurrentThreadId()
    fg_thread = user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0
    attached = bool(fg_thread and fg_thread != cur_thread and user32.AttachThreadInput(cur_thread, fg_thread, True))
    try:
        user32.ShowWindow(hwnd, 9)  # SW_RESTORE — un-minimize if needed
        ok = bool(user32.SetForegroundWindow(hwnd))

        if not ok:  # try #2: minimize-then-restore's exemption from the lock
            user32.ShowWindow(hwnd, 6)  # SW_MINIMIZE
            user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            ok = bool(user32.SetForegroundWindow(hwnd))

        if not ok:  # try #3: a synthesized Alt keypress resets the input lock
            user32.keybd_event(VK_MENU, 0, 0, 0)
            ok = bool(user32.SetForegroundWindow(hwnd))
            user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)

        user32.BringWindowToTop(hwnd)
    finally:
        if attached:
            user32.AttachThreadInput(cur_thread, fg_thread, False)
        user32.SystemParametersInfoW(SPI_SETFOREGROUNDLOCKTIMEOUT, 0, old_timeout, SPIF_SENDCHANGE)
    return ok


@router.post("/api/patterns/reveal")
def reveal_patterns_folder():
    """Open the "My Patterns" folder in the OS file manager, focused."""
    path = _patterns_dir()
    try:
        system = platform.system()
        if system == "Windows":
            os.startfile(str(path))  # noqa: S606 — local-only helper, fixed folder
            # The window may take a beat to appear (new) or update (reused).
            for _ in range(20):
                try:
                    if _focus_windows_explorer(path.name):
                        break
                except Exception:
                    pass
                time.sleep(0.1)
        elif system == "Darwin":
            subprocess.run(["open", str(path)], check=True)
        else:
            subprocess.run(["xdg-open", str(path)], check=True)
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True}


@router.get("/api/projects")
def list_projects():
    """Every saved project on disk, newest first."""
    with _project_file_lock:
        out = []
        for f in _iter_project_files():
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                workspace = data.get("workspace")
                if (isinstance(data, dict) and data.get("id") and data.get("name")
                        and isinstance(workspace, dict) and isinstance(workspace.get("nodes"), list)
                        and isinstance(workspace.get("edges"), list)):
                    out.append(data)
            except Exception:
                continue
        out.sort(key=lambda project: project.get("updatedAt", project.get("createdAt", 0)), reverse=True)
        return {"ok": True, "dir": str(_PROJECTS_DIR), "projects": out}


@router.post("/api/projects")
def save_project(project: dict = Body(...)):
    """Write one project to its own file. Overwrites by stable id."""
    pid = str(project.get("id") or "").strip()
    name = str(project.get("name") or "").strip()
    workspace = project.get("workspace")
    if (not pid or not name or not isinstance(workspace, dict)
            or not isinstance(workspace.get("nodes"), list) or not isinstance(workspace.get("edges"), list)):
        return JSONResponse({"ok": False, "error": "project needs id, name and workspace"}, status_code=400)
    with _project_file_lock:
        # Autosave, explicit Save and pagehide can arrive out of order. Never
        # let an older snapshot replace the newer workspace already on disk.
        for existing_path in _iter_project_files():
            try:
                existing = json.loads(existing_path.read_text(encoding="utf-8"))
                if (existing.get("id") == pid
                        and existing.get("updatedAt", 0) > project.get("updatedAt", 0)):
                    return {"ok": True, "file": existing_path.name}
            except (OSError, ValueError, TypeError):
                continue
        path = _unique_project_path(_sanitize_filename(name), pid)
        if _projects_dir().resolve() not in path.resolve().parents:
            return JSONResponse({"ok": False, "error": "invalid project name"}, status_code=400)
        temporary_path: Path | None = None
        try:
            # Keep the last complete save until its replacement is ready.
            # A unique non-JSON temp file is invisible to the project listing.
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                             suffix=".tmp", delete=False) as temporary:
                temporary_path = Path(temporary.name)
                temporary.write(json.dumps(project, indent=2))
            temporary_path.replace(path)
            _remove_project_files_for_id(pid, keep=path)
        except Exception as e:
            return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
        return {"ok": True, "file": path.name}


@router.post("/api/projects/dialog/open")
def open_project_dialog():
    """Open a native OS file dialog and return the chosen project's raw JSON."""
    path = _show_project_open_dialog()
    if not path:
        return {"ok": False, "canceled": True}
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "canceled": False, "text": text, "name": path.name}


@router.post("/api/projects/dialog/save")
def save_project_dialog(project: dict = Body(...)):
    """Open a native OS save dialog, write the chosen project file, and return the saved payload."""
    pid = str(project.get("id") or "").strip()
    name = str(project.get("name") or "").strip()
    workspace = project.get("workspace")
    if (not pid or not name or not isinstance(workspace, dict)
            or not isinstance(workspace.get("nodes"), list) or not isinstance(workspace.get("edges"), list)):
        return JSONResponse({"ok": False, "error": "project needs id, name and workspace"}, status_code=400)

    initial_file = f"{_sanitize_filename(name)}{_PROJECT_FILE_SUFFIX}"
    path = _show_project_save_dialog(initial_file)
    if not path:
        return {"ok": False, "canceled": True}
    path = _ensure_project_file_path(path)

    saved_project = {
        **project,
        "name": _project_name_from_filename(path.name),
    }
    try:
        path.write_text(json.dumps(saved_project, indent=2), encoding="utf-8")
    except Exception as e:
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)
    return {"ok": True, "canceled": False, "project": saved_project, "path": str(path)}


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    """Delete the file(s) holding this project id."""
    with _project_file_lock:
        _remove_project_files_for_id(project_id)
    return {"ok": True}
