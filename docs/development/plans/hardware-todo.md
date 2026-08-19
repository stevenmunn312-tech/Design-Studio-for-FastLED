# Hardware branch — todo

Work tracker for the `Hardware` branch (1.0.0, breaking). Design lives in
[`hardware-nodes.md`](../design/hardware-nodes.md) and
[`board-node-architecture.md`](../design/board-node-architecture.md); this file
is the running order and the state of each piece.

`main` is frozen — nothing here goes to the beta.

Sequenced so the two-view model is proven end to end on a small surface before
anything migrates onto it. Phase 1 is deliberately narrow: board plus LED
outputs only, but complete enough to answer whether the split works.

## Done

- [x] **Board node, non-breaking half.** Singleton node selecting a board
  *profile* rather than a chip target, capability model on
  `PhysicalBoardProfile`, twelve imported profiles with renders, pinout view
  behind the eye button, and `findExactBoardPinIssues` flagging pins the chosen
  board cannot reach. Shipped to the beta before the freeze.
- [x] **Amplifier split out of SD Card.** `i2sBclk`/`i2sLrc`/`i2sDout` moved to
  a portless `Amplifier` node with a `model` property. Breaking, no migration.

## Phase 1 — prove the two-view model

Board and LED outputs only. Enough to know whether the split works before
committing the rest of the hardware to it.

- [x] **Split canvas with a resizeable divider.** Graph above, hardware below,
  ratio persisted in `uiStore` and reset to halfway on an empty graph.
  `clampHardwarePaneRatio` allows 0, so it collapses to nothing.
- [x] **Hardware view: board + auto-radial layout.** `hardwareLayout.ts`, unit
  tested. Parts are placed and linked by the view; nothing is draggable.
- [x] **"Add hardware" action** in the hardware pane: INMP441 microphone,
  WS2812B LED strip, WS2812B LED matrix.
- [x] **Creating a part creates its graph node, already carrying pins from the
  board profile.** LED outputs take the board's `fastLedData` recommendation,
  then its named alternatives, then the general-purpose pool, skipping every
  pin the graph already claims. The microphone reads `peripheralPins.inmp441`
  from the profile, falling back to the per-FQBN table — an FQBN names a chip,
  so a XIAO and a DevKitC-1 look identical to it while only the profile knows
  which pads are broken out. Precedence on a board change is the user's saved
  pins for that board, then the profile, then the table: a board they wired
  differently is a fact about their bench, not a preference to correct.
  The build diagram needed no change — it maps each node's GPIO onto the exact
  board's pad, so improving the source improved the drawing.
- [x] **Remove LED output from the node library.** `Board`, `MicInput`,
  `LedStringOutput` and `MatrixOutput` are all hidden from the sidebar, canvas
  picker and drag-to-create. A matrix entry was added to the hardware pane first
  so hiding `MatrixOutput` did not leave matrices uncreatable.
- [x] **Deletion semantics.** Graph delete disconnects a hardware-managed node;
  the hardware view's right-click menu removes it. Covered by
  `CanvasContextMenu.test.tsx`.
- [x] **Empty state with no board chosen**, in both panes.

Decision gate: does the split earn its screen space? If the hardware pane feels
like overhead at this size, stop and reconsider before migrating anything else.

## Phase 2 — LED output forms

- [x] **`form` property** — strip / matrix / ring / HUB75 — replacing the
  overloaded `layout` + `chipset` combination. `src/state/ledOutputForm.ts` is
  the one place that answers what an output physically is; LED count,
  composition canvas, enabled editors and validation all follow from it.
  `LedStringOutput` folded back in as `form: 'strip'` — it had no `case` in the
  C++ generator at all, so a string-only graph compiled to a "not yet
  supported" comment, and being one form of the output node is what gives it
  firmware. `layout: 'strip'` is deliberately *not* read as the strip form:
  `xyLayout` always treated it identically to `'matrix'`, so it only ever meant
  "this grid is wired as one chain", and the multi-output codegen test caught
  the inference turning a saved 16x4 panel into a 60-LED run.
- [x] **Four entries** in the hardware pane's Add Hardware menu, each creating
  the node pre-set to a form with a size that suits it. (The design note said
  "sidebar"; Phase 1 hid every hardware node from the sidebar, so the hardware
  view is where they are now.) A HUB75 panel does not consume an LED data pin —
  it has its own ribbon — so it stays available when the board is out of GPIO.
- [x] **Ring form + XY mapping.** LED count, start angle, direction.
  `ringSampleMap` gives one composition pixel per LED, measured from 12 o'clock
  where a ring's data-in pad usually is. The preview routes through it and the
  sketch bakes it as PROGMEM, so both circles are the same circle. A ring claims
  the square its own circumference implies (`N = pi x D`) rather than a strip's
  1-pixel-tall footprint, because a circle cannot be sampled out of one row —
  and the map is built against the canvas that actually exists, not the one the
  ring asked for, or a ring beside a bigger matrix reads the wrong pixels.
- [x] **In-graph preview in the output's own shape.** A ring draws a ring, a
  string draws a run. The output node has no output port so it never qualified
  for the generic preview — the one node whose job is "here is what reaches the
  LEDs" showed nothing of them. It reuses the hardware view's component.
- [x] **Stage becomes the audience view** — lights only. The two idle seconds
  that already hid the cursor now take the header, telemetry, spectrum and
  transport with them; pointer movement brings them straight back, and the
  hidden chrome is `inert` so a faded Exit button cannot be tabbed to.
- [x] Decided the rename (open question 2): **label only**. The node type id
  stays `MatrixOutput` — invisible to users, and renaming it is ~740 references
  of churn with no user-facing gain. The label is per form, so the node titles
  itself LED String / LED Matrix / LED Ring / HUB75 Panel.

