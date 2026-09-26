"""The helper only acts for the machine it is running on.

CORS does not stop a browser from sending a simple request, and a public name
pointed at 127.0.0.1 would otherwise look like a normal Host. These checks
run before a route.
"""
import app


def test_foreign_origin_cannot_upload_a_show(client):
    response = client.post(
        "/api/upload-show",
        data={"meta": "{}", "player": "player-ino"},
        headers={"Origin": "http://evil.example"},
    )
    assert response.status_code == 403
    assert response.json() == {"ok": False, "error": "forbidden"}


def test_foreign_origin_cannot_write_an_sd_card(client):
    response = client.post(
        "/api/sd-copy",
        data={"meta": "{}"},
        headers={"Origin": "http://evil.example"},
    )
    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


def test_foreign_origin_cannot_stop_a_stream(client):
    response = client.post("/api/stream/stop", headers={"Origin": "http://evil.example"})
    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


def test_foreign_host_is_rejected(client):
    response = client.get("/api/health", headers={"Host": "evil.example"})
    assert response.status_code == 403
    assert response.json()["error"] == "forbidden"


def test_localhost_origin_still_reaches_upload_show(client):
    response = client.post(
        "/api/upload-show",
        data={"meta": "{}", "player": "player-ino"},
        headers={"Origin": "http://127.0.0.1:5173"},
    )
    assert response.status_code == 200
    assert "a serial port is required" in response.text


def test_localhost_origin_still_reaches_sd_copy(client):
    response = client.post(
        "/api/sd-copy",
        data={"meta": "{}"},
        headers={"Origin": "http://localhost:5173"},
    )
    assert response.status_code == 400
    assert "removable" in response.text


def test_localhost_origin_still_reaches_stream_stop(client):
    response = client.post("/api/stream/stop", headers={"Origin": "http://localhost:8008"})
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_named_localhost_dev_origins_are_allowed(client):
    for origin in (
        "http://design-studio-for-fastled.localhost:5173",
        "http://fastled-studio.localhost:4173",
        "http://[::1]:8008",
    ):
        response = client.post("/api/stream/stop", headers={"Origin": origin})
        assert response.status_code == 200, origin
        assert response.headers["access-control-allow-origin"] == origin


def test_cross_site_fetch_without_an_origin_is_rejected(client):
    # An <img src="http://127.0.0.1:8008/api/serial/monitor?port=COM3"> sends
    # no Origin and Sec-Fetch-Site: cross-site. It must not open the port.
    response = client.get(
        "/api/serial/monitor",
        params={"port": "COM3"},
        headers={"Sec-Fetch-Site": "cross-site"},
    )
    assert response.status_code == 403


def test_health_stays_open_for_a_local_host(client):
    response = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_host_patterns_match_the_documented_boundary():
    assert app._local_request_allowed(_request("GET", "/api/health", host="localhost:8008"))
    assert app._local_request_allowed(_request("GET", "/api/health", host="[::1]:8008"))
    assert not app._local_request_allowed(_request("GET", "/api/health", host="evil.example"))
    assert not app._local_request_allowed(_request("GET", "/api/health", host="localhost.evil.example"))
    assert not app._local_request_allowed(_request("POST", "/api/stream/stop", host="127.0.0.1:8008", origin="http://evil.example"))
    assert app._local_request_allowed(_request(
        "POST", "/api/stream/stop", host="127.0.0.1:8008", sec_fetch_site="same-origin",
    ))
    assert app._local_request_allowed(_request(
        "POST", "/api/stream/stop", host="127.0.0.1:8008", sec_fetch_site="none",
    ))
    assert not app._local_request_allowed(_request(
        "POST", "/api/stream/stop", host="127.0.0.1:8008", sec_fetch_site="cross-site",
    ))


class _Headers(dict):
    def get(self, key, default=None):
        return super().get(key.lower(), default)


class _URL:
    def __init__(self, path):
        self.path = path


class _Request:
    def __init__(self, method, path, headers):
        self.method = method
        self.url = _URL(path)
        self.headers = headers


def _request(method, path, host, origin=None, sec_fetch_site=None):
    headers = {"host": host}
    if origin is not None:
        headers["origin"] = origin
    if sec_fetch_site is not None:
        headers["sec-fetch-site"] = sec_fetch_site
    return _Request(method, path, _Headers(headers))
