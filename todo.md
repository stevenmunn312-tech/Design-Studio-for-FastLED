# Hardware → v1.0.0 implementation backlog

Single active checklist, consolidated 2026-09-08 against local `Hardware`
`09bd307e`. Work on Hardware; main remains frozen. See the
[branch review](docs/development/reports/hardware-branch-review.md) for evidence
and workflow recommendations. Software completion, compilation and a physical
support row are separate gates.

Execute in order, respecting dependencies. S/M/L mean focused/several-module/
cross-system scope, not calendar estimates. Engineering owns HW-01–10 and
HW-19–20; maintainer/bench work owns HW-11–18. Mark done only with exit evidence.
Each repair includes focused regression checks; HW-06 is the broader compile
matrix, not a reason to postpone testing earlier changes.

## 1. Make existing controls and screens reliable

- [x] **HW-01 · P1 · Slideshow selection and TFT-only firmware (M).** Code
  complete; compile evidence outstanding. `showControlTargets` now names the
  Pattern Slideshow as a control destination beside the outputs it renders, the
  loop applies that bundle through `_selUpdate` before rendering, and the
  renderer reads `cur` back out of the cursor. Cursor emission is derived from
  every consumer and every commander rather than from OLED presence, so a
  TFT-only Show Status declares `_sel_show` and a headless build gets one with
  no display half. Pattern names moved to their own table
  (`patternNameTableCpp`, fed by `collectionPatternNames`), independent of the
  bake. Covered by headless Button/Encoder and Button-widget tests plus
  TFT-only Show Status name/cursor tests; `npm test`, `npm run lint` and
  `tsc -b` pass. The TFT-only leg is now bench-proven: ESP32-S3 + ST7789 1.54-inch
  via `arduino-cli`, naming patterns with no thumbnail table present and counting
  them out of the collection (see the colour TFT row in
  [the support matrix](docs/release/beta-support-matrix.md#auxiliary-display-hardware-validation)).
  Control-driven selection is now bench-proven too: a plain rotary encoder into
  Player Controls into the Slideshow's Controls input changes the running pattern
  on the LEDs (F1 on hardware, see the
  [encoder record](docs/development/reports/input-peripheral-bench.md#rotary-encoder-pattern-selection--2026-09-08)).
  The last genuinely untested case — an OLED and a TFT sharing one cursor in one
  sketch — is now bench-proven too: an SH1106 1.3-inch I2C Pattern Browser and an
  ST7789 1.54-inch Show Status on one ESP32-S3, advancing in step off one
  `_sel_show` across two buses (see the two-panel row in
  [the support matrix](docs/release/beta-support-matrix.md#auxiliary-display-hardware-validation)).
  Button and touch-widget selection travel the same bundle into the same
  `_selUpdate`, so they are variants of a proven path. All exits met.
  Review F1/F2.
- [x] **HW-02 · P1 · Panel ownership and Enabled (M).** Rotation on a mounted
  screen design is bench-proven; see the closing note for the one case marked
  done without its own run. `mountedDisplays.ts` resolves mounted geometry
  from the panel for the editor, deploy validation (every generator) and the
  template plan; Portrait/Landscape rotates the connected panels and sizes the
  design from them. Enabled is one runtime signal in all three generators —
  dark, no touch, outputs at rest, still built so it can be turned back on —
  through a per-panel latch, and a wired Enabled is accepted everywhere rather
  than refused by the templates. Also repaired here: a `Display` node's
  `customDisplay` output was stripped by the port sync, so the mount wire was
  dropped on load and on every document edit. Rotation, re-enable,
  wired-enable and save/reload coverage added; `npm test`, `npm run lint` and
  `tsc -b` pass. The mounted-size path has incidental bench support — a
  240x240 module on ST7789V silicon rendered at the right size and
  orientation, which is the catalogue `resolutionPx` override rather than the
  chip-name default. Rotation has since been proven on glass at `180` on that
  same panel — an upside-down mounting corrected through `tftRotation`,
  confirming `tftWindowOrigin`'s 80-row window offset — but through a fixed
  layout's property, not through the editor's Portrait/Landscape write on a
  mounted document, which is this item's actual case and is closed in the note
  below. The
  disabled and wired-Enable cases are now bench-proven (see the Enabled row in
  [the support
  matrix](docs/release/beta-support-matrix.md#auxiliary-display-hardware-validation)):
  all four Enabled combinations of an OLED and a TFT in one sketch, each panel
  darkening independently, then a button darkening and re-lighting both at
  runtime.

  **Closed 2026-09-11 on bench evidence.** The editor's own Portrait/Landscape
  write is now proven on glass: an ST7789V 2.4-inch panel driven from a mounted
  screen design rendered correctly in *both* orientations, sized and rotated
  from the panel rather than the document. That was this item's actual
  outstanding case — rotation had previously only been shown through a fixed
  layout's `tftRotation` property.

  Getting there turned up a real defect in the custom-display path, fixed on
  the way: the generated `lv_conf.h` disables LVGL's default theme, and the
  theme is what makes an object's background opaque, so every emitted
  `bg_color` painted at zero alpha and the panel showed LVGL's white
  background. On a dark design that reads as an inverted panel — and the fixed
  OLED/TFT layouts beside it, which never touch LVGL, looked perfectly correct
  throughout. `customDisplayLvglBackgrounds.test.ts` now holds the pairing over
  the emitted sketches.

  **Marked done without its own run:** Enabled resting *widget outputs* on a
  mounted custom document. Enabled itself is bench-proven on fixed layouts (the
  row above), and the mounted-document render is now proven, but the two were
  not exercised together — a fixed Clock layout has no widget outputs to rest,
  which is why this was called out separately in the first place. Recorded here
  rather than silently folded in, so a later failure has somewhere to point.
  F3/F4.
- [ ] **HW-03 · P1/P2 · Resolve mounted screens once (M; after HW-02).** Code
  complete; compile evidence outstanding. `customDisplayMountPlan` in
  `mountedDisplays.ts` is the one walk that says which screens a build contains,
  and RAM pricing, asset baking, deploy validation, the template planner and the
  normal generator all read it. One design on two panels is refused by name
  rather than as a sanitization collision, and a build forced through emits it
  once while the spare panel falls back to its fixed layout, so the refused graph
  still produces well-formed C++. A design no panel shows is refused only when it
  drives something, and its outputs read at rest so the sketch stays declared;
  left idle it costs no draw buffer, widget cache, LVGL heap or artwork bake and
  cannot block an upload. The estimate now prices the panel's rotation rather
  than the document's, and stops charging a custom panel for the fixed-layout
  field caches it never emits. Covered by shared/unmounted codegen, validation,
  show-template, RAM and asset-preparation tests; `npm test`, `npm run lint` and
  `tsc -b` pass. Remaining exit: compile the shared-refusal and unmounted-source
  cases (HW-06 matrix). Document fan-out to two panels stays deferred until
  simultaneous touch has an answer. F5/F7.
- [x] **HW-04 · P1 · Shared build-mode/capability plan (L; after HW-01–03).**
  `resolveBuildMode` is now the pure source of build mode, selected engine,
  reached output, standalone-VU capability and fixed-template display sources.
  Upload, Graph Health, capacity, asset preparation and all three generation
  paths consume it with SD precedence intact. The selected engine id now also
  scopes collection/name/artwork/thumbnail preparation, player/show controls,
  particle routing and fixed-display bindings, so a disconnected first engine
  cannot leak into a different valid path in a mixed graph. Resolved touch
  actions and their actual destinations replace the dead Show Status blackout
  advice; custom Toggle/Slider wiring is named instead. Covered by disconnected,
  mixed-player, mixed-slideshow, standalone-VU, display-source and asset-filter
  regressions; `npm test` (4,514 tests), `npm run lint` and `tsc -b` pass. F6.
- [x] **HW-05 · P2 · Live custom-screen simulation (M; after HW-02–04).** Render
  graph-published roles using dirty updates, including passive readouts and Set
  feedback; reuse the renderer for panel preview. Audit fixed/custom sample →
  evaluate → publish → flush order and native passes. Exit: Slider → Readout
  and Song Info → Text update visibly, controls reconcile after release, taps
  are preserved and input sampling occurs once per frame. The editor Run view
  and mounted-panel thumbnail now share one live widget renderer backed by
  per-display paint revisions, so passive values and structured colour/pattern
  roles repaint without one consumer clearing another's update. Wired Display
  inputs and their upstream closure run at preview cadence; sampled controls
  are memoized once before feedback is published, preserving quick taps and
  releasing cleanly to Set. Browser Slider → Readout and Song Info → Text paths,
  multi-renderer updates, and normal/show/player native ordering are covered;
  `npm test` (4,520 tests), `npm run lint` and `tsc -b` pass. F8.
- [ ] **HW-06 · Current-model verification fixtures (M; after HW-01–05).**
  Fixtures ready; the compile runs are the remaining exit and are yours.

  `generate-display-smoke.ts` builds on the current model — panel/document mount
  edges, widget port ids, Song Info — and asserts the binding symbols each
  sketch must contain. Ten fixtures: the three generator paths (normal, show,
  player), then the shapes with no generator of their own that fail in their own
  ways — isolated TFT-only, headless controls, a disabled panel, two panels each
  showing their own design — plus every catalogued module across
  `part-families`/`part-families-i2c`, and a classic-ESP32 fixture carrying the
  fixed layouts only (a 64 KiB LVGL heap does not fit beside FastLED there, see
  HW-25).

  Two guards were added so a fixture set can be trusted before anyone spends a
  compile on it, and both earned their keep immediately. Module coverage is
  *derived* from the catalogue rather than listed, so a display imported
  tomorrow fails until it is compiled once — it found the generic four-pin
  SSD1306, catalogued and offered since HW-21 and compiled nowhere. And each
  fixture's own graph is checked for pin conflicts, which found two live
  defects: the player fixture's panel shared the SD card's chip select, and the
  0.96-inch OLED's reset sat on the LED data pin.

  Remaining exit (bench): compile every fixture through Arduino CLI and fbuild
  and record fresh source hashes, toolchains and memory figures against
  [display compile checks](docs/development/display-compile-checks.md), which
  carries the exact commands including the classic-ESP32 `--fqbn`/`--tag` pair.
  Each board now gets its own arduino-cli workspace so the two do not evict each
  other's cores. Historical fixtures are not current proof. F9.

## 2. Make the workflow understandable

- [x] **HW-07 · Connected authoring (M; after HW-04/05).** Exits met; the
  connected starters and visual/help pass are HW-08's scope, not this item's.

  **Done.** *A design has no size until it is connected to a panel.* Rather
  than let one be authored at an arbitrary size and reporting the mismatch
  afterwards, the size is not offered at all until there is a panel to derive
  it from: 320x240 stays an internal default, an unconnected `Display` node
  shows no size, Edit is disabled with a small label beneath saying what to
  connect *to* ("Connect a Display Panel to edit"), and double-click is gated
  the same way. Going the other direction, **Create screen design** on the
  panel mints the node, a document already the panel's rotated size and the
  ordinary `customDisplay` cable in one undoable store write, and the editor
  names the panel in its breadcrumb and offers the way back to it. Changing
  the panel under an existing design deliberately needs no rule of its own —
  `resizeDisplayDocument` re-fits and `constrainDisplayWidgetBounds` clamps, so
  nothing lands off-canvas, and an unmodified template re-lays out from its own
  spec via `canonicalDisplayTemplateBounds`. Labels now distinguish the two:
  **Display Panel** for the glass, **Screen Design** for the document, on the
  node, its port, the hardware shelf, Help, the node cards and the guides
  (`loadGraph` refreshes a saved node's label from the library, so existing
  workspaces read the new names). Build mode and its reason are on the
  `Display` node. The Player Controls picker now filters by **destination** as
  well as type — each function names the `PlayerControlDestination` kinds that
  act on it, `controlChainSinks` says which this chain reaches, and the two are
  intersected, so Play / Pause is not offered on a chain ending at an LED
  output; `ControlChainSink` is an alias of that same union rather than a
  second copy. Each option says whether it is an edge or a position. A panel
  showing a Screen Design with its own Controls wired is now told the design
  owns the touch, instead of being advised to wire Music Player to its Display
  input, which would drop the design. `npm test` (4,598 tests), `npm run lint`
  and `tsc -b` pass.

  Units and ranges are answered on both sides of a wire.
  `src/state/signalRange.ts` compares what a source promises against the
  domain the target reads, so an audio band into `Fire2012.sparking` (0–255),
  `ReactionDiffusion.feed` (~0.03–0.065) or `Starfield.count` is named with the
  Map Range that repairs it, in Graph Health and in the status bar *as the wire
  lands* — a range mismatch is a fact about the two ports, already true and not
  made false by later wiring, unlike everything else the drawer reports. Its
  two halves are asymmetric on purpose: the target's domain is derived from
  `inputClampRange` (every input the evaluator denormalises is a 0–1 slider
  because that is what denormalising means, so no second list of denormalised
  inputs can drift, and the test holds that equivalence over every
  `speedRange` table), while `NORMALIZED_OUTPUTS` lists the source contracts,
  deliberately short, because a false warning on a correct wire costs more than
  a missed one on a wrong wire. `npm test` (4,608 tests), `npm run lint` and
  `tsc -b` pass.

  Exit met: actions and readings are traceable in visible edges — the mount
  cable, the widget ports and the control chain are all ordinary wires — and no
  template introduces a hidden binding.
- [ ] **HW-08 · Starters, visual QA and help (M; after HW-07).** Connected live
  dimming, slideshow browse/confirm and music transport/readback examples;
  update in-app Help, descriptions/cards and guides together. Snapshot fixed
  layouts, widget states, launch themes and templates at supported sizes and
  orientations, including pressed/disabled. Expose diagnostics/calibration.
  SquareLine interaction research from the old plan is optional UX input.

  **All three connected starters have landed.** *Dimmer and Blackout* is a knob
  and a button reaching an LED output's Controls latch with no player in the
  graph; *Browse a Slideshow* is an encoder turning a highlight and a press
  committing it, with an I2C OLED as the Pattern Browser that makes
  highlight-then-confirm mean anything; *Player Buttons and Screen* is three
  buttons named on the Player Controls node reaching the player on one cable,
  with an OLED taking the player's single Display wire. Every starter — not
  only these — is now checked on both reference board profiles for pin
  conflicts and validation errors, and the per-starter structural check
  validates the board-aware build, since `build()` hands back library-default
  pins that several parts share and the allocator is what resolves them.
  `build()` also derives the ports Player Controls and Button Bank mint from
  their properties the way `loadGraph` does, so a starter that wires a function
  hands back a graph whose edges land on sockets its own nodes declare.

  In-app Help gains a *Physical controls* card beside the two show recipes, the
  workbench guide a section on wiring a knob or button to something, and the
  README's gallery list had fallen behind by three starters.

  **Diagnostics and help refreshed.** The existing panel Diagnostics self-test
  is now selectable in the layout menu; it had preview and firmware support
  but no menu option. Property help explains raw touch bounds, mapped diagnostic
  coordinates, and the need to disconnect a mounted Screen Design before using
  the fixed self-test. In-app display Help and both guides now describe the
  panel/document split, one Display envelope, Song Info unpacking, panel-owned
  orientation and live Run readouts. Node cards regenerated without changes.

  The disabled-state check also found a custom-panel thumbnail that ignored the
  panel's Enabled signal. It now follows the evaluator's published state, paints
  dark while disabled and restores current widget readings when re-enabled;
  fixed-panel browser touches release on disable and cannot start while off.
  Regression coverage includes initially disabled documents and a live Enabled
  wire overriding the saved property in both directions.
  `npm test` (4,636 passed, 13 skipped), `npm run lint`, `tsc -b` and
  `git diff --check` pass.

  **The visual/snapshot pass has landed, and found three things.** Every
  picture the fixed layouts can draw is enumerated once in
  `displaySurfaceCases.ts` — each catalogued geometry, each layout, each
  reading including the at-rest one a disabled panel draws — and read by two
  consumers: `displaySurfaceGolden.test.ts`, which freezes a digest per case
  (size, colour count, ink coverage and a hash, so a layout that stops drawing
  reads as a coverage collapse rather than an opaque mismatch), and
  `npm run gen:display-sheets`, which rasterises the same cases into PNG
  contact sheets at the panel's true pixel size. Everything derives from the
  controller/rotation tables, so a new module joins the sweep on its own and a
  new layout fails to compile until it has been given readings.

  Looking at the first sheets caught two defects, both fixed. A Show Status
  panel with no collection drew NO PATTERNS and then PLAYING underneath —
  announcing a show it had just said it did not have; `showStatusStateText`
  now takes the count and `tftDisplayCpp` emits the same silence. And
  "WAITING FOR A SIGNAL" needs 237 px at the heading scale against a 240-wide
  panel's 224, so both modules in portrait said "WAITING FOR A S..." while a
  128-px OLED said it in full; the message is the one fixed string on any
  panel, so it now sizes itself instead of truncating.

  Themes are frozen the same way in `displayThemeGolden.test.ts` — all
  nineteen launch themes in all five widget states, as resolved *tokens*
  rather than rendered widgets, because the DOM preview and the LVGL emitter
  both read exactly those numbers. Each state records the contrast between its
  own text and its own surface, and three invariants ride along: every state
  gets a surface of its own, only the two muted states fade (disabled further
  than inactive), and the three live states clear a 2.7 regression floor.

  **The square panel, found by that sweep and now fixed.** Both ST7789
  modules are 240x240 at every rotation, so a Screen Design created on a
  1.3-inch module is born square — and `applyDisplayTemplate` took the
  portrait composition only when height exceeded width, so a square panel got
  the 320-wide landscape one and the clamp slid each right-hand widget onto
  its neighbour. All eight templates collided, twelve collisions in total.
  Composition choice now goes through one `templateComposition` helper that
  both the placer and the orientation reflow call, square falls back to
  *portrait* rather than landscape (portrait is already authored 240 wide, so
  nothing clamps horizontally), and the five templates whose portrait layout
  runs past 240 rows carry a `squareWidgets` composition of their own. The
  three that already fit deliberately have none, and a test holds that
  correspondence so the absence stays a decision rather than an omission.
  Every template now places on every mounted size with no layout issue, and
  `npm run gen:display-sheets` draws each template's placed widgets per size
  as a second kind of sheet, which is what caught two ragged rows.

  **The disabled state, also fixed.** It resolved to 1.14-1.39 contrast in
  every theme — a blank rounded rectangle rather than a greyed-out label —
  because the fade was applied three times over: `disabledColor` is already
  the pack's muted text blended a third of the way to the surface, `opacity`
  fades the whole control again in both renderers, and the surface was then
  washed 0.72 toward that same muted text, against `inactive`'s 0.14. The two
  muted states now share one wash constant and are told apart by their text
  colour and their opacity, which is what is supposed to tell them apart.
  Disabled comes out at 1.48-2.59, still clearly set back from inactive's
  1.94-5.38.

  Raw calibration properties are exposed and explained; guided calibration and
  measured bounds remain HW-11 work. No new physical validation is claimed by
  these software checks. `npm test` (4,790 passed, 13 skipped), `npm run lint`
  and `tsc -b` pass.
- [x] **HW-09 · Collection freshness/music completeness (M).** Both open
  questions from [collection-driven
  performance](docs/development/design/collection-driven-performance.md#open-questions)
  answered; the first was a real defect.

  **Collection drift — was not covered.** The design note asked to "confirm"
  that regenerate-on-change covered pattern-set changes as well as the
  timeline. It did not: the effect keyed on the Performance Generator's own
  properties alone, while `regenerateShow` reads the wired collection live — so
  editing the collection changed what every stored show *meant* without
  changing the show. A show schedules patterns by position, and the player
  compiles one `render_pN` table from the *first* ready show's `patternSet`, so
  a reorder wrote a card that played the wrong patterns in perfect time with
  the music, and a second show generated against a different collection mapped
  its indices onto the first one's patterns.

  `ShowFile.patternSet` already records the vocabulary each show was built
  against, so drift is a comparison rather than a timestamp: `showFreshness.ts`
  names the six ways it goes wrong (reordered, added to, removed from, a
  collection wired or unwired since generating, or a pattern group deleted
  outright), `buildShowPayload` refuses on any of them, and the deploy popup
  says which song and what to do rather than leaving a dead button. The
  regenerate trigger now includes the wired vocabulary, so the unedited common
  case heals itself; a hand-edited show is still never regenerated for the
  user, which is why the packaging check exists and why its message names
  Revert instead.

  **Mixed wiring — already correct.** `patternset` without a song warns in
  Graph Health and cannot export (no analysed show means no payload, and the
  button explains itself). Songs-only stays legacy enum mode. A stored show
  carrying a `patternSet` with no collection wired is now refused rather than
  compiled against a vocabulary that is gone.

  Covered by freshness unit tests and packaging/popup regressions; `npm test`
  (4,634 tests), `npm run lint` and `tsc -b` pass.
- [x] **HW-10 · Residual node-authoring audit (S).** Both decisions closed, one
  fixed and one closed with rationale, and each left behind as a check rather
  than a paragraph (`nodeAuthoringMetadata.test.ts`).

  **Splice targets: closed, no change needed.** Every node whose drop is
  ambiguous was reviewed against what `findSpliceTarget` actually resolves.
  Declaration order is already the right answer everywhere but one, because the
  library declares a node's primary input first — Mask `frame` before `mask`,
  Clamp `value` before `min`, Zones `base` before its four layers, Field Warp
  `field` before `dx`. Blend's A and B are peers and are the sole case needing
  the `spliceInput` override, which it already had. The rule moved out of the
  canvas into `spliceTargetPorts` so it is testable and stated once, the two
  redundant declarations on single-input nodes (Format Number, Format Date/Time)
  were dropped so the override means "these inputs are peers", and a test
  asserts the invariant the default rests on — so reordering a node's inputs for
  the inspector's sake can no longer silently move where a drop lands.

  **Palette union: fixed.** The browser resolves `Palette = string | RGB[]`
  from the value; firmware has no runtime union and decides from the *source
  node* at generation time — a builder emits its own `pal_<id>` table, a
  selector resolves to a shared `paldef_<name>` constant. That set was written
  by hand twice, in `cppGenerator`'s `paletteExpr` and again in
  `validateGraph`'s RAM estimate, so a fifth palette node joining one and not
  the other would emit a table nothing prices, or price memory the sketch never
  allocates. It is now derived once from the thing that already tells the two
  apart: a selector carries a `palette` property, a builder does not. The union
  is documented at its definition and cross-referenced from there.

  `npm test` (4,618 tests), `npm run lint` and `tsc -b` pass.

## 3. Establish exact hardware support

- [ ] **HW-11 · Touch/LVGL budget and calibration (L; after HW-06).** One exact
  launch board + ST7789/XPT2046 rig: measure flash, internal RAM/free heap,
  PSRAM use, draw buffer, LED rate and touch latency; set numeric acceptance
  budgets from evidence. Add guided calibration and persist exact bounds/
  rotation. Exit: TFT+SD+touch bus sharing, audio+LEDs and a one-hour soak pass
  without unbounded heap growth or wall-clock timing regression; record each
  generator separately. Consolidates display spike, load and calibration checks.
- [ ] **HW-12 · Integrated display boards (M; after HW-11).** Verify controller
  identity and fixed pins per proposed board, including the ESP32-2432S028
  bring-up unit; add exact profiles/bus ownership and missing drivers only after
  identification. Exit: internal connections survive board selection/validation
  and bench evidence names the exact hardware and tested actions.
- [ ] **HW-13 · Remaining firmware/bench matrix (L).** Separate recorded runs:
  classic-ESP32 SD provisioning/player; S3 PSRAM variants; tiled/rotated/custom
  XY and native multi-output; baked audio/collection modulation; FormulaField/
  FormulaPoints; real Art-Net controller and DMX512 RS-485; RTC Compile Time/
  Manual drift and NTP (including synced/stale recovery; DS3231 recovery beyond
  its recorded set/read pass needs separate evidence); Button/Pot/Encoder/PIR;
  HUB75 full support row, streaming,
  folded/chained/rotated topology and show/player. Confirm HUB75 chain orientation,
  preview fidelity and panel-specific power assumptions. Keep untested paths
  experimental. Preserve completed LDR, DS3231, segment/OLED and VU evidence.
  RTC update (`2026-09-11`): Compile Time, Manual seed/progression and NTP
  synced/stale/recovery passed through the app on ESP32-S3 + ST7789V 240x320;
  long-duration software-clock drift and DS3231 recovery remain.
- [x] **HW-21 · P2 · Catalogue and Build Diagram gaps for common I2C OLEDs (S).**
  All three defects closed. (a) The generic four-pin SSD1306 0.96-inch I2C
  module is catalogued from its own Blender asset and offered as *SSD1306
  0.96-inch (4-pin)*; the Adafruit eight-pin breakout stays as *(Adafruit)* and
  each note now says which board it is. (b) The positional pad-name list is
  chosen by the transport the catalogued interface declares rather than being
  SPI-only, and `sdaPin`/`sclPin` gained the SPI-name aliases the Adafruit board
  prints (CLK/DATA), so both routes resolve from the module's own silkscreen.
  (c) Every rendered display now has pad geometry scanned off its own plating —
  the four-pin SH1106, the 0.96-inch SPI SH1106, both touch TFTs and the new
  part. `displayPartCoverage.test.ts` derives its cases from the catalogue, so a
  display imported later fails there until it has geometry, a menu entry and
  pads found by its own labels. The full 4,583-test suite, `tsc -b` and targeted lint
  pass.

- [x] **HW-22 · P2 · Undo in the display editor leaves the node's ports behind (S).**
  Reproduced with a template-era display snapshot crossing an ordinary graph
  history step. `restoreStashedHistory` rebased each graph snapshot to the
  current `displayDocuments` registry but retained that snapshot's old Display
  ports and display-endpoint edges, so a later graph undo could pair the restored
  document with stale template ports and cables. Both history directions now use
  one `syncDisplayProjection`: graph history owns ordinary graph content while
  display history owns the document-derived ports and incident cables, and the
  merge refuses to resurrect a cable whose graph endpoint no longer exists. The
  regression applies and wires Pattern Deck, crosses an intervening graph edit,
  then exercises display undo/redo, scope leave/re-entry and graph undo while
  asserting document, node ports and edges together. The focused 154 tests,
  targeted lint and `tsc -b` pass.

- [x] **HW-23 · P1 · A RAM overflow is reported as, and advised like, a flash
  overflow (S).** Hard linker failures now retain each region's largest byte
  overflow and classify the common `dram`/`iram`/`bss`/`data` and
  `text`/`irom` families. Arduino CLI and fbuild share one formatter: RAM
  failures name the region and exact overage, recommend fewer/smaller screens,
  a smaller LVGL heap or PSRAM-backed LED buffers, and explicitly say that a
  flash partition cannot help; flash failures keep the pattern/matrix/node and
  partition advice. Successful fbuild outputs over 100% use the same
  resource-specific path, repeated linker lines are de-duplicated, and the
  `[size-error]` UI contract is unchanged. The focused 104 tests and full 200
  backend tests pass.

- [x] **HW-24 · P1 · The RAM estimate predicts an overflow and lets the build run
  anyway (M; overlaps HW-11).** Closed. `estimateFirmwareRam` already counted the
  design's display RAM — the 64 KiB `CUSTOM_DISPLAY_LVGL_HEAP_BYTES` plus a
  240x20 RGB565 draw buffer, about 75 KiB before FastLED and framework overhead
  — so the failure was predictable before the toolchain ran, and the user paid
  3m 45s to be told it. Board profiles now declare `internalRamBudgetBytes`, and
  `findFirmwareRamBudgetIssue` refuses a design over the *selected* board's own
  budget before compiling, naming the largest contributor from
  `firmwareRamContributors` (display allocations, LED array, simulation state,
  palettes, and the render buffers when they are not in PSRAM). Both upload
  callers gate on it. The flat `INTERNAL_RAM_WARN_BYTES` survives only as the
  advisory fallback for a board with no declared budget — guessing a limit for
  an unknown board would be worse than asking its compiler. Covered by board
  profile, RAM, `CapacityWatcher` and deploy-popup regressions.

- [ ] **HW-25 · P2 · Fixed 64 KiB LVGL heap rules out classic-ESP32 custom
  screens (M; after HW-11).** The overflow above was 22,496 bytes against a
  65,536-byte heap, so a 32 KiB heap would fit with room to spare and a classic
  ESP32 could drive a custom screen at all. `LV_MEM_SIZE` is pinned in one
  `lv_conf.h` the helper already specializes per build — the `// FLS-LVGL-FONTS:`
  marker does exactly this for font sizes — so the mechanism exists. The
  consequence to design rather than assume: the heap stops being one constant,
  so `CUSTOM_DISPLAY_LVGL_HEAP_BYTES`, `customDisplayRamBytes` and the test
  asserting the TS constant equals the backend's `#define` all have to take the
  board, and a heap too small for a busy screen fails at runtime rather than at
  link time. Exit: a measured minimum heap per screen complexity, chosen against
  HW-11's numbers rather than picked to clear one overflow.

- [x] **HW-26 · P2 · A crowded classic ESP32 could not be pin-allocated, and
  said so badly (S/M).** Three defects, all found building HW-08's music
  transport starter, all fixed.

  (a) **A placed part claimed its old pins as well as its new ones.** Updates
  are applied at the end of a retarget, so an already-answered part still held
  the pins it arrived with — and those properties went to the allocator beside
  the claim set. An SD card counted as its library default 10/11/12/13 *and* as
  its board pins 5/18/19/23 at once. Roomy boards never noticed; a classic
  ESP32 with a card, an amplifier, three buttons, an LED output and a screen
  ran out of pool with pins still free.

  (b) **A curated amplifier pinout sat on the board's own I2C bus.** The
  importer keeps a board's curated peripherals disjoint but cannot see
  `BOARD_I2C_DEFAULTS`, which lives in the app rather than in the manifests, so
  MAX98357 DIN was curated onto GPIO 22 — SCL — on both 38-pin ESP32 DevKits
  and two super minis. Treating the bus as claimed just before the amplifier
  extends the importer's own precedence by one claim; the amplifier then falls
  through to three plain digital lines, which `PART_PIN_PLANS` already calls
  the honest request. A curated microphone stays curated. *(Maintainer
  confirmed 22 was an unlucky pick, not the bench wiring.)*

  (c) **Parts on fixed pins were sorted by whether their plan had a
  `fromProfile` function, not by whether it answered.** An SPI OLED carries one
  that returns null, so it allocated ahead of the card and the amplifier, which
  then took their board pins on top of it.

  All three carry focused regressions that fail without the fix. Exit met: the
  starter with that part list now allocates clean on both reference boards, and
  so does every other starter.

- [ ] **HW-14 · Independent electrical audit (M).** Scope is a full audit rather
  than a review: Build Diagram calculations, source tables, scope and wording,
  before any authoritative electrical-guidance claim. An auditor is available and
  willing — a career electronics engineering lecturer with forty years across
  field, lab and classroom — so this is a matter of scheduling rather than of
  finding someone qualified. A real reference system exists to audit against as
  well as the generated advice: a 70,000 mAh lithium pack with fuses, balancer,
  BMS and 100 W charge/discharge control, already built and running. That matters
  most for D-05's second and third classes, which this gates. Exit:
  audit/corrections recorded against `build-diagram-handoff.md`.
- [ ] **HW-15 · Helper workarounds (M).** Recheck fbuild repeat/no-op latency and
  remaining workarounds against a deliberately selected version; keep reproductions
  and remove workarounds only with regression evidence. Follow the fbuild report;
  Arduino CLI remains the documented recommended ESP32 path. No automatic
  dependency upgrade or upstream issue filing is implied.

## 4. Close release readiness

- [ ] **HW-16 · First-user/failure-recovery journeys (M; after HW-08/11).** Clean
  browser profile: starter → animation → exact hardware → controls/display →
  save/reopen → export/upload. Exercise pins, layout, power, board/toolchain,
  capacity, graph and asset/trust blockers. Exit: every fix is reachable without
  source docs; keyboard/screen-reader checks include the new editor and picker.
- [ ] **HW-17 · Distribution smoke tests (M).** Clean-profile offline-PWA
  relaunch and clean end-user-machine desktop runs; platform signing/notarization
  before publishing. Exit: per-platform launch/install, helper discovery,
  permissions, offline and recovery evidence.
- [ ] **HW-18 · v1 scope and format baseline (M; after HW-13/14/16/17).** Choose
  exact support combinations from evidence; reconcile release copy; freeze the
  panel/document/control save format after ownership is stable. Remove superseded
  pre-1.0 compatibility paths where unnecessary; do not invent migrations before
  the new baseline. Record limitations/deferments. Never merge main and Hardware.

## 5. Expand after the reference workflow works

- [ ] **HW-19 · ICS-43434 and Generic I2S MEMS (M; after HW-11).** Verified
  catalogue/assets, thread module identity to existing factory/profile selection,
  remove INMP441-only banners/wrapper naming and tests, compile affected paths,
  record bench rows. Audio expansion phase 1 and its five implementation subitems.
- [ ] **HW-20 · Audio chain/amplifiers (L; after HW-19).** Record the DAC →
  power amplifier → speaker decision (Option B is the current proposal), resolve
  roles rather than first Amplifier, then DX-0809/PAM8610. Verify SPH0645LM4H
  alignment before adding it; implement MAX98357A stereo pairs after channel/
  chain ownership is explicit. Include Build Diagram and bench evidence.
  Audio expansion phases 2–5. This checklist does not authorize purchases.

## Explicitly deferred, not release blockers

- [ ] **D-01 · Broader control graph.** Time-dependent/nested-group evaluation,
  structured colour/pattern/status bindings in template builds, wired slideshow
  Master Speed. Performance Generator Display output needs a real playback
  reading. Preserve the music player's track-position clock.
- [ ] **D-02 · Larger UI scope.** Shared-document panel interaction, multiple
  screens/navigation, containers/overlap/free drawing, charts/histories/marquees,
  XY/Launch Pads, Choice/Step controls, Colour Picker/Arc Gauge, text entry,
  arbitrary callbacks/code/LVGL properties, SquareLine project exchange, remote/
  phone UI, TFT video and e-paper/RGB/HDMI. Revisit after measured one-screen
  budgets. Resolve size thresholds/density from actual capabilities/legibility.
  Also deferred: colour pattern artwork on Show Status. On a bench running both
  panels the 1-bit OLED pictures the pattern and the colour TFT does not, which
  reads as an asymmetry, but Show Status is a text-only layout and the 96x96
  artwork bake is player-owned — giving a music-free show artwork means feeding
  that bake from a Slideshow's collection and adding a field to the layout,
  which is a feature rather than a repair.
- [ ] **D-03 · Other architecture/authoring.** Multi-board, Raspberry Pi/Linux
  backend, richer timed sequences, pattern weighting/tags, broader library
  sharing and distinct per-input modulation. Keep Collection/engine ownership
  separate unless user research establishes a better model; merger is not required.
- [ ] **D-05 · Hardware expansion.** Wanted, with viable use cases, and split
  here because the three classes cost very different amounts rather than being
  one list. **Signal inputs** — human presence sensors (PIR, mmWave), IR and
  remote control — are the cheapest: a presence sensor is `MotionInput`'s
  sibling, and IR needs a decode the app lacks but is still pin to value to
  graph. **Switching power** — relays, transistors, MOSFETs — is a node category
  that does not exist yet: controlling a load is neither rendering nor sensing,
  and it is where wrong advice damages hardware rather than failing to light up.
  **Energy** — batteries, charging modules, balancers, BMS — is not a part but a
  dimension the power model lacks: the Build Diagram budgets against a PSU
  (`15.4 A` on the current bench), while a pack means state of charge, discharge
  limits and protection behaviour. The last two are gated on HW-14's audit.
  Before widening, harden the multiplier: the part catalogue and its import
  pipeline are what make a new family cheap, and HW-21 already records the tail
  each addition currently drags — unmeasured pad geometry, a missing generic
  four-pin SSD1306, board profiles at `visual-match-only`, and an I2C module
  falling through to the SPI signal table. Fix that once and a dozen families
  cost about what one costs.
- [ ] **D-04 · Code/field fidelity.** Code-node overflow, persistent globals,
  timing macros/includes/palette/XY support and richer inference; writable
  FieldFormula buffers. VU expansion beyond the current contract (clocked
  strings, unequal lengths, multiple pairs, stereo FFT or streamed audio) needs
  its own protocol/resource design; it is not unfinished launch work.
  Retain explicit approximation limits until a concrete
  use case justifies the work.

## Tracking rules

Details and evidence are routed through [docs/NAVIGATOR.md](docs/NAVIGATOR.md).
Keep new checkboxes here, contracts in design notes and evidence in reports/
support rows. Remove completed entries after recording their outcome. Private
confidential exploration stays outside tracked documents.
