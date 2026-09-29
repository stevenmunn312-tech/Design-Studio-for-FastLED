# Audio detectors from FastLED's processor

Status: complete for the planned nodes; Vibe, Song Structure, Pitch Detect and Waveform implemented · Owner: app · Date: 2026-09-29

## Purpose

The generated firmware already hosts one `fl::audio::Processor`. Phase 8 of the
[pattern node expansion](../plans/pattern-node-expansion.md) exposes more of
its detectors as nodes. A detector is four small things: a global the engine
sketch publishes, a browser mirror in `src/audio/fastledReactive.ts`, an
optional field on `AudioSignal`, and a node that reads it. This note records
what each shipped port mirrors and the choices that differ from the C++.

## Vibe

`Vibe` (category `audio`) exposes FastLED's `detector::Vibe`, itself Ryan
Geiss's MilkDrop v2.25c `DoCustomSoundAnalysis`.

### Node contract

- Input `audio`, property input `gain` (0.25–4, default 1, clamped like the
  other analysis nodes).
- Outputs `bass`, `mid`, `treble`, `volume` (the mean of the three), the
  smoothed copies `bassAtt`, `midAtt`, `trebleAtt`, and the bools `bassSpike`,
  `midSpike`, `trebleSpike`.
- Levels are relative: about 1.0 at the song's running average and unbounded
  above. They are therefore not in `NORMALIZED_OUTPUTS`, and Graph Health asks
  for a Map Range before a 0–1 input. `gain` scales levels and smoothed
  copies. Spikes compare the two, so `gain` never changes them.
- An unwired node, a source with no live analysis, and a payload with no
  `vibe` field (baked shows and recordings from before the detector) all read
  as inactive: every level 0 and every spike false.

### Algorithm

Both sides run the same arithmetic per frame:

1. Three linear bands over 20–11025 Hz (`Context::getBandEnergy`).
2. Short average: `avg = avg·rate + imm·(1 − rate)`, attack rate 0.2 when
   rising and decay rate 0.5 when falling. Long average: the same update
   with rate 0.992 on `avg`.
3. Rates are tuned at 30 fps and converted with
   `(rate^30)^(1/fps)`, so behaviour is the same at any frame rate.
4. `relative = value / longAvg`, pinned to 1.0 while `longAvg < 0.001`. The
   first frame initialises both averages directly, so there is no startup
   spike.
5. A silence envelope (tau 0.3 s, target 0) passes the levels through while
   audio plays and fades them to zero when it stops, instead of sticking at
   1.0.
6. `spike = immediate > smoothed`.

### Browser mirror differences

- `VibeDetector` in `src/audio/fastledReactive.ts` reads the same FFT
  magnitudes the other detectors use. The C++ reads FastLED's own 3-bin
  linear transform, so absolute band energy differs slightly. The long-average
  division cancels scale, which is the reason the levels stay comparable.
- The frame interval is the wall-clock time between analysed frames, as for
  the other detectors here. The C++ derives it from the audio chunk length.
- `Context::isSilent` is stood in for by the signal conditioner: a buffer the
  noise gate zeroed completely is silent.

### Firmware

`audioEngineForGraph` takes the group registry and registers the detector only
when a `Vibe` node exists in the graph or a group, because each lazy detector
allocates. `setup()` touches `getVibeBass()`. Each frame publishes
`_audioVibeBass` … `_audioVibeTrebleSpike` from `getVibeBass()`,
`getVibeBassAtt()`, `isVibeBassSpike()` and the matching mid and treble
getters. `MIC_DEBUG` prints one extra line. The node's emitter reads those
globals only with a live FastLED source (`nativeFastLedAudio`); otherwise it
emits the inactive constants, exactly like the preview.

### Payload

`AudioSignal.vibe` is optional. `audioStore`, the decoder store and the
recorder carry it. The SD player supplies no processor, so a baked show reads
Vibe as inactive.

## Song Structure

`SongStructure` (category `audio`) exposes five FastLED detectors as one node:
`Downbeat`, `BuildupDetector`, `DropDetector`, `MoodAnalyzer` and the
`isStable()` verdict of `TempoAnalyzer`. The browser ports live in
`src/audio/fastledStructure.ts`, written from `fl/audio/detector/*.cpp.hpp`.

