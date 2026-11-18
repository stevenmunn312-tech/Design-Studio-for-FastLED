"""The Install button fetches one named arduino-cli release and checks it.

The download is unpacked and run, so "whatever is latest today" with no check
would run anything the download host, or something in front of it, sent back.
"""
import hashlib
import io
import zipfile

import toolchain


class _Download(io.BytesIO):
    headers = {"Content-Length": "0"}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _archive(payload: bytes) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("arduino-cli.exe", payload)
    return buffer.getvalue()


def _install(monkeypatch, tmp_path, archive: bytes, expected: str):
    requested = []

    def urlopen(url, timeout=0):
        requested.append(url)
        return _Download(archive)

    monkeypatch.setattr(toolchain, "_cli_asset", lambda: ("Windows_64bit", "zip", "arduino-cli.exe"))
    monkeypatch.setattr(toolchain.urllib.request, "urlopen", urlopen)
    monkeypatch.setattr(toolchain, "_BIN_DIR", tmp_path / "bin")
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI_SHA256", {"Windows_64bit.zip": expected})
    monkeypatch.setattr(toolchain, "_load_config", lambda: {})
    monkeypatch.setattr(toolchain, "_save_config", lambda cfg: None)
    monkeypatch.setattr(toolchain, "_refresh_cli", lambda: None)
    monkeypatch.setattr(toolchain.subprocess, "run", lambda *a, **k: None)
    generator = toolchain.install_cli().body_iterator

    async def drain():
        return "".join([chunk async for chunk in generator])

    import asyncio
    return asyncio.run(drain()), requested


def test_a_download_that_is_not_the_published_release_is_not_installed(monkeypatch, tmp_path):
    log, requested = _install(monkeypatch, tmp_path, _archive(b"something else"), "0" * 64)

    assert "[error]" in log and "does not match" in log
    assert not (tmp_path / "bin").exists()
    assert requested == [
        f"https://downloads.arduino.cc/arduino-cli/arduino-cli_{toolchain._ARDUINO_CLI_VERSION}_Windows_64bit.zip"]


def test_the_published_release_is_installed(monkeypatch, tmp_path):
    archive = _archive(b"the real thing")
    log, _ = _install(monkeypatch, tmp_path, archive, hashlib.sha256(archive).hexdigest())

    assert "[error]" not in log
    assert (tmp_path / "bin" / "arduino-cli.exe").read_bytes() == b"the real thing"


def test_every_platform_the_installer_serves_has_a_checksum():
    for name, ext in [("Windows_64bit", "zip"), ("Linux_64bit", "tar.gz"), ("Linux_ARM64", "tar.gz"),
                      ("macOS_64bit", "tar.gz"), ("macOS_ARM64", "tar.gz")]:
        assert len(toolchain._ARDUINO_CLI_SHA256[f"{name}.{ext}"]) == 64
