"""Self-contained FastLED Studio desktop launcher.

The frozen distribution serves the production Vite build and the existing
FastAPI upload helper from one localhost process, then opens the user's default
browser. PyInstaller supplies the Python runtime; bundled fbuild/esptool tools
remove the need for a separate Node or Python installation.
"""
from __future__ import annotations

import json
import os
import platform
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


DEFAULT_PORT = 8008
HOST = "127.0.0.1"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def install_dir() -> Path:
    """Folder containing the launcher executable (and external tools)."""
    return Path(sys.executable).resolve().parent if is_frozen() else Path(__file__).resolve().parents[1]


def resource_dir() -> Path:
    """Folder containing PyInstaller-collected data such as ``web/``."""
    return Path(__file__).resolve().parent if is_frozen() else Path(__file__).resolve().parents[1]


def default_data_dir(system: str | None = None) -> Path:
    """Return the per-user mutable-data root for the active desktop OS."""
    name = system or platform.system()
    if name == "Windows":
        base = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / "AppData" / "Local"))
        return base / "FastLED Studio"
    if name == "Darwin":
        return Path.home() / "Library" / "Application Support" / "FastLED Studio"
    base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    return base / "fastled-studio"


def configure_environment(data_dir: Path | None = None) -> Path:
    """Point every mutable helper path outside the installed application."""
    data = (data_dir or default_data_dir()).resolve()
    data.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("FLS_DATA_DIR", str(data))
    os.environ.setdefault("FLS_PATTERNS_DIR", str(data / "My Patterns"))
    os.environ.setdefault("FLS_PROJECTS_DIR", str(data / "Projects"))

    tools = install_dir() / "tools"
    if tools.is_dir():
        os.environ["PATH"] = str(tools) + os.pathsep + os.environ.get("PATH", "")
        fbuild = tools / ("fbuild.exe" if os.name == "nt" else "fbuild")
        if fbuild.is_file():
            os.environ.setdefault("FBUILD_BIN", str(fbuild))
    return data


def web_root() -> Path:
    root = resource_dir() / ("web" if is_frozen() else "dist")
    if not (root / "index.html").is_file():
        raise RuntimeError(f"Packaged web application is missing: {root / 'index.html'}")
    return root


def app_version() -> str:
    try:
        return str(json.loads((resource_dir() / "package.json").read_text(encoding="utf-8"))["version"])
    except (OSError, KeyError, TypeError, ValueError):
        return "unknown"


def _source_backend_on_path() -> None:
    if is_frozen():
        return
    backend = str(Path(__file__).resolve().parents[1] / "backend")
    if backend not in sys.path:
        sys.path.insert(0, backend)


def create_app():
    """Attach the packaged frontend to the tested upload-helper application."""
    _source_backend_on_path()
    from fastapi.staticfiles import StaticFiles
    from app import app

    if not any(getattr(route, "name", None) == "desktop-status" for route in app.routes):
        @app.get("/api/desktop/status", include_in_schema=False, name="desktop-status")
        def desktop_status() -> dict[str, object]:
            return {"ok": True, "desktop": True, "version": app_version()}

    if not any(getattr(route, "name", None) == "desktop-static" for route in app.routes):
        # Added after every /api route, so StaticFiles is the final SPA/static
        # fallback and can never shadow the helper endpoints.
        app.mount("/", StaticFiles(directory=web_root(), html=True), name="desktop-static")
    return app


def _desktop_is_running(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://localhost:{port}/api/desktop/status", timeout=0.5) as response:
            data = json.loads(response.read().decode("utf-8"))
        return data.get("desktop") is True
    except (OSError, ValueError, urllib.error.URLError):
        return False


def _port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def _open_when_ready(port: int) -> None:
    url = f"http://localhost:{port}/"
    for _ in range(100):
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                if response.status == 200:
                    if os.environ.get("FLS_NO_BROWSER") != "1":
                        webbrowser.open(url)
                    return
        except (OSError, urllib.error.URLError):
            time.sleep(0.1)


def main() -> int:
    port = int(os.environ.get("FLS_DESKTOP_PORT", str(DEFAULT_PORT)))
    if _desktop_is_running(port):
        if os.environ.get("FLS_NO_BROWSER") != "1":
            webbrowser.open(f"http://localhost:{port}/")
        return 0
    if not _port_available(port):
        print(f"FastLED Studio cannot start because localhost port {port} is already in use.", file=sys.stderr)
        print("Close the other upload-helper process and launch FastLED Studio again.", file=sys.stderr)
        return 2

    data = configure_environment()
    app = create_app()
    threading.Thread(target=_open_when_ready, args=(port,), daemon=True).start()

    print("FastLED Studio is starting in your browser.")
    print(f"Local address: http://localhost:{port}/")
    print(f"User data:     {data}")
    print("Keep this window open while using the Studio; press Ctrl+C to stop it.")

    import uvicorn

    uvicorn.run(app, host=HOST, port=port, log_level="warning", access_log=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
