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
  noise gate zeroed completely is silent. The gate's open threshold is the
  input node's `noiseGate` (raw int16 units, default 500) and closes at 60% of
  it, matching `SignalConditionerConfig`'s 500/300. Gain applies after the
  gate, as in `Processor`; firmware calls `configureSignalConditioner` only
  for a non-default gate.

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
recorder carry it. A baked show carries it as a 7-byte record per envelope
frame (levels at scale 32, a spike flags byte; `volume` is derived), which the
show preview, the card and the SD player's fallback all read; see
[Shows and the SD player](#shows-and-the-sd-player). A show baked before the
detectors existed has no record and reads Vibe as inactive.

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
recorder carry it. A baked show carries it as a 7-byte record per envelope
frame (a flags byte with `downbeat`, `drop`, `building` and `tempoStable`,
then the beat number and the five levels), read by the show preview, the
card and the SD player's fallback; `downbeat` and `drop` fire once per
flagged frame on both sides. See
[Shows and the SD player](#shows-and-the-sd-player). A show baked before the
detectors existed reads Song Structure as inactive.

## Pitch Detect

`PitchDetect` (category `audio`) exposes pitch, note and key. Pitch and note
are our own code running FastLED's arithmetic, because the stock detector
cannot work on a device; key is FastLED's `KeyDetector`. The browser side is
`src/audio/fastledPitch.ts`; the firmware twin is `src/codegen/helpers/pitchHelperCpp.ts`,
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
carry it. A baked show carries it as an 8-byte record per envelope frame (hz
as a 16-bit integer, note, velocity, confidence, key root with 255 for no key,
a flags byte with `noteOn` and `keyMinor`, key confidence), read by the show
preview, the card and the SD player's fallback; `noteOn` fires once per
flagged frame on both sides. See
[Shows and the SD player](#shows-and-the-sd-player). A show baked before the
detectors existed reads Pitch Detect as inactive.

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
treats a missing field as silence. A baked show carries no samples (see
[Shows and the SD player](#shows-and-the-sd-player)), so a show preview and the
SD player's fallback draw the flat trace; only the live decoder tap animates it.

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

## Shows and the SD player

A baked show carries the coarse envelope (bass, mids, treble, the two stereo
levels and the 16 equalizer bytes per frame) and, since the detectors were
baked, one fixed-width record per envelope frame for Vibe, Song Structure and
Pitch Detect. Song analysis (`bakeDetectorTracks` in
`src/audio/fastledSongAnalysis.ts`, run in the analysis worker) runs the live
analyzer — conditioner, FFT and the three browser mirrors — over the decoded
mono samples in 512-sample chunks, the device's I2S cadence, with the sample
position as its clock, so Vibe's frame-rate conversion and Pitch's note timing
see the intervals a decoder tap feeds them and the bake is deterministic. Each
detector's state is sampled at the envelope rate (50 Hz): levels take the last
chunk in the frame; the one-frame events (`downbeat`, `drop`, `noteOn`) are
OR-ed over the chunks in it, so none is lost to the coarser rate and none
fires twice. The browser mirrors differ from the C++ as recorded above, so a
baked value is the preview's, not the device processor's, to within those
differences.

The record layouts live in `src/audio/detectorTrack.ts`, which the preview,
the show writer and the firmware emitter all import:

| Block | Bytes | Layout |
|---|---|---|
| Vibe | 7 | `bass`, `mid`, `treble`, `bassAtt`, `midAtt`, `trebleAtt` as u8 at scale 32 (value × 32, clamped 0–255, so 1.0 = 32 and the top is 7.97), then flags: bit0 `bassSpike`, bit1 `midSpike`, bit2 `trebleSpike`. `volume` is derived by the reader as the mean of the three levels, which is its definition. |
| Song Structure | 7 | flags (bit0 `downbeat`, bit1 `drop`, bit2 `building`, bit3 `tempoStable`), `beatNumber` u8, `measurePhase` u8 (× 255), `buildupProgress` u8 (× 255), `dropImpact` u8 (× 255), `valence` i8 (× 127), `arousal` u8 (× 255). |
| Pitch | 8 | `hz` u16 little-endian (whole Hz), `note` u8, `velocity` u8 (× 255), `confidence` u8 (× 255), `keyRoot` u8 (0–11, 255 while no key is accepted), flags (bit0 `noteOn`, bit1 `keyMinor`), `keyConfidence` u8 (× 255). |

`SongAnalysis.detectors` holds the three tracks as base64 at the analysis
rate; `bakeEnvelope` copies them onto the envelope frames
(`resampleDetectorBytes`: nearest frame, each source frame's events carried
once) into `AudioEnvelope.vibe`, `.structure` and `.pitch`. All three are
optional and additive: `AudioEnvelope.version` stays 3, a show baked before
them has none, its nodes read inactive, and analysing the song again adds
them.

**Preview and card.** `showAudioOverride` (`src/state/player/showAudio.ts`)
decodes the frame whose span holds the playback position — the firmware's
`i`, no interpolation — into `vibe`, `structure` and `pitch` on the
`AudioSignal`, so the node evaluators read a show exactly as they read a live
decoder. The preview runs at 60 fps over a 50 Hz bake, so some frames are
served twice: `showPreview.ts` keeps the last served frame index per show
(`ShowDetectorCursor`) and the events fire only when that index changes, once
per flagged frame, and again after a rewind lands on one. One override serves
both sides of a transition. The pattern card and rating render through the
same `renderShowFrame`, so they get the detectors with it.

**Firmware.** `showFileToBinary` appends a tagged `ADET` trailer after `AENV`
(and after the optional `PARM`): `'A','D','E','T'`, version u8 = 1, flags u8
(bit0 vibe, bit1 structure, bit2 pitch), frames u32 LE, then the flagged
blocks in that order, each `frames × recordBytes`. The player
(`playerSketchGenerator.ts`) emits the reader only when a collected pattern
reads one of the detector globals (the same `audioFeaturesInCode` regexes the
decoder tap uses), mallocs only those blocks and `seek`s past the rest; it
notes where the trailer starts before the spectrum block, so the trailer is
found whether or not the spectrum was loaded. An absent block, a block
without memory, a show without `ADET` or an unknown version all leave the
detectors inactive, as a show written before the trailer did; a player whose
patterns read no detector stays byte-identical. `updateShowAudio` fills the
same globals the live engine fills (`_audioVibe*`, `_audioDownbeat` …
`_audioArousal`, `_audioPitch*`, `_audioKey*`) from the frame it already
computes for the envelope, and fires `_audioDownbeat`, `_audioDrop` and
`_audioPitchNoteOn` once per flagged frame through `audioDetLast`. Without a
decoder tap the player declares those globals itself; with one, the tap's
own `fl::audio::Processor` over the decoded PCM wins while it is live and
the baked records are the startup and failure fallback, as the envelope is
for the bands.

**RAM.** 22 bytes per frame with all three blocks, 66 KB a minute at 50 Hz,
beside the envelope's 21. `estimateFirmwareRam` prices neither the envelope
nor the detectors: a show's buffers are sized by the song at load time, not
by the graph, and a block that does not fit is simply left inactive.

**Waveform** is the one remaining show-side limit. 128 samples per frame is
1.5 MB for a four-minute song, beyond internal RAM and only servable by
per-frame SD reads beside the decoder, so it is not baked: a show preview and
the player's fallback draw the flat trace, and only the live decoder tap
animates it.

## Offline song analysis

The Music Library analyses whole songs in `src/audio/fastledSongAnalysis.ts`,
run in a worker by `src/audio/songAnalyzer.ts`. It reuses this pipeline's
spectrum scaling, the Beat detector's log-binned spectral flux as its onset
measure, and the Key detector's Krumhansl-Schmuckler profiles. Two parts have
no device counterpart, because a show is planned from the whole file:

- Beats come from a tempo fit over the onset autocorrelation (log-Gaussian
  prior at 120 BPM, TPS2 octave vote) and a dynamic-programming tracker
  (Ellis 2007), not from the causal Beat detector.
- Key reads a harmonic-salience chroma from an 8192-point FFT. Raw peaks put a
  bass note's fifth harmonic on its major third and pull minor songs major.

`scripts/bench/song-analysis-bench.ts` scores it on real files: tempo against
ID3 `TBPM` tags, and kick alignment, the kick energy on the beats against half
a beat later. Rerun it after changing any constant there.

## Serial debug

With `MIC_DEBUG` on, the engine prints one extra line per present node beside
the Vibe line: `structure` (beat number, measure phase, building, progress,
drop, impact, tempo stable, valence, arousal), `pitch` (Hz, note, confidence,
velocity, key and its confidence) and `wave` (the min and max of the 128
samples).

## Cost

The engine registers each detector only when its node is live, and the
processor allocates lazily. The phase-level compile check builds the same
microphone graph with and without all four detectors on each board; the
figures are in the
[compile record](../reports/compile/pattern-node-compile-checks.md).
