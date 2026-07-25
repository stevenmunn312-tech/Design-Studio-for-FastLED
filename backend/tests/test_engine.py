"""Build-engine selection and FQBN <-> fbuild-environment translation — pure
logic, no subprocess/hardware involved."""
import threading
import time

import app


def test_active_engine_prefers_fbuild_when_no_saved_preference(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {})
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "fbuild"


def test_active_engine_falls_back_to_arduino_cli_when_fbuild_missing(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {})
    monkeypatch.setattr(app, "_FBUILD_BIN", None)
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "arduino-cli"


def test_active_engine_honours_saved_preference_when_available(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {"engine": "arduino-cli"})
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "arduino-cli"


def test_active_engine_ignores_saved_preference_when_unavailable(monkeypatch):
    # Saved "fbuild" but fbuild isn't actually installed -> falls through to
    # the default logic rather than reporting an engine that can't run.
    monkeypatch.setattr(app, "_load_config", lambda: {"engine": "fbuild"})
    monkeypatch.setattr(app, "_FBUILD_BIN", None)
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    assert app._active_engine() == "arduino-cli"


def test_active_engine_returns_arduino_cli_when_neither_installed(monkeypatch):
    monkeypatch.setattr(app, "_load_config", lambda: {})
    monkeypatch.setattr(app, "_FBUILD_BIN", None)
    monkeypatch.setattr(app, "_ARDUINO_CLI", None)
    assert app._active_engine() == "arduino-cli"


def test_parse_fqbn_splits_base_and_psram_option():
    assert app._parse_fqbn("esp32:esp32:esp32s3") == ("esp32:esp32:esp32s3", None)
    assert app._parse_fqbn("esp32:esp32:esp32s3:PSRAM=opi") == ("esp32:esp32:esp32s3", "opi")
    assert app._parse_fqbn("esp32:esp32:esp32s3:PSRAM=enabled") == ("esp32:esp32:esp32s3", "qspi")
    assert app._parse_fqbn("arduino:avr:uno") == ("arduino:avr:uno", None)


def test_parse_fqbn_ignores_unknown_menu_option():
    base, psram = app._parse_fqbn("esp32:esp32:esp32s3:CPUFreq=240")
    assert base == "esp32:esp32:esp32s3"
    assert psram is None


def test_env_id_slugifies_and_suffixes():
    assert app._env_id("esp32:esp32:esp32s3") == "esp32_esp32_esp32s3"
    assert app._env_id("esp32:esp32:esp32s3", "opi") == "esp32_esp32_esp32s3_opi"


def test_fbuild_env_for_fqbn_known_board_with_psram():
    assert app._fbuild_env_for_fqbn("esp32:esp32:esp32s3:PSRAM=opi") == "esp32_esp32_esp32s3_opi"


def test_fbuild_env_for_fqbn_unknown_board_returns_none():
    assert app._fbuild_env_for_fqbn("someone:elses:board") is None


def test_fbuild_env_for_fqbn_drops_unsupported_psram_option():
    # esp32:esp32:esp32 only maps "qspi", not "opi" -> build without PSRAM
    # rather than fail outright.
    env = app._fbuild_env_for_fqbn("esp32:esp32:esp32:PSRAM=opi")
    assert env == "esp32_esp32_esp32"


def test_write_fbuild_ini_emits_a_section_per_board_and_psram_variant(tmp_path, monkeypatch):
    ini_path = tmp_path / "platformio.ini"
    monkeypatch.setattr(app, "_FBUILD_INI_PATH", ini_path)

    app._write_fbuild_ini()
    text = ini_path.read_text(encoding="utf-8")

    for base_fqbn, meta in app._PIO_BOARDS.items():
        assert f"[env:{app._env_id(base_fqbn)}]" in text
        assert f"board = {meta['board']}" in text
        for psram_id in meta.get("psram_memory_type", {}):
            assert f"[env:{app._env_id(base_fqbn, psram_id)}]" in text

    # ESP32 boards get the CORE_DEBUG_LEVEL workaround; non-espressif boards don't.
    assert "-DCORE_DEBUG_LEVEL=0" in text
    uno_section = text.split("[env:arduino_avr_uno]")[1].split("[env:")[0]
    assert "CORE_DEBUG_LEVEL" not in uno_section


