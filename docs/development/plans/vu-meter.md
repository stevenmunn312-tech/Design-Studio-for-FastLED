# Stereo Side-String VU Meters — Implementation Plan

## Goal

Add a paired stereo VU-meter fixture to Design Studio for FastLED: one vertical addressable LED string on the left side of a matrix frame and one on the right. When the fixture has a valid Audio connection, the left string follows the left audio channel and the right string follows the right channel. Mono sources intentionally drive both sides equally.

The feature must work in browser preview and generated firmware, provide at least ten genuinely different visualizations, coexist with the main LED output, and remain off when its Audio input is missing or inactive.

This document is the implementation plan and progress ledger. Slice A, Slice B, and Slice C are complete; later firmware, combined-preview, player, and baked-stereo work remains tracked below.

## Recommended product shape

Use one new hardware-owned root-graph sink, provisionally named **Stereo VU Meter** (`StereoVuMeter`). It represents the pair of physical LED strings as one fixture and owns both data pins.

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

- [ ] Record the reference controller, PCM1802 module, LED chipset, color order, LEDs per side, data voltage, and power supply.
- [ ] Record whether each physical string's data-in is at the top or bottom.
- [ ] Decide whether the first release supports only WS2812-class clockless strings or a precisely listed clockless chipset subset.
- [ ] Confirm that both sides use the same LED count for version one.
- [ ] Confirm **Stereo VU Meter** as the user-facing name and `StereoVuMeter` as the internal node type.
- [ ] Confirm that the fixture uses an explicit Audio wire and is not enabled by an ambient category scan.
- [ ] Confirm that Add Hardware may auto-wire only when exactly one Audio source node makes the choice unambiguous.
- [ ] Confirm silence behavior: fade both strings to black rather than retaining stale levels.
- [ ] Define behavior when no target matrix exists: allow standalone node preview, but require a target only for combined frame preview.
- [ ] Add the final design note to the repository documentation before implementation and link it from `docs/NAVIGATOR.md`.

### Phase 1 — Specify stereo level semantics

- [ ] Define the normalized level range and exact RMS/peak measurement window.
- [ ] Define the noise gate, gain, response curve, attack, release, peak hold, and peak fall equations.
- [ ] Define the time source and reset behavior used by both browser and firmware.
- [ ] Define mono fallback once: if left/right are absent, derive one level and mirror it.
- [ ] Define silence/inactive behavior and the time required to reach black.
- [ ] Decide whether clipping is exposed as a runtime flag for red tip indication and diagnostics.
- [ ] Define how invalid values, NaN, and out-of-range levels are clamped.
- [ ] Create fixed waveform fixtures for silence, steady tones, impulses, left-only, right-only, equal stereo, and clipping.
- [ ] Document acceptable preview/firmware tolerance against those fixtures.

### Phase 2 — Extend browser and shared audio state without breaking mono analysis

- [ ] Extend `src/audio/audioEngine.ts` audio data with optional left/right level and channel metadata.
- [ ] Preserve the current FastLED-style mono analyzer as the sole source of bass, mids, treble, spectrum, beat, and BPM.
- [ ] Split browser input into left/right time-domain streams when the device supplies two channels.
- [ ] Mirror channel zero when the browser supplies only one channel.
- [ ] Avoid running two unnecessary full FFT analyzers; calculate the stereo VU envelope with the smaller dedicated level path.
- [ ] Update `src/state/audioStore.ts` defaults, start/stop behavior, and subscriptions.
- [ ] Extend `AudioSignal` and `AudioOverride` in `src/state/graphEvaluator.ts` with backward-compatible optional stereo fields.
- [ ] Add a shared resolver that returns safe left/right levels for new and legacy audio payloads.
- [ ] Update recording, playback override, pattern-rating, show-preview, and test fixtures that construct Audio payloads.
- [ ] Confirm microphone permission denial leaves the fixture black and does not destabilize preview.
- [ ] Add tests for actual stereo, mono mirroring, inactive audio, clipping, and start/stop reset.

### Phase 3 — Preserve stereo in firmware capture paths

