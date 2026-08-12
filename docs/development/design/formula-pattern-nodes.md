# Formula-driven pattern nodes — design note

Status: `FormulaPoints` implemented (2026-08-12) · Owner: app · Date: 2026-08-10

Note: `FormulaField` and a `PHI` formula-language constant were implemented
in a separate, parallel change (`docs/development/design/formula-pattern-nodes.md`
on that branch has its own "implemented" notes) — this branch/PR covers
`FormulaPoints` only, so this copy of the doc doesn't reflect `FormulaField`'s
final shape. Whichever of the two PRs merges second will need to reconcile
this file's status line and any overlapping sections.

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

## `FormulaField` (category: `field`)

Per-pixel closed-form expression selected by a curated dropdown instead of
free text, output as a `field` (0–1) so it composes with the rest of the
float-field pipeline — chain a `FieldToFrame` for palette mapping, or feed
it into `FieldWarp`/`FieldMath`/`FieldRotate` first.

**Ports:** none required; optional `phase` (float) input to drive animation
externally instead of the built-in `speed` property, matching `FieldRotate`'s
`angle` input + `spin` property pattern.

**Property:** `formulaType` (select).

| `formulaType` | Formula | Per-variant properties |
|---|---|---|
| `rose` | `v = cos(k·angle)` | `petals` (k), `phase` |
| `superformula` | Gielis superformula radius test | `symmetry` (m), `n1`, `n2`, `n3`, `a`, `b` |
| `fibonacciSpiral` | distance-to-nearest golden-pitch spiral arm | `turns`, `tightness`, `bandWidth` |
| `goldenTiling` | `frac(n·0.618…)` low-discrepancy banding | `density`, `phase` |
| `lissajousField` | distance-to-static-Lissajous-curve | `freqA`, `freqB`, `phaseOffset` |

Each variant's params are gated via `isPropertyEnabled` (the `Transition`
convention — shown-but-disabled outside the relevant variant). `speed`
advances a shared phase term the same way `Rainbow`'s `speed` does.

