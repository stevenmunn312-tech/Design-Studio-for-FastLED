# Audio detectors from FastLED's processor

Status: in progress, Vibe implemented · Owner: app · Date: 2026-09-29

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

## Still to come in this phase

Song Structure, Pitch and Waveform are tracked in the plan's checklist. Each
adds its FastLED source citation and thresholds here when it lands.
