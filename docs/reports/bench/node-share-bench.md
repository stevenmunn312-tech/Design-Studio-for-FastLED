# Node shares on a board without an FPU

HW-32 step 8 added the telemetry `top` key: each node's mean milliseconds per
frame, with its LED sends taken out
([display budget bench](../../development/testing/display-budget-bench.md#what-the-device-reports)).
Step 11 needed those numbers to pick which emitters to move to integer maths.
This page records the run that picked them, and the readings afterwards.

## Rig and method

- **Board:** LOLIN D1 mini (ESP8266, 80 MHz, no floating-point unit), profile
  `esp8266-lolin-d1-mini`, FQBN `esp8266:esp8266:d1_mini`, Arduino CLI with
  FastLED 3.10.5.
- **LEDs:** 10 WS2812B on D4 (GPIO2). Every sketch declares a 16x16 matrix, so
  each node renders 256 pixels. Only the first ten light; the render is timed,
  not the wire.
- **Sketches:** `scripts/bench/node-shares.ts` writes nine. Six blend every
  frame source in the node library into one chain, twelve at a time. One
  chains every frame effect after a Plasma. One maps every field source through
  Field to Frame. One chains the field effects after a Gradient Field. Every
  node keeps its library defaults, with audio inputs unwired.
- **Reading:** the bench widens `top` from three nodes to every timed node.
  `scripts/bench/node-shares.py` uploads a sketch through the helper's compile
  path and reads `FLS_STAT` for 14–26 seconds. The figures below are the last
  two-second interval. Intervals agreed within about 2%.

The captures are in `artifacts/bench/hw32-esp8266/`, the after-readings in its
`after/` folder.

## Converted in step 11

Measured 2026-10-20 before the change and 2026-10-21 after it, on the same
board and sketches. Milliseconds per 256-pixel frame:

| Node | Before | After | What changed |
| --- | ---: | ---: | --- |
| TwinkleFox | 259.35 | 0.57 | three `sinf` hashes and a `powf` a pixel became one integer hash, a triangle wave and a whole-and-fractional power by `scale8` |
| TreblePrism | 190.97 | 1.08 | three `sinf` and two `powf` became three `sin16` and two 256-byte power tables |
| Pride2015 | 66.52 | 0.68 | `fmodf` hue and `sinf` brightness became 16.16 fixed-point hue and `sin16` |
| Pacifica | 37.70 | 1.04 | four `sinf` became four `sin16`; the whitecap blend is integer |
| Plasma | 36.90 | 1.42 | four `sin` and a `sqrt` became four `sin16` and an integer square root |

The kernels, and the rule that keeps the preview identical to the sketch, are
in [firmware generation](../../development/patterns/firmware-generation.md#integer-pattern-kernels).

## Still costly

Every other node at 10 ms or more a frame, before step 11. None of these is
converted. Most compute a smooth field from `expf`, `atan2f`, `sqrtf` or noise
at several phases, so an integer version is a design change, not a port.

| Node | ms |
| --- | ---: |
| PrismStorm | 213.79 |
| AudioCascade | 102.09 |
| VocalAurora | 100.50 |
| TuringField | 99.35 |
| Animartrix | 96.10 |
| KickShock | 86.99 |
| TurbulentBloom | 68.10 |
| ReactionDiffusion | 64.56 |
| Wireframe3D | 63.84 |
| SliceTiling | 62.82 |
| MidrangeBloom | 54.98 |
| FieldNoise | 37.91 |
| Symmetry | 37.36 |
| BassRings | 36.76 |
| GravityWell | 36.16 |
| BeatKaleidoscope | 33.61 |
| FieldSymmetry | 27.64 |
| FormulaPoints (Phyllotaxis) | 26.85 |
| EmberPulse | 24.98 |
| Spiral | 21.21 |
| Kaleidoscope | 20.71 |
| ColorTrails | 20.57 |
| MidrangeWaves | 19.41 |
| FormulaField (Rose) | 19.08 |
| Array | 17.83 |
| PolarGradient | 14.85 |
| SpectraMosaic | 14.82 |
| RadialBurst | 13.40 |
| Truchet | 11.95 |
| CustomFormula | 11.71 |
| FrameFeedback | 11.42 |
| Noise Field | 10.71 |
| Fourier Epicycles (Heart) | 10.14 |

TuringField was left alone on purpose: its scale choice turns on near-ties, so
it holds bit-for-bit float parity with the preview
(`turingNativeParity.test.ts`). Animartrix is the vendored library's own code.

## Not yet measured

The ESP32-C3 and ESP32-C6 also have no FPU, and telemetry supports both. Rerun
the nine sketches on each with
`node scripts/run-ts.mjs scripts/bench/node-shares.ts <profileId> <dataPin>`
and `python scripts/bench/node-shares.py <sketch> <port> <fqbn>`.
