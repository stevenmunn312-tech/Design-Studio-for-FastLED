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

- [x] **Microphone**, **Button**, **Pot**, **Encoder** — appear in both views.
  All four are sourced in the hardware view and hidden from the sidebar, canvas
  picker and drag-to-create, so a part is attached to a known board with
  known-good pins by construction. `partPinAssignment.ts` generalises
  `nextFreeLedDataPin`: a part declares the pins it needs and the capability
  each role demands, and gets them all or none — an encoder that could only
  place two of three would look assigned and be unwirable. The microphone stays
  the exception, taking its I2S trio from the profile's `peripheralPins`,
  because an I2S peripheral is a fixed function of the pads rather than any
  three free GPIOs.

  Two correctness points the tests forced out. The profile's
  `safeGeneralPurpose` is an **allowlist**, not a preference — falling through
  to the FQBN table when it ran out handed back pins the profile deliberately
  excluded, which is the XIAO underside-pad bug the safety data exists to
  prevent. And a pin the board flags goes last rather than out: on an S3 analog
  covers GPIO1-20, but 11-20 are ADC2 and stop converting once Wi-Fi is up, so
  a potentiometer must prefer ADC1 while a board with only ADC2 left is still
  offered rather than refused.
- [x] **Amplifier**, **Board** — hardware view only, no graph node. Both are
  hidden graph nodes rather than absent ones: that is where their settings
  persist with the workspace and where `playerSketchGenerator` already scans
  for them, so nothing about codegen changed. Board was already in this shape;
  the Amplifier joins it, with its I2S pins taken from the profile's
  `peripheralPins.max98357` and its settings in the part menu, since a part
  with no node body has nowhere else to put them. Its MAX98357A render is still
  outstanding in [`hardware-renders.md`](hardware-renders.md), so it draws a
  labelled placeholder at the part's real footprint — the layout will not shift
  when the photo lands.
- [x] **SD Card** — hardware view only, and the gate is the part's existence.

  Both of its ports turned out to be decorative. `PerformanceGenerator`
  evaluates to `{ shows: null }` and `SDCard` to `{}`, and nothing reads the
  `shows` edge at all; the `sdcard` edge is read by exactly two booleans
  (`sdCardConnected`, `hasSdCardInput`) that decide whether "Upload show to SD"
  appears. Everything that builds the payload — `buildShowPayload`,
  `playerConfigFromGraph` — scans for the node by type and ignores wiring
  entirely. The chain on canvas is a picture of a pipeline, not the pipeline.

  Done. Both ports and both dataTypes are gone, along with the four live
  examples' edges, the picker bridge chains and the starter's wiring. The
  microSD module and the bare breakout are offered as a part dropdown, which is
  the safety-critical case the design note wanted it for: one has a regulator
  and level shifter, the other is destroyed by 5 V.

  One thing the removal broke and had to be given back: an SD show's LED output
  legitimately has *no* frame wired, because the generated player drives it
  from the card. The `sdcard` edge used to excuse that; the card's presence
  says the same thing now, and `validateGraph` asks it directly.

  Hidden-ness also moved into `normalizeLoadedGraph` via `isHardwareOnlyNodeType`,
  so a hardware-only part is hidden wherever it came from — a template, an older
  save, a share link — rather than relying on each creation path to remember.
- [x] **Part dropdown per component.** `partOptions.ts` holds which exact module
  each part can be; `PartIdentity` shows it wherever a part is configured,
  alongside the logic voltage, the header order left to right, and the asset's
  own caveats — all read from `part.json`, so it is the datasheet talking
  rather than the app remembering. The header order is the detail that earns
  its space: it is what you read off with a jumper in your hand.

  **A dropdown only where a choice exists.** The microphone lists one module,
  because the generator is hard-bound to it (`CreateInmp441`,
  `MicProfile::INMP441`) — what varies per board is the capture backend, not
  the microphone — so it states its name rather than offering alternatives it
  would treat identically. That would be the same quiet misrepresentation this
  model exists to remove.

  Corrected while doing it: `AmplifierBody` had offered PCM5102A and UDA1334A
  with no asset behind them, so selecting one would have shown a MAX98357A
  photo and its dimensions. They remain offered — the wiring genuinely is the
  same three I2S lines — but an unmodelled choice now says so instead of
  borrowing another part's picture.
