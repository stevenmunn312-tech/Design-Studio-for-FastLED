"""Saved projects and patterns live in the per-user data folder, and a source
checkout's old root "My Patterns" folder moves there without losing a file."""
import json

from fastapi.testclient import TestClient

import app as app_module
from user_data import default_data_dir


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

    assert app_module._migrate_legacy_patterns(legacy, target) == 2

    assert sorted(f.name for f in target.iterdir()) == ["Aurora.json", "Ember.json"]
    assert not legacy.exists()


def test_migration_keeps_both_files_when_a_name_is_taken(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    target.mkdir()
    _pattern(legacy / "Aurora.json", "old", "Aurora")
    _pattern(target / "Aurora.json", "new", "Aurora")

    assert app_module._migrate_legacy_patterns(legacy, target) == 1

    ids = sorted(json.loads(f.read_text(encoding="utf-8"))["id"] for f in target.glob("*.json"))
    assert ids == ["new", "old"]
    assert not legacy.exists()


def test_migration_drops_an_identical_copy(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    target.mkdir()
    _pattern(legacy / "Aurora.json", "a", "Aurora")
    _pattern(target / "Aurora.json", "a", "Aurora")

    assert app_module._migrate_legacy_patterns(legacy, target) == 0

    assert [f.name for f in target.iterdir()] == ["Aurora.json"]
    assert not legacy.exists()


def test_migration_leaves_a_folder_holding_other_files(tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    _pattern(legacy / "Aurora.json", "a", "Aurora")
    (legacy / "notes.txt").write_text("keep me", encoding="utf-8")

    assert app_module._migrate_legacy_patterns(legacy, target) == 1

    assert (legacy / "notes.txt").read_text(encoding="utf-8") == "keep me"
    assert (target / "Aurora.json").exists()


def test_migration_without_an_old_folder_does_nothing(tmp_path):
    assert app_module._migrate_legacy_patterns(tmp_path / "missing", tmp_path / "target") == 0
    assert not (tmp_path / "target").exists()


def test_startup_migrates_into_the_patterns_folder(monkeypatch, tmp_path):
    legacy, target = tmp_path / "legacy", tmp_path / "target"
    legacy.mkdir()
    _pattern(legacy / "Aurora.json", "a", "Aurora")
    monkeypatch.setattr(app_module, "_LEGACY_PATTERNS_DIR", legacy)
    monkeypatch.setattr(app_module, "_PATTERNS_DIR", target)

    with TestClient(app_module.app, base_url="http://127.0.0.1:8008") as client:
        patterns = client.get("/api/patterns").json()["patterns"]

    assert [p["id"] for p in patterns] == ["a"]
    assert not legacy.exists()
