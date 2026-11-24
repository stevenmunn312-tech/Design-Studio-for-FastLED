"""Self-contained Design Studio for FastLED desktop launcher.

The frozen distribution serves the production Vite build and the existing
FastAPI upload helper from one localhost process. On Windows the Studio opens
in its own native window, drawn by the system Microsoft Edge WebView2 runtime
through pywebview. On macOS and Linux it opens in an app window of an
installed Chromium browser (Chrome, Edge, Brave or Chromium), with its own
profile. Where neither is available the Studio opens in the user's default
browser, and a launcher with no terminal shows a small window that keeps the
Studio running until the user quits it. PyInstaller supplies the
Python runtime; bundled fbuild/esptool tools remove the need for a separate
Node or Python installation.
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
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


def is_macos_app(platform: str = sys.platform, executable: str = sys.executable) -> bool:
    """True when this is the frozen launcher inside a macOS ``.app`` bundle.

    Finder starts such an app with no terminal, so it needs a window of its
    own; the same executable run from a shell is still that app.
    """
    return platform == "darwin" and is_frozen() and ".app/Contents/MacOS/" in Path(executable).as_posix()


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
    from user_data import default_build_dir, default_data_dir

    # FLS_DATA_DIR is the same override the helper's storage honours, so the
    # launcher's own files (WebView2 profile, desktop.log) follow it too.
    data_overridden = data_dir is not None or bool(os.environ.get("FLS_DATA_DIR"))
    data = (data_dir or Path(os.environ.get("FLS_DATA_DIR") or default_data_dir())).resolve()
    data.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("FLS_DATA_DIR", str(data))
    # Build trees go to a short root on Windows (see `default_build_dir`). An
    # explicit data root keeps them with it, so an isolated run stays isolated.
    build = default_build_dir()
    if build is not None and not data_overridden:
        os.environ.setdefault("FLS_BUILD_DIR", str(build))

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


def add_desktop_routes(app) -> None:
    """The endpoints only the desktop launcher serves: status and window focus."""
    if not hasattr(app.state, "desktop_focus"):
        # Set by the launcher once a native window exists; a second launch
        # asks this instance to bring that window forward.
        app.state.desktop_focus = None
    if any(getattr(route, "name", None) == "desktop-status" for route in app.routes):
        return

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


def create_app():
    """Attach the packaged frontend to the tested upload-helper application."""
    _source_backend_on_path()
    from fastapi.staticfiles import StaticFiles
    from app import app

    add_desktop_routes(app)
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


def applescript_string(text: str) -> str:
    """``text`` as an AppleScript string literal."""
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _macos_alert(text: str) -> None:
    """Show a blocking macOS alert; it works before any window exists."""
    script = f"display alert {applescript_string(APP_NAME)} message {applescript_string(text)} as critical"
    subprocess.run(["osascript", "-e", script], check=False)


def _report_error(text: str) -> None:
    print(text, file=sys.stderr)
    if os.name == "nt" and not _has_console():
        _message_box(text, error=True)
    elif is_macos_app():
        _macos_alert(text)
    elif os.name != "nt" and not _in_terminal():
        _tk_alert(text)


def _in_terminal() -> bool:
    """True when somebody can read this process's output and press Ctrl+C."""
    return _has_console() and sys.stdout.isatty()


def _tk_alert(text: str) -> None:
    """Show a blocking error box on Linux, where a desktop launch has no terminal."""
    try:
        import tkinter as tk
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(APP_NAME, text)
        root.destroy()
    except Exception as exc:  # no Tk in this build, or no display
        print(f"Could not show the error window: {exc}", file=sys.stderr)


def logs_to_file(*, headless: bool, macos_app: bool) -> bool:
    """Whether output goes to ``desktop.log`` because nobody would see it.

    The headless smoke test reads the launcher's own output, and a Windows
    console build keeps its console.
    """
    if not _has_console():
        return True
    if headless or os.name == "nt":
        return False
    return macos_app or not sys.stdout.isatty()


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


def hand_to_browser(uri: str) -> None:
    """Open a web link in the default browser; drop anything else.

    `webbrowser.open` passes its argument to the operating system, which runs
    whatever handler is registered for the scheme: `file:` opens a local file
    or program, and installed apps add schemes of their own. A page the user
    is only looking at must not reach those.
    """
    try:
        scheme = urlsplit(uri).scheme.lower()
    except ValueError:
        return
    if scheme in ("http", "https", "mailto"):
        webbrowser.open(uri)


