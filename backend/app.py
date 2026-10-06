"""Design Studio for FastLED — local upload helper.

A tiny FastAPI service the browser app talks to so it can compile and upload
sketches to a board over USB — the browser can't launch a local CLI itself.
Mirrors the proven setup from the Matrix Studio backend.

Two build engines are supported: `arduino-cli` (the default when installed)
and `fbuild` (FastLED's own PlatformIO-compatible build tool, available as an
explicit experimental choice). `toolchain._active_engine()` picks one; `/api/engine`
lets the UI query or override the choice.

Run (from the repo root):

    python -m venv backend/.venv
    backend/.venv/Scripts/activate            # Windows  (or: source backend/.venv/bin/activate)
    pip install -r backend/requirements.txt
    uvicorn app:app --reload --port 8008 --app-dir backend

Every endpoint degrades gracefully when neither engine is installed, so the
studio keeps working (it just falls back to showing copy-paste commands).

This module owns the app, its lifespan and the local-only trust middleware.
The routes live in `toolchain` (build engines), `firmware` (compile, upload
and serial), `streaming` (Adalight and Art-Net), `sd_card` and `storage`
(saved patterns and projects).
"""
from __future__ import annotations

import contextlib
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import firmware
import sd_card
import storage
import streaming
import toolchain


@contextlib.asynccontextmanager
async def _lifespan(_app: FastAPI):
    storage._migrate_legacy_patterns(storage._LEGACY_PATTERNS_DIR, storage._PATTERNS_DIR)
    yield


app = FastAPI(title="Design Studio for FastLED Upload Helper", lifespan=_lifespan)

# Hosts the helper will answer. `*.localhost` covers the named Vite dev and
# preview origins (`design-studio-for-fastled.localhost`, `fastled-studio.localhost`).
# Anything else is a DNS-rebinding host and is refused before a route runs.
_LOCAL_HOST = (
    r"(?:localhost|127\.0\.0\.1|\[::1\]|(?:[A-Za-z0-9-]+\.)+localhost)(?::\d+)?"
)
_LOCAL_HOST_RE = re.compile(rf"(?i)^{_LOCAL_HOST}$")
_LOCAL_ORIGIN_RE = re.compile(rf"(?i)^https?://{_LOCAL_HOST}$")
_ORIGIN_CHECKED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_SAME_SITE_FETCH = {"same-origin", "none"}


def _local_request_allowed(request: Request) -> bool:
    """True when this request is from the machine running the helper.

    `Host` must always be local. State-changing methods, and the serial
    monitor (a GET an `<img>` can fire), also need a local `Origin` when the
    browser sent one. With no `Origin`, only a missing, same-origin, or `none`
    `Sec-Fetch-Site` is accepted — that is a non-browser client or a
    same-document call, not another website.
    """
    host = request.headers.get("host")
    if host is None or _LOCAL_HOST_RE.fullmatch(host.strip()) is None:
        return False
    needs_origin = (
        request.method in _ORIGIN_CHECKED_METHODS
        or (request.method == "GET" and request.url.path == "/api/serial/monitor")
    )
    if not needs_origin:
        return True
    origin = request.headers.get("origin")
    if origin is not None:
        return _LOCAL_ORIGIN_RE.fullmatch(origin.strip()) is not None
    site = request.headers.get("sec-fetch-site")
    return site is None or site.strip().lower() in _SAME_SITE_FETCH


class LocalTrustMiddleware:
    """Reject cross-site and rebound-host calls before CORS or a route sees them.

    CORS only decides whether the browser may read a response. A simple POST
    is sent, and executed, either way.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request = Request(scope)
        if _local_request_allowed(request):
            await self.app(scope, receive, send)
            return
        response = JSONResponse({"ok": False, "error": "forbidden"}, status_code=403)
        await response(scope, receive, send)


# The studio is served from a different origin (the Vite dev server, a named
# `*.localhost` host, or the desktop launcher), so allow those pages to read
# responses. The trust middleware above is what decides whether the request
# runs at all.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=_LOCAL_ORIGIN_RE.pattern,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _desktop_security_headers(request: Request, call_next):
    """Keep bundled static pages cross-origin isolated like Vite dev/preview.

    These headers are harmless on API-only helper responses and ensure the
    desktop launcher's same-process static site retains the browser capabilities
    used by the normal production preview.
    """
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    return response


# Outermost: a forbidden host or origin never reaches CORS or a route.
app.add_middleware(LocalTrustMiddleware)


# Every route sits behind the middleware above.
app.include_router(toolchain.router)
app.include_router(streaming.router)
app.include_router(firmware.router)
app.include_router(sd_card.router)
app.include_router(storage.router)
