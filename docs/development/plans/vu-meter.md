# Stereo Side-String VU Meters — Implementation Plan

## Goal

Add a paired stereo VU-meter fixture to Design Studio for FastLED: one vertical addressable LED string on the left side of a matrix frame and one on the right. When the fixture has a valid Audio connection, the left string follows the left audio channel and the right string follows the right channel. Mono sources intentionally drive both sides equally.

The feature must work in browser preview and generated firmware, provide at least ten genuinely different visualizations, coexist with the main LED output, and remain off when its Audio input is missing or inactive.

This document is the implementation plan and progress ledger. **169 of 186
checklist items are complete.** The core fixture, stereo audio paths, previews,
all three firmware generators and their ESP32-S3 compile proofs, baked fallback,
wiring output, capacity checks, performance guard, and user documentation are
complete. The physical bench matrix was completed on 2026-09-02 and is recorded below.
Remaining work is the cross-language renderer parity harness and the changelog
entry. Physical bench evidence is never inferred from compile or browser tests.

## Recommended product shape

Use one new hardware-owned root-graph sink named **Stereo VU Meter** (`StereoVuMeter`). It represents the pair of physical LED strings as one fixture and owns both data pins.

- It has one `audio` input and no outputs.
- It is added from **Hardware → LED outputs** and appears on the root graph because it carries a signal.
- Adding it auto-connects to the sole Audio node when that connection is unambiguous; the connection remains visible and editable.
- It targets one chosen LED Matrix or HUB75 Panel for preview placement, so multi-output projects know which frame the side strings belong to.
- It does not consume or alter the matrix frame cable.
- It joins the same firmware loop and final synchronized LED refresh as the other addressable outputs.
- It is enabled only when the fixture is enabled and its Audio input resolves to an active source. No hidden scan for “audio-category” nodes determines behavior.

This explicit sink fits the repository's existing rules: physical hardware lives in the root graph, signal behavior is expressed through wires, and input-bearing sinks are retained by evaluation and code generation.

## Initial hardware scope

The first supported configuration should be deliberately narrow and bench-verifiable:

- Two clockless addressable LED strings of equal length.
- Default chipset: WS2812B.
- Default color order: GRB.
- One independent data pin per side.
- Shared LED count, chipset, color order, brightness limit, and current limit.
- Independent physical direction per side because either string's data-in end may be at the top or bottom.
- Optional channel swap for installations whose audio or physical wiring is reversed.
- ESP32-S3 + PCM1802 is the primary true-stereo reference target.
- INMP441 and other mono capture sources are supported by mirroring mono to left and right.
- Clocked/SPI LED strings are deferred until the two-clock/two-data bus and collision rules have their own verified design.

Before implementation begins, record the actual string chipset, LEDs per side, supply voltage/current rating, data-in location for each side, controller board, and audio source used on the first test rig.

## Source behavior and compatibility

The existing audio contract is mono. The PCM1802 capture path reads left and right samples today, but downmixes them before FastLED analysis. The existing browser path also analyzes a mono/downmixed signal. Stereo metering therefore needs a parallel channel-level path; it should not replace or duplicate the existing mono FFT/beat path.

| Source | Existing pattern analysis | New VU behavior |
|---|---|---|
| PCM1802 line input | Preserve current mono downmix for FFT/beat/features | Calculate independent left/right levels before downmix |
| Browser stereo input | Preserve current mono analysis | Split channels and calculate independent left/right levels |
| Browser mono input | Preserve current mono analysis | Mirror the mono level to both sides |
| INMP441 microphone | Preserve current mono analysis | Mirror the mono level to both sides |
| Music Player decoded PCM | Preserve current mono analysis tap | Calculate levels from the decoded left/right samples before mixing |
| Mono music file | Preserve current mono analysis | Mirror its channel to both sides |
| Baked song envelope | Preserve bass/mids/treble behavior | Add versioned left/right levels; mirror legacy mono envelopes |
| Old recording/test Audio override | Preserve current fields | Treat missing stereo fields as mono and mirror them |

