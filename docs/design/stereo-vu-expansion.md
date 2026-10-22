# Stereo VU Meter expansion

Design record for the five expansions root todo D-04 lists beyond the
[current contract](../user/stereo-vu-meter.md): clocked strings, unequal rail
lengths, several fixtures on one board, a stereo FFT, and streamed audio.
Each has its own protocol and resource design here; the decision column says
what ships in v1 and what waits, and why. Written 2026-10-22.

The contract this builds on: one `StereoVuMeter` fixture per board, two
clockless rails of equal `ledCount`, each on its own data pin, driven from the
one mono analyser's stereo short-window RMS levels (`stereoLevels.ts`), with
the fixture's ballistics, policy and twelve visualizations rendered by the
same code in the preview (`stereoVuMeter.ts`) and the sketch
(`stereoVuMeterCpp.ts`). The Live Stream receiver has no audio engine, so the
rails stay off there. A baked show carries left and right level bytes per
frame in the `AENV` trailer.

## Summary

| Expansion | Protocol and resources | Decision |
|---|---|---|
| Clocked strings | Two clock pins, `fastledSetupCpp` clock macro, SPI chipset options | **v1.** Pure fixture plumbing; the same path every LED output already has |
| Unequal lengths | `leftLedCount` and `rightLedCount`; per-rail history and loops | **v1.** Each rail renders at its own resolution from its own level |
| Several fixtures | Drop the catalogue singleton; everything else is already per fixture | **v1.** Pins and power are checked per rail today |
| Stereo FFT | A second 512-point FFT per chunk on the device; `AENV` spectrum block with a channel count; a `channel` property on the spectrum readers | **After v1.** No node reads a per-channel spectrum, and the VU modes read levels only |
| Streamed audio | Two level bytes appended to each Adalight frame; the receiver renders the rails itself | **After v1.** The receiver is pixel-only by design; nobody has asked for rails over a stream |

## Clocked strings

APA102, APA102HD, HD108 and WS2801 rails each need a clock line beside the
data line. The LED output already carries this (`clockPin`, `SPI_CHIPSETS`,
`fastledSetupCpp`'s `clockPinMacro`), so the fixture gains the same:

- Properties `leftClockPin` and `rightClockPin`. They are read only when the
  chipset is in `SPI_CHIPSETS`; a clockless chipset leaves them unused and
  the manifest does not reserve them.
- The chipset picker offers `ADDRESSABLE_CHIPSET_OPTIONS` rather than the
  clockless subset. Validation and Graph Health require both clock pins to be
  usable GPIOs when the chipset is clocked, and stop refusing clocked
  chipsets outright.
- The catalogue, manifest, pin retargeting and bus topology list the two clock
  pins as LED-exclusive uses, conditional on the chipset, the way the Info
  Display reserves only the wires its module has.
- Codegen emits `VU_LEFT_CLOCK_PIN_<id>` and `VU_RIGHT_CLOCK_PIN_<id>` and
  passes `clockPinMacro` to `fastledSetupCpp` for each rail, in the normal
  sketch, the show sketch and the player. Each rail is its own hardware or
  bit-banged SPI controller, so two clocked rails need four pins, and the bus
  model treats each pair as exclusive, as it does for a clocked LED output.
- Power: a clocked 5 V rail draws like a clockless one. The Build Diagram's
  one-wire chipset set widens to the clocked chipsets for the fixture rows,
  with the clock wire drawn beside data.

Resources: two GPIOs more per fixture. No RAM change.

## Unequal rail lengths

A left rail of 40 and a right rail of 32 is a real build (a mirrored pair
around a doorway rarely has symmetric runs). The rule: **each rail renders at
its own resolution from its own level.** Nothing maps one rail's pixels onto
the other's.

- `ledCount` becomes `leftLedCount` and `rightLedCount`. `Hardware` removes
  the superseded shape rather than migrating it, per the branch rule.
- `StereoVuSettings` carries both; `blankStereoVuState` sizes each history
  from its own rail; `renderStereoVu` loops each rail with its own `n`. The
  modes that read both levels on one rail (Stereo Balance, Center Burst)
  still do, at that rail's resolution.
- `StereoVuConfig` gains `leftCount` and `rightCount`; `_vuReset` and the
  history shifts run per rail; the pixel loop runs twice. The golden vectors
  keep their equal-length fixture, so parity is proved unchanged, and one new
  golden step covers an unequal pair.
- RAM, power, the LED-output count for the output scheduler, the manifest's
  per-rail items and the node body's rail preview all read the rail's own
  count.

Resources: none beyond the rails' own pixels and history.

## Several fixtures on one board

The catalogue marks the fixture a singleton. Everything downstream is already
per fixture: validation runs per node, pins collide per rail through the bus
model, RAM and power sum over the fixtures, codegen keys state, config and
controllers by the fixture id, and the player and show sketches iterate
`stereoVuEmitsFromGraph`. Lifting the singleton is the whole change. All
fixtures on a board read the same stereo levels, because the board has one
audio source; a second pair is a second place to show the same music.

Resources per extra fixture: two rails of pixels and history (8 bytes per
LED), 48 bytes of state, two or four GPIOs, and one more output in the LED
output scheduler.

## Stereo FFT (after v1)

The device runs one FastLED processor over the mono mix. A per-channel
spectrum means a second `Processor` (or a second FFT pass) over each channel's
conditioned chunk: on an ESP32-S3 that is another 512-point FFT per 11.6 ms
chunk, about 1.5 ms, and another 2 KB of bins. The baked path would carry two
16-byte equalizer frames instead of one, 32 bytes per envelope frame, and the
`AENV` spectrum block would state its channel count the way the level block
does. The preview's decoder tap already has both channels before the mono mix.

What would read it: `FFTAnalyzer`, `SpectrumVisualizer` and the Beat detector
could take a `channel` property (`Mix`, `Left`, `Right`). No VU visualization
reads a spectrum, so the fixture itself gains nothing. Until a node wants a
per-channel spectrum, this is cost with no consumer, so it waits.

## Streamed audio (after v1)

The Adalight Live Stream receiver accepts pixels only. Rails over a stream
would mean the host (the browser, which already has the stereo levels) sending
them with every frame, and the receiver rendering the rails with the same
`_stereoVuRender` helper the player uses. Protocol: two bytes after the pixel
payload of each Adalight frame, left and right level in 0–255, with a header
flag so a receiver built without rails ignores them and a plain Adalight
receiver never sees them. Resources: the fixture's rails and state on the
receiver, 2 bytes per frame on the wire, no audio engine.

The receiver is pixel-only on purpose: it is the smallest sketch the app
makes, and the Upload panel says the rails stay off. No one has asked for
rails over a stream. Record it here and build it when someone does.
