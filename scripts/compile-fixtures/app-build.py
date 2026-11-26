"""Build one sketch the way the app does and print what its Output console prints.

    python scripts/compile-fixtures/app-build.py <sketch.ino> --fqbn <fqbn> [<sketch.ino> --fqbn <fqbn> ...]

The engine is the helper's own choice for the board (`_engine_for_board`):
fbuild where its scaffold declares the board, arduino-cli otherwise, with the
same line saying so. The text is the stream `/api/upload` sends for a compile
with no port, written as it arrives, so a slow step is seen while it runs.
Never flashes. One build at a time: overlapping builds corrupt the caches.

The other runners here record a build (a log, a JSON report, a chosen engine)
for the compile matrix. This one is for reading a build as a user meets it.
"""
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
import firmware  # noqa: E402
import toolchain  # noqa: E402
from fixture_workspace import fixture_workspace_name  # noqa: E402


def stream(ino: str, fqbn: str):
    """`/api/upload`'s stream for a compile with no port, engine and all."""
    engine = toolchain._engine_for_board(fqbn, ino)
    flash_mb = toolchain._flash_mb_from({})
    usb_cdc = toolchain._usb_cdc_from({})
    if engine == "fbuild":
        rc, phase = yield from firmware._compile_upload_fbuild("Sketch", ino, fqbn, "", flash_mb, usb_cdc)
    else:
        yield from firmware._engine_switch_lines(fqbn, ino)
        # The app builds in its own sketch folder; a fixture folder per board
        # keeps this run out of it and out of the other boards' caches.
        with firmware._sketch_workspace(fixture_workspace_name(fqbn), ino) as sketch_dir:
            rc, phase = yield from firmware._compile_upload("Sketch", sketch_dir, fqbn, "", usb_cdc=usb_cdc, flash_mb=flash_mb)
    yield from firmware._upload_result_lines(rc, phase, "")
    return engine, rc, phase


def build(sketch: Path, fqbn: str) -> tuple[str, int]:
    ino = sketch.read_text(encoding="utf-8")
    generator = stream(ino, fqbn)
    try:
        while True:
            sys.stdout.write(next(generator))
            sys.stdout.flush()
    except StopIteration as stop:
        engine, rc, _phase = stop.value
        return engine, rc


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    # Pairs, not argparse options: one run lists several builds, each with its board.
    words = sys.argv[1:]
    if not words or words[0] in ("-h", "--help"):
        parser.print_help()
        return 0 if words else 2
    jobs: list[tuple[Path, str]] = []
    while words:
        if len(words) < 3 or words[1] != "--fqbn":
            parser.error("each build is: <sketch.ino> --fqbn <fqbn>")
        jobs.append((Path(words[0]), words[2]))
        words = words[3:]
    results = []
    for index, (sketch, fqbn) in enumerate(jobs, 1):
        print(f"\n━━━ {index}/{len(jobs)}  {sketch.name}  on  {fqbn}", flush=True)
        engine, rc = build(sketch, fqbn)
        results.append((sketch.name, fqbn, engine, rc))
    print("\n━━━ Summary")
    for name, fqbn, engine, rc in results:
        print(f"{'PASS' if rc == 0 else 'FAIL'}  {engine:<11} {fqbn.split(':')[2]:<20} {name}")
    return 0 if all(rc == 0 for *_rest, rc in results) else 1


if __name__ == "__main__":
    sys.exit(main())
