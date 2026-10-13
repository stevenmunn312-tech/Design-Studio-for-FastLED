"""A sketch's sibling files — a show's one header per pattern — are written
beside the `.ino`, pruned when a later sketch stops sending them, and refused
when their names are not plain header names."""
import firmware
import toolchain


def test_sketch_files_from_accepts_plain_header_names_only():
    assert toolchain._sketch_files_from(None) == {}
    assert toolchain._sketch_files_from({"pattern_0.h": "int a;\n"}) == {"pattern_0.h": "int a;\n"}
    for bad in ({"../x.h": ""}, {"x.cpp": ""}, {"sub/x.h": ""}, {"x.h": 1}, ["x.h"]):
        try:
            toolchain._sketch_files_from(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted {bad!r}")


def test_workspace_writes_and_prunes_sibling_files(tmp_path, monkeypatch):
    monkeypatch.setattr(firmware, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    ino = "void setup() {}\nvoid loop() {}\n"
    with firmware._sketch_workspace("show", ino, {"pattern_0.h": "int a;\n", "pattern_1.h": "int b;\n"}) as folder:
        assert (folder / "show.ino").read_text(encoding="utf-8") == ino
        assert (folder / "pattern_0.h").read_text(encoding="utf-8") == "int a;\n"
        assert (folder / "pattern_1.h").read_text(encoding="utf-8") == "int b;\n"
        # A file the helper did not write is not the helper's to remove.
        (folder / "lv_conf.h").write_text("// kept\n", encoding="utf-8")
        mtime = (folder / "pattern_0.h").stat().st_mtime_ns
    with firmware._sketch_workspace("show", ino, {"pattern_0.h": "int a;\n"}) as folder:
        assert not (folder / "pattern_1.h").exists()
        assert (folder / "lv_conf.h").exists()
        assert (folder / "pattern_0.h").stat().st_mtime_ns == mtime
    with firmware._sketch_workspace("show", ino) as folder:
        assert not (folder / "pattern_0.h").exists()
        assert not (folder / toolchain._SKETCH_FILES_MANIFEST).exists()


def test_fbuild_main_writes_sibling_files_beside_it(tmp_path, monkeypatch):
    src = tmp_path / "src"
    src.mkdir()
    monkeypatch.setattr(toolchain, "_FBUILD_SRC_DIR", src)
    toolchain._write_fbuild_main("void loop() {}\n", {"pattern_0.h": "int a;\n"})
    assert (src / "pattern_0.h").read_text(encoding="utf-8") == "int a;\n"
    toolchain._write_fbuild_main("void loop() {}\n")
    assert not (src / "pattern_0.h").exists()


def test_compile_check_passes_files_to_the_workspace_and_refuses_bad_names(client, monkeypatch, tmp_path):
    monkeypatch.setattr(toolchain, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(toolchain, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(firmware, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    seen = {}

    def fake_compile_upload(label, sketch_dir, fqbn, port, output_dir=None, usb_cdc=False, flash_mb=None):
        seen["files"] = sorted(path.name for path in sketch_dir.iterdir())
        yield "Sketch uses 1000 bytes (1%) of program storage space.\n"
        yield "Global variables use 100 bytes (1%) of dynamic memory.\n"
        return 0, "compile"

    monkeypatch.setattr(firmware, "_compile_upload", fake_compile_upload)
    r = client.post("/api/compile-check", json={
        "ino": '#include "pattern_0.h"\nvoid loop() {}', "fqbn": "esp32:esp32:esp32",
        "files": {"pattern_0.h": "void render_p0() {}\n"},
    })
    assert r.status_code == 200 and r.json()["ok"] is True
    assert "pattern_0.h" in seen["files"]

    r = client.post("/api/compile-check", json={
        "ino": "void loop() {}", "fqbn": "esp32:esp32:esp32", "files": {"../escape.h": ""},
    })
    assert r.status_code == 400
    assert "escape.h" in r.json()["error"]