- [x] **Part catalogue.** `scripts/import-part-assets.py` reads each modelled
  asset's `part.json`, converts its Cycles PNG to WebP under `public/parts/`,
  and emits `src/build/generated/partCatalogueData.ts` — the same
  generate-then-merge shape as the board importer. `src/state/partCatalogue.ts`
  is the typed reader: `partDimensionsMm`, `partRenderSrc`, `ringDiameterMm`.

  It exists because the app was guessing sizes the assets already knew from
  datasheets, and the hardware view's whole promise is true relative scale. Two
  of the three hand-declared footprints were wrong: the MAX98357A by nearly half
  its length, and every ring diameter, derived as `N x 10 mm / pi` — which gives
  25.5 mm for an 8-LED ring that measures 32.2 and 191 mm for a 60 that measures
  158. Rings are not linear in LED count because a small one needs a hub however
  few LEDs sit on it, so `ringDiameterMm` interpolates between the counts that
  were actually modelled rather than fitting a curve. The INMP441 was a third
  too large and is now read from its asset too.
- [x] **Module thumbnails** in the graph's preview slot; full renders in the
  hardware view. The four signal-carrying parts show their own module photo
  above their port rows, collapsible through the same `previewHidden` toggle
  every other preview uses. Capped in height with `object-fit: contain` rather
  than stretched, because the renders differ in aspect — a microphone is wide,
  an amplifier is tall — and a fixed box would letterbox one and crop another.

  `src/state/partRenders.ts` is the single map from node type to picture, read
  by both views. Two lists would eventually disagree about which photo is which
  part, which is exactly the confusion the photo is there to prevent. It still
  has two sources underneath: the microphone resolves through the generated
  catalogue, while button, potentiometer and encoder predate `Parts/` and stay
  bundled imports. Moving those three into `Parts/` with a `part.json` would
  collapse that — and would give them datasheet-checked dimensions, which they
  currently lack (their footprints are still derived from the render aspect).
- [x] **Retarget pins on board change**, touching only unedited pins.
  `pinRetarget.ts` moves every part in one pass; `graphStore.retargetHardwarePins`
  replaces the microphone-only action.

  The "touching only unedited pins" half turned out **not to exist**.
  `micPinsAreDefault` was written for exactly this and was never called, so a
  board change rewrote a microphone's I2S pins whether or not they had been
  wired by hand. Ownership is now *recorded* rather than guessed: when the app
  assigns a pin it stamps the value it chose in `assignedPins`, so a pin still
  holding that value is the app's to move and a pin holding anything else is
  the user's to keep. No heuristic, no coincidences, and it survives a save.
  Legacy nodes with no stamp fall back to `micPinsAreDefault`, which finally
  gives that function the job it was written for.

  Hand-wired pins are **remembered per board**, not merely ignored elsewhere.
  Leaving a board writes the user's choices into that board's memory; returning
  restores them. This is the point of the whole item: a project already built
  and enclosed uses the pins it is soldered to, not the pins most people use,
  and an ESP8266 LED run on a non-standard data pin had that pin reset to the
  default on every board change — dark LEDs, a pin edit, another flash, every
  single time. Following the suggested pins is right for a new build and wrong
  for one that already exists, and only the user knows which they have.

  Restored pins stay the *user's*, never re-stamped as the app's, so the
  memory survives any number of trips between boards. Each board keeps its own
  entry, so wiring the same part differently on two boards works.

  Two things the tests forced out. A part's own current pins must be excluded
  from its claim set, or it can never be handed back the pin it already holds
  and every board change shuffles parts that had no reason to move. And pins
  the user owns are claimed but never moved, so a retargeted part routes
  *around* their wiring instead of landing on top of it.