def test_patch_fastled_sd_stub_replaces_file_contents(tmp_path, monkeypatch):
    # Regression: FastLED unconditionally compiles fl/build/fl.system.sd+.cpp
    # into its own library archive (meant to be tree-shaken by the linker when
    # unused), and that file needs SPI -> SD -> SDFS -> SdFat. On at least one
    # real toolchain (ESP8266's bundled framework) fbuild's dependency scanner
    # never resolves SPI's include path for a vendored *local* library, and
    # neither lib_deps, a library.json `dependencies` entry, nor its
    # `build.srcFilter` change what fbuild actually compiles for FastLED
    # (confirmed empirically: every srcFilter rewrite, inclusion or exclusion,
    # compiled the identical file set). The file's own contents are the only
    # lever that works, and this project never calls FastLED's own SD/
    # filesystem API, so stubbing it out costs nothing.
    lib_dir = tmp_path / "FastLED"
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib_dir)
    build_dir = lib_dir / "src" / "fl" / "build"
    build_dir.mkdir(parents=True)
    target = build_dir / "fl.system.sd+.cpp"
    target.write_text('#include "fl/system/sd/_build.cpp.hpp"\n', encoding="utf-8")

    app._patch_fastled_sd_stub()

    assert target.read_text(encoding="utf-8") == app._FASTLED_SD_STUB


def test_patch_fastled_sd_stub_is_idempotent(tmp_path, monkeypatch):
    lib_dir = tmp_path / "FastLED"
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib_dir)
    build_dir = lib_dir / "src" / "fl" / "build"
    build_dir.mkdir(parents=True)
    target = build_dir / "fl.system.sd+.cpp"
    target.write_text(app._FASTLED_SD_STUB, encoding="utf-8")

    app._patch_fastled_sd_stub()  # must not raise or otherwise disturb an already-patched file

    assert target.read_text(encoding="utf-8") == app._FASTLED_SD_STUB


def test_patch_fastled_sd_stub_is_a_noop_before_fastled_is_vendored(tmp_path, monkeypatch):
    # Called from _ensure_fbuild_project even on a fresh clone attempt that
    # failed — the target file may not exist yet, and that must not raise.
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", tmp_path / "FastLED")
    app._patch_fastled_sd_stub()


def test_fbuild_size_report_keeps_sane_ram_percentage():
    report = app._fbuild_size_report([
        "Flash: 4.45KB / 31.50KB (14.1%)\n",
        "RAM:   367 bytes / 2.00KB (17.9%)\n",
    ])

    assert report == {"flash": 14, "ram": 17}


def test_fbuild_size_report_ignores_impossible_successful_esp32_ram_percentage():
    report = app._fbuild_size_report([
        "Flash: 665.41KB / 8.00MB (8.1%)\n",
        "RAM:   1.28MB / 320.00KB (409.2%)\n",
        "build succeeded in 150.2s (flash: 681375 bytes, ram: 1340869 bytes)\n",
    ])

    assert report == {"flash": 8, "ram": None}


def test_size_bytes_report_extracts_used_limit_and_percent():
    report = app._size_bytes_report([
        "Sketch uses 25972 bytes (10%) of program storage space. Maximum is 253952 bytes.\n",
        "Global variables use 1568 bytes (19%) of dynamic memory, leaving 6624 bytes for "
        "local variables. Maximum is 8192 bytes.\n",
    ])

    assert report["flash"] == {"usedBytes": 25972, "percent": 10, "limitBytes": 253952}
    assert report["ram"] == {"usedBytes": 1568, "percent": 19, "limitBytes": 8192}


def test_size_bytes_report_returns_none_for_missing_lines():
    assert app._size_bytes_report(["Compiling sketch...\n"]) == {"flash": None, "ram": None}


def test_fbuild_size_bytes_report_converts_units_to_bytes():
    report = app._fbuild_size_bytes_report([
        "Flash: 4.45KB / 31.50KB (14.1%)\n",
        "RAM:   367 bytes / 2.00KB (17.9%)\n",
    ])

    assert report["flash"] == {"usedBytes": round(4.45 * 1024), "percent": 14, "limitBytes": round(31.50 * 1024)}
    assert report["ram"] == {"usedBytes": 367, "percent": 18, "limitBytes": round(2.00 * 1024)}


def test_fbuild_size_bytes_report_drops_impossible_ram_percentage():
    report = app._fbuild_size_bytes_report([
        "Flash: 665.41KB / 8.00MB (8.1%)\n",
        "RAM:   1.28MB / 320.00KB (409.2%)\n",
    ])

    assert report["flash"]["percent"] == 8
    assert report["ram"] is None