Not yet hardware-validated: the ring and HUB75 forms have no bench run behind
them, and the string form's firmware is new (it had none before).

## Phase 3 — migrate the remaining parts

Once the pattern is proven, everything physical moves to the hardware view.

- [ ] **Microphone** (replaces `MicInput`), **Button**, **Pot**, **Encoder** —
  appear in both views.
- [ ] **Amplifier**, **SD Card**, **Board** — hardware view only, no graph node.
- [ ] **Part dropdown per component** (INMP441, MAX98357A, …) driving pin roles,
  thumbnail and caveats.
- [ ] **Part catalogue.** Probably the same shape as `boardProfiles.ts` — id,
  label, pin roles, render, notes.
- [ ] **Module thumbnails** in the graph's preview slot; full renders in the
  hardware view. The Blender pipeline already produces board renders and the
  Build Diagram already draws INMP441 and 74AHCT125 graphics.
- [ ] **Retarget pins on board change**, touching only unedited pins.

## Phase 4 — the Audio capability

- [ ] **`Audio` node.** Source dropdown over the board's capabilities, honest
  empty state, defaults to the only attached source.
- [ ] **Analysis nodes consume it through ports** — `FFTAnalyzer`,
  `BeatDetect`, `PercussionDetect`, `AudioFeatures` stop reading
  `useAudioStore.getState()` ambiently.
- [ ] **Decoder tap.** The source that does not exist yet: the board plays a
  track and analyses its own PCM before the DAC. Unlocks generative shows
  running against real music with no microphone.
- [ ] **Line in.** Required rather than optional, because a self-contained
  player module cannot be decoder-tapped.

## Deferred

- [ ] **Storage capability node** (SD / onboard flash / USB). Open question 1;
  the show pipeline needs the distinction regardless.
- [ ] **Light sensor capability** (LDR / photoresistor, or a digital ambient
  sensor such as the BH1750). Hardware part plus its graph node, exposing a
  normalised 0–1 light level and a `dark` boolean with a settable threshold and
  some hysteresis so it does not chatter at dusk. The motivating case is an
  install that should only light up when it gets dark, which today needs an
  RTC schedule and therefore ignores the actual room. Pairs naturally with
  `ScheduleTrigger` (schedule AND dark) and with `BrightnessMod` for dimming
  to ambient rather than switching outright.

- [ ] **Per-output native rendering.** Two outputs of different shapes currently
  share one composition canvas and both come out distorted — a 60-LED strip
  beside a 16x16 matrix makes the canvas 60x16, and the matrix fits that whole
  width into 16 columns. Firmware does the same, so it is not a preview quirk.
  Decided: each output renders at its own dimensions, with `fit`/`crop` kept for
  genuine multi-panel compositions. Design and costs in
  [`per-output-native-render.md`](../design/per-output-native-render.md) — the
  firmware half is the substantial part, and preview and firmware must land
  together.

- [ ] **Two-board graphs.** The trigger that would bring attachment edges back.
- [ ] **Raspberry Pi backend.** Out of scope for 1.0.0, but the codegen backend
  is a field on the profile, so adding it is an entry rather than a refactor.

## Carried over from the bench

Not part of this branch's design, but unresolved and worth not losing.

- [ ] **No audio from the MAX98357A — most likely a faulty amp module.** Two
  days of elimination (2026-08-17/18) cleared everything reachable in software
  and wiring: pin mapping verified pad-to-pin (`BCLK`->27, `LRC`->26,
  `DIN`->25), ground 0.3 ohm, supply and enable voltages good, speaker proven by
  a clean tone, SD card and MP3 fine, chip marking `+AKK` (genuine A, and
  left-justified sounded worse). Static persisted across cores 2.0.17 and 3.3.9,
  legacy and new I2S drivers, three audio libraries, with and without FastLED in
  the binary, byte-swapped samples, half amplitude, and four sample rates.
  Signature: a square wave plays cleanly while anything varying does not, and the
  output barely depends on the sample values sent but changes completely with
  clock rate — a part driving its output stage without latching data reliably.
  A square hides this, which is why the bench tone always passed. **Nothing in
  Studio is implicated.** Retest with a replacement module before changing any
  generator code; confirm with the ESP32 internal DAC into a line input, or a
  cheap logic analyzer on BCLK/LRC/DIN.
- [ ] **`'Audio' does not name a type` is an include-order trap.** FastLED
  ships `src/platforms/audio.h`, which captures `#include <Audio.h>` on a
  case-insensitive filesystem once FastLED's `src` is on the include path.
  There is no missing-header error — the audio library just silently vanishes.
  `playerSketchGenerator.ts` emits `#include <FastLED.h>` first, so every
  arduino-cli build with FastLED 3.10.5+ hits this. Fix is to emit `Audio.h`
  before `FastLED.h`, with a comment saying why.
- [ ] **fbuild silently ignores a pinned platform version.**
  `platform = espressif32@6.9.0` in `platformio.ini` built against 3.3.9
  anyway, with no warning. Good upstream report alongside the deploy/port one.
- [ ] **fbuild deploy cannot open the port** while esptool from a shell opens
  the same port seconds later. Reproducible; engine currently switched to
  `arduino-cli`, which flashes reliably. Good upstream report.
- [ ] **The capacity meter measures the wrong sketch for SD shows.** It
  compile-checks the normal sketch, so it reports comfortable headroom for a
  design whose *player* will not link.
- [ ] **The show player ignores PSRAM.** `playerSketchGenerator` has no PSRAM
  path at all, so the SD-show ceiling is internal DRAM even on a board that has
  PSRAM. `buildPatternRenderers` already accepts `psramAllowed`.