- [x] **Upload leaves the node; the bottom pane becomes Hardware | Upload.**
  Upload is not a property of one output — it never was. One board takes one
  sketch, and that sketch already drives every output: `cppGenerator` emits a
  `leds_<id>` array per route, an `addLeds` per route on its own
  `DATA_PIN_<id>`, and a single `FastLED.show()` once all of them are filled.
  So there is nothing to pick. **One board, one upload, all outputs.**

  Being embedded in a node said otherwise — it implied you were flashing *that*
  output — and the per-node button is what supplied `activeOutputNodeId` in the
  first place. Moving it to the bench is also just truthful about what it does.

  **Decided: tabs across the whole bottom pane**, not a side dock. Each tab
  gets full width, so the console is comfortable to read and the board render
  stays big — the two things that were cramped in a floating slide-over.

  What moves: the 114-line `MatrixOutputUpload` strip in the node body, and
  `OutputConsole`, which is already a two-tab (output / serial) slide-over and
  so folds in as a move rather than a rewrite. `MatrixOutputDeployPopup` is
  already global and store-driven, so its contents transplant. This supersedes
  CLAUDE.md's "driven from the MatrixOutput node — there is no separate modal"
  decision, which dates from when `MatrixOutput` was a singleton.

  **Done.** `MatrixOutputDeployPopup` gained an `inline` mode rather than being
  rewritten, so the tab is the same tested UI without its modal shell, and the
  dialog still opens when the pane is collapsed. All three points below were
  settled: the menu bar gained an Upload button that opens the pane on that
  tab; `activeOutputNodeId` kept its smaller per-output job; and the capacity
  meter moved to `CapacityWatcher`, headless and mounted at the app so a
  collapsed pane cannot stop the measurement.

  One thing nearly lost: the guided setup wizard had its *only* entry point on
  the removed node strip, so moving upload without noticing would have quietly
  deleted the wizard from the app. It now opens from the upload tab.

  Three things this had to get right:

  1. **The pane collapses to zero, deliberately** —
     `clampHardwarePaneRatio` allows 0 and the 1280x720 supported minimum
     depends on it. So a top-level button stays, and its job is "open the pane
     on the Upload tab". Upload must never become unreachable because the
     divider was dragged shut.
  2. **`activeOutputNodeId` still has a job, a smaller one.** Not for upload,
     which is whole-graph, but for the actions that genuinely are per-output:
     Flash Wiring Test and the HUB75 topology test bake one output's settings,
     and the last-sketch cache is keyed per project. Those need a named output;
     the Upload button does not.
  3. **The live capacity meter needs a host.** It runs continuously *while
     composing* only because `MatrixOutputUpload` is always mounted in the node
     body. A tab is not mounted while the other tab shows, so either the
     compile-check driver moves somewhere always-mounted, or the ambient "will
     it fit" signal is lost.

  Caveat that survives all of this: a **HUB75 panel must be the only output**
  (`isHub75` requires a single route, and `findHub75ConfigIssues` blocks the
  mixed case). "All outputs in one upload" is an addressable-output promise.

- [x] **The player receives its own show files.** SD upload was three build
  steps: a pre-flight compile of the player, a whole separate provisioner
  sketch flashed purely to write the card, then the player flashed over the
  top. The player now carries the same receive protocol, so it is one build and
  one flash, and the files go through the running board.

  The transfer was never the slow part — two compile-and-flash cycles were. A
  failed transfer is also cheap now: the receiver is already on the board, so a
  retry re-sends the files with no build at all.

  **Every read is bounded**, which the standalone provisioner's were not. It
  got away with spinning on `Serial.available()` because it never drove LEDs;
  the player calls `FastLED.show()`, whose interrupts-disabled window is
  exactly what desynced the Adalight stream receiver — permanently, with
  nothing visible to the host. Three timeouts: 50 ms on a control line, 3 s
  mid-block (deleting the partial file, since a truncated `.show` is worse than
  none), 30 s on a host that dies without sending `END`. The render loop is
  also held off entirely while transferring, so that interrupt window never
  opens mid-protocol.

  Track selection moved out of `setup()` into `startPlayback()` so a transfer
  can pick a track again afterwards — a board that arrived with an empty card
  would otherwise sit on "no playable track" until power-cycled. `BAUD` came
  across too (without it a song is ~11 minutes at 115200) and the link drops
  back to 115200 on `END`, or a hand-opened serial monitor sees garbage.

  `provisionerSketchGenerator.ts` is now unreferenced. It is kept, with a
  header saying so, only until the merged path is hardware-validated — then it
  and its tests should go, rather than leaving a second copy of the protocol to
  drift. `/api/upload-show` still accepts and ignores a `provisioner` field so
  an older frontend keeps working.

  **Not hardware-validated.** The whole SD-show path is blocked behind the
  MAX98357A fault below, so this rides along with that retest.


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
