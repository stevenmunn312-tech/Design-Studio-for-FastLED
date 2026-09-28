# Pattern node expansion — tiling, warp, Turing and Fourier nodes

Status: **in progress — Phases 0–4 complete** · Owner: app · Date: 2026-09-28

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

## Phase 5 — Turing Field, and Reaction Diffusion's field output

The labyrinthine "Turing pattern" look is McCabe's multi-scale algorithm, not
Gray-Scott, and it deserves its own field node. Two cheap companion changes
land with it: a `field` output on Reaction Diffusion, and named feed/kill
presets.

### Turing Field (`TuringField`, category `field`)

Contract:

- Inputs: `reset` (bool), `speed` (float, iterations per frame, 1–4),
  `stepSize` (float 0.01–0.2). Property inputs: `speed`, `stepSize`.
  Properties: `scales` slider 2–5, `baseRadius` slider 1–8 (px), `seed`.
- State: one float per pixel `a`, plus two scratch float arrays for the
  separable box blur. Initialised from `seededHash` noise in −1..1.
- Per iteration: for each scale `k`, activator `= box(a, r_k)` and inhibitor
  `= box(a, 2·r_k)` with `r_k = baseRadius · 2^k`, both toroidal, both by
  running-sum passes; per pixel keep the scale with the smallest
  `|activator − inhibitor|`; step `a` by `±stepSize / (k + 1)` toward the
  winning scale's sign; renormalise `a` to −1..1 by its min and max. Output
  `(a + 1) / 2`.
- RAM: 12 bytes per LED beyond the node's own field buffer, so a row
  `TuringField: 12` in `STATEFUL_EXTRA_BYTES_PER_LED`.
- Cost: `2 · scales` separable blurs per iteration, each O(1) per pixel.
  Trivial at 16×16; on a 64×64 panel with five scales it is the heaviest
  node in the library, so the capacity verdict must price it and the default
  is three scales.

### Reaction Diffusion companions

- Add `{ id: 'field', label: 'Field', dataType: 'field' }` to
  `ReactionDiffusion`'s outputs; the evaluator returns the `v` array as the
  field, the emitter writes `ownField()` from `_v` beside the palette pass,
  following the `Noise` dual-output precedent.
- Add `rdPreset` select `['custom', 'spots', 'stripes', 'worms', 'coral',
  'mitosis']` with the feed/kill pairs in a shared
  `src/state/reactionDiffusionPresets.ts`; `feed` and `kill` are read from the
  table unless the preset is `'custom'`, and `isPropertyEnabled` dims them
  otherwise, so a wire into a dimmed knob draws dark rather than lying.

Checklist:

- [ ] Multi-scale step in `src/state/evaluator/turing.ts` with a test that a
      flat field stays flat, a seeded field stays in −1..1, and the output
      differs between `scales = 2` and `scales = 4`.
- [ ] Preview handler with `instanceState` keyed by `stateKey(id)`, reset on
      canvas size change and on the `reset` edge.
- [ ] Emitter with `static float` arrays, a running-sum box blur helper in
      `src/codegen/turingHelperCpp.ts` behind `needsTuring`.
- [ ] `STATEFUL_EXTRA_BYTES_PER_LED` row and a `capacityStore` test that a
      64×64 graph with five scales is priced as such.
- [ ] Reaction Diffusion `field` output, evaluator and emitter, with a test
      that the field equals the frame's palette index per pixel.
- [ ] Reaction Diffusion presets, shared table, gating, and a
      `propertyInputFallbacks` check that `feed`/`kill` literals are unchanged.
- [ ] Library entries, README, node cards, `patternRating` ambient set,
      design note `docs/development/design/turing-field.md`.
- [ ] Compile check on classic ESP32 and ESP8266; record RAM at 16×16 and
      32×32.

## Phase 6 — Fourier Epicycles (`FourierEpicycles`, category `pattern`, subcategory `Shapes & Text`)

Take the discrete Fourier transform of a closed outline and draw it with nested
rotating circles, a pen and a trail. The Harmonics knob is the detail level,
and animating it morphs a circle into the full outline.

