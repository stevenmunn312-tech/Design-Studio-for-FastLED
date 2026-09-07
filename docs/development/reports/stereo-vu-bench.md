# Stereo VU Meter — physical validation

Preserved from the completed implementation plan. Current usage is in the
[user guide](../../user/stereo-vu-meter.md); support scope belongs to the
[support matrix](../../release/beta-support-matrix.md). This record applies
to the exact rig below, not every audio source or board.

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

### Status

Complete. Every checklist item is done, the bench matrix passed in full, and the
combination is a full support row in
[the beta support matrix](../../release/beta-support-matrix.md).

Cross-language vector replay was dropped deliberately rather than left pending —
It would require a host C++ harness; this was explicitly excluded from the completed slice. The twelve visualizations were validated on hardware; the
TypeScript golden vectors guard them against regression from here.
