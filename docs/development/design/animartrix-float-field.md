# ANIMartRIX patterns — Float Field design note

Status: proposed · Owner: app · Date: 2026-06-28

## Problem

ANIMartRIX (Stefan Petrick's ~30 matrix animation demos) uses a **coordinate → scalar → color**
pipeline that the current node graph cannot express:

1. For every pixel `(x, y)`, compute a **scalar value** (a float) using coordinate
   math — trig, polar conversions, distance functions, warps.
2. Feed that value through a **palette lookup** to get the final colour.

FastLED Studio's current model goes **frame generators → frame → composites → output**.
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

Codegen: a per-pixel `ColorFromPalette(pal, v * 255, brightness * 255)` loop.

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
`src/state/fastledShims.ts` module, with unit tests for the shims, the evaluator
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

### Phase 2 — `DistanceField`, `FieldMath`, `FieldWarp`
*Scope:* Field composition without needing any custom formula.

- Three new nodes (see above).
- Evaluator cases + codegen cases for each.
- Tests: evaluator snapshot + codegen snapshot per node.

### Phase 3 — `FieldRotate` + `FieldTile`
*Scope:* Coordinate-space transforms for the handful of ANIMartRIX patterns
that spin or mirror the field.

- `FieldRotate` — rotates the sample coordinate by a float `angle` input;
  wraps at matrix boundaries.
- `FieldTile` — repeats the field N×M times across the matrix.

Both are pure coordinate remaps: they don't read the field value, they warp
the `(x, y)` before it is evaluated. In practice they can be modelled as
`FieldWarp` presets, so this phase may fold into Phase 2.

---

## Relationship to existing nodes

- **`CustomFormula`** — kept as-is (frame output); enhanced with new vars + shims.
  `FieldFormula` is the field-output sibling, not a replacement.
- **`Noise`** (the bundled Simplex/Worley/etc. node) — could gain a `field` output
  mode in a later pass (expose raw noise values pre-palette for composition).
- **`Transition` / `Blend`** — operate on `frame` only; field nodes feed *into* a
  `frame` via `FieldToFrame`, then existing composites apply as normal.

---

## Open questions

- Should `FieldFormula` support `fieldIn` as a writable pixel buffer (i.e. the
  Code-node model)? Deferred: the expression model covers ANIMartRIX.
- Should `FieldToFrame` carry a `brightness` input port or only a property? Port
  keeps it wirable (audio-reactive brightness); property is simpler. Start with
  property, add port in Phase 2.
- Should `Noise` get a `field` output mode? Worth doing in Phase 2 — a noise
  field fed into `FieldWarp` produces domain-warped noise without any formula.
