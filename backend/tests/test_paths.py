"""Pattern/project file safety: names must sanitize to something that can
never escape the patterns/projects folder, saves must land only inside it,
and re-saving under a new name must not orphan the old file."""
import json

import app


def test_sanitize_filename_strips_path_traversal():
    assert app._sanitize_filename("../../etc/passwd") == "....etcpasswd"
    assert app._sanitize_filename("..\\..\\Windows\\System32") == "....WindowsSystem32"


def test_sanitize_filename_strips_illegal_windows_chars():
    assert app._sanitize_filename('a<b>c:d"e|f?g*h') == "abcdefgh"


def test_sanitize_filename_collapses_whitespace_and_trims_trailing_dots():
    assert app._sanitize_filename("  My   Cool Pattern...  ") == "My Cool Pattern"


def test_sanitize_filename_caps_length():
    assert len(app._sanitize_filename("a" * 500)) == 80


def test_sanitize_filename_never_returns_empty():
    assert app._sanitize_filename("") == "pattern"
    assert app._sanitize_filename("///...") == "pattern"


def test_save_pattern_lands_inside_patterns_dir(client, tmp_path, monkeypatch):
    patterns_dir = tmp_path / "My Patterns"
    monkeypatch.setattr(app, "_PATTERNS_DIR", patterns_dir)

    pattern = {"id": "p1", "name": "../../evil", "subgraph": {"nodes": [], "edges": []}}
    r = client.post("/api/patterns", json=pattern)
    assert r.status_code == 200

    saved = list(patterns_dir.glob("*.json"))
    assert len(saved) == 1
    assert saved[0].parent.resolve() == patterns_dir.resolve()
    assert json.loads(saved[0].read_text())["id"] == "p1"


def test_save_pattern_rename_removes_old_file(client, tmp_path, monkeypatch):
    patterns_dir = tmp_path / "My Patterns"
    monkeypatch.setattr(app, "_PATTERNS_DIR", patterns_dir)

    base = {"id": "p1", "subgraph": {"nodes": [], "edges": []}}
    client.post("/api/patterns", json={**base, "name": "First Name"})
    assert len(list(patterns_dir.glob("*.json"))) == 1

    client.post("/api/patterns", json={**base, "name": "Renamed"})
    files = list(patterns_dir.glob("*.json"))
    assert len(files) == 1
    assert "Renamed" in files[0].name


def test_save_pattern_disambiguates_same_name_different_id(client, tmp_path, monkeypatch):
    patterns_dir = tmp_path / "My Patterns"
    monkeypatch.setattr(app, "_PATTERNS_DIR", patterns_dir)

    client.post("/api/patterns", json={"id": "p1", "name": "Same Name", "subgraph": {}})
    client.post("/api/patterns", json={"id": "p2", "name": "Same Name", "subgraph": {}})

    files = sorted(f.name for f in patterns_dir.glob("*.json"))
    assert len(files) == 2
    assert any(f == "Same Name.json" for f in files)
    assert any(f == "Same Name-p2.json" for f in files)


def test_delete_pattern_removes_file_by_id(client, tmp_path, monkeypatch):
    patterns_dir = tmp_path / "My Patterns"
    monkeypatch.setattr(app, "_PATTERNS_DIR", patterns_dir)

    client.post("/api/patterns", json={"id": "p1", "name": "Doomed", "subgraph": {}})
    assert len(list(patterns_dir.glob("*.json"))) == 1

    r = client.delete("/api/patterns/p1")
    assert r.status_code == 200
    assert list(patterns_dir.glob("*.json")) == []


def test_list_patterns_skips_unreadable_files(client, tmp_path, monkeypatch):
    patterns_dir = tmp_path / "My Patterns"
    patterns_dir.mkdir(parents=True)
    monkeypatch.setattr(app, "_PATTERNS_DIR", patterns_dir)

    (patterns_dir / "good.json").write_text(json.dumps({"id": "p1", "name": "Good"}))
    (patterns_dir / "broken.json").write_text("{not json")

    r = client.get("/api/patterns")
    assert r.status_code == 200
    body = r.json()
    assert len(body["patterns"]) == 1
    assert body["patterns"][0]["id"] == "p1"


def test_save_project_lands_inside_projects_dir(client, tmp_path, monkeypatch):
    projects_dir = tmp_path / "Projects"
    monkeypatch.setattr(app, "_PROJECTS_DIR", projects_dir)

    project = {
        "id": "proj1",
        "name": "../../escape-attempt",
        "workspace": {"nodes": [], "edges": []},
    }
    r = client.post("/api/projects", json=project)
    assert r.status_code == 200

    saved = list(projects_dir.glob("*.json"))
    assert len(saved) == 1
    assert saved[0].parent.resolve() == projects_dir.resolve()
    assert saved[0].name.endswith(app._PROJECT_FILE_SUFFIX)


def test_delete_project_removes_file_by_id(client, tmp_path, monkeypatch):
    projects_dir = tmp_path / "Projects"
    monkeypatch.setattr(app, "_PROJECTS_DIR", projects_dir)

    client.post(
        "/api/projects",
        json={"id": "proj1", "name": "Doomed", "workspace": {"nodes": [], "edges": []}},
    )
    assert len(list(projects_dir.glob("*.json"))) == 1

    r = client.delete("/api/projects/proj1")
    assert r.status_code == 200
    assert list(projects_dir.glob("*.json")) == []
