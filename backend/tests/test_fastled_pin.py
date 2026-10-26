"""Both build engines use one pinned FastLED release, never the latest."""

import json
import subprocess

import firmware
import toolchain


def _fastled_checkout(path, version):
    (path / "src" / "fl" / "stl").mkdir(parents=True)
    (path / "src" / "FastLED.h").write_text("ok", encoding="utf-8")
    (path / "src" / "fl" / "stl" / "stdint.h").write_text("ok", encoding="utf-8")
    (path / "library.properties").write_text(f"name=FastLED\nversion={version}\n", encoding="utf-8")


def test_fastled_checkout_accepts_only_the_pinned_release(tmp_path):
    library = tmp_path / "FastLED"
    _fastled_checkout(library, "3.10.4")
    assert toolchain._fastled_checkout_matches_pin(library) is False
    (library / "library.properties").write_text(
        f"version={toolchain._FASTLED_VERSION}\n", encoding="utf-8",
    )
    assert toolchain._fastled_checkout_matches_pin(library) is True
    (library / "src" / "fl" / "stl" / "stdint.h").unlink()
    assert toolchain._fastled_checkout_matches_pin(library) is False


def test_arduino_fastled_installs_the_pin_over_an_older_release(tmp_path, monkeypatch):
    monkeypatch.setattr(toolchain, "_arduino_fastled_lib_ready", False)
    monkeypatch.setattr(toolchain, "_ARDUINO_BASE", ["arduino-cli"])
    monkeypatch.setattr(toolchain.subprocess, "run", lambda args, **kwargs: subprocess.CompletedProcess(
        args, 0, json.dumps({"config": {"directories": {"user": str(tmp_path)}}}),
    ))
    _fastled_checkout(tmp_path / "libraries" / "FastLED", "3.10.4")
    installs = []

    def fake_install(label, args):
        installs.append(args)
        yield "installed\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", fake_install)
    assert firmware._drain_compile(toolchain._ensure_arduino_fastled_lib())[1] == 0
    assert installs == [["arduino-cli", "lib", "install", f"FastLED@{toolchain._FASTLED_VERSION}"]]
    # Ready for the rest of the process: no second config read or install.
    assert firmware._drain_compile(toolchain._ensure_arduino_fastled_lib())[1] == 0
    assert len(installs) == 1


def test_arduino_fastled_skips_install_when_the_pin_is_present(tmp_path, monkeypatch):
    monkeypatch.setattr(toolchain, "_arduino_fastled_lib_ready", False)
    monkeypatch.setattr(toolchain.subprocess, "run", lambda args, **kwargs: subprocess.CompletedProcess(
        args, 0, json.dumps({"config": {"directories": {"user": str(tmp_path)}}}),
    ))
    _fastled_checkout(tmp_path / "libraries" / "FastLED", toolchain._FASTLED_VERSION)

    def no_install(label, args):
        raise AssertionError("the pinned FastLED is already installed")

    monkeypatch.setattr(toolchain, "_run_phase", no_install)
    assert firmware._drain_compile(toolchain._ensure_arduino_fastled_lib())[1] == 0


def test_fbuild_vendors_the_pinned_tag_over_a_stale_checkout(tmp_path, monkeypatch):
    library = tmp_path / "lib" / "FastLED"
    _fastled_checkout(library, "3.10.4")
    monkeypatch.setattr(toolchain, "_FBUILD_LIB_DIR", library)
    monkeypatch.setattr(toolchain, "_FBUILD_SRC_DIR", tmp_path / "src")
    monkeypatch.setattr(toolchain, "_write_fbuild_ini", lambda: None)
    monkeypatch.setattr(toolchain, "_patch_fastled_samd51_build", lambda: None)
    monkeypatch.setattr(toolchain, "_fbuild_project_ready", False)
    clones = []

    def fake_clone(label, args):
        clones.append(args)
        _fastled_checkout(library, toolchain._FASTLED_VERSION)
        yield "cloned\n"
        return 0

    monkeypatch.setattr(toolchain, "_run_phase", fake_clone)
    output = "".join(toolchain._ensure_fbuild_project())
    assert "[error]" not in output
    assert clones[0][clones[0].index("--branch") + 1] == toolchain._FASTLED_VERSION


def test_riscv_patch_makes_definitions_match_their_declarations(tmp_path):
    source = tmp_path / "src" / "platforms" / "esp" / "32" / "interrupts" / "riscv.cpp.hpp"
    source.parent.mkdir(parents=True)
    source.write_text(
        "esp_err_t fastled_riscv_install_interrupt(\n    int priority\n) {\n    return ESP_OK;\n}\n"
        "void FL_IRAM fastled_riscv_official_handler(void *arg) {\n    (void)arg;\n}\n",
        encoding="utf-8",
    )
    toolchain._patch_fastled_riscv_noexcept(tmp_path)
    toolchain._patch_fastled_riscv_noexcept(tmp_path)  # idempotent
    patched = source.read_text(encoding="utf-8")
    assert patched.count("FL_NO_EXCEPT {") == 2
    assert "void FL_IRAM fastled_riscv_official_handler(void *arg) FL_NO_EXCEPT {" in patched
