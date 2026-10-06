"""Copying a show onto an SD card in a reader attached to this computer."""
from __future__ import annotations

import json
import os
import platform
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

router = APIRouter()

# ── SD card in a reader ───────────────────────────────────────────────────────
# Serial is the universal path, but it is slow: a 7 MB song is minutes even at
# 921600. When the user has a card reader, writing the files straight to the
# mounted volume is seconds — so the studio offers it as a checkbox and drives
# it through these two endpoints.
#
# Only removable volumes are ever listed or written to. That is the whole guard
# here: the browser names a destination directory, and without the restriction
# this endpoint would be a "write anywhere on the host" primitive.

_SD_SUBDIRS = ("music", "shows", "video")


def _removable_drives() -> list[dict]:
    """Mounted removable volumes, as {path, label, freeBytes, totalBytes}.

    Deliberately conservative: a volume this cannot positively identify as
    removable is left out. Missing a card reader is an inconvenience the user
    can work around with the serial path; offering the system disk as a
    destination is not.
    """
    out: list[dict] = []

    def _entry(path: str, label: str) -> dict | None:
        try:
            usage = shutil.disk_usage(path)
        except OSError:
            return None  # a reader with no card in it
        return {"path": path, "label": label, "freeBytes": usage.free, "totalBytes": usage.total}

    if platform.system() == "Windows":
        import ctypes

        DRIVE_REMOVABLE = 2
        kernel32 = ctypes.windll.kernel32
        mask = kernel32.GetLogicalDrives()
        for i in range(26):
            if not mask & (1 << i):
                continue
            root = f"{chr(ord('A') + i)}:{os.sep}"
            if kernel32.GetDriveTypeW(ctypes.c_wchar_p(root)) != DRIVE_REMOVABLE:
                continue
            name = ctypes.create_unicode_buffer(261)
            try:
                kernel32.GetVolumeInformationW(
                    ctypes.c_wchar_p(root), name, 261, None, None, None, None, 0
                )
            except OSError:
                pass
            entry = _entry(root, name.value or "Removable disk")
            if entry:
                out.append(entry)
        return out

    if platform.system() == "Darwin":
        # /Volumes holds every mount; the boot volume is the one to exclude.
        boot = os.path.realpath("/")
        for name in sorted(os.listdir("/Volumes")) if os.path.isdir("/Volumes") else []:
            path = os.path.join("/Volumes", name)
            if not os.path.ismount(path) or os.path.realpath(path) == boot:
                continue
            entry = _entry(path, name)
            if entry:
                out.append(entry)
        return out

    # Linux: the desktop automounters put user-visible media under these two.
    # A card mounted by hand elsewhere is not discoverable this way, which is
    # the conservative half of the trade above.
    for base in ("/media", "/run/media"):
        if not os.path.isdir(base):
            continue
        roots = [os.path.join(base, d) for d in sorted(os.listdir(base))]
        # /media/<user>/<label> on most distros, /media/<label> on some.
        for root in roots:
            candidates = (
                [os.path.join(root, d) for d in sorted(os.listdir(root))]
                if os.path.isdir(root) and not os.path.ismount(root)
                else [root]
            )
            for path in candidates:
                if not os.path.ismount(path):
                    continue
                entry = _entry(path, os.path.basename(path))
                if entry:
                    out.append(entry)
    return out


@router.get("/api/removable-drives")
def removable_drives():
    """Mounted removable volumes the studio may write an SD card layout to."""
    try:
        return {"ok": True, "drives": _removable_drives()}
    except Exception as e:  # a platform quirk must not break the upload tab
        return {"ok": False, "error": str(e), "drives": []}


def _sd_destination(drive: str, path: str) -> Path:
    """Resolve one SD path ("/music/song.mp3") under `drive`, or raise.

    The subdirectory is checked against a fixed list and the filename is
    reduced to its basename, so nothing the browser sends can climb out of the
    chosen volume.
    """
    parts = [seg for seg in path.replace("\\", "/").split("/") if seg not in ("", ".", "..")]
    if len(parts) != 2 or parts[0].lower() not in _SD_SUBDIRS:
        raise ValueError(f"refusing to write {path!r} — expected /music/…, /shows/… or /video/…")
    root = Path(drive).resolve()
    dest = (root / parts[0].lower() / os.path.basename(parts[1])).resolve()
    if root not in dest.parents:
        raise ValueError(f"refusing to write outside {drive}")
    return dest


@router.post("/api/sd-copy")
async def sd_copy(
    meta: str = Form(...),
    files: list[UploadFile] = File(default=[]),
):
    """Write the songs and shows straight onto a card in a reader.

    `meta` is JSON {"drive", "paths": [...]} where `paths[i]` is the SD
    destination for `files[i]`. A file already present at the same size is
    skipped — that is what makes "the music is already on the card, just update
    the shows" the fast common case rather than a re-copy of every song.

    Streams progress as text, like the upload endpoints.
    """
    info = json.loads(meta)
    drive = (info.get("drive") or "").strip()
    paths = info.get("paths") or []

    allowed = {d["path"] for d in _removable_drives()}
    if drive not in allowed:
        # Either the card was pulled between listing and writing, or something
        # named a volume that was never offered. Both are refusals, not writes.
        return JSONResponse(
            {"ok": False, "error": f"{drive or '(none)'} is not a mounted removable drive"},
            status_code=400,
        )

    payloads = []
    for i, uf in enumerate(files):
        payloads.append((paths[i] if i < len(paths) else f"/{uf.filename}", await uf.read()))

    def stream():
        yield f"=== Writing to {drive} ({len(payloads)} file(s)) ===\n"
        written = skipped = 0
        try:
            for sd_path, data in payloads:
                dest = _sd_destination(drive, sd_path)
                if dest.exists() and dest.stat().st_size == len(data):
                    # Size alone, not a hash: a song is megabytes and the point
                    # of this path is speed. A same-name same-size file that is
                    # somehow different content is a case the serial path shares.
                    yield f"  = {sd_path} (already on the card)\n"
                    skipped += 1
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                # Write beside the target and rename, so a card pulled mid-write
                # leaves the previous file intact instead of a truncated one the
                # player would try to open.
                tmp = dest.with_suffix(dest.suffix + ".part")
                with open(tmp, "wb") as f:
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, dest)
                yield f"  -> {sd_path} ({len(data)} bytes)\n"
                written += 1
            yield f"\nCard written — {written} file(s) copied, {skipped} already present.\n"
        except Exception as e:
            yield f"\n[error] {e}\n"

    return StreamingResponse(stream(), media_type="text/plain")
