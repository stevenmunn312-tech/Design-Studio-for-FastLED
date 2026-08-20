import serial

import app as app_module


class RtcSerial:
    instances = []

    def __init__(self, port, baud, timeout=0, write_timeout=None):
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.write_timeout = write_timeout
        self.dtr = True
        self.rts = True
        self.writes = []
        self.closed = False
        self.replies = [b"RTC clock set successfully\n", b"FLS_RTC_OK\n"]
        type(self).instances.append(self)

    def reset_input_buffer(self):
        pass

    def write(self, value):
        self.writes.append(value)

    def flush(self):
        pass

    def readline(self):
        return self.replies.pop(0) if self.replies else b""

    def close(self):
        self.closed = True


def test_set_rtc_sends_one_validated_command(client, monkeypatch):
    RtcSerial.instances = []
    monkeypatch.setattr(serial, "Serial", RtcSerial)
    monkeypatch.setattr(app_module.time, "sleep", lambda _seconds: None)

    response = client.post("/api/rtc/set", json={
        "port": "COM7",
        "dateTime": "2026-08-21 13:45:09",
    })

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "dateTime": "2026-08-21 13:45:09",
        "serialMessage": "RTC clock set successfully",
    }
    device = RtcSerial.instances[0]
    assert device.writes == [b"FLS_RTC_SET 2026-08-21 13:45:09\n"]
    assert device.dtr is False
    assert device.rts is False
    assert device.closed is True


def test_set_rtc_rejects_an_impossible_calendar_time(client):
    response = client.post("/api/rtc/set", json={
        "port": "COM7",
        "dateTime": "2026-02-31 12:00:00",
    })
    assert response.status_code == 400
    assert response.json()["error"] == "dateTime is not a real calendar time"


def test_set_rtc_returns_the_board_failure_message(client, monkeypatch):
    class FailedRtcSerial(RtcSerial):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.replies = [b"RTC clock set failed\n", b"FLS_RTC_ERROR\n"]

    monkeypatch.setattr(serial, "Serial", FailedRtcSerial)
    monkeypatch.setattr(app_module.time, "sleep", lambda _seconds: None)

    response = client.post("/api/rtc/set", json={
        "port": "COM7",
        "dateTime": "2026-08-21 13:45:09",
    })

    assert response.status_code == 502
    assert response.json() == {
        "ok": False,
        "error": "the board could not write the DS3231",
        "serialMessage": "RTC clock set failed",
    }