def test_fbuild_cached_size_reads_the_persisted_size_cache_file(tmp_path, monkeypatch):
    monkeypatch.setattr(app, "_FBUILD_PROJECT_DIR", tmp_path)
    cache_dir = tmp_path / ".fbuild" / "build" / "esp32_esp32_esp32s3" / "release"
    cache_dir.mkdir(parents=True)
    (cache_dir / ".firmware_size_cache.json").write_text(
        '{"size_info": {"total_flash": 688819, "max_flash": 8388608, '
        '"total_ram": 30000, "max_ram": 327680}}'
    )

    result = app._fbuild_cached_size("esp32_esp32_esp32s3")

    assert result == {
        "flash": {"usedBytes": 688819, "limitBytes": 8388608, "percent": 8},
        "ram": {"usedBytes": 30000, "limitBytes": 327680, "percent": 9},
    }


def test_fbuild_cached_size_drops_impossible_ram_percentage(tmp_path, monkeypatch):
    monkeypatch.setattr(app, "_FBUILD_PROJECT_DIR", tmp_path)
    cache_dir = tmp_path / ".fbuild" / "build" / "esp32_esp32_esp32s3" / "release"
    cache_dir.mkdir(parents=True)
    (cache_dir / ".firmware_size_cache.json").write_text(
        '{"size_info": {"total_flash": 665410, "max_flash": 8388608, '
        '"total_ram": 1340869, "max_ram": 327680}}'
    )

    result = app._fbuild_cached_size("esp32_esp32_esp32s3")

    assert result["flash"]["percent"] == 8
    assert result["ram"] is None


def test_fbuild_cached_size_returns_none_when_file_is_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(app, "_FBUILD_PROJECT_DIR", tmp_path)
    assert app._fbuild_cached_size("esp32_esp32_esp32s3") is None


# Captured verbatim from a real hard DRAM overflow on ESP32-S3 (fbuild 2.5.1,
# xtensa-esp-elf-gcc 14.2.0) — the linker fails before fbuild ever gets to
# print its own "Flash:"/"RAM:" summary line, so `_fbuild_overflow_estimate`
# is the only source of a percentage in this case.
_REAL_DRAM_OVERFLOW_LOG = [
    "Board: Espressif ESP32-S3-DevKitC-1-N8 (8 MB QD, No PSRAM) / ESP32S3 @ 240MHz\n",
    "Memory: 8.00MB Flash, 320.00KB RAM\n",
    "build error: build failed: ESP32 link failed:\n",
    "ld.exe: firmware.elf section `.dram0.bss' will not fit in region `dram0_0_seg'\n",
    "ld.exe: region `dram0_0_seg' overflowed by 8734704 bytes\n",
    "collect2.exe: error: ld returned 1 exit status\n",
]


def test_fbuild_overflow_estimate_computes_percentage_from_real_ld_output():
    result = app._fbuild_overflow_estimate(_REAL_DRAM_OVERFLOW_LOG)

    ram_max = 320 * 1024
    assert result["ram"] == {
        "usedBytes": ram_max + 8734704,
        "limitBytes": ram_max,
        "percent": round((ram_max + 8734704) / ram_max * 100),
    }
    assert result["flash"] is None


def test_fbuild_overflow_estimate_attributes_a_text_region_to_flash():
    result = app._fbuild_overflow_estimate([
        "Memory: 31.50KB Flash, 2.00KB RAM\n",
        "ld.exe: region `text' overflowed by 7052 bytes\n",
    ])

    flash_max = round(31.50 * 1024)
    assert result["flash"] == {
        "usedBytes": flash_max + 7052,
        "limitBytes": flash_max,
        "percent": round((flash_max + 7052) / flash_max * 100),
    }
    assert result["ram"] is None


def test_fbuild_overflow_estimate_returns_none_without_a_memory_line():
    result = app._fbuild_overflow_estimate(["region `dram0_0_seg' overflowed by 100 bytes\n"])
    assert result == {"flash": None, "ram": None}


def test_fbuild_overflow_estimate_keeps_the_larger_repeated_overflow():
    result = app._fbuild_overflow_estimate([
        "Memory: 8.00MB Flash, 320.00KB RAM\n",
        "region `dram0_0_seg' overflowed by 100 bytes\n",
        "region `dram0_0_seg' overflowed by 500 bytes\n",
    ])
    ram_max = 320 * 1024
    assert result["ram"]["usedBytes"] == ram_max + 500


