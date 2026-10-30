"""Cancellation belongs to one upload, including across streaming worker hops."""
from concurrent.futures import ThreadPoolExecutor

import pytest

import firmware
import toolchain


def drain(generator):
    lines = []
    while True:
        try:
            lines.append(next(generator))
        except StopIteration as result:
            return "".join(lines), result.value


@pytest.fixture
def processes(monkeypatch):
    created = []

    class Process:
        def __init__(self, args, **kwargs):
            self.args = args
            self.stdout = self
            self.returncode = None
            self.stopped = False
            created.append(self)

        def poll(self):
            return self.returncode

        def wait(self):
            # Some tools can exit successfully while cancellation is in flight.
            self.returncode = 0
            return 0

    def stop(proc):
        proc.stopped = True
        proc.returncode = 0

    monkeypatch.setattr(toolchain.subprocess, "Popen", Process)
    monkeypatch.setattr(toolchain, "_stop_build_process", stop)
    monkeypatch.setattr(toolchain, "_iter_stream_lines", lambda stream: iter(["compiler alive\n"]))
    yield created
    assert toolchain._active_builds == []


def start(generator):
    while next(generator) != "compiler alive\n":
        pass


@pytest.mark.parametrize("finish_check_first", [True, False])
def test_overlapping_capacity_check_does_not_own_upload_cancellation(tmp_path, processes, finish_check_first):
    upload_dir = tmp_path / "upload"
    check_dir = tmp_path / "check"
    for directory in (upload_dir, check_dir):
        directory.mkdir()
        (directory / "sketch.ino").write_text("void setup() {}")
    upload = firmware._compile_upload("Upload", upload_dir, "arduino:avr:uno", "COM7")
    check = firmware._compile_upload("Capacity check", check_dir, "arduino:avr:uno", "")
    try:
        start(upload)
        toolchain._background_build(lambda: start(check))()
        assert toolchain._cancel_active_build() is True
        assert processes[0].stopped is True
        assert processes[1].stopped is False
        assert toolchain._build_was_cancelled() is False
        # Resume on another worker, as Starlette does for streamed responses.
        with ThreadPoolExecutor(max_workers=1) as worker:
            if finish_check_first:
                check_log, check_result = worker.submit(drain, check).result()
                upload_log, upload_result = worker.submit(drain, upload).result()
            else:
                upload_log, upload_result = worker.submit(drain, upload).result()
                check_log, check_result = worker.submit(drain, check).result()
        assert check_result == (0, "compile")
        assert "CANCELLED" not in check_log
        assert upload_result == (toolchain._BUILD_CANCELLED, "compile")
        assert "CANCELLED" in upload_log
        assert len(processes) == 2  # neither run starts an upload process
    finally:
        upload.close()
        check.close()


def test_cancel_between_compile_and_upload_never_starts_flash(tmp_path, processes):
    (tmp_path / "sketch.ino").write_text("void setup() {}")
    upload = firmware._compile_upload("Upload", tmp_path, "arduino:avr:uno", "COM7")
    try:
        for line in upload:
            if "[compiled]" in line:
                break
        assert toolchain._cancel_active_build() is True
        log, (rc, phase) = drain(upload)
        assert rc == toolchain._BUILD_CANCELLED
        assert phase == "upload"
        assert "CANCELLED" in log
        assert len(processes) == 1
        assert "Upload complete" not in "".join(firmware._upload_result_lines(rc, phase, "COM7"))
    finally:
        upload.close()


def test_capacity_check_alone_cannot_be_cancelled(processes):
    check = toolchain._run_phase("Capacity check", ["compiler"])
    try:
        toolchain._background_build(lambda: start(check))()
        assert toolchain._cancel_active_build() is False
        assert drain(check)[1] == 0
        assert not processes[0].stopped
    finally:
        check.close()


def test_capacity_cancel_stops_only_the_check(tmp_path, processes):
    upload = toolchain._run_phase("Upload", ["compiler"])
    check = toolchain._run_phase("Capacity check", ["compiler"])
    try:
        start(upload)
        toolchain._background_build(lambda: start(check))()
        assert toolchain._cancel_active_build(background=True) is True
        assert processes[1].stopped is True
        assert processes[0].stopped is False
        assert drain(check)[1] == toolchain._BUILD_CANCELLED
        assert drain(upload)[1] == 0
        assert toolchain._cancel_active_build(background=True) is False
    finally:
        upload.close()
        check.close()


def test_closing_abandoned_stream_stops_process_and_unregisters_run(processes):
    build = toolchain._run_phase("Upload", ["compiler"])
    start(build)
    build.close()
    assert processes[0].stopped
    assert toolchain._cancel_active_build() is False


def test_cancel_during_process_creation_stops_new_process(monkeypatch, processes):
    create = toolchain.subprocess.Popen

    def create_and_cancel(*args, **kwargs):
        proc = create(*args, **kwargs)
        assert toolchain._cancel_active_build() is True
        return proc

    monkeypatch.setattr(toolchain.subprocess, "Popen", create_and_cancel)
    log, rc = drain(toolchain._run_phase("Upload", ["compiler"]))
    assert rc == toolchain._BUILD_CANCELLED
    assert "CANCELLED" in log
    assert processes[0].stopped


def test_cancel_after_phase_header_does_not_spawn_process(processes):
    build = toolchain._run_phase("Upload", ["compiler"])
    try:
        assert "=== Upload ===" in next(build)
        assert toolchain._cancel_active_build() is True
        log, rc = drain(build)
        assert rc == toolchain._BUILD_CANCELLED
        assert "CANCELLED" in log
        assert processes == []
    finally:
        build.close()
