"""Build timing — the per-phase duration on each exit-code line and the one
`[time] total` line every compile/upload run ends with.

Both engines get their timing from the same two places (`_run_phase` and the
`_reports_total_time` wrapper), so these tests exercise that shared machinery
rather than one engine's path.
"""
import sys

import app


def test_format_duration_reads_as_a_person_would_say_it():
    assert app._format_duration(0.42) == "0.4s"
    assert app._format_duration(8.44) == "8.4s"
    # A decimal is worth having under a minute and noise above it.
    assert app._format_duration(59.9) == "59.9s"
    assert app._format_duration(60) == "1m 00s"
    assert app._format_duration(111.6) == "1m 52s"
    assert app._format_duration(3600) == "1h 00m 00s"
    assert app._format_duration(3723) == "1h 02m 03s"


def test_run_phase_reports_how_long_the_phase_took():
    lines = list(app._run_phase("Sketch · compile", [sys.executable, "-c", "print('built')"]))
    exit_line = [line for line in lines if "exit code" in line]
    assert len(exit_line) == 1
    # The exit code still leads the line — `parseStatus` keys its failure rule
    # on it — with the duration after it.
    assert exit_line[0].startswith("[Sketch · compile exit code: 0 · ")
    assert exit_line[0].rstrip().endswith("s]")


def test_a_finished_run_ends_with_one_total_line():
    @app._reports_total_time
    def fake_run(label, port):
        yield "compiling\n"
        return 0, "upload"

    lines = []
    gen = fake_run("Sketch", "COM5")
    try:
        while True:
            lines.append(next(gen))
    except StopIteration as stop:
        result = stop.value

    assert result == (0, "upload")
    totals = [line for line in lines if "[time] total" in line]
    assert len(totals) == 1
    assert totals[0].startswith("  [time] total ")


def test_a_failed_run_still_reports_its_total():
    @app._reports_total_time
    def fake_run():
        yield "error: expected ';'\n"
        return 1, "compile"

    lines, (rc, phase) = app._drain_compile(fake_run())
    assert (rc, phase) == (1, "compile")
    assert any("[time] total" in line for line in lines)


def test_a_refused_build_reports_no_time_at_all():
    # Nothing was compiled or flashed — a duration beside "DID NOT RUN" would
    # read as a build that took that long.
    @app._reports_total_time
    def fake_run():
        yield "  [waiting] the build directory is busy with another build\n"
        return -1, "busy"

    lines, (rc, phase) = app._drain_compile(fake_run())
    assert (rc, phase) == (-1, "busy")
    assert not any("[time]" in line for line in lines)
