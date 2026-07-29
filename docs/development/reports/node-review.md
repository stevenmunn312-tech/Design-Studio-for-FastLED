# Node library review — 2026-07-28

A pass over all 150 node types in `src/state/nodeLibrary.ts`, cross-checked
against the live preview (`src/state/graphEvaluator.ts`) and the firmware
generator (`src/codegen/cppGenerator.ts`).

Baseline before the review: `npm test` green — 1541 tests across 96 files.
Every finding below was reproduced directly, not inferred from reading.

## Method

- **Registry cross-check** — every `NODE_LIBRARY` type against the `evalNode`
  and `emit` switch cases, `NODE_DESCRIPTIONS`, and `PROPERTY_META`.
- **Runtime shape check** — instantiated all 150 nodes with their default
  properties, evaluated each twice (so stateful nodes advance a step), and
  compared actual output values against each port's declared `dataType`.
- **Adversarial sweep** — repeated that with every numeric property forced to
  `0`, negative, `500`, `1e-9`, and `NaN`, watching for throws, non-finite
  scalars, and out-of-range frame/field values.
- **Codegen inspection** — emitted real sketches for the suspect nodes and read
  the generated C++.

## What is already sound

Worth recording, because it is most of the surface area:

- All 150 node types have an evaluator case. 145 have a codegen case; the five
  without (`MusicLibrary`, `PatternCollection`, `PerformanceGenerator`,
  `SDCard`, `TransitionSet`) are the show-export chain that deliberately has no
  `frame` output.
- Every node has a `NODE_DESCRIPTIONS` entry.
- No default property falls outside its `PROPERTY_META` slider range or select
  option list.
- All 40 per-instance state maps are registered in `stateMaps()`, so both the
  idle sweep and `resetEvaluatorState()` cover them. No leaks.
- Bundled-variant coverage is complete on both sides: Particles (20 modes),
  Transition (16), Ease (14), plus Blend, FieldMath, Math, Trigger, Noise.
- `isPropertyEnabled` gating is thorough across the variant nodes.
- With default properties, **no** node throws, emits a non-finite scalar, or
  produces an out-of-range frame or field.

The problems are concentrated in what happens when a value leaves its expected
range, and in three places where firmware and preview disagree.

## Errors

### 1. `Kaleidoscope` is a no-op in firmware, with no warning — **fixed**

> **Resolved.** `cppGenerator.ts` now emits the real wedge fold, mirroring
> `evalKaleidoscope`. See *Fix applied* at the end of this section.

`cppGenerator.ts:3269` was a stub — it copied the input frame and left a
comment:

