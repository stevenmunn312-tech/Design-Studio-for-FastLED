import time

import pytest
from fastapi.testclient import TestClient

import app as app_module


@pytest.fixture
def client():
    return TestClient(app_module.app)


@pytest.fixture(autouse=True)
def _clean_stream_state():
    """Every test starts with (and leaves) no open streaming session, no
    matter what a test does to app_module's stream globals."""
    yield
    with app_module._stream_lock:
        if app_module._stream_serial is not None:
            try:
                app_module._stream_serial.close()
            except Exception:
                pass
        app_module._stream_serial = None
        app_module._stream_port = None
        app_module._stream_baud = 0
    app_module._artnet_stop_listener(clear_error=True)


class FakeSerial:
    """Stand-in for pyserial's Serial so streaming tests never touch a real
    port. Records every write() call for assertions."""

    instances: list["FakeSerial"] = []

    def __init__(self, port=None, baud=None, timeout=0, write_timeout=None):
        # Every argument is optional because the serial monitor builds the port
        # unopened, sets its control lines, and only then calls open() — the
        # order that keeps Windows from pulsing DTR/RTS and resetting an ESP32
        # into download mode. `dtr`/`rts` therefore start asserted here, the way
        # a real unopened pyserial port does, so a test can prove they were
        # cleared before the open rather than after it.
        self.port = port
        self.baud = baud
        self.baudrate = baud
        self.timeout = timeout
        self.write_timeout = write_timeout
        self.dtr = True
        self.rts = True
        self.opened = port is not None
        self.dtr_at_open = None
        self.rts_at_open = None
        self.closed = False
        self.writes: list[bytes] = []
        # Simulates a write that never returns within pyserial's own
        # write_timeout — e.g. a Windows driver that doesn't honor it while
        # the receiver has stopped draining the line. Real writes obviously
        # can't be interrupted this way; this just lets tests exercise the
        # app's own independent watchdog (_STREAM_WRITE_TIMEOUT_S) instead of
        # trusting pyserial's timeout alone.
        self.hang_seconds: float = 0
        FakeSerial.instances.append(self)

    def open(self):
        # Record the control-line state the port was actually opened with: that
        # is the moment the auto-reset circuit sees, and the whole point of the
        # build-then-open order.
        self.opened = True
        self.dtr_at_open = self.dtr
        self.rts_at_open = self.rts

    def write(self, data: bytes):
        if self.closed:
            raise RuntimeError("write to closed port")
        if self.hang_seconds:
            time.sleep(self.hang_seconds)
        self.writes.append(data)

    # A quiet board: `read` returns nothing, which is the case that used to
    # leave the serial monitor with no cancellation point.
    @property
    def in_waiting(self):
        return 0

    @property
    def is_open(self):
        return not self.closed

    def read(self, _n=1):
        return b""

    def close(self):
        self.closed = True


@pytest.fixture
def fake_serial(monkeypatch):
    import serial

    FakeSerial.instances = []
    monkeypatch.setattr(serial, "Serial", FakeSerial)
    return FakeSerial
