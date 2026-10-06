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
