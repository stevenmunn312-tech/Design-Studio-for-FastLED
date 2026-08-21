"""Build-engine selection and FQBN <-> fbuild-environment translation — pure
logic, no subprocess/hardware involved."""
import stat
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

    # ESP32 boards also get -DNO_GFX=1, unconditionally — the vendored HUB75
    # DMA library (_ensure_fbuild_hub75_lib) needs it to drop its Adafruit_GFX
    # dependency, which isn't vendored (confirmed by a real build failure:
    # "Adafruit_GFX.h: No such file or directory"). Harmless for every other
    # ESP32 sketch since the macro is only consulted inside that header.
    assert "-DNO_GFX=1" in text
    assert "NO_GFX" not in uno_section

    # fbuild must carry the SAMD51 identity into vendored library TUs, not just
    # the sketch, or FastLED falls through to its unsupported generic Arduino
    # pin implementation.
    feather_m4_section = text.split("[env:adafruit_samd_adafruit_feather_m4]")[1].split("[env:")[0]
    assert "-DARDUINO_ARCH_SAMD" in feather_m4_section
    assert "-D__SAMD51J19A__" in feather_m4_section
    assert "-DEIC_IRQn=EIC_0_IRQn" in feather_m4_section
    assert "-DFASTLED_FORCE_SOFTWARE_SPI=1" in feather_m4_section

    # Base (non-PSRAM) ESP32 envs get the huge_app.csv partition table — the
    # stock default.csv's 1.31MB OTA app slots are too small for the
    # audio-heavy music-sync Player sketch. Non-ESP32 boards don't.
    esp32_section = text.split("[env:esp32_esp32_esp32]")[1].split("[env:")[0]
    assert "board_build.partitions = huge_app.csv" in esp32_section
    assert "board_build.partitions" not in uno_section


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


def test_patch_fastled_samd51_disables_unused_generic_i2s_backend(tmp_path, monkeypatch):
    lib_dir = tmp_path / "FastLED"
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib_dir)
    audio = lib_dir / "src" / "fl" / "audio" / "audio_input.cpp.hpp"
    audio.parent.mkdir(parents=True)
    audio.write_text(
        "  #elif defined(FL_IS_TEENSY)\n"
        "    // Teensy uses the PJRC Audio backend when enabled, never generic Arduino I2S.\n"
        "    #define FASTLED_USES_ARDUINO_AUDIO_INPUT 0\n"
        "  #elif FL_HAS_INCLUDE(<Arduino.h>)\n",
        encoding="utf-8",
    )
    arduino_audio = lib_dir / "src" / "platforms" / "arduino" / "audio_input.hpp"
    arduino_audio.parent.mkdir(parents=True)
    arduino_audio.write_text(
        '#elif defined(FL_IS_SAMD21)\n'
        '#define ARDUINO_I2S_FULLY_SUPPORTED 0\n'
        '#define ARDUINO_I2S_BROKEN_REASON "I2S not supported on SAMD21"\n'
        '#elif FL_HAS_INCLUDE(<I2S.h>)\n'
        '#include <I2S.h>\n',
        encoding="utf-8",
    )

    app._patch_fastled_samd51_build()
    app._patch_fastled_samd51_build()  # idempotent

    patched = audio.read_text(encoding="utf-8")
    assert patched.count("defined(FL_IS_SAMD51)") == 1
    assert "Studio supplies a ZeroI2S IInput adapter" in patched
    patched_arduino = arduino_audio.read_text(encoding="utf-8")
    assert patched_arduino.count("defined(FL_IS_SAMD51)") == 1
    assert "Studio uses ZeroI2S on SAMD51" in patched_arduino
    assert "<I2S.h>" not in patched_arduino
    assert "selected IInput adapter" in patched_arduino