Add optional normalized `leftLevel` and `rightLevel` values, plus a `stereo`/channel-count indication, to the runtime audio signal. Keep all existing bass, mids, treble, spectrum, beat, and BPM fields unchanged. Missing new fields must have one shared fallback rule so existing saved projects, tests, recordings, and baked shows keep working.

The VU level should be based on a documented short-window RMS or loudness estimate with peak capture, not on the average of the three normalized FFT bands. Define one set of behavior constants for preview and firmware:

- input gain;
- noise gate/floor;
- optional logarithmic or gamma response curve;
- attack time;
- release time;
- peak-hold duration;
- peak-fall rate; and
- silence timeout/fade-to-black.

Use elapsed time for all ballistics. Do not make attack, release, falling peaks, cycling, or trails frame-count dependent.

## Visualization catalogue

All modes use the same conditioned left/right levels and physical direction mapping. A visualization changes presentation, not audio calibration. Ship at least the following twelve modes:

1. **Classic Ladder** — green at the bottom, yellow through the upper range, red at the top.
2. **Palette Fill** — a continuous user-selected palette fills from the base upward.
3. **Solid Channel** — each side uses a configurable solid color with brightness proportional to level.
4. **Segmented Blocks** — lit groups separated by deliberate dark gaps, like a hardware rack meter.
5. **Peak Cap** — a filled bar with a contrasting held peak LED above it.
6. **Falling Comet** — a bright head with a fading trail that drops under gravity after transients.
7. **Center Burst** — each string grows outward from its midpoint toward both ends.
8. **Frame-Inward** — bars originate at the outer ends and move toward the matrix-facing ends, configurable for the physical mounting direction.
9. **Dot Runner** — one bright level marker per channel with a short persistence trail instead of a solid fill.
10. **History Trail** — recent level history scrolls along each string, turning each side into a compact vertical waveform/waterfall.
11. **Stereo Balance** — color and motion emphasize the difference between left and right while overall brightness follows combined energy.
12. **Beat Spark** — normal level bars receive a brief tip sparkle/burst from the existing beat event.

Provide these selection policies:

- **Manual** — hold the selected visualization.
- **Timed cycle** — advance after a configurable number of seconds.
- **Beat cycle** — advance on a beat, rate-limited to avoid frantic changes.
- **Shuffle** — deterministic seeded order rather than a new uncontrolled random sequence on every render.

Avoid mode-specific input normalization. Switching modes must not make the same signal appear to jump dramatically in loudness.

## Proposed fixture settings

- Target LED output (the matrix/panel the rails visually flank)
- LEDs per side
- Left data pin
- Right data pin
- Left data-in position: Bottom or Top
- Right data-in position: Bottom or Top
- Swap left/right channels
- Chipset (initially a supported clockless subset)
- Color order
- Brightness
- Milliamps/current cap for the pair
- Visualization policy: Manual, Timed cycle, Beat cycle, Shuffle
- Visualization mode
- Cycle interval
- Palette
- Left solid color
- Right solid color
- Gain
- Noise gate
- Response curve
- Attack
- Release
- Peak hold
- Peak fall
- Trail amount
- Beat accent amount
- Enabled

Keep defaults useful on a first run: bottom-up, Classic Ladder, moderate release, short peak hold, and a conservative brightness/current cap.

## Step-by-step implementation checklist

### Phase 0 — Confirm the physical and UX contract

- [x] Record the reference controller, audio source module, LED chipset, color order, LEDs per side, data voltage, and power supply. (Recorded below. The first bench rig has no PCM1802; its true-stereo source is the SD decoder tap.)
- [x] Record whether each physical string's data-in is at the top or bottom.
- [x] Decide whether the first release supports only WS2812-class clockless strings or a precisely listed clockless chipset subset.
- [x] Confirm that both sides use the same LED count for version one.
- [x] Confirm **Stereo VU Meter** as the user-facing name and `StereoVuMeter` as the internal node type.
- [x] Confirm that the fixture uses an explicit Audio wire and is not enabled by an ambient category scan.
- [x] Confirm that Add Hardware may auto-wire only when exactly one Audio source node makes the choice unambiguous.
- [x] Confirm silence behavior: fade both strings to black rather than retaining stale levels.
- [x] Define behavior when no target matrix exists: allow standalone node preview, but require a target only for combined frame preview.
- [x] Add the final design note to the repository documentation before implementation and link it from `docs/NAVIGATOR.md`.

