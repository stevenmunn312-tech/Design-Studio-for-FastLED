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
  One change to review first: on 2026-09-27 the wire table moved from figures
  of uncertain origin (10 AWG at 65 A) to NEC 310.16 at 90 C, fuse and wire
  are now coordinated, and each supply has a main fuse and trunk
  ([Build Diagram rules](docs/architecture/build-diagram.md)).
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

## 2. Compile checks

None open. The D-05 LR7843 dimming fixtures (on/off regression, Level field,
wired Level and two gated switches) passed on classic ESP32 cores 3.3.11 and
2.0.17, ESP8266, RP2040 and Uno under arduino-cli on 2026-09-27
([power-switch compile record](docs/development/power-switch-compile-checks.md)).
The D-05 wired-Ethernet Art-Net, NTP, static-address and Wi-Fi
guard fixtures passed on classic ESP32, and the shared-SPI fixture on ESP32-C3,
under arduino-cli on 2026-09-25
([Ethernet compile record](docs/development/ethernet-compile-checks.md)).
The D-05 light-sensor normal, slideshow, player, LDR and no-sensor
guard fixtures all passed on classic ESP32 under arduino-cli on 2026-09-25
([light-sensor compile record](docs/development/light-sensor-compile-checks.md)).
The D-05 presence-sensor normal, slideshow, player and no-sensor
guard fixtures all passed on classic ESP32 under arduino-cli on 2026-09-24–25.
The toolchain, FQBN, source hashes, flash and RAM are in the
[presence-sensor compile record](docs/development/presence-sensor-compile-checks.md).
The D-05 Grove touch-sensor normal, slideshow, player and no-touch guard
fixtures all passed on classic ESP32 under arduino-cli on 2026-09-27. The
toolchain, hashes and resource figures are in the
[touch-button compile record](docs/development/touch-button-compile-checks.md).
The D-05 BME280 normal, slideshow, player and no-sensor guard fixtures all
passed on classic ESP32 under arduino-cli on 2026-09-27. The toolchain, hashes
and resource figures are in the
[environment-sensor compile record](docs/development/environment-sensor-compile-checks.md).

The D-05 DS18B20 temperature-probe normal, slideshow, player and no-sensor
guard fixtures all passed on classic ESP32 under arduino-cli on 2026-09-30. The
toolchain, hashes and resource figures are in the
[temperature-probe compile record](docs/development/temperature-sensor-compile-checks.md).

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
- **D-05 power switch:** the LR7843 switching and dimming a real DC load,
  including the MOSFET temperature at 50% duty; the row's requirements are in
  the support matrix.
- **D-05 Mosfetti:** the MonkMakes Mosfetti's four channels held off through
  setup, switched independently, one dimmed at 1 kHz, with the board total kept
  under 2 A; the row's requirements are in the support matrix.
- **D-05 PD trigger:** the ZY12PDN negotiating each voltage it offers from a named
  charger and cable, measured at its output pads before any load is connected; the
  row's requirements are in the support matrix.
- **D-05 Darlington driver:** the ULN2803A switching a real load from each channel,
  every input held low through reset and setup, with the load supply's ground joined
  to the controller's; the row's requirements are in the support matrix.
- **D-05 PWM driver:** the PCA9685 on the I2C bus, an LED dimmed across the range,
  a channel at exactly 0 and 1, a servo or oscilloscope reading at the chosen
  frequency, and outputs staying off until written; the row's requirements are in the
  support matrix.
- **D-05 buzzer:** the KY-012 sounded from a GPIO, silent through reset and setup,
  sounding while Sound is true and silent when it falls; the row's requirements are
  in the support matrix.
- **D-05 power monitor:** INA219 and INA226 readings against a multimeter, the
  INA226 with one load above 3 A; the rows' requirements are in the support matrix.
- **D-05 DMX transceiver:** the C25B MAX485 module on 5 V, with its RO divider,
  receiving a real DMX512 line; the row's requirements are in the support
  matrix.
- **D-05 light sensor:** the Adafruit BH1750's Lux against a reference meter in
  dim, room and bright light; the row's requirements are in the support matrix.
- **D-05 wired Ethernet:** the WIZ850io on a real network: link-up, DHCP and
  static addressing, Art-Net over the cable, NTP sync, and cable pull/replug
  recovery; the row's requirements are in the support matrix.
- **D-05 presence sensor:** the HLK-LD2410C reporting moving, stationary,
  combined and absent targets at two measured distances, including UART
  reconnect recovery; the row's requirements are in the support matrix.
- **D-05 touch button:** the Seeed Grove Touch Sensor powered from 3V3, with
  SIG idle LOW and touched HIGH on the selected GPIO; release, held and rapid
  touches in normal, slideshow and player firmware, plus startup and SIG
  reconnect behaviour. The row's requirements are in the support matrix.
