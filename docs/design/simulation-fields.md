# Simulations, fractals and classics

Status: implemented · Owner: app · Date: 2026-09-29

## Purpose

Phase 10 of the [pattern node expansion](../plans/pattern-node-expansion.md)
added the large visual gaps that were left in the library and the small effects
people expect from an LED tool. This note holds what the code cannot say for
itself: the contracts each node keeps between the preview and the sketch, and the
places where the two are known to differ. The node cards carry each node's ports
and knobs.

Every node follows the per-node checklist in the plan. Shared maths lives in
`src/state/evaluator/`, and a helper of more than a few lines is emitted once
into the sketch behind a `Need` flag.

## Fluid (`FluidSim`, field)

`evaluator/fluid.ts` is Stam's stable-fluids solver on a **wrapping** canvas:
no walls, so a plume that leaves the top comes back in at the bottom, which suits
rings and cylinders. Each frame runs, in this order, on both sides:

1. Sources: Gaussian injection at `injectX`, `injectY` (which also pushes the flow
   upward), a puff on a rising `trigger`, then the two force fields and buoyancy.
2. Velocity: optional diffusion by `viscosity`, project, advect, project.
3. Dye: optional diffusion by `diffusion`, advect, then decay by `dissipation`.

`speed` is the number of Gauss-Seidel passes per solve (4 to 20). Velocity is
clamped to four cells a frame and dye to four, so a hard drive stays finite.
The outputs are dye clamped to 0..1 and two velocity fields at
`0.5 + v * 0.25`, so 0.5 is still air and Frame Warp can be steered by them.

Two things the plan did not spell out. `buoyancy` is a property that lifts dye
so the default plume rises; without it the default graph would sit still. The
velocity outputs cost a field buffer each, so the sketch writes one only when a
wire reads it, the rule Slice Tiling's Cell output follows, and the RAM
estimate counts the same wires.

RAM is six floats per cell (`FluidSim: 24` in `STATEFUL_EXTRA_BYTES_PER_LED`).
The solver helper is `codegen/helpers/fluidHelperCpp.ts`, emitted once behind
`needsFluid`, and a show carries it whole (`SHARED_HELPER_BLOCKS`).

**Known gap.** The preview accumulates in double precision inside each cell and
stores float32; the sketch does float32 throughout. The two agree closely but not
bit for bit, and there is no native parity test because it needs a host `g++`.
The compile record is the evidence for the sketch.

## Fractal (`FractalField`, field)

`evaluator/fractal.ts` holds one per-pixel function, `fractalSampler`, and the
sketch repeats its loop. Julia, Mandelbrot and Burning Ship are escape-time sets
with a bailout of |z|² above 16; Newton runs the iteration on z³ − 1 and reports
which root the pixel settled on.

- Escape time returns `n / iterations`, or with `smooth` the fractional count
  `n + 1 − log2(log2 |z|)`. Points that never escape return 0.
- Newton returns `(root + 1 − n / iterations) / 3`, so each root owns a third of
  the range and faster convergence is brighter within it.
- Zoom 1 spans 1.5 units from the centre to the edge of the shorter side. Each
  set has its own origin (`FRACTAL_ORIGIN`) so 0, 0 shows the interesting part.
- `cRe`, `cIm`, `zoom`, `centerX`, `centerY` and `spin` are property inputs, so
  an LFO can morph a Julia set. Iterations are clamped to 8 to 64.

The capacity verdict prices RAM only. There is no per-frame time model, so it
cannot cap iterations on a large panel; the clamp at 64 is the only bound.

## Automaton (`Automaton`, field)

`evaluator/automaton.ts` holds the four rules; a cell is one byte and the node
keeps two buffers (`Automaton: 2`).

| Type | Rule |
|---|---|
| `elementary` | A new top row from the Wolfram `rule`, older rows scroll down. It starts from one centre cell, or a random row when `seed` is set. |
| `cyclic` | A cell advances to the next of `states` once `threshold` of its eight neighbours already hold it. |
| `brianBrain` | Off becomes on with exactly two on neighbours, on becomes dying, dying becomes off. Encoded 0, 1, 2 for off, dying, on. |
| `sand` | Grains fall, slide down a diagonal chosen by the parity of `x + y + step`, and pile. Half a full top row clears it. |

The output is `state / (states − 1)`. It steps at `speed` a second. The preview
counts frames and the sketch counts `millis()`, the way Game of Life does. A
rising `reset` restarts it, and so does a change of canvas size.

## Digital Rain, Gauge and the classics (pattern)

**Digital Rain** keeps head, speed and length for each lane. `direction` picks
whether lanes are columns or rows, and `rainIndex` maps a lane and a position to
a canvas pixel, so a one-row string runs the rain along its length. Flicker comes
from the shared integer hash.

**Gauge** is a list of cells, each knowing the slice of the 0..1 value it stands
for (`evaluator/gauge.ts`). A bar or dot lays them along an axis. A ring or arc
takes the pixels of the [string track](strings-and-rings.md) that fall inside
its sweep. One coverage rule then fills all four styles, and `segments` turns it
into whole blocks. A peak marker holds the highest reading for `peakHold`
seconds, then falls a full range a second. Coverage becomes a byte with a
0.001 lift so a full gauge is 255, not 254: dividing by a cell's span leaves
coverage a hair under 1 and truncating that would dim it.

**Candle, Lightning, Heartbeat, Sunrise and TV Simulator** share
`evaluator/classics.ts`. All randomness is one integer hash
(`classicHash`), which is exact in float32 and float64, so the preview and the
sketch draw the same random numbers. Candle, Heartbeat, Sunrise and TV Simulator
are pure functions of time. Lightning keeps a strike schedule: a strike is two
to five flashes and a dim afterglow, the next one is half to one and a half
intervals away, and a rising `trigger` fires one now.

## Variants

- **Pride 2015 `paletteIn`.** With no wire it is the rainbow it always was. With a
  palette wired it is Kriegsman's colorwaves: the same hue sweep and brightness
  wave, read through the palette. The port has no palette property on purpose, so
  wired-or-not is the whole switch.
- **Fire `fireStyle: smoke`.** A second noise layer drifts toward the tip and
  multiplies the heat by `1 − 0.65 n` before it reaches the palette
  (`evaluator/fireSmoke.ts`).
- **Particles `luminova`.** Up to eight emitters steered by noise, each turning a
  little every frame so its path spirals, dropping one trail dot a frame. The
  pool is 240 slots in the sketch so the trails fit, and dots are drawn 1.5 times
  larger so neighbours overlap into a soft ribbon.

Each variant is held to its default by golden hashes in
`variantGoldens.test.ts`, taken from the frames before the variant existed.

## Preview and sketch differ here

Noise is the one place the two sides use different functions. The preview
samples `_snoise2` and the sketch samples FastLED's `inoise8`, one noise unit
being 256 in `inoise8`'s fixed point. Fire smoke, Luminova and String Particles'
meteor bed all carry the same documented approximation gap as Field Noise.
Random draws in Digital Rain, Automaton and Luminova come from
the seeded LCG in the preview and `random8`/`random16` in the sketch, so a seed
gives the same statistics, not the same picture. The classics avoid this by
hashing.
