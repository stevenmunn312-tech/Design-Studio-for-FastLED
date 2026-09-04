"""Bounded Windows response-file recovery for fbuild's LVGL archive command."""
import contextlib
import json

import app


def archive_fixture(tmp_path, monkeypatch):
    project = tmp_path / "project with spaces"
    cache = tmp_path / "cache"
    ar = cache / "toolchains" / "xtensa-esp32s3-elf-ar.exe"
    ar.parent.mkdir(parents=True)
    ar.touch()
    library = project / ".fbuild/build/test/release/lib/lvgl"
    objects = [library / "obj/a.o", library / "obj/b.o"]
    objects[0].parent.mkdir(parents=True)
    for obj in objects:
        obj.touch()
    monkeypatch.setattr(app, "_FBUILD_PROJECT_DIR", project)
    args = [str(ar), "rcs", str(library / "liblvgl.a"), *map(str, objects)]
    return cache, args, objects


def failure(args):
    return f"build error: local library 'lvgl' failed to compile: failed to spawn {json.dumps(args)}: The filename or extension is too long. (os error 206)\n"


def test_recognizes_only_existing_lvgl_objects_and_cached_archiver(tmp_path, monkeypatch):
    cache, args, objects = archive_fixture(tmp_path, monkeypatch)
    command = app._fbuild_lvgl_archive_command([failure(args)], "test", cache)
    assert command is not None
    assert command[2] == objects
    for index, replacement in (
        (0, str(tmp_path / "untrusted-ar.exe")),
        (1, "--plugin=arbitrary"),
        (2, str(tmp_path / "outside.a")),
        (3, str(tmp_path / "outside.o")),
        (3, "@injected.rsp"),
    ):
        changed = [*args]
        changed[index] = replacement
        assert app._fbuild_lvgl_archive_command([failure(changed)], "test", cache) is None
    assert app._fbuild_lvgl_archive_command([failure(args).replace("206", "5")], "test", cache) is None
    assert app._fbuild_lvgl_archive_command([failure(args).replace("'lvgl'", "'FastLED'")], "test", cache) is None
    objects[0].unlink()
    assert app._fbuild_lvgl_archive_command([failure(args)], "test", cache) is None


def test_response_file_quotes_paths_and_executes_only_fixed_archive_flags(tmp_path, monkeypatch):
    cache, args, objects = archive_fixture(tmp_path, monkeypatch)
    command = app._fbuild_lvgl_archive_command([failure(args)], "test", cache)
    monkeypatch.setattr(app, "_fbuild_lvgl_archive_command", lambda *args: command)
    monkeypatch.setattr(app.platform, "system", lambda: "Windows")
    calls = []

    def run(label, argv, **kwargs):
        calls.append(argv)
        yield "archive complete\n"
        return 0

    monkeypatch.setattr(app, "_run_phase", run)
    _, recovered = app._drain_compile(app._recover_fbuild_lvgl_archive([], "test"))
    assert recovered is True
    assert calls[0][:3] == args[:3]
    response = command[1].parent / "lvgl-objects.rsp"
    assert calls[0][3:] == [f"@{response}"]
    assert response.read_text(encoding="utf-8").splitlines() == [f'"{obj.as_posix()}"' for obj in objects]


def test_compile_retries_once_after_archive_recovery(monkeypatch):
    monkeypatch.setattr(app, "_ensure_fbuild_project", lambda: iter(()))
    monkeypatch.setattr(app, "_fbuild_libraries_for_sketch", lambda ino: contextlib.nullcontext())
    monkeypatch.setattr(app, "_fbuild_env_for_fqbn", lambda *args: "test")
    monkeypatch.setattr(app, "_write_fbuild_main", lambda ino: None)
    monkeypatch.setattr(app, "_build_was_cancelled", lambda: False)
    calls = []

    def run(label, args, sink=None, **kwargs):
        calls.append(args)
        yield "compile\n"
        yield f"[{label} exit code: {1 if len(calls) == 1 else 0} · 1s]\n"
        return 1 if len(calls) == 1 else 0

    def recover(*args):
        yield "recovered\n"
        return True

    monkeypatch.setattr(app, "_run_phase", run)
    monkeypatch.setattr(app, "_recover_fbuild_lvgl_archive", recover)
    lines, result = app._drain_compile(app._compile_upload_fbuild("Test", "void setup(){}", "esp32:esp32:esp32s3", ""))
    assert result == (0, "compile")
    assert len(calls) == 2
    assert calls[0] == calls[1]
    assert "exit code: 1" not in "".join(lines)
    assert "exit code: 0" in "".join(lines)