def test_patch_fastled_samd51_honours_software_spi_selection(tmp_path, monkeypatch):
    lib_dir = tmp_path / "FastLED"
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib_dir)
    for relative in ("platforms/spi_device_proxy.h", "platforms/spi_output_template.h"):
        dispatcher = lib_dir / "src" / relative
        dispatcher.parent.mkdir(parents=True, exist_ok=True)
        dispatcher.write_text(
            "#elif defined(FL_IS_SAM) || defined(FL_IS_SAMD)\n#include \"hardware.h\"\n",
            encoding="utf-8",
        )

    app._patch_fastled_samd51_build()
    app._patch_fastled_samd51_build()

    for relative in ("platforms/spi_device_proxy.h", "platforms/spi_output_template.h"):
        patched = (lib_dir / "src" / relative).read_text(encoding="utf-8")
        assert patched.count("!defined(FASTLED_FORCE_SOFTWARE_SPI)") == 1


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
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None: "esp32_esp32_esp32s3")
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
    monkeypatch.setattr(app, "_FBUILD_LOCK_STALE_S", 60)  # not old enough to reclaim
    held = app._fbuild_build_lock.acquire(1, 60)  # simulate another build already wedged
    try:
        lines = list(app._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))
    finally:
        app._fbuild_build_lock.release(held)

    log = "".join(lines)
    assert "still running" in log
    # It must not read as a problem with the user's graph: nothing was built.
    assert "your sketch is fine" in log


def test_compile_upload_fbuild_narrates_the_wait_for_a_busy_build_directory(monkeypatch):
    # The UI derives its status from this stream, so a build queued behind
    # another one used to emit nothing at all until it either got the lock or
    # timed out - the Upload button sat on "Starting..." for three minutes with
    # no way to tell queued from compiling from wedged.
    monkeypatch.setattr(app, "_FBUILD_LOCK_TIMEOUT_S", 0.2)
    monkeypatch.setattr(app, "_FBUILD_LOCK_POLL_S", 0.05)
    monkeypatch.setattr(app, "_FBUILD_LOCK_STALE_S", 60)  # not old enough to reclaim
    held = app._fbuild_build_lock.acquire(1, 60)
    try:
        lines = list(app._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))
    finally:
        app._fbuild_build_lock.release(held)

    log = "".join(lines)
    assert "[waiting]" in log
    # The wait is narrated before the timeout verdict, not only after it.
    assert log.index("[waiting]") < log.index("still running")


def test_compile_upload_fbuild_does_not_narrate_a_wait_it_never_had(monkeypatch):
    # An uncontended build is the common case and must stay silent about the
    # lock - a "queued" line on every upload would be noise that means nothing.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None: None)

    log = "".join(app._compile_upload_fbuild("Test", "void setup(){}", "someone:elses:board", ""))
    assert "[waiting]" not in log


def test_compile_upload_fbuild_releases_lock_after_a_failed_build(monkeypatch):
    # The lock must release on every return path (bad fqbn, failed compile,
    # successful compile-only, successful upload) or a single failed build
    # would itself become the next "wedged lock" case above.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None: None)

    list(app._compile_upload_fbuild("Test", "void setup(){}", "someone:elses:board", ""))

    token = app._fbuild_build_lock.acquire(1, 60)
    assert token is not None
    app._fbuild_build_lock.release(token)


def test_compile_upload_fbuild_vendors_hub75_lib_only_when_sketch_needs_it(monkeypatch):
    # HUB75 (docs/development/design/hub75-output.md) is vendored lazily, same
    # as ESP32-audioI2S/esp_dmx: only sketches that actually include the DMA
    # library's header should trigger the vendor-clone.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None: "esp32_esp32_esp32s3")
    monkeypatch.setattr(app, "_write_fbuild_main", lambda ino: None)

    calls = []
    monkeypatch.setattr(app, "_ensure_fbuild_hub75_lib", lambda: calls.append(1) or iter(()))

    def fake_run_phase(label, args, sink=None, cwd=None):
        if sink is not None:
            sink.append("Flash: 1.00KB / 10.00KB (10.0%)\n")
        yield "ok\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", fake_run_phase)

    list(app._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))
    assert calls == []

    list(app._compile_upload_fbuild(
        "Test", '#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>\nvoid setup(){}', "esp32:esp32:esp32s3", "",
    ))
    assert calls == [1]


