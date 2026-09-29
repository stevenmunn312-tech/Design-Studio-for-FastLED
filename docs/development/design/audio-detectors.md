# Audio detectors from FastLED's processor

Status: in progress, Vibe and Song Structure implemented · Owner: app · Date: 2026-09-29

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

## Still to come in this phase

Pitch and Waveform are tracked in the plan's checklist. Each adds its FastLED
source citation and thresholds here when it lands.