```
case 'Kaleidoscope': {
  const ob = ownBuf()
  ln(`  ${seedFrom('frame')}  // Kaleidoscope: mirror logic to apply on ${ob}`)
  break
}
```

The evaluator implements it properly (`evalKaleidoscope`), so the preview shows
a working kaleidoscope and the flashed device shows the unmodified source frame.
The `segments` port and property are ignored entirely.

`validateGraph.ts:103` has exactly the mechanism to catch this, but only lists
one node:

```
const PREVIEW_ONLY_NODE_TYPES: ReadonlySet<string> = new Set(['MidiInput'])
```

`MidiInput` is a deliberate, clearly-commented preview-only stub and is warned
about. `Kaleidoscope` is equally inert on hardware and is not — so the user gets
no signal until the pattern disappears on the board.

**Fix applied.** The codegen case now samples the source buffer through the
wedge fold, following the existing `Mirror` case's shape (`ownBuf()` +
`srcBuf('frame')`, reading the upstream buffer and writing its own, so there is
no aliasing). It reproduces the evaluator exactly: the same `W/2, H/2` centre,
the same two-step fold (`fmodf` into one segment, then reflect about the
midline), `max(2.0f, …)` on the segment count, and `floorf(v + 0.5f)` to match
JS `Math.round`. `segments` stays wireable, so the wedge angle is recomputed per
frame. An unwired `frame` input fills black, matching the evaluator's
`blankFrame`.

Verified by transcribing the emitted arithmetic with `Math.fround` at each step
and comparing the source-pixel mapping against the evaluator across 8×8, 16×16
and 32×32 at segment counts 1–12: identical for all but 1–2 pixels per frame at
`segments` 3 and 6, where a coordinate lands exactly on a rounding tie and
float32 and double disagree by one pixel. That is inherent to on-device float
precision and is far smaller than divergences the codebase already accepts
elsewhere. Note this checks the formula, not the compiler — the generated sketch
has not been compiled or flashed, so `Kaleidoscope` should not be treated as
hardware-validated.

Five regression tests cover it in `cppGenerator.test.ts`, including an explicit
guard that the passthrough `memmove` and the old `mirror logic to apply` comment
never come back.

### 2. `Fire` / `Fire2012` `turbulence` has no upper bound

`graphEvaluator.ts:1485` (and `:3393` for Fire2012):

```
const spread = Math.max(0, Math.round(turbulence))
...
for (let ds = -spread; ds <= spread; ds++) sum += heat[p - 1][Math.max(0, Math.min(S - 1, s + ds))]
```

Clamped below, not above. The *index* is clamped into range, but the loop still
runs `2·spread + 1` times per pixel. `cppGenerator.ts:2202` bakes the same loop
into firmware — verified, with `turbulence: 100000`:

```
int _sum=0; for (int _ds=-100000; _ds<=100000; _ds++) _sum += _fireHeat_f1[_p-1][max(0,min((WIDTH)-1,_s+_ds))];
```

Every sample past the axis length reads the same clamped edge cell, so all that
work is not just unbounded but visually meaningless. In the preview this locks
the browser tab; on device it would starve the loop and trip the watchdog.

The slider bounds `turbulence` to `[0, 2]`, so this is not reachable by dragging.
It **is** reachable through imported project files, share links, and hand-edited
JSON — and the trust boundary only blanks `CustomFormula` / `FieldFormula` /
`Code`, so a `Fire` node renders before any trust prompt is relevant.

**Fix:** clamp to the secondary-axis length — `Math.min(S, ...)` on both sides.
Behaviour-preserving, since larger values are already visually identical.

### 3. `Mod` by zero: preview returns 0, firmware returns NaN

Evaluator (`graphEvaluator.ts:5731`) guards; codegen (`cppGenerator.ts:3512`)
does not. Verified output for `x=5, m=0`:

| | result |
|---|---|
| preview | `0` |
| generated C++ | `float n_m1_result = fmod(fmod(5, 0) + (0), 0);` |

`fmod(x, 0)` is a C domain error returning NaN, which then propagates into
whatever consumes it — colour channels, coordinates — as undefined pixels.

`m` is a wirable `float` input with no `PROPERTY_META` entry, so it is a
free-entry number field *and* any wired signal crossing zero hits it.

**Fix:** emit a zero guard mirroring the evaluator.

### 4. `num()` has no finite guard, so one NaN takes out the whole frame

`graphEvaluator.ts:4280` returns `Number(input(...))` unguarded, while
`normProp()` twenty lines below does exactly the right thing:

```
const n = Number(value)
return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback
```

Consequence: a NaN reaching a palette index yields `undefined`, and the
`.r` access throws. In the adversarial sweep this crashed **20+ node types**
(`Cannot read properties of undefined (reading 'r')`), produced NaN scalars from
a dozen more, and yielded all-NaN frames from eleven.

`LEDPreview`'s `try/catch` keeps the render loop alive, so the symptom is not a
crash but a silently frozen or black preview plus a console error — considerably
harder to diagnose than a failure would be.

Realistic sources of NaN: `CustomFormula` (`sqrt(-1)`, `0/0`, `log(0)`), the
string-expression properties (`Line.x2` defaults to `"W-1"`), and finding 3 above.

**Fix:** fall back to the property default in `num()` when the result is not
finite, matching `normProp()`.

### 5. Colour properties are not range-clamped in the evaluator

`GradientFrame` / `GradientSampler` (`graphEvaluator.ts:5691`–`5703`) read raw
`Number(props.rA ?? 0)` and interpolate. Verified — with `rA: -50, gA: 400` the
preview emits a pixel of `{ r: -50, g: 400, b: 0 }`. `GravityWell` behaves the
same way under negative properties.

Codegen uses `intProp(p.r, 255, 0, 255)` for the equivalent values, so firmware
clamps to `uint8_t` while the preview does not — a genuine divergence. It also
leaks out-of-range channels into downstream consumers that assume 0–255 bytes
(`Blend`'s `qadd8`, the WebGL frame uploader).

**Fix:** clamp at the colour-property boundary with a shared helper mirroring
codegen's `intProp`.

### 6. Frame-rate-coupled timing drifts from the documented wall-clock contract

`CLAUDE.md` states preview timing is wall-clock so `t` equals real seconds,
"matching the firmware's `millis()/1000`". Most nodes honour that — `Smooth`,
`SampleHold`, `Envelope`, `Interval`, `SpectrumVisualizer` and `ColorTrails` all
derive from a `dt` or `millis()` delta. Three places do not:

- **`Counter`** advances `rate / 60` per *evaluated frame* on both sides
  (`graphEvaluator.ts:5745`, `cppGenerator.ts:3533`).
- **`BeatFlash`** attack/decay are per-loop (`cppGenerator.ts:2556`,
  `1.0f / (_fAtkSec * 60.0f)`).
- **`TimeNode.dt`** is a hardcoded `1/60` on both sides
  (`graphEvaluator.ts:4344`, `cppGenerator.ts:848`) — a port labelled `dt` that
  never reports an actual delta.

This matters because the generated sketch ends with `FastLED.delay(16); // ~60 fps`
— a fixed *additional* delay, not a deadline. The device loop period is therefore
`render + 16 ms`, always under 60 fps and falling further as the graph gets
heavier, while the preview is gated to exactly 60 steps/sec. Per-frame
accumulators consequently run slower on hardware than in the preview, and the
gap widens with graph cost.

