"""Music-sync `/api/upload-show` phases: player compile fail, player upload
fail, SD-transfer fail, and the success path — each must stop at the right step
and never run a step that would touch hardware once an earlier one has failed.

The player carries the file-receive protocol itself, so this is one build and
one flash followed by the transfer. There is no provisioner sketch and no
separate pre-flight compile: building the player *is* the pre-flight, and a
build that fails leaves both the board and the card untouched.

`_compile_upload_fbuild`/`_serial_send`/`_ensure_fbuild_audio_lib` are all
generator functions (their real implementations `yield` progress lines and
`return` a result captured via `yield from`), so the fakes below must also be
generator functions — a plain `return` without any `yield` in the body would
make `yield from fake(...)` blow up with "not iterable" the moment app.py
tries to delegate to it.
"""
import io

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

    def fake(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
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
        data={"meta": "{}", "player": "player-ino"},
    )
    assert r.status_code == 200
    assert "a serial port is required" in r.text


def _setup(monkeypatch, compile_fake, transfer_ok=True):
    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    monkeypatch.setattr(app, "_compile_upload_fbuild", compile_fake)
    monkeypatch.setattr(app, "_serial_send", _fake_generator(transfer_ok))


def _post(client):
    return client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "player": "player-ino"},
    )


def test_player_compile_failure_touches_neither_board_nor_card(client, monkeypatch):
    # The whole reason the player is built first: a design that cannot fit is
    # the likeliest failure, and discovering it must cost one compile — not a
    # flash over the user's firmware plus a multi-megabyte transfer.
    fake = _compile_sequence({"Player": (1, "compile")})
    _setup(monkeypatch, fake)
    sent = []

    def send_fake(port, payloads):
        sent.append(port)
        if False:
            yield  # pragma: no cover
        return True

    monkeypatch.setattr(app, "_serial_send", send_fake)

    r = _post(client)
    assert "nothing was flashed" in r.text and "card was not touched" in r.text
    assert sent == []


def test_player_upload_failure_suggests_download_mode(client, monkeypatch):
    _setup(monkeypatch, _compile_sequence({"Player": (1, "upload")}))
    r = _post(client)
    assert "Player flash failed" in r.text
    assert "download mode" in r.text


def test_sd_transfer_failure_says_a_retry_needs_no_rebuild(client, monkeypatch):
    # The board is already running the receiver, which is the point of merging
    # it in — a retry re-sends the files with no build at all.
    fake = _compile_sequence({"Player": (0, "upload")})
    _setup(monkeypatch, fake, transfer_ok=False)
    r = _post_with_files(client)
    assert "SD transfer failed" in r.text
    assert "without another build" in r.text


def _post_with_files(client):
    return client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7", "paths": ["/music/x.mp3"]}', "player": "player-ino"},
        files=[("files", ("x.mp3", io.BytesIO(b"abc"), "audio/mpeg"))],
    )


def test_success_is_one_build_flashed_to_the_port_then_the_transfer(client, monkeypatch):
    order = []

    def compile_fake(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        order.append((label, port))
        if False:
            yield  # pragma: no cover
        return (0, "upload")

    def send_fake(port, payloads):
        order.append(("transfer", port))
        if False:
            yield  # pragma: no cover
        return True

    monkeypatch.setattr(app, "_active_engine", lambda: "fbuild")
    monkeypatch.setattr(app, "_FBUILD_BIN", "/fake/fbuild")
    monkeypatch.setattr(app, "_ensure_fbuild_audio_lib", _fake_generator(None))
    monkeypatch.setattr(app, "_compile_upload_fbuild", compile_fake)
    monkeypatch.setattr(app, "_serial_send", send_fake)

    r = _post_with_files(client)
    # One build, flashed to the real port, and the transfer runs through it.
    assert order == [("Player", "COM7"), ("transfer", "COM7")]
    assert "All done" in r.text


def test_show_hardware_target_reaches_fbuild(client, monkeypatch):
    calls = []

    def compile_fake(label, ino, fqbn, port, flash_mb=None, usb_cdc=False):
        calls.append((fqbn, flash_mb, usb_cdc))
        if False:
            yield  # pragma: no cover
        return (0, "upload")

    _setup(monkeypatch, compile_fake)
    r = client.post(
        "/api/upload-show",
        data={
            "meta": '{"fqbn":"esp32:esp32:esp32s3:PSRAM=opi","port":"COM7",'
                    '"flashMb":16,"usbCdcOnBoot":true}',
            "player": "player-ino",
        },
    )

    assert r.status_code == 200
    assert calls == [("esp32:esp32:esp32s3:PSRAM=opi", 16, True)]


def test_no_files_flashes_the_player_and_skips_the_transfer(client, monkeypatch):
    # The card-reader path writes the songs and shows to a mounted card itself,
    # so by the time it calls this endpoint the only thing left is the flash.
    # Opening the serial port to transfer nothing would just be a delay.
    fake = _compile_sequence({"Player": (0, "upload")})
    _setup(monkeypatch, fake)
    sent = []

    def send_fake(port, payloads):
        sent.append(port)
        if False:
            yield  # pragma: no cover
        return True

    monkeypatch.setattr(app, "_serial_send", send_fake)

    r = _post(client)
    assert fake.calls == ["Player"]
    assert sent == []
    assert "the player is flashed" in r.text


def test_a_provisioner_field_from_an_older_frontend_is_ignored(client, monkeypatch):
    # Accepted so an older client keeps working, but nothing is built from it.
    fake = _compile_sequence({"Player": (0, "upload")})
    _setup(monkeypatch, fake)
    r = client.post(
        "/api/upload-show",
        data={"meta": '{"port": "COM7"}', "player": "player-ino", "provisioner": "prov-ino"},
    )
    assert r.status_code == 200
    assert fake.calls == ["Player"]


class _GreetingSerial:
    """Serial stand-in that replays scripted lines, then silence."""

    def __init__(self, lines):
        self.lines = list(lines)
        self.timeout = 0
        self.writes = []
        self.closed = False
        self.opened = False
        self.dtr = self.rts = True
        self.baudrate = 115200
        self.port = None
        self.dtr_at_open = None
        self.rts_at_open = None

    def open(self):
        self.opened = True
        self.dtr_at_open = self.dtr
        self.rts_at_open = self.rts

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


def test_sd_transfer_does_not_reset_the_native_usb_board(monkeypatch):
    """DTR/RTS must already be clear when Windows opens the COM port."""
    fake, log = _run_send(monkeypatch, [
        b"READY\n", b"OK\n", b"READY\n", b"OK\n", b"A\n", b"DONE\n", b"BYE\n",
    ])

    assert "SD transfer complete" in log
    assert fake.opened is True
    assert fake.dtr_at_open is False
    assert fake.rts_at_open is False