### Node contract

- Input `audio`, no properties: FastLED tunes every threshold inside the
  detectors, and exposing them would fork the firmware from the preview.
- Outputs `downbeat` and `drop` (bool, true for the frame they fire),
  `beatNumber` (1 to the detected beats per measure, so it can exceed 4 in
  3/4-to-8/8 material), `measurePhase` (0-1), `building` (bool),
  `buildupProgress` (0-1), `dropImpact` (0-1), `tempoStable` (bool),
  `valence` (-1..1) and `arousal` (0-1).
- `measurePhase`, `buildupProgress`, `dropImpact` and `arousal` are in
  `NORMALIZED_OUTPUTS`; `beatNumber` and `valence` are not.
- `buildupProgress` reads 0 while `building` is false. The C++ getter keeps
  the last progress after a buildup ends, so the node gates it on both sides.
  `dropImpact` keeps the last drop's impact, as `getDropImpact()` does.
- An unwired node, a source with no live analysis, and a payload with no
  `structure` field read as inactive: numbers 0, bools false.

### What each port mirrors

| Output | FastLED source | Thresholds and behaviour |
|---|---|---|
| `downbeat`, `beatNumber`, `measurePhase` | `Downbeat` on the shared `Beat` | Confidence 0.6, accent x1.2, 32-beat accent history, meter vote over 2, 3, 4, 6 and 8 with an 8-entry history. The first beat is always a downbeat; after that a downbeat is forced once `beatsPerMeasure - 1` beats have passed, so the counter is metronomic and accent only moves it early. |
| `building`, `buildupProgress` | `BuildupDetector` | Starts at intensity >= 0.6 with energy trend >= 0.3 over 8+ frames (Savitzky-Golay over 7); ends past 16 s, on a trend below -0.5, or intensity under 0.3. Intensity is 50% energy trend, 30% treble trend, 20% level. |
| `drop`, `dropImpact` | `DropDetector` | Impact >= 0.75, at least 2 s since the last drop, previous-frame energy flux >= 0.5 and bass flux >= 0.3 against EMA baselines (alpha 0.9). Impact is 40% energy flux, 35% bass flux, 15% spectral novelty, 10% level. |
| `valence`, `arousal` | `MoodAnalyzer` | Ten-frame mean of spectral centroid and rolloff (valence) and of level and zero-crossing rate (arousal). |
| `tempoStable` | `TempoAnalyzer` | Up to five onset-interval hypotheses in 60-180 BPM, median-filtered over 21; stable after 10 frames with a BPM standard deviation under 2. |

### Browser mirror differences

- FastLED reads `Context::getFFT(16)` and `getFFT(32)` (constant-Q, 90-14080
  Hz). The browser folds its linear FFT into the same log-spaced bins with
  `aggregateLogBins`, as the beat detector does. Absolute bin energy differs;
  every threshold that compares against a running baseline is unaffected.
- `Sample::rms()` is in int16 units, so the C++ `min(1, rms)` terms in buildup,
  drop and mood always saturate. They are kept as written, with the browser's
  RMS measured on the same conditioned int16 samples.
- The processor never enables `Context`'s FFT history, so
  `getHistoricalFFT(1)` returns null and mood's spectral flux is always 0. The
  port uses 0 for it rather than a flux the device would not compute.
- The shared `Beat` result and BPM come from `BeatDetector`, and the
  timestamp is the wall-clock time of the analysed frame.
- Tempo confidence and its 2 s silence envelope are not ported; only the
  stability verdict is exposed.

### Firmware

`audioEngineForGraph` registers the detectors only when a `SongStructure` node
exists in the graph or a group. `setup()` registers `onDownbeat` and `onDrop`
(each bumps a counter), `onBuildupStart` and `onBuildupEnd` (set and clear
`_audioBuilding`), `onTempoStable` and `onTempoUnstable`, and touches
`getMoodValence()`. Each frame `updateAudio()` publishes `getMeasurePhase()`,
`getCurrentBeatNumber()`, `getBuildupProgress()`, `getDropImpact()`,
`getMoodValence()` and `getMoodArousal()`, and turns the counters into the
one-frame `_audioDownbeat` and `_audioDrop` flags the way `_audioBeat` is.
The emitter reads those globals only with a live FastLED source and otherwise
emits the inactive constants.