**Fix:** derive `Counter` and `BeatFlash` from time deltas; make `dt` report the
real delta; consider a deadline-based frame limiter instead of a fixed delay.

### 7. `Interval` drifts in firmware but not in preview

The evaluator advances the phase (`graphEvaluator.ts:6528`,
`intervalLast.set(key, last + interval)`) so it never drifts. Codegen re-bases on
the actual fire time (`_iv_${id} = millis()`), accumulating up to one frame
period of drift per pulse — a firmware metronome falls measurably behind the
preview over a few minutes.

**Fix:** `_iv_${id} += ${ms}` instead of reassigning to `millis()`.

## Improvements

1. **`spliceInput` is declared on exactly one node.** `Blend` sets it; the other
   149 do not, though the field drives two real UX paths — the drag-to-create
   picker's fit score and "why this fits" hint
   (`CanvasContextMenu.tsx:170,196`) and drop-to-splice's preferred input
   (`NodeGraphCanvas.tsx:705`). 21 nodes have two or more same-typed inputs and
   currently fall back to first-wins. Most of those defaults happen to be right,
   but `Mask`, `Transition`, `FieldMath`, `FieldWarp`, `Zones` and `Sequencer`
   would be worth making explicit.

2. **Five numeric properties have no `PROPERTY_META` entry** and so render as
   unbounded raw number fields, inconsistent with comparable controls:
   `Circle.radius`, `Kaleidoscope.segments`, `Spiral.arms`, `Shape.size`,
   `ClockDisplay.durationSec`. Giving them sliders both matches the surrounding
   convention and removes a slice of the unbounded-value risk in findings 2 and 4.

3. **`PaletteSelector` outputs a palette *name* string** where every other
   `palette`-typed output produces an `RGB[]`. `pal()` accepts both, so this is
   correct today, but the union is implicit and easy to break — worth a comment
   on the port or a named type.

## Suggested order

Finding 1 is fixed. Finding 2 is the remaining one that can lock a tab or trip a
watchdog; 3 and 4 are a related pair (the Mod guard is one of the ways a NaN
enters, and the `num()` guard contains the blast radius) and are each roughly a
one-line change. 5 through 7 are correctness polish that can follow.
