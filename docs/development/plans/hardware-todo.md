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

- [ ] **Split canvas with a resizeable divider.** Graph above, hardware below.
  Must collapse to nothing — the supported minimum is 1280×720.
- [ ] **Hardware view: board + auto-radial layout.** Not draggable. Parts are
  placed and connected by the view.
- [ ] **"Add hardware" action** in the hardware pane, replacing hardware entries
  in the node library.
- [ ] **Creating a part creates its graph node**, already carrying pins from the
  board profile. This is the whole point — see the design note.
- [ ] **Remove LED output from the node library.** First test of "hardware only
  exists via the hardware view".
- [ ] **Deletion semantics.** Graph delete disconnects; hardware view removes.
- [ ] **Empty state with no board chosen**, in both panes.

Decision gate: does the split earn its screen space? If the hardware pane feels
like overhead at this size, stop and reconsider before migrating anything else.

## Phase 2 — LED output forms

- [ ] **`form` property** — strip / matrix / ring / HUB75 — replacing the
  overloaded `layout` + `chipset` combination.
- [ ] **Four sidebar entries** that each create the node pre-set to a form.
- [ ] **Ring form + XY mapping.** LED count, start angle, direction.
- [ ] **In-graph preview in the output's own shape.** A ring draws a ring.
- [ ] **Stage becomes the audience view** — lights only.
- [ ] Decide the rename: `MatrixOutput` → `LED Output` (open question 2).

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
- [ ] **Two-board graphs.** The trigger that would bring attachment edges back.
- [ ] **Raspberry Pi backend.** Out of scope for 1.0.0, but the codegen backend
  is a field on the profile, so adding it is an entry rather than a refactor.

## Carried over from the bench

Not part of this branch's design, but unresolved and worth not losing.

- [ ] **No audio from the MAX98357A.** ESP32 initialises I2S and emits a sine at
  two clock rates; wiring and voltages verified; amp `SD` jumpered high. Next:
  confirm the speaker is bridged across `+`/`−` rather than one leg to ground,
  then try a known-good speaker.
- [ ] **fbuild deploy cannot open the port** while esptool from a shell opens
  the same port seconds later. Reproducible; engine currently switched to
  `arduino-cli`, which flashes reliably. Good upstream report.
- [ ] **The capacity meter measures the wrong sketch for SD shows.** It
  compile-checks the normal sketch, so it reports comfortable headroom for a
  design whose *player* will not link.
- [ ] **The show player ignores PSRAM.** `playerSketchGenerator` has no PSRAM
  path at all, so the SD-show ceiling is internal DRAM even on a board that has
  PSRAM. `buildPatternRenderers` already accepts `psramAllowed`.