### Payload

`AudioSignal.structure` is optional. The audio store, decoder store and
recorder carry it. The SD player supplies no processor, so a baked show reads
Song Structure as inactive.

## Pitch Detect

`PitchDetect` (category `audio`) exposes pitch, note and key. Pitch and note
are our own code running FastLED's arithmetic, because the stock detector
cannot work on a device; key is FastLED's `KeyDetector`. The browser side is
`src/audio/fastledPitch.ts`; the firmware twin is `src/codegen/pitchHelperCpp.ts`,
which imports its constants from the TypeScript so the two cannot drift.

### Why FastLED's `Pitch` is not used on the device

`detector::Pitch` needs at least `2 x (44100 / 80 Hz)` = 1102 samples per
chunk. FastLED's I2S input hands the processor 512 (`I2S_AUDIO_BUFFER_LEN` in
`fl/audio/input.h`, a hard `#define`), and `Processor::getPitchDetector()` is
private, so its range cannot be lowered. `getPitch()` therefore always reads 0
and `Note`, which is built on it, never fires. Key detection uses the FFT and
is unaffected. Worth raising upstream: a chunk of 1024 or a public
`setMinFrequency` would make the stock detector usable.

### Node contract

- Input `audio`, no properties.
- Outputs `hz`, `note` (MIDI 0-127, 0 when none), `noteOn` (bool, one frame at
  a note start or a change of a semitone or more), `velocity` (0-1),
  `confidence` (0-1), `keyRoot` (0 = C to 11 = B), `keyMinor` (bool) and
  `keyConfidence` (0-1).
- `velocity`, `confidence` and `keyConfidence` are in `NORMALIZED_OUTPUTS`.
- Key outputs are 0 or false until a key is accepted, and again after it ends.
- An unwired node, a source with no live analysis, and a payload with no
  `pitch` field read as inactive.

### What differs from FastLED's `Pitch`

- **Range 175-1000 Hz** (lags 44-252 at 44.1 kHz), the lowest period that fits
  two periods into 512 samples. Bass notes are out of range.
- **Confidence is normalised.** FastLED's is the raw autocorrelation peak
  (clamped to 1) with a 0.5 threshold, which a half-scale tone scores at about
  0.09 and so never voices. Here the peak is divided by the zero-lag power.
  Clarity weighting (0.7 + 0.3 x clarity) and the 0.5 voicing threshold are as
  in FastLED.
- **Octave guard.** FastLED takes the single highest peak, which flips between
  a period and its double. The port takes the smallest local peak within 90%
  of the highest.
- **No smoothing on `hz`.** It is `44100 / lag`, so it steps in whole lags
  (about 22 Hz at 1 kHz, 0.4 semitone). `getSmoothedPitch()`'s One Euro filter
  is not used; `note` rounds to the nearest semitone.
- In the browser the lag range is fixed at 44.1 kHz and the real sample rate
  only converts lag to Hz, so a 48 kHz context reads slightly sharp at the top
  of the range and a little differently at the bottom.

### `Note`

The state machine is FastLED's `Note` with its defaults: note-on at
confidence 0.6, note-off below 0.4 or unvoiced (held at least 50 ms), a change
event at one semitone. Velocity is FastLED's arithmetic, which saturates:
`Sample::rms()` is in int16 units, so the energy term is always 1 and velocity
is `(int(confidence x 126) + 1) / 127`.

### Key

`KeyDetector` folds `getFFT(32)`'s linear bins (32 bins across 90-14080 Hz,
437 Hz wide) into 12 pitch classes and correlates the 8-frame mean with the
Krumhansl-Schmuckler profiles; it accepts a key at confidence 0.65 and holds
it 2 s. Those bins are far wider than a semitone below a few kHz, so the key
is a coarse tonal-colour estimate, not a musician's reading. It is ported
literally, including that the confidence in `onKey` is the value at the moment
the key was accepted. Experimental until benched.

