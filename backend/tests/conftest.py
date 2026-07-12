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

    def __init__(self, port, baud, timeout=0):
        self.port = port
        self.baud = baud
        self.dtr = True
        self.rts = True
        self.closed = False
        self.writes: list[bytes] = []
        FakeSerial.instances.append(self)

    def write(self, data: bytes):
        if self.closed:
            raise RuntimeError("write to closed port")
        self.writes.append(data)

    def close(self):
        self.closed = True


@pytest.fixture
def fake_serial(monkeypatch):
    import serial

    FakeSerial.instances = []
    monkeypatch.setattr(serial, "Serial", FakeSerial)
    return FakeSerial