def native_window_available(platform: str = sys.platform) -> bool:
    """True when pywebview can drive the Edge WebView2 runtime on this machine."""
    if platform != "win32":
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
    are disabled. It also ignores the page's Fullscreen API requests, which
    only fill the web view inside the framed window. These hooks are pywebview's own event handlers, replaced
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
            hand_to_browser(uri)
        # Otherwise leave the request unhandled so WebView2 opens its own popup.

    def on_navigation_start(self, sender, args):
        uri = str(args.get_Uri())
        if opens_in_browser(uri, origin) and not uri.startswith("about:"):
            args.set_Cancel(True)
            hand_to_browser(uri)
            return
        original_navigation(self, sender, args)

    def on_fullscreen_element_changed(self, sender, _args):
        # WebView2 only fills its own control when the page requests element
        # fullscreen; the host window has to follow, as a browser tab's does.
        form = self.form
        wanted = bool(sender.ContainsFullScreenElement)
        if wanted == getattr(form, "is_fullscreen", False):
            return
        form.toggle_fullscreen()
        if not wanted and getattr(form, "old_state", None) is not None:
            # pywebview leaves the form Normal; return a maximized window to maximized.
            form.WindowState = form.old_state

    def on_webview_ready(self, sender, args):
        original_ready(self, sender, args)
        if args.IsSuccess:
            sender.CoreWebView2.Settings.AreDefaultContextMenusEnabled = True
            sender.CoreWebView2.ContainsFullScreenElementChanged += self.on_fullscreen_element_changed

    EdgeChrome.on_new_window_request = on_new_window_request
    EdgeChrome.on_navigation_start = on_navigation_start
    EdgeChrome.on_fullscreen_element_changed = on_fullscreen_element_changed
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


# ── Chromium app window (macOS, Linux) ────────────────────────────────────────

# The window class a Linux desktop matches against the desktop entry
# (StartupWMClass, and the entry's file name on Wayland) to pick the icon.
LINUX_APP_ID = "design-studio-for-fastled"
MACOS_CHROMIUM_APPS = ("Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium")
LINUX_CHROMIUM_COMMANDS = (
    "google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable",
    "brave-browser", "chromium", "chromium-browser",
)
# A browser still running after this long has opened a window of its own.
CHROMIUM_STARTUP_SECONDS = 3.0


def is_snap_browser(path: str) -> bool:
    """True for a snap-packaged browser, or the script Ubuntu installs to start one.

    A snap is confined to the non-hidden part of the home folder, so it cannot
    keep its profile in the Studio's data root.
    """
    resolved = Path(path).resolve()
    if resolved.name == "snap" or "snap" in resolved.parts[:2]:
        return True
    try:
        with resolved.open("rb") as handle:
            head = handle.read(2048)
    except OSError:
        return False
    return head.startswith(b"#!") and b"/snap/" in head


def find_chromium(platform: str = sys.platform, home: Path | None = None, which=shutil.which) -> str | None:
    """An installed Chromium browser that can show the Studio in an app window.

    macOS and Linux only: their system web views (WKWebView, WebKitGTK) lack
    Web MIDI and the File System Access pickers, and Windows has WebView2.
    """
    if platform == "darwin":
        for root in (Path("/Applications"), (home or Path.home()) / "Applications"):
            for name in MACOS_CHROMIUM_APPS:
                executable = root / f"{name}.app" / "Contents" / "MacOS" / name
                if executable.is_file():
                    return str(executable)
    elif platform.startswith("linux"):
        for name in LINUX_CHROMIUM_COMMANDS:
            found = which(name)
            if found and not is_snap_browser(found):
                return found
    return None


def chromium_command(executable: str, url: str, profile: Path, platform: str = sys.platform) -> list[str]:
    """Start ``executable`` with the Studio in a window with no tabs or address bar.

    Its own profile keeps localStorage (autosave, preferences) and granted
    microphone/MIDI permissions apart from the user's browsing, and makes this
    browser process the Studio's alone, so its exit means the Studio closed.
    """
    command = [
        executable,
        f"--app={url}",
        f"--user-data-dir={profile}",
        "--no-first-run",
        "--no-default-browser-check",
        # Otherwise the process can outlive its last window.
        "--disable-background-mode",
    ]
    if platform.startswith("linux"):
        # A new profile would otherwise ask to unlock the login keyring.
        command += [f"--class={LINUX_APP_ID}", "--password-store=basic"]
    return command


