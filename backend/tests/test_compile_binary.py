"""`/api/compile-binary` — the Export Binary path.

The compile itself is faked out; what these cover is the part that is easy to
get quietly wrong: which of a build's several images is the one worth handing
someone, and the marker the frontend turns into a download.
"""
import app


def _marker(body: str) -> str:
    return next(line for line in body.splitlines() if line.startswith("[binary]"))


def test_prefers_the_whole_flash_image_over_the_application_one(tmp_path):
    # An ESP32 build produces both. The merged image flashes at offset 0 with
    # nothing else needed; the application image alone needs 0x10000 plus a
    # bootloader and partition table already on the board.
    for name in ("sketch.ino.bin", "sketch.ino.bootloader.bin",
                 "sketch.ino.partitions.bin", "sketch.ino.merged.bin"):
        (tmp_path / name).write_bytes(b"\x00")

    assert app._export_artifact(tmp_path).name == "sketch.ino.merged.bin"


def test_picks_the_application_image_when_nothing_merged_it(tmp_path):
    for name in ("sketch.ino.bin", "sketch.ino.bootloader.bin"):
        (tmp_path / name).write_bytes(b"\x00")

    assert app._export_artifact(tmp_path).name == "sketch.ino.bin"


def test_picks_fbuilds_firmware_over_the_parts_beside_it(tmp_path):
    # fbuild leaves the bootloader and partition images in the same directory
    # and names the application one `firmware.bin`.
    for name in ("boot_app0.bin", "bootloader.bin", "partitions.bin", "firmware.bin"):
        (tmp_path / name).write_bytes(b"\x00")

    assert app._export_artifact(tmp_path).name == "firmware.bin"


def test_picks_the_plain_hex_over_the_bootloader_bundled_one(tmp_path):
    for name in ("sketch.ino.with_bootloader.hex", "sketch.ino.hex"):
        (tmp_path / name).write_bytes(b"\x00")

    assert app._export_artifact(tmp_path).name == "sketch.ino.hex"


def test_reports_nothing_when_the_build_left_no_image(tmp_path):
    (tmp_path / "sketch.ino.elf").write_bytes(b"\x00")
    (tmp_path / "sketch.ino.map").write_bytes(b"\x00")

    assert app._export_artifact(tmp_path) is None


def test_export_name_keeps_which_image_it_is_but_drops_the_ino(tmp_path):
    artifact = tmp_path / "fastled_pattern.ino.merged.bin"
    artifact.write_bytes(b"\x00")

    assert app._export_name({"name": "Ceiling Lights"}, artifact) == "Ceiling-Lights.merged.bin"


def test_export_name_falls_back_when_the_project_name_is_unusable(tmp_path):
    artifact = tmp_path / "fastled_pattern.ino.bin"
    artifact.write_bytes(b"\x00")

    assert app._export_name({"name": "../.."}, artifact) == f"{app.SKETCH}.bin"
    assert app._export_name({}, artifact) == f"{app.SKETCH}.bin"


def test_prune_keeps_only_the_newest_exports(tmp_path, monkeypatch):
    monkeypatch.setattr(app, "_EXPORT_DIR", tmp_path)
    for index in range(5):
        directory = tmp_path / f"{index:032x}"
        directory.mkdir()
        (directory / "firmware.bin").write_bytes(b"\x00")
        import os
        os.utime(directory, (index, index))

    app._prune_exports(keep=2)

    assert sorted(path.name for path in tmp_path.iterdir()) == [
        f"{3:032x}", f"{4:032x}",
    ]


def test_streams_the_compile_then_names_the_artifact(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    monkeypatch.setattr(app, "_EXPORT_DIR", tmp_path / "exports")

    def fake_compile_upload(label, sketch_dir, fqbn, port, output_dir=None, usb_cdc=False):
        # Nothing is flashed, and the artifacts must land where we can read them.
        assert port == ""
        assert output_dir is not None
        (output_dir / "fastled_pattern.ino.merged.bin").write_bytes(b"firmware" * 200)
        # arduino-cli copies everything it built, debug artifacts included.
        (output_dir / "fastled_pattern.ino.elf").write_bytes(b"\x7fELF" * 4000)
        (output_dir / "fastled_pattern.ino.map").write_bytes(b"map" * 4000)
        yield "  [size] flash 41%\n"
        return 0, "compile"

    monkeypatch.setattr(app, "_compile_upload", fake_compile_upload)

    r = client.post("/api/compile-binary", json={
        "ino": "void setup(){}", "fqbn": "esp32:esp32:esp32s3", "name": "Bench",
    })
    assert r.status_code == 200
    body = r.text
    assert "[size] flash 41%" in body  # the log streamed, not just the verdict
    marker = _marker(body)
    assert "name=Bench.merged.bin" in marker
    assert "bytes=1600" in marker

    artifact_id = marker.split("id=")[1].split(" ")[0]
    download = client.get(f"/api/compile-binary/{artifact_id}")
    assert download.status_code == 200
    assert download.content == b"firmware" * 200

    # Only the image is kept: the .elf and .map beside a real 4MB firmware
    # are 80MB of debug artifacts nobody asked to store.
    kept = sorted(path.name for path in (tmp_path / "exports" / artifact_id).iterdir())
    assert kept == ["fastled_pattern.ino.merged.bin"]


def test_says_so_when_the_compile_fails(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    monkeypatch.setattr(app, "_EXPORT_DIR", tmp_path / "exports")

    def fake_compile_upload(label, sketch_dir, fqbn, port, output_dir=None, usb_cdc=False):
        yield "error: 'frame' was not declared in this scope\n"
        return 1, "compile"

    monkeypatch.setattr(app, "_compile_upload", fake_compile_upload)

    r = client.post("/api/compile-binary", json={"ino": "void setup(){}"})
    assert _marker(r.text) == "[binary] failed"


def test_refuses_an_artifact_id_that_is_not_one(client):
    assert client.get("/api/compile-binary/../../etc").status_code in (404, 400)
    assert client.get("/api/compile-binary/not-an-id").status_code == 404
