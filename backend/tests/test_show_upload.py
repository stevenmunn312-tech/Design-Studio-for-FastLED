"""Music-sync `/api/upload-show` failure phases: provisioner compile fail,
provisioner upload fail, SD-transfer fail, player compile fail, player upload
fail, and the full success path — each must stop at the right step and never
run a step that would touch hardware once an earlier one has failed.

`_compile_upload_fbuild`/`_serial_send`/`_ensure_fbuild_audio_lib` are all
generator functions (their real implementations `yield` progress lines and
`return` a result captured via `yield from`), so the fakes below must also be
generator functions — a plain `return` without any `yield` in the body would
make `yield from fake(...)` blow up with "not iterable" the moment app.py
tries to delegate to it.
"""
import app


def _fake_generator(result):
    def gen(*args, **kwargs):
        if False:
            yield  # pragma: no cover — makes `gen` a generator function
        return result
    return gen


def _compile_sequence(results: dict):
    """results: {label: (rc, phase)}. Fakes `_compile_upload_fbuild`, tracking
    which labels were actually invoked."""
    calls = []

    def fake(label, ino, fqbn, port):
        calls.append(label)
        if False:
            yield  # pragma: no cover
        return results[label]

    fake.calls = calls
    return fake


def test_upload_show_reports_when_no_port_given(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    r = client.post(
        "/api/upload-show",
        data={"meta": "{}", "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert r.status_code == 200
    assert "a serial port is required" in r.text


def test_provisioner_compile_failure_stops_before_sd_transfer(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Player pre-flight": (0, "compile"), "Provisioner": (1, "compile")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)

    def _boom(*a, **kw):
        raise AssertionError("SD transfer must not start when the provisioner failed to compile")
    monkeypatch.setattr(app, "_serial_send", _boom)

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Provisioner build failed" in r.text
    assert "nothing was flashed" in r.text
    assert fake_compile.calls == ["Player pre-flight", "Provisioner"]


def test_provisioner_upload_failure_stops_before_sd_transfer(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Player pre-flight": (0, "compile"), "Provisioner": (1, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)

    def _boom(*a, **kw):
        raise AssertionError("SD transfer must not start when the provisioner failed to flash")
    monkeypatch.setattr(app, "_serial_send", _boom)

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Provisioner flash failed" in r.text
    assert "download mode" in r.text
    assert fake_compile.calls == ["Player pre-flight", "Provisioner"]


def test_sd_transfer_failure_stops_before_player_build(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Player pre-flight": (0, "compile"), "Provisioner": (0, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(False))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "SD transfer failed" in r.text
    assert "not flashing the player" in r.text
    assert fake_compile.calls == ["Player pre-flight", "Provisioner"]  # real Player build never attempted


def test_player_compile_failure_message(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Player pre-flight": (0, "compile"), "Provisioner": (0, "upload"), "Player": (1, "compile")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(True))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Player build failed" in r.text
    assert "still running the provisioner" in r.text
    assert fake_compile.calls == ["Player pre-flight", "Provisioner", "Player"]


def test_player_upload_failure_message(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Player pre-flight": (0, "compile"), "Provisioner": (0, "upload"), "Player": (1, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(True))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Player flash failed" in r.text
    assert "download mode" in r.text
    assert fake_compile.calls == ["Player pre-flight", "Provisioner", "Player"]


def test_full_pipeline_success(client, monkeypatch):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Player pre-flight": (0, "compile"), "Provisioner": (0, "upload"), "Player": (0, "upload")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(True))

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "All done" in r.text
    assert fake_compile.calls == ["Player pre-flight", "Provisioner", "Player"]


def test_player_preflight_stops_before_flashing_or_transferring(client, monkeypatch):
    # The Player is the likeliest build to fail — every collected pattern adds
    # static render buffers, and a classic ESP32 exhausts DRAM long before
    # flash. It used to be built last, so an over-size design was discovered
    # only after the provisioner had overwritten the user's firmware and a
    # multi-megabyte song had crossed the wire at 115200: twelve minutes to
    # learn what a 45-second compile knew up front (hardware, 2026-08-16,
    # dram0_0_seg overflowed by 93,512 bytes).
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    fake_compile = _compile_sequence({"Player pre-flight": (1, "compile")})
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake_compile)

    def _boom(*a, **kw):
        raise AssertionError("nothing may touch the board when the player cannot fit")
    monkeypatch.setattr(app, "_serial_send", _boom)

    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert "Player will not fit" in r.text
    assert "the card was not touched" in r.text
    # The provisioner must never be flashed: leaving the board running it, with
    # the user's own firmware gone, is a worse end state than doing nothing.
    assert fake_compile.calls == ["Player pre-flight"]


def test_player_preflight_compiles_without_flashing(client, monkeypatch):
    # The pre-flight must compile only. Handing it the port would flash a
    # player onto the board before its songs and shows exist on the card.
    ports = {}

    def fake(label, ino, fqbn, port):
        ports[label] = port
        if False:
            yield  # pragma: no cover
        return (0, "upload")

    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    monkeypatch.setattr(app, "_compile_upload_fbuild", fake)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(True))

    client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "provisioner": "prov-ino", "player": "player-ino"},
    )
    assert ports["Player pre-flight"] == ""
    assert ports["Provisioner"] == "COM7"
    assert ports["Player"] == "COM7"


class _GreetingSerial:
    """Serial stand-in that replays scripted lines, then silence."""

    def __init__(self, lines):
        self.lines = list(lines)
        self.timeout = 0
        self.writes = []
        self.closed = False
        self.dtr = self.rts = True
        self.baudrate = 115200

    def readline(self):
        return self.lines.pop(0) if self.lines else b""

    def reset_input_buffer(self):
        pass

    def write(self, data):
        self.writes.append(data)

    def flush(self):
        pass

    def close(self):
        self.closed = True


def _run_send(monkeypatch, lines):
    import serial
    fake = _GreetingSerial(lines)
    monkeypatch.setattr(serial, "Serial", lambda *a, **k: fake)
    monkeypatch.setattr(app.time, "sleep", lambda _s: None)
    out = list(app._serial_send("COM7", [("/music/x.mp3", b"abc")]))
    return fake, "".join(out)


def test_sd_mount_failure_is_reported_verbatim_and_immediately(monkeypatch):
    # The provisioner prints this once at boot and then halts, so it never
    # answers a PING. The retry loop used to clear the buffer before its first
    # attempt, discarding the one line that explained the failure — leaving
    # ~165s of silence and a guess. A card with no power produced exactly this
    # on 2026-08-16.
    _fake, log = _run_send(monkeypatch, [b"ERR sd-mount-failed\n"])
    assert "board says: ERR sd-mount-failed" in log
    assert "could not mount the SD card" in log
    assert "formatted FAT32" in log
    # It must not sit through eight timeouts first.
    assert "waiting for the board" not in log


def test_handshake_reports_progress_instead_of_going_quiet(monkeypatch):
    # Over two minutes of possible waiting has to look like waiting.
    _fake, log = _run_send(monkeypatch, [])
    assert "waiting for the board (1/8)" in log
    assert "waiting for the board (8/8)" in log
    assert "never reported READY" in log
    assert "it sent nothing at all" in log


def test_boot_greeting_of_ready_skips_the_handshake_loop(monkeypatch):
    # A board that announced itself at boot needs no handshake retries; the
    # PINGs that follow belong to the baud-raise confirmation, not to waiting.
    fake, log = _run_send(monkeypatch, [b"READY\n", b"OK\n", b"A\n", b"DONE\n", b"BYE\n"])
    assert "board says: READY" in log
    assert "waiting for the board" not in log
    assert fake.writes[0] == b"BAUD 921600\n", "it should go straight to raising the link"
