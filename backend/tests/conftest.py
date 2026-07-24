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


class FakeSerial:
    """Stand-in for pyserial's Serial so streaming tests never touch a real
    port. Records every write() call for assertions."""

    instances: list["FakeSerial"] = []

    def __init__(self, port, baud, timeout=0, write_timeout=None):
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.write_timeout = write_timeout
        self.dtr = True
        self.rts = True
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

    def write(self, data: bytes):
        if self.closed:
            raise RuntimeError("write to closed port")
        if self.hang_seconds:
            time.sleep(self.hang_seconds)
        self.writes.append(data)

    def close(self):
        self.closed = True


@pytest.fixture
def fake_serial(monkeypatch):
    import serial

    FakeSerial.instances = []
    monkeypatch.setattr(serial, "Serial", FakeSerial)
    return FakeSerial
