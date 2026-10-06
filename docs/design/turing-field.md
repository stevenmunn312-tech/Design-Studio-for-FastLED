# Turing Field and Reaction Diffusion companions

Status: implemented · Owner: app · Date: 2026-09-28

## Purpose

`TuringField` draws Jonathan McCabe's multi-scale Turing patterns: nested
labyrinths that keep reorganising instead of settling. This is not
Gray-Scott, which `ReactionDiffusion` already covers. Phase 5 of the
[pattern node expansion](../plans/pattern-node-expansion.md) also gave
Reaction Diffusion a `field` output and named feed/kill presets.

## Turing Field contract

- `reset` is a boolean input. Each rising edge increments an epoch and
  restarts from that epoch's seeded noise, so the same edges give the same
  pattern on the controller as in the preview.
- `speed` is iterations per frame, floored and clamped to 1–4.
- `stepSize` is 0.01–0.2. Scale `k` of `n` (finest first) steps by
  `stepSize · (k + 1) / n`, so the coarsest scale moves by the full step.
- `scales` (2–5) and `baseRadius` (1–8 px, half-pixel steps) are properties.
  Scale `k` has activator radius `round(baseRadius · 2^k)` and an inhibitor
  twice as wide. Both properties are baked, so the sketch holds the radii as
  a `static const int` list.
- `seed` (0–9999) picks the starting noise, `worleyHash(x + 31·epoch,
  y − 17·epoch, seed) · 2 − 1`. That value is exact in float32, so the start
  state is the same bits in the browser and on the controller.
- The output is `(a + 1) / 2`, clamped to 0–1.

`speed` and `stepSize` are property inputs. The preview restarts the state
when the canvas size or seed changes.

## Algorithm

`src/state/evaluator/turing.ts` owns the step. `src/codegen/helpers/turingHelperCpp.ts`
is its C++ twin, emitted once behind `needsTuring`. One iteration:

1. Build a summed-area table of `a − mean(a)` over the canvas. Removing the
   mean does not change any box difference. It keeps the sums small, so float
   rounding stays small on a 64×64 panel, and a flat state gives exact zeros.
2. For each pixel and scale, read the activator and inhibitor box means from
   the table. The canvas is a torus: a box that crosses an edge wraps.
3. Keep the scale where `|activator − inhibitor|` is smallest, and step the
   pixel toward the activator's side of it. A difference below `1e-6` does not
   move the pixel.
4. Stretch the state back to −1..1 by its minimum and maximum. A state whose
   range is below `1e-6` is left alone.

Two canvas rules keep small panels usable:

- Each radius is clamped per axis to `(size − 1) / 2`. A box wider than the
  canvas counts some columns twice, which drew stripes on 16×16.
- A scale whose activator and inhibitor clamp to the same box is skipped. It
  would compare a box with itself, always win with a difference of 0, and
  freeze every pixel.

Because radii stay below half the canvas, a box wraps at most once per side,
and the table lookup needs no division.

## Changes from the plan contract

The Phase 5 contract in the [plan](../plans/pattern-node-expansion.md)
proposed two separable running-sum blurs per scale and a step of
`stepSize / (k + 1)`. Prototypes of both at 16×16, 32×32 and 64×64 decided the
shipped version:

- **Summed-area table, not separable blurs.** Comparing scales per pixel
  means the separable version must keep, beside the state, a blur scratch
  array, an activator array and a best-step array: 16 bytes per LED, not the
  12 the plan priced. One table costs 4 bytes per LED plus one row and one
  column, so the node needs 8, and a scale costs the same at radius 1 as at
  radius 64.
- **Coarse scales take the larger step.** With `stepSize / (k + 1)` the finest
  scale dominates and the field stays noise. McCabe's own settings give
  coarser scales larger steps, and that ordering forms the labyrinth.

## Cost

RAM beyond the node's own field buffer is one float of state per LED plus the
`(W + 1)(H + 1)` table: `STATEFUL_EXTRA_BYTES_PER_LED` prices `TuringField: 8`,
and `estimateFirmwareRam` adds the extra row and column. That is about 33 KB
at 64×64. Each iteration costs one pass to build the table and eight table
reads per scale per pixel. At 64×64 with five scales and four iterations this
is the heaviest field node in the library, which is why the default is three
scales and two iterations. ESP8266 has no floating-point unit, so every one of
these operations is a library call there. No frame rate has been measured on
either board yet; start with 16×16 and one or two iterations on ESP8266.

## Parity

Scale choice turns on near-ties, so one differently rounded operation changes
which scale a pixel follows, and the renormalisation spreads the difference.
A first version that computed the preview in double precision disagreed with
the sketch on a 64×64 field within ten frames. The shipped step therefore
rounds to float32 after every operation, in the C++ helper's order, and the
two start from the same bits.

Fused multiply-adds are the other hazard: GCC fuses `a * b + c` by default in
the GNU dialect the Arduino cores use, and a fused operation rounds once
instead of twice. The renormalisation is written as `(a − mid) · scale`
rather than `(a − lo) · scale − 1` so no add follows a multiply; the other
products in the step are exact, so fusing them changes nothing.

`src/codegen/__tests__/turingNativeParity.test.ts` compiles the emitted helper
with the host `g++`, with and without fusing, and requires the preview's
state to match bit for bit after 120 iterations on 16×16, 64×64 and a
30-pixel string. It is skipped where no `g++` is installed. The controller
follows the same IEEE single-precision rules; no bench run has compared its
pixels yet.

## Reaction Diffusion companions

- **Field output.** The node's V concentration is its `field` output. The
  preview returns a pooled copy of V. The sketch keeps V in the node's own
  `field_<id>` buffer instead of a fourth static array, so the output costs no
  copy, and the node's RAM stays at four floats per LED: three state arrays
  (`ReactionDiffusion: 12`) plus the field buffer every field output is
  priced for. PSRAM turns field buffers into pointers, so the copy into V uses
  an explicit `NUM_LEDS * sizeof(float)`, not `sizeof`. A sketch with several
  output shapes (`nativeMultiRender`) reuses one field buffer across its
  render passes, so there V is a static inside each pass and is copied into
  the field buffer every frame.
- **Presets.** `rdPreset` is `custom`, `spots`, `stripes`, `worms`, `coral` or
  `mitosis`. The pairs live in `src/nodes/simulations/reactionDiffusionPresets.ts`. A named
  preset bakes its pair and ignores the Feed and Kill knobs and any wires
  into them, and `isPropertyEnabled` dims both knobs while it is selected.
  `custom` is the default, so saved graphs keep their feed and kill.

The preset pairs are tuned for this node's solver, not copied from the usual
tables. It diffuses at 0.16 and 0.08 per step, several times slower than Karl
Sims' 1.0 and 0.5, which moves every regime toward lower feed. The familiar
coral pair (0.0545, 0.062), which is also the node's default, only holds its
starting square here. Each preset was picked by sweeping feed and kill at
16×16, 32×32 and 64×64 and keeping a pair that shows its regime at all three
sizes within about ten seconds at the default speed.

## Evidence

The Phase 5 fixture runs a reset-driven Turing Field and a `coral` Reaction
Diffusion field through Field Math into one output, generated at 16×16 and
32×32. Its classic-ESP32 and ESP8266 results are in the
[pattern-node compile record](../reports/compile/pattern-node-compile-checks.md).