- **D-05 environment sensor:** the Adafruit BME280's temperature, humidity and
  pressure against trusted references at two conditions, including recovery
  after unplugging the module. The row's requirements are in the support matrix.
- **D-05 temperature probe:** the Adafruit-form waterproof DS18B20 on 3V3 with
  its 4.7 kΩ DATA pull-up, read against a trusted thermometer at two
  temperatures including an ice bath, with Connected dropping and recovering
  when the probe is unplugged and replugged. The row's requirements are in the
  support matrix.
- **D-05 distance sensor:** the HC-SR04 on 5 V with its 1 kΩ / 2 kΩ Echo divider,
  read against a tape measure at two distances, with Connected dropping with
  nothing in range and recovering. The row's requirements are in the support
  matrix.
- **D-05 laser distance sensor:** the VL53L0X and VL53L1X (the latter also past 1.2 m) on 3V3 and the I2C bus, read against a
  tape measure at two distances, with Connected dropping when it is unplugged and
  recovering; the row's requirements are in the support matrix.
- **D-05 joystick:** the KY-023 on 3V3 with VRx and VRy on ADC1 pins and SW on a
  pull-up pin, both axes read centred and at full travel in each direction, the
  dead zone checked, and SW pressed and released. The row's requirements are in
  the support matrix.
- **D-05 accelerometer and gyroscope:** the GY-521 on 3V3 at 0x68 and 0x69, flat and on
  each side reading about 1 g on the matching axis, a slow turn compared against a
  known rate, and Connected dropping and recovering on unplug. The row's
  requirements are in the support matrix.
- **D-05 microwave motion:** the RCWL-0516 on 5 V with OUT on a GPIO, reading high
  on movement and low after its roughly two-second hold, the range against a tape
  measure, and behaviour through a plastic case. The row's requirements are in the
  support matrix.
- **D-05 touch pad:** the MPR121 breakout on the I2C bus, all twelve electrodes read in
  each generator, a touch and a release on each, and Connected going false when the
  breakout is unplugged. The row's requirements are in the support matrix.
- **D-05 keypad:** the 4x4 membrane keypad on eight GPIOs, all sixteen keys read in
  each generator, the tail order confirmed against the keypad's own markings, and a
  press and release on each row and column. The row's requirements are in the support
  matrix.
- **D-05 controller buck:** a board powered through its 5 V pin from the
  LM2596 at 12 V and at 24 V, output set to 5.0 V first, with the controller
  and its 5 V modules running.
- **D-05 LED rail converter:** a loaded 5 V LED rail powered from the Mean Well
  SD-100A-5 at 12 V and the SD-100B-5 at 24 V, with source current, output
  voltage, case temperature, FG and the isolated-output ground bond recorded.
- **D-05 pixel data extender:** the NLED TX/RX pair driving a WS2812B run over
  a long twisted A/B/ground cable, with the length recorded, powered from
  separate supplies at each end with bonded grounds.
