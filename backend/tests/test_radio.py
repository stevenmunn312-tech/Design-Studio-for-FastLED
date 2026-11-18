"""The preview's internet radio relay: URL rules, playlists and stream titles."""
import io
from email.message import Message

import radio


class FakeResponse(io.BytesIO):
    """An HTTPResponse stand-in: bytes plus the headers the relay reads."""

    def __init__(self, data: bytes, headers: dict[str, str]):
        super().__init__(data)
        self.headers = Message()
        for key, value in headers.items():
            self.headers[key] = value


def test_station_rules_match_the_studio_and_the_board():
    assert radio.station_url_problem("http://jking.cdnstream1.com/b22139_128mp3") is None
    assert radio.station_url_problem("https://icecast.walmradio.com:8443/jazz") is None
    for bad in ["", "ftp://x.example.com/a", "file:///etc/passwd", "http://x.example.com/a b",
                "http://user:pw@x.example.com/", "http://[::1]/live", "http://x.example.com/#f",
                "http://x.example.com/" + "a" * 260]:
        assert radio.station_url_problem(bad) is not None, bad


def test_relay_strips_icy_metadata_and_keeps_the_title():
    title = b"StreamTitle='Miles Davis - So What';"
    block = title + b"\0" * (-len(title) % 16)
    audio_a, audio_b = b"A" * 8, b"B" * 8
    data = audio_a + bytes([len(block) // 16]) + block + audio_b + b"\0"
    response = FakeResponse(data, {"icy-metaint": "8"})
    assert b"".join(radio.relay_audio(response, "http://x.example.com/live")) == audio_a + audio_b
    assert radio.radio_now("http://x.example.com/live") == {"ok": True, "title": "Miles Davis - So What"}


def test_relay_passes_a_stream_without_metadata_through():
    response = FakeResponse(b"x" * 10000, {})
    assert b"".join(radio.relay_audio(response, "http://y.example.com/live")) == b"x" * 10000


def test_playlists_name_their_first_valid_stream():
    assert radio.playlist_stream_url("#EXTM3U\n#EXTINF:-1,Jazz\nhttp://a.example.com/live\n") == "http://a.example.com/live"
    assert radio.playlist_stream_url("[playlist]\nFile1=http://b.example.com:8000/\nTitle1=B\n") == "http://b.example.com:8000/"
    assert radio.playlist_stream_url("File1=ftp://c.example.com/\n") is None


def test_refuses_a_bad_url_before_fetching(client):
    response = client.get("/api/radio/stream", params={"url": "file:///etc/passwd"},
                          headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 400


def test_another_site_cannot_use_the_relay(client):
    response = client.get("/api/radio/stream", params={"url": "http://x.example.com/live"},
                          headers={"Origin": "http://evil.example"})
    assert response.status_code == 403


def test_the_relay_will_not_fetch_from_this_computer(client, monkeypatch):
    # A station list arrives with a shared project, and the helper answers its
    # own loopback requests without the origin check a browser's would get.
    opened = []
    monkeypatch.setattr(radio._opener, "open", lambda *a, **k: opened.append(a))
    for host, address in [("localhost", "127.0.0.1"), ("rebound.example.com", "127.0.0.1"),
                          ("meta.example.com", "169.254.169.254"), ("six.example.com", "::1")]:
        monkeypatch.setattr(radio, "_resolve", lambda name, address=address: [address])
        response = client.get("/api/radio/stream", params={"url": f"http://{host}:8008/api/serial/ports"},
                              headers={"Origin": "http://localhost:5173"})
        assert response.status_code == 502, host
    assert opened == []


def test_a_station_on_the_home_network_still_plays(monkeypatch):
    monkeypatch.setattr(radio, "_resolve", lambda name: ["192.168.1.40"])
    assert radio.station_host_problem("http://icecast.lan:8000/live") is None


def test_a_redirect_is_held_to_the_same_rules(monkeypatch):
    import pytest
    import urllib.error

    monkeypatch.setattr(radio, "_resolve", lambda name: ["127.0.0.1"])
    with pytest.raises(urllib.error.URLError):
        radio._CheckedRedirects().redirect_request(None, None, 302, "Found", {}, "http://localhost:8008/api/health")
