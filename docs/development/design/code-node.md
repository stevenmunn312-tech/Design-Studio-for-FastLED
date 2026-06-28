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
- **Two editors** (`<textarea>`, monospace, `nodrag` + `nowheel`):
  - **Global** (`properties.globalCode`) → emitted at **file scope** (helper
    functions, persistent vars, palettes), mirroring how real FastLED sketches
    declare state and helpers outside `loop()`.
  - **Loop** (`properties.code`) → emitted inside `loop()`; runs each frame and
    writes into `leds[]`.

### Codegen (near pass-through)

The **Global** section is collected into `globalLines` and emitted between the
buffer declarations and `setup()`. The **Loop** section is emitted into the
node's block in `loop()`; each node already owns a `buf_<id>` buffer:

```cpp
// ── Code node <id> — globals ──
<global section, verbatim, at file scope>

void loop() {
  ...
  { CRGB* leds = buf_<id>;   // loop body writes into this node's buffer
    /* memmove buf_<id> from the frame input if wired; else it persists */
    <loop section, verbatim>
  }
}
```

`NUM_LEDS` is already `#define`d globally, so `leds[i]` and the FastLED helpers
resolve and the node composes like any other frame source. Buffers are global
arrays, so an unwired buffer persists across `loop()` — `fadeToBlackBy` trails
accumulate on-device exactly as the preview shows.

### Preview (C++→JS shim)

Mirror `formulaCache`: cache the transpiled function keyed by `globalCode + code`,
clear when the cache grows past a cap, run inside `try/catch` so a malformed
paste falls back to black. The global section is transpiled and prepended to the
loop section in one compiled function (so global helpers/constants are in scope
for the loop). The transpile is a handful of regex rewrites applied before
`new Function`:

- **Drop storage qualifiers** (`static uint8_t x` → `x`).
- **C++ function definition → JS function**: `<retType> name(<typed args>) {` →
  `function name(<stripped args>) {`, so global helper functions run.
- **Strip C++ type keywords** at declaration sites → `let`.
  (Integer-overflow wrap semantics are a known divergence — see below.)
- **Rewrite `leds[]` writes** (JS can't overload `|=`):
  - `leds[EXPR] |= RHS;` → `addLed(EXPR, RHS);` (additive blend / `qadd8` per channel)
  - `leds[EXPR] = RHS;`  → `setLed(EXPR, RHS);`
  - index `EXPR` is matched as `leds\[([^\]]*)\]` (no nested `[`, which covers the
    demo vocabulary including `beatsin16(...)` indices).
- **Named colour constants:** `CRGB::Red` (invalid JS `::`) → `crgbConst('Red')`,
  resolved against a small common table (extend as needed).
- **Shim runtime in scope:** `beatsin16/8`, `beat8/16`, `sin8/cos8`, `sin16`,
  `triwave8`, `quadwave8`, `cubicwave8`, `ease8InOutQuad`, `ease8InOutCubic`,
  `CHSV`, `CRGB`, `qadd8`, `qsub8`, `scale8`, `nscale8`, `blend8`, `lerp8by8`,
  `lerp16by16`, `sqrt16`, `random8/16`, `millis()`, `XY(x,y)`,
  `fadeToBlackBy`, `fill_solid`, `fill_rainbow`, `nblend`, plus the constants
  `NUM_LEDS / WIDTH / HEIGHT`. `t` (seconds) is available so timing matches the
  rest of the evaluator (wall-clock based). The fixed-point wave/scale shims
  (`sin8`…`sqrt16`) come from the shared `src/state/fastledShims.ts`, so the
  field-formula nodes accept the same vocabulary and the C++ generator stays in
  sync.
- **Palettes:** `ColorFromPalette(pal, index, brightness)`, `fill_palette(...)`,
  and the `CRGBPalette16(...)` constructor, all backed by the evaluator's own
  `samplePalette`. The FastLED preset constants (`RainbowColors_p`,
  `OceanColors_p`, `LavaColors_p`, `ForestColors_p`, `PartyColors_p`,
  `HeatColors_p`, `CloudColors_p`, `RainbowStripeColors_p`) and blend-type enums
  (`LINEARBLEND`/`NOBLEND`) are in scope; `CRGBPalette16 p = …` is type-stripped
  like any declaration. (`RainbowStripe` approximates as `rainbow`.)

### Error handling

Errors never silently freeze the node. The compiled function runs in `try/catch`
each frame; a **compile** error (e.g. unbalanced braces) or a **runtime** error
(e.g. an unsupported function) is recorded per node-instance and surfaced as a
red `⚠ <message>` banner under the editors (a `CodeError` component subscribes to
`previewStore` so it refreshes ~each eval tick). The last good frame stays on
screen, the render loop keeps evaluating, and the banner clears automatically the
moment the code runs cleanly again. `getCodeError(stateKey)` is the accessor.

## First-slice scope

Ships: the node + Global/Loop editors, two-section codegen (global at file
scope, loop in `loop()`), and the shim preview covering the vocabulary above —
enough that the motivating snippet renders live *and* compiles, and global
helper functions work in both. Plus the standard 4-point registration
(nodeLibrary entry, evaluator case, codegen case, `NODE_DESCRIPTIONS` tooltip)
and unit tests (transpile/eval cases + codegen snapshots).

## Deferred (known divergences / follow-ups)

- **Integer-overflow semantics.** `dothue += 32` wraps at 256 in `uint8_t` (and
  `CHSV` hue wraps); the JS preview uses floats and won't wrap identically.
  Acceptable for a visual approximation; revisit if it bites.
- **Mutable global state doesn't persist in the preview.** The global section
  re-runs each frame, so a global counter like `gHue` re-initialises every frame
  in the preview (helper functions and constants are fine). It persists and
  animates correctly **on-device** (file-scope vars). Making the preview persist
  global state needs identifier-rewriting onto a per-node scope object — deferred.
- `EVERY_N_MILLISECONDS` / `EVERY_N_SECONDS` and other timing macros.
- `#include`s; custom `CRGBPalette16` gradient definitions (`CRGBPalette16 p = { … }`
  / `fill_gradient`*), beyond the constructor-from-colours and preset forms;
  `XY`-map customisation in the preview shim.
- Multi-statement type inference beyond the `let` blanket.

## Touch points

- `src/state/nodeLibrary.ts` — node entry (`globalCode` + `code`) + `NODE_DESCRIPTIONS`.
- `src/state/graphEvaluator.ts` — `Code` case + `codeCache`/`codeLeds`,
  `transpileCode` (storage/function-def/type/`::`/leds rewrites), `makeCodeShim`,
  `evalCode` (global + loop, persistent `leds[]`), and `codeError`/`getCodeError`.
- `src/codegen/cppGenerator.ts` — `Code` case + `globalLines` (file scope) and
  the loop block (buffer alias + verbatim body).
- `src/components/Canvas/StudioNode.tsx` — the Global + Loop `<textarea>` editors
  and the `CodeError` banner.
- Tests under `src/state/__tests__/` and `src/codegen/__tests__/`.
