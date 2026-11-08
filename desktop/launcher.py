"""Self-contained Design Studio for FastLED desktop launcher.

The frozen distribution serves the production Vite build and the existing
FastAPI upload helper from one localhost process. On Windows the Studio opens
in its own native window, drawn by the system Microsoft Edge WebView2 runtime
through pywebview; elsewhere, or when WebView2 is unavailable, it opens the
user's default browser. PyInstaller supplies the Python runtime; bundled
fbuild/esptool tools remove the need for a separate Node or Python installation.
"""
from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from urllib.parse import urlsplit


APP_NAME = "Design Studio for FastLED"
DEFAULT_PORT = 8008
HOST = "127.0.0.1"
# --bg-primary in src/themes/tokens.css, so the window does not flash white
# before the app paints.
WINDOW_BACKGROUND = "#0d0f12"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def install_dir() -> Path:
    """Folder containing the launcher executable (and external tools)."""
    return Path(sys.executable).resolve().parent if is_frozen() else Path(__file__).resolve().parents[1]


def resource_dir() -> Path:
    """Folder containing PyInstaller-collected data such as ``web/``."""
    return Path(__file__).resolve().parent if is_frozen() else Path(__file__).resolve().parents[1]


def configure_environment(data_dir: Path | None = None) -> Path:
    """Point every mutable helper path outside the installed application.

    The data root takes caches, toolchains and the window profile. Projects
    and patterns are the helper storage's own choice (Documents), not set here.
    """
    _source_backend_on_path()
    from user_data import default_data_dir

    # FLS_DATA_DIR is the same override the helper's storage honours, so the
    # launcher's own files (WebView2 profile, desktop.log) follow it too.
    data = (data_dir or Path(os.environ.get("FLS_DATA_DIR") or default_data_dir())).resolve()
    data.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("FLS_DATA_DIR", str(data))

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

    if not hasattr(app.state, "desktop_focus"):
        # Set by the launcher once a native window exists; a second launch
        # asks this instance to bring that window forward.
        app.state.desktop_focus = None

    if not any(getattr(route, "name", None) == "desktop-status" for route in app.routes):
        @app.get("/api/desktop/status", include_in_schema=False, name="desktop-status")
        def desktop_status() -> dict[str, object]:
            return {"ok": True, "desktop": True, "version": app_version()}

        @app.post("/api/desktop/focus", include_in_schema=False, name="desktop-focus")
        def desktop_focus() -> dict[str, object]:
            focus = app.state.desktop_focus
            if focus is None:
                return {"ok": True, "focused": False}
            focus()
            return {"ok": True, "focused": True}

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


def _focus_running_window(port: int) -> bool:
    """Ask a running desktop instance to raise its native window."""
    request = urllib.request.Request(f"http://localhost:{port}/api/desktop/focus", data=b"", method="POST")
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            return json.loads(response.read().decode("utf-8")).get("focused") is True
    except (OSError, ValueError, urllib.error.URLError):
        return False


def _port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((HOST, port))
        except OSError:
            return False
    return True


def _wait_until_ready(port: int, timeout: float = 30.0, server_thread: threading.Thread | None = None) -> bool:
    url = f"http://localhost:{port}/"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if server_thread is not None and not server_thread.is_alive():
            return False  # uvicorn exits its thread when startup fails
        try:
            with urllib.request.urlopen(url, timeout=0.5) as response:
                if response.status == 200:
                    return True
        except (OSError, urllib.error.URLError):
            time.sleep(0.1)
    return False


def _open_when_ready(port: int) -> None:
    if _wait_until_ready(port, timeout=10.0):
        webbrowser.open(f"http://localhost:{port}/")


# ── Console-less (windowed) Windows build ─────────────────────────────────────

def _has_console() -> bool:
    """False in the windowed Windows build, where PyInstaller leaves stdout as None."""
    return sys.stdout is not None


def _log_to_file(path: Path) -> None:
    """Give a console-less process somewhere to write; uvicorn's logging needs a stream."""
    stream = open(path, "w", encoding="utf-8", buffering=1)  # noqa: SIM115 — lives for the process
    sys.stdout = stream
    sys.stderr = stream


def _message_box(text: str, *, error: bool = False) -> None:
    """Show a blocking Windows message box (the only UI a console-less launcher has)."""
    import ctypes

    MB_OK, MB_ICONERROR, MB_ICONINFORMATION = 0x0, 0x10, 0x40
    flags = MB_OK | (MB_ICONERROR if error else MB_ICONINFORMATION)
    ctypes.windll.user32.MessageBoxW(None, text, APP_NAME, flags)


def _report_error(text: str) -> None:
    print(text, file=sys.stderr)
    if os.name == "nt" and not _has_console():
        _message_box(text, error=True)


# ── Native window (Windows, WebView2) ─────────────────────────────────────────

def is_app_url(uri: str, origin: str) -> bool:
    """True when ``uri`` has the Studio's own scheme, host and port."""
    try:
        target, app = urlsplit(uri), urlsplit(origin)
        return (target.scheme, target.hostname, target.port) == (app.scheme, app.hostname, app.port)
    except ValueError:
        return False


def opens_in_browser(uri: str, origin: str) -> bool:
    """Whether a link the page opens belongs in the user's default browser.

    Blank and same-origin popups stay inside WebView2: the community share
    flow opens an empty named window synchronously and later posts a form into
    it by name, which only works when WebView2 owns that window. Everything
    else (GitHub issues, documentation, external sites) goes to the browser the
    user is signed in to.
    """
    if uri in ("", "about:blank") or uri.startswith("data:"):
        return False
    return not is_app_url(uri, origin)


