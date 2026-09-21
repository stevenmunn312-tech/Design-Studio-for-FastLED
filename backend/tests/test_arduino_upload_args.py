"""Focused command-line coverage for the arduino-cli upload path."""

import app


def test_native_usb_option_reaches_both_compile_and_upload_fqbns(
    client, monkeypatch, tmp_path,
):
    monkeypatch.setattr(app, "_active_engine", lambda: "arduino-cli")
    monkeypatch.setattr(app, "_ARDUINO_CLI", "/fake/arduino-cli")
    monkeypatch.setattr(app, "_ARDUINO_BASE", ["arduino-cli"])
    monkeypatch.setattr(app, "_SKETCH_DIR_ROOT", tmp_path / "sketches")
    calls = []

    def fake_run_phase(label, args, sink=None, cwd=None, tool_env=None):
        calls.append((label, args))
        if sink is not None:
            sink.append(
                "Sketch uses 10 bytes (1%) of program storage space. "
                "Maximum is 1000 bytes.\n"
            )
        yield "ok\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", fake_run_phase)

    response = client.post("/api/upload", json={
        "ino": "void setup() {}\nvoid loop() {}",
        "fqbn": "esp32:esp32:esp32s3:PSRAM=opi",
        "port": "COM7",
        "usbCdcOnBoot": True,
    })

    assert response.status_code == 200
    assert [label for label, _ in calls] == [
        "Sketch · compile", "Sketch · upload",
    ]
    expected = "esp32:esp32:esp32s3:PSRAM=opi,CDCOnBoot=cdc"
    sketch_dir = calls[0][1][-1]
    assert calls[0][1] == [
        "arduino-cli", "compile", "-v", "--fqbn", expected, sketch_dir,
    ]
    assert calls[1][1] == [
        "arduino-cli", "upload", "-v", "-p", "COM7", "--fqbn", expected,
        sketch_dir,
    ]
