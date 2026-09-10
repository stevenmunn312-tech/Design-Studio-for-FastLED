# Display firmware compile checks

> **Partial coverage of the current model (2026-09-10).** The generator has been
> repaired: `scripts/generate-display-smoke.ts` now builds on the panel/document
> split — a `Display` node, a `TransportDisplay` panel and a `customDisplay` mount
> edge between them — and the removed field ports are gone. Three of the ten
> fixtures have been rerun against it on both engines and are recorded below.
> **The other seven have not**, and the figures for them are from the earlier
> graph model, so they are not current proof. See root todo HW-06 for the
> remaining runs and [review F9](reports/hardware-branch-review.md#f9--p2--compile-fixtures-still-use-the-removed-graph-shape)
> for how the fixtures came to be wrong.


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
```

The three generator paths, on both engines:

```powershell
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/normal.ino
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/show.ino
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/player.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/normal.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/show.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/player.ino
```

The shapes that have no generator of their own but fail in their own ways —
a TFT with no LED output beside it, a control build with no display half, a
panel switched off, two panels each showing their own design, and every
catalogued module in as few sketches as their I²C addresses allow:

```powershell
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/isolated-tft.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/headless.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/disabled.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/multi-panel.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/part-families.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/part-families-i2c.ino
```

The other advertised board. A classic ESP32 is a different chip family with no
PSRAM and a much smaller internal RAM ceiling, so its fixture carries the fixed
display layouts only — no custom screen, because a 64 KiB LVGL heap does not
fit beside FastLED there (HW-25). Pass its FQBN and a `--tag`, which keeps the
report beside the S3 one instead of overwriting it:

```powershell
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/classic-esp32-fixed.ino --fqbn esp32:esp32:esp32 --tag classic
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/classic-esp32-fixed.ino --fqbn esp32:esp32:esp32 --tag classic
```

Generation uses empty in-memory browser storage and opens no browser. Compilation
uses the helper's normal configuration/dependency staging and passes an empty
serial port, so it never flashes a device. Each invocation writes a complete log
and a JSON size/result report beside its input sketch. These local artifacts are
ignored by Git. Each command exits nonzero on a failed build.

The default target is ESP32-S3 with OPI PSRAM, 16 MB flash and a 3 MB application
partition. Those fixtures select the generic N16R8 44-pin board profile and the
ST7789V/XPT2046 240×320 module; the classic-ESP32 fixture selects the generic
38-pin DevKit and needs its own `--fqbn` as shown above. Each board gets its own
arduino-cli workspace, keyed on the FQBN's board id, because arduino-cli caches
per sketch *path* — one shared directory would have each board evicting the
other's cores and rebuilding all of FastLED. The helper
installs LVGL 9.5.0 lazily; Arduino must already have the ESP32 core and FastLED
installed. Both engines fetch their own pinned player audio dependency when
needed. Git and network access are required for uncached dependencies.

The generator refuses to write a fixture set that would waste a compile. It
asserts the binding symbols each sketch must contain, that every module offered
by a part menu is compiled by some fixture — derived from the catalogue, so a
display imported tomorrow fails here until it has been built once — and that no
fixture wires two parts to one pin. That last check found two live defects in
this set when it was added: a panel whose chip select shared the SD card's, and
an OLED reset sitting on the LED data pin.

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

### Current model, 2026-09-10

The three generator paths, rebuilt against the repaired fixtures. Arduino CLI
1.5.1 (ESP32 core 3.3.11, FastLED 3.10.5, LVGL 9.5.0) and fbuild 2.5.22, both on
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`.
The source hash is the generated `.ino`, so a figure can be tied to the exact
sketch that produced it.

| Fixture | Source SHA-256 | Engine | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | --- | ---: | ---: |
| Normal | `a024c5c4dada` | Arduino CLI | Passed | 632,799 (20%) | 105,644 (32%) |
| Normal | `a024c5c4dada` | fbuild | Passed | 957,450 (6%) | 161,229 (49%) |
| Generative show | `4362cdafefae` | Arduino CLI | Passed | 636,935 (20%) | 106,020 (32%) |
| Generative show | `4362cdafefae` | fbuild | Passed | 962,734 (6%) | 161,833 (49%) |
| SD player | `b8f1d7d68663` | Arduino CLI | Passed | 1,313,847 (41%) | 121,892 (37%) |
| SD player | `b8f1d7d68663` | fbuild | Passed | 1,635,779 (10%) | 176,712 (54%) |

These are the first runs to exercise `lv_obj_set_style_text_line_space`, which the
LVGL emitter began emitting the same day; each fixture carries three of them.

The percentages are not comparable across engines and are given only to save a
reader the division: Arduino CLI measures flash against the 3 MB application
partition, this fbuild environment against the full 16 MB. The static RAM figures
differ between engines for the same sketch — 105,644 against 161,229 bytes on the
normal fixture — because the two link different framework builds and count
different sections, not because either is wrong; fbuild's old impossible-RAM
defect was fixed in 2.5.17 and its guard removed. Compare an engine against
itself over time, never one against the other.

Two of the six needed the Windows LVGL archive recovery
([issue 12](reports/fbuild-workarounds.md)) and so took minutes rather than
seconds; that is a build-time artefact and does not affect the sizes.

### Earlier graph model — superseded, retained for comparison

Not current proof: these were built before the panel/document split, from the
fixture shape [review F9](reports/hardware-branch-review.md#f9--p2--compile-fixtures-still-use-the-removed-graph-shape)
describes. The seven fixtures not listed in the table above have no newer figures
at all.

| Fixture | Engine | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | --- | ---: |
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