- **D-05a IR remote:** receiver, remote, board, FQBN and GPIO recorded;
  tap/hold/alternate/unknown/rapid keys in all three build modes; reception
  during long clockless LED `show()` calls
  ([plan](docs/development/plans/ir-remote-controls.md)). The
  [KS0026/S3 partial bench pass](docs/release/beta-support-matrix.md#recorded-validations-that-are-not-yet-full-support-rows)
  confirms learning and remote LED power, including Toggle's separate On/Off
  inputs; the remaining key/repeat/long-run and build-mode checks stay open.

## 4. Explicitly deferred, not release blockers

- [ ] **D-01 · Broader control graph.** Time-dependent/nested-group evaluation
  and structured colour/pattern/status bindings in template builds. Wired
  slideshow Master Speed and the Performance Generator's real playback
  Display reading are complete. Preserve the music player's track-position
  clock.
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
  `PowerSwitchOutput`) is in software, switches from `On` and dims from
  `Level` with PWM at the part's 500 Hz, and its
  [compile fixtures pass](docs/development/power-switch-compile-checks.md);
  its bench row is still to do. The first multi-channel board, the MonkMakes
  Mosfetti (four lettered channels, 3-16 V, 2 A for the board, 1 kHz dimming),
  is modelled, catalogued, drawn, previewed and generated; the Power Switch's
  ports and pins now follow its board, and all its compile fixtures pass. Its
  bench row is in section 3. A four-channel LR7843-class board for LED rails
  waits on a board with a reliable reference.
  The Adafruit INA219 (`PowerMonitorInput`) is in software, experimental,
  and compiles on arduino-cli for classic ESP32 (2026-09-24); its bench row
  is still to do. It also has an `Overcurrent` output against an amps limit
  (software; compiled on classic ESP32 under arduino-cli 2026-09-30, 417,791 B flash, 29,060 B RAM). The INA226 module is a second part of the same node (modelled, drawn, previewed and generated; compile record in [the INA226 checks](docs/development/ina226-compile-checks.md)) and its bench row is open. The MAX485 DMX transceiver (roadmap step 3) is modelled and
  drawn on the Build Diagram for a DMX512 `DMXInput`, on 5 V with a 1 k / 2 k
  divider on RO. It adds no firmware, so no compile is owed; its bench row is
  in section 3. The HLK-LD2410C presence sensor (roadmap step 5) is modelled,
  drawn, previewed and generated as `PresenceInput` for ESP32; all four compile
  fixtures pass, and its bench row is in section 3. The Adafruit BH1750
  (roadmap step 5) is a `LightInput` module option, modelled, drawn,
  previewed and generated; all five compile fixtures pass, and its bench row is
  in section 3. The WIZnet WIZ850io (roadmap step 6, `EthernetModule`) is
  modelled from WIZnet's board file, drawn, and generated for the normal
  sketch, replacing Wi-Fi for Art-Net and NTP
  ([design](docs/development/design/wired-ethernet.md)); all five compile
  fixtures pass, and its bench row is in section 3. The NLED Pixel Data
  Extender (roadmap step 7) is an LED output's **data link** option, modelled
  and drawn on the Build Diagram. It adds no firmware, so no compile is owed;
  its bench row is in section 3. Roadmap step 8 is complete in software
  ([plan](docs/development/plans/power-conversion-and-protection.md)): each
  supply now has a main fuse and trunk; the LM2596 controller buck and Mean
  Well SD-100A/B-5 LED rail converters (`PowerConverter`) are modelled, sized,
  drawn and experimental. The SD-100 path applies the imported temperature
  derating at a 40 °C enclosure ambient and replaces generic 5 V PSUs with a
  shared upstream-source recommendation. The Seeed Grove Touch Sensor (roadmap
  step 9, `TouchButtonInput`) is modelled, catalogued, drawn, previewed and
  generated for normal/show/player paths. Its touch-face pin order is locked as
  `SIG, NC, VCC, GND`; all four
  [compile fixtures pass](docs/development/touch-button-compile-checks.md), and
  its bench row is in section 3.
  The Adafruit BME280 (the next sensor-family item, `EnvironmentInput`) is
  modelled, catalogued, drawn, previewed and generated for normal/show/player
  paths at 0x77 or 0x76; all four
  [compile fixtures pass](docs/development/environment-sensor-compile-checks.md),
  and its bench row is in section 3.
  The waterproof DS18B20 (`TemperatureInput`) is modelled from Adafruit
  product 381, catalogued, drawn with its 4.7 kΩ pull-up, previewed and
  generated for normal/show/player paths with library-free 1-Wire firmware; all
  four [compile fixtures pass](docs/development/temperature-sensor-compile-checks.md),
  and its bench row is in section 3.
  The HC-SR04 ultrasonic ranger (`DistanceInput`) is modelled, catalogued, drawn
  with its 1 kΩ / 2 kΩ Echo divider, previewed and generated for
  normal/show/player paths; its compile result is in the
  [distance-sensor record](docs/development/distance-sensor-compile-checks.md), and its bench row is in
  section 3.
  The KY-023 joystick (`JoystickInput`) is modelled, catalogued, drawn,
  previewed and generated for normal/show/player paths; its compile result is in the
  [joystick record](docs/development/joystick-compile-checks.md), and its bench row
  is in section 3.
  The GY-521 MPU-6050 (`MotionVectorInput`) is modelled, catalogued, drawn,
  previewed and generated for normal/show/player paths; its compile result is in the
  [motion-sensor record](docs/development/motion-sensor-compile-checks.md), and its
  bench row is in section 3.
  The RCWL-0516 microwave radar is a second `MotionInput` module beside the PIR:
  modelled, catalogued, drawn and previewed, with the same digital firmware, so
  no compile is owed; its bench row is in section 3.
  The MPR121 touch controller (`TouchPadInput`) is modelled, catalogued, drawn, previewed
  and generated for normal/show/player paths; its compile result is in the
  [touch-pad record](docs/development/touch-pad-compile-checks.md), and its bench row is
  in section 3.
  The 4x4 matrix keypad (`KeypadInput`) is modelled, catalogued, drawn, previewed and
  generated for normal/show/player paths; its compile result is in the
  [keypad record](docs/development/keypad-compile-checks.md), and its bench row is in
  section 3.

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