### Phase 1 — Specify stereo level semantics

- [x] Define the normalized level range and exact RMS/peak measurement window.
- [x] Define the noise gate, gain, response curve, attack, release, peak hold, and peak fall equations.
- [x] Define the time source and reset behavior used by both browser and firmware.
- [x] Define mono fallback once: if left/right are absent, derive one level and mirror it.
- [x] Define silence/inactive behavior and the time required to reach black.
- [x] Decide whether clipping is exposed as a runtime flag for red tip indication and diagnostics.
- [x] Define how invalid values, NaN, and out-of-range levels are clamped.
- [x] Create fixed waveform fixtures for silence, steady tones, impulses, left-only, right-only, equal stereo, and clipping.
- [x] Document acceptable preview/firmware tolerance against those fixtures.

### Phase 2 — Extend browser and shared audio state without breaking mono analysis

- [x] Extend `src/audio/audioEngine.ts` audio data with optional left/right level and channel metadata.
- [x] Preserve the current FastLED-style mono analyzer as the sole source of bass, mids, treble, spectrum, beat, and BPM.
- [x] Split browser input into left/right time-domain streams when the device supplies two channels.
- [x] Mirror channel zero when the browser supplies only one channel.
- [x] Avoid running two unnecessary full FFT analyzers; calculate the stereo VU envelope with the smaller dedicated level path.
- [x] Update `src/state/audioStore.ts` defaults, start/stop behavior, and subscriptions.
- [x] Extend `AudioSignal` and `AudioOverride` in `src/state/graphEvaluator.ts` with backward-compatible optional stereo fields.
- [x] Add a shared resolver that returns safe left/right levels for new and legacy audio payloads.
- [x] Update recording, playback override, pattern-rating, show-preview, and test fixtures that construct Audio payloads.
- [x] Confirm microphone permission denial leaves the fixture black and does not destabilize preview.
- [x] Add tests for actual stereo, mono mirroring, inactive audio, clipping, and start/stop reset.

### Phase 3 — Preserve stereo in firmware capture paths

- [x] Add `_audioLeftLevel` and `_audioRightLevel` (or an equivalent small contract) beside the existing mono `_audio*` globals.
- [x] Keep the existing PCM1802 mono downmix feeding the FastLED Processor so current audio-reactive patterns do not change.
- [x] Calculate PCM1802 left/right levels from the raw interleaved samples before downmixing.
- [x] Make the PCM1802 capture adapter expose the newest channel levels safely to the main loop.
- [x] Mirror the selected INMP441 channel into both VU levels.
- [x] Preserve channel choice for mono pattern analysis; do not reinterpret the existing Line In “Both/Left/Right” property silently.
- [x] Decide and document VU behavior when Line In is configured to Left or Right only; recommended behavior is to mirror the selected channel.
- [x] Add firmware-generation tests proving left/right PCM sample accumulation remains distinct for Both, while Left/Right selections mirror the selected side.
- [x] Add serial diagnostics for left/right meter levels behind the existing debug option.
- [x] Verify no duplicate I2S driver or second full FFT pipeline is emitted.

### Phase 4 — Preserve stereo in Music Player and baked-show paths

- [x] Extend the decoded-PCM tap in `src/codegen/playerSketchGenerator.ts` to measure left and right before its current mono mix.
- [x] Mirror mono decoded files to both VU levels.
- [x] Keep decoder playback/DMA work higher priority than metering and pattern rendering.
- [x] Retain the existing mono FastLED Processor feed for FFT/beat/features.
- [x] Extend song decoding/analysis so a baked fallback can retain left/right level envelopes.
- [x] Version the show-file audio trailer rather than changing the existing three-byte frame layout in place.
- [x] Make the player accept legacy mono envelopes and mirror them.
- [x] Update `src/types/showFile.ts`, `src/codegen/performanceGenerator.ts`, `src/state/showAudio.ts`, and the upload/player loaders together.
- [x] Add tests for stereo decoder PCM, mono decoder PCM, stereo baked fallback, and legacy baked fallback.
- [x] Confirm in generated-code coverage that decoder failure selects the baked stereo envelope without resetting fixture ballistics.