def test_fbuild_libraries_for_sketch_hides_only_unrequested_optional_libs(tmp_path, monkeypatch):
    lib_root = tmp_path / "lib"
    stash = tmp_path / ".optional-libs"
    audio = lib_root / "ESP32-audioI2S"
    dmx = lib_root / "esp_dmx"
    zero_i2s = lib_root / "Adafruit_ZeroI2S"
    zero_dma = lib_root / "Adafruit_ZeroDMA"
    for path in (audio, dmx, zero_i2s, zero_dma):
        path.mkdir(parents=True)
        (path / "sentinel.txt").write_text(path.name, encoding="utf-8")

    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib_root / "FastLED")
    monkeypatch.setattr(app, "_FBUILD_OPTIONAL_LIB_STASH_DIR", stash)
    monkeypatch.setattr(app, "_FBUILD_OPTIONAL_LIBRARIES", (
        (audio, ("#include <Audio.h>",)),
        (dmx, ("#include <esp_dmx.h>",)),
        (zero_i2s, ("#include <Adafruit_ZeroI2S.h>",)),
        (zero_dma, ("#include <Adafruit_ZeroI2S.h>",)),
    ))

    with app._fbuild_libraries_for_sketch("#include <Adafruit_ZeroI2S.h>"):
        assert not audio.exists()
        assert not dmx.exists()
        assert zero_i2s.exists()
        assert zero_dma.exists()
        assert (stash / audio.name).exists()

    assert all(path.exists() for path in (audio, dmx, zero_i2s, zero_dma))
    assert not stash.exists()


def test_fbuild_libraries_for_sketch_restores_hidden_libs_after_failure(tmp_path, monkeypatch):
    lib_root = tmp_path / "lib"
    stash = tmp_path / ".optional-libs"
    audio = lib_root / "ESP32-audioI2S"
    audio.mkdir(parents=True)
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib_root / "FastLED")
    monkeypatch.setattr(app, "_FBUILD_OPTIONAL_LIB_STASH_DIR", stash)
    monkeypatch.setattr(app, "_FBUILD_OPTIONAL_LIBRARIES", (
        (audio, ("#include <Audio.h>",)),
    ))

    try:
        with app._fbuild_libraries_for_sketch("void setup(){}"):
            assert not audio.exists()
            raise RuntimeError("build failed")
    except RuntimeError:
        pass

    assert audio.exists()
    assert not stash.exists()


def test_restore_stranded_fbuild_optional_libraries_recovers_interrupted_move(tmp_path, monkeypatch):
    lib_root = tmp_path / "lib"
    stash = tmp_path / ".optional-libs"
    audio = lib_root / "ESP32-audioI2S"
    staged = stash / audio.name
    staged.mkdir(parents=True)
    (staged / "sentinel.txt").write_text("cached", encoding="utf-8")
    monkeypatch.setattr(app, "_FBUILD_LIB_DIR", lib_root / "FastLED")
    monkeypatch.setattr(app, "_FBUILD_OPTIONAL_LIB_STASH_DIR", stash)
    monkeypatch.setattr(app, "_FBUILD_OPTIONAL_LIBRARIES", (
        (audio, ("#include <Audio.h>",)),
    ))

    app._restore_stranded_fbuild_optional_libraries()

    assert (audio / "sentinel.txt").read_text(encoding="utf-8") == "cached"
    assert not stash.exists()


def test_compile_upload_fbuild_points_at_arduino_cli_when_deployer_is_missing(monkeypatch):
    # fbuild can compile for boards it can't yet flash (e.g. Espressif8266 as
    # of fbuild 2.5.4: "deployer for Espressif8266 not yet implemented"). A
    # bare failure there reads as "upload broken" when it's really "wrong
    # engine for this board" — point at the engine that actually works.
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None: "esp8266_esp8266_nodemcuv2")
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
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda fqbn, flash_mb=None: "esp32_esp32_esp32s3")
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


