"""Writing an SD card layout to a mounted reader (`/api/sd-copy`).

Serial is the universal path but slow; a card in a reader is seconds. That
speed comes from letting the browser name a destination directory on the host,
so the guards are the interesting part here: only mounted removable volumes are
ever listed or written to, and every path is reduced to `<drive>/music/<name>`
or `<drive>/shows/<name>` before anything is opened.
"""
import io
import json

import pytest

import app


# ── path guard ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("path", [
    "/etc/passwd",              # no recognised subdirectory
    "../../evil",               # relative, and no subdirectory
    "/music/sub/dir/x.mp3",     # deeper than the layout allows
    "/music/../shows/w.show",   # the traversal is stripped, leaving one segment
    "/firmware/x.bin",          # a plausible-looking directory that is not ours
    "/music",                   # a directory, not a file
])
def test_only_music_and_shows_paths_are_accepted(tmp_path, path):
    with pytest.raises(ValueError):
        app._sd_destination(str(tmp_path), path)


@pytest.mark.parametrize("path,expected", [
    ("/music/a b.mp3", ("music", "a b.mp3")),
    ("/shows/x.show", ("shows", "x.show")),
    ("/MUSIC/z.mp3", ("music", "z.mp3")),          # case-folded to the real dir
    ("\\music\\y.mp3", ("music", "y.mp3")),        # Windows separators
    ("/music/../../evil", ("music", "evil")),      # climbs are stripped, not honoured
])
def test_accepted_paths_land_inside_the_chosen_drive(tmp_path, path, expected):
    dest = app._sd_destination(str(tmp_path), path)
    assert dest.parent.name == expected[0]
    assert dest.name == expected[1]
    assert tmp_path.resolve() in dest.parents


# ── endpoint ──────────────────────────────────────────────────────────────────

def _post(client, drive, files):
    """files: [(sd_path, bytes)]."""
    return client.post(
        "/api/sd-copy",
        data={"meta": json.dumps({"drive": str(drive), "paths": [p for p, _ in files]})},
        files=[("files", (p.split("/")[-1], io.BytesIO(d), "application/octet-stream"))
               for p, d in files],
    )


def test_a_drive_that_is_not_removable_is_refused(client, monkeypatch, tmp_path):
    # The whole guard: without it this endpoint writes anywhere on the host.
    monkeypatch.setattr(app, "_removable_drives", lambda: [])
    r = _post(client, tmp_path, [("/music/x.mp3", b"abc")])
    assert r.status_code == 400
    assert "not a mounted removable drive" in r.json()["error"]
    assert not (tmp_path / "music").exists()


def test_files_are_written_under_music_and_shows(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "_removable_drives", lambda: [{"path": str(tmp_path)}])
    r = _post(client, tmp_path, [("/music/Song.mp3", b"a" * 32), ("/shows/Song.show", b"b" * 8)])
    assert r.status_code == 200
    assert (tmp_path / "music" / "Song.mp3").read_bytes() == b"a" * 32
    assert (tmp_path / "shows" / "Song.show").read_bytes() == b"b" * 8
    assert "2 file(s) copied, 0 already present" in r.text


def test_a_song_already_on_the_card_is_not_copied_again(client, monkeypatch, tmp_path):
    # This is what makes "update the show, keep the music" fast — otherwise the
    # reader path re-copies megabytes to change a few kilobytes of events.
    monkeypatch.setattr(app, "_removable_drives", lambda: [{"path": str(tmp_path)}])
    (tmp_path / "music").mkdir()
    (tmp_path / "music" / "Song.mp3").write_bytes(b"a" * 32)

    r = _post(client, tmp_path, [("/music/Song.mp3", b"a" * 32), ("/shows/Song.show", b"b" * 8)])
    assert "already on the card" in r.text
    assert "1 file(s) copied, 1 already present" in r.text


def test_a_changed_file_of_a_different_size_is_rewritten(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app, "_removable_drives", lambda: [{"path": str(tmp_path)}])
    (tmp_path / "shows").mkdir()
    (tmp_path / "shows" / "Song.show").write_bytes(b"old")

    _post(client, tmp_path, [("/shows/Song.show", b"brand-new")])
    assert (tmp_path / "shows" / "Song.show").read_bytes() == b"brand-new"


def test_no_part_files_are_left_behind(client, monkeypatch, tmp_path):
    # Writes go to a .part file and are renamed, so a card pulled mid-write
    # leaves the previous file rather than a truncated one. A completed run
    # must not leave the scaffolding visible to the player's directory scan.
    monkeypatch.setattr(app, "_removable_drives", lambda: [{"path": str(tmp_path)}])
    _post(client, tmp_path, [("/music/Song.mp3", b"a" * 32)])
    assert [p.name for p in (tmp_path / "music").iterdir()] == ["Song.mp3"]
