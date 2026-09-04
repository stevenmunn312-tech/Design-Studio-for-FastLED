# Display firmware compile checks

These fixtures exercise custom LVGL displays alongside the fixed TFT transport
renderer in the normal sketch, generative show, and SD-player generators. Each
includes a slider, button, toggle, dial, readouts, meters, a status indicator and
a two-byte A8 icon. Slider data passes through Math and Format Number to both
screens and through Player Controls to the output/player. The SD player also
publishes track time and progress and compiles a collected Solid Color pattern.

This is compile evidence, not a physical wiring or touch-layout example. It does
not establish display refresh speed, touch accuracy, heap headroom, SPI
coexistence, audio continuity, or support for other board families. Support-matrix
promotion still requires physical tests.

## Reproduce

From the repository root, with npm dependencies and the Python helper dependencies
installed:

```powershell
node scripts/generate-display-smoke.mjs
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/normal.ino
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/show.ino
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/player.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/normal.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/show.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/player.ino
```

Generation uses empty in-memory browser storage and opens no browser. Compilation
uses the helper's normal configuration/dependency staging and passes an empty
serial port, so it never flashes a device. Each invocation writes a complete log
and a JSON size/result report beside its input sketch. These local artifacts are
ignored by Git. Each command exits nonzero on a failed build.

The default target is ESP32-S3 with OPI PSRAM, 16 MB flash and a 3 MB application
partition. The fixture selects the generic N16R8 44-pin board profile and the
ST7789V/XPT2046 240×320 module. Use `--fqbn` only for a deliberately selected
alternative target; other boards are not covered by these fixtures. The helper
installs LVGL 9.5.0 lazily; Arduino must already have the ESP32 core and FastLED
installed. Both engines fetch their own pinned player audio dependency when
needed. Git and network access are required for uncached dependencies.

## Findings

The initial runs exposed these gaps, now covered by regression tests:

- FQBNs containing several comma-separated menu options lost their PSRAM mode
  when mapped to fbuild. The parser now reads the `PSRAM` option by name.
- fbuild's compile-only SD-player path did not fetch the audio library on a fresh
  installation. Audio staging now belongs to the shared compile path, inside
  the build lock, just like LVGL staging.
- Both compilers rejected normal sketches with widget → Math → formatted
  readout wiring on the same display. The normal generator now derives ports
  from the document, samples all widget outputs before graph evaluation and
  publishes inputs afterward. Native output passes share the same snapshot.
- The generic SD player emitted a silence fade even for collections with no
  audio analysis, referencing undeclared band levels. The fade now requires
  baked or live analysis; nonreactive patterns remain visible without it.
- fbuild 2.5.22's LVGL archive command exceeded Windows' command-length limit.
  The helper recognizes that specific failure, validates the archiver and every
  object path, archives the same objects through a response file, then retries
  fbuild once to finish linking and produce its normal size report. It does not
  trim or replace LVGL sources. The upstream call is in
  [archive_objects at v2.5.22](https://github.com/FastLED/fbuild/blob/v2.5.22/crates/fbuild-library/src/library/library_compiler.rs#L667).
- Arduino selected an older user-installed ESP32 audio library whose AAC
  decoder does not compile with this toolchain's `int32_t` definitions. The
  helper now passes a private, pinned 3.0.12 library via `--library`, leaving
  the user's global Arduino libraries unchanged. Incomplete downloads have no
  completion marker and are retried. A version comment in the helper's sketch
  also invalidates Arduino's cached caller object when the audio API changes;
  identical rebuilds retain their source mtime and library cache.

## Recorded environment

Windows, 4 September 2026. Arduino CLI 1.5.1 with ESP32 core 3.3.11 and FastLED
3.10.5; fbuild 2.5.22 with Arduino-ESP32 3.3.9 and vendored FastLED commit
`e52abeb26d1b3c4bf857e86ba5f9020ae805de73`. Both use LVGL 9.5.0 and player audio
checkouts tagged 3.0.12. These are separate toolchain builds, not a controlled
binary-size comparison between engines.

The local JSON reports record the generated source SHA-256, completion time,
target, exit status and sizes. Arduino reports flash against its 3 MB application
partition; this fbuild environment reports against the full 16 MB flash. Neither
static RAM report measures runtime heap or PSRAM use.

## Results

Sizes below use the compilers' final byte summaries. The helper JSON can round
fbuild sizes because it also accepts that engine's KB/MB display format.

| Fixture | Engine | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | ---: | ---: |
| Normal | Arduino CLI | Passed | 631,471 | 105,276 |
| Normal | fbuild | Passed | 956,128 | 160,860 |
| Generative show | Arduino CLI | Passed | 636,367 | 105,380 |
| Generative show | fbuild | Passed | 962,136 | 161,212 |
| SD player | fbuild | Passed | 1,632,988 | 176,084 |
| SD player | Arduino CLI | Passed | 1,312,015 | 121,268 |

Frontend verification: 4,171 tests passed, 13 skipped; lint and the production
build passed. The existing application bundle-size warning remains. Lint excludes
the temporary upstream source checkout at `artifacts/fbuild-source`. The focused
backend suite passed 105 tests.