Contract:

- Inputs, in this order: `base` (frame), `color` (color), `harmonics` (float),
  `speed` (float), `scale` (float), `thickness` (float), `persistence`
  (float), then `r`, `g`, `b` channel ports last, as the other colour nodes
  declare them. Property inputs: all of the floats and the colour channels.
- Properties: `outline` select `['circle', 'heart', 'lissajous', 'rose',
  'star', 'square', 'infinity', 'custom']` (the first four are the `Path`
  shapes), `customPoints` text (`x,y` pairs in −1..1, up to 128), `maxHarmonics`
  slider 4–64, `showCircles: true`, `showPen: true`.
- Generation time, shared `src/state/fourierOutline.ts`: sample the outline
  at 128 points, DFT, keep the `maxHarmonics` largest coefficients as
  `(frequency, amplitude, phase)` sorted by amplitude. The evaluator computes
  the same table once per outline and caches it in an `evaluatorCache`; the
  emitter bakes it as `static const float _fe_<id>[][3] PROGMEM`.
  `maxHarmonics` sizes that array, so it stays a property, as `Particles`'
  `count` does; the wired `harmonics` is clamped to it at runtime.
- Per frame: `θ = t · speed`; pen `= Σ amp_k · e^{i(freq_k·θ + phase_k)}` over
  the first `harmonics` coefficients; draw each circle as a thin ring through
  the shared SDF helper when `showCircles`, splat the pen with `splatDisc`,
  and fade the node's own buffer in place with `persistence`, the technique
  `FormulaPoints` already uses for its trails.
- `customPoints` is parsed to numbers on the TypeScript side; anything else
  falls back to the circle. The text never reaches C++.
- Cost: `harmonics` sines and cosines per frame plus the splats; 12 bytes of
  flash per harmonic.

Checklist:

- [ ] `src/state/fourierOutline.ts`: outline samplers, DFT, coefficient
      ordering, custom-point parsing, with tests that a circle yields one
      dominant coefficient and that the reconstruction error falls as
      harmonics rise.
- [ ] Preview handler in `src/nodes/shapes/evaluate.ts` with trail state in
      an `instanceState` map.
- [ ] Emitter in `src/nodes/shapes/codegen.ts` with the PROGMEM table and a
      per-frame accumulation loop; `emittedNumericLiterals` green.
- [ ] Library entry, `PROPERTY_META`, `isPropertyEnabled` for `customPoints`,
      `patternRating` accent set, `liveExamples` `selectedInputs` row
      (`harmonics`, `color`) and Trails as the finish, as the sparse shapes
      already get.
- [ ] Tests: pen position at `harmonics = 1` traces a circle; at the maximum
      it reaches every outline sample within a pixel; emitted table matches
      the evaluator's coefficients to four decimals.
- [ ] README Patterns line, node card, design note
      `docs/development/design/fourier-epicycles.md`.
- [ ] Compile check on classic ESP32; flash delta recorded at 16 and 64
      harmonics.

## Phase 7 — Close-out

- [ ] Three bundled starter patterns in `src/state/bundledPatterns.ts`: a
      Slice Tiling breathing on a Sin wired to `warp`; Noise through Frame
      Warp and Frame Feedback; Truchet rerolled by Beat Detect.
- [ ] README feature map sentence for fields and simulations names tilings,
      symmetry and Turing fields.
- [ ] Each shipped contract above replaced by a pointer to its design note.
- [ ] `docs/release/beta-support-matrix.md` unchanged unless a node is gated by
      board (Turing Field on ESP8266 is the one candidate).
- [ ] This document's status line updated.

## Phase 8 — Audio detectors from FastLED's processor