- [ ] Add `_audioLeftLevel` and `_audioRightLevel` (or an equivalent small contract) beside the existing mono `_audio*` globals.
- [ ] Keep the existing PCM1802 mono downmix feeding the FastLED Processor so current audio-reactive patterns do not change.
- [ ] Calculate PCM1802 left/right levels from the raw interleaved samples before downmixing.
- [ ] Make the PCM1802 capture adapter expose the newest channel levels safely to the main loop.
- [ ] Mirror the selected INMP441 channel into both VU levels.
- [ ] Preserve channel choice for mono pattern analysis; do not reinterpret the existing Line In “Both/Left/Right” property silently.
- [ ] Decide and document VU behavior when Line In is configured to Left or Right only; recommended behavior is to mirror the selected channel.
- [ ] Add firmware-generation tests proving left-only and right-only PCM samples remain distinct for the VU path.
- [ ] Add serial diagnostics for left/right meter levels behind the existing debug option.
- [ ] Verify no duplicate I2S driver or second full FFT pipeline is emitted.

### Phase 4 — Preserve stereo in Music Player and baked-show paths

- [ ] Extend the decoded-PCM tap in `src/codegen/playerSketchGenerator.ts` to measure left and right before its current mono mix.
- [ ] Mirror mono decoded files to both VU levels.
- [ ] Keep decoder playback/DMA work higher priority than metering and pattern rendering.
- [ ] Retain the existing mono FastLED Processor feed for FFT/beat/features.
- [ ] Extend song decoding/analysis so a baked fallback can retain left/right level envelopes.
- [ ] Version the show-file audio trailer rather than changing the existing three-byte frame layout in place.
- [ ] Make the player accept legacy mono envelopes and mirror them.
- [ ] Update `src/types/showFile.ts`, `src/codegen/performanceGenerator.ts`, `src/state/showAudio.ts`, and the upload/player loaders together.
- [ ] Add tests for stereo decoder PCM, mono decoder PCM, stereo baked fallback, and legacy baked fallback.
- [ ] Confirm a decoder startup failure can fall back to the baked stereo envelope without a visible discontinuity.

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
- [ ] Add focused tests for creation, root ownership, auto-wiring, deletion behavior, defaults, and property editing.

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
- [ ] Create the matching C++ emitter/helper with the same state variables, timing, clamps, palette sampling, and seeded mode order.
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
- [ ] Profile preview cost with History Trail and two long strings at 60 fps.

### Phase 9 — Integrate normal sketch generation

- [ ] Discover only reachable, Audio-wired `StereoVuMeter` sinks during code generation.
- [ ] Emit two independent CRGB arrays with stable, collision-free symbol names.
- [ ] Register both strings with FastLED using their own data pins and shared chipset/color order settings.
- [ ] Update stereo levels once per loop before rendering the VU fixture.
- [ ] Render both rails after audio update and before the one synchronized final show call.
- [ ] Keep the main LED output's buffer, route geometry, blackout, and brightness behavior unchanged.
- [ ] Decide how global/master brightness combines with the fixture brightness and document the order.
- [ ] Ensure an inactive/unresolved Audio source emits black rails or a validation error, never stale pixels.
- [ ] Add normal-generator snapshots for each visualization and both physical directions.
- [ ] Compile representative generated sketches for the reference ESP32-S3 target.

### Phase 10 — Integrate generative-show and Music Player generators

- [ ] Teach `src/codegen/showGenerator.ts` to discover and emit the root-owned fixture in a generative show.
- [ ] Teach `src/codegen/playerSketchGenerator.ts` to emit it in the SD Music Player template.
- [ ] Reuse one renderer/helper contract rather than copying visualization logic into each template.
- [ ] Ensure each generator declares every helper, type, include, global, setup call, and loop call it references.
- [ ] Confirm a show transition changes the matrix pattern without resetting VU peaks or trails.
- [ ] Confirm player track changes reset only audio-source state that genuinely must reset.
- [ ] Confirm LED power/brightness controls affect the main output and side meters consistently.
- [ ] Add emitted-symbol and emitted-include coverage for the new helpers.
- [ ] Add generator tests for microphone, PCM1802, live decoder tap, baked fallback, and no-audio cases.
- [ ] Compile at least one sketch from each generator path on the reference board.

### Phase 11 — Validation, capacity, electrical safety, and diagnostics

- [ ] Reject missing, duplicate, invalid, input-only, reserved, or bus-conflicting data pins.
- [ ] Warn when the fixture has no Audio connection or its selected provider is unavailable.
- [ ] Warn when the target output was deleted or is no longer a matrix/panel.
- [ ] Reject unsupported clocked chipsets in the first release rather than silently mis-driving them.
- [ ] Add both strings to physical LED count, RAM, power, and frame-time estimates.
- [ ] Calculate worst-case current for both strings together and include the configured brightness/current cap.
- [ ] Warn that the controller's USB/3.3 V pin must not power the LED strings.
- [ ] Require a common ground between controller, audio ADC, LED supply, and both strings.
- [ ] Surface power injection guidance based on total LED count and physical length.
- [x] Extend the Wiring Test sketch so Left and Right can be identified independently and direction can be verified.
- [x] Make Wiring Test use conservative brightness and clearly distinguish L from R.
- [ ] Define Live Stream receiver behavior; recommended first release is rails off with an explicit capability note because the receiver has no audio engine.
- [ ] Add Graph Health messages with actionable hardware/connection names.