def _spawn(command: list[str]) -> subprocess.Popen:
    return subprocess.Popen(
        command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def start_chromium(command: list[str], startup_seconds: float = CHROMIUM_STARTUP_SECONDS) -> subprocess.Popen | None:
    """Open the app window; None when the browser did not stay up.

    A browser that exits at once either failed or handed the window to a copy
    already running on this profile, whose exit the launcher could not see.
    Both fall back to the default browser.
    """
    try:
        process = _spawn(command)
    except OSError as exc:
        print(f"App window unavailable: {exc}", file=sys.stderr)
        return None
    try:
        code = process.wait(timeout=startup_seconds)
    except subprocess.TimeoutExpired:
        return process
    print(f"App window unavailable: {command[0]} exited with status {code}", file=sys.stderr)
    return None


def _stop_process(process: subprocess.Popen) -> None:
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def run_chromium_window(app, process: subprocess.Popen, command: list[str], *, macos_app: bool) -> None:
    """Keep the Studio running until its Chromium app window's browser exits."""

    def reopen() -> None:
        # The running browser takes the request and opens the Studio window.
        _spawn(command)

    app.state.desktop_focus = reopen
    try:
        if macos_app:
            _run_macos_dock_loop(process, reopen)
        else:
            process.wait()
    except KeyboardInterrupt:
        pass
    finally:
        app.state.desktop_focus = None
        if process.poll() is None:
            _stop_process(process)


def _run_macos_dock_loop(process: subprocess.Popen, reopen) -> None:
    """Answer the Dock while the app window's browser runs.

    A Mac browser keeps running after its last window closes, as Mac apps do,
    so closing the Studio window does not stop the Studio. Clicking the app in
    the Dock opens the window again; quitting the browser window (Cmd+Q) or
    this app stops it. Tk supplies the event loop and stays hidden.
    """
    import tkinter as tk

    root = tk.Tk()
    root.title(APP_NAME)
    root.withdraw()

    def watch() -> None:
        if process.poll() is not None:
            root.destroy()
        else:
            root.after(500, watch)

    root.createcommand("::tk::mac::ReopenApplication", reopen)
    root.createcommand("::tk::mac::Quit", root.destroy)
    root.after(500, watch)
    root.mainloop()


# ── Linux desktop entry ───────────────────────────────────────────────────────

def desktop_entry_exec(path: str) -> str:
    """``path`` as one quoted argument of a desktop entry's Exec key.

    The Desktop Entry Specification escapes ``"``, `````, ``$`` and ``\\``
    inside the quotes, doubles ``%``, and then escapes every backslash once
    more as a string value.
    """
    quoted = path
    for char in ("\\", '"', "`", "$"):
        quoted = quoted.replace(char, "\\" + char)
    return ('"' + quoted + '"').replace("\\", "\\\\").replace("%", "%%")


def linux_desktop_entry(executable: Path, icon: Path) -> str:
    return "\n".join([
        "[Desktop Entry]",
        "Type=Application",
        f"Name={APP_NAME}",
        "Comment=Design LED patterns and upload them to a microcontroller",
        f"Exec={desktop_entry_exec(str(executable))}",
        f"Icon={icon}",
        "Terminal=false",
        "Categories=Development;Electronics;",
        f"StartupWMClass={LINUX_APP_ID}",
        "",
    ])


def install_linux_desktop_entry(
    executable: Path | None = None, icon: Path | None = None, applications: Path | None = None,
) -> Path | None:
    """Add the Studio to the desktop's application menu, pointing at this copy.

    The bundle is a portable folder with no installer, so the launcher writes
    its own entry on each start; that also follows the folder when it moves.
    The entry gives the menu item and the app window its icon.
    """
    executable = executable or Path(sys.executable).resolve()
    icon = icon or resource_dir() / "web" / "icon-512.png"
    if applications is None:
        data_home = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
        applications = Path(data_home) / "applications"
    entry = applications / f"{LINUX_APP_ID}.desktop"
    content = linux_desktop_entry(executable, icon)
    try:
        if entry.is_file() and entry.read_text(encoding="utf-8") == content:
            return entry
        applications.mkdir(parents=True, exist_ok=True)
        entry.write_text(content, encoding="utf-8")
    except OSError as exc:
        print(f"Could not write {entry}: {exc}", file=sys.stderr)
        return None
    return entry


# ── Control window (default-browser fallback) ─────────────────────────────────

def run_control_window(url: str, *, hide_on_close: bool) -> None:
    """Keep the Studio running, with a small window, until the user quits.

    Used when no Chromium browser can show an app window, so the Studio is in
    the default browser, and the launcher has no terminal: this window is then
    the user's handle on the local server. On macOS (``hide_on_close``) closing
    it only hides it, as with any Mac app; Quit (the button, Cmd+Q, or the Dock
    menu) stops the Studio, and clicking the Dock icon or opening the app again
    shows the window and opens the Studio in the browser. On Linux closing the
    window stops the Studio.
    """
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title(APP_NAME)
    root.resizable(False, False)
    keep_running = (
        "Keep this app running while you use it. Quit it to stop the Studio."
        if hide_on_close else
        "Keep this window open while you use it. Close it to stop the Studio."
    )

    def open_studio() -> None:
        webbrowser.open(url)

    def reopen() -> None:
        root.deiconify()
        root.lift()
        open_studio()

    frame = ttk.Frame(root, padding=20)
    frame.grid()
    ttk.Label(frame, text=f"{APP_NAME} is running", font=("TkHeadingFont", 15, "bold")).grid(
        row=0, column=0, columnspan=2, sticky="w")
    ttk.Label(
        frame,
        text=f"The Studio opens in your web browser at {url}\n{keep_running}",
        justify="left",
    ).grid(row=1, column=0, columnspan=2, sticky="w", pady=(6, 16))
    ttk.Button(frame, text="Quit", command=root.destroy).grid(row=2, column=0, sticky="w")
    ttk.Button(frame, text="Open Studio", command=open_studio, default="active").grid(row=2, column=1, sticky="e")
    frame.columnconfigure(1, weight=1)
    root.bind("<Return>", lambda _event: open_studio())

    if hide_on_close:
        root.protocol("WM_DELETE_WINDOW", root.withdraw)
        root.createcommand("::tk::mac::ReopenApplication", reopen)
        root.createcommand("::tk::mac::Quit", root.destroy)
    root.mainloop()


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


def _print_terminal_notice(url: str, data: Path) -> None:
    print("Design Studio for FastLED is starting in your browser.")
    print(f"Local address: {url}")
    print(f"User data:     {data}")
    print("Keep this window open while using the Studio; press Ctrl+C to stop it.")


def _wait_for_interrupt(thread: threading.Thread) -> None:
    """Serve until Ctrl+C (or until the process is ended, with no terminal)."""
    try:
        while thread.is_alive():
            thread.join(timeout=0.5)
    except KeyboardInterrupt:
        pass


def main() -> int:
    port = int(os.environ.get("FLS_DESKTOP_PORT", str(DEFAULT_PORT)))
    url = f"http://localhost:{port}/"
    # FLS_NO_BROWSER=1 serves headless (the packaging smoke test).
    headless = os.environ.get("FLS_NO_BROWSER") == "1"
    macos_app = is_macos_app()
    # A Finder-launched app has a stdout, but nobody reads it.
    console = _has_console() and not macos_app

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

    # Read before output moves to the log file.
    in_terminal = console and (os.name == "nt" or _in_terminal())
    data = configure_environment()
    if logs_to_file(headless=headless, macos_app=macos_app):
        _log_to_file(data / "desktop.log")
    app = create_app()
    chromium = None if headless or os.name == "nt" else find_chromium()
    if sys.platform.startswith("linux") and is_frozen() and not headless:
        install_linux_desktop_entry()

    if headless or (in_terminal and chromium is None and not native_window_available()):
        if not headless:
            threading.Thread(target=_open_when_ready, args=(port,), daemon=True).start()
            _print_terminal_notice(url, data)
        import uvicorn

        uvicorn.run(app, host=HOST, port=port, log_level="warning", access_log=False)
        return 0

    server, thread = _start_server(app, port)
    if not _wait_until_ready(port, server_thread=thread):
        _stop_server(server, thread)
        _report_error(f"{APP_NAME} could not start its local server. Details are in {data / 'desktop.log'}.")
        return 1
    try:
        command = chromium_command(chromium, url, data / "Chromium") if chromium else None
        window = start_chromium(command) if command else None
        if native_window_available():
            run_native_window(app, url, data)
        elif window is not None:
            run_chromium_window(app, window, command, macos_app=macos_app)
        elif os.name == "nt":
            # Windowed build without WebView2: the message box is the only
            # handle the user has on the background server.
            webbrowser.open(url)
            _message_box(
                f"{APP_NAME} is running in your web browser because the Microsoft Edge "
                "WebView2 Runtime is not installed.\n\n"
                "Keep this message open while you use the Studio. Choose OK to stop it."
            )
        else:
            webbrowser.open(url)
            if in_terminal:
                _print_terminal_notice(url, data)
                _wait_for_interrupt(thread)
            else:
                try:
                    run_control_window(url, hide_on_close=macos_app)
                except Exception as exc:  # no Tk in this build, or no display
                    print(f"Control window unavailable: {exc}", file=sys.stderr)
                    _wait_for_interrupt(thread)
    finally:
        _stop_server(server, thread)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
