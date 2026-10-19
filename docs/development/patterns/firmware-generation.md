# Firmware generation

Traps in emitting C++ from TypeScript templates, and the instrument sketches
that are built outside the normal build path.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## C++ emission hazards

- Never emit an output's `addLeds` outside `fastledSetupCpp`: data lanes
  (`LedHardware.lanePins`) and the clocked data rate are added there, and a
  generator that builds its own call drops both. A lane count is a template
  pin per lane plus `(leds, offset, count)`; `laneRanges` leaves a macro count
  for the compiler to divide, so pass the physical count macro (`PANEL_LEDS`,
  a shape count), not the render buffer's `NUM_LEDS`, when they differ.

- Animation phase is integrated, never `t * rate`: a node whose rate can move
  (a wired `speed`, a level-modulated motion term) emits
  `speedPhaseCpp(ln, phaseTag(id, term), rateExpr)` from
  `src/nodes/shared/speedClockCpp.ts` inside its own `{ }` block — a static
  accumulator seeded at `t * rate` on the first frame — and uses the returned
  `_phase_<tag>` where the preview uses `speedPhase(...)`. Same term names on
  both sides keep parity; `needsT.v = true` is still required. See
  [graph and nodes](graph-and-nodes.md#evaluation) for the rule and the seed
  guarantee that keeps constant rates bit-identical to the old form.

- Show transitions embed `FRAME_SAMPLE_HELPER_CPP`. When collected patterns
  also lift that block (Frame Warp or Symmetry), emit it only when transitions
  are disabled; deduplicating the standalone helper list alone cannot remove
  a block embedded in the transition helper. Keep coverage for both modes.

- The S3 IR RMT adapter must request the same explicit interrupt priority as
  FastLED's RMT5 transmitter: `FL_RMT5_INTERRUPT_LEVEL` when available, otherwise
  the pinned FastLED default of 3. Leaving RX at automatic priority (0) causes
  `rmt_new_tx_channel: intr_priority conflict` on the first LED show, even though
  the receiver learner alone works. Keep this in the shared adapter used by
  learning, normal sketches, shows, and collection players.
  Define its IRAM callback outside the class: Xtensa can put literals for an
  inline class member in flash while placing the function in IRAM, causing a
  `dangerous relocation: l32r` link failure. See
  [Espressif's reproducer](https://github.com/espressif/esp-idf/issues/16989).
  Keep it a qualified member definition to avoid Arduino prototype hoisting.

- Lattice helpers return `_LatticeCell` and `_FanFold` by value. Their
  `LATTICE_CPP_FORWARD` declarations must precede every function in normal,
  slideshow, and collection-player sketches to survive Arduino prototype
  hoisting. A show/player emits them when its compiled renderers contain the
  shared lattice helper block.

- The Arduino `.ino` preprocessor hoists a function prototype for every function
  to a point *above* all user type definitions, so a generated function that
  takes a display helper struct by reference fails to compile on a line no
  generator wrote. `src/codegen/displays/infoDisplayCpp.ts` (`struct OledPanel`),
  `src/codegen/displays/segmentDisplayCpp.ts` (`struct SegDisplay`),
  `src/codegen/player/patternSelectionCpp.ts` (`struct PatternSel`), and now
  `src/codegen/peripherals/rtcCpp.ts` (`RTC_CPP_FORWARD` for `struct _RtcDateTime`, guarded
  by `emitRtcHelpers` and needed because `_rtcParseBuildStamp`/`_rtcReadDs3231`
  take it by reference) each hold/export a `*_CPP_FORWARD` constant emitted into
  the sketch preamble ahead of the hoisted prototypes by whichever generators
  can produce that struct (`PatternSel` only reaches the player and show
  templates now). `PatternSel` hit the same failure after the first two were
  hand-listed in the guard, so
  `src/codegen/__tests__/displayForwardDeclarations.test.ts` derives the rule
  instead: it scans the emitted sketch for every `struct X {` definition used by
  reference and requires each to be forward-declared before the first function,
  so `_RtcDateTime` needed no new test-side listing to be caught — proof the
  derive-don't-list design holds as the struct count grows. Show and player
  control graphs emit that same `RTC_CPP_FORWARD` when a helper contains
  `struct _RtcDateTime {`, after `#include <FastLED.h>`. Better still, don't
  qualify: a generated struct that carries its state in *member* functions is
  never a by-reference parameter, so it never meets the hoist at all —
  `playerControlsCpp.ts`'s `PlayerControlsValue`/`CtlEdge`/`CtlDetent` are built
  that way deliberately and need no forward declaration. The same trap was
  already solved once for FastLED's `CRGB`. Because this generated C++ lives
  inside TypeScript template literals, anything the template consumes before C
  sees it is a hazard: backticks in generated-code comments terminate the
  template, and `\n` in a generated string is a *real* newline where only `\\n`
  survives as a C escape — which splits the string literal, turns its remaining
  text into code, and is reported against whatever that text starts with rather
  than against the escape (an em dash, in `sdPinProbeSketch.ts`'s case).
  `sdPinProbeSketch.test.ts` guards the class by asserting balanced quotes per
  emitted line, since a C string cannot span one; prefer that shape over
  remembering each new instance.
  A custom type used as a generated helper's return value has the same failure
  mode even when the definition visibly precedes the function in the `.ino`.
  The symmetry fold therefore writes two primitive `float&` outputs instead of
  returning a `_WallpaperPoint`; use primitive parameters/results or emit the
  type's forward declaration in the preamble, and prove the choice with a real
  Arduino compile rather than a text-only assertion.
- `cppGenerator.ts`'s topological sort drops edges into a `TransportDisplay`
  before ordering, so a panel's own `out -> graph -> set` widget feedback
  doesn't look like a cycle — but only widget edges (`targetHandle` parsing as
  `widget:<id>:<role>`) may be dropped; `display`/`enabled` are real
  dependencies. Dropping them too once let a source feeding nothing but a panel
  land after the panel reading it, emitting an undeclared variable — e.g. an RTC
  driving a fixed Clock layout.
  `src/codegen/__tests__/emittedDeclarationOrder.test.ts` guards the fix: it
  derives every `n_<node>_<port>` local from the emitted `loop()` text and
  asserts each is declared before its first use — the ordering half of what
  `emittedSymbols.test.ts` covers for declaration-at-all. A text-level test can
  read as fully correct while only the *order* is wrong, which is why this one
  needed a compile, not a diff, to surface.
- `6f` is not a C++ literal — the `f` suffix belongs to a floating-point literal
  and an integer cannot take it, so a whole-number constant must be emitted as
  `6.0f`. The generators build literals by interpolating TypeScript numbers into
  template strings, so a constant that happens to be a whole number (e.g.
  `WIREFRAME_CAM_FAR = 6`) emits `6f` while its fractional neighbour emits
  `4.5000f`, and the two look identical in the diff — nothing but a C++ compiler
  catches it, since every text-level test in `src/codegen/__tests__/` asserts
  that the right *expression* was emitted, not that it parses. Route every
  interpolated number through `.toFixed(n)`.
  `src/codegen/__tests__/emittedNumericLiterals.test.ts` derives the guard,
  generating one sketch per `pattern`-category node in `NODE_LIBRARY` and
  scanning the emitted text for an integer carrying the float suffix, with a
  regex needing two lookbehinds (`(?<![\w.])(?<![eE][+-])\d+f\b`) so it doesn't
  flag the legal exponent form `1e-6f`. The sweep also generates the *variants a
  property selects between* (as it does for Wireframe3D's `projection`), because
  a knob that picks which block the generator emits otherwise hides that block
  behind each node's defaults — which is exactly where this bug hid. The same
  mistake recurs from the other side when a baked number is converted to a
  property input: a baked literal carries its `f` suffix at each *use*
  (`${R}f`), which is correct while `R` is a literal, but the moment `R` becomes
  a per-frame local name the suffix is no longer a suffix — `${Rf}f` emits
  `_paRf`, an identifier nothing declares, a hard compile error that still reads
  as ordinary arithmetic in the diff. Strip the suffix from a value's use sites
  when hoisting it to a local. `emittedNumericLiterals.test.ts` covers both
  directions over the same sweep: an integer carrying the float suffix, and a
  declared local appearing elsewhere in the text with an `f` glued to it unless
  something else declares that glued name too.
- A hash that the preview and the sketch both compute must return the same
  number, not a close one, and a text-level test that the helper was emitted
  cannot tell the difference. `_worleyHash` kept the low 24 bits while
  `worleyHash` divided all 32 by 2^32, so every Worley feature point sat
  somewhere else on the LEDs than in the preview. It also multiplied before
  casting, `(uint32_t)(x * 374761393)`, which overflows a signed int:
  undefined behaviour. The shared construction casts each operand first,
  `(uint32_t)x * 374761393u`, stays unsigned 32-bit, and keeps the top 24
  bits, which a float32 holds exactly. That is `latticeHash`, `worleyHash` (the
  same hash, with a default seed of zero) and their twins in
  `latticeHelperCpp.ts`, which interpolate the multipliers from
  `LATTICE_HASH_MULTIPLIERS`. A node seed is the hash's third input on both
  sides; do not substitute `seededHash` in the preview or a time/cell offset in
  firmware, because those are different functions even when each looks random.
  `lattice.test.ts` and `random.test.ts` hold each TypeScript hash to a BigInt
  model of the C arithmetic; a new hash needs the same test.
- A simulation whose next step branches on near-equal floats must round like
  the sketch, or the preview and the LEDs grow apart within seconds. The
  Turing Field's preview rounds with `Math.fround` after every operation, in
  the C++ helper's order, and avoids `x * y + z` where `x * y` is inexact,
  because GCC fuses multiply-adds by default in the Arduino cores' GNU
  dialect and a fused operation rounds once. A native `g++` test
  (`turingNativeParity.test.ts`) holds the two bit-exact; copy it for the
  next such node.
- Never `sizeof` a render buffer. `buf_<id>` and `field_<id>` are arrays
  normally, but `usePsram` turns them into pointers allocated in `setup()`,
  and `sizeof` then copies four bytes. Copy with `NUM_LEDS*sizeof(float)` or
  `sizeof(CRGB)*NUM_LEDS`, as Reaction Diffusion does now that its V state
  lives in its own `field_<id>`. A node's own `static` arrays stay arrays, so
  `sizeof` is safe on those.
- **A node that reads last frame's pixels back out of its own buffer must say
  so:** `ownBuf({ persists: true })` or `ownField(port, { persists: true })`.
  That covers a fade or accumulate (Trails, Confetti, Juggle, Color Trails), a
  scroll (the Spectrum waterfall), a partial or occasional write (DDP, SD
  Video) and state kept in the buffer (Reaction Diffusion's V). Every other
  buffer is scratch and is shared: a sketch with several output shapes
  (`nativeMultiRender`) reuses one global set across its passes, and a show or
  player pools scratch across collected patterns (`_pool_buf_<n>`,
  `_pool_field_<n>`), because only one pattern renders at a time, even
  through a transition. A persistent buffer instead becomes a static of each
  native pass, and stays the pattern's own (`p<n>_buf_<id>`) in a show. The
  declaration carries the mark (`renderBuffers.ts`), which is how the show
  builder tells the two apart in finished sketch text. Forgetting it compiles
  and fails only on the LEDs, as another pattern's leftovers or lost trails,
  so `persistentRenderBuffers.test.ts` derives the rule over every node,
  select and toggle variant: the first loop line touching a node's own buffer
  must be a whole write, or the declaration must be marked. A whole write the
  line test cannot see goes in its reviewed list with the reason.
- Scratch buffers share storage within one graph too (`scratchSharing.ts`).
  A buffer is live from its first to its last top-level loop statement, so two
  whose spans do not meet use one array (`CRGB* const buf_b = buf_a;   //
  shares its storage`, or `CRGB*&` to a PSRAM pointer). A node whose first
  statement is `::memmove(own, src, sizeof(CRGB) * NUM_LEDS);` (or the
  `memcpy` of a field), where that is the source's last use, runs on the
  source's array and the copy is dropped; a chain of these into the terminal
  renders into `leds`. Spans are statements, not lines, because a loop written
  over several lines runs each line many times. A buffer named anywhere but
  the loop (setup, globals, a screen sampler) keeps its own array, and the
  corpus test in `scratchSharing.test.ts` holds that. Seed with that exact
  copy statement to get in-place for free; any other form keeps the copy. The
  show builder resolves an alias onto its owner's pool slot.
  `estimateFirmwareRam` does not model sharing and over-counts, which is the
  safe direction; model sharing there if the budget warning starts refusing
  graphs that fit. Measured savings are in the
  [render-buffer RAM compile checks](../../reports/compile/render-buffer-ram-compile-checks.md).
- A persistent buffer is never `leds`. The node feeding a plain single output
  normally renders straight into `leds` (`CRGB* const buf_<id> = leds;`), but
  the output dims `leds` in place and blackout clears it, so a persistent
  terminal keeps its own buffer and is copied over. `estimateFirmwareRam`
  cannot run an emitter, so it refuses the alias by node type through
  `PERSISTENT_FRAME_NODE_TYPES`; the same test derives that list.
- The Arduino preprocessor hoists a prototype of every function that returns
  `CRGB` to a point above `#include <FastLED.h>` unless an explicit prototype
  already exists after that include. Show `fastLedDecls` scans pattern helpers
  and the control graph's helpers. The player scans collection renderers inside
  `if (collection)` and `compiledGraph.helpers` outside that block, because a
  colour node used only by the control graph never appears in a pattern
  renderer. `kelvinToRGB` is one shared string, `KELVIN_TO_RGB_CPP`, so the
  show helper set emits it once; keep its comment outside the function or the
  two copies stop matching. `_hueMix` is the same kind of prototype.
- A screen-only sketch (a panel plus a screen design, no LED output) is trimmed
  of FastLED entirely, not just left minimal: `cppGenerator.ts`'s
  `withoutUnusedFastLed(lines)`, applied at the generator's single
  `return withoutUnusedFastLed(lines).join('\n')` assembly point, drops the
  `FASTLED_INCLUDE` (`#include <FastLED.h>`) line when no emitted line
  matches a FastLED-ish spelling (`FastLED`, `CRGB`, `CHSV`,
  `CLEDController`, `CPixelView`, `fill_solid`/`fill_rainbow`/`fill_gradient*`,
  `nscale8*`, `blend8`, `beatsin*`, `inoise*`, `EVERY_N_*`, `qadd8`, `qsub8`,
  `scale8*`). The include is the expensive half to drop: arduino-cli compiles
  every source file in a library folder whether the sketch uses it or not. The
  check reads the *emitted lines themselves* rather than a registry of node
  types that imply FastLED, so a node added later that draws pixels keeps the
  include with nothing to update; the regex is deliberately biased toward
  keeping FastLED, since a false positive only costs a compile already paid for
  while a false negative breaks the build. Held at both ends by
  `src/codegen/__tests__/screenOnlyFastLed.test.ts`. The pacing call
  (`_paceFrame(...)`) names no FastLED symbol, so it never keeps the include;
  `withLoopPacing` then picks the sleep-only pacing function because no
  `FastLED.show();` is left.

- **Never pace a loop with `FastLED.delay`.** In the pinned FastLED 3.10.5,
  `CFastLED::delay` is a do-while that calls `show()` then `delay(1)` until the
  time is up, so `FastLED.show(); FastLED.delay(N);` sends every frame at
  least twice and adds `N` to the work instead of absorbing it (50 fps from a
  2 ms pass at a 60 fps cap; a 30 ms send capped near 16 fps). Every
  generator ends `loop()` with `loopPacingCpp(frameRate)` from
  `src/codegen/loopPacing.ts`, one `_paceFrame(periodUs)` line that
  `isLoopPacing` recognises (the telemetry report goes before it, the show
  builder's pattern extraction skips it). `withLoopPacing(source)` adds the
  function above `loop()` as the last step of each generator, read off the
  finished text: with a `FastLED.show();` statement it keeps dither refreshes
  only while a measured send plus a 1 ms yield still fits before the deadline
  (half a period until one send is measured), otherwise it only sleeps. A
  frame late by more than a period restarts the schedule rather than
  bursting. Held by `src/codegen/__tests__/loopPacing.test.ts`.

- Device telemetry's globals are a placeholder line
  (`TELEMETRY_GLOBALS_CPP`) that `withTelemetryGlobals(lines)` fills once the
  sketch is whole, because the render/send split depends on what `loop()`
  sends and generators write globals before the loop. It rewrites each
  `FastLED.show();` statement inside `loop()` to `_telShow();` at the same
  indent, so write a frame's send as that one statement on its own line or it
  is not timed. The show generator fills it after its index-based splices.

- Per-node frame cost (`top=`) is the normal sketch's alone. With telemetry
  on, `generateCpp` wraps each node's loop lines in `_telNodeStart();` …
  `_telNodeEnd(index);` (`timedNodeBlock`, which refuses a block that does not
  close its own braces) and writes the labels once as
  `telemetryNodeMapLine` after the globals placeholder.
  `telemetryEmitFromSource` sizes the timing statics from that map and emits
  them only when `_telNodeEnd(` calls are present too, so neither half ships
  alone. The app reads the same map back from the uploaded text with
  `telemetryNodeLabels` (`uploadStore.runUpload` hands it to the telemetry
  store on success), so index and label share one source. A native
  multi-output render is not timed: its template is defined above the
  telemetry globals. A node that sends (the LED output) has its
  `_telShow()` time subtracted, because the wire is `sendms`, not the node.

- **Resampled LED outputs share one tap rule with the preview.** Half-resolution
  render scale (`src/state/output/renderScale.ts`, `src/codegen/output/renderScaleCpp.ts`) and
  positioned strings (`src/state/output/stringPositions.ts`) take their source pixels and
  weights from `upscaleTap` / `positionTap`, and `routeFrame` and the emitted C++
  both use them; change the tap in TypeScript and the C++ together. Render scale
  is matrix-only and mutually exclusive with supersample (supersample wins). A
  positioned string bakes only fixed-point (1/256 unit) numbers into PROGMEM;
  the user's text is parsed in TypeScript and never interpolated into C++.
  The ring, corkscrew and position tables and the copy through them are one
  emitter, `src/codegen/output/shapeMapCpp.ts`, shared by the normal sketch
  (single and multi-route), the show sketch and the SD player; `ringMapFor`
  and `corkscrewMapFor` stay in `src/state/output/outputRouting.ts` because the
  preview routes through them. Add a shape there, not in a generator.

- The sketch's network is one emitter, `src/codegen/peripherals/networkCpp.ts`:
  `networkSketchCpp(nodes, source)` returns the platform headers as **one
  string**, the `_netEnsureConnected()`/`_netConnected()` bootstrap and the
  wired setup line. The normal sketch pushes those three pieces itself; in a
  show or SD player an NTP `RTCInput`'s control-graph emission carries them,
  so every generator starts the same link. Keep the header block a single
  string: the control graph dedupes includes by element, and a per-line block
  would lose its second `#endif` against another block's. Every NTP clock in a
  graph emits identical blocks (settings from `networkSourceIn`), which is what
  lets that dedupe leave exactly one bootstrap.

- A clocked chipset's data rate reaches C++ only as `DATA_RATE_MHZ(n)` after
  the colour order in `fastledSetupCpp`'s `addLeds`, and only when `n` is in
  the chipset's `CLOCKED_DATA_RATES_MHZ` list and differs from FastLED's
  default; `ledHardwareFromProps` turns anything else into `null`, which emits
  nothing. Keep the rates whole MHz: on software-SPI platforms the macro is
  `CPU MHz / n` in integer arithmetic, a divider rather than a frequency.

## Dead-code pruning

All three generators finish through `finishCpp` (`src/codegen/cppCleanup.ts`)
after `specializeCpp` (`src/codegen/cppSpecialize.ts`). So emitters can stay
simple and emit a whole helper block, or every output port, and the finished
sketch still carries only what the graph reaches.

- `specializeCpp` resolves `#if` on facts generation knows: the selected board
  family and the sketch's own `#define`s. It never infers IDF or library
  versions. `specializeSwitch` folds a switch over a constant; a one-style
  transition pool uses it, so the arm becomes the body.
- `withoutUnreadLocals` drops declarations nothing reads, stores to
  write-only variables, and the pure helpers that only fed them. A call it
  cannot prove pure (`pureFunctions`: no `static`, no writes outside plain
  locals, only pure calls) keeps running as `(void)(...)`. Struct members are
  never touched, because positional initialisers depend on layout.
  A bare `(void)name;` silencer is not a read: a declaration whose only other
  mentions are silencers loses them first and then goes, so FieldFormula and
  CustomFormula stop paying `sqrtf`/`atan2f` per pixel for an `r` or `angle`
  the formula never names. Unread is judged per block as well as sketch-wide
  (mentions from the declaration to its block's close), so two nodes' blocks
  that each declare `r` are judged apart; a name any `#` line mentions falls
  back to the sketch-wide count. Trap: a test fixture that "reads" a value
  with `(void)v;` now reads nothing, and everything feeding `v` is pruned;
  read it through a real effect (`Serial.println(v)`). The per-block count
  also ends a quiet shield: a port output declared in both arms of an
  `#if`/`#else` used to count twice and survive unread; it now goes, with the
  reads feeding it (a fan's tach maths, a DFPlayer's BUSY pull-up). A test of
  what an emitter writes for an unwired output uses `deferPruning`.
- `foldConstants` (`cppSpecialize.ts`) removes what a value fixed at
  generation decides. A `bool` that nothing changes, or that is only ever
  stored the value it starts with, becomes its literal. A by-value integral or
  `bool` parameter that every call passes the same literal for is dropped and
  read as that literal, but only when that removes an `if`, `switch` or `case`,
  directly or in a sketch function it is passed on to. A literal that only
  feeds arithmetic, or a clamp ternary, stays an argument, so call sites keep
  their meaning. Then literal conditions, ternaries, `switch`es and
  `#define NAME <number>` comparisons fold, statements after a block-level
  `return`/`break` go, and an `if` with an empty body and a pure condition
  goes. `finishCpp` prunes first, then alternates folding and pruning until
  neither changes the sketch.
- Fold traps: a variable passed whole to a function whose parameter is a
  reference (`bool &full`) or unknown (a library or method call) may be
  written, so it is never folded. A `switch` arm that falls through, or one
  with named `case` labels, is never taken as its own body.
- `pruneCpp` (`src/codegen/cppReachability.ts`) removes file-scope units
  unreachable from `setup`, `loop` and library callbacks, together with the
  comment lines directly above them. Library configuration macros
  (`FASTLED_*`, `DECODE_*`, ...) are roots.
- Traps: the unit splitter has to see a function. Default arguments and
  `noexcept` once merged a function into its neighbour, so neither was pruned.
  A test that asserts an emitter's output for an unwired port now sees
  nothing. Wire the port to a reader, such as the LED output's `brightness` or
  `enabled`. A test of an unwired trigger now sees its branch gone: wire a
  live source (a Button Input or LFO) to test the branch, and assert its
  absence when unwired. `deferPruning` is for pattern extraction into shows,
  and for a test of raw emitter text such as an id a helper is called with.
- Gate: `deadCodeCorpus.test.ts` holds every live example and the player and
  show variants (`__tests__/deadCodeCorpus.ts`) at the pass's fixed point. The
  same corpus compiles with
  `python scripts/compile-fixtures/compile-matrix.py --only dead-code/`
  (about 250 sketches, arduino-cli, one at a time); every leg passed in
  October 2026.

## Instrument sketches

- Device telemetry (HW-11's bench instrument) is one line format defined once in
  `src/state/upload/deviceTelemetry.ts` — the `FLS_STAT` marker, the 2s interval, and
  every key — and read from both sides: `src/codegen/deviceTelemetryCpp.ts`
  emits it, `src/state/upload/deviceTelemetryStore.ts` parses it, so the format cannot
  drift the way a positional protocol would. Keys are short and named rather
  than positional, and an unknown or absent key is ignored rather than rejected,
  so a device built before a key existed still parses. The firmware side holds
  its state as plain statics and functions taking at most an `int` rather than a struct
  specifically to avoid the `.ino` forward-declaration hoist trap documented
  above (`displayForwardDeclarations.test.ts`); `boardSupportsTelemetry` gates
  emission to `esp32*`/`esp8266` families because `Serial.printf` with a float
  and the heap accessors are ESP-only and don't even link on AVR.
  `telemetryEmitFromSource` derives which draw buffers exist and whether touch
  is present by scanning the already-generated sketch text for `_cdPanelBuf_*`
  and `_xptPoint(` rather than being hand-passed per generator, and
  `withDeviceTelemetry` splices the calls into an assembled sketch string for
  template generators (the SD player) that hand back one string instead of a
  line array. On the app side, `deviceTelemetryStore.ts` is deliberately not its
  own serial client: it exposes `ingest(chunk)` and rides the Output console's
  one existing serial connection (`uploadStore.startSerial` feeds it) rather
  than opening a second port, because the helper holds the port exclusively and
  a second reader cannot have it. A touch latency of "nothing pressed this
  interval" is sent as an absent `touchms` key, not zero, and must not be
  averaged as if it were. The heap-drift figure
  (`telemetryHeapSlopeBytesPerHour`) is a least-squares fit over the whole run
  rather than first-vs-last, refusing to answer under 30 seconds / 3 samples so
  a noisy short window can't produce a confident wrong number; a device whose
  `uptime` goes backwards mid-run is treated as a reboot and starts a fresh run
  rather than folding into the old one. See
  [display budget bench](../testing/display-budget-bench.md), which holds the
  bench procedure and the per-key table; its acceptance-budget tables are
  deliberately empty until measured on real hardware.
- Touch calibration is generated and uploaded outside the normal build path on
  purpose. `src/codegen/sketches/touchCalibrationSketch.ts` is a fourth sketch generator
  beside `cppGenerator.ts` (normal), `playerSketchGenerator.ts` (SD player) and
  `showGenerator.ts` (pattern show), but it is not selected by
  `resolveBuildMode`/`sdShowConnected`/`isPatternShow` and never goes through
  deploy validation — it is built from one `TransportDisplay` node's own
  properties (no graph walk at all) and flashed directly through
  `useUploadStore.getState().runUpload(sketch, undefined, { cache: false })`.
  This has to bypass validation: `findDeployBlockingErrors` refuses any
  screen-only graph for having no LED output, so the panels most in need of
  calibration are exactly the ones a normal build would refuse to flash.
  `{ cache: false }` matters — without it, "upload last sketch" would reflash
  this instrument in place of the user's project. It reuses
  `tftDisplayHelpersCpp()`, `TFT_TOUCH_CPP_HELPERS`, `tftTouchIrqSetupCpp` and
  the `FONT_W`/`FONT_H`/`TFT_LETTER_SPACING` constants from the real display
  generators rather than restating them, and splits calibrated from raw on
  purpose: the *reported* reading (`FLS_STAT touchx/touchy`, sent every sample
  interval) always comes straight off `_xptPoint`'s raw digitiser output,
  untouched by any span, because calibrating against the value being measured
  would be self-confirming — but the corner *mark* drawn on the glass is mapped
  through the Touch node's own saved bounds (`calibrationSketchFor` in
  `touchCalibrationStore.ts` passes the node's properties into
  `touchCalibrationTargetFor`/`emittedTouchBounds`), so the dot shows what the
  current calibration makes of a press: the mirror of the finger before a good
  run, under it after one. `src/state/displays/touchCalibrationStore.ts` owns the whole
  run — upload, open serial, capture, release the port — not just the capture;
  `transportTouch.ts` still owns capture rules and deliberately never produces
  the wizard's `prepare` phase, since nothing can be captured before a board is
  running the measuring sketch. `useUploadStore.getState().startSerial()` is
  fire-and-forget by contract — it flips `serialConnected` synchronously but
  resolves only when the connection later closes (it awaits the read loop, not
  the open) — so `prepare()` calls it as `void startSerial()`; awaiting it there
  once hung the wizard on "Uploading…" for as long as the port stayed open, even
  though the flash had already succeeded. Bounds alone
  (`touchXMin`/`touchXMax`/`touchYMin`/`touchYMax`) cannot say which way a
  digitiser counts — the repo's CYD reads 3850 at the left and 290 at the right,
  so every press mapped to the mirror of where it happened while the calibration
  looked correct. Direction is a separate stored fact, not a descending range:
  `touchCalibrationFromSamples` derives `touchFlipX`/`touchFlipY` from the four
  corners the wizard already captures, and a flipped bound is never written as
  `xMin > xMax` because a minimum holding the larger value breaks the sliders
  that show it and the `xMin < xMax` check `validateGraph` still runs. Applying
  the flip — swapping the linear map's endpoints — happens in exactly one place,
  `orientedTouchSpan`/`emittedTouchBounds` in `transportTouch.ts`; the browser
  mapper and all three generators (`cppGenerator.ts`, `playerDisplays.ts`,
  `customDisplayPanelCpp.ts`) read it, so they cannot drift, and
  `reversedTouchAxis.test.ts` asserts all three emit the same descending span
  from one flipped calibration. The emitted shape is renamed
  `xFrom/xTo/yFrom/yTo` (not `xMin/xMax`) because after a flip the first is the
  larger; `_xptPoint` in `tftTouchCpp.ts` refuses only an *empty* span
  (`rawXTo == rawXFrom`), not a descending one, since both operands of its
  division change sign together. Axis *swap* (raw X onto screen Y) is
  deliberately not handled, only reversal.
- `FastLED.setExclusiveDriver<fl::Bus::B>()` does not move a legacy
  `addLeds<WS2812B, PIN>` output: FastLED 3.10.5's `ClocklessIdf5` and
  `ClocklessPARLIO` constructors pre-bind RMT or PARLIO (`setDriver`), and a
  pre-bound channel never consults the manager, so the call only links and
  registers B. The Board's LED driver therefore goes through `withLedDriver`
  (`src/codegen/output/ledDriverCpp.ts`), a text pass every generator runs last
  on its finished sketch: it adds B's `bus_traits.h` after the FastLED include,
  the exclusive call before the first `addLeds`, and rebuilds each recognised
  clockless `addLeds` line (named controller, offset form, RGBW tail) as a
  `TypedChannel<B, ClocklessChipset>` with `ChannelOptions::mBus = B`. A new
  `addLeds` shape in `fastledSetupCpp` must still match its `ADD_LEDS`
  pattern, or that output silently stays on the default driver
  (`ledDriverCpp.test.ts` holds the shapes). The classic ESP32's I2S driver is
  a define before the include instead, never a `Bus`.