How the audio path is built today decides the shape of this phase.
`src/codegen/audioEngineCpp.ts` emits one `fl::audio::Processor` as
`_audioProcessor`, registers each lazy detector in `setup()` by touching its
getter, and publishes `_audioBass`, `_audioMids`, `_audioTreble`, `_audioBpm`,
`_audioBeat` and `_audioSpectrum[32]` once per frame. The analysis nodes in
`src/nodes/audio/codegen.ts` derive their envelopes from that spectrum with the
same arithmetic the preview uses. In the browser, `src/audio/audioEngine.ts`
reads the microphone through an `AnalyserNode` and runs the FastLED-ported
analysis in `src/audio/fastledReactive.ts`, which already mirrors
FrequencyBands, BeatDetector and the sixteen-bin equaliser. The processor now
carries about twenty detectors, so a new detector is four small things: a
global the engine publishes, a browser mirror, an optional field on
`AudioSignal` in `src/state/evaluator/types.ts`, and a node that reads it.
Recorded previews and baked shows carry an `AudioOverride`, so every new field
is optional and an absent one reads as inactive. The offline song analysis in
`src/audio/essentiaCore.ts` already extracts key and mood, so the SD-show path
fills those from the analysis while the live path uses the mirror.

### Vibe (`Vibe`, category `audio`)