### Phase 5 — Add the hardware-owned Stereo VU Meter fixture

- [x] Add the `StereoVuMeter` node definition with one Audio input and no outputs.
- [x] Add safe default properties and property controls.
- [x] Mark it hardware-managed and hidden from the normal node library.
- [x] Ensure it always lives in and writes to the root graph, even while editing a group.
- [x] Add it to the **LED outputs** section of Add Hardware.
- [x] Reuse the verified LED-string visual twice in the hardware bench; do not add a hand-drawn placeholder part.
- [x] Draw both rails at true pitch/length and label Left and Right plus their data-in ends.
- [x] Add a compact graph node body showing two vertical live meters and the active mode.
- [x] Implement unambiguous auto-wiring to an existing Audio node; otherwise leave a clear empty socket and guidance.
- [x] Add target-output selection using root-graph LED outputs.
- [x] Ensure deleting/disconnecting on the canvas follows the repository's hardware ownership rules.
- [x] Add focused tests for creation, root ownership, auto-wiring, deletion behavior, defaults, and property editing.

### Phase 6 — Register pins, buses, manifests, retargeting, and parts

- [x] Add left/right data-pin GPIO requirements in `src/state/nodeLibrary.ts`.
- [x] Add each data pin as an exclusive LED-data use in `src/state/busTopology.ts`.
- [x] Add both pins and their labels to `src/build/hardwareManifest.ts`.
- [x] Add a two-pin retarget plan in `src/state/pinRetarget.ts` so board changes preserve claims and assign valid replacements.
- [x] Add the fixture to the Hardware Pane fixture/render tables.
- [x] Update `src/state/__tests__/hardwareRegistries.test.ts` so a missed registration fails centrally.
- [x] Verify collisions against the main matrix, microphone/line-in, SD card, displays, controls, and the other VU side.
- [x] Verify unsupported or reserved pins are rejected for the selected board.
- [x] Add both strings to Build Diagram wiring instructions and the downloadable hardware manifest.
- [x] Include shared ground, logic-level guidance, data resistor guidance, and data-in direction in the wiring output.
- [x] Ensure board retargeting never assigns both strings the same pin.

### Phase 7 — Implement one shared visualization model

- [x] Create a small pure TypeScript model for level conditioning, peak state, mode cycling, and per-LED color output.
- [x] Create the matching C++ emitter/helper with the same state variables, timing, clamps, palette sampling, and seeded mode order.
- [x] Keep per-instance state namespaced so two fixtures cannot share peaks, trails, or cycle state.
- [x] Reset state on evaluator reset, source change, fixture disable, and relevant geometry changes.
- [x] Make every mode deterministic at a supplied time/audio sequence.
- [x] Implement Classic Ladder.
- [x] Implement Palette Fill.
- [x] Implement Solid Channel.
- [x] Implement Segmented Blocks.
- [x] Implement Peak Cap.
- [x] Implement Falling Comet.
- [x] Implement Center Burst.
- [x] Implement Frame-Inward.
- [x] Implement Dot Runner.
- [x] Implement History Trail.
- [x] Implement Stereo Balance.
- [x] Implement Beat Spark.
- [x] Implement Manual, Timed cycle, Beat cycle, and seeded Shuffle policies.
- [ ] Add golden-vector tests that compare TypeScript and emitted C++ expectations for representative timestamps.
- [x] Add edge-case tests for 1, 2, odd, and even LED counts.

### Phase 8 — Integrate browser preview and Stage Mode

- [x] Evaluate `StereoVuMeter` as a hot sink every animation tick, not only on low-rate published frames.
- [x] Store left/right rendered rails without mutating shared frames or other output buffers.
- [x] Show the two rails vertically beside the selected target matrix in the main preview.
- [x] Preserve the existing multi-output Route selector and only flank the configured target.
- [x] Show the rails in Stage Mode and full-screen preview.
- [x] Respect left/right physical data direction in the standalone preview; the combined view deliberately uses logical bottom-to-top pixels.
- [x] Keep visual Left on screen-left even when channel swap is enabled; channel labels explain the swapped source.
- [x] Scale long strings without making the matrix preview unusably small.
- [x] Show a clear inactive/no-audio state rather than fabricated motion.
- [x] Add UI tests for target selection and vertical layout; renderer coverage proves mono mirroring, stereo separation, and inactive audio.
- [x] Profile preview cost with History Trail and two long strings at 60 fps.

