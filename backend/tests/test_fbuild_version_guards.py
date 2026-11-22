"""What keeps a different fbuild from passing unnoticed.

The helper's workarounds are written against the pinned fbuild. These hold the
pieces that say so when another version is in play: which binary the helper
runs, what happens when a build prints no size the helper can read, and a
failed FastLED checkout not being remembered as a good one.
"""
import json

import firmware
import toolchain


def _tool(directory, name):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (f"{name}.exe" if toolchain.os.name == "nt" else name)
    path.write_bytes(b"tool")
    return path


def _only_interpreter_tools(monkeypatch, tmp_path):
    scripts = tmp_path / "Scripts"
    monkeypatch.setattr(toolchain.sysconfig, "get_path", lambda name: str(scripts))
    monkeypatch.setattr(toolchain.sys, "executable", str(tmp_path / "python"))
    monkeypatch.delattr(toolchain.sys, "frozen", raising=False)
    monkeypatch.setattr(toolchain, "_load_config", lambda: {})
    monkeypatch.delenv("FBUILD_BIN", raising=False)
    return scripts


def test_the_fbuild_installed_with_the_helper_wins_over_one_on_path(tmp_path, monkeypatch):
    # The laptop's PATH held another Python's fbuild 2.5.45 while the helper's
    # own environment held the pinned 2.5.51, and the helper ran the former.
    scripts = _only_interpreter_tools(monkeypatch, tmp_path)
    pinned = _tool(scripts, "fbuild")
    stray = _tool(tmp_path / "elsewhere", "fbuild")
    monkeypatch.setattr(toolchain.shutil, "which", lambda name: str(stray))

    assert toolchain._find_fbuild() == str(pinned)


def test_path_is_still_the_last_resort_for_fbuild(tmp_path, monkeypatch):
    _only_interpreter_tools(monkeypatch, tmp_path)
    stray = _tool(tmp_path / "elsewhere", "fbuild")
    monkeypatch.setattr(toolchain.shutil, "which", lambda name: str(stray))

    assert toolchain._find_fbuild() == str(stray)


def test_a_chosen_fbuild_wins_over_the_installed_one(tmp_path, monkeypatch):
    scripts = _only_interpreter_tools(monkeypatch, tmp_path)
    _tool(scripts, "fbuild")
    chosen = _tool(tmp_path / "chosen", "fbuild")
    monkeypatch.setenv("FBUILD_BIN", str(chosen))
    assert toolchain._find_fbuild() == str(chosen)

    saved = _tool(tmp_path / "saved", "fbuild")
    monkeypatch.setattr(toolchain, "_load_config", lambda: {"fbuild": str(saved)})
    assert toolchain._find_fbuild() == str(saved)


def test_a_failed_fastled_checkout_is_tried_again_by_the_next_build(tmp_path, monkeypatch):
    library = tmp_path / "lib" / "FastLED"
    monkeypatch.setattr(toolchain, "_FBUILD_LIB_DIR", library)
    monkeypatch.setattr(toolchain, "_FBUILD_SRC_DIR", tmp_path / "src")
    monkeypatch.setattr(toolchain, "_write_fbuild_ini", lambda: None)
    monkeypatch.setattr(toolchain, "_fbuild_project_ready", False)
    monkeypatch.setattr(toolchain, "_fastled_checkout_matches_pin", lambda path: False)
    clones = []

    def failing_fetch(label, url, tag, library_dir, keep=None):
        clones.append(tag)
        yield "[error] could not download FastLED: no network\n"
        return 1

    monkeypatch.setattr(toolchain, "_fetch_pinned_library", failing_fetch)

    assert "[error]" in "".join(toolchain._ensure_fbuild_project())
    assert toolchain._fbuild_project_ready is False
    "".join(toolchain._ensure_fbuild_project())
    assert len(clones) == 2


def _build_printing(monkeypatch, tmp_path, lines):
    monkeypatch.setattr(toolchain, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(toolchain, "_fbuild_project_ready", True)
    monkeypatch.setattr(toolchain, "_write_fbuild_main", lambda ino: None)
    monkeypatch.setattr(toolchain, "_fbuild_env_for_fqbn", lambda *a, **k: "arduino_avr_uno")
    monkeypatch.setattr(toolchain, "_FBUILD_PROJECT_DIR", tmp_path)

    def fake_phase(label, args, sink=None, cwd=None, tool_env=None):
        for line in lines:
            if sink is not None:
                sink.append(line)
            yield line
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", fake_phase)
    output, result = firmware._drain_compile(
        firmware._compile_upload_fbuild("Sketch", "void setup(){}", "arduino:avr:uno", "COM5"))
    return "".join(output), result


def _saved_size(tmp_path, flash, ram):
    release = tmp_path / ".fbuild" / "build" / "arduino_avr_uno" / "release"
    release.mkdir(parents=True)
    (release / firmware._FBUILD_SIZE_CACHE).write_text(json.dumps({"size_info": {
        "total_flash": flash, "max_flash": 32256, "total_ram": ram, "max_ram": 2048,
    }}), encoding="utf-8")


def test_a_build_with_no_size_line_is_still_refused_when_its_saved_size_is_over(monkeypatch, tmp_path):
    # A rebuild that changes nothing prints no size line, and a new fbuild may
    # word the line differently. Either way the image must not reach the board
    # unmeasured when fbuild saved a size beside it.
    _saved_size(tmp_path, flash=43662, ram=42184)
    log, (rc, phase) = _build_printing(monkeypatch, tmp_path, ["build succeeded in 0.1s\n"])

    assert rc != 0 and phase == "compile"
    assert "[size-error]" in log
    assert "upload" not in log.lower()


def test_a_build_with_no_size_line_uploads_when_its_saved_size_fits(monkeypatch, tmp_path):
    _saved_size(tmp_path, flash=4864, ram=444)
    log, result = _build_printing(monkeypatch, tmp_path, ["build succeeded in 0.1s\n"])

    assert result == (0, "upload")
    assert "[size] flash 15%" in log
    assert "[size-unknown]" not in log


def test_a_build_with_no_size_anywhere_says_it_was_not_checked(monkeypatch, tmp_path):
    log, result = _build_printing(monkeypatch, tmp_path, ["Size: 4864 of 32256\n", "build succeeded in 0.1s\n"])

    assert result == (0, "upload")
    assert "[size-unknown]" in log
