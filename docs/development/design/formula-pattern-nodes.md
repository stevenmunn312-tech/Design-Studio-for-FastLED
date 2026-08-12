# Formula-driven pattern nodes — design note

Status: `FormulaField` implemented (2026-08-12); `FormulaPoints` not yet
implemented · Owner: app · Date: 2026-08-10

## Problem

`CustomFormula`/`FieldFormula` already let a user type an arbitrary per-pixel
expression, and `src/state/fastledShims.ts` gives that sandbox FastLED's
fixed-point primitives. But a number of well-known parametric/closed-form
formulas — golden-angle phyllotaxis, Lissajous curves, the superformula,
iterated attractors — produce visually rich patterns that are tedious or
impossible to hand-type as a one-line expression, either because they need
several tuned parameters (the superformula's `m`/`n1`/`n2`/`n3`/`a`/`b`) or
because they need iteration/state across frames (an attractor's running
`(x, y)`, a logistic map's running `x`). There is currently no curated,
dropdown-driven way to reach for these the way `Noise`'s `noiseType` or
`Particles`' `particleType` already reach for a curated set of variants.

## Formula catalogue considered

| Formula | Character | Needs state? |
|---|---|---|
| Golden angle / phyllotaxis (`2·PI·(1 − 1/φ)` spawn rotation) | scattered point field, sunflower-seed spiral | no (recomputed) |
| Fibonacci spiral (`r = a·φ^(angle/(π/2))`) | logarithmic spiral distance | no |
| Golden-ratio low-discrepancy sampling (`frac(n·0.618…)`) | evenly-spread point/hue sequence | no |
| Rose curve (`r = cos(k·angle)`) | petal symmetry | no |
| Superformula (Gielis) | generalized circle/star/flower silhouette | no |
| Lissajous curve (`x = sin(a·t+φ), y = sin(b·t)`) | orbiting/scanning path | yes (phase) |
| Epicycloid / hypocycloid | looping trail path | yes (phase) |
| Logistic map (`x' = r·x·(1−x)`, r ≈ 3.57–4) | chaotic scalar stream | yes (last `x`) |
| De Jong / Clifford attractor | iterated-map point cloud | yes (last point + accumulated trail) |

These split cleanly into two groups by shape, which drives the two-node
design below: **stateless per-pixel fields** (rose, superformula, spiral
distance, low-discrepancy banding) vs. **stateful point/trajectory
generators** (phyllotaxis motion, Lissajous/epicycloid paths, logistic map,
attractors).

## Decision: two bundled nodes, not one dropdown

Following the existing "bundled node" convention (`Noise`'s `noiseType`,
`Transition`'s `transitionType`, `Particles`' `particleType` — one node, a
variant property, a single evaluator `case` and a single codegen `case`
dispatching on it), the natural move is one new node with a formula-type
dropdown. But the catalogue above isn't uniform: the field-shaped formulas
are stateless and sample at `(x, y)`/`(r, angle)` each frame like
`FieldFormula`; the point/trajectory formulas are stateful and want
particle/path rendering like `Particles`/`Trails`. Cramming both into one
node means either faking a field as a static point set or faking a moving
point as a per-pixel field. Splitting avoids that:

- **`FormulaField`** (field category) — stateless, sits beside
  `FieldFormula`/`FieldNoise`/`DistanceField` in the float-field pipeline
  (`docs/development/design/animartrix-float-field.md`).
- **`FormulaPoints`** (pattern category) — stateful, sits beside
  `Particles`/`Trails`/`ColorTrails` as a self-contained `frame` generator.

Each stays a reasonable size (5–6 variants), and neither has to fake the
other's rendering model.

---

## `FormulaField` (category: `field`) — implemented

Per-pixel closed-form expression selected by a curated dropdown instead of
free text, output as a `field` (0–1) so it composes with the rest of the
float-field pipeline — chain a `FieldToFrame` for palette mapping, or feed
it into `FieldWarp`/`FieldMath`/`FieldRotate` first.

**Ports:** none — as built, there is no `phase` input. The externally-driven
`phase` port originally sketched here was cut for the smallest-first
implementation (nothing wires it, and `speed` already reaches the same
result); revisit only if a concrete use case for external phase control
shows up.

**Property:** `formulaType` (select).

| `formulaType` | Formula | Per-variant properties |
|---|---|---|
| `rose` | filled `v = (cos(k·angle)+1)/2`, radius-faded | `petals` (k), `offset` (deg) |
| `superformula` | Gielis superformula, filled silhouette + soft edge | `symmetry` (m), `n1`, `n2`, `n3`, `a`, `b` |
| `fibonacciSpiral` | distance-to-nearest golden-pitch log-spiral arm | `turns`, `tightness`, `bandWidth` |
| `goldenTiling` | `frac(n/φ)` low-discrepancy concentric rings | `density`, `phase` |
| `lissajousField` | nearest-sample distance to a Lissajous curve | `freqA`, `freqB`, `thickness` |

(`offset`/`phase` replaced the originally-sketched shared "phase" property
name to avoid ambiguity with the cut phase *port* above — `offset` is a
static rotation for `rose`, `phase` is a static ring-index offset for
`goldenTiling`.)

Each variant's params are gated via `isPropertyEnabled` (the `Transition`
convention — shown-but-disabled outside the relevant variant). `speed`
(0–1, denormalized per-variant via `FORMULA_FIELD_SPEED_MAX` in
`speedRange.ts`, the same convention as `Noise`'s `NOISE_SPEED_MAX`)
advances a shared rotation/drift term for every variant.

**Evaluator:** `evalFormulaField()` in `graphEvaluator.ts`, one `switch`
branch per variant, dispatched by the `case 'FormulaField':` in `evalNode()`,
writing into a `Float32Array` like `FieldFormula`. No approximation gap to
document — unlike `inoise8`-backed nodes, these are exact closed-form math,
so JS and C++ share the identical formula (the same "no algorithm drift"
property `Pride2015`/`Pacifica`/`TwinkleFox` already lean on). The one
exception is `lissajousField`, which has no closed-form point-to-curve
distance — it samples the curve at `LISSAJOUS_FIELD_SAMPLES = 48` points per
pixel (exported from `graphEvaluator.ts` so codegen uses the identical
count), a per-frame cost comparable to `WaveSim`'s up-to-12 full-grid
convolution passes rather than a new order of magnitude for this codebase.

**Codegen:** the `case 'FormulaField':` in `cppGenerator.ts`'s `emit()`
bakes one dedicated C++ block for the *selected* variant only (the variant
is a property, never wired, so there's nothing to branch on at runtime) —
same `field_<id>[NUM_LEDS]` buffer convention `FieldFormula` uses. `GOLDEN_RATIO`
is exported from `graphEvaluator.ts` so both sides reference the identical
literal.

**Tests:** `graphEvaluator.test.ts` ("Formula Field") covers range bounds,
determinism, per-parameter variation, and time-driven animation for all five
variants; `cppGenerator.test.ts` ("Formula Field codegen") asserts the exact
baked C++ per variant.

---

## `FormulaPoints` (category: `pattern`)

Stateful point/trajectory generator, output directly as a `frame` (owns its
own persistence, like `Particles`/`Trails`/`ColorTrails` — no separate
compositing step required).

**Property:** `formulaType` (select).

| `formulaType` | Behavior | State needed |
|---|---|---|
| `phyllotaxis` | scatters `count` points at the golden angle; optional slow `spin` | none, or a cached point set |
| `lissajousPath` | a comet tracing `x = sin(a·t+φ), y = sin(b·t)` | phase accumulator `t` |
| `rosePath` | a point tracing the rose curve over time | phase accumulator `t` |
| `logisticMap` | chaotic scalar stream (position and/or brightness) | last `x` + iteration count |
| `attractor` | de Jong/Clifford iterated map, many points/frame accumulated with fade | persistent frame buffer + last `(x, y)` |

**Shared/gated properties** (via `isPropertyEnabled`, the `Particles`
convention): `speed`/`spin` for the geometric variants; `persistence`/`fade`
+ named coefficient presets (e.g. "classic"/"swirl"/"web") for `attractor`;
`chaos` (r, 3.5–4) for `logisticMap`; `dotSize`/`count` shared where
relevant.

**Evaluator:** one shared iteration function per variant, state held in a
module-level `Map` keyed by `stateKey(id)` — the same per-group-instance
isolation `Fire`/`Particles`/`PatternMaster` already use. The
accumulate-and-fade variants (`attractor`) reuse `Trails`' exact
`fadeToBlackBy` + per-channel re-lighten trick rather than inventing a new
persistence mechanism.

**Codegen:** mirrors the evaluator's iteration per variant; the
accumulate-and-fade variants cost one extra `CRGB` buffer, already covered
by `estimateFirmwareRam()`'s existing per-node accounting.

---

## A `PHI` constant — implemented

`src/state/formulaLang.ts`'s `MATH_CONSTANTS` now defines `PHI:
1.618033988749895` alongside `PI`, so any *free-text* `CustomFormula`/
`FieldFormula` expression can write `PHI` instead of the literal. Since
preview and firmware must agree, `cppGenerator.ts` also gained a `needsPhi`
flag (mirroring the existing `needsShims` gating): a formula referencing
`PHI` triggers a conditionally-emitted `#define PHI 1.618033988749895f` in
the generated sketch, so the same expression compiles unchanged on-device.

## Relationship to existing nodes

- **`FieldFormula`/`FieldNoise`** — `FormulaField` is a third raw-field
  generator beside them: curated/parametric instead of free-text
  (`FieldFormula`) or fBm-noise-based (`FieldNoise`). All three feed the
  same downstream `FieldToFrame`/`FieldMath`/`FieldWarp`/`FieldRotate`/
  `FieldTile` pipeline unmodified.
- **`Particles`/`Trails`/`ColorTrails`** — `FormulaPoints` is a curated,
  closed-form-math sibling: `Particles` is procedural/randomized motion,
  `Trails` is a generic feedback wrapper around *any* wired frame,
  `ColorTrails` is a specific stateful-advection pattern: `FormulaPoints`
  adds specific well-known parametric point generators to that family.

## Open questions

- **Naming.** `FormulaField`/`FormulaPoints` are working names; could also
  read as `PatternFormula` (field) / `PatternPath` (points) to match the
  `pattern`-category label conventions more closely — needs a look at
  `nodeDisplayLabel()`/sidebar subcategory fit before settling.
- **Attractor coefficient exposure.** Raw a/b/c/d coefficients are not
  intuitive sliders; named presets ("classic"/"swirl"/"web", each a fixed
  coefficient tuple) are likely friendlier than exposing all four as
  freely-tunable numbers, similar to how `Fire`/`Fire2012` expose `seed`
  rather than raw LCG parameters.
- **Sidebar subcategory fit.** `FormulaField` likely joins `pattern`'s
  *Generative* subcategory alongside `Noise`/`Plasma`; `FormulaPoints`
  likely joins *Simulations* alongside `Particles`/`FlowField`/`Starfield`.
- **Hardware validation.** Per this repo's convention, neither node would
  be marked hardware-validated until a real compile/flash pass confirms
  firmware output matches preview, same as every other new node type.

## Suggested build order

1. ~~Add `PHI` to `formulaLang.ts`~~ — done.
2. ~~`FormulaField`~~ — done (2026-08-12): all five variants, evaluator,
   codegen, `isPropertyEnabled` gating, `PROPERTY_META_OVERRIDES`,
   `BUNDLED_TITLES` header text, and tests. Not yet hardware-validated —
   like every new node, needs a real compile/flash pass confirming firmware
   output matches preview before it can be marked validated.
3. `FormulaPoints` — stateful, still unimplemented; the naming/subcategory
   and attractor-coefficient-preset open questions above still apply.