### Phase 9 — Integrate normal sketch generation

- [x] Discover only reachable, Audio-wired `StereoVuMeter` sinks during code generation.
- [x] Emit two independent CRGB arrays with stable, collision-free symbol names.
- [x] Register both strings with FastLED using their own data pins and shared chipset/color order settings.
- [x] Update stereo levels once per loop before rendering the VU fixture.
- [x] Render both rails after audio update and before the one synchronized final show call.
- [x] Keep the main LED output's buffer, route geometry, blackout, and brightness behavior unchanged.
- [x] Decide how global/master brightness combines with the fixture brightness and document the order.
- [x] Ensure an inactive/unresolved Audio source emits black rails or a validation error, never stale pixels.
- [x] Add normal-generator snapshots for each visualization and both physical directions.
- [x] Compile representative generated sketches for the reference ESP32-S3 target.

### Phase 10 — Integrate generative-show and Music Player generators

- [x] Teach `src/codegen/showGenerator.ts` to discover and emit the root-owned fixture in a generative show.
- [x] Teach `src/codegen/playerSketchGenerator.ts` to emit it in the SD Music Player template.
- [x] Reuse one renderer/helper contract rather than copying visualization logic into each template.
- [x] Ensure each generator declares every helper, type, include, global, setup call, and loop call it references.
- [x] Confirm a show transition changes the matrix pattern without resetting VU peaks or trails.
- [x] Confirm player track changes reset only audio-source state that genuinely must reset.
- [x] Confirm LED power/brightness controls affect the main output and side meters consistently.
- [x] Add emitted-symbol and emitted-include coverage for the new helpers.
- [x] Add generator tests for microphone, PCM1802, live decoder tap, baked fallback, and no-audio cases.
- [x] Compile at least one sketch from each generator path on the reference board.

### Phase 11 — Validation, capacity, electrical safety, and diagnostics

- [x] Reject missing, duplicate, invalid, input-only, reserved, or bus-conflicting data pins.
- [x] Warn when the fixture has no Audio connection or its selected provider is unavailable.
- [x] Warn when the target output was deleted or is no longer a matrix/panel.
- [x] Reject unsupported clocked chipsets in the first release rather than silently mis-driving them.
- [x] Add both strings to physical LED count, RAM, power, and frame-time estimates.
- [x] Calculate worst-case current for both strings together and include the configured brightness/current cap.
- [x] Warn that the controller's USB/3.3 V pin must not power the LED strings.
- [x] Require a common ground between controller, audio ADC, LED supply, and both strings.
- [x] Surface power injection guidance based on total LED count and physical length.
- [x] Extend the Wiring Test sketch so Left and Right can be identified independently and direction can be verified.
- [x] Make Wiring Test use conservative brightness and clearly distinguish L from R.
- [x] Define Live Stream receiver behavior; first release keeps rails off with an explicit capability note because the receiver has no audio engine.
- [x] Add Graph Health messages with actionable hardware/connection names.

### Phase 12 — Documentation and discoverability

- [x] Add the fixture to the README module list and update the asserted module count.
- [x] Add a Node Reference/help entry describing the Audio connection and mono fallback.
- [x] Add a live example or quick recipe that creates Audio → Stereo VU Meter beside a matrix.
- [x] Document PCM1802 true-stereo wiring and warn against bridge-tied speaker outputs.
- [x] Document INMP441 mono mirroring so users do not diagnose identical sides as a fault.
- [x] Document every visualization and its best-use description; image capture remains a release-art task.
- [x] Document data-in direction, channel swap, target matrix selection, and current limiting.
- [x] Add the user guide and link it from `docs/NAVIGATOR.md`.
- [x] Add supported/experimental evidence to `docs/release/beta-support-matrix.md` only after bench verification.
- [ ] Add a changelog entry when the feature actually ships.

