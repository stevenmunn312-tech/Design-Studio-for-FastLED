# Pattern node expansion — tiling, warp, Turing and Fourier nodes

Status: **proposal, not started** · Owner: app · Date: 2026-09-27

An ordered, checkboxed plan for ten new pattern-creation nodes. It came out of
a review of the library against two sources: the space-subdivision pattern
method in Scandurra, Laccone, Malomo, Callieri, Cignoni and Giorgi,
*Procedural generation of geometric patterns for thin shell fabrication*,
Computers & Graphics 122 (2024) 103958
([open PDF](http://vcgdata.isti.cnr.it/Publications/2024/SLMCCG-ProceduralPatterns/SLMCCG-ProceduralPatterns.pdf),
[publisher record](https://www.sciencedirect.com/science/article/pii/S0097849324000931)),
and the Milkdrop per-pixel warp model behind
[projectM](https://github.com/projectM-visualizer/projectm-eval).

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

## Phase 0 — Field helpers

Three small field nodes. None holds state; each is one loop per pixel.

### Field Levels (`FieldLevels`, category `field`)

Contract:

- Inputs, in this order: `field` (field), `low` (float), `high` (float).
  Property inputs: `low`, `high`. Properties: `low: 0`, `high: 1`,
  `steps: 1` (slider 1–16; 1 means no quantising), `invert: false`.
- Per pixel: `v = clamp01((f - low) / max(1e-4, high - low))`; if
  `steps >= 2`, `v = round(v * (steps - 1)) / (steps - 1)`; if `invert`,
  `v = 1 - v`. `low` at or above `high` is a hard threshold at `low`.
- `low` and `high` are 0–1 sliders, so an audio band wired straight in is
  already in range and Graph Health stays quiet.

### Field Lerp (`FieldLerp`, category `field`)

Contract:

- Inputs: `a` (field), `b` (field), `t` (float). Property input: `t`.
  Property: `t: 0.5`, slider 0–1.
- Per pixel: `a * (1 - t) + b * t`, unwired inputs read as zero fields the
  way `FieldMath` treats them. Deliberately a separate node rather than a
  `FieldMath` op, because it has a third port and matches the scalar `Lerp`.

### Shape Field (`ShapeField`, category `field`)

Contract:

- Inputs: `cx`, `cy` (float, normalised 0–1 like `DistanceField`), `size`
  (float, fraction of the shorter side), `rotation` (deg), `sides` (float,
  continuous like `Shape`), `aspect`. All property inputs. Properties:
  `shape` select `['circle', 'rect', 'polygon']`, `fieldMode` select
  `['fill', 'distance']`, `softness: 0.1`, `range: 0.5`.
- `fill` outputs coverage with a soft edge of `softness`. `distance` outputs
  the signed distance mapped so the outline sits at 0.5, inside rising to 1
  and outside falling to 0 over `range` of the shorter side. `distance` is
  what makes shape morphing work: Field Lerp between two Shape Fields, then
  Field Levels at `low = high = 0.5`, is the standard SDF morph.
- The signed-distance helpers move out of `src/nodes/shapes/evaluate.ts`
  (`polygonSd`, the rect and ellipse expressions inside `evalShape`) into a
  new `src/state/evaluator/sdf.ts` that both the Shape node and this node
  import. The C++ twins go in a new `src/codegen/sdfHelperCpp.ts` behind a
  `needsSdf` flag on `SketchEmitContext`; the Shape emitter switches to it in
  the same change so there is one polygon SDF in the sketch, not two.

Checklist:

- [ ] Extract `src/state/evaluator/sdf.ts` from the Shape evaluator, with a
      test that the Shape node's frames are byte-identical before and after.
- [ ] Add `src/codegen/sdfHelperCpp.ts` and `needsSdf`; switch the Shape
      emitter to the shared helper; `cppGenerator.test.ts` asserts the helper
      is emitted once when two SDF nodes are present.
- [ ] Field Levels: library entry, preview, firmware, tests, docs (per-node
      checklist).
- [ ] Field Lerp: the same.
- [ ] Shape Field: the same, plus a morph test (lerp of a circle and a square
      through Levels stays a single closed region at every `t`).
- [ ] Place the three in `CATEGORY_NODE_ORDER.field` between `FieldMath` and
      `FieldWarp`; README Fields line and counts; node cards regenerated.
- [ ] Compile check: one fixture using all three, classic ESP32.

## Phase 1 — Slice Tiling (`SliceTiling`, category `field`)

The paper's section 4, turned into a stateless per-pixel field. A regular
polygon is a fan of isosceles triangles from its centre; a *slice* is one fan
triangle recursively split one-to-four with each sub-triangle solid or void;
rotating the slice around the centre gives the polygon's pattern, and a lattice
of those polygons tiles the plane. Section 6's vertex perturbation becomes a
wireable knob so the geometry morphs continuously.

Contract:

- Inputs (all property inputs): `cells` (float, polygons across the canvas
  width, slider 0.5–8, default 1), `rotation` (deg), `spin` (deg/s), `warp`
  (float −1..1), `morph` (float 0–1), `edge` (float 0–0.5). Output `field`.
- Properties: `lattice` select `['hex', 'square', 'triangle']`, `depth`
  slider 1–3, `symmetry` select `['rotational', 'dihedral']`, `preset` select
  (named bit patterns plus `'custom'`), `bits` and `bitsB` hex strings of
  `4^depth` bits (enabled only while `preset` is `'custom'`).
- Per frame: sector `= 2π / n` with `n` the polygon's side count; the
  radial-edge split fraction `s = clamp(0.5 + 0.3 * warp, 0.2, 0.8)`; the base
  edge split stays at 0.5 so adjacent polygons still meet (the paper's
  tileability rule); the four child-triangle maps per level are precomputed as
  barycentric 3×3 matrices from those split points.
- Per pixel: scale pixel centre into lattice units by `cells / W`, rotate by
  `−(rotation + spin·t)`; find the containing cell (square: round; hex: axial
  rounding; triangle: row parity, flipping `y` for a down-pointing cell); take
  local coordinates from the cell centre; fold the angle into one sector, and
  for `dihedral` reflect odd sectors; convert to barycentric coordinates of the
  fan triangle; walk `depth` levels, at each classifying the point by the
  three half-plane tests against the split points and multiplying by that
  child's matrix, accumulating the leaf index `leaf = leaf * 4 + child`; read
  bit `leaf` of `bits` and of `bitsB`; output
  `lerp(bitA, bitB, morph) * smoothstep(0, edge, min(λ0, λ1, λ2))`, so `edge`
  fades each solid triangle inward from its boundary and 0 is a hard fill.
- The `bits` string is a flat leaf string, a superset of the paper's tree
  encoding (a void parent with solid children is expressible). Presets ship
  a dozen named strings chosen by eye from the paper's figures, in a shared
  `src/state/sliceTiling.ts` that both sides read; an unparseable custom
  string renders all-solid.
- Readability sets the useful depth on a small matrix:

  | Depth | Leaves per slice | Reads on a 16×16 matrix at |
  |---|---|---|
  | 1 | 4 | two or three polygons across |
  | 2 | 16 | one polygon filling the matrix |
  | 3 | 64 | 32×32 and up |

- Cost: no state; per pixel one `atan2`, a few dozen float operations and
  `depth` matrix multiplies. Cheaper than Field Noise.

Checklist:

- [ ] `src/state/evaluator/lattice.ts`: `squareCell`, `hexCell`, `triCell`
      and `fanFold`, with unit tests on cell centres and sector folding
      (every pixel maps to exactly one cell; fold is idempotent).
- [ ] `src/codegen/latticeHelperCpp.ts` behind `needsLattice`, same three
      cell finders and the fold as `static inline` functions.
- [ ] `src/state/sliceTiling.ts`: bit-string parsing to a byte array, the
      preset table, and the per-frame child-matrix builder, exported for both
      sides.
- [ ] Preview handler in `src/nodes/field/evaluate.ts`.
- [ ] Emitter in `src/nodes/field/codegen.ts`: presets and parsed bytes land
      as `static const uint8_t _bits_<id>[8]` literals, never as text.
- [ ] Library entry: ports in the order above, `isPropertyEnabled` disables
      `bits`/`bitsB` unless `preset` is `'custom'`, `edge`/`morph`/`warp`
      ranges in `PROPERTY_META`, `CATEGORY_NODE_ORDER.field` after Field
      Noise.
- [ ] Tests: every preset at depths 1–3 is deterministic and within 0–1; a
      pixel's leaf index agrees between a direct TypeScript walk and the
      evaluator; `warp = 0` reproduces the midpoint subdivision exactly;
      `morph` interpolates leaf-wise; the emitted C++ block per lattice.
- [ ] Parity test: evaluate the C++ block with a small interpreter is out of
      scope, so instead assert the emitted code contains the same split
      fraction, sector and preset bytes the evaluator used for that node.
- [ ] Docs: README, node card, `NODE_DESCRIPTIONS`, help copy for `bits`
      (hex, `4^depth` bits, leaf order), design note
      `docs/development/design/slice-tiling.md` citing the paper's sections
      4 and 6.
- [ ] Compile check on classic ESP32 and ESP8266 (integer-heavy, so the
      8266 is the interesting one).

## Phase 2 — Frame Warp (`FrameWarp`, category `composite`)

Milkdrop's signature is a per-pixel displacement of the previous frame, fed
back each frame. `FieldWarp` displaces fields only and `FrameFeedback` applies
one global rotate, scale or translate. This node displaces a *frame* by two
fields, and inside a Frame Feedback loop gives zoom, swirl and smear from any
Field Formula written in `r` and `angle`.

Contract:

- Inputs, in this order: `frame` (frame), `dx` (field), `dy` (field),
  `strength` (float, pixels), `zoom` (float), `rotate` (deg). Property inputs:
  `strength`, `zoom`, `rotate`. Properties: `strength: 2`, `zoom: 1`,
  `rotate: 0`, `edgeMode` select `['clamp', 'wrap', 'black']`, `sampling`
  select `['bilinear', 'nearest']`.
- Per pixel: start from the pixel centre, apply the inverse of `zoom` about the
  canvas centre and the inverse of `rotate`, then add
  `(2·dx − 1) · strength` and `(2·dy − 1) · strength`; sample the source
  there. An unwired offset field means no push, as in `FieldWarp`.
- Bilinear sampling is the default because nearest sampling makes a rotating
  edge shimmer; the transition sampler in `src/nodes/show/evaluate.ts` and
  `_sampleShaded` in `src/codegen/transitionHelperCpp.ts` already say why.
  This phase moves that pair into a shared `sampleFrame` in
  `src/state/evaluator/frames.ts` and a `src/codegen/frameSampleHelperCpp.ts`
  behind `needsFrameSample`, adding the three edge modes; the transition
  code switches to the shared pair in the same change.
- Cost: four reads and three lerps per channel per pixel; no state beyond the
  node's own buffer.

Checklist:

- [ ] Shared `sampleFrame(frame, fx, fy, edgeMode, bilinear)` in
      `src/state/evaluator/frames.ts`; transitions re-pointed at it with the
      existing transition golden tests unchanged.
- [ ] `src/codegen/frameSampleHelperCpp.ts` and `needsFrameSample`; the
      transition helper re-pointed; `emittedSymbols.test.ts` still green.
- [ ] Preview handler in `src/nodes/composite/evaluate.ts`.
- [ ] Emitter in `src/nodes/composite/codegen.ts`.
- [ ] Library entry (Effects), `PROPERTY_META` for `edgeMode`/`sampling`,
      `strength` slider 0–8, `zoom` 0.25–4.
- [ ] Tests: identity when nothing is wired and `zoom = 1`; a constant `dx`
      field shifts the frame by `strength`; `wrap` versus `clamp` versus
      `black` at the border; bilinear at integral coordinates reads exactly
      one pixel; emitted block per edge mode.
- [ ] Live example: Noise → Frame Warp with two Field Formulas on `dx`/`dy`
      → Frame Feedback, so the help page shows the feedback loop.
- [ ] Docs, node card, README Effects line; design note
      `docs/development/design/frame-warp.md` naming the Milkdrop model and
      the projectM-eval decision above.
- [ ] Compile check on classic ESP32.

## Phase 3 — Symmetry

Fold the plane into the fundamental domain of a wallpaper group and sample the
source there. One shared fold, two thin nodes: a field node first, because
Field to Frame is one node away, then a frame node for images and finished
patterns.

Contract:

- Groups, first slice: `p1`, `p2`, `pm`, `pmm`, `p4`, `p4m` on the square
  lattice and `p3`, `p6`, `p6m` on the hex lattice. `cm`, `pg`, `pgg`,
  `p3m1`, `p31m` and `p4g` are a later slice; the select is append-only.
- Inputs (property inputs): `cells` (float, cells across the width), `rotation`
  (deg), `spin` (deg/s), `offsetX`, `offsetY` (cells, for scrolling). Property:
  `group` select.
- Per pixel: lattice cell and local coordinates from Phase 1's lattice
  helper; fold by the group (translate, half-turn, mirror, quarter-turn,
  45° wedge, 120° or 60° sector, 30° wedge); map the fundamental domain onto
  the centre of the source canvas the way Kaleidoscope reads its source, so
  the interesting part of the input is what gets repeated; sample with
  nearest for a field and Phase 2's `sampleFrame` for a frame.
- Cost: one fold and one sample per pixel; no state.

Checklist:

- [ ] `foldWallpaper` in `src/state/evaluator/symmetry.ts` with a table
      test: for every group, folding twice equals folding once, and the image
      of a cell under the group's generators lands on the same domain point.
- [ ] `src/codegen/symmetryHelperCpp.ts` behind `needsSymmetry`, one
      `static inline` fold with a `switch` on the group id.
- [ ] Field Symmetry (`FieldSymmetry`, category `field`): preview, emitter,
      library entry, tests, docs.
- [ ] Symmetry (`Symmetry`, category `composite`): the same, sampling through
      Phase 2's helper.
- [ ] README Fields and Effects lines; node cards; design note
      `docs/development/design/symmetry-groups.md` with a picture of each
      group's fundamental domain.
- [ ] Compile check on classic ESP32.

## Phase 4 — Truchet Tiles (`Truchet`, category `field`)

A lattice of cells, each drawing one motif in a random orientation chosen by a
per-cell hash. Output the distance to the nearest arc as a glowing line field.

Contract:

- Inputs: `reroll` (bool, rising edge picks a new epoch), `cells` (float),
  `lineWidth` (float, fraction of a cell), `scroll` (float, cells/s),
  `rotation` (deg). Property inputs: `cells`, `lineWidth`, `scroll`,
  `rotation`. Properties: `lattice` select `['square', 'hex']`, `motif`
  select `['arcs', 'diagonals', 'smith', 'hexArcs', 'tenPrint']`, `seed`.
- Per cell: `h = worleyHash(cellX + epoch·31, cellY − epoch·17)`, the hash
  the Worley variant of Noise already emits as `_worleyHash` behind
  `needsWorley`, so both sides agree on orientation for free; orientation
  `k = floor(h · orientations)`.
- Per pixel: distance to the motif's arcs or segments in the oriented cell;
  `field = 1 − smoothstep(0, lineWidth, d)`.
- State: only the epoch counter and the previous `reroll` value, in an
  `instanceState` map and two `static` locals, as `WaveSim` keeps its trigger.
- Cost: hash plus two or three distances per pixel.

Checklist:

- [ ] Motif distance functions in `src/state/evaluator/truchet.ts` with a
      test that every motif's arcs meet its cell edges at the midpoints (the
      property that makes any orientation tile).
- [ ] C++ twins in `src/codegen/truchetHelperCpp.ts` behind `needsTruchet`;
      the hex motifs reuse Phase 1's lattice helper.
- [ ] Preview, emitter, library entry (`isPropertyEnabled` hides the hex
      motifs on the square lattice and vice versa), tests, docs.
- [ ] `signalRange`: `lineWidth` is a 0–0.5 slider; `cells` is un-normalised
      by design and Graph Health will say so on a wired audio band.
- [ ] Compile check on classic ESP32.

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

## Open decisions

- **Slice Tiling split fraction per level.** The contract applies `warp` at
  every level for self-similarity; the paper perturbs the second level only.
  Try both in the preview before the emitter is written; whichever reads
  better on 16×16 wins, and the other is not kept as an option.
- **Symmetry's source region.** Kaleidoscope reads the source near its
  centre. If a full-canvas source reads better for images, add a
  `sourceScale` knob rather than changing the default later.
- **Turing Field on ESP8266.** Twelve bytes per LED is fine at 256 LEDs and
  not at 1024. Decide whether the capacity verdict alone is enough or whether
  the support matrix should mark the node experimental on that board.