- Input `audio`. Outputs `bass`, `mid`, `treble`, `volume` (relative levels,
  about 1.0 at the song's running average, unbounded above), `bassAtt`,
  `midAtt`, `trebleAtt` (smoothed) and `bassSpike`, `midSpike`, `trebleSpike`
  (bool, immediate above smoothed). One knob, `gain`.
- It is the MilkDrop `bass_att` model FastLED ported: band energy over a slow
  symmetric EMA for the average, fast attack and slow decay for the smoothed
  copy, frame-rate independent. The Sailboat, hydropack, ElPanelReactive and
  MoodRing examples are all built on it.
- The levels are relative by contract, so they stay off `NORMALIZED_OUTPUTS`
  and Graph Health will ask for a Map Range into a 0–1 input, which is right.
- Firmware: publish `_audioVibeBass` and friends from `getVibeBass()`,
  `getVibeBassAtt()` and `isVibeBassSpike()`; register in `setup()` by touching
  `getVibeBass()`.

### Song Structure (`SongStructure`, category `audio`)

- Input `audio`. Outputs `downbeat` (bool pulse), `beatNumber` (1–4),
  `measurePhase` (0–1), `building` (bool), `buildupProgress` (0–1), `drop`
  (bool pulse), `dropImpact` (0–1), `tempoStable` (bool), `valence` (−1..1)
  and `arousal` (0–1) from the mood analyser.
- Firmware: callback-only events (`onDownbeat`, `onDrop`, `onTempoStable`,
  `onTempoUnstable`) become counters and flags the way `_audioBeatCount`
  already does; the rest are getters (`getMeasurePhase`,
  `getCurrentBeatNumber`, `getBuildupProgress`, `getDropImpact`,
  `getMoodValence`, `getMoodArousal`).
- Browser: ports of FastLED's downbeat, buildup, drop and mood detectors into
  `fastledReactive.ts`, written from the C++ with the same thresholds. These
  are the heaviest ports in the phase and get synthetic-signal tests: a 4/4
  click train with an accented first beat lands `downbeat` on beat one; a
  rising-energy sweep followed by a bass burst reads `building` then `drop`.

### Pitch (`PitchDetect`, category `audio`)

- Input `audio`. Outputs `hz`, `note` (MIDI 0–127), `noteOn` (bool pulse),
  `velocity` (0–1), `confidence`, `keyRoot` (0–11), `keyMinor` (bool).
- Firmware: `getPitch`, `getPitchConfidence`, `getCurrentNote`,
  `getNoteVelocity`, an `onNoteOn` counter, and `onKey` storing root and mode.
- Browser: a port of the pitch detector and the key detector's chroma
  profiles. Chord detection is a later slice; the select is append-only.

### Waveform (`Waveform`, category `pattern`, subcategory `Audio-Reactive`)

- Inputs `base` (frame), `audio`, `gain`, `paletteIn`. Properties `style`
  select `['line', 'filled', 'mirror', 'ring']`, `thickness`, `smoothing`.
- Needs raw samples: `AudioSignal` gains an optional `samples` field, 128
  values decimated from the time buffer `audioEngine.ts` already fills with
  `getFloatTimeDomainData`; the engine sketch decimates
  `_audioProcessor->getSample()` into `_audioWave[128]` the same way.
- `ring` draws the trace around the inscribed circle that `ringSampleMap`
  reads, so an LED Ring shows it; `line` runs across the width.

Checklist:

- [ ] Optional `vibe`, `structure`, `pitch` and `samples` fields on
      `AudioSignal`; `recordAudio.ts` and the show bake carry them; the song
      analysis fills key and mood where it has them; every reader treats an
      absent field as inactive, with a test on a legacy payload.
- [ ] `audioEngineCpp.ts`: publish the new globals, register each detector in
      `setup()`, convert callback-only events to counters and flags, and add
      them to the serial debug line.
- [ ] Port Vibe into `fastledReactive.ts` with a trace test: spikes fire on
      each pulse of a synthetic bass train and levels settle near 1.0 on a
      steady tone.
- [ ] Vibe node: library entry, evaluator, emitter with the no-audio fallback
      the other analysis nodes use, description saying what 1.0 means, live
      example mic → Vibe → Map Range → Brightness.
- [ ] Port downbeat, buildup, drop and mood; Song Structure node with the
      synthetic-signal tests above.
- [ ] Port pitch and key; Pitch node with a test on a synthetic 440 Hz tone
      reading note 69.
- [ ] Waveform node, the `samples` payload, and the firmware decimation.
- [ ] Docs: README Audio and Patterns lines, node cards, design note
      `docs/development/design/audio-detectors.md` naming the FastLED detector
      each port mirrors and its thresholds; support-matrix wording that the
      detectors are experimental until a bench row with a real microphone.
- [ ] Compile check on classic ESP32 and ESP32-S3 with the INMP441 config,
      recording the RAM and flash delta, since each lazy detector allocates.

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

- [ ] String Particles: track helper shared with Gauge (Phase 10), both
      modes, library entry, evaluator, emitter, tests (a particle on the ring
      track lands on `ringSampleMap` indices; wrap continuity; pool never
      exceeds `count`), docs.
- [ ] `wrapX` on Noise and Field Noise with a test that column 0 and column
      W equal each other; corkscrew starter updated to use it.
- [ ] Wave Sim `halfDuplex` and `wrapX`, plus the 1-row test.
- [ ] Custom Path with the shared point parser and the PROGMEM polyline.
- [ ] Polar Gradient node.
- [ ] Gradient `mixMode` on both gradient nodes with a golden test that `rgb`
      is byte-identical to today.
- [ ] Noise LFO node, with `speedRange.ts` entry.
- [ ] Noise shaping, Worley modes and curl flow, each with a variation test
      and the emitted block per mode.
- [ ] Harmony Palette node, joining the palette-producer classification test.
- [ ] README Patterns, Signals and Color lines; node cards; design note
      `docs/development/design/strings-and-rings.md` for the track contract.
- [ ] Compile check on classic ESP32 and ESP8266 with a string-only graph.

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
- [ ] Fractal: the four types, wired `c`, emitted block per type, an
      iteration cap test.
- [ ] Automaton: the four types, rule and state tests (rule 90 makes the
      Sierpinski triangle from one seed cell; cyclic converges to spirals),
      RAM row.
- [ ] Digital Rain with all four directions and a string test.
- [ ] Gauge with the four styles and the sensor live example.
- [ ] Candle, Lightning, Heartbeat, Sunrise, TV Simulator.
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
| Turing Field | 12 bytes | small | `2 · scales` blur passes per iteration |
| Fourier Epicycles | 0 | 12 bytes per harmonic | per frame, not per pixel: `harmonics` sines and cosines |
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
- **Turing Field on ESP8266.** Twelve bytes per LED is fine at 256 LEDs and
  not at 1024. Decide whether the capacity verdict alone is enough or whether
  the support matrix should mark the node experimental on that board.