### Phase 13 — Verification sequence

- [x] Run the focused stereo-level and visualization unit tests.
- [x] Run graph evaluator, node library, hardware registry, pin collision, retarget, manifest, and validation tests.
- [x] Run normal, generative-show, Music Player, Wiring Test, emitted-symbol, and emitted-include generator tests.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Compile generated normal, generative-show, and Music Player sketches for the reference ESP32-S3 board.
- [x] Bench-test silence: both rails fade fully black with no stale peak.
- [x] Bench-test left-only input: only the left rail responds.
- [x] Bench-test right-only input: only the right rail responds.
- [x] Bench-test equal mono input: both rails match within tolerance.
- [x] Bench-test channel swap and each side's Top/Bottom data-in setting.
- [x] Bench-test all twelve modes manually.
- [x] Bench-test Timed cycle, Beat cycle, and seeded Shuffle for at least 15 minutes.
- [x] Bench-test rapid transients, sustained loud audio, clipping, unplug/replug, and source restart.
- [x] Bench-test with the main matrix at the same time and look for flicker, dropped audio, or timing drift.
- [x] Bench-test maximum intended LED count under the configured power cap while measuring supply voltage and temperature.
- [x] Record board, browser, firmware toolchain, pins, LED lengths, power supply, and pass/fail evidence.

## Bench record — 2026-09-02

The first completed physical run. Recorded here because the plan requires it and
because a support promise cannot be derived from compile or browser evidence.

### Rig

| | |
|---|---|
| Controller | ESP32-S3 |
| Audio source | SD card + MAX98357A, metered through the decoder tap (no PCM1802 on this rig) |
| Playback volume | 18 of 21 (the default), and 21 during diagnosis |
| Rails | WS2812B, GRB, 32 LEDs per side |
| Data pins | Left GPIO 42, right GPIO 2 |
| Data-in | Bottom on both sides |
| Main output | 16x16 WS2812B matrix, 256 LEDs |
| Supply | 5 V 5 A, cap set to 3000 mA |
| Test material | The ten generated tracks in `tmp/vu-bench/`, plus real music |
| Host | Windows 11 Home (build 10.0.26200), Chrome 152.0.7977.64 |
| Build engine | `fbuild` 2.5.21 |

### Results

| Test | Result |
|---|---|
| Wiring Test | Left red, right blue, chase from the DIN end, 32 lit, GRB correct |
| Silence | Both rails fully black, no stale peak |
| Left-only / right-only | 21 of 32 on the driven rail, silent rail black |
| Equal stereo / mono file | Both rails 21 of 32, matching |
| Level staircase | 7 / 13 / 21 / 27 / 32, matching the predicted 22 / 42 / 65 / 84 / 100 % |
| Transients | Snap attack, ~280 ms release, peak held then falling smoothly |
| Clipping | Both rails pegged at 32, steady, no wrap |
| All twelve modes | Correct, and no apparent level jump at a mode change |
| Timed cycle / Beat cycle / Shuffle | All three correct; Shuffle repeats its order across a power cycle |
| 15-minute soak | No freeze, no stall, no drift, matrix rendering throughout |
| Concurrency | No flicker on matrix or rails, no audio stutter |
| Interruption | Track skip keeps peaks and mode position; card pull goes black, not frozen |
| Channel swap | Rails swap, preview labels change, preview positions do not |
| Direction flip | Chase runs backwards when the setting contradicts the hardware |
| Power at cap | 2.90-2.92 A measured against a 3000 mA cap - the FastLED model within ~3% |
| Voltage at the far end | 4.82 V, a 0.18 V drop, no injection needed at this length |
| Thermal | Barely warm after ten minutes |

### What the run changed

Two defects were found by this bench that no compile or browser test had:

1. The player's decoder tap published raw RMS while every other producer applied
   the shared gate and reference, so the rails read roughly four times low.
   Fixed in `c43113f3`.
