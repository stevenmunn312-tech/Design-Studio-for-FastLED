"""A project file's `trusted` flag is believed only for files this helper wrote.

The flag lets Formula and Code nodes run. The studio's own Open dialog already
clears it on anything it imports; a file copied straight into the Projects
folder skipped that, and opened running whatever it carried.
"""
import json

import storage


def _project(pid="made-here", trusted=True, updated_at=100):
    return {"id": pid, "name": pid, "updatedAt": updated_at,
            "workspace": {"nodes": [], "edges": [], "trusted": trusted}}


def _listed(pid):
    return next(p for p in storage.list_projects()["projects"] if p["id"] == pid)


def test_a_project_saved_through_the_helper_keeps_its_trust(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "_PROJECTS_DIR", tmp_path / "Projects")
    assert storage.save_project(_project())["ok"]

    assert _listed("made-here")["workspace"]["trusted"] is True


def test_a_file_copied_into_the_folder_cannot_declare_itself_trusted(tmp_path, monkeypatch):
    folder = tmp_path / "Projects"
    monkeypatch.setattr(storage, "_PROJECTS_DIR", folder)
    assert storage.save_project(_project())["ok"]
    (folder / "from-a-friend.fastled-project.json").write_text(json.dumps(_project("copied-in")), encoding="utf-8")
    flagless = _project("no-flag")
    del flagless["workspace"]["trusted"]
    (folder / "no-flag.fastled-project.json").write_text(json.dumps(flagless), encoding="utf-8")

    assert _listed("copied-in")["workspace"]["trusted"] is False
    assert _listed("no-flag")["workspace"]["trusted"] is False
    assert _listed("made-here")["workspace"]["trusted"] is True


def test_a_file_replaced_outside_the_helper_loses_its_trust_until_saved_again(tmp_path, monkeypatch):
    folder = tmp_path / "Projects"
    monkeypatch.setattr(storage, "_PROJECTS_DIR", folder)
    assert storage.save_project(_project())["ok"]
    path = next(folder.glob("*.json"))
    path.write_text(json.dumps(_project(updated_at=200)), encoding="utf-8")

    assert _listed("made-here")["workspace"]["trusted"] is False
    assert storage.save_project({**_project(updated_at=300), "baseUpdatedAt": 200})["ok"]
    assert _listed("made-here")["workspace"]["trusted"] is True


def test_files_already_there_before_the_record_existed_are_taken_as_made_here(tmp_path, monkeypatch):
    folder = tmp_path / "Projects"
    folder.mkdir()
    monkeypatch.setattr(storage, "_PROJECTS_DIR", folder)
    (folder / "old.fastled-project.json").write_text(json.dumps(_project("old")), encoding="utf-8")

    assert _listed("old")["workspace"]["trusted"] is True
    (folder / "later.fastled-project.json").write_text(json.dumps(_project("later")), encoding="utf-8")
    assert _listed("later")["workspace"]["trusted"] is False


def test_a_deleted_project_is_forgotten(tmp_path, monkeypatch):
    folder = tmp_path / "Projects"
    monkeypatch.setattr(storage, "_PROJECTS_DIR", folder)
    assert storage.save_project(_project())["ok"]
    saved = next(folder.glob("*.json")).read_bytes()
    storage.delete_project("made-here")
    (folder / "back.fastled-project.json").write_bytes(saved + b"\n")

    assert _listed("made-here")["workspace"]["trusted"] is False


def test_a_file_that_is_not_an_object_does_not_stop_a_save(tmp_path, monkeypatch):
    folder = tmp_path / "Projects"
    folder.mkdir()
    monkeypatch.setattr(storage, "_PROJECTS_DIR", folder)
    (folder / "list.json").write_text("[1, 2]", encoding="utf-8")

    assert storage.save_project(_project())["ok"]
