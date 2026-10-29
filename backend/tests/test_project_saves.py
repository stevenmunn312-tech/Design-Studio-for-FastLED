"""Project saves retain the newest complete workspace across overlapping requests."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import storage


def project(count: int, updated_at: int, name: str = "Collection") -> dict:
    return {
        "id": "collection-project", "name": name, "updatedAt": updated_at,
        "workspace": {"nodes": [{"data": {"nodeType": "PatternCollection",
                                             "properties": {"patternIds": list(range(count))}}}],
                      "edges": []},
    }


def test_older_save_cannot_replace_23_patterns_with_three(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_PROJECTS_DIR", tmp_path)
    newest = project(23, 200)
    assert storage.save_project(newest)["ok"]
    assert storage.save_project(project(3, 100, "Old name"))["ok"]
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    assert json.loads(files[0].read_text()) == newest


def test_overlapping_saves_leave_one_complete_newest_project(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_PROJECTS_DIR", tmp_path)
    snapshots = [project(count, count, f"Collection {count}") for count in range(3, 24)]
    with ThreadPoolExecutor(max_workers=8) as executor:
        assert all(result["ok"] for result in executor.map(storage.save_project, snapshots))
    files = list(tmp_path.iterdir())
    assert len(files) == 1
    assert json.loads(files[0].read_text()) == snapshots[-1]


def test_failed_replacement_keeps_previous_save(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_PROJECTS_DIR", tmp_path)
    original = project(3, 100)
    storage.save_project(original)

    def fail_replace(self, target):
        raise OSError("disk full")

    monkeypatch.setattr(Path, "replace", fail_replace)
    result = storage.save_project(project(23, 200))
    assert result.status_code == 500
    files = list(tmp_path.iterdir())
    assert len(files) == 1
    assert json.loads(files[0].read_text()) == original


def test_failed_pattern_replacement_keeps_previous_save(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_PATTERNS_DIR", tmp_path)
    original = {"id": "pat-1", "name": "Pulse", "subgraph": {"nodes": [1, 2, 3], "edges": []}}
    assert storage.save_pattern(original)["ok"] is True

    def fail_replace(self, target):
        raise OSError("disk full")

    monkeypatch.setattr(Path, "replace", fail_replace)
    result = storage.save_pattern({**original, "subgraph": {"nodes": [], "edges": []}})
    assert result.status_code == 500
    files = [f for f in tmp_path.iterdir() if f.suffix == ".json"]
    assert len(files) == 1
    assert json.loads(files[0].read_text(encoding="utf-8")) == original
    assert not list(tmp_path.glob("*.tmp"))


def test_failed_dialog_replacement_keeps_previous_save(tmp_path, monkeypatch):
    target = tmp_path / f"Collection{storage._PROJECT_FILE_SUFFIX}"
    original = project(3, 100)
    monkeypatch.setattr(storage, "_show_project_save_dialog", lambda initial_file: target)
    assert storage.save_project_dialog(original)["ok"] is True
    saved = json.loads(target.read_text(encoding="utf-8"))

    def fail_replace(self, target_path):
        raise OSError("disk full")

    monkeypatch.setattr(Path, "replace", fail_replace)
    result = storage.save_project_dialog(project(23, 200))
    assert result.status_code == 500
    assert json.loads(target.read_text(encoding="utf-8")) == saved
    assert not list(tmp_path.glob("*.tmp"))


def pattern(pid: str, name: str, **extra) -> dict:
    return {"id": pid, "name": name, "subgraph": {"nodes": [], "edges": []}, **extra}


def test_listing_survives_a_file_with_null_timestamps(tmp_path, monkeypatch):
    # A hand-edited or older file can carry `null` where a number belongs.
    # Sorting a None against an int raised TypeError, the list endpoint
    # answered 500, and the picker read as "helper offline".
    monkeypatch.setattr(storage, "_PROJECTS_DIR", tmp_path / "projects")
    monkeypatch.setattr(storage, "_PATTERNS_DIR", tmp_path / "patterns")
    assert storage.save_project(project(3, 200, "Newer"))["ok"]
    broken = {**project(2, 0, "Hand edited"), "id": "other-project", "updatedAt": None, "createdAt": None}
    storage._write_json_atomically(storage._projects_dir() / "Hand edited.fastled-project.json", broken)
    assert storage.save_pattern(pattern("p-1", "Pulse", createdAt=50))["ok"]
    storage._write_json_atomically(storage._patterns_dir() / "Odd.json", pattern("p-2", "Odd", createdAt=None))

    projects = storage.list_projects()["projects"]
    assert [p["name"] for p in projects] == ["Newer", "Hand edited"]
    patterns = storage.list_patterns()["patterns"]
    assert [p["name"] for p in patterns] == ["Pulse", "Odd"]


def test_non_numeric_timestamps_are_refused_at_save(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_PROJECTS_DIR", tmp_path / "projects")
    monkeypatch.setattr(storage, "_PATTERNS_DIR", tmp_path / "patterns")
    monkeypatch.setattr(storage, "_show_project_save_dialog",
                        lambda initial_file: tmp_path / "Dialog.fastled-project.json")

    result = storage.save_project({**project(3, 100), "updatedAt": "2026-10-29"})
    assert result.status_code == 400
    assert "updatedAt" in result.body.decode()
    result = storage.save_pattern(pattern("p-1", "Pulse", createdAt="soon"))
    assert result.status_code == 400
    assert "createdAt" in result.body.decode()
    result = storage.save_project_dialog({**project(3, 100), "createdAt": {"ms": 1}})
    assert result.status_code == 400
    assert not list((tmp_path / "projects").glob("*.json"))
    assert not list((tmp_path / "patterns").glob("*.json"))
    assert not (tmp_path / "Dialog.fastled-project.json").exists()


def test_stale_guard_is_not_defeated_by_a_string_timestamp(tmp_path, monkeypatch):
    # The comparison used to raise TypeError, which the guard swallowed, so
    # the older snapshot went straight through and replaced the newer file.
    monkeypatch.setattr(storage, "_PROJECTS_DIR", tmp_path)
    newest = project(23, 200)
    assert storage.save_project(newest)["ok"]
    result = storage.save_project({**project(3, 0, "Old name"), "updatedAt": "50"})
    assert result.status_code == 400
    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    assert json.loads(files[0].read_text()) == newest


def test_atomic_write_fsyncs_before_the_rename(tmp_path, monkeypatch):
    # A rename alone is not durable: after a power cut the renamed file can
    # be empty or truncated unless its data was flushed to disk first.
    import os
    synced: list[int] = []
    real_fsync = os.fsync

    def recording_fsync(fd):
        synced.append(fd)
        real_fsync(fd)

    monkeypatch.setattr(os, "fsync", recording_fsync)
    replaced: list[bool] = []
    real_replace = Path.replace

    def replace_after_sync(self, target):
        replaced.append(bool(synced))
        return real_replace(self, target)

    monkeypatch.setattr(Path, "replace", replace_after_sync)
    storage._write_json_atomically(tmp_path / "out.json", {"a": 1})
    assert synced, "the temp file must be fsynced"
    assert replaced == [True], "the fsync must happen before the rename"
    assert json.loads((tmp_path / "out.json").read_text()) == {"a": 1}


def test_overlapping_pattern_renames_leave_exactly_one_file(tmp_path, monkeypatch):
    # Two saves of one pattern under different names each write their own
    # file and then delete the other's as a stale copy: without the lock both
    # removals run after both writes and the pattern ends up with no file.
    import threading
    monkeypatch.setattr(storage, "_PATTERNS_DIR", tmp_path)
    assert storage.save_pattern(pattern("p-1", "Original"))["ok"]
    both_written = threading.Barrier(2)
    real_remove = storage._remove_files_for_id

    def remove_once_both_have_written(pattern_id, keep=None):
        # With the lock only one save is inside at a time, so the barrier
        # times out and breaks; without it both saves meet here.
        try:
            both_written.wait(timeout=0.5)
        except threading.BrokenBarrierError:
            pass
        real_remove(pattern_id, keep=keep)

    monkeypatch.setattr(storage, "_remove_files_for_id", remove_once_both_have_written)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(storage.save_pattern, [
            pattern("p-1", "Renamed A"), pattern("p-1", "Renamed B"),
        ]))
    assert all(result["ok"] for result in results)
    files = [f for f in tmp_path.iterdir() if f.suffix == ".json"]
    assert len(files) == 1
    assert json.loads(files[0].read_text(encoding="utf-8"))["id"] == "p-1"
