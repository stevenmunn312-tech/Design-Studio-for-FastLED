"""Saved projects and patterns live in Documents, and older locations (a
source checkout's root "My Patterns" folder, the per-user app-data folder)
move there without losing a file."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

import storage
import app as app_module
from user_data import default_content_dir, default_data_dir, documents_dir


def test_default_data_dir_uses_native_user_locations(monkeypatch, tmp_path):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))

    assert default_data_dir("Windows") == tmp_path / "local" / "Design Studio for FastLED"
    assert default_data_dir("Linux") == tmp_path / "xdg" / "design-studio-for-fastled"
    assert default_data_dir("Darwin").parts[-2:] == (
        "Application Support", "Design Studio for FastLED",
    )


def _pattern(path, pid, name):
    path.write_text(json.dumps({"id": pid, "name": name, "subgraph": {}}), encoding="utf-8")


def test_migration_moves_every_pattern_and_removes_the_old_folder(tmp_path):
    legacy, target = tmp_path / "My Patterns", tmp_path / "data" / "My Patterns"
    legacy.mkdir()
    _pattern(legacy / "Aurora.json", "a", "Aurora")
    _pattern(legacy / "Ember.json", "b", "Ember")

    assert storage._merge_legacy_folder(legacy, target) == 2

    assert sorted(f.name for f in target.iterdir()) == ["Aurora.json", "Ember.json"]
    assert not legacy.exists()


def test_migration_keeps_both_files_when_a_name_is_taken(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    target.mkdir()
    _pattern(legacy / "Aurora.json", "old", "Aurora")
    _pattern(target / "Aurora.json", "new", "Aurora")

    assert storage._merge_legacy_folder(legacy, target) == 1

    ids = sorted(json.loads(f.read_text(encoding="utf-8"))["id"] for f in target.glob("*.json"))
    assert ids == ["new", "old"]
    assert not legacy.exists()


def test_migration_drops_an_identical_copy(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    target.mkdir()
    _pattern(legacy / "Aurora.json", "a", "Aurora")
    _pattern(target / "Aurora.json", "a", "Aurora")

    assert storage._merge_legacy_folder(legacy, target) == 0

    assert [f.name for f in target.iterdir()] == ["Aurora.json"]
    assert not legacy.exists()


def test_migration_leaves_a_folder_holding_other_files(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    _pattern(legacy / "Aurora.json", "a", "Aurora")
    (legacy / "notes.txt").write_text("keep me", encoding="utf-8")

    assert storage._merge_legacy_folder(legacy, target) == 1

    assert (legacy / "notes.txt").read_text(encoding="utf-8") == "keep me"
    assert (target / "Aurora.json").exists()


def test_migration_without_an_old_folder_does_nothing(tmp_path):
    assert storage._merge_legacy_folder(tmp_path / "missing", tmp_path / "target") == 0
    assert not (tmp_path / "target").exists()


def test_startup_migrates_into_the_patterns_folder(monkeypatch, tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    _pattern(legacy / "Aurora.json", "a", "Aurora")
    monkeypatch.setattr(storage, "_LEGACY_PATTERNS_DIR", legacy)
    monkeypatch.setattr(storage, "_PATTERNS_DIR", target)

    with TestClient(app_module.app, base_url="http://127.0.0.1:8008") as client:
        patterns = client.get("/api/patterns").json()["patterns"]

    assert [p["id"] for p in patterns] == ["a"]
    assert not legacy.exists()


def test_content_lives_in_documents_not_app_data(monkeypatch, tmp_path):
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)

    assert default_content_dir("Darwin") == tmp_path / "Documents" / "Design Studio for FastLED"
    assert default_content_dir("Linux") == tmp_path / "Documents" / "Design Studio for FastLED"
    assert default_content_dir("Windows") != default_data_dir("Windows") / "Projects"


def test_windows_documents_follows_the_shell_folder():
    import sys

    if sys.platform != "win32":
        return
    import ctypes

    buffer = ctypes.create_unicode_buffer(260)
    ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buffer)
    assert documents_dir("Windows") == Path(buffer.value)


def test_collision_suffix_keeps_the_project_extension():
    assert storage._suffixed_name("Juggle 3.fastled-project.json", "ab12") == "Juggle 3-ab12.fastled-project.json"
    assert storage._suffixed_name("v1.2 Glow.json", "ab12") == "v1.2 Glow-ab12.json"


def _project(path, pid, name):
    path.write_text(json.dumps({"id": pid, "name": name, "graph": {}}), encoding="utf-8")


def test_startup_moves_app_data_content_into_documents(monkeypatch, tmp_path):
    legacy = tmp_path / "AppData" / "Design Studio for FastLED"
    content = tmp_path / "Documents" / "Design Studio for FastLED"
    (legacy / "Projects").mkdir(parents=True)
    (legacy / "My Patterns").mkdir()
    (legacy / "WebView2").mkdir()  # app data that must stay put
    _project(legacy / "Projects" / "Juggle 3.fastled-project.json", "p1", "Juggle 3")
    _pattern(legacy / "My Patterns" / "Aurora.json", "a", "Aurora")
    monkeypatch.setattr(storage, "_LEGACY_CONTENT_DIR", legacy)
    monkeypatch.setattr(storage, "_PATTERNS_DIR", content / "My Patterns")
    monkeypatch.setattr(storage, "_PROJECTS_DIR", content / "Projects")

    with TestClient(app_module.app, base_url="http://127.0.0.1:8008") as client:
        patterns = client.get("/api/patterns").json()["patterns"]

    assert [p["id"] for p in patterns] == ["a"]
    assert [f.name for f in (content / "Projects").iterdir()] == ["Juggle 3.fastled-project.json"]
    assert not (legacy / "Projects").exists()
    assert not (legacy / "My Patterns").exists()
    assert (legacy / "WebView2").is_dir()


def test_a_project_saved_in_both_places_keeps_both(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    target.mkdir()
    _project(legacy / "Juggle 3.fastled-project.json", "old", "Juggle 3")
    _project(target / "Juggle 3.fastled-project.json", "new", "Juggle 3")

    assert storage._merge_legacy_folder(legacy, target) == 1

    names = sorted(f.name for f in target.iterdir())
    assert len(names) == 2 and all(n.endswith(".fastled-project.json") for n in names)


def test_an_overridden_content_folder_is_never_filled_from_app_data():
    for name in ("FLS_CONTENT_DIR", "FLS_PATTERNS_DIR", "FLS_PROJECTS_DIR"):
        assert storage._legacy_content_dir({name: "isolated"}) is None
    assert storage._legacy_content_dir({"FLS_DATA_DIR": "caches only"}) == default_data_dir()
