# Code node — design note

Status: implemented (first-slice scope shipped; preview fidelity for the FastLED classics 2026-10-13) · Owner: app · Date: 2026-06-27

A **Code node** lets a user paste raw FastLED/Arduino C++ — a loop body that
writes directly into `leds[]` — and have it both (a) compile into the generated
sketch verbatim and (b) approximate in the live LED preview. It is the
imperative, frame-filling sibling of the existing `CustomFormula` node (which
compiles a single expression per pixel via the sandboxed parser in
`src/nodes/shared/formulaLang.ts`).

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

### Preview (C++→JS shim, sandboxed)

**Security note (2026-07-13):** the compiled shim now runs inside a dedicated
Web Worker (`src/state/codeSandbox.worker.ts`), not the main thread. A graph
(and therefore a Code node's pasted text) can arrive from a share link, a
JSON import, or someone else's project file — `new Function` on the main
thread would let that content reach `window`/`fetch`/`localStorage`/etc.
Workers have no DOM/storage/cookies/parent-navigation by construction, and the
worker bootstrap additionally closes `fetch`/`XMLHttpRequest`/`WebSocket`/
`EventSource`/`importScripts`/`indexedDB`/`caches`/`BroadcastChannel`/spawning
sub-workers before any pasted code can run. `new Function` inside that closed
realm is fine — there's nothing dangerous left to reach. The main-thread
controller (`src/state/codeSandboxRuntime.ts`) keeps at most one `run`
message in flight per instance — while one is outstanding, later ticks only
replace the queued next request, posted when the reply lands — and enforces a
~100ms timeout on that in-flight run: a request that doesn't answer in time gets
`worker.terminate()`'d and a fresh worker spawns on the next call (the
persisted `leds[]` state is lost when that happens — an accepted trade-off for
"a runaway paste can't hang the tab"). Preview evaluation is therefore no
longer synchronous with the graph's own render tick: `evalCodeAsync` always
returns immediately with the most recently *completed* frame (blank on the
very first call for a new instance) rather than blocking on the worker
round-trip — the same decoupled-cadence pattern already used elsewhere for
per-node live previews, so a Code node's displayed frame can lag the true
render tick by roughly one round trip. See the sandbox runtime and worker modules below for
the sibling `CustomFormula`/`FieldFormula` fix (a parsed expression grammar
instead of `new Function`, since those don't need general-purpose execution).

Mirror `formulaCache`: cache the transpiled function keyed by `globalCode + code`
(now cached per-worker-instance, one worker per Code-node instance, rather than
one shared cache keyed by source string), run inside `try/catch` so a malformed
paste falls back to black. The two sections cross to the worker separately
(`globalBody` and `body` on the run request) and compile into a **factory**:
the Global section runs once in the factory body, at compile time, and the
factory returns the per-frame loop function as a closure over it. So a global
`uint8_t gHue` declared once keeps its value across frames, as a file-scope
variable does on the board, and a global helper sees `leds[]`, `NUM_LEDS`,
`WIDTH`, `HEIGHT`, `t` and the whole shim vocabulary, which the factory binds
as `let`s at its top and the loop function rebinds each frame (the shim closes
over that frame's `t` and `leds[]`). Editing either section recompiles and
re-initialises the globals, as re-uploading would. The transpile runs on the
main thread (only the *compiled source* crosses into the worker) — a handful
of regex rewrites and one small scanner applied before `new Function`:

- **Drop storage qualifiers** (`static uint8_t x` → `x`).
- **C++ function definition → JS function**: `<retType> name(<typed args>) {` →
  `function name(<stripped args>) {`, so global helper functions run.
- **Strip C++ type keywords** at declaration sites → `let`.
- **Wrap narrow integers.** Every scalar declared `uint8_t`, `byte`, `int8_t`,
  `uint16_t` or `int16_t` (a variable or a typed helper argument) is remembered
  by name across both sections, and each assignment to it masks the stored
  value to that width: `x = E` → `x = (E) & 255`, `x += E` →
  `x = (x + (E)) & 255`, `x++` → `((x = (x + 1) & 255), (x - 1) & 255)` so
  postfix keeps its value; signed types sign-extend with a shift pair. The
  right-hand side ends at the first `;`, `,` or closing bracket at depth zero,
  so a for-header `i += 2)` and `x = CRGB(1, 2, 3);` both stop where C++
  does, and a right-hand side that itself assigns (`y = x++`) is rewritten
  inside. `int` and wider types are left alone: `int` is 32-bit on the ESP32
  targets the preview models, so `for (int i …)` never wraps. A `uint8_t`
  loop counter against a strip longer than 255 spins forever in the preview
  exactly as it would on the board, and the run timeout reports it.
- **Timing macros.** `EVERY_N_MILLISECONDS(n)`, `EVERY_N_MILLIS(n)` and
  `EVERY_N_SECONDS(n)` become `if (everyN(k, n))`, where `k` numbers the
  macro's position across both sections and the worker keeps that timer's
  last-fire time in evaluator milliseconds (`t * 1000`), so Master Speed
  scales it with everything else. The timer follows FastLED's `CEveryNTime`:
  created on first reach with its trigger time set to now, it fires once the
  period has elapsed and re-arms from the fire time, not from the schedule.
  Timers reset on recompile, as fresh statics would.
- **Rewrite `leds[]` writes** (JS can't overload the CRGB operators):
  - `leds[EXPR] += RHS;` → `addLed(EXPR, RHS);` (`qadd8` per channel, saturating)
  - `leds[EXPR] |= RHS;` → `maxLed(EXPR, RHS);` (per-channel maximum, as FastLED's `|=`)
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
  (`sin8`…`sqrt16`) come from the shared `src/nodes/shared/fastledShims.ts`, so the
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
inside the worker each tick; a **compile** error (e.g. unbalanced braces), a
**runtime** error (e.g. an unsupported function), or a **timeout** (an infinite
loop, terminated after ~100ms) is recorded per node-instance and surfaced as a
red `⚠ <message>` banner under the editors (a `CodeError` component subscribes to
`previewStore` so it refreshes ~each eval tick). The last good frame stays on
screen, the render loop keeps evaluating, and the banner clears automatically the
moment the code runs cleanly again (a timeout instead respawns a fresh worker
with empty state, since the one holding the persisted `leds[]` was terminated).
`getCodeError(stateKey)` is the accessor.

## First-slice scope

Ships: the node + Global/Loop editors, two-section codegen (global at file
scope, loop in `loop()`), and the shim preview covering the vocabulary above —
enough that the motivating snippet renders live *and* compiles, and global
helper functions work in both. Plus the standard 4-point registration
(nodeLibrary entry, evaluator case, codegen case, `NODE_DESCRIPTIONS` tooltip)
and unit tests (transpile/eval cases + codegen snapshots).

## Deferred (known divergences / follow-ups)

- **`static` locals in the Loop section** re-initialise each frame: `static`
  is stripped and the declaration becomes a `let` inside the per-frame
  function. On the board a function-scope static persists. Move the variable
  to the Global section, which does persist in the preview.
- **Integer wrap covers assignments to named scalars only.** A wider
  expression that is never stored back into a narrow variable (`CHSV(h + 300,
  …)`) is not wrapped, nor are `uint8_t` arrays, `int` on AVR (16-bit there,
  32-bit on every ESP32 target), or a name declared narrow in one place and
  wide in another.
- **Timing macros** cover `EVERY_N_MILLISECONDS`, `EVERY_N_MILLIS` and
  `EVERY_N_SECONDS`. The `_I` named forms, `EVERY_N_MINUTES`/`HOURS` and the
  `CEveryNMillis` objects are not rewritten.
- `#include`s; custom `CRGBPalette16` gradient definitions (`CRGBPalette16 p = { … }`
  / `fill_gradient`*), beyond the constructor-from-colours and preset forms;
  `XY`-map customisation in the preview shim.
- Multi-statement type inference beyond the `let` blanket.

## Touch points

- `src/nodes/code/definitions.ts` — node entry (`globalCode` + `code`) and its description.
- `src/state/graphEvaluator.ts` — `Code` case, calling `evalCodeAsync` (below);
  no longer owns the compile/execute pipeline itself.
- `src/state/codeSandboxRuntime.ts` — main-thread controller:
  `transpileSections` (storage/function-def/type/`::`/leds rewrites, the
  integer-wrap scanner and the `EVERY_N_*` rewrite, sharing one type table and
  timer numbering across both sections; `transpileCode` is the one-section
  form for tests), per-instance worker pool, the run-timeout/respawn logic,
  `evalCodeAsync`, and `codeError`/`getCodeError`/`disposeCodeSandbox`.
- `src/state/codeSandbox.worker.ts` — the sandboxed worker: bootstrap that
  closes network/storage/messaging APIs, `compileSections` (the global-once
  factory), `makeCodeShim` with the `everyN` timers, and `handleRunRequest`
  (size `leds[]`, compile if the source changed, run one tick, pack).
- `src/state/palettes/ledColor.ts` — `RGB`/`Palette`/`hsv`/`samplePalette`/`palAt`/the
  FastLED preset-palette tables, shared by the worker and the main-thread
  evaluator (re-exported from `graphEvaluator.ts` for existing importers).
- `src/codegen/cppGenerator.ts` — `Code` case + `globalLines` (file scope) and
  the loop block (buffer alias + verbatim body) — unchanged, still pass-through.
- `src/components/Canvas/StudioNode.tsx` — the Global + Loop `<textarea>` editors
  and the `CodeError` banner.
- Tests: `src/state/__tests__/codeTranspile.test.ts` (the wrap and timer
  rewrites as strings), `src/state/__tests__/codeSandbox.worker.test.ts`
  (compile/execute/persistence/error cases against `handleRunRequest`
  directly, including persistent globals, wrap and `EVERY_N_*` through the
  worker),
  `src/state/__tests__/codeSandboxRuntime.test.ts` (message protocol, timeout/
  respawn, fail-closed, against a mocked `Worker`), and `src/codegen/__tests__/`
  for codegen (unchanged).
