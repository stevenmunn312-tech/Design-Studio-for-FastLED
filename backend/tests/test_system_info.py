"""Host OS/build detection for the hardware validation report's Host OS
field — no browser API exposes this (User-Agent Client Hints only give a
coded Windows release marker, never the literal build number)."""
import platform
import sys

import app


def test_system_info_windows_11_build(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Windows")
    monkeypatch.setattr(sys, "getwindowsversion", lambda: type("V", (), {"build": 26200})(), raising=False)
    monkeypatch.setattr(platform, "win32_edition", lambda: "Core", raising=False)

    info = app._system_info()

    assert info["os"] == "Windows 11 Home"
    assert info["osVersion"] == "10.0.26200"


def test_system_info_windows_10_build(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Windows")
    monkeypatch.setattr(sys, "getwindowsversion", lambda: type("V", (), {"build": 19045})(), raising=False)
    monkeypatch.setattr(platform, "win32_edition", lambda: "Professional", raising=False)

    info = app._system_info()

    assert info["os"] == "Windows 10 Pro"
    assert info["osVersion"] == "10.0.19045"


def test_system_info_windows_falls_back_when_build_unavailable(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Windows")

    def _raise():
        raise AttributeError("no getwindowsversion on this interpreter")
    monkeypatch.setattr(sys, "getwindowsversion", _raise, raising=False)
    monkeypatch.setattr(platform, "win32_edition", lambda: None, raising=False)
    monkeypatch.setattr(platform, "release", lambda: "10")
    monkeypatch.setattr(platform, "version", lambda: "10.0.19045")

    info = app._system_info()

    assert info["os"] == "Windows 10"
    assert info["osVersion"] == "10.0.19045"


def test_system_info_macos(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    monkeypatch.setattr(platform, "mac_ver", lambda: ("14.5", ("", "", ""), "arm64"))

    info = app._system_info()

    assert info["os"] == "macOS 14.5"
    assert info["osVersion"] == "14.5"


def test_system_info_linux_uses_pretty_name(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setattr(
        platform, "freedesktop_os_release", lambda: {"PRETTY_NAME": "Ubuntu 24.04.2 LTS"}, raising=False,
    )
    monkeypatch.setattr(platform, "release", lambda: "6.8.0-generic")

    info = app._system_info()

    assert info["os"] == "Ubuntu 24.04.2 LTS"
    assert info["osVersion"] == "6.8.0-generic"


def test_system_info_linux_falls_back_without_os_release(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Linux")

    def _raise():
        raise OSError("no /etc/os-release")
    monkeypatch.setattr(platform, "freedesktop_os_release", _raise, raising=False)
    monkeypatch.setattr(platform, "release", lambda: "6.8.0-generic")

    info = app._system_info()

    assert info["os"] == "Linux 6.8.0-generic"
