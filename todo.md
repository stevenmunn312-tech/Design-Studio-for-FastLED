# Hardware → v1.0.0 implementation backlog

Single active checklist for `Hardware`; `main` stays frozen. Restructured
2026-09-24. The full history of every item up to that date, with its evidence
narrative, is in [the archived backlog](docs/archive/hardware-todo-to-2026-09-24.md);
item ids are unchanged, so links to "root todo, HW-nn" still name the same work.

## How this list works

- **Engineering items close on software**, plus a compile where the item
  changes firmware. They do not wait for hardware.
- **Hardware nobody here owns is not a blocker.** A feature ships marked
  **experimental** in the [support matrix](docs/release/beta-support-matrix.md)
  and graduates when a dated bench row lands, from the maintainer or from
  community testing. A bench gate may hold back implementation only where the
  facts cannot be known without measuring, such as the controller or pinout
  of an unbranded clone board.
- **A new part starts with its Blender model.** Modelling from datasheet
  dimensions is the first step of implementing a part, not a precondition
  waiting on someone else.
- **Firmware compiles are run one at a time on request**, and the result is
  recorded before the next is started.
- Contracts live in design notes, evidence in reports and support rows. Remove
  an entry once its outcome is recorded, and route details through
  [docs/NAVIGATOR.md](docs/NAVIGATOR.md).

## 1. Open engineering work

