# Build helper

The local FastAPI helper in `backend/app.py`: build timing, binary export, and
keeping both toolchains' caches warm.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

- Build/upload timing is computed once and shared by both engines, not measured
  per call site: `backend/app.py`'s `_run_phase` (the one per-phase runner both
  `_compile_upload` and `_compile_upload_fbuild` call) times itself onto its
  `[label exit code: N]` line, and the `_reports_total_time` decorator wraps
  both compile/upload generators so every run ends with one `  [time] total ...`
  line — clocked from before the fbuild build lock is acquired so queued wait
  counts, except a refused/`busy` build, which reports no time since it never
  compiled or flashed anything. `src/state/uploadStore.ts`'s `parseStatus` is
  the one place that reads `[time] total` into the UI (last match wins, since a
  show upload can log more than one), surfacing it as `UploadStatus.elapsed`
  only on a finished `done` run — not on failure, where what went wrong matters
  more than how long it took to go wrong. `src/utils/logView.ts`'s `ALWAYS_KEEP`
  regex has to name any new always-visible log marker explicitly (as it does
  `\[time\]`) or the condensed Output console view filters it out as noise.
- **Export Binary** is the same compile an Upload runs, stopped at the image:
  `backend/app.py`'s `/api/compile-binary` streams the build log exactly as
  `/api/upload` does — a build is minutes long and a silent wait reads as a hang
  — and ends with a marker line, `[binary] id=<id> name=<file> bytes=<n>`, that
  `GET /api/compile-binary/{id}` then serves. That marker is a three-site
  contract: the emitter, `backendClient.ts`'s `exportBinary` (which matches on a
  running *tail* rather than one chunk, since the marker can land split across
  two), and `logView.ts`'s `ALWAYS_KEEP`, or the condensed console filters the
  one line the download depends on. Returning the bytes from the same request
  was rejected twice over: holding the stream back until the end is the silent
  wait again, and base64 inside the log is a payload split on chunk boundaries. *Which*
  image is derived, never assumed — `_EXPORT_PREFERENCE` prefers an ESP32
  `.merged.bin` (flashes at offset 0, nothing else needed) over the application
  image beside it (0x10000, plus a bootloader and partition table already on the
  board), then fbuild's `firmware.bin`, then `.hex`/`.uf2`, so a toolchain
  naming its output something else still exports rather than reporting nothing.
  arduino-cli is directed at an output directory (`_compile_upload`'s
  `output_dir`, used by nothing else); fbuild builds in place, so its artifacts
  are fetched from the env id the build itself resolved. The button is gated on
  the helper being ready where Export .ino is not — an `.ino` is generated in
  the browser and needs no toolchain.
- Every write to the fbuild scaffold's generated sketch, vendored FastLED
  patches, or a reused arduino-cli sketch directory goes through
  `backend/app.py`'s `_write_if_changed(path, text)`, never a bare
  `path.write_text(...)`: both toolchains decide what to recompile from mtimes,
  so rewriting a file with the bytes it already has forces a rebuild nobody
  asked for. `_write_fbuild_main`'s `main.ino` (the project's largest
  translation unit), `_patch_fastled_samd51_build`'s vendored SAMD51 headers
  (patched once per helper start against a tree that's almost always already
  patched), and `_sketch_workspace`'s `<name>.ino` all route through it.
  `backend/tests/test_scaffold_writes.py` asserts a second identical write
  leaves the file's mtime untouched while a real change still lands.
- arduino-cli keys its own build cache (`~/.cache/arduino/sketches/<hash>`,
  `%LOCALAPPDATA%\arduino\sketches` on Windows) on a hash of the *sketch path*,
  so `backend/app.py`'s `_sketch_workspace(name, ino)` compiles from one reused
  directory per sketch name (`_SKETCH_DIR_ROOT = _DATA_DIR / "sketches"`,
  gitignored as `backend/sketches/`) instead of a fresh `tempfile.mkdtemp()` per
  build — the old per-call temp dir was a guaranteed cache miss that rebuilt all
  of FastLED every time and left behind hundreds of unreused directories. A
  shared directory needs a concurrency guard since a capacity check and an
  upload can run at once: `_sketch_dir_lock(name)` is acquired non-blocking, and
  if another build already holds it, `_sketch_workspace` falls back to a private
  temp directory removed afterward — the pre-cache behavior — rather than
  sharing the directory (risking a binary built from the other build's source)
  or blocking (costing as much as the cold build being avoided). All three call
  sites (`upload`, `compile_check`, the SD-show `_build_flash`) get their sketch
  directory through `with _sketch_workspace(...) as sketch_dir:`.
