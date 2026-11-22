"""Pinned libraries download as GitHub tag archives, with no git on the machine.

A clean Windows account has no git, and the first build there failed on
`git clone` before it began (clean-machine smoke test, 2026-11-22).
"""
import io
import zipfile


import toolchain


def _archive(files):
    """A ZIP shaped like GitHub's: every entry under one `<repo>-<tag>/` folder."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as bundle:
        for name, text in files.items():
            bundle.writestr(f"Lib-1.0.0/{name}", text)
    return buffer.getvalue()


class _Response(io.BytesIO):
    def __init__(self, payload):
        super().__init__(payload)
        self.headers = {"Content-Length": str(len(payload))}

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _serve(monkeypatch, payload, requested):
    def urlopen(url, timeout=None):
        requested.append(url)
        if isinstance(payload, Exception):
            raise payload
        return _Response(payload)

    monkeypatch.setattr(toolchain.urllib.request, "urlopen", urlopen)


def _drain(generator):
    lines = []
    try:
        while True:
            lines.append(next(generator))
    except StopIteration as stop:
        return lines, stop.value


def test_downloads_the_tag_archive_and_strips_its_top_folder(tmp_path, monkeypatch):
    requested = []
    _serve(monkeypatch, _archive({"library.properties": "version=1.0.0\n", "src/Lib.h": "// lib"}), requested)
    target = tmp_path / "lib" / "Lib"

    lines, rc = _drain(toolchain._fetch_pinned_library("Lib", "https://github.com/owner/Lib.git", "1.0.0", target))

    assert rc == 0
    assert requested == ["https://github.com/owner/Lib/archive/refs/tags/1.0.0.zip"]
    assert (target / "library.properties").read_text(encoding="utf-8") == "version=1.0.0\n"
    assert (target / "src" / "Lib.h").is_file()
    assert not (tmp_path / "lib" / "Lib.download").exists()
    assert any("vendor Lib 1.0.0" in line for line in lines)


def test_keep_extracts_one_directory_and_the_root_files(tmp_path, monkeypatch):
    _serve(monkeypatch, _archive({
        "library.properties": "name=tools\n",
        "src/AudioTools.h": "// lib",
        "examples/very/deep/example.ino": "// too long for Windows",
    }), [])
    target = tmp_path / "tools"

    _, rc = _drain(toolchain._fetch_pinned_library("tools", "https://github.com/o/tools", "v1", target, keep="src"))

    assert rc == 0
    assert (target / "library.properties").is_file()
    assert (target / "src" / "AudioTools.h").is_file()
    assert not (target / "examples").exists()


def test_a_failed_download_leaves_the_old_library_and_no_partial_copy(tmp_path, monkeypatch):
    _serve(monkeypatch, OSError("no network"), [])
    target = tmp_path / "Lib"
    target.mkdir()
    (target / "old.h").write_text("// previous", encoding="utf-8")

    lines, rc = _drain(toolchain._fetch_pinned_library("Lib", "https://github.com/o/Lib", "1.0.0", target))

    assert rc == 1
    assert any("could not download Lib 1.0.0: no network" in line for line in lines)
    assert (target / "old.h").is_file()
    assert not (tmp_path / "Lib.download").exists()


def test_an_entry_that_escapes_the_library_is_refused(tmp_path, monkeypatch):
    _serve(monkeypatch, _archive({"../../escape.txt": "nope"}), [])
    target = tmp_path / "deep" / "Lib"

    lines, rc = _drain(toolchain._fetch_pinned_library("Lib", "https://github.com/o/Lib", "1.0.0", target))

    assert rc == 1
    assert any("unsafe path" in line for line in lines)
    assert not (tmp_path / "escape.txt").exists()
    assert not target.exists()


def test_fbuild_is_pointed_at_the_pinned_esptool():
    # fbuild otherwise installs its own esptool with `uv`, which a clean
    # machine does not have. A value the user set wins. Compared with what the
    # module itself resolved at import: conftest swaps a placeholder into
    # `_ESPTOOL_BIN` on hosts without esptool (CI), so that is not the source.
    resolved = toolchain._find_interpreter_esptool()
    expected = toolchain.os.environ.get("FBUILD_ESPTOOL_PATH", "").strip() or resolved
    assert toolchain._TOOLCHAIN_ENV.get("FBUILD_ESPTOOL_PATH") == expected