**Evaluator:** one shared pure function per variant (same shape as
`FieldNoise`'s `_snoise2` helper), dispatched by `formulaType` in a single
`case` in `evalNode()`, writing into a `Float32Array` like `FieldFormula`.
No approximation gap to document — unlike `inoise8`-backed nodes, these are
exact closed-form math, so JS and C++ can share the identical formula (the
same "no algorithm drift" property `Pride2015`/`Pacifica`/`TwinkleFox`
already lean on).

**Codegen:** the same per-variant formula emitted into the existing
`float field_<id>[NUM_LEDS]` double-`for` loop pattern `FieldFormula` uses.

---

## `FormulaPoints` (category: `pattern`) — implemented

Stateful point/trajectory generator, output directly as a `frame` (owns its
own persistence, like `Particles`/`Trails`/`ColorTrails` — no separate
compositing step required).

**Ports:** an optional `paletteIn` (palette) input, falling back to a
`palette` property — everything else is a property, no other ports.

**Property:** `formulaType` (select).

| `formulaType` | Behavior | State |
|---|---|---|
| `phyllotaxis` | scatters `count` points at the golden angle, slowly spinning with `speed`; areal-uniform via `r = √(i/count)` | none — recomputed fresh each frame |
| `lissajousPath` | a comet tracing `cx = sin(freqA·phase), cy = sin(freqB·phase)`, `phase = t·speed·2` | persistent trail buffer only (position is a pure function of `t`) |
| `rosePath` | a comet tracing the rose curve `r = cos(petals·phase)` over time | persistent trail buffer only |
| `logisticMap` | `x' = chaos·x·(1−x)` iterated `count` times/frame, plotted around a ring, coloured by `x` | running `x` (persists so the chaotic sequence never resets) |
| `attractor` | de Jong iterated map (`x' = sin(a·y) − cos(b·x)`, `y' = sin(c·x) − cos(d·y)`) — **unconditionally bounded to `[-2,2]`** regardless of coefficients, so no escape/clamp logic is needed anywhere | running `(x, y)` + persistent trail buffer |

As-built, `speed`/`persistence`/etc. per-variant gating differs slightly
from the original sketch:
- `speed` only applies to the three *time-driven* variants (`phyllotaxis`,
  `lissajousPath`, `rosePath`) — `logisticMap`/`attractor` churn from
  `count` iterations/frame instead, so `speed` doesn't apply to them and is
  gated off.
- `persistence` (0–1, higher = slower fade/longer trail — same semantic
  `ColorTrails` already uses for the name) applies to the three
  *trail/accumulate* variants (`lissajousPath`, `rosePath`, `attractor`).
- `count` (one shared 8–300 slider) applies to `phyllotaxis`,
  `logisticMap`, and `attractor` — "points scattered" for the first,
  "samples plotted this frame" for the other two.
- `attractor`'s named presets ended up as `classic`/`swirl`/`web`, three de
  Jong coefficient tuples (each bounded by construction, so no tuning risk).

**Evaluator:** `evalFormulaPoints()` in `graphEvaluator.ts`, dispatched by
`case 'FormulaPoints':` in `evalNode()`. State lives in a single
`formulaPointsState: Map<string, FormulaPointsState>` keyed by
`stateKey(id)` — the same per-group-instance isolation `Fire`/`Particles`
use — holding whichever fields the active variant needs (`logisticX` /
`attractorX`+`attractorY` / a persistent trail `frame`). The trail variants
(`lissajousPath`/`rosePath`/`attractor`) reuse `Trails`' exact fade-in-place
technique, just splatting new content directly onto the buffer each frame
instead of max-blending against a separately wired input frame.

**Codegen:** the `case 'FormulaPoints':` in `cppGenerator.ts` bakes one
dedicated C++ block for the *selected* variant only (never wired, so
nothing to branch on at runtime), splatting each point via the same
bounding-box + coverage-based soft-disc technique `Particles`' codegen
already uses. The persistent state a variant needs becomes `static` locals
declared inside that block (C++ guarantees a function-local `static`
initializer runs exactly once), and the trail buffer is simply the node's
own `ownBuf()`-declared global — never reseeded from anywhere, so it
persists across `loop()` calls for free, same as `Trails`' codegen.
One precision note found in practice: `floatLit()`'s default 4-decimal
rounding is fine for ordinary property values, but the golden-angle
constant (multiplied by `_i` up to `count` ≤ 300) needed 8-digit precision
to keep the outer phyllotaxis spiral arms from visibly drifting out of sync
with the full-precision JS angle.

**Tests:** `graphEvaluator.test.ts` ("Formula Points") and
`cppGenerator.test.ts` ("Formula Points codegen") cover all five variants.
One real pitfall surfaced while writing the evaluator tests: the trail
variants return their persistent buffer *by reference* and mutate it in
place on the next call (intentional, matching `Trails`) — a test that holds
two "snapshots" as live references and compares them only *after* both
evaluator calls complete ends up comparing the final mutated buffer to
itself. Every test that compares frames across multiple calls now
serializes (`JSON.stringify`) immediately after each call, before the next
one can mutate the buffer.

---

## A `PHI` constant

Independent of either node, `src/state/formulaLang.ts`'s `MATH_CONSTANTS`
currently only defines `PI` (`Math.PI`). Adding `PHI: 1.618033988749895`
there is a one-line, low-risk addition so any *free-text* `CustomFormula`/
`FieldFormula` expression can write `PHI` instead of the literal — useful
independent of whether `FormulaField`/`FormulaPoints` ship, and worth doing
first since it's a trivial, isolated change.

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

- **Naming.** Kept `FormulaField`/`FormulaPoints` as shipped — no strong
  reason surfaced during implementation to rename to `PatternFormula`/
  `PatternPath`.
- **Attractor coefficient exposure.** Resolved: shipped as three named
  presets (`classic`/`swirl`/`web`, each a fixed de Jong coefficient
  tuple) rather than exposing raw a/b/c/d sliders, matching how
  `Fire`/`Fire2012` expose `seed` rather than raw LCG parameters. The de
  Jong map turned out to be unconditionally bounded to `[-2,2]` regardless
  of coefficients (since it's built from `sin`/`cos`), so every preset —
  and in fact any coefficient values — is automatically stable; no
  divergence-guard logic was needed anywhere.
- **Sidebar subcategory fit.** Resolved: `FormulaPoints` shipped in
  `pattern`'s *Simulations* subcategory alongside `Particles`/`FlowField`/
  `Starfield`. (`FormulaField`'s field-category placement had no subcategory
  question to resolve.)
- **Hardware validation.** Per this repo's convention, neither node is
  marked hardware-validated until a real compile/flash pass confirms
  firmware output matches preview, same as every other new node type. Still
  outstanding for both.

## Suggested build order

1. ~~Add `PHI` to `formulaLang.ts`~~ — done (separate branch/PR).
2. ~~`FormulaField`~~ — done (separate branch/PR).
3. ~~`FormulaPoints`~~ — done (2026-08-12, this branch): all five variants,
   evaluator, codegen, `isPropertyEnabled` gating,
   `PROPERTY_META_OVERRIDES` (scoped locally since `formulaType` collides
   in name, not meaning, with `FormulaField`'s), `BUNDLED_TITLES` header
   text, and tests. Not yet hardware-validated.
