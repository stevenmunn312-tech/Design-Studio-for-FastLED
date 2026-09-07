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

- [ ] **HW-01 · P1 · Slideshow selection and TFT-only firmware (M).** Code
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
  `tsc -b` pass. Remaining exit: an Arduino CLI/fbuild compile of the TFT-only,
  OLED+TFT and headless cases (belongs to the HW-06 matrix). Review F1/F2.
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
  Remaining exit: compile the disabled, wired-enable and rotated cases (HW-06
  matrix). F3/F4.
- [ ] **HW-03 · P1/P2 · Resolve mounted screens once (M; after HW-02).** Enforce
  one document per panel initially and diagnose unmounted live widget sources.
  Share active instances across RAM, assets, validation and emission; exclude
  orphan designs. Exit: no duplicate/undeclared symbols, real rotation changes
  buffer estimates, one shared heap, unused designs cannot block builds. F5/F7.
- [ ] **HW-04 · P1 · Shared build-mode/capability plan (L; after HW-01–03).**
  Replace repeated generator selection in Upload, Graph Health, capacity,
  assets and generation with one pure resolver. Validate resolved content/actions
  and destinations; remove the dead Show Status blackout advice. Preserve SD
  precedence and standalone VU. Exit: all entry points choose the same build
  and diagnostics for disconnected/mixed-engine graphs. Finish registry/control
  planning around the existing scalar IR; do not rebuild that IR. F6.
- [ ] **HW-05 · P2 · Live custom-screen simulation (M; after HW-02–04).** Render
  graph-published roles using dirty updates, including passive readouts and Set
  feedback; reuse the renderer for panel preview. Audit fixed/custom sample →
  evaluate → publish → flush order and native passes. Exit: Slider → Readout
  and Song Info → Text update visibly, controls reconcile after release, taps
  are preserved and input sampling occurs once per frame. F8.
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
  event versus state and units/ranges. Exit: actions/readings are traceable in
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
- [ ] **HW-14 · Independent electrical review (M).** Qualified review of Build
  Diagram calculations, source tables, scope and wording before authoritative
  electrical-guidance claims. Exit: review/corrections recorded against
  `build-diagram-handoff.md`.
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
- [ ] **D-03 · Other architecture/authoring.** Multi-board, Raspberry Pi/Linux
  backend, richer timed sequences, pattern weighting/tags, broader library
  sharing and distinct per-input modulation. Keep Collection/engine ownership
  separate unless user research establishes a better model; merger is not required.
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
