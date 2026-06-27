# Code node — design note

Status: proposed · Owner: app · Date: 2026-06-27

A **Code node** lets a user paste raw FastLED/Arduino C++ — a loop body that
writes directly into `leds[]` — and have it both (a) compile into the generated
sketch verbatim and (b) approximate in the live LED preview. It is the
imperative, frame-filling sibling of the existing `CustomFormula` node (which
compiles a single JS *expression* per pixel via `new Function`).

Motivating example (a standard FastLED demo idiom the node must accept as-is):

```cpp
uint8_t dothue = 0;
for (int i = 0; i < 8; i++) {
  leds[beatsin16(i + 7, 0, NUM_LEDS - 1)] |= CHSV(dothue, 200, 255);
  dothue += 32;
}
```

## The core tension

The node lives in two worlds with very different difficulty:

- **C++ codegen (`cppGenerator.ts`) — easy.** `beatsin16`, `CHSV`, the `|=`
  additive-blend operator, and `millis()` all exist on-device. The pasted text
  drops into `loop()` almost unchanged.
- **Live preview (`graphEvaluator.ts`) — hard.** The preview runs in the
  browser in TypeScript. There is no `leds[]`, no `beatsin16`, no `CHSV`, and
  JS cannot overload `|=` on a colour object. Pasted C++ cannot run as-is.

## Decision

**Source of truth = the pasted FastLED C++.** The user's snippet must work
verbatim, so codegen is near pass-through. The **preview** is the side that does
the work: a lightweight C++→JS shim approximates the code each frame.

This matches the user's mental model — they paste real FastLED code — and keeps
the firmware authoritative. The preview is explicitly "best effort": anything
the shim can't handle degrades to a placeholder thumbnail rather than breaking.

(Chosen over two alternatives: a stubbed preview with no live render, and a
custom shim DSL the user writes against. The former loses the live-preview value
this whole app is built around; the latter forces the user to rewrite familiar
FastLED code into a bespoke API.)

## Shape

- New node type `Code`, category `pattern`.
- Property `code: string` (the pasted body). Optional `frame` input so the code
  can seed from / fade an incoming frame (as the real demos do with
  `fadeToBlackBy(leds, NUM_LEDS, n)`), and a `frame` output.
- Edited in a `<textarea>` in the node body (monospace, `nodrag` + `nowheel` so
  React Flow doesn't pan/scroll while typing).

### Codegen (near pass-through)

Each node already owns a `buf_<id>` buffer. Emit:

```cpp
{ CRGB* leds = buf_<id>;               // user code writes into this node's buffer
  const int NUM_LEDS = WIDTH * HEIGHT;
  /* seed buf_<id> from the frame input, or clear to black */
  <pasted code, verbatim>
}
```

so `leds[i]`, `NUM_LEDS`, and the FastLED helpers resolve correctly and the
node composes with the rest of the graph like any other frame source.

### Preview (C++→JS shim)

Mirror `formulaCache`: cache the transpiled function keyed by the source text,
clear when the cache grows past a cap, run inside `try/catch` so a malformed
paste falls back to black/placeholder. The transpile is a handful of regex
rewrites applied before `new Function`:

- **Strip C++ type keywords** at declaration sites:
  `\b(uint8_t|uint16_t|uint32_t|int|long|float|double|bool|byte)\s+(\w+)` → `let $2`.
  (Everything becomes an untyped JS `let`; integer-overflow wrap semantics are a
  known divergence — see below.)
- **Rewrite `leds[]` writes** (JS can't overload `|=`):
  - `leds[EXPR] |= RHS;` → `addLed(EXPR, RHS);` (additive blend / `qadd8` per channel)
  - `leds[EXPR] = RHS;`  → `setLed(EXPR, RHS);`
  - index `EXPR` is matched as `leds\[([^\]]*)\]` (no nested `[`, which covers the
    demo vocabulary including `beatsin16(...)` indices).
- **Shim runtime in scope:** `beatsin16/8`, `beat8/16`, `sin8/cos8`, `sin16`,
  `CHSV`, `CRGB`, `qadd8`, `scale8`, `random8`, `millis()`, `XY(x,y)`, plus the
  constants `NUM_LEDS / WIDTH / HEIGHT`. `t` (seconds) is available so timing
  matches the rest of the evaluator (wall-clock based).

## First-slice scope

Ships: the node + editor, pass-through codegen, and the shim preview covering
the vocabulary above — enough that the motivating snippet renders live *and*
compiles. Plus the standard 4-point registration (nodeLibrary entry, evaluator
case, codegen case, `NODE_DESCRIPTIONS` tooltip) and unit tests (a transpile
case + a codegen snapshot).

## Deferred (known divergences / follow-ups)

- **Integer-overflow semantics.** `dothue += 32` wraps at 256 in `uint8_t` (and
  `CHSV` hue wraps); the JS preview uses floats and won't wrap identically.
  Acceptable for a visual approximation; revisit if it bites.
- `EVERY_N_MILLISECONDS` / `EVERY_N_SECONDS` and other timing macros.
- User-defined helper functions and `#include`s above the loop body.
- Palette globals (`CRGBPalette16`, `ColorFromPalette`) and `XY`-map customisation.
- Multi-statement type inference beyond the `let` blanket.

## Touch points

- `src/state/nodeLibrary.ts` — node entry + `NODE_DESCRIPTIONS` tooltip.
- `src/state/graphEvaluator.ts` — `Code` case + a `codeCache` (transpile + run),
  modelled on `evalCustomFormula` / `formulaCache`.
- `src/codegen/cppGenerator.ts` — `Code` case (buffer alias + verbatim body).
- `src/components/Canvas/StudioNode.tsx` — the `<textarea>` editor in the body.
- Tests under `src/state/__tests__/` and `src/codegen/__tests__/`.
