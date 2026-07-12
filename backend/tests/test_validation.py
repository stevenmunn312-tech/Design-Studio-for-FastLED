"""Request validation the endpoints must enforce before doing any real work
(compiling, opening a port, writing a file) — all reachable without any
attached hardware or installed build engine."""


def test_engine_post_rejects_unknown_engine(client):
    r = client.post("/api/engine", json={"engine": "quantum-fbuild"})
    assert r.status_code == 400
    assert "engine" in r.json()["error"]


def test_engine_post_rejects_missing_engine(client):
    r = client.post("/api/engine", json={})
    assert r.status_code == 400


def test_serial_monitor_requires_port(client):
    r = client.get("/api/serial/monitor", params={"port": ""})
    assert r.status_code == 400


def test_serial_monitor_rejects_out_of_range_baud(client):
    r = client.get("/api/serial/monitor", params={"port": "COM5", "baud": 100})
    assert r.status_code == 400
    r = client.get("/api/serial/monitor", params={"port": "COM5", "baud": 5_000_000})
    assert r.status_code == 400


def test_stream_start_requires_port(client):
    r = client.post("/api/stream/start", json={"port": ""})
    assert r.status_code == 400


def test_patterns_post_requires_id_name_subgraph(client):
    r = client.post("/api/patterns", json={"name": "Only A Name"})
    assert r.status_code == 400
    r = client.post("/api/patterns", json={"id": "abc", "subgraph": {}})
    assert r.status_code == 400
    r = client.post("/api/patterns", json={"id": "abc", "name": "No Subgraph"})
    assert r.status_code == 400


def test_projects_post_requires_id_name_workspace(client):
    r = client.post("/api/projects", json={"name": "No id or workspace"})
    assert r.status_code == 400
    r = client.post(
        "/api/projects",
        json={"id": "p1", "name": "Bad workspace shape", "workspace": {"nodes": []}},
    )
    assert r.status_code == 400  # missing "edges"


def test_upload_reports_missing_engine(client, monkeypatch):
    monkeypatch.setattr("app._active_engine", lambda: "fbuild")
    monkeypatch.setattr("app._FBUILD_BIN", None)
    r = client.post("/api/upload", json={"ino": "void setup(){}", "port": ""})
    assert r.status_code == 400
    assert "fbuild" in r.json()["error"]

    monkeypatch.setattr("app._active_engine", lambda: "arduino-cli")
    monkeypatch.setattr("app._ARDUINO_CLI", None)
    r = client.post("/api/upload", json={"ino": "void setup(){}", "port": ""})
    assert r.status_code == 400
    assert "arduino-cli" in r.json()["error"]


def test_upload_show_reports_missing_engine(client, monkeypatch):
    monkeypatch.setattr("app._active_engine", lambda: "fbuild")
    monkeypatch.setattr("app._FBUILD_BIN", None)
    r = client.post(
        "/api/upload-show",
        data={"meta": "{}", "provisioner": "x", "player": "y"},
    )
    assert r.status_code == 400
