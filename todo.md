# v1.0.0 release steps

Only the steps that release v1, in the order they are done. Tick a step when
its outcome is recorded where it belongs, and remove a section once every step
in it is ticked. Item ids (HW-17, HW-18) are unchanged, so links to "root todo,
HW-nn" still name the same work.

Everything else moved out on 2026-11-12:

- **Bench and community testing** is in the
  [bench backlog](docs/plans/bench-backlog.md). It runs in parallel and holds up
  nothing here; step 6 uses whatever evidence is on record when it is reached.
- **Work deferred until after v1** is in the
  [post-v1 list](docs/plans/post-v1.md).
- **Completed items** are in the
  [archive](docs/archive/todo-completed-to-2026-11-12.md), and the history
  before 2026-09-24 in the
  [earlier archive](docs/archive/hardware-todo-to-2026-09-24.md).

## 1. Close the save format to new shapes

- [ ] Land or drop every remaining merge, rename and removed property. None is
  open on 2026-11-12. From here a saved shape changes only to remove a pre-1.0
  leftover, until step 6 freezes the format.

## 2. Compile the firmware that has never been compiled

Everything below landed between 2026-11-09 and 2026-11-11 and has only unit
and host tests behind it. Compile one fixture for each line with Arduino CLI,
one at a time, since overlapping runs corrupt its cache. Fix what fails, and
record the results under [compile checks](docs/index.md#compile-checks). This
is a targeted pass, not the full matrix; that is step 5. The six fixtures
known to be missing were written on 2026-11-12 and are named on their lines;
a named family runs with `compile-matrix.py --only <family>/`. The rest were
compiled on GitHub on 2026-11-12, most through the `v1-variants` family, and
every ticked line is recorded in the
[targeted pass record](docs/reports/compile/v1-targeted-pass-compile-checks.md).
One line stays open.

### 2.1 Inputs, controls and data links

- [x] DMX Live and DDP Live.
- [x] Presence `connected` and mm.
- [x] Keypad keys and Digit.
- [x] Touch Pad pads.
- [x] Accel Shake.
- [x] Encoder clicks (`CtlDetent` with `lroundf`).
- [x] Button rows (`ssr`, `board-links`, `control-graph`, the Player Buttons
  and Screen starter).
- [x] A DMX512 node on a classic ESP32 and on an ESP32-C3, whose one spare
  UART takes the `CONFIG_IDF_TARGET_*` branch.
- [x] Two DIN MIDI nodes sharing `midiDinCpp`'s reader.
- [x] DMX512 beside a radar, and beside a DFPlayer, so the UART allocator
  moves it. All three together are refused: a classic ESP32 has two spare
  UARTs.
- [x] A log Slider and Dial on an LVGL screen (`_rsLogValue`,
  `_rsLogPosition`).
- [x] Custom screens, `display` screens-normal and screens-show: two screens
  moved by a Go to screen button and a wired Screen input, a Text Entry, a
  Chart, a Spectrum in the normal sketch (a show refuses one) and Show Status
  in the show.

### 2.2 Clock, network and power

- [x] The Board network identity: `ethernet` static, `control-graph` show-ntp,
  player-ntp and show-ethernet, and the `board-links` runs.
- [x] The Clock time zone: `configTzTime` on an ESP32 and
  `configTime(tz, server)` on an ESP8266, through `control-graph` show-ntp and
  player-ntp (now on Europe/Paris) and `v1-variants` clock-zone-esp8266.
- [x] A DS3231 Clock reading its module, `control-graph` normal-ds3231 and
  show-ds3231.
- [x] An Arduino UNO R4 WiFi through WiFiS3, `uno-r4-wifi`: ntp-zone (NTP in a
  daylight-saving zone, `_rtcTzOffset`) and artnet-static (Art-Net beside NTP
  on a named board at a static address). Arduino CLI only: fbuild does not
  find `WiFiS3.h` (step 3).
- [x] Both boards of a two-board clock-sync project, `clock-sync`: leader and
  follower running one pattern, then the same collection show.
- [x] Schedule Trigger's DateTime.
- [x] The Power Switch RGB strip (`yynmos4-rgb`, `mosfetti-rgb-avr`).

### 2.3 Audio

- [x] Demo drums, the envelope clock and Beat Phase.
- [x] The audio Speed doubling and 2.0 clamps (Bass Cathedral Collapse,
  Chromatic Orbit Reactor, Beat Temple).
- [x] The `reactivity` role in the show and SD player (`show-sequencing`
  ramped-param player with a `SET_ENERGY` ramp).
- [x] The band patterns' `audioBandsCpp` block: an ESP32-S3 and microphone
  into Ember Pulse on Palette, Gravity Well, Hi-Hat Shards and AnimARTrix.
- [x] A Slideshow group feeding Audio Cascade.
- [x] The same band-pattern graph with no microphone.
- [x] Dance Flash and Ember Pulse on Palette.
- [x] Gravity Well `_gwIdx`.
- [x] Audio Features Level. It did not compile alone: the host published
  `_audioLoudness` only for the Loudness output. Fixed.
- [x] The Audio node an SD card reader brings.
- [x] The Music Player seed.
- [x] The Music Player and the Player Buttons and Screen starters, each with
  twenty patterns.
- [ ] The Music-synced SD Show starter with twenty patterns. It needs an
  analysed track; its generator compiles through `dead-code/performance-*`.

### 2.4 Patterns, fields and simulations

- [x] The Code node's a/b block.
- [x] Saturation Keep Brightness.
- [x] Frame Warp motion.
- [x] The shared trail knob.
- [x] A byte-trail node (Confetti, Trails, String Particles or Fourier) for
  the 60 Hz fade step.
- [x] Color Trails' half-life fade, linked and independent.
- [x] Game of Life's period-2 reseed.
- [x] Plasma Scale, Plasma Sine Grid and Sine 2D.
- [x] Noise Contrast, and Plasma Fractal on lava.
- [x] Frame Transform: a Smooth rotate such as Psydance, and an Exact rate
  such as Laser Monsoon Parade.
- [x] Field Transform: Lissajous Lattice's wired tiles and spin, and Golden
  Ratio Cathedral.
- [x] Shape Field's rose with spin, and its superformula.
- [x] Mirror Radial turned and rotation-only (Prism Fracture, Chromasonic
  Vortex), and radial Mirror on a strip.
- [x] The Math Switch literal.
- [x] Particles: luminova, comet, fireworks, chase and waterfall.
- [x] String Particles on a ring, with drift and meteors.
- [x] Formula Points: logistic, attractor, Lissajous and rose.
- [x] Fire classic, smoke and Fire2012 on the clock.
- [x] Boids in density mode, with `_bnx`/`_bny`/`_bnn` as statics.
- [x] Reaction Diffusion on the clock.
- [x] The Simplex2D show clock and the Kaleidoscope show pattern
  (`performance` player).

### 2.5 Text, layout and output

- [x] Text Base, and Path speed.
- [x] Text and the analog clock in Pixels, and a 0-1 Line.
- [x] Text and Clock Display at Size 2 on a 64x32 HUB75. It did not build on
  the Arduino CLI engine, which had no HUB75 library. Fixed: the helper
  installs the pinned release on first use.
- [x] The Font select on Text and Clock Display: 3x5, 4x6, 5x8 and bold 6x8.
- [x] Strip centring and long-side sizing: a 60x1 strip with Geometry Field, a
  formula reading `r`, Shape Field, Path and Fourier (`FLAT_PATH_ROW_CPP`).
- [x] The same strip on an AVR, for the `min`/`max` macros.
- [x] The LED matrix start corner and first run.
- [x] Output Gamma: single output, two outputs, show controller, SD player and
  a mapped ring. Two outputs did not compile: the unread-local cleanup left
  `static constexpr` behind. Fixed.
- [x] A 720-LED and a 4096-LED string, `long-strings`, each with Waveform's
  line style and an elementary Automaton (they lost their stack arrays).

## 3. fbuild upkeep

State and section numbers are in the
[runbook](docs/runbooks/fbuild-workarounds.md). The full run on fbuild 2.5.51
passed 65 of 66 legs on 2026-11-10; the one failure was the DMX library, since
replaced by the sketch's own receiver.

- [x] Map each offered board that has no fbuild environment (`_PIO_BOARDS`)
  and that fbuild knows, then compile each one. Eighteen were tried on
  2026-11-12 and fourteen build: the XIAO, LOLIN and Adafruit ESP32 variants,
  two more ESP8266 boards, Pico 2 W, Micro and Pro Micro. Pico W, Uno R4
  Minima, Feather nRF52840 and XIAO nRF52840 do not, and stay on arduino-cli
  through `_engine_for_board`
  ([runbook](docs/runbooks/fbuild-workarounds.md#boards-mapped-on-12-november-2026)).
- [ ] Draft upstream reports for the four boards that do not build, and
  compile a network sketch on the Pico 2 W and one newly mapped ESP32 board.
  The Feather nRF52840 does not link on arduino-cli either (FastLED and the
  TinyUSB `Serial`).
- [x] Build one SAMD51 environment without the repeated `-D__SAMD51__` and MCU
  define for library sources. It passes at the same sizes; removed.
- [x] Recheck the three unpatched vendored libraries in `lib/` on 2.5.51: a
  GitHub `lib_deps` ignoring its `#ref`, the ignored HUB75 pin, and every
  `lib_deps` library compiled whether used or not (§1). Nothing is fixed, and
  the registry now resolves only mirrored packages, so everything stays
  vendored. Report drafted.
- [ ] Add a fixture for §5
  ([#1658](https://github.com/FastLED/fbuild/issues/1658)) and one for
  [#1673](https://github.com/FastLED/fbuild/issues/1673).
- [x] Find why fbuild ESP32 images carry about 255 KB more `.eh_frame` than
  Arduino CLI's. They no longer do: 6,468 bytes against 5,036 on FastLED
  3.10.9. What remains is in fbuild's own totals
  ([runbook](docs/runbooks/fbuild-workarounds.md#esp32-s3-size-figures-on-2551)).
- [x] Correct fbuild's ESP32-S3 RAM figure in the capacity meter. It counted
  the 50 KB `.dram0.dummy` placeholder (22.5% shown for 7.1% used); the
  helper now subtracts it where the linked image shows it was counted.
- [ ] Steve reviews the drafts in `tmp/fbuild-main/drafts/` (the RP2040
  and RP2350 flash count including the `.heap` reservation, the ESP32-S3
  size figures, and `lib-deps-on-2.5.51.md`), then they are posted
  upstream.
- [ ] fbuild does not find the UNO R4 WiFi core's `WiFiS3.h` (§16, found
  2026-11-12), so those sketches build with arduino-cli. Reduce it to a
  minimal project, recheck on the release that carries #1995, then Steve
  reviews the draft (`uno-r4-wifi-wifis3-not-found.md`) and it is posted.
  It does not hold the release.
- [ ] When an fbuild release carries upstream #1995, the fix for
  [#1994](https://github.com/FastLED/fbuild/issues/1994) (open on 2026-11-12,
  after 2.5.51): move the pin, drop `_ESP8266_NETWORK_INCLUDE` and the D1 mini
  entry in `ARDUINO_CLI_ONLY`, rebuild the Wi-Fi legs, and flash a Web Remote
  to the D1 mini through fbuild, which upstream asked for. Until then an
  ESP8266 sketch that uses Wi-Fi builds with arduino-cli (§15), which worked
  on a D1 mini on 2026-11-11, so this step does not hold the release.

## 4. HW-17 · Distribution smoke tests

Exit: per-platform launch and install, helper discovery, permissions, offline
and recovery evidence
([desktop distribution](docs/release/desktop-distribution.md#signing-and-publishing)).

- [ ] Relaunch the offline PWA from a clean browser profile.
- [ ] Sign the Windows launcher and bundled executables with Authenticode, or
  publish through the [Microsoft Store](docs/release/microsoft-store.md) MSIX,
  which the Store signs.
- [ ] Run the Windows package on a clean account or machine, through launch
  and an upload.
- [ ] Reconcile the fbuild 2.5.4 tools the macOS bundle substitutes with the
  pinned Python dependency
  ([package workflow](docs/release/desktop-distribution.md#github-package-workflow)).
- [ ] Give the macOS package its application layout, code signing, hardened
  runtime and notarization.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel.
- [ ] Run the Linux package on a clean machine.
- [ ] Record a checksum and a provenance record for every archive.

## 5. Freeze the code and run the full compile matrix

No full matrix runs before this step, because every sketch keeps changing.

- [ ] Declare the freeze: steps 1 to 4 are done and generated firmware stops
  changing.
- [ ] Read the current plan with
  `python scripts/compile-fixtures/compile-matrix.py --engine all --list`. On
  2026-10-27 it was 198 builds, 131 on Arduino CLI and 67 on fbuild, picked so
  each board builds every library, configuration and FastLED, core or library
  name the fixtures use at least once.
- [ ] Run the `Compile matrix` GitHub workflow on the frozen commit, both
  engines (20 Windows runners).
- [ ] Fix each failure and rerun only its leg, or record it as a limitation
  for step 6. Known on the last full run: the Nano ESP32 fails on an fbuild
  board-flag bug
  ([FastLED/fbuild#1760](https://github.com/FastLED/fbuild/issues/1760)).
- [ ] Record the run in the
  [fbuild runbook](docs/runbooks/fbuild-workarounds.md) and the compile
  reports.

## 6. HW-18 · v1 scope and format baseline

The pre-1.0 compatibility sweep is done
([cleanup record](docs/release/versioning-and-releases.md#pre-v1-cleanup-record)).

- [ ] Remove any pre-1.0 leftover found since the sweep, the same way,
  without a migration.
- [ ] Choose the supported combinations from the evidence on record in the
  [bench backlog](docs/plans/bench-backlog.md) and the reports, and update the
  [support matrix](docs/release/beta-support-matrix.md). Everything else stays
  experimental.
- [ ] Reconcile the release copy with that scope.
- [ ] Freeze the panel, document and control save format. It becomes the
  compatibility baseline.
- [ ] Record the limitations and deferments.
- [ ] Repeat the
  [keyboard and screen-reader smoke test](docs/release/accessibility-smoke-test.md)
  on the candidate build; the recorded pass (2026-07-26) predates the
  workspace tabs and shelves.

## 7. Release

The [release checklist](docs/release/versioning-and-releases.md#release-checklist)
is the authority; these are its steps.

- [ ] Update `README.md` and `CHANGELOG.md`, and empty this file.
- [ ] Set the version in `package.json` to `1.0.0`.
- [ ] Review the support matrix and the
  [supported platform policy](docs/release/supported-platform-policy.md)
  against the validation evidence.
- [ ] Review `THIRD_PARTY_NOTICES.md` for new bundled assets and dependency
  changes.
- [ ] Run the verification gates: lint, tests and `tsc -b`, and the backend
  tests.
- [ ] Build each advertised desktop archive on its target OS with
  `npm run package:desktop`, record its checksum, and repeat the launch smoke
  on a clean account or machine.
- [ ] Sign and notarize the platform executables.
- [ ] Commit the version bump and changelog.
- [ ] Create the annotated tag `v1.0.0` on that commit.
- [ ] Push the commit and the tag together.