- [ ] **HW-12 · Integrated display boards (M).** Add exact profiles, bus
  ownership and any missing drivers for proposed integrated boards. This is
  the one item with a genuine measurement gate: an unbranded board's display
  controller and fixed pins have to be identified on the board, because there is
  no reliable documentation. The ESP32-2432S028R profile is in the app and
  bench-proven, and a full board now says so by name
  ([hardware nodes](docs/development/design/hardware-nodes.md#boards-with-hardware-already-on-them)).
- [ ] **HW-14 · Independent electrical review (M).** Renamed from "audit". It
  happens *after* components are in the app and appear in the Build Diagram:
  a career electronics engineering lecturer checks that the generated wiring,
  calculations, tables and wording are safe and recommended practice. It
  reviews what exists, so it gates nothing in D-05. Record findings and
  corrections against
  [the Build Diagram contract](docs/development/plans/build-diagram-handoff.md).
  A real reference system is available to review against: a 70,000 mAh lithium pack with fuses,
  balancer, BMS and 100 W charge/discharge control.
- [ ] **HW-17 · Distribution smoke tests (M).** Clean-profile offline-PWA
  relaunch and clean end-user-machine desktop runs; platform signing and
  notarization before publishing. Exit: per-platform launch/install, helper
  discovery, permissions, offline and recovery evidence.
- [ ] **HW-18 · v1 scope and format baseline (M).** The pre-1.0 compatibility
  sweep is done ([cleanup record](docs/release/versioning-and-releases.md#pre-v1-cleanup-record));
  new leftovers found later are removed the same way, without migrations.
  *At release:*
  choose the supported combinations from the evidence then on record,
  reconcile release copy, freeze the panel/document/control save format, and
  record limitations and deferments. Never merge `main` and `Hardware`.

## 2. Compile checks (run on request, one at a time)

- **D-05 light sensor:** compile one normal ESP32 graph whose BH1750 Lux drives
  an LED property, then the slideshow and player control paths. Record
  toolchain, FQBN, flash and RAM before moving to the next leg.

The D-05 presence-sensor normal, slideshow, player and no-sensor
guard fixtures all passed on classic ESP32 under arduino-cli on 2026-09-24–25.
The toolchain, FQBN, source hashes, flash and RAM are in the
[presence-sensor compile record](docs/development/presence-sensor-compile-checks.md).

The HW-19 and HW-20 compiles all passed on 2026-09-24:
- Generic MEMS on arduino-cli, and the microphone path on fbuild;
- the DAC → power amplifier player sketch;
- the SPH0645LM4H on fbuild and on esp32 core 2.0.17.

Records are in [audio part expansion](docs/development/plans/audio-part-expansion.md#phases).

## 3. Community and bench testing (non-blocking)

Each entry is a support-matrix row waiting for evidence. The feature is already
in the app and marked experimental; nothing here holds up development.

- **Direct controls:** real touch, panel enable and re-enable, LED and status
  response, and widget feedback during playback, on hardware
  ([design, step 10](docs/development/design/direct-controls-and-output-status.md#10-verify-the-complete-workflows)).
- **HW-11 shared bus:** TFT + SD + touch on one bus with audio playing. The CYD
  cannot host this run (its card is on the second SPI host), so it needs another
  rig. All other HW-11 measurements are recorded, and its budgets are set.
- **HW-12 CYD:** the three generators' touch paths on the unit; onboard RGB LED
  and light-sensor pins.
- **HW-13 firmware/bench matrix:**
  - classic-ESP32 SD provisioning and player;
  - S3 PSRAM variants;
  - tiled, rotated or custom-XY layouts, and native multi-output;
  - baked audio and collection modulation;
  - FormulaField and FormulaPoints;
  - a real Art-Net controller, and DMX512 over RS-485;
  - long-duration RTC software-clock drift, and DS3231 recovery;
  - Button, Pot, Encoder and PIR;
  - a HUB75 full support row, streaming, folded/chained/rotated topology, and
    show/player (confirm chain orientation, preview fidelity and panel power
    assumptions).
- **Deploy gate on accreted graphs:** anyone with a graph that uploaded before
  2026-09-11 and is refused now should report it as a gate bug, not rewire the
  graph. Shipped starters are covered by `deployGates.test.ts`.
- **HW-19 microphones:** ICS-43434 and Generic MEMS live FFT and beat response,
  against an INMP441 on the same fixture and source.
- **HW-20 audio chain:** each power amplifier (PAM8403, PAM8610, DX-0809) fed by
  a DAC and by the internal DAC. The MAX98357A stereo pair hearing left and
  right separately.
- **SPH0645LM4H:** a classic-ESP32 bench row against an INMP441. Separately,
  a measured capture on an ESP32-S3, which is the one genuine measurement
  gap: no documented timing fix exists for its I2S block, so the S3 is
  refused until one is found.
- **D-05 power switch:** the LR7843 switching a real DC load; the row's
  requirements are in the support matrix.
- **D-05 power monitor:** INA219 readings against a multimeter; the row's
  requirements are in the support matrix.
- **D-05 DMX transceiver:** the C25B MAX485 module on 5 V, with its RO divider,
  receiving a real DMX512 line; the row's requirements are in the support
  matrix.
- **D-05 light sensor:** the Adafruit BH1750's Lux against a reference meter in
  dim, room and bright light; the row's requirements are in the support matrix.
- **D-05 presence sensor:** the HLK-LD2410C reporting moving, stationary,
  combined and absent targets at two measured distances, including UART
  reconnect recovery; the row's requirements are in the support matrix.
- **D-05a IR remote:** receiver, remote, board, FQBN and GPIO recorded;
  tap/hold/alternate/unknown/rapid keys in all three build modes; reception
  during long clockless LED `show()` calls
  ([plan](docs/development/plans/ir-remote-controls.md)).

## 4. Explicitly deferred, not release blockers

- [ ] **D-01 · Broader control graph.** Time-dependent/nested-group evaluation,
  structured colour/pattern/status bindings in template builds, wired slideshow
  Master Speed. Performance Generator Display output needs a real playback
  reading. Preserve the music player's track-position clock.
- [ ] **D-02 · Larger UI scope.** Shared-document panel interaction, multiple
  screens/navigation, containers/overlap/free drawing, charts/histories/marquees,
  XY/Launch Pads, Choice/Step controls, Colour Picker/Arc Gauge, text entry,
  arbitrary callbacks/code/LVGL properties, SquareLine project exchange, remote/
  phone UI, TFT video and e-paper/RGB/HDMI. Resolve size thresholds and density
  from actual capabilities and legibility. Also deferred: colour pattern
  artwork on Show Status, which is a feature (feeding the player-owned 96x96
  bake from a Slideshow's collection), not a repair.
- [ ] **D-03 · Other architecture/authoring.** Multi-board, Raspberry Pi/Linux
  backend, richer timed sequences, pattern weighting/tags, broader library
  sharing and distinct per-input modulation. Keep Collection/engine ownership
  separate unless user research establishes a better model.
- [ ] **D-04 · Code/field fidelity.** Code-node overflow, persistent globals,
  timing macros/includes/palette/XY support and richer inference; writable
  FieldFormula buffers. VU expansion beyond the current contract (clocked
  strings, unequal lengths, multiple pairs, stereo FFT or streamed audio) needs
  its own protocol/resource design. Retain explicit approximation limits until
  a concrete use case justifies the work.
- [ ] **D-05 · Hardware expansion.** Candidate families, their order and the
  shared definition of done are in the
  [hardware expansion roadmap](docs/development/plans/hardware-expansion-roadmap.md).
  Each starts with its Blender model. Switching power (MOSFET modules) and
  energy (batteries, charging, BMS) are built like the relay slice: in the app,
  in the Build Diagram, and marked experimental. The HW-14 review then checks
  them rather than gating them. D-05a (IR remote) is complete in software and
  compile; its bench row is in section 3. The first MOSFET switch (LR7843,
  `PowerSwitchOutput`) is in software, on/off only, and compiles on
  arduino-cli for classic ESP32 (2026-09-24); its bench row is still to do.
  The Adafruit INA219 (`PowerMonitorInput`) is in software, experimental,
  and compiles on arduino-cli for classic ESP32 (2026-09-24); its bench row
  is still to do. The MAX485 DMX transceiver (roadmap step 3) is modelled and
  drawn on the Build Diagram for a DMX512 `DMXInput`, on 5 V with a 1 k / 2 k
  divider on RO. It adds no firmware, so no compile is owed; its bench row is
  in section 3. The HLK-LD2410C presence sensor (roadmap step 5) is modelled,
  drawn, previewed and generated as `PresenceInput` for ESP32; all four compile
  fixtures pass, and its bench row is in section 3. The Adafruit BH1750
  (roadmap step 5) is a `LightInput` module option, modelled, drawn,
  previewed and generated; its compile and bench rows are in sections 2 and 3.

## Completed

Outcomes are recorded where linked; the per-item narratives are in the
[archived backlog](docs/archive/hardware-todo-to-2026-09-24.md).

- **HW-01–HW-10, HW-15, HW-21–HW-31**: controls and screens, workflow, catalogue
  and helper work.
- **Direct controls and LED output status**: software complete; bench readings
  are in section 3
  ([design](docs/development/design/direct-controls-and-output-status.md)).
- **HW-11 · Touch/LVGL budget and calibration**: instrument built, five
  runs recorded, budgets set, and guided calibration done on the CYD
  ([bench](docs/development/testing/display-budget-bench.md)). The shared-bus
  run is in section 3.
- **HW-13 · display compile half**: twelve fixtures pass on both engines
  ([compile record](docs/development/display-compile-checks.md)). The bench
  matrix is in section 3.
- **HW-16 · First-user journey**: a first-time user built and uploaded a
  working sketch within minutes, without guidance (reported 2026-09-24).
  The blocker classes are automated in `deployGates.test.ts`.
- **HW-19 · ICS-43434 and Generic I2S MEMS**: software complete; compiles
  pass on arduino-cli and fbuild.
- **HW-20 phases 2–5**: Option B chain, power amplifiers, the SPH0645LM4H
  (classic ESP32, app-owned capture) and the MAX98357A stereo pair
  ([plan](docs/development/plans/audio-part-expansion.md#phases)).
- **D-05a · IR remote**: steps 1–13
  ([IR compile checks](docs/development/ir-compile-checks.md)).
- **D-05 · HLK-LD2410C presence sensor compile**: normal, slideshow, player
  and no-sensor guard fixtures pass on classic ESP32
  ([compile record](docs/development/presence-sensor-compile-checks.md)).
