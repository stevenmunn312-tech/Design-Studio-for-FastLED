# Display firmware compile checks

> **All eleven fixtures carry current-model evidence (2026-09-11/12).**
> The generator was repaired first: `scripts/generate-display-smoke.ts` builds on
> the panel/document split — a `Display` node, a `TransportDisplay` panel and a
> `customDisplay` mount edge between them — and the removed field ports are gone
> (see [review F9](reports/hardware-branch-review.md#f9--p2--compile-fixtures-still-use-the-removed-graph-shape)
> for how the fixtures came to be wrong). Every fixture has since been built
> against it on both engines: twenty runs, all passing. Two needed a second
> attempt and neither for a reason in the sketch — one fbuild daemon death, one
> Windows command-length limit that the helper's own recovery handled.
> `refused-mounts` was added afterwards, for HW-03's two refused shapes, and
> compiled on both engines the same day.


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

The two graphs the app refuses, generated anyway — one design wired to two
panels, and a design wired to no panel while still driving a control. Neither is
a shape to ship; both are compiled because a refused graph is still generated
while its message is being read, and only a compiler can say the result is
well-formed rather than a sketch declaring one screen's widgets twice:

```powershell
python scripts/compile-display-smoke.py arduino-cli artifacts/display-compile/refused-mounts.ino
python scripts/compile-display-smoke.py fbuild artifacts/display-compile/refused-mounts.ino
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
- fbuild's daemon dropped its connection mid-build on one run
  (`daemon error: lost connection to daemon mid-build`) after four hours with
  nothing compiled, on a sketch the other engine built in under two minutes. A
  rerun of the identical source passed in 5m 23s. Not reproduced, not written up
  upstream yet; the daemon log at `~/.fbuild/prod/daemon/daemon.log` is where the
  evidence lives.
- The generated LVGL code composes style selectors as `LV_PART_x | LV_STATE_y`,
  which LVGL 9.5 deprecates between those two enum types. Sixty-six warnings per
  custom-screen sketch under fbuild; invisible under Arduino CLI, which compiles
  with `-w`. Harmless today, an error if the deprecation is promoted.
- Arduino selected an older user-installed ESP32 audio library whose AAC
  decoder does not compile with this toolchain's `int32_t` definitions. The
  helper now passes a private, pinned 3.0.12 library via `--library`, leaving
  the user's global Arduino libraries unchanged. Incomplete downloads have no
  completion marker and are retried. A version comment in the helper's sketch
  also invalidates Arduino's cached caller object when the audio API changes;
  identical rebuilds retain their source mtime and library cache.

## Recorded environment

Windows, 4 to 11 September 2026. Arduino CLI 1.5.1 with ESP32 core 3.3.11 and
FastLED 3.10.5; fbuild 2.5.22 with Arduino-ESP32 3.3.9 and vendored FastLED commit
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

### Current model, 2026-09-11

The seven shapes with no generator of their own, built against the current
fixtures. Arduino CLI 1.5.1 (ESP32 core 3.3.11, FastLED 3.10.5, LVGL 9.5.0) and
fbuild 2.5.22 (vendored FastLED `e52abeb26d1b`), on
`esp32:esp32:esp32s3:PSRAM=opi,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB`
except the classic-ESP32 fixture, which is `esp32:esp32:esp32`. The source hash
is the generated `.ino`, so a figure can be tied to the exact sketch that
produced it.

| Fixture | Source SHA-256 | Engine | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | --- | ---: | ---: |
| Isolated TFT | `ab8b3351b884` | Arduino CLI | Passed | 301,072 (9%) | 23,016 (7%) |
| Isolated TFT | `ab8b3351b884` | fbuild | Passed (rerun 2026-09-12) | 625,316 (4%) | 75,684 (23%) |
| Headless controls | `ef9b0a4cfe7b` | Arduino CLI | Passed | 427,151 (13%) | 27,636 (8%) |
| Headless controls | `ef9b0a4cfe7b` | fbuild | Passed | 743,117 (4%) | 80,855 (25%) |
| Disabled panel | `cf03c253eb74` | Arduino CLI | Passed | 628,643 (19%) | 105,276 (32%) |
| Disabled panel | `cf03c253eb74` | fbuild | Passed | 953,283 (6%) | 160,860 (49%) |
| Two panels, two designs | `d1f7034eea21` | Arduino CLI | Passed | 630,759 (20%) | 115,068 (35%) |
| Two panels, two designs | `d1f7034eea21` | fbuild | Passed | 955,443 (6%) | 170,650 (52%) |
| Part families (SPI) | `bfda657994bb` | Arduino CLI | Passed | 472,171 (15%) | 37,884 (11%) |
| Part families (SPI) | `bfda657994bb` | fbuild | Passed | 793,897 (5%) | 94,484 (29%) |
| Part families (I²C) | `7e2e4f5fc37c` | Arduino CLI | Passed | 460,307 (14%) | 31,012 (9%) |
| Part families (I²C) | `7e2e4f5fc37c` | fbuild | Passed | 778,824 (5%) | 87,552 (27%) |
| Classic ESP32, fixed layouts | `03da992ff2ff` | Arduino CLI | Passed | 428,331 (32%) | 31,508 (9%) |
| Classic ESP32, fixed layouts | `03da992ff2ff` | fbuild | Passed | 669,194 (16%) | 31,549 (10%) |

The classic-ESP32 percentages are against that chip's own ceilings — a 1.31 MB
application partition and 320 KB of RAM — so they are the one pair in the table
that is not measured against the S3 figures above them.

**One leg failed here and passed on a rerun.** On 2026-09-11 `isolated-tft`
under fbuild ended with `daemon error: lost connection to daemon mid-build`,
after 4h 08m of wall clock, having emitted nothing past its board banner, while
Arduino CLI built the identical hash in 1m 55s. Rerun on 2026-09-12 against the
same source, same engine and same machine, it passed in 5m 23s. So the death was
environmental, not a property of this fixture — but it is fbuild's own failure
mode and is not yet written up in
[the fbuild report](reports/fbuild-workarounds.md), which is worth doing while
the daemon log still holds it.

Two results are worth reading for what they prove beyond the exit code. The
screen-only sketch is the first compiled since FastLED is trimmed out of a
build that draws no LEDs: `isolated-tft.ino` mentions neither `FastLED` nor
`CRGB`, paces itself with a plain `delay(16)`, and is the smallest S3 fixture in
the set at 301 KB. And the LVGL background-opacity fix has two-engine proof
here, through the disabled-panel and two-panel fixtures, which carry 34 and 36
`bg_opa` pairs; it reached the three generator fixtures too, which is exactly
why their figures below are superseded.

Wall-clock totals in these logs are not build cost. Several of them — 7h 41m on
headless under Arduino CLI, 24m on the disabled panel — are a build waiting its
turn, since the helper clocks from before the lock is acquired.

### The three generator paths, 2026-09-12

Rebuilt on the current fixtures, after the LVGL background-opacity pairing
(`fd143099`) and the FastLED trim (`8a7334ea`) changed what the generator emits.
These supersede the 2026-09-10 figures, which described sketches it no longer
produces.

| Fixture | Source SHA-256 | Engine | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | --- | ---: | ---: |
| Normal | `96e3235d7172` | Arduino CLI | Passed | 633,319 (20%) | 105,644 (32%) |
| Normal | `96e3235d7172` | fbuild | Passed | 957,962 (6%) | 161,229 (49%) |
| Generative show | `8098a5107e36` | Arduino CLI | Passed | 637,435 (20%) | 106,020 (32%) |
| Generative show | `8098a5107e36` | fbuild | Passed | 963,246 (6%) | 161,833 (49%) |
| SD player | `887c16d16f4e` | Arduino CLI | Passed | 1,314,363 (41%) | 121,892 (37%) |
| SD player | `887c16d16f4e` | fbuild | Passed | 1,635,779 (10%) | 176,712 (54%) |

The player's fbuild leg needed the Windows LVGL archive recovery
([issue 12](reports/fbuild-workarounds.md)): fbuild failed twice with
`local library 'lvgl' failed to compile: failed to spawn [...]`, the helper
archived LVGL through a response file in 1.2s, and the retry linked in 29.1s.
That is the documented recovery behaving as designed, and it does not affect the
sizes.

**What the LVGL fix cost, measured rather than assumed.** Against the 2026-09-10
figures for the same three paths, flash grew by 520, 500 and 516 bytes under
Arduino CLI and by 512 bytes on both the normal and show paths under fbuild.
Static RAM is identical to the byte in every case, which is what a style-value
change should do: 34 `bg_opa` call sites per sketch, no new allocation. The
player's fbuild delta cannot be stated — see the rounding note below.

**Read fbuild's flash figures with their precision in mind.** The JSON report
derives them from the engine's displayed summary, which switches unit as the
number grows: KB for the two lighter paths, MB for the player. fbuild's own build
line carries full bytes — 957,960 / 161,228 for the normal path, 963,244 /
161,836 for the show, 1,635,416 / 176,708 for the player — and on the player that
is 363 bytes below the MB-rounded 1,635,779 above, whose precision is about
±5 KB. Since 2026-09-10 recorded the same rounded value for that leg, no
byte-level comparison is possible there; the other two are exact.

Superseded figures, kept only as the comparison those deltas are measured
against: normal 632,799 / 105,644 (Arduino CLI) and 957,450 / 161,229 (fbuild);
show 636,935 / 106,020 and 962,734 / 161,833; player 1,313,847 / 121,892 and
1,635,779 / 176,712. The percentages there and here are not comparable across
engines — Arduino CLI measures flash against the 3 MB application partition, this
fbuild environment against the full 16 MB — and the static RAM figures differ
between engines for the same sketch because the two link different framework
builds and count different sections. Compare an engine against itself over time,
never one against the other.

**One warning, sixty-six times, in every custom-screen sketch.** fbuild compiles
without `-w` and reports what Arduino CLI hides:
`bitwise operation between different enumeration types 'lv_part_t' and
'lv_state_t' is deprecated [-Wdeprecated-enum-enum-conversion]`. It is the LVGL
emitter composing style selectors as `LV_PART_x | LV_STATE_y`, which LVGL 9.5
wants typed as `lv_style_selector_t`. Warnings only, and every build here passed,
but they become errors if the deprecation is ever promoted. The fixtures with no
custom screen — `isolated-tft` among them — emit none, which is the expected
shape of the finding rather than a separate result.

### Refused mounts, 2026-09-12

The two graphs the app refuses, generated anyway: one design wired to two panels,
and a design wired to no panel while still driving a control.

| Fixture | Source SHA-256 | Engine | Result | Flash bytes | Static RAM bytes |
| --- | --- | --- | --- | ---: | ---: |
| Refused mounts | `2e9f94eb8940` | Arduino CLI | Passed | 630,979 (20%) | 105,588 (32%) |
| Refused mounts | `2e9f94eb8940` | fbuild | Passed | 955,597 (6%) | 161,167 (49%) |

**The saving is the evidence, not the exit code.** Against `multi-panel` — the
legal shape, two designs on two panels, same board — this uses 9,480 bytes less
RAM under Arduino CLI and 9,483 less under fbuild. A 240x20 RGB565 partial draw
buffer is 9,600 bytes, so both toolchains independently measure the spare panel
as having allocated no custom display of its own: it fell through to its fixed
layout, and the unplugged design cost nothing at all. That is the claim these
shapes make — emitted once, and an idle document priced at zero — measured rather
than read off the emitted text. Three structural properties are asserted in the
generator besides, where a compiler cannot help: the shared screen object is
declared exactly once (a second definition is a link error, not a missing
symbol), the spare panel gets no `lv_display_t`, and the unplugged design gets no
screen object.

fbuild's leg needed the Windows LVGL archive recovery, as the player's did: two
`failed to spawn` errors, a response-file archive in 1.0s, and a retry that linked
in 30.2s. Two of the three custom-screen fixtures built on fbuild have now needed
it, so treat it as the normal path on this platform rather than an exception. Its
precise bytes, from the engine's own build line, are 955,600 flash and 161,172
RAM; the table's figures come from the KB-rounded display summary.

### Earlier graph model — superseded, retained for comparison

Not current proof either, and for a different reason: these were built before
the panel/document split, from the fixture shape
[review F9](reports/hardware-branch-review.md#f9--p2--compile-fixtures-still-use-the-removed-graph-shape)
describes. They are kept only so the same three paths can be compared across the
model change.

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
