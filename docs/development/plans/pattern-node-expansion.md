# Pattern node expansion — tiling, warp, Turing and Fourier nodes

Status: **in progress — Phases 0–9 complete; 10–11 open** · Owner: app · Date: 2026-09-29

An ordered, checkboxed plan for the pattern-creation nodes two reviews found
missing. Phases 0–7 came out of a review of the library against two sources: the space-subdivision pattern
method in Scandurra, Laccone, Malomo, Callieri, Cignoni and Giorgi,
*Procedural generation of geometric patterns for thin shell fabrication*,
Computers & Graphics 122 (2024) 103958
([open PDF](http://vcgdata.isti.cnr.it/Publications/2024/SLMCCG-ProceduralPatterns/SLMCCG-ProceduralPatterns.pdf),
[publisher record](https://www.sciencedirect.com/science/article/pii/S0097849324000931)),
and the Milkdrop per-pixel warp model behind
[projectM](https://github.com/projectM-visualizer/projectm-eval). Phases 8–11
came out of a second review against FastLED's current
[examples](https://github.com/FastLED/FastLED/tree/master/examples) and its
`fl` library, in particular the
[audio detector suite](https://github.com/FastLED/FastLED/blob/master/src/fl/audio/README.md),
the `fx/1d` and `fx/2d` effects and the `gfx` helpers.

This document holds the feature contracts and the work ledger. When a phase
starts, add one line for it under *Open engineering work* in
[the root todo](../../../todo.md) pointing here, and remove that line when the
phase's compile record lands. When a phase ships, its contract moves into a
design note under [`docs/development/design/`](../design/) and the section here
shrinks to a pointer.

Each phase ships on its own. Nothing in a later phase is needed to finish an
earlier one, but the order below is the cheapest path, because each phase
reuses helpers the previous one introduced.

## Goal

Give the graph the procedural vocabulary it is missing: crisp geometric
tilings and symmetry, a per-pixel frame warp for feedback loops, the
labyrinthine multi-scale Turing look, and a Fourier-series outline drawer.
Every node keeps preview/firmware parity by construction: one shared TypeScript
helper for the math, one C++ twin emitted behind a `Need` flag, and a test that
holds the two together.

## Non-goals

- **No projectM-eval dependency.** Formulas already compile ahead of time on
  both sides (`src/state/formulaLang.ts` in the browser, `cppRewriteShims` for
  the sketch). A runtime interpreter would be slower per pixel on the
  controller and a new sandbox surface in the browser. The library is a grammar
  reference only, if the formula language ever grows assignments and state.
- **No Milkdrop preset importer.** Presets carry HLSL warp and composite
  shaders; only their equation half is portable, and Phase 2 is that half.
- **No new port data types.** Everything here is a `field`, a `frame`, a
  `float`, a `bool`, a `color` or a `palette`.
- **No compatibility shims.** `Hardware` is pre-1.0; adding a port to Reaction
  Diffusion or gating a knob behind a preset needs no migration.

## Already in the library, so not proposed again

| Wanted | Have |
|---|---|
| Turing patterns (Gray-Scott) | `ReactionDiffusion` |
| Repeat a field | `FieldTile` |
| Voronoi cells | `Noise` with `noiseType: 'worley'` |
| Rotational mirror | `Kaleidoscope`; four-axis `Mirror` |
| Circular spectrum | `SpectrumVisualizer`, `style: 'Orbit'` |
| Morphing superformula | `FormulaField` with an LFO wired into `n1`/`n2`/`n3`/`symmetry` |
| Fractional polygon morph | `Shape.sides` is continuous already |
| Supersampling (FastLED downscale) | the LED output's `supersample` |
| Power limit, overclock, dither, correction | LED output properties, emitted already |
| A 2-D effect sampled onto a ring (FastLED `Fx2dTo1d`) | `ringSampleMap` and the corkscrew canvas |
| FastLED's WLED folder | a client adapter, not WLED's effects; no shortcut there |

## The per-node checklist

Every node in every phase below has to clear this list. It is the same list
`CLAUDE.md` states, expanded to the file each item lives in, so the phase
sections can say "the per-node checklist" instead of repeating it ten times.

1. **Library entry** in `src/state/nodeLibrary.ts`: the `NODE_LIBRARY` row with
   its primary input declared first (`spliceTargetPorts` takes declaration
   order), a `propertyInputs` row for every runtime knob, `PROPERTY_META`
   sliders or selects for every numeric or enumerated property (a boolean or
   string default renders as a checkbox or text field, as `Shape.wrap` and
   `Code.code` do), a `NODE_DESCRIPTIONS` one-liner, `PROPERTY_LABELS` and
   `PROPERTY_DESCRIPTIONS_OVERRIDES` where a key such as `a` or `cells` is
   ambiguous, `isPropertyEnabled` gating for knobs a variant does not read, and
   a place in `CATEGORY_NODE_ORDER.field` for a field node.
2. **Preview** handler in `src/nodes/<category>/evaluate.ts`, keyed by type in
   that category's table, reading knobs wire-then-property through
   `num(id, 'port', props, 'key', LIT)`, holding state only in an
   `instanceState('name', new Map())`, and never importing
   `graphEvaluator.ts` or `cppGenerator.ts`.
3. **Firmware** emitter in the same directory's `codegen.ts`, reading knobs
   through `f('port', 'key', LIT)` with the *same literal* as the evaluator,
   writing into `ownField()` or `ownBuf()`, reading sources through
   `srcField()` or `srcBuf()`, raising `needsT` when it reads `t`, re-emitting
   every evaluator clamp as `constrain`/`fmaxf`, suffixing every float literal,
   and hoisting each knob to a per-frame local rather than baking it.
4. **Shared math** in a module under `src/state/evaluator/` that both sides
   import: constants exported the way `GOLDEN_RATIO` and
   `LISSAJOUS_FIELD_SAMPLES` are, so the two implementations cannot drift on a
   number. Any C++ helper longer than a few lines goes in a
   `src/codegen/<name>HelperCpp.ts` module emitted once behind a `Need` flag,
   the way `transitionHelperCpp.ts` and `_worleyHash` already are.
5. **User text never reaches C++ unparsed.** A hex pattern string or a point
   list is parsed to numbers on the TypeScript side and only the numbers are
   emitted. An invalid string renders the documented fallback on both sides.
6. **Other registries**: `src/state/speedRange.ts` for any `speed`/`scale`-class
   knob that is a 0–1 slider; `STATEFUL_EXTRA_BYTES_PER_LED` in
   `src/utils/validateGraph.ts` for a node holding static per-LED arrays; the
   type sets in `src/state/patternRating.ts` for a pattern-category node; an
   explicit `selectedInputs` row in `src/components/HelpModal/liveExamples.ts`
   only when the automatic example for the category wires the wrong knobs.
7. **Docs**: the node's label on its category line in `README.md` and the three
   module-count strings (`readmeModuleList.test.ts` fails until both are
   right); `npm run gen:node-cards` for `public/node-cards/` and
   `docs/reference/node-cards.md`; the *New nodes* list in
   [`animartrix-float-field.md`](../design/animartrix-float-field.md) for a
   field node; a `CHANGELOG.md` line.
8. **Tests**: a `describe` block in `src/state/__tests__/graphEvaluator.test.ts`
   (range bounds, determinism at a fixed `t`, each knob changes the output,
   animation over `t`, state reset when the canvas size changes) and one in
   `src/codegen/__tests__/cppGenerator.test.ts` asserting the emitted block per
   variant, on top of the gates that run automatically: `nodeTables.test.ts`,
   `propertyInputFallbacks.test.ts`, `propertyInputs.test.ts`,
   `nodeAuthoringMetadata.test.ts`, `emittedNumericLiterals.test.ts`,
   `readmeModuleList.test.ts`, `liveExamples.test.ts` and the description test
   in `nodeLibrary.test.ts`.
9. **Compile check**: a fixture sketch through arduino-cli on classic ESP32,
   and on ESP8266 for any node with static float arrays, recorded in a compile
   record beside the others under `docs/development/`.
10. `npm test`, `npm run lint`, `npm run build` green.

## Order and why

| Phase | Ships | Why here |
|---|---|---|
| 0 | Field Levels, Field Lerp, Shape Field | Every later field node needs crisp edges and a `t`-weighted mix; Shape Field is the SDF base that makes morphing work. |
| 1 | Slice Tiling | The headline node from the paper. Stateless, cheap, self-contained. |
| 2 | Frame Warp | The projectM look in one node; introduces the shared bilinear frame sampler. |
| 3 | Field Symmetry, then Symmetry | Reuses Phase 2's sampler; introduces the shared lattice helper Truchet needs. |
| 4 | Truchet Tiles | Lattice helper plus the existing cell hash; highest visual payoff per line. |
| 5 | Turing Field, Reaction Diffusion field output and presets | First stateful node of the set; needs the RAM row and a capacity gate. |
| 6 | Fourier Epicycles | PROGMEM coefficient tables and a validated custom-outline text field; the most UI. |
| 7 | Close-out | Starter patterns, design notes, support-matrix wording. |
| 8 | Vibe, Song Structure, Pitch, Waveform | The FastLED processor is already in the sketch, so each detector is a published global plus a browser port. |
| 9 | String Particles, seamless wrap, Wave Sim options, custom Path, Polar Gradient, gradient hue mode, Noise LFO, noise shaping and curl, Harmony Palette | Strings and rings have been second-class; every item is small and reuses Phases 0–6. |
| 10 | Fluid, Fractal, Automaton, Digital Rain, Gauge, five classics, three variants | The remaining large visual gaps, then the classics people expect. |
| 11 | Render scale, positioned layouts, colour profile, SD Video, segment networks | Output and layout work, executed through the hardware roadmap. |

## Phase 0 — Field helpers — **complete**

Implemented as part of the float-field vocabulary documented in
[ANIMartRIX patterns](../design/animartrix-float-field.md), with firmware
evidence in the [pattern-node compile record](../pattern-node-compile-checks.md).
The shipped node contracts, SDF-morph recipe and shared-helper architecture now
live in that design note. The compile record carries the reproducible generated
fixture, toolchain versions, source hash and resource figures.

## Phase 1 — Slice Tiling — **complete**

The shipped contract, paper provenance, lattice geometry, custom-bit format,
preset/morph behaviour and shared preview/firmware architecture live in the
[Slice Tiling design note](../design/slice-tiling.md). Classic ESP32 and
ESP8266 results, source hash and resource figures are in the
[pattern-node compile record](../pattern-node-compile-checks.md).

## Phase 2 — Frame Warp — **complete**

The shipped node contract, Milkdrop/projectM provenance, transform order, edge
policies and shared transition sampler live in the
[Frame Warp design note](../design/frame-warp.md). The real Frame Warp plus
Frame Feedback fixture, source hash and classic-ESP32 result are in the
[pattern-node compile record](../pattern-node-compile-checks.md).

## Phase 3 — Symmetry — **complete**

The shipped `FieldSymmetry` and `Symmetry` contracts, append-only group list,
fundamental-domain picture, transform order, sampling policy, and shared
preview/firmware fold live in the
[wallpaper symmetry design note](../design/symmetry-groups.md). The generated
two-node fixture, source hash, classic-ESP32 result, flash and RAM are in the
[pattern-node compile record](../pattern-node-compile-checks.md).

## Phase 4 — Truchet Tiles — **complete**

The shipped `Truchet` contract, square and hexagonal motif geometry,
lattice-specific fallback, rising-edge reroll state, deterministic hash, and
shared preview/firmware helper live in the
[Truchet Tiles design note](../design/truchet-tiles.md). The generated mixed-
lattice fixture, source hash, classic-ESP32 result, flash and RAM are in the
[pattern-node compile record](../pattern-node-compile-checks.md).

## Phase 5 — Turing Field and Reaction Diffusion companions — **complete**

The shipped `TuringField` contract, its toroidal summed-area-table step, the
two changes from the contract drafted here (one table instead of separable
blurs, and coarser scales taking the larger step), its RAM and cost, and
Reaction Diffusion's Field output and solver-tuned presets live in the
[Turing Field design note](../design/turing-field.md). The 16×16 and 32×32
fixtures, source hashes, and classic-ESP32 and ESP8266 results are in the
[pattern-node compile record](../pattern-node-compile-checks.md).

## Phase 6 — Fourier Epicycles — **complete**

The shipped `FourierEpicycles` contract, outline sampling and custom-point
rules, coefficient ordering, fractional harmonics, drawing order, the trail's
own state (3 bytes per LED, where this plan expected none) and the byte-exact
preview/firmware arithmetic live in the
[Fourier Epicycles design note](../design/fourier-epicycles.md). The 16- and
64-term fixtures, the 12 bytes of flash per term they measure, source hashes,
and classic-ESP32 and ESP8266 results are in the
[pattern-node compile record](../pattern-node-compile-checks.md).

## Phase 7 — Close-out — **complete**

- Three starters ship, appended after every shelf so no earlier pattern's
  positional id moves. **Breathing Rosette** (standard shelf) breathes a hex
  pinwheel Slice Tiling through Time → Sin → Map Range into `warp`.
  **Liquid Mirage** (standard) runs Worley Noise through Frame Warp, steered
  by two slow Field Noise offsets, into Frame Feedback. **Truchet Beat Maze**
  (audio shelf) rerolls a 10 PRINT Truchet maze on every Beat Detect beat and
  widens its lines with the bass. Each was tuned from renders at 16×16 and
  32×32; none uses a Formula or Code node, so none asks for trust. All three
  compile on classic ESP32, built from the shipped subgraphs themselves
  ([compile record](../pattern-node-compile-checks.md)).
- The README feature map names the Slice and Truchet tilings, Turing fields,
  the Reaction Diffusion presets and Fourier epicycles.
- Phases 0–6 are each a pointer to their design note.
- The support matrix is unchanged: no node is gated by board. Turing Field on
  ESP8266 was the one candidate; see the resolved decision below.

## Phase 8 — Audio detectors from FastLED's processor — **complete**

Vibe, Song Structure, Pitch Detect and Waveform shipped. Their contracts, the
FastLED detector each port mirrors and its thresholds, the browser-mirror
differences, the firmware registration and the payload rules live in the
[audio detectors design note](../design/audio-detectors.md). Two findings
changed the plan and are recorded there: FastLED's `Pitch` cannot voice on a
device (it needs 1102 samples and the I2S input supplies 512), so Pitch Detect
runs its arithmetic over the 512-sample chunk itself, and a baked show carries
none of these payloads, so they read inactive in a show preview and on the SD
card. Song Structure also exposes tempo stability. Chord detection remains
later, and the `PitchDetect` select is append-only. The compile evidence, the
per-node rows and the phase-level cost of all four together (about 55 KB of
flash and 5.3 KB of RAM) are in the
[pattern-node compile record](../pattern-node-compile-checks.md).

## Phase 9 — Strings, rings and small helpers

Strings and rings have been second-class: the particle and noise nodes are
authored for a rectangular canvas. FastLED's `fx/1d` effects show what a
string-first node looks like, and the rest of this phase is small helpers that
Phases 0–6 make cheap.

### String Particles (`StringParticles`, category `pattern`, subcategory `Simulations`)

- A 1-D particle system drawn along a track. Property `track` select
  `['row', 'column', 'ring']`: `row` is the middle row, which is a string's
  only row; `ring` is the inscribed circle through pixel centres that
  `ringSampleMap` reads, so the particles land on an LED Ring's pixels.
- Property `mode` select `['drift', 'meteors']`. `drift` is FastLED's
  Particles1d: a power level falling from 1 to 0 drives velocity, brightness
  and saturation together, with cyclic wrap and sub-pixel splats. `meteors` is
  Perlin Particle Punch: a noise bed, ambient particles spawned by `spawn`,
  and beat meteors with debris on `trigger`.
- Inputs `spawn` (float 0–1), `trigger` (bool), `speed`, `fade`, `paletteIn`;
  `count` stays a property because it sizes the pool, as in Particles.
- State: about 16 bytes per particle in an `instanceState` map and a static
  array on device. Sub-pixel rendering splits each particle across its two
  neighbouring track positions by coverage.

### Small helpers

- **Seamless wrap.** `wrapX` on `Noise` and `FieldNoise` samples the 3-D noise
  at `(cos θ, sin θ, y)` with `θ = 2πx / W`, the FireCylinder trick, so the two
  edges of the corkscrew canvas meet with no seam. Time advances along `y` or
  as a rotation of `θ`.
- **Wave Sim options.** `halfDuplex` clamps ripples to positive values so they
  read as water; `wrapX` makes the X axis cylindrical; a 1-row canvas already
  gives the 1-D wave and gets a test saying so.
- **Custom Path.** `Path.pathShape` gains `custom` with a `customPoints` text
  field drawn as a Catmull-Rom spline through the points, sharing Phase 6's
  point parser; the emitter bakes the resampled polyline into PROGMEM.
- **Polar Gradient** (`PolarGradient`, pattern, Shapes & Text): `paletteIn`,
  `angleOffset`, `spin`, `repeat`, `radialMix` (0 angle only, 1 radius only),
  `radialScroll`, all property inputs. Periodic in angle, so seamless on a
  ring.
- **Gradient hue direction.** `GradientFrame` and `GradientSampler` gain
  `mixMode` select `['rgb', 'hsvShort', 'hsvLong']`, FastLED's
  `SHORTEST_HUES` and `LONGEST_HUES`, through one shared hue-lerp helper;
  the `rgb` default keeps every saved graph identical.
- **Noise LFO** (`NoiseSignal`, category `signal`): `speed`, `min`, `max`,
  `octaves` (1–3), `seed`; a smooth random value, the FastLED modulator idiom
  that `Random` is not. Same documented `inoise` approximation gap as
  Field Noise.
- **Noise shaping and curl.** `noiseShape` select `['plain', 'ridged',
  'billow']` on `Noise`, `FieldNoise` and `FractalNoise` (ridged is
  `1 − |2n − 1|`, billow `|2n − 1|`); `worleyMode` `['f1', 'f2f1', 'edges']`;
  `flowMode` `['angle', 'curl']` on `FlowField` and `Boids`, where curl rotates
  the noise gradient by 90° for divergence-free flow, the gradient taken by
  central differences of the same noise on both sides.
- **Harmony Palette** (`HarmonyPalette`, category `color`, Palettes): `hue`
  (property input, degrees), `harmony` select `['complementary', 'analogous',
  'triadic', 'splitComplementary', 'tetradic']`, `saturation`, `value`,
  `spread`. A palette builder, so it joins `PALETTE_BUILDER_NODE_TYPES` by
  carrying no `palette` property.

Checklist:

- [x] String Particles: track helper shared with Gauge (Phase 10), both
      modes, library entry, evaluator, emitter, tests (a particle on the ring
      track lands on `ringSampleMap` indices; wrap continuity; pool never
      exceeds `count`), docs. Adds `ringLeds` for the ring track's length and
      `bed` for the meteors noise bed.
- [x] `wrapX` on Noise and Field Noise, built as a variance-preserving
      cross-fade of the field with itself shifted a canvas width rather than the
      plan's 3-D cylinder sample, so it works for all seven Noise variants and
      both sides share one rule. The seam is tested as no larger than the
      neighbouring-pixel gap. Corkscrew starter not yet switched to it.
- [x] Wave Sim `halfDuplex` and `wrapX`, plus the 1-row test. `wrapX` defaults on
      because the simulation always wrapped; off reflects the left and right
      edges, and Y still wraps.
- [x] Custom Path with the shared point parser and the PROGMEM polyline (128
      points, 1 KB of flash; a uniform Catmull-Rom spline resampled by length).
- [x] Polar Gradient node.
- [x] Gradient `mixMode` on both gradient nodes with a golden test that `rgb`
      is byte-identical to today.
- [x] Noise LFO node, with `speedRange.ts` entry (compile check still open).
- [x] Noise shaping, Worley modes and curl flow, each with a variation test
      and the emitted block per mode. Curl is on Flow Field only: Boids has no
      noise to take the curl of (it steers by flocking rules), so the plan's
      Boids half has nothing to attach to.
- [x] Harmony Palette node, joining the palette-producer classification test.
- [x] README Patterns, Signals and Color lines; node cards; design note
      `docs/development/design/strings-and-rings.md` for the track contract.
- [x] Compile check on classic ESP32 and ESP8266 with a string-only graph, plus a ring and a matrix graph on ESP32 (and the ring on ESP8266); recorded in `docs/development/pattern-node-compile-checks.md`.

## Phase 10 — Simulations and classics

The remaining large visual gaps, then the classics people expect from an LED
tool. Each has a settled algorithm and a known cost.

### Fluid (`FluidSim`, category `field`)

- Stam's stable fluids at LED resolution. Inputs `inject` (float, dye per
  frame), `injectX`, `injectY` (0–1), `forceX`, `forceY` (fields, a per-pixel
  stirring force so a Field Formula can drive it), `trigger` (bool, a puff),
  `viscosity`, `diffusion`, `dissipation`, `speed` (solver iterations 4–20).
- Outputs `field` (dye) plus `velocityX` and `velocityY` (fields centred on
  0.5) so Frame Warp can advect a frame by the flow.
- State: velocity, previous velocity, dye and previous dye, six floats per
  cell, so a row `FluidSim: 24` in `STATEFUL_EXTRA_BYTES_PER_LED`. Cost is
  about four passes per iteration; the default is eight iterations and the
  capacity verdict prices it on large panels.

### Fractal (`FractalField`, category `field`)

- `fractalType` select `['julia', 'mandelbrot', 'newton', 'burningShip']`;
  `cRe`, `cIm` (property inputs, so a Sin and Cos morph a Julia set), `zoom`,
  `centerX`, `centerY`, `spin`, `iterations` (8–64), `smooth` (bool, smooth
  escape count). Output is the normalised escape time, or root index and shade
  for Newton. Up to `iterations` complex multiplies per pixel; the capacity
  verdict caps iterations on large panels.

### Automaton (`Automaton`, category `field`)

- `automatonType` select `['elementary', 'cyclic', 'brianBrain', 'sand']`;
  `rule` (0–255) for elementary, which keeps a ring of rows and scrolls;
  `states` and `threshold` for cyclic; `spawn` (float) for sand; `speed` in
  steps per second as Game of Life; `seed`; `reset` (bool). One byte per cell
  plus a next buffer, row `Automaton: 2`. Output is `state / (states − 1)`.

### Digital Rain (`DigitalRain`, category `pattern`, subcategory `Generative`)

- `paletteIn` (default a green ramp), `density`, `speed`, `tailLength`,
  `flicker`, `direction` select `['down', 'up', 'left', 'right']` so a string
  runs it along its length. State per column: head, speed, length. Glyph
  flicker comes from the per-cell hash.

### Gauge (`Gauge`, category `pattern`, subcategory `Shapes & Text`)

- `value` (float 0–1, property input; a Map Range upstream converts sensor
  units), `base` frame, `paletteIn`, `gaugeStyle` select `['bar', 'ring',
  'arc', 'dot']`, `direction`, `segments` (0 continuous), `peakHold` (s),
  `thickness`, `arcStart`, `arcSweep`. `ring` and `arc` draw along the
  inscribed circle through Phase 9's track helper, so an LED Ring reads them.
  Live example: Environment Sensor → Map Range → Gauge. This is the display
  consumer the sensor nodes lack.

### The classics, one afternoon each

- `Candle` (Generative): `mode` `['single', 'perPixel']`, `flicker`, `warmth`;
  noise-driven brightness and hue jitter.
- `Lightning` (Generative): `rate` (strikes per minute), `intensity`,
  `trigger` (bool), `color`; a strike is two to five flashes with random gaps
  and a dim afterglow.
- `Heartbeat` (Generative): `bpm` (property input, wire Beat Detect's),
  `color` or `paletteIn`, `strength`; the lub-dub double pulse as a brightness
  envelope.
- `Sunrise` (Generative): `progress` (0–1 property input from Counter,
  Envelope or Schedule Trigger), or `duration` and `start` for a self-running
  ramp; palette night blue → deep red → orange → warm white with a gamma-shaped
  brightness ramp.
- `TVSimulator` (Generative): seeded scene cuts between random colour blocks
  with slow drifts; `cutRate`, `brightness`.
- Three variants rather than nodes: `Pride2015` gains a `paletteIn` port that,
  when wired, makes it Kriegsman's colorwaves and leaves unwired graphs
  untouched; `Fire` gains `fireStyle` `['classic', 'smoke']`, Fire2023's second
  noise layer dimming the flame; `Particles` gains `luminova`, Perlin-steered
  spiralling emitters with blurred trails.

Checklist:

- [ ] Fluid: solver in `src/state/evaluator/fluid.ts` with tests (mass of dye
      decays by `dissipation`; a puff spreads symmetrically; velocity stays
      finite), node, emitter with a C++ solver helper behind `needsFluid`, RAM
      row, capacity test.
- [x] Fractal: the four types, wired `c`, emitted block per type, an
      iteration cap test. Iterations are capped at 64 by clamp; the capacity
      verdict prices RAM only, so it does not cap them on large panels.
- [x] Automaton: the four types, rule and state tests (rule 90 makes the
      Sierpinski triangle from one seed cell), RAM row. The cyclic test checks
      that a cell only ever advances one state; spirals are left to the eye.
- [x] Digital Rain with all four directions and a string test (a 1-row canvas
      runs left and right along its length).
- [ ] Gauge with the four styles and the sensor live example.
- [x] Candle, Lightning, Heartbeat, Sunrise, TV Simulator: stateless or
      near-stateless on one shared integer hash (`classics.ts`), so the preview
      and the sketch agree on every random draw. Lightning keeps a strike
      schedule; the rest are pure functions of `t`. Compile check still open.
- [ ] Pride palette port, Fire smoke style, Particles luminova variant, each
      with a golden test that the default is unchanged.
- [ ] README Patterns and Fields lines; node cards; `patternRating` sets;
      design note `docs/development/design/simulation-fields.md`.
- [ ] Compile check on classic ESP32 and ESP8266; RAM at 16×16 and 32×32
      for Fluid and Automaton.

## Phase 11 — Output, layout and media follow-ons

These came out of the same review but are output, layout or media work, not
pattern nodes. They are listed here so the order is in one place, and executed
through step 11 of the
[hardware expansion roadmap](hardware-expansion-roadmap.md#suggested-implementation-order).

- [ ] **Render scale.** A per-output `renderScale` select `['1', '1/2']` that
      renders the graph at half resolution and upscales bilinearly, the
      counterpart of the existing `supersample` (FastLED's `scale_up`); the two
      are mutually exclusive, and the capacity verdict prices the render size.
- [ ] **Positioned string layouts.** A `positions` layout for strings: one
      `(x, y)` in canvas units per LED, sampled bilinearly and emitted as a
      PROGMEM table like `ringMap`, with the Sailboat catenary as a preset; the
      preview and Build Diagram draw LEDs where they sit. FastLED's ScreenMap.
- [ ] **Colour profile.** A per-output `colorProfile` select from
      `fl::profiles`, emitted through `ChannelOptions::setColorProfile`, and a
      per-output white point through `FastLED.setTemperature`, which is not
      emitted today; document that dimming through the profile is linear flux.
- [ ] **SD Video.** An `SDVideo` node reading MPEG1 or JPEG frames from the
      card through FastLED's codec module and `fl::Video`, decoded in the
      browser for the preview and provisioned through the existing SD upload;
      frame-rate and bandwidth limits recorded per board.
- [ ] **Segment networks.** A layout where strings are edges of a graph and a
      `Ripple` pattern travels node to node with turning rules, the Chromancer
      model; long-term, since it needs a layout editor.
- [ ] Add step 11 to the hardware roadmap pointing here.

## Budget

Own field buffers cost 4 bytes per LED and own frame buffers 3, as for every
field and frame node today; the table lists only what a node adds beyond that.

| Node | Extra RAM per LED | Flash | Per-pixel work per frame |
|---|---|---|---|
| Field Levels, Field Lerp, Shape Field | 0 | small | a few operations |
| Slice Tiling | 0 | small | one `atan2` plus `depth` matrix multiplies |
| Frame Warp | 0 | small | four reads and three lerps per channel |
| Field Symmetry, Symmetry | 0 | small | one fold and one sample |
| Truchet Tiles | 0 | small | one hash and two or three distances |
| Turing Field | 8 bytes, plus one row and column | small | a summed-area table, then eight reads per scale, per iteration |
| Fourier Epicycles | 3 bytes, the trail | 12 bytes per harmonic | per frame, not per pixel: `harmonics` sines and cosines, plus the ring scans |
| Vibe, Song Structure, Pitch | 0 | FastLED's detector code | per frame, inside the processor |
| Waveform | 512 bytes once, for the sample ring | small | one segment per column |
| String Particles | 16 bytes per particle | small | per particle, not per pixel |
| Polar Gradient, Noise LFO, Harmony Palette | 0 | small | trivial |
| Fluid | 24 bytes | small | about four passes per solver iteration |
| Fractal | 0 | small | up to `iterations` complex multiplies |
| Automaton | 2 bytes | small | one neighbourhood read |
| Digital Rain | 12 bytes per column | small | one hash |
| Gauge and the classics | 0 | small | trivial |

## Open decisions

- **Slice Tiling split fraction per level.** The contract applies `warp` at
  every level for self-similarity; the paper perturbs the second level only.
  Try both in the preview before the emitter is written; whichever reads
  better on 16×16 wins, and the other is not kept as an option.
- **Symmetry's source region.** Kaleidoscope reads the source near its
  centre. If a full-canvas source reads better for images, add a
  `sourceScale` knob rather than changing the default later.
- **Vibe's relative levels.** They are about 1.0 at the song's average and
  unbounded above by design. Decide whether the node also offers clamped
  0–1 copies, or leaves that to a Map Range so the contract stays honest.
- **Turing Field on ESP8266 — resolved, no gate.** The node costs 12 bytes
  per LED with its field buffer, and a 32×32 fixture holding it and Reaction
  Diffusion compiled at 88% of ESP8266 RAM. The RAM estimate prices the node
  exactly and the capacity check measures the real build, so the support
  matrix does not mark it.