### Firmware

`audioEngineForGraph` includes the helper only when a `PitchDetect` node
exists in the graph or a group. Each frame `_audioPitchStep()` reads
`Processor::getSample()`, skips a chunk it has already seen (by timestamp),
and runs the autocorrelation (about 60,000 multiply-adds over 209 lags) and
the note machine. `setup()` registers `onKey` and `onKeyEnd`, which store root,
mode and confidence. The emitter reads those globals only with a live FastLED
source and otherwise emits the inactive constants. Static RAM is about 3 KB
for the sample and autocorrelation buffers.

### Payload

`AudioSignal.pitch` is optional. The audio store, decoder store and recorder
carry it. The SD player has no processor, so a baked show reads Pitch Detect as
inactive.

## Waveform

`Waveform` (category `pattern`, subcategory Audio-Reactive) draws the raw
sound as a trace over a base frame. Unlike the other detectors it needs no
FastLED analysis, only the samples. The drawing is
`src/state/evaluator/waveform.ts` in the preview and a line-for-line emitter in
`src/nodes/audioReactive/codegen.ts` on the device; both read their constants
from that module.

### Node contract

- Inputs `base` (frame, seeds the output; black if unwired), `audio`, `gain`,
  `paletteIn`, `thickness` and `smoothing`. Every knob is wire-then-property.
- Property `style`: `line`, `filled`, `mirror` or `ring` (append-only). Defaults:
  gain 2, thickness 1, smoothing 0.3, palette citrus.
- Output `frame`. Lit pixels replace the base; the rest keep it.
- Colour is palette position `0.14 + 0.82 x |sample|`, as Spectrum Visualizer.
- No live audio, no samples in the payload (older recordings), or no audio
  wire on the device all draw the flat, silent trace: a centre line, a centre
  bar or a steady ring, not a blank frame.

### The samples

`AudioSignal.samples` carries 128 values in -1..1, decimated from the chunk the
analyser already processes (the conditioned 512 samples, /32768). Decimation
keeps the sample furthest from zero in each block of `floor(n / 128)`, first on
a tie, so peaks survive. The sketch publishes the same `_audioWave[128]` from
`Processor::getSample().pcm()`, once per new chunk, and only when a Waveform
node exists in the graph or a group. The payload is optional; every reader
treats a missing field as silence, and the SD player (no processor) reads it as
silence too.

### Styles

- `line`, `filled`, `mirror`: one value per column, interpolated across the 128
  samples; a row is lit inside the vertical span between this column's line
  position and the next column's, so steep parts stay connected. `line` widens
  that span by `thickness / 2`; `filled` extends it to the centre row;
  `mirror` lights everything within the larger deviation on both sides of the
  centre, so a silent signal still shows the centre bar.
- `ring`: each pixel takes the sample at its angle (wrapping, so it is seamless
  and periodic) and is lit within `thickness / 2 + 0.35` of a radius that runs
  from 20% to 90% of the inscribed radius. It is the circle `ringSampleMap`
  reads, so an LED Ring shows it. The 0.35 stops a one-pixel ring breaking on
  diagonals at small sizes.
- `thickness` applies to `line` and `ring`; the other styles ignore it.

### Smoothing and gain

Smoothing is a per-sample running mean on the wall clock,
`retain = smoothing ^ (dt x 60)`, so it behaves the same at any frame rate.
Gain is clamped to 0.25-8 and applied after smoothing; the output is clamped to
-1..1. Gain 2 is the default because a conditioned microphone rarely fills the
range.

### RAM

512 bytes of smoothed samples per node, plus 512 bytes for `_audioWave` once
when the engine publishes it, and two width-sized float arrays on the stack per
frame.

## Still to come in this phase

The show bake for the detector payloads (the SD player has no processor, so
they read inactive there), the serial debug line for Song Structure, Pitch and
Waveform, and the phase-level compile check with the microphone config are
tracked in the plan's checklist.