def native_window_available() -> bool:
    """True when pywebview can drive the Edge WebView2 runtime on this machine."""
    if sys.platform != "win32":
        return False
    try:
        from webview.platforms import winforms
    except Exception as exc:  # pywebview, pythonnet or .NET Framework missing
        print(f"Native window unavailable: {exc}", file=sys.stderr)
        return False
    # pywebview silently falls back to the retired MSHTML (Internet Explorer)
    # engine when WebView2 is missing; the Studio cannot run there.
    return winforms.renderer == "edgechromium"


def _install_webview_overrides(origin: str) -> None:
    """Make pywebview's WebView2 host behave like the browser the app targets.

    pywebview 6.2.1 hard-wires three choices that break the Studio: every popup
    goes to the default browser (breaking the community share handoff), the
    main window may navigate away from the app, and text-field context menus
    are disabled. These hooks are pywebview's own event handlers, replaced
    before any window exists; ``constraints.txt`` pins the version they were
    written against.
    """
    from webview.platforms.edgechromium import EdgeChrome

    original_ready = EdgeChrome.on_webview_ready
    original_navigation = EdgeChrome.on_navigation_start

    def on_new_window_request(self, sender, args):
        uri = str(args.get_Uri())
        if opens_in_browser(uri, origin):
            args.set_Handled(True)
            webbrowser.open(uri)
        # Otherwise leave the request unhandled so WebView2 opens its own popup.

    def on_navigation_start(self, sender, args):
        uri = str(args.get_Uri())
        if opens_in_browser(uri, origin) and not uri.startswith("about:"):
            args.set_Cancel(True)
            webbrowser.open(uri)
            return
        original_navigation(self, sender, args)

    def on_webview_ready(self, sender, args):
        original_ready(self, sender, args)
        if args.IsSuccess:
            sender.CoreWebView2.Settings.AreDefaultContextMenusEnabled = True

    EdgeChrome.on_new_window_request = on_new_window_request
    EdgeChrome.on_navigation_start = on_navigation_start
    EdgeChrome.on_webview_ready = on_webview_ready


def _raise_window(window) -> None:
    window.restore()
    window.show()
    # Windows refuses SetForegroundWindow from a background process; briefly
    # pinning the window on top is the supported way to surface it.
    window.on_top = True
    window.on_top = False


def run_native_window(app, url: str, data: Path) -> None:
    """Show the Studio in a WebView2 window until the user closes it."""
    import webview

    _install_webview_overrides(url)
    # Exports (firmware binaries, pattern and project files) are downloads.
    webview.settings["ALLOW_DOWNLOADS"] = True
    window = webview.create_window(
        APP_NAME,
        url,
        width=1440,
        height=900,
        min_size=(1024, 640),
        maximized=True,
        background_color=WINDOW_BACKGROUND,
        # Browser behaviour: selectable text, pinch/Ctrl+wheel zoom, native drag.
        text_select=True,
        zoomable=True,
        draggable=True,
    )
    app.state.desktop_focus = lambda: _raise_window(window)
    try:
        # A persistent profile keeps localStorage (autosave, preferences) and
        # granted microphone/MIDI permissions between launches.
        webview.start(
            private_mode=False,
            storage_path=str(data / "WebView2"),
            debug=os.environ.get("FLS_DESKTOP_DEBUG") == "1",
        )
    finally:
        app.state.desktop_focus = None


# ── Entry point ───────────────────────────────────────────────────────────────

def _start_server(app, port: int):
    import uvicorn

    server = uvicorn.Server(uvicorn.Config(app, host=HOST, port=port, log_level="warning", access_log=False))
    thread = threading.Thread(target=server.run, name="design-studio-helper", daemon=True)
    thread.start()
    return server, thread


def _stop_server(server, thread: threading.Thread) -> None:
    server.should_exit = True
    thread.join(timeout=10)


def main() -> int:
    port = int(os.environ.get("FLS_DESKTOP_PORT", str(DEFAULT_PORT)))
    url = f"http://localhost:{port}/"
    # FLS_NO_BROWSER=1 serves headless (the packaging smoke test).
    headless = os.environ.get("FLS_NO_BROWSER") == "1"
    console = _has_console()

    if _desktop_is_running(port):
        if not headless and not _focus_running_window(port):
            webbrowser.open(url)
        return 0
    if not _port_available(port):
        _report_error(
            f"{APP_NAME} cannot start because localhost port {port} is already in use.\n"
            "Close the other upload-helper process and launch Design Studio for FastLED again."
        )
        return 2

    data = configure_environment()
    if not console:
        _log_to_file(data / "desktop.log")
    app = create_app()

    if headless or (console and not native_window_available()):
        if not headless:
            threading.Thread(target=_open_when_ready, args=(port,), daemon=True).start()
            print("Design Studio for FastLED is starting in your browser.")
            print(f"Local address: {url}")
            print(f"User data:     {data}")
            print("Keep this window open while using the Studio; press Ctrl+C to stop it.")
        import uvicorn

        uvicorn.run(app, host=HOST, port=port, log_level="warning", access_log=False)
        return 0

    server, thread = _start_server(app, port)
    if not _wait_until_ready(port, server_thread=thread):
        _stop_server(server, thread)
        _report_error(f"{APP_NAME} could not start its local server. Details are in {data / 'desktop.log'}.")
        return 1
    try:
        if native_window_available():
            run_native_window(app, url, data)
        else:
            # Windowed build without WebView2: the message box is the only
            # handle the user has on the background server.
            webbrowser.open(url)
            _message_box(
                f"{APP_NAME} is running in your web browser because the Microsoft Edge "
                "WebView2 Runtime is not installed.\n\n"
                "Keep this message open while you use the Studio. Choose OK to stop it."
            )
    finally:
        _stop_server(server, thread)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
