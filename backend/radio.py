"""Internet radio for the studio's preview: a relay, and the stream's titles.

A Music Player whose Music Source is Internet Radio plays its stations in the
preview through this relay. The browser can play most stations directly, but
the preview analyses what it plays (levels, beats, spectrum) through Web
Audio, which reads only audio its server shares across origins, and most
station servers do not. Relayed through the helper, every station plays and
drives the analysis.

The relay also asks the station for its ICY metadata, strips it out of the
audio, and keeps the last `StreamTitle` it saw, so the preview can show what
is on air as the board does.

A station URL is held to the same rules as one typed into the studio
(`radioStationUrlProblem` in src/state/player/radioStations.ts) before
anything is fetched. See docs/design/internet-radio.md.
"""
from __future__ import annotations

import re
import threading
import time
import urllib.parse
import urllib.request
from http.client import HTTPResponse

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

router = APIRouter()

_URL_MAX = 255
# Printable ASCII without the characters a URL never holds raw; the same set
# the studio and the firmware allow.
_URL_CHARS = re.compile(r"^[A-Za-z0-9\-._~:/?\[\]@!$&'()*+,;=%]+$")
_CONNECT_TIMEOUT_S = 8
_CHUNK = 4096
_PLAYLIST_BYTES = 64 * 1024
_TITLES_MAX = 64
_USER_AGENT = "DesignStudioForFastLED/1.0 (radio preview)"

_titles: dict[str, tuple[str, float]] = {}
_titles_lock = threading.Lock()


def station_url_problem(url: str) -> str | None:
    """Why this stream URL cannot be played, or None when it can."""
    text = url.strip()
    if not text:
        return "The stream URL is empty."
    if len(text) > _URL_MAX:
        return f"The stream URL is longer than {_URL_MAX} characters."
    if not re.match(r"(?i)^https?://", text):
        return "The stream URL must start with http:// or https://."
    if not _URL_CHARS.fullmatch(text):
        return "The stream URL holds a space or a character a stream address cannot use."
    parsed = urllib.parse.urlsplit(text)
    if not parsed.hostname:
        return "The stream URL has no host name."
    if parsed.netloc.startswith("["):
        return "The board cannot reach an IPv6 address; use the station's host name."
    if parsed.username or parsed.password:
        return "The stream URL may not carry a user name or password."
    if "#" in text:
        return "The stream URL may not carry a # fragment."
    return None


def _open(url: str) -> HTTPResponse:
    request = urllib.request.Request(url, headers={"Icy-MetaData": "1", "User-Agent": _USER_AGENT})
    return urllib.request.urlopen(request, timeout=_CONNECT_TIMEOUT_S)  # noqa: S310 - scheme checked above


def _is_playlist(url: str, content_type: str) -> bool:
    kind = content_type.lower()
    path = urllib.parse.urlsplit(url).path.lower()
    return ("mpegurl" in kind or "scpls" in kind or "x-pls" in kind
            or path.endswith((".m3u", ".m3u8", ".pls")))


def playlist_stream_url(text: str) -> str | None:
    """The first stream a .m3u or .pls playlist names, or None."""
    for raw in text.splitlines():
        line = raw.strip()
        if line.lower().startswith("file") and "=" in line:
            line = line.split("=", 1)[1].strip()
        if re.match(r"(?i)^https?://", line) and station_url_problem(line) is None:
            return line
    return None


def stream_title(metadata: bytes) -> str | None:
    """`StreamTitle` from one ICY metadata block, or None when it has none."""
    text = metadata.rstrip(b"\0").decode("utf-8", errors="replace")
    match = re.search(r"StreamTitle='(.*?)';", text, re.S)
    if not match:
        return None
    return re.sub(r"[\x00-\x1f\x7f]+", " ", match.group(1)).strip()[:160]


def _remember_title(url: str, title: str) -> None:
    with _titles_lock:
        _titles[url] = (title, time.time())
        if len(_titles) > _TITLES_MAX:
            oldest = min(_titles, key=lambda key: _titles[key][1])
            del _titles[oldest]


def _read_exact(response: HTTPResponse, size: int) -> bytes:
    data = b""
    while len(data) < size:
        chunk = response.read(size - len(data))
        if not chunk:
            break
        data += chunk
    return data


def relay_audio(response: HTTPResponse, url: str):
    """The station's audio with its ICY metadata blocks taken out."""
    try:
        metaint = int(response.headers.get("icy-metaint") or 0)
    except ValueError:
        metaint = 0
    remaining = metaint
    try:
        with response:
            while True:
                chunk = response.read(min(remaining, _CHUNK) if metaint else _CHUNK)
                if not chunk:
                    return
                yield chunk
                if not metaint:
                    continue
                remaining -= len(chunk)
                if remaining > 0:
                    continue
                length = response.read(1)
                if not length:
                    return
                if length[0]:
                    title = stream_title(_read_exact(response, length[0] * 16))
                    if title is not None:
                        _remember_title(url, title)
                remaining = metaint
    except (OSError, ValueError):
        return


@router.get("/api/radio/stream")
def radio_stream(url: str = ""):
    """Relay one station's audio to the preview, following a playlist once."""
    problem = station_url_problem(url)
    if problem:
        return JSONResponse({"ok": False, "error": problem}, status_code=400)
    try:
        response = _open(url)
        content_type = response.headers.get("content-type", "")
        if _is_playlist(url, content_type):
            with response:
                inner = playlist_stream_url(response.read(_PLAYLIST_BYTES).decode("utf-8", errors="replace"))
            if inner is None:
                return JSONResponse({"ok": False, "error": "The playlist names no stream."}, status_code=502)
            response = _open(inner)
            content_type = response.headers.get("content-type", "")
    except (OSError, ValueError) as error:
        return JSONResponse({"ok": False, "error": f"The station did not answer: {error}"}, status_code=502)
    media_type = content_type.split(";")[0].strip() or "audio/mpeg"
    if not media_type.startswith(("audio/", "application/ogg")):
        response.close()
        return JSONResponse({"ok": False, "error": f"The station sent {media_type}, not audio."}, status_code=502)
    return StreamingResponse(
        relay_audio(response, url),
        media_type=media_type,
        headers={"Cache-Control": "no-store"},
    )


@router.get("/api/radio/now")
def radio_now(url: str = ""):
    """What the station last said is on air, while the preview plays it."""
    with _titles_lock:
        entry = _titles.get(url.strip())
    return {"ok": True, "title": entry[0] if entry else ""}
