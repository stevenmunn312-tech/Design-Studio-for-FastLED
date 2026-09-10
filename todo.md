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
- [ ] **HW-02 · P1 · Panel ownership and Enabled (M).** Code complete; compile
  evidence outstanding. `mountedDisplays.ts` resolves mounted geometry from the
  panel for the editor, deploy validation (every generator) and the template
  plan; Portrait/Landscape rotates the connected panels and sizes the design
  from them. Enabled is one runtime signal in all three generators — dark, no
  touch, outputs at rest, still built so it can be turned back on — through a
  per-panel latch, and a wired Enabled is accepted everywhere rather than
  refused by the templates. Also repaired here: a `Display` node's
  `customDisplay` output was stripped by the port sync, so the mount wire was
  dropped on load and on every document edit. Rotation, re-enable, wired-enable
  and save/reload coverage added; `npm test`, `npm run lint` and `tsc -b` pass.
  The mounted-size path has incidental bench support — a 240x240 module on
  ST7789V silicon rendered at the right size and orientation, which is the
  catalogue `resolutionPx` override rather than the chip-name default. Rotation
  has since been proven on glass at `180` on that same panel — an upside-down
  mounting corrected through `tftRotation`, confirming `tftWindowOrigin`'s 80-row
  window offset — but through a fixed layout's property, not through the editor's
  Portrait/Landscape write on a mounted document, which is this item's actual
  case and stays untested. The disabled and wired-Enable cases are now
  bench-proven (see the Enabled row in
  [the support matrix](docs/release/beta-support-matrix.md#auxiliary-display-hardware-validation)):
  all four Enabled combinations of an OLED and a TFT in one sketch, each panel
  darkening independently, then a button darkening and re-lighting both at
  runtime. Remaining exit: the same rule on a mounted custom document, where it
  must also rest widget outputs — a fixed Clock layout has none — and the
  editor's own Portrait/Landscape write, rotation having so far been proven only
  through a fixed layout's property. F3/F4.
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
  Repair `generate-display-smoke.ts` and hardware-bearing Display test fixtures;
  use panel/document edges and Song Info. Assert intended UI/binding symbols
  exist, then compile normal/show/player through Arduino CLI and fbuild. Include
  isolated TFT-only, headless, disabled and multi-panel cases and each advertised
  board/part family, especially segment modules. Record fresh source hashes,
  toolchains and memory figures. Historical fixtures are not current proof. F9.

## 2. Make the workflow understandable

- [ ] **HW-07 · Connected authoring (M; after HW-04/05).** Distinguish panel and
  design labels, add create/open-design and back-to-hardware actions, display
  build mode/reason, and filter assignments by destination plus type. Explain
  event versus state and units/ranges. **A design has no size until it is
  connected to a panel.** A mounted design's size is not a free choice — it is
  the panel's rotated size — so rather than letting a design be authored at an
  arbitrary size and reporting the mismatch afterwards, do not offer the size at
  all until there is a panel to derive it from: keep 320x240 as an internal
  default, show no size on an unconnected `Display` node, disable Edit Display
  until the panel wire exists, and on connection show the hardware's size and
  enable it. That makes the invalid state unrepresentable instead of repairable,
  and stops someone laying out a screen that cannot fit the panel they connect
  later. It extends the rule HW-03 already established — an unmounted document
  has no physical existence, so it costs no RAM, bakes no assets and emits no
  firmware — to its geometry, which is equally a physical fact. Bench-reported
  2026-09-08 after the size error was hit twice: `mountedSizeIssue` says
  "resize it" without naming the Portrait/Landscape control that does it, and
  the 320x240 default means a new design mounted on a portrait panel is wrong
  before anything is drawn. Changing the panel under an existing design
  deliberately needs no rule of its own: re-fit to the new panel and let the
  editor show it, because a WYSIWYG canvas makes a wrong layout self-evident and
  the user can redo it. That is safe because `resizeDisplayDocument` already
  scales widgets and clamps them through `constrainDisplayWidgetBounds`, so
  nothing lands off-canvas or becomes ungrabbable, and an unmodified template
  re-lays out from its own portrait/landscape spec via
  `canonicalDisplayTemplateBounds` rather than being scaled. Rotation likewise
  keeps the explicit Portrait/Landscape control it has now. A disabled Edit Display states why in a
  small label beneath it. Prefer naming the thing to connect *to* — the node
  being labelled is itself the custom display, so "Connect a Transport Display
  to edit" points somewhere, where "connect a custom display" reads as a
  description of the node the user is already looking at. Templates are unaffected: they already carry portrait and
  landscape variants selected by `height > width` from a 320x240 reference. Exit: actions/readings are traceable in
  visible edges; no hidden template bindings. See review recommendations.
- [ ] **HW-08 · Starters, visual QA and help (M; after HW-07).** Connected live
  dimming, slideshow browse/confirm and music transport/readback examples;
  update in-app Help, descriptions/cards and guides together. Snapshot fixed
  layouts, widget states, launch themes and templates at supported sizes and
  orientations, including pressed/disabled. Expose diagnostics/calibration.
  SquareLine interaction research from the old plan is optional UX input.
- [ ] **HW-09 · Collection freshness/music completeness (M).** Verify group
  edit/delete/reorder invalidates generated timelines and packaged pattern sets;
  cover patternset-without-song and songs-only paths. Exit: stale/incomplete
  shows cannot export silently. Source: collection-driven-performance open questions.
- [ ] **HW-10 · Residual node-authoring audit (S).** Review explicit splice
  targets on multi-input nodes and name/document the preset-name-or-RGB palette
  union. Reconfirm old findings against current tests instead of replaying stale
  prescriptions. Ease variants, PaletteFromImage, DMX/RTC, FieldNoise and field
  brightness inputs already exist. Exit: remaining metadata decisions fixed or
  explicitly closed with rationale.

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
- [ ] **HW-21 · P2 · Catalogue and Build Diagram gaps for common I2C OLEDs (S).**
  Three defects found while debugging a dark OLED on 2026-09-08, all in how the
  catalogue describes real modules rather than in firmware. (a) There is no
  generic four-pin SSD1306 0.96-inch I2C part: the only SSD1306 entry is
  Adafruit's eight-pin STEMMA QT breakout, so the most common OLED anyone owns
  cannot be described accurately. (b) `SIGNAL_PAD_NAMES['info-display']` in
  `physicalDiagramLayout.ts` lists only the SPI signals, so an I2C OLED whose
  silkscreen prints CLK/DATA rather than SCL/SDA falls through to that table and
  the diagram draws SDA on the CS pad and SCL on the DC pad. (c)
  `MODULE_PAD_GEOMETRY` has no entry for `sh1106-oled-128x64-i2c`, so its four
  wires are placed by a generic even spread instead of measured holes, and that
  fallback also skips the aspect-fit correction the measured branch applies.
  Exit: every catalogued display part with a render has measured geometry and a
  pad mapping derived from its own labels, asserted by a test that fails when a
  new part arrives without them rather than only checking the entries that exist.

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
  anyway (M; overlaps HW-11).** Same session, and the more expensive half.
  `estimateFirmwareRam` already counted this design's display RAM — the 64 KiB
  `CUSTOM_DISPLAY_LVGL_HEAP_BYTES` plus a 240x20 RGB565 draw buffer, about 75 KiB
  before FastLED and framework overhead — so the failure was predictable before
  the toolchain ran. It surfaced only as a Graph Health *warning*, because
  `INTERNAL_RAM_WARN_BYTES` is a flat 40,000 and is documented as "not a hard
  board-specific limit". The user paid 3m 45s to be told something the app could
  have said instantly. The board is known at that point, and a classic ESP32's
  `dram0_0_seg` is far smaller than an ESP32-S3's, so the budget can be
  board-derived rather than a single constant. Exit: a design whose estimated
  internal RAM exceeds the selected board's own budget is refused before
  compiling, naming the largest contributor; the flat constant remains only as
  the fallback for boards with no declared budget.

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