def test_compile_upload_fbuild_serializes_concurrent_builds(monkeypatch):
    # Regression test: fbuild's project scaffold is one shared directory (a
    # single main.cpp + one build output), so two overlapping builds used to
    # interleave and corrupt each other's output — observed as a compile that
    # reports success with no parseable size line, or a spurious failure a
    # caller could misread as a capacity overflow. `_fbuild_build_lock` must
    # keep every real build fully serialized.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn: "esp32_esp32_esp32s3")
    monkeypatch.setattr(app, "_write_fbuild_main", lambda ino: None)

    active = 0
    max_active = 0
    guard = threading.Lock()

    def fake_run_phase(label, args, sink=None, cwd=None):
        nonlocal active, max_active
        with guard:
            active += 1
            max_active = max(max_active, active)
        time.sleep(0.05)  # long enough that a race would overlap reliably
        if sink is not None:
            sink.append("Flash: 1.00KB / 10.00KB (10.0%)\n")
        with guard:
            active -= 1
        yield "ok\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", fake_run_phase)

    def run():
        list(app._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))

    threads = [threading.Thread(target=run) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert max_active == 1


def test_compile_upload_fbuild_fails_fast_when_lock_is_wedged(monkeypatch):
    # Regression: `_fbuild_build_lock` used to be a plain blocking `with`, so a
    # genuinely stuck build (a hung subprocess, an interrupted git clone, ...)
    # silently starved every later build/upload/capacity-check request forever
    # — the UI just showed "Starting…" indefinitely with zero output and no
    # error. A bounded acquire must fail fast with a clear message instead.
    monkeypatch.setattr(app, "_FBUILD_LOCK_TIMEOUT_S", 0.05)
    app._fbuild_build_lock.acquire()  # simulate another build already wedged
    try:
        lines = list(app._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))
    finally:
        app._fbuild_build_lock.release()

    assert any("stuck" in line.lower() or "restart the helper" in line.lower() for line in lines)


def test_compile_upload_fbuild_releases_lock_after_a_failed_build(monkeypatch):
    # The lock must release on every return path (bad fqbn, failed compile,
    # successful compile-only, successful upload) or a single failed build
    # would itself become the next "wedged lock" case above.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn: None)

    list(app._compile_upload_fbuild("Test", "void setup(){}", "someone:elses:board", ""))

    assert app._fbuild_build_lock.acquire(timeout=1)
    app._fbuild_build_lock.release()


def test_compile_upload_fbuild_points_at_arduino_cli_when_deployer_is_missing(monkeypatch):
    # fbuild can compile for boards it can't yet flash (e.g. Espressif8266 as
    # of fbuild 2.5.4: "deployer for Espressif8266 not yet implemented"). A
    # bare failure there reads as "upload broken" when it's really "wrong
    # engine for this board" — point at the engine that actually works.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn: "esp8266_esp8266_nodemcuv2")
    monkeypatch.setattr(app, "_write_fbuild_main", lambda ino: None)

    def fake_run_phase(label, args, sink=None, cwd=None):
        if "deploy" in args:
            line = "deploy error: deploy failed: deployer for Espressif8266 not yet implemented\n"
            if sink is not None:
                sink.append(line)
            yield line
            return 1
        if sink is not None:
            sink.append("Flash: 1.00KB / 10.00KB (10.0%)\n")
        yield "ok\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", fake_run_phase)

    lines = list(app._compile_upload_fbuild("Test", "void setup(){}", "esp8266:esp8266:nodemcuv2", "COM6"))

    assert any("Switch to the arduino-cli engine and try again" in line for line in lines)


def test_compile_upload_fbuild_stays_silent_on_other_upload_failures(monkeypatch):
    # The engine-gap hint is specific to the "not yet implemented" deployer
    # gap — an unrelated upload failure (board unplugged, wrong port, ...)
    # shouldn't get a misleading "switch engines" suggestion.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn: "esp32_esp32_esp32s3")
    monkeypatch.setattr(app, "_write_fbuild_main", lambda ino: None)

    def fake_run_phase(label, args, sink=None, cwd=None):
        if "deploy" in args:
            line = "esptool.py: could not open port 'COM7': PermissionError\n"
            if sink is not None:
                sink.append(line)
            yield line
            return 1
        if sink is not None:
            sink.append("Flash: 1.00KB / 10.00KB (10.0%)\n")
        yield "ok\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", fake_run_phase)

    lines = list(app._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", "COM7"))

    assert not any("arduino-cli" in line for line in lines)


def test_drain_compile_collects_lines_and_return_value():
    def gen():
        yield "a\n"
        yield "b\n"
        return 0, "compile"

    lines, result = app._drain_compile(gen())

    assert lines == ["a\n", "b\n"]
    assert result == (0, "compile")
