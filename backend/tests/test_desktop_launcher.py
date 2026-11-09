from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from desktop import launcher  # noqa: E402


def test_configure_environment_keeps_mutable_state_outside_bundle(monkeypatch, tmp_path):
    bundle = tmp_path / "installed"
    tools = bundle / "tools"
    tools.mkdir(parents=True)
    fbuild = tools / ("fbuild.exe" if os.name == "nt" else "fbuild")
    fbuild.write_bytes(b"tool")
    data = tmp_path / "user-data"

    monkeypatch.setattr(launcher, "install_dir", lambda: bundle)
    for key in ("FLS_DATA_DIR", "FLS_PATTERNS_DIR", "FLS_PROJECTS_DIR", "FBUILD_BIN"):
        monkeypatch.delenv(key, raising=False)
    old_path = os.environ.get("PATH", "")

    assert launcher.configure_environment(data) == data.resolve()
    assert os.environ["FLS_DATA_DIR"] == str(data.resolve())
    # Projects and patterns stay in Documents: the launcher leaves them to storage.
    assert "FLS_PATTERNS_DIR" not in os.environ
    assert "FLS_PROJECTS_DIR" not in os.environ
    assert os.environ["FBUILD_BIN"] == str(fbuild)
    assert os.environ["PATH"].split(os.pathsep, 1) == [str(tools), old_path]


def test_app_version_reads_package_metadata():
    import json

    expected = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    assert launcher.app_version() == expected


ORIGIN = "http://localhost:8008/"


def test_is_app_url_matches_scheme_host_and_port():
    assert launcher.is_app_url("http://localhost:8008/projects?id=1", ORIGIN)
    assert not launcher.is_app_url("http://localhost:8009/", ORIGIN)
    assert not launcher.is_app_url("https://localhost:8008/", ORIGIN)
    assert not launcher.is_app_url("http://127.0.0.1:8008/", ORIGIN)


def test_external_links_open_in_the_browser_but_app_and_blank_popups_stay():
    assert launcher.opens_in_browser("https://github.com/owner/repo/issues/new", ORIGIN)
    assert launcher.opens_in_browser("http://localhost:3000/", ORIGIN)
    # The community share flow opens an empty named window, then posts a form into it.
    assert not launcher.opens_in_browser("about:blank", ORIGIN)
    assert not launcher.opens_in_browser("", ORIGIN)
    assert not launcher.opens_in_browser("data:text/html,hi", ORIGIN)
    assert not launcher.opens_in_browser("http://localhost:8008/help", ORIGIN)


def test_native_window_is_windows_only():
    assert launcher.native_window_available("darwin") is False
    assert launcher.native_window_available("linux") is False


def test_focus_endpoint_raises_the_native_window_when_one_exists():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    # A fresh app: create_app() also mounts the built frontend (dist/), which
    # the backend CI job never builds, onto the helper app every test shares.
    app = FastAPI()
    launcher.add_desktop_routes(app)
    client = TestClient(app)
    raised: list[bool] = []

    assert client.post("/api/desktop/focus").json() == {"ok": True, "focused": False}

    app.state.desktop_focus = lambda: raised.append(True)
    assert client.post("/api/desktop/focus").json() == {"ok": True, "focused": True}
    assert raised == [True]
    assert client.get("/api/desktop/status").json()["desktop"] is True


@pytest.mark.skipif(sys.platform != "win32", reason="pywebview's WebView2 host is Windows-only")
def test_pinned_pywebview_still_has_the_handlers_the_launcher_replaces():
    edgechromium = pytest.importorskip("webview.platforms.edgechromium")

    for name in ("on_new_window_request", "on_navigation_start", "on_webview_ready"):
        assert callable(getattr(edgechromium.EdgeChrome, name)), name


@pytest.mark.skipif(sys.platform != "win32", reason="pywebview's WebView2 host is Windows-only")
def test_page_fullscreen_takes_the_whole_window_and_restores_maximized(monkeypatch):
    edgechromium = pytest.importorskip("webview.platforms.edgechromium")
    winforms = pytest.importorskip("webview.platforms.winforms")
    # The launcher drives pywebview's own window toggle.
    assert callable(winforms.BrowserView.BrowserForm.toggle_fullscreen)
    for name in ("on_new_window_request", "on_navigation_start", "on_webview_ready"):
        monkeypatch.setattr(edgechromium.EdgeChrome, name, getattr(edgechromium.EdgeChrome, name))
    monkeypatch.setattr(edgechromium.EdgeChrome, "on_fullscreen_element_changed", None, raising=False)
    launcher._install_webview_overrides("http://localhost:8008")

    class Form:
        is_fullscreen = False
        old_state = None
        WindowState = "Maximized"

        def toggle_fullscreen(self):
            if not self.is_fullscreen:
                self.old_state = self.WindowState
            self.WindowState = "Normal"
            self.is_fullscreen = not self.is_fullscreen

    class Core:
        ContainsFullScreenElement = True

    host = type("Host", (), {"form": Form()})()
    changed = edgechromium.EdgeChrome.on_fullscreen_element_changed

    changed(host, Core(), None)
    assert host.form.is_fullscreen
    changed(host, Core(), None)  # a repeated event must not toggle back
    assert host.form.is_fullscreen

    Core.ContainsFullScreenElement = False
    changed(host, Core(), None)
    assert not host.form.is_fullscreen
    assert host.form.WindowState == "Maximized"


def test_configure_environment_honours_the_data_dir_override(monkeypatch, tmp_path):
    override = tmp_path / "isolated"
    monkeypatch.setattr(launcher, "install_dir", lambda: tmp_path / "installed")
    monkeypatch.setenv("FLS_DATA_DIR", str(override))

    assert launcher.configure_environment() == override.resolve()