2. What remained was a further constant 0.75, traced to ESP32-audioI2S
   attenuating decoded PCM by `volumetable[vol] / 64` before the tap runs. The
   rails followed the volume knob while a microphone or line input on the same
   fixture did not. Fixed in `173dcc3d`; the staircase then read true at the
   default volume.

A third, unrelated: the power-cap field clamped on every keystroke, so a 3000 mA
cap could not be typed. Fixed in `48498cc9`.

### Still open

This run is a full support row in
[the beta support matrix](../../release/beta-support-matrix.md).

The cross-language golden-vector harness in Phase 7 remains open; it is a parity
test, not a bench item. The changelog entry waits for the feature to ship.

## Acceptance criteria

- [x] A user can add one paired Stereo VU Meter fixture from Hardware and configure both strings in one place.
- [x] The fixture is visibly and explicitly connected to the same Audio source used by the sketch.
- [x] True-stereo sources produce independent left and right motion.
- [x] Mono sources intentionally mirror to both sides.
- [x] The existing mono FFT, beat, percussion, and audio-feature behavior does not regress.
- [x] Both rails preview vertically beside the selected matrix and use the shared renderer output consumed by generated firmware.
- [x] At least twelve selectable visualizations ship, plus Manual, Timed cycle, Beat cycle, and seeded Shuffle policies.
- [x] Animation ballistics are elapsed-time based and remain consistent across frame rates.
- [x] Normal sketches, generative shows, and Music Player sketches all support the fixture.
- [x] Both strings refresh in synchronization with the main addressable LED output.
- [x] GPIO collision, board capability, RAM, LED count, and power validation include both strings.
- [x] Wiring Test identifies Left and Right and verifies physical direction.
- [x] Old Audio payloads and old baked mono envelopes continue to work by mirroring.
- [x] Lint, tests, production build, generated-sketch compiles, and the full bench matrix pass.

## Explicit non-goals for the first release

- Driving the side strings as extra columns of the matrix frame.
- Replacing the existing mono FFT/beat pipeline with stereo FFT processing.
- Independent left/right bass, mids, treble, or spectra.
- More than one paired VU fixture per project unless resource and naming tests explicitly prove it safe.
- Unequal left/right string lengths.
- Clocked/SPI LED string support.
- Audio-reactive side rails in the Adalight Live Stream receiver without a separate protocol/audio design.
- Inferring activation from the mere presence of an audio-category node.

## Main implementation risks

1. **Accidental audio regression.** Stereo capture must be parallel to the established mono analyzer, not a rewrite of it.
2. **Player underruns.** Decoder metering must be lightweight and must not delay `audio.loop()` or I2S DMA.
3. **Preview/firmware drift.** Ballistics and mode state need fixed time-based test vectors, not visual guesswork.
4. **Generator omissions.** Normal, generative-show, and Music Player paths have different templates and all must declare and call the shared fixture helpers.
5. **Power underestimation.** Two frame-height strings can add substantial current even when the matrix itself is capped.
6. **Wrong physical direction.** Each side needs its own data-in position and a wiring test that makes direction obvious.
7. **Hidden stereo loss.** Browser devices, INMP441, mono files, and legacy envelopes must report/mirror mono clearly; they must not be labelled true stereo.
8. **Concurrent repository work.** Implementation should begin only after current work is reconciled, then proceed in small focused commits that avoid unrelated files.

## Suggested implementation slices

- [x] **Slice A:** Stereo level contract, browser levels, PCM1802 levels, mono fallback, and unit tests.
- [x] **Slice B:** Fixture registration, Hardware UI, pins/manifests/retargeting, and validation.
- [x] **Slice C:** Shared renderer plus all twelve preview modes and golden vectors.
- [x] **Slice D:** Normal sketch code generation and generated-sketch compile proof.
- [x] **Slice E:** Combined matrix/Stage preview and Wiring Test support.
- [x] **Slice F:** Generative-show and Music Player live decoder integration.
- [x] **Slice G:** Versioned baked-stereo fallback, legacy compatibility, and documentation are complete; full physical bench evidence remains required.

Each slice should finish with focused tests and a working vertical path before the next slice begins. Do not land a property or UI choice until its evaluator, generator, validation, persistence, and test behavior are all defined.
