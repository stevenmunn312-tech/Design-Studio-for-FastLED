# ANIMartRIX patterns — Float Field design note

Status: implemented (phases 1–3 shipped) · Owner: app · Date: 2026-06-28

## Problem

ANIMartRIX (Stefan Petrick's ~30 matrix animation demos) uses a **coordinate → scalar → color**
pipeline that the current node graph cannot express:

1. For every pixel `(x, y)`, compute a **scalar value** (a float) using coordinate
   math — trig, polar conversions, distance functions, warps.
2. Feed that value through a **palette lookup** to get the final colour.

Design Studio for FastLED's current model goes **frame generators → frame → composites → output**.
There is no intermediate scalar layer. A user who pastes a typical ANIMartRIX snippet
into `CustomFormula` immediately hits two gaps:

- **No polar coordinate vars** — `r` (radius from center) and `angle` are absent.
- **No FastLED trig shims** — `sin8`, `cos8`, `beatsin8`, `beatsin16`, `sin16`, `scale8`
  and friends don't exist in the formula sandbox; only JS `Math.*` does.

## Decision

Introduce a **`field` data type** — a per-pixel scalar grid (one float per pixel,
normalised 0–1) — as a first-class value that can flow through the graph between
compatible ports, be composed mathematically, and be converted to a `frame` via a
palette lookup at the end of the chain.

This is the smallest extension that unlocks the whole ANIMartRIX vocabulary while
fitting cleanly into the existing port-type system.

```
FieldFormula → FieldMath → FieldWarp → FieldToFrame → MatrixOutput
                  ↑              ↑
           DistanceField    FieldFormula
```

## The `field` type

A `field` is a `Float32Array` of length `W × H`, values in [0, 1], row-major
(index `y * W + x`). It carries no colour — it is a pure scalar grid.

In the type system:
- New entry in `PORT_COLORS` (colour: a warm amber `#f5c542` to distinguish it
  from `float` scalars and `frame` RGB arrays).
- `portsCompatible('field', 'field')` → true; no cross-conversion with other types.
- `FieldToFrame` is the **only** node that converts `field` → `frame`, making
  palette choice explicit rather than hidden.

## New nodes

### `FieldFormula` (category: `pattern`)

The primary authoring node. Per-pixel expression that outputs a `field` (or
optionally a `frame` when a palette is wired and `outputMode = 'frame'`).

**Built-in vars:**
| Name | Meaning |
|------|---------|
| `x`, `y` | Pixel column / row, integer (0-based) |
| `cx`, `cy` | Centered, normalised: `cx = (x - W/2) / (W/2)`, range –1..1 |
| `r` | Radius from center: `sqrt(cx² + cy²)`, 0 at center, ~1.41 at corner |
| `angle` | Polar angle: `atan2(cy, cx)`, range –π..π |
| `t` | Time in seconds (wall-clock, matches firmware `millis()/1000`) |
| `W`, `H` | Grid dimensions |
| `a`, `b` | Wired float inputs (default 0) |
| `fieldIn` | Wired field input value at `(x, y)` (default 0) |

**FastLED trig shims** added to the sandbox:
| Shim | C++ equivalent | Note |
|------|---------------|------|
| `sin8(x)` | `sin8(x)` | arg 0–255 → result 0–255 |
| `cos8(x)` | `cos8(x)` | arg 0–255 → result 0–255 |
| `sin16(x)` | `sin16(x)` | arg 0–65535 → –32768..32767 |
| `beatsin8(bpm, lo, hi)` | `beatsin8(bpm,lo,hi)` | lo–hi at bpm |
| `beatsin16(bpm, lo, hi)` | `beatsin16(bpm,lo,hi)` | wider range |
| `scale8(v, s)` | `scale8(v,s)` | `round(v * s / 255)` |
| `qadd8(a, b)` | `qadd8(a,b)` | saturating add, capped at 255 |
| `qsub8(a, b)` | `qsub8(a,b)` | saturating subtract, floored at 0 |

**Ports:** `a` (float), `b` (float), `fieldIn` (field) → `field` out (and optionally
`frame` out when `outputMode = 'frame'`).

**Example — ANIMartRIX "Polar Waves":**
```
sin8(r * 200 + t * 60) / 255
```
That one-liner, fed through `FieldToFrame` with the `ocean` palette, produces a
concentric ring animation identical to the original sketch.

---

### `FieldToFrame` (category: `pattern`)

Converts a `field` to a `frame` by looking up each pixel's scalar value in a palette.

- **Input:** `field`, `palette` (palette port, optional)
- **Property:** `palette` (preset dropdown, fallback when port unwired), `brightness` (0–1 slider)
- **Output:** `frame`

This is a terminal node in any field chain. It is the only place palette
choice is made, keeping field nodes palette-agnostic and reusable.

A field value is an amount, so the lookup holds the palette's ends: 0 is its
first colour and 1 its last. It does not wrap round, which would give 1 the
same colour as 0 and make a hard-edged field (a solid Slice Tiling slice, a
filled Shape Field, a Field Levels threshold) disappear. The preview samples
with `samplePaletteClamped`; the Noise node's own frame output uses the same
mapping.

Codegen: a per-pixel
`ColorFromPalette(pal, v * 255, brightness * 255, LINEARBLEND_NOWRAP)` loop.

---

### `DistanceField` (category: `pattern`)

Emits the Euclidean distance from each pixel to a movable point.

- **Inputs:** `px` (float, 0–1 normalised X of the target point), `py` (float, 0–1 Y)
- **Properties:** `px`, `py` (sliders, default 0.5 = center), `scale` (1–4, stretches the output range)
- **Output:** `field` (0 = at the point, 1 = max distance from it, normalised)

Driving `px`/`py` with `BeatSin` or `Wave` nodes creates orbiting distance ripples
with no formula needed.

---

### `FieldMath` (category: `pattern`)

Combines two fields pixel-by-pixel.

- **Inputs:** `a` (field), `b` (field)
- **Property:** `op` — add, subtract, multiply, mix, min, max, difference
  (same bundled-node pattern as `Math` and `Blend`)
- **Output:** `field`

When `b` is unwired it defaults to a zero field, so unary operations
(negate → `subtract` with `a` = 0, invert → `subtract` with constant field) work
without a second source.

---

### `FieldLevels` (category: `field`)

Remaps a field between wireable low/high bounds, then optionally quantises it
to 2–16 levels or inverts it. When low meets or exceeds high it becomes a hard
threshold, which is the final step in a signed-distance shape morph.

- Inputs, in order: `field`, `low`, `high`; `low` and `high` are property
  inputs with 0–1 sliders and defaults 0 and 1.
- `steps` defaults to 1 (smooth) and ranges from 1–16; `invert` defaults off.
- Per pixel, the ordinary path is
  `clamp01((field - low) / max(1e-4, high - low))`, followed by quantisation
  and inversion. `low >= high` uses `field >= low` as a hard threshold.

### `FieldLerp` (category: `field`)

Interpolates two fields pixel-by-pixel with a wireable 0–1 amount. Unwired
field inputs are zero, matching `FieldMath`.

Inputs are `a`, `b`, and the property input `t`; `t` defaults to 0.5. The
operation is `a * (1 - t) + b * t`.

### `ShapeField` (category: `field`)

Produces a circle, rectangle, or continuously morphing regular polygon. Fill
mode emits antialiased coverage; distance mode maps the outline to 0.5, the
interior toward 1, and the exterior toward 0. The signed-distance primitives
are shared with the frame-producing `Shape` node and its firmware helper.

- Property inputs are `cx`, `cy`, `size`, `rotation`, `sides`, and `aspect`.
  Centres are normalised 0–1; size is a fraction of the shorter matrix side;
  rotation is degrees; fractional sides morph like the frame Shape node.
- `shape` is Circle / Rect / Polygon. `fieldMode` is Fill / Distance;
  `softness` defaults to 0.1 and `range` to 0.5.
- Distance mode maps the outline to 0.5, the interior toward 1, and the
  exterior toward 0 over `range`. Lerp two distance Shape Fields, then put
  Field Levels at `low = high = 0.5`, for a closed-region SDF morph.
- `src/state/evaluator/sdf.ts` owns the preview primitives. Their C++ twins are
  emitted once from `src/codegen/sdfHelperCpp.ts` behind `needsSdf`; both Shape
  and Shape Field call them, so their polygon maths cannot drift.

### `SliceTiling` (category: `field`)

Generates recursively subdivided solid/void fan slices on hexagonal, square,
or triangular lattices, plus a Cell output holding one value per polygon for
colouring each polygon's slices. It is documented separately in the
[Slice Tiling design note](slice-tiling.md), including its shared lattice
geometry, custom hexadecimal leaf order, morph, Cell output and firmware
parity contract.

### `Truchet` (category: `field`)

Builds edge-joining arc and line networks on square or hexagonal cells. A
seeded per-cell hash chooses each orientation, and a rising-edge Reroll input
changes the epoch without introducing preview/firmware randomness. Cells,
line width, scrolling and rotation are property inputs. The motif geometry and
shared C++ helper contract are in the
[Truchet Tiles design note](truchet-tiles.md).

### `TuringField` (category: `field`)

Grows McCabe's multi-scale Turing patterns: every pixel follows whichever of
two to five nested scales has the closest activator and inhibitor, so the
labyrinths keep reorganising. Speed and step size are property inputs; scales,
base radius and seed are baked. A rising Reset restarts from a fresh seeded
start. The summed-area-table step, its RAM and the Reaction Diffusion Field
output and presets that shipped with it are in the
[Turing Field design note](turing-field.md).

### `FieldSymmetry` (category: `field`)

Repeats a field through one of nine square or hexagonal wallpaper groups.
Cells, rotation, spin and cell-space offsets are property inputs; nearest
sampling keeps later Field Levels thresholds crisp. It is the scalar twin of
the frame `Symmetry` effect. The fold, fundamental domains, and shared
preview/firmware architecture are in the
[wallpaper symmetry design note](symmetry-groups.md).

---

### `FieldWarp` (category: `composite`)

Samples an input `field` at coordinates shifted by two offset fields.

- **Inputs:** `field` (field to sample), `dx` (field — per-pixel X offset), `dy` (field — per-pixel Y offset)
- **Property:** `strength` (0–4 slider — scales the offset magnitude in pixels)
- **Output:** `field`

Two `FieldFormula` nodes computing `sin8(y*8 + t*40)/255` and
`cos8(x*8 + t*40)/255` fed into a `DistanceField`'s `FieldWarp` produces
the classic ANIMartRIX plasma warp with about six nodes and no code.

---

## CustomFormula enhancements (existing node)

`CustomFormula` already outputs a `frame` by sampling a per-pixel expression.
It gets the same FastLED trig shim additions and the same new vars (`cx`, `cy`,
`r`, `angle`) as `FieldFormula` — so users who already use `CustomFormula` can
start writing ANIMartRIX-style expressions immediately without switching nodes.

The difference between `CustomFormula` and `FieldFormula` is the output type:
`CustomFormula` always emits a `frame` (palette baked in); `FieldFormula` emits
a `field` (palette applied downstream by `FieldToFrame`), enabling field
composition.

---

## C++ codegen

Each field node emits a per-pixel loop into a `float field_<id>[HEIGHT][WIDTH]`
local array. `FieldToFrame` reads that array and calls `ColorFromPalette`.

FastLED's trig functions (`sin8`, `cos8`, `beatsin8`, etc.) exist natively
on-device, so codegen for `FieldFormula` is near-verbatim: the expression
is emitted inside a double `for (y … for (x …` loop with the same variable
names visible in the sandbox.

The C++ shim table:
| JS sandbox call | C++ emission |
|----------------|-------------|
| `sin8(x)` | `sin8((uint8_t)(x))` |
| `beatsin8(bpm, lo, hi)` | `beatsin8(bpm, lo, hi)` |
| `scale8(v, s)` | `scale8((uint8_t)(v), (uint8_t)(s))` |
| `cx` | `(float)(x - W/2) / (W/2.0f)` |
| `r` | `sqrtf(cx*cx + cy*cy)` |
| `angle` | `atan2f(cy, cx)` |

Integer overflow / saturation: `sin8`/`qadd8`/`scale8` operate on `uint8_t` in
firmware but receive JS floats in the preview sandbox. The shims clamp/round to
match; minor differences in patterns that depend on exact uint8 wrap-around are
documented as a known divergence (same as `CustomFormula`'s existing caveat).

---

## Phased rollout

### Phase 1 — `field` type + `FieldFormula` + `FieldToFrame` — **implemented**
*Scope:* The minimum viable ANIMartRIX node. Shipped: the `field` type, both
nodes, the `CustomFormula` enhancement, evaluator + codegen, and the shared
`src/nodes/shared/fastledShims.ts` module, with unit tests for the shims, the evaluator
field chain, and the codegen.

- Add `field` to `PORT_COLORS` and `portsCompatible`.
- Add `FieldFormula` node: expression sandbox with extended vars + FastLED shims,
  `field` output.
- Add `FieldToFrame` node: maps field through a palette.
- Add same FastLED shims + `cx`/`cy`/`r`/`angle` to the existing `CustomFormula`
  sandbox (backward-compatible; existing graphs unaffected).
- **Evaluator:** `FieldFormula` compiles the expression once (keyed by text, like
  `formulaCache`), runs it per pixel, writes a `Float32Array`. `FieldToFrame`
  reads it and samples a palette.
- **Codegen:** double loop + `ColorFromPalette`.
- **Tests:** sandbox shim unit tests; snapshot test for `FieldFormula → FieldToFrame`
  codegen; `NODE_DESCRIPTIONS` entries (enforced by existing test).

This phase alone ports the majority of ANIMartRIX patterns as
`FieldFormula → FieldToFrame → MatrixOutput`.

### Phase 2 — `DistanceField`, `FieldMath`, `FieldWarp` — **implemented**
*Scope:* Field composition without needing any custom formula.

- Three new nodes (see above): `DistanceField` and `FieldMath` (pattern),
  `FieldWarp` (composite). `FieldMath`'s `fieldOp` follows the bundled-node
  pattern (header reflects the op); `DistanceField` overrides the shared `scale`
  slider to 1–4 via `PROPERTY_META_OVERRIDES`.
- Evaluator cases + codegen cases for each; field nodes share the `field_<id>`
  buffer plumbing from Phase 1.
- Tests: 9 added (evaluator behaviour + codegen emission per node).
- *Deferred:* a `field` output mode on the bundled `Noise` node (raw noise
  pre-palette) — a follow-up, not required for the ANIMartRIX vocabulary.

### Phase 3 — `FieldRotate` + `FieldTile` — **implemented**
*Scope:* Coordinate-space transforms for the handful of ANIMartRIX patterns
that spin or mirror the field.

- `FieldRotate` (composite) — rotates a field around its centre. Takes an
  `angle` float input (degrees) plus an `angle`/`spin` property (spin is
  degrees/sec, so a freshly-dropped node animates); samples the source at the
  inverse-rotated coordinate, wrapping at the matrix edges.
- `FieldTile` (composite) — tiles/repeats a field `tilesX`×`tilesY` times.

**Resolved (open question):** these ship as **standalone nodes**, not `FieldWarp`
presets. `FieldWarp` adds *per-pixel offset fields* to the sample coordinate;
rotate/tile apply a *whole-field coordinate transform* from scalar/integer
params — a different operation that doesn't map onto an additive offset field.
7 tests added.

---

## Relationship to existing nodes

- **`CustomFormula`** — kept as-is (frame output); enhanced with new vars + shims.
  `FieldFormula` is the field-output sibling, not a replacement.
- **`Noise`** (the bundled Simplex/Worley/etc. node) — could gain a `field` output
  mode in a later pass (expose raw noise values pre-palette for composition).
- **`Transition` / `Blend`** — operate on `frame` only; field nodes feed *into* a
  `frame` via `FieldToFrame`, then existing composites apply as normal.

---

## Remaining design choice

Writable `FieldFormula` pixel buffers remain deferred (root todo D-04).
`FieldToFrame.brightness` is already an input and `FieldNoise` already provides
the noise-field source; those earlier Phase 2 questions are closed.
