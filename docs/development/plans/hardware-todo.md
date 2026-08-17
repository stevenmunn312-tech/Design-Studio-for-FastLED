# Hardware branch — todo

Work tracker for the `Hardware` branch (1.0.0, breaking). Design lives in
[`hardware-nodes.md`](../design/hardware-nodes.md) and
[`board-node-architecture.md`](../design/board-node-architecture.md); this file
is the running order and the state of each piece.

`main` is frozen — nothing here goes to the beta.

## Done

- [x] **Board node, non-breaking half.** Singleton node selecting a board
  *profile* rather than a chip target, capability model on
  `PhysicalBoardProfile`, twelve imported profiles with renders, pinout view
  behind the eye button, and `findExactBoardPinIssues` flagging pins the chosen
  board cannot reach. Shipped to the beta before the freeze.
- [x] **Amplifier split out of SD Card.** `i2sBclk`/`i2sLrc`/`i2sDout` moved to
  a portless `Amplifier` node with a `model` property. Breaking, no migration.

## Next — attachment model

The port model is the piece everything else hangs off, so it goes first.

- [ ] **`attach` edge type.** Part → Board, one hop, rejected anywhere else.
  Decide the visual treatment; it must not read as signal flow.
- [ ] **Dynamic attachment ports on the Board node.** Grows with what is
  attached. Prototype the readability of eight attached parts before
  committing — open question 3 in the design note.
- [ ] **Pins default from the board on attach.** Reads
  `commonPeripheralStartingPoints`. Only ever overwrites pins the user has not
  edited, matching `retargetedMicPins`. This is the payoff of the whole
  exercise — it is what prevents the amp-pin class of bug.
- [ ] **Retire the scan-based lookup.** `playerConfigFromGraph` and the Board
  node currently find each other by scanning; once attachment exists they
  should follow the edge, so an unattached part is visibly unattached.

## Then — parts and identity

- [ ] **Part dropdown per hardware node.** INMP441, MAX98357A, and so on.
  Drives pin roles, thumbnail, and part-specific caveats.
- [ ] **Part catalogue.** Where do part definitions live? Probably the same
  shape as `boardProfiles.ts` — id, label, pin roles, render, notes.
- [ ] **Module thumbnails.** Small image in the existing `NodePreview` slot.
  Needs renders; the Blender asset pipeline already produces board renders and
  the Build Diagram already draws INMP441 and 74AHCT125 graphics.
- [ ] **`Microphone` node.** Replaces `MicInput` as a hardware part with no
  signal output. Open question 4: rename or new type.

## Then — the Audio capability

- [ ] **`Audio` node.** Source dropdown over the board's capabilities, honest
  empty state, defaults to the only attached source.
- [ ] **Analysis nodes consume it through ports.** `FFTAnalyzer`,
  `BeatDetect`, `PercussionDetect`, `AudioFeatures` stop reading
  `useAudioStore.getState()` ambiently.
- [ ] **Decoder tap.** The source that does not exist yet: the board plays a
  track and analyses its own PCM before the DAC. Unlocks generative shows
  running against real music without a microphone.
- [ ] **Line in.** Required, not optional, because a self-contained player
  module cannot be decoder-tapped.

## Then — LED outputs

- [ ] **`form` property on the output node** — strip / matrix / ring / HUB75 —
  replacing the overloaded `layout` + `chipset` combination.
- [ ] **Four sidebar entries** that each drop the node pre-set to a form.
- [ ] **Ring form.** New XY mapping: LED count, start angle, direction.
- [ ] **In-node previews in the output's own shape.** A ring draws a ring.
  Side panel stays — different job.

## Deferred

- [ ] **Storage capability node.** SD card / onboard flash / USB. Open
  question 1; the show pipeline needs the distinction regardless.
- [ ] **Two-board graphs.** Attachment makes them representable; codegen still
  emits one sketch.
- [ ] **Raspberry Pi backend.** Out of scope for 1.0.0, but the codegen backend
  is a field on the profile so adding it is an entry rather than a refactor.

## Carried over from the bench

Not part of this branch's design, but unresolved and worth not losing:

- [ ] **No audio from the MAX98357A.** ESP32 initialises I2S and emits a sine
  at two clock rates; wiring and voltages verified; amp `SD` jumpered high.
  Next: confirm the speaker is bridged across `+`/`−` rather than one leg to
  ground, then try a known-good speaker.
- [ ] **fbuild deploy cannot open the port** while esptool from a shell opens
  the same port seconds later. Reproducible; engine currently switched to
  `arduino-cli`, which flashes reliably. Good upstream report.
- [ ] **The capacity meter measures the wrong sketch for SD shows.** It
  compile-checks the normal sketch, so it reports comfortable headroom for a
  design whose *player* will not link.
- [ ] **The show player ignores PSRAM.** `playerSketchGenerator` has no PSRAM
  path at all, so the SD-show ceiling is internal DRAM even on a board that has
  PSRAM. `buildPatternRenderers` already accepts `psramAllowed`.