### Phase 12 — Documentation and discoverability

- [ ] Add the fixture to the README module list and update the asserted module count.
- [ ] Add a Node Reference/help entry describing the Audio connection and mono fallback.
- [ ] Add a live example or quick recipe that creates Audio → Stereo VU Meter beside a matrix.
- [ ] Document PCM1802 true-stereo wiring and warn against bridge-tied speaker outputs.
- [ ] Document INMP441 mono mirroring so users do not diagnose identical sides as a fault.
- [ ] Document every visualization with a small preview and its best-use description.
- [ ] Document data-in direction, channel swap, target matrix selection, and current limiting.
- [ ] Update the current architecture/design note and `docs/NAVIGATOR.md`.
- [ ] Add supported/experimental evidence to `docs/release/beta-support-matrix.md` only after bench verification.
- [ ] Add a changelog entry when the feature actually ships.

### Phase 13 — Verification sequence

- [ ] Run the focused stereo-level and visualization unit tests.
- [ ] Run graph evaluator, node library, hardware registry, pin collision, retarget, manifest, and validation tests.
- [ ] Run normal, generative-show, Music Player, Wiring Test, emitted-symbol, and emitted-include generator tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [x] Run `npm run build`.
- [ ] Compile generated normal, generative-show, and Music Player sketches for the reference ESP32-S3 board.
- [ ] Bench-test silence: both rails fade fully black with no stale peak.
- [ ] Bench-test left-only input: only the left rail responds.
- [ ] Bench-test right-only input: only the right rail responds.
- [ ] Bench-test equal mono input: both rails match within tolerance.
- [ ] Bench-test channel swap and each side's Top/Bottom data-in setting.
- [ ] Bench-test all twelve modes manually.
- [ ] Bench-test Timed cycle, Beat cycle, and seeded Shuffle for at least 15 minutes.
- [ ] Bench-test rapid transients, sustained loud audio, clipping, unplug/replug, and source restart.
- [ ] Bench-test with the main matrix at the same time and look for flicker, dropped audio, or timing drift.
- [ ] Bench-test maximum intended LED count under the configured power cap while measuring supply voltage and temperature.
- [ ] Record board, browser, firmware toolchain, pins, LED lengths, power supply, and pass/fail evidence.

## Acceptance criteria

- [ ] A user can add one paired Stereo VU Meter fixture from Hardware and configure both strings in one place.
- [ ] The fixture is visibly and explicitly connected to the same Audio source used by the sketch.
- [ ] True-stereo sources produce independent left and right motion.
- [ ] Mono sources intentionally mirror to both sides.
- [ ] The existing mono FFT, beat, percussion, and audio-feature behavior does not regress.
- [x] Both rails preview vertically beside the selected matrix and use the shared renderer output consumed by generated firmware.
- [ ] At least twelve selectable visualizations ship, plus Manual, Timed cycle, Beat cycle, and seeded Shuffle policies.
- [ ] Animation ballistics are elapsed-time based and remain consistent across frame rates.
- [ ] Normal sketches, generative shows, and Music Player sketches all support the fixture.
- [ ] Both strings refresh in synchronization with the main addressable LED output.
- [ ] GPIO collision, board capability, RAM, LED count, and power validation include both strings.
- [x] Wiring Test identifies Left and Right and verifies physical direction.
- [ ] Old Audio payloads and old baked mono envelopes continue to work by mirroring.
- [ ] Lint, tests, production build, generated-sketch compiles, and the full bench matrix pass.

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
- [ ] **Slice D:** Normal sketch code generation and generated-sketch compile proof.
- [x] **Slice E:** Combined matrix/Stage preview and Wiring Test support.
- [ ] **Slice F:** Generative-show and Music Player live decoder integration.
- [ ] **Slice G:** Versioned baked-stereo fallback, legacy compatibility, documentation, and full bench evidence.

Each slice should finish with focused tests and a working vertical path before the next slice begins. Do not land a property or UI choice until its evaluator, generator, validation, persistence, and test behavior are all defined.
