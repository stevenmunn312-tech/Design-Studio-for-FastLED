# Firmware generation

Traps in emitting C++ from TypeScript templates, and the instrument sketches
that are built outside the normal build path.

Moved out of the always-loaded `CLAUDE.md` so a session reads it only when
working in this area; record new patterns for this area here, not there. History
of the entries before the move: `git log -p -- CLAUDE.md`.

## C++ emission hazards

- The Arduino `.ino` preprocessor hoists a function prototype for every function
  to a point *above* all user type definitions, so a generated function that
  takes a display helper struct by reference fails to compile on a line no
  generator wrote. `src/codegen/infoDisplayCpp.ts` (`struct OledPanel`),
  `src/codegen/segmentDisplayCpp.ts` (`struct SegDisplay`),
  `src/codegen/patternSelectionCpp.ts` (`struct PatternSel`), and now
  `src/codegen/rtcCpp.ts` (`RTC_CPP_FORWARD` for `struct _RtcDateTime`, guarded
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
  derive-don't-list design holds as the struct count grows. Better still, don't
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
- A screen-only sketch (a panel plus a screen design, no LED output) is trimmed
  of FastLED entirely, not just left minimal: `cppGenerator.ts`'s
  `withoutUnusedFastLed(lines)`, applied at the generator's single
  `return withoutUnusedFastLed(lines).join('\n')` assembly point, drops the
  `FASTLED_INCLUDE` (`#include <FastLED.h>`) line and rewrites the
  `FASTLED_PACING` (`FastLED.delay(16)`) line to a plain `delay(16)` when no
  other emitted line matches a FastLED-ish spelling (`FastLED`, `CRGB`, `CHSV`,
  `CLEDController`, `CPixelView`, `fill_solid`/`fill_rainbow`/`fill_gradient*`,
  `nscale8*`, `blend8`, `beatsin*`, `inoise*`, `EVERY_N_*`, `qadd8`, `qsub8`,
  `scale8*`). The include is the expensive half to drop: arduino-cli compiles
  every source file in a library folder whether the sketch uses it or not. The
  check reads the *emitted lines themselves* rather than a registry of node
  types that imply FastLED, so a node added later that draws pixels keeps the
  include with nothing to update; the regex is deliberately biased toward
  keeping FastLED, since a false positive only costs a compile already paid for
  while a false negative breaks the build. Held at both ends by
  `src/codegen/__tests__/screenOnlyFastLed.test.ts`.

## Instrument sketches

- Device telemetry (HW-11's bench instrument) is one line format defined once in
  `src/state/deviceTelemetry.ts` — the `FLS_STAT` marker, the 2s interval, and
  every key — and read from both sides: `src/codegen/deviceTelemetryCpp.ts`
  emits it, `src/state/deviceTelemetryStore.ts` parses it, so the format cannot
  drift the way a positional protocol would. Keys are short and named rather
  than positional, and an unknown or absent key is ignored rather than rejected,
  so a device built before a key existed still parses. The firmware side holds
  its state as plain statics and parameterless functions rather than a struct
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
  purpose. `src/codegen/touchCalibrationSketch.ts` is a fourth sketch generator
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
  run, under it after one. `src/state/touchCalibrationStore.ts` owns the whole
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