# The fbuild build lock has to survive its holder being abandoned. The holder is
# a generator, and a generator's `finally` only runs on exhaustion, close, or
# GC — so a client that stops consuming an upload stream leaves the lock held
# with nothing running. Observed on 2026-08-16 during classic-ESP32 bring-up.


def test_build_lock_grants_and_releases_by_token():
    lock = app._FbuildBuildLock()
    token = lock.acquire(1, 60)
    assert token is not None
    assert lock.acquire(0.05, 60) is None  # held
    lock.release(token)
    assert lock.acquire(0.05, 60) is not None


def test_build_lock_ignores_release_from_a_reclaimed_holder():
    # The abandoned generator may still be collected later and call release().
    # If that freed the *new* holder's lock, two builds could share one project
    # directory — the exact corruption the lock exists to prevent.
    lock = app._FbuildBuildLock()
    stale = lock.acquire(1, 60)
    reclaimed = lock.acquire(1, 0)  # stale_after=0 → immediately reclaimable
    assert reclaimed is not None and reclaimed != stale

    lock.release(stale)  # late release from the abandoned holder
    assert lock.acquire(0.05, 60) is None, "reclaimed lock must still be held"

    lock.release(reclaimed)
    assert lock.acquire(0.05, 60) is not None


def test_build_lock_does_not_steal_from_a_holder_that_is_still_working():
    # A slow build that keeps emitting output must never be reclaimed, however
    # impatient the waiter is.
    lock = app._FbuildBuildLock()
    token = lock.acquire(1, 60)
    assert token is not None
    time.sleep(0.05)
    lock.touch()
    assert lock.acquire(0.05, 0.5) is None
    assert lock.seconds_since_progress() < 0.5
    lock.release(token)


def test_build_lock_reclaims_a_holder_that_has_gone_silent():
    lock = app._FbuildBuildLock()
    abandoned = lock.acquire(1, 60)
    assert abandoned is not None
    time.sleep(0.12)
    # No touch() since acquire — the holder is not executing.
    assert lock.acquire(1, 0.1) is not None


def test_build_lock_touch_is_a_noop_when_unheld():
    # `_run_phase` is shared with the arduino-cli path, which takes no lock.
    lock = app._FbuildBuildLock()
    lock.touch()
    assert lock.seconds_since_progress() is None


def test_stale_threshold_exceeds_the_wait_timeout():
    # A single impatient waiter must never be able to reclaim: only a holder
    # silent for longer than anyone is willing to wait counts as abandoned.
    assert app._FBUILD_LOCK_STALE_S > app._FBUILD_LOCK_TIMEOUT_S


def test_busy_result_does_not_blame_the_sketch():
    lines = "".join(app._upload_result_lines(-1, "busy", "COM8"))
    assert "DID NOT RUN" in lines
    assert "didn't compile" not in lines
    assert "UPLOAD FAILED" not in lines


def test_a_bigger_module_builds_against_its_own_flash():
    """A 16MB module must not be measured against the board id's 8MB manifest.

    `esp32:esp32:esp32s3` is generic and resolves to PlatformIO's stock
    DevKitC-1, whose manifest is the N8 variant. Without a variant env the
    build — and the capacity meter reading its size report — targets 8MB on a
    part with 16MB, which is half the real ceiling.
    """
    assert app._fbuild_env_for_fqbn("esp32:esp32:esp32s3") == "esp32_esp32_esp32s3"
    assert app._fbuild_env_for_fqbn("esp32:esp32:esp32s3", 16) == "esp32_esp32_esp32s3_f16"


def test_an_unknown_flash_size_keeps_the_board_manifest():
    # Only sizes the board declares a variant for are honoured. Telling an N8
    # part it has 16MB produces an image it cannot boot, so an unrecognised
    # size falls back rather than inventing an env.
    assert app._fbuild_env_for_fqbn("esp32:esp32:esp32s3", 4) == "esp32_esp32_esp32s3"
    assert app._fbuild_env_for_fqbn("esp32:esp32:esp32doit-devkit-v1", 16) == "esp32_esp32_esp32doit_devkit_v1"


