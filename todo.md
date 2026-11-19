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
- [x] Give project and pattern files a format version before the freeze.
  Done 2026-11-17: `formatVersion: 1` from `src/state/saveFormat.ts`; newer
  files are refused on open and import, left out of the folder listings, and
  never overwritten by the helper. Graph JSON import and export were removed,
  so the project file is the one workspace shape
  ([versioning](docs/release/versioning-and-releases.md#development-lines-and-the-v1-baseline)).

## 2. Review findings, next off the rank

What the 2026-11-18 code review found and left open. The four blockers, the
fbuild bump items and the trust items are fixed. The helper answering any
localhost origin was looked at and left as it is. Groups are in the order to
take them; the save format comes first because it is the only one that costs
more after the freeze.

### Save format (part of step 1)

- [x] Remove the pre-1.0 shims: the `uploadTarget` mirror,
  `RETIRED_PROPERTY_KEYS`, the RTC timezone migration and
  `RETIRED_TARGET_HANDLES`.
- [x] Settle `hueShift`: one unit and one property name across the nodes
  that carry it. Done 2026-11-19: degrees, `hueShift`, on all four.
- [x] Decide whether type ids that differ from their labels (`Clock` for
  `RTCInput`, and the others like it) are renamed before the freeze or kept
  for good. Decided 2026-11-19: nine are renamed to match their labels
  (`TempoClock`, `ColorTemperature`, `FieldTransform`, `FormulaPattern`,
  `HiHatShards`, `CrossfadeCycle`, `NetworkRipple`, `TileSymmetry`,
  `TransitionPool`); the rest, `RTCInput` and `MatrixOutput` among them, are
  kept for good. Old saves open through `src/state/preV1Aliases.ts`.
- [x] Make port ids consistent (`mid` against `mids`, and the others like it).
  Done 2026-11-19; old saves open through `src/state/preV1Aliases.ts`.
- [x] Give `#share=` links a format version.
- [x] Stop custom-shelf patterns vanishing from a saved workspace.
- [x] Keep runtime React Flow fields out of saved files.
- [x] Build the downloadable-parts client side before the freeze, so v1.0.0
  can gain parts without a release: saves embed signed part manifests, and an
  unknown part or part type is an error, not a fallback. All 40 part types are
  open; what is left (bundled Digital and Analog sensor parts, which wait on
  Blender models) is in [downloadable parts](docs/plans/downloadable-parts.md).

### Data safety

- [ ] Stop a reload in the middle of a save producing a false
  "(browser copy)" duplicate.
- [ ] Add an error boundary, so one component throwing does not blank the app.
- [ ] Give the `backendClient` fetches a timeout.
- [ ] Fix Save As reporting "Not saved" after a save that worked.

### Power and hardware

- [x] Validate a second board against its own FQBN, not the primary's
  (`boardUploadTargets.ts:19`).
- [x] ESP32-C3 GPIO11: check the pin rule against the module.

### Firmware and preview parity

- [x] `withoutUnusedFastLed` misses `random8`/`random16`, `ease8*`,
  `sin8`/`sin16` and `fl::` (`cppGenerator.ts:1815`).
- [x] Blobs and Breathe: palette wrap differs between preview and board.
- [x] Game of Life: `Math.round` on the interval.
- [x] WaveSim, FluidSim and TuringField step once per pass, not once per
  frame.
- [x] Bounds-check the sync follower index.
- [x] Mask rounding differs between preview and board.

### UI and release

- [ ] Close on Escape through `useEscapeLayer` in ProjectsPopup,
  RecoverPopup, BoardPopup, ArduinoCliPopup, CodeViewPopup,
  HardwareValidationPopup and SdCardPrompt.
- [ ] Help still says "graph JSON" and "public beta".
- [ ] The support matrix says FastLED 3.10.5; the pin is 3.10.9.
- [ ] The tag workflow publishes an unsigned `--prerelease`.
- [ ] Complete the licence notices, and settle the AnimARTrix
  non-commercial terms.
- [ ] Fill the CHANGELOG gaps.
- [ ] Start scripts run pip without `-c constraints.txt`.

### Helper

- [ ] Two arduino-cli compiles can share a temporary workspace.
- [ ] Cancelling an fbuild build can leave the daemon compiling.
- [ ] A Bluetooth player on fbuild is not switched to arduino-cli by itself.
- [ ] Decide the ESP32 deploy experiment (`-b 115200`).

## 3. fbuild upkeep

State and section numbers are in the
[runbook](docs/runbooks/fbuild-workarounds.md). The full run on fbuild 2.5.51
passed 65 of 66 legs on 2026-11-10; the one failure was the DMX library, since
replaced by the sketch's own receiver.

The pin moved to fbuild 2.5.52 on 2026-11-19. That release carries every fix
for [#2012](https://github.com/FastLED/fbuild/issues/2012) to
[#2020](https://github.com/FastLED/fbuild/issues/2020) and
[#1995](https://github.com/FastLED/fbuild/pull/1995), and the probes read the
ESP8266 Wi-Fi link (§15), `WiFiS3.h` (§16), nRF52840 LTO (§17), Pico W and
UNO R4 Minima as GONE, so those workarounds are removed and the Pico W is
mapped. The Minima builds a blink but not FastLED: 2.5.52 compiles the core's
`WiFiS3` library for it (§18, new, not reported). Still present: the
XIAO nRF52840 fails at link on `__wrap_realloc` (PR comment drafted, not
posted), a bare `@x.y.z` pin resolves as `^x.y.z` (report drafted, not
posted), and the §5 overflow line is not a size the helper reads
([runbook](docs/runbooks/fbuild-workarounds.md#probes)). A fault 2.5.52 does
not fix is recorded as a limitation in step 6.

- [x] Map each offered board that has no fbuild environment (`_PIO_BOARDS`)
  and that fbuild knows, then compile each one. Eighteen were tried on
  2026-11-12 and fourteen build: the XIAO, LOLIN and Adafruit ESP32 variants,
  two more ESP8266 boards, Pico 2 W, Micro and Pro Micro. The Feather
  nRF52840 builds with LTO unflagged. Pico W, Uno R4 Minima and XIAO nRF52840
  did not; the Pico W is mapped since 2.5.52, and the Minima (§18) and XIAO
  stay on arduino-cli through `_engine_for_board`
  ([runbook](docs/runbooks/fbuild-workarounds.md#boards-mapped-on-12-november-2026)).
- [x] Draft upstream reports for the four boards that do not build: Pico W,
  UNO R4 Minima, Feather nRF52840 and XIAO nRF52840 (`xiaoble_adafruit`), in
  `tmp/fbuild-main/drafts/`, each reduced to a two-file project.
- [x] Find whether the nRF52840 LTO failure (`offset out of range`) is
  FastLED's or fbuild's. It is fbuild's: its `-flto` breaks the Adafruit
  core's FreeRTOS port. The nRF52840 environments unflag it, and the DK and
  the Feather build (§17).
- [x] Compile a network sketch on a newly mapped ESP32 board. An NTP clock
  over Wi-Fi builds on the XIAO ESP32-C3 and the Feather ESP32 V2, both
  engines. The Pico 2 W needs none: the app emits no Wi-Fi code for RP2040.
- [x] The Feather nRF52840 does not link on arduino-cli either: FastLED
  reaches the TinyUSB `Serial`, which the sketch does not pull in. Fixed: the
  helper writes a source beside the sketch that includes the core's TinyUSB
  library. The Feather and the nRF52840 DK build
  ([runbook](docs/runbooks/fbuild-workarounds.md#boards-mapped-on-12-november-2026)).
- [x] Build one SAMD51 environment without the repeated `-D__SAMD51__` and MCU
  define for library sources. It passes at the same sizes; removed.
- [x] Recheck the three unpatched vendored libraries in `lib/` on 2.5.51: a
  GitHub `lib_deps` ignoring its `#ref`, the ignored HUB75 pin, and every
  `lib_deps` library compiled whether used or not (§1). Nothing is fixed, and
  the registry now resolves only mirrored packages, so everything stays
  vendored. Report drafted.
- [x] Add a fixture for §5
  ([#1658](https://github.com/FastLED/fbuild/issues/1658)) and one for
  [#1673](https://github.com/FastLED/fbuild/issues/1673).
  `scripts/compile-fixtures/fbuild-probes.py` rebuilds nine known faults and
  reports each as present or gone. On 2.5.51 a failed link prints an overflow
  line, so §5 is partly fixed upstream; #1673 is read as a setting, since
  showing it needs long paths turned off.
- [x] Find why fbuild ESP32 images carry about 255 KB more `.eh_frame` than
  Arduino CLI's. They no longer do: 6,468 bytes against 5,036 on FastLED
  3.10.9. What remains is in fbuild's own totals
  ([runbook](docs/runbooks/fbuild-workarounds.md#esp32-s3-size-figures-on-2551)).
- [x] Correct fbuild's ESP32-S3 RAM figure in the capacity meter. It counted
  the 50 KB `.dram0.dummy` placeholder (22.5% shown for 7.1% used); the
  helper now subtracts it where the linked image shows it was counted.
- [x] Steve reviews the drafts in `tmp/fbuild-main/drafts/`, then they are
  posted upstream. Reviewed, rebuilt on 2.5.51 and posted on 2026-11-14 as
  [#2012](https://github.com/FastLED/fbuild/issues/2012) to [#2020](https://github.com/FastLED/fbuild/issues/2020)
  ([runbook](docs/runbooks/fbuild-workarounds.md#boards-mapped-on-12-november-2026)).
- [x] **Release gate.** Bump the fbuild pin to the release that carries the
  fixes for #2012 to #2020, run `fbuild-probes.py` on it, and drop the
  workarounds whose probes read GONE. Done on 2.5.52 (2026-11-19), with the
  matrix cache key moved to `builds-v5`.
- [ ] Rebuild the ESP8266 Wi-Fi, `uno-r4-wifi`, nRF52840 and new `boards`
  Pico W legs on fbuild 2.5.52 in the GitHub matrix.
- [ ] Draft an upstream report for §18: on 2.5.52 a FastLED sketch for the
  UNO R4 Minima compiles the core's `WiFiS3` library and fails on `D24`.
  Steve reviews before posting.
- [ ] Flash a Web Remote to the D1 mini through fbuild, which upstream asked
  for on [#1994](https://github.com/FastLED/fbuild/issues/1994). Needs Steve's
  bench.
- [ ] Retire the helper's `.dram0.dummy` subtraction (`_without_ram_placeholder`)
  if 2.5.52's ESP32-S3 RAM figure no longer counts the placeholder
  ([#2013](https://github.com/FastLED/fbuild/issues/2013)). No probe covers it.

## 4. HW-17 · Distribution smoke tests

Exit: per-platform launch and install, helper discovery, permissions, offline
and recovery evidence
([desktop distribution](docs/release/desktop-distribution.md#signing-and-publishing)).

- [x] Relaunch the offline PWA from a clean browser profile. Passes in
  Chromium, 2026-11-14.
- [ ] Sign the Windows launcher and bundled executables with Authenticode, or
  publish through the [Microsoft Store](docs/release/microsoft-store.md) MSIX,
  which the Store signs.
- [ ] Run the Windows package on a clean account or machine, through launch
  and an upload.
- [x] Reconcile the fbuild 2.5.4 tools the macOS bundle substitutes with the
  pinned Python dependency
  ([package workflow](docs/release/desktop-distribution.md#github-package-workflow)).
  The 2.5.51 wheel's tools run on both Mac runners; the bundle carries them.
- [x] Give the macOS package its application layout. Done 2026-11-18: a
  `Design Studio for FastLED.app` bundle with a small window that keeps the
  Studio running, sealed ad hoc and zipped with `ditto`
  ([macOS app](docs/release/desktop-distribution.md#macos-app)).
- [ ] Sign the macOS app with a Developer ID and the hardened runtime, then
  notarize and staple it. Needs an Apple Developer Program membership.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel.
- [ ] Run the Linux package on a clean machine.
- [x] Record a checksum and a provenance record for every archive. The
  package workflow writes a SHA-256 file and a GitHub attestation for each.

## 5. Freeze the code and run the full compile matrix

No full matrix runs before this step, because every sketch keeps changing.

- [ ] Declare the freeze: steps 1 to 4 are done, including the two fbuild
  release gates in step 3, and generated firmware stops changing.
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
- [ ] Delete `src/state/preV1Aliases.ts`, its test and its call sites (grep
  `preV1Aliases`) in that same leftover sweep. It is the one place the nine
  renamed type ids and round eight's port and property renames are named; after
  the freeze an old save needs a real migration, not this table.
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