def test_a_psram_option_pins_its_own_flash_size():
    # The PSRAM envs already set flash_size themselves, so the two never stack.
    assert app._fbuild_env_for_fqbn("esp32:esp32:esp32s3:PSRAM=opi", 16) == "esp32_esp32_esp32s3_opi"


def test_the_flash_variant_env_is_actually_written(tmp_path, monkeypatch):
    monkeypatch.setattr(app, "_FBUILD_INI_PATH", tmp_path / "platformio.ini")
    app._write_fbuild_ini()
    ini = (tmp_path / "platformio.ini").read_text(encoding="utf-8")
    assert "[env:esp32_esp32_esp32s3_f16]" in ini
    body = ini.split("[env:esp32_esp32_esp32s3_f16]")[1].split("[env:")[0]
    assert "board_upload.flash_size = 16MB" in body
    # Same app slot as the default env — what changes is that the rest of the
    # flash stops being invisible, not how much the sketch may use.
    assert "board_build.partitions = huge_app.csv" in body


def test_flash_size_is_read_off_the_request_or_ignored():
    assert app._flash_mb_from({"flashMb": 16}) == 16
    assert app._flash_mb_from({"flashMb": "16"}) == 16
    for bad in ({}, {"flashMb": None}, {"flashMb": 0}, {"flashMb": "big"}):
        assert app._flash_mb_from(bad) is None


def test_vendoring_replaces_a_checkout_whose_git_packs_are_read_only(monkeypatch, tmp_path):
    """Replacing a vendored library must survive git's read-only pack files.

    Reproduced on a real bench: switching the player back to upstream
    ESP32-audioI2S found a cached fork checkout, and the bare `shutil.rmtree`
    hit `PermissionError: [WinError 5]` on `.git/objects/...`. Raised inside a
    generator feeding a StreamingResponse, it killed the upload right after the
    "vendoring" line, with nothing said about why.
    """
    stale = tmp_path / "ESP32-audioI2S"
    (stale / ".git" / "objects").mkdir(parents=True)
    pack = stale / ".git" / "objects" / "readonly.pack"
    pack.write_text("pack", encoding="utf-8")
    pack.chmod(stat.S_IREAD)

    monkeypatch.setattr(app, "_FBUILD_AUDIO_LIB_DIR", stale)
    monkeypatch.setattr(app, "_fbuild_audio_lib_ready", False)

    cloned = []

    def fake_run_phase(label, args, sink=None, cwd=None):
        cloned.append(args)
        # Stands in for the clone, leaving the marker the next run looks for.
        (stale / "src").mkdir(parents=True, exist_ok=True)
        (stale / "src" / "Audio.h").write_text("// upstream", encoding="utf-8")
        yield "cloned\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", fake_run_phase)

    lines = list(app._ensure_fbuild_audio_lib())

    assert any("vendoring ESP32-audioI2S" in line for line in lines)
    assert cloned, "the stale checkout was removed and a fresh clone ran"
    assert (stale / "src" / "Audio.h").exists()
    assert not (stale / ".git").exists()


def test_vendoring_is_skipped_when_upstream_is_already_cached(monkeypatch, tmp_path):
    # The marker is upstream's own header, which is also what tells a -nopsram
    # fork checkout apart: that fork ships only Audio_nopsram.h, so a stale one
    # misses here and gets replaced.
    cached = tmp_path / "ESP32-audioI2S"
    (cached / "src").mkdir(parents=True)
    (cached / "src" / "Audio.h").write_text("// upstream", encoding="utf-8")

    def must_not_clone(*args, **kwargs):
        raise AssertionError("a cached upstream checkout must not be re-cloned")

    monkeypatch.setattr(app, "_FBUILD_AUDIO_LIB_DIR", cached)
    monkeypatch.setattr(app, "_fbuild_audio_lib_ready", False)
    monkeypatch.setattr(app, "_run_phase", must_not_clone)

    assert list(app._ensure_fbuild_audio_lib()) == []
