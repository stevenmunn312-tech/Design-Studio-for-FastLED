# Hardware → v1.0.0 implementation backlog

Single active checklist for `Hardware`; `main` stays frozen. Restructured
2026-09-24 and reconciled against every document under `docs/` on 2026-10-07.
The full history of every item up to 2026-09-24, with its evidence narrative,
is in [the archived backlog](docs/archive/hardware-todo-to-2026-09-24.md); item
ids are unchanged, so links to "root todo, HW-nn" still name the same work.

## How this list works

- **Sections run in order of progression:** close out software that already
  exists, finish the remaining engineering, keep expanding hardware, gather
  bench evidence alongside all of it, then run the release track. Within a
  section, do the items in the order listed. Section 6 waits until after v1.
- **Engineering items close on software**, plus a compile where the item
  changes firmware. They do not wait for hardware. Compiles run on Arduino CLI
  alone; fbuild is on hold (section 6). Run fixture compiles one at a time;
  overlapping runs corrupt the arduino-cli cache.
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
  [docs/index.md](docs/index.md).

## 1. Close out software that already exists

Compiles owed by features that are already in the app: none open. Every
feature's fixtures compile on Arduino CLI as of 8 October 2026.

## 2. Remaining engineering before v1

- [ ] **HW-12 · Integrated display boards (M).** Add exact profiles, bus
  ownership and any missing drivers for proposed integrated boards. This is
  the one item with a genuine measurement gate: an unbranded board's display
  controller and fixed pins have to be identified on the board, because there is
  no reliable documentation. The ESP32-2432S028R profile is in the app and
  bench-proven, and a full board now says so by name
  ([hardware nodes](docs/architecture/hardware-model.md#boards-with-hardware-already-on-them)).
  The same driver question covers the catalogued ILI9341 + XPT2046 SPI module,
  which is modelled but undriven (`CATALOGUE_ONLY_DISPLAY_PART_IDS` in
  `src/build/parts/partCatalogue.ts`): most ESP32-2432S028 units ship that
  controller.

## 3. Hardware expansion (ongoing, not a release blocker)

- [ ] **D-05 · Hardware expansion.** Candidate families, their order and the
  shared definition of done are in the
  [hardware expansion roadmap](docs/plans/hardware-expansion-roadmap.md),
  which records each finished part. Each part starts with its Blender model,
  ships experimental, and gets its bench row in section 4. Switching power and
  energy families are built like the relay slice: in the app, in the Build
  Diagram, and marked experimental; HW-14 then checks them rather than gating
  them. What remains, in order:
  1. A four-channel LR7843-class board for LED rails, once one with a reliable
     reference turns up. The listings found disagree on layout, and the
     documented FR1205 board overdrives its gates above about 20 V.
  2. Two time-of-flight sensors on one bus. Each VL53L0X or VL53L1X needs its
     SHDN/XSHUT pin driven separately, and the app offers no way to do that.
  3. A rotary encoder with an addressable feedback ring.
  4. A passive buzzer with tones from the controller, beside the KY-012.
  5. A fan module with a tachometer: a cooling output plus a speed input.
  6. The DFPlayer Mini. Its verified Blender asset exists; graph control,
     firmware ownership and audio routing remain.
  7. A solid-state relay, only once AC/DC load type, leakage and isolation are
     represented honestly.
  8. Exact controller profiles with measured pin maps: ESP32-C3 SuperMini,
     ESP32-C6-DevKitC-1, ESP8266 D1 Mini, Raspberry Pi Pico W, Teensy 4.1,
     Arduino Nano ESP32, WT32-ETH01 (its LAN8720 Ethernet is a board profile,
     not a module) and QuinLED Dig-Uno and Dig-Quad.
  9. Families that extend the power model: battery chargers, cell balancers,
     battery-management systems, mains SSRs, contactors and large motor
     drivers. A real reference system is available: a 70,000 mAh lithium pack
     with fuses, balancer, BMS and 100 W charge/discharge control.

## 4. Bench and community testing (non-blocking, in parallel)

Each entry is a support-matrix row waiting for evidence. The feature is already
in the app and marked experimental; nothing here holds up development. HW-18
chooses the supported combinations from whatever is on record at release.

### Controls, displays and boards

- **Direct controls:** real touch, panel enable and re-enable, LED and status
  response, and widget feedback during playback, on hardware
  ([design, step 10](docs/design/direct-controls-and-output-status.md#10-verify-the-complete-workflows)).
- **On-glass labels:** a captioned screen photographed on a panel; it
  compiled on 7 October 2026
  ([compile record](docs/reports/compile/display-compile-checks.md#captions-and-starts-at-7-october-2026)).
- **HW-11 shared bus:** TFT + SD + touch on one bus with audio playing. The CYD
  cannot host this run (its card is on the second SPI host), so it needs another
  rig. All other HW-11 measurements are recorded, and its budgets are set.
- **HW-12 CYD:** the three generators' touch paths on the unit; onboard RGB LED
  and light-sensor pins.
- **LVGL pool from heap:** on the CYD, a custom screen still starts and free
  heap after `lv_init()` matches the earlier runs, now that ESP32 takes LVGL's
  64 KiB pool from internal heap
  ([compile record](docs/reports/compile/custom-board-compile-checks.md#after-the-lvgl-pool-fix-7-october-2026);
  [bench runs](docs/development/testing/display-budget-bench.md)).
- **XC4630 parallel panel:** on an ESP32-S3 N16R8 the LEDs work but the panel
  has never drawn, so its touch is unjudged. Next step: instrument the
  generated `setup()` with serial markers and read the last one
  ([bring-up](docs/reports/bench/xc4630-bring-up.md#next-step)).
- **Custom boards:** one custom layout compared against its board's documented
  pinout, then representative projects flashed, after the compile in section 1.

### Firmware and show matrix

- **HW-13 firmware/bench matrix:**
  - classic-ESP32 SD provisioning and player, following the
    [SD-show run](docs/release/beta-hardware-validation.md#sd-show-validation-run);
    it also clears the three defects left from the 2026-07-28 run;
  - S3 PSRAM variants;
  - tiled, rotated or custom-XY layouts, and native multi-output;
  - baked audio and collection modulation;
  - FormulaField and FormulaPoints;
  - pattern nodes with compile evidence only: the Fluid solver's C++, and
    Turing Field's pixels against the preview;
  - a real Art-Net controller, and DMX512 over RS-485;
  - long-duration RTC software-clock drift, and DS3231 recovery;
  - Button, Pot, Encoder and PIR, including the encoder's Confirm with a Music
    Player and its detent edge cases
    ([input bench](docs/reports/bench/input-peripheral-bench.md));
  - a HUB75 full support row, streaming, folded/chained/rotated topology, and
    show/player (confirm chain orientation, preview fidelity and panel power
    assumptions).
- **SD Video:** measured card read bandwidth per board, against the 400 KB/s
  estimate ([SD Video limits](docs/design/sd-video.md#limits)).
- **Deploy gate on accreted graphs:** anyone with a graph that uploaded before
  2026-09-11 and is refused now should report it as a gate bug, not rewire the
  graph. Shipped starters are covered by `deployGates.test.ts`.

### Audio

- **HW-19 microphones:** ICS-43434 and Generic MEMS live FFT and beat response,
  against an INMP441 on the same fixture and source.
- **HW-20 audio chain:** each power amplifier (PAM8403, PAM8610, DX-0809) fed by
  a DAC and by the internal DAC. The MAX98357A stereo pair hearing left and
  right separately.
- **SPH0645LM4H:** a classic-ESP32 bench row against an INMP441. Separately,
  a measured capture on an ESP32-S3, which is the one genuine measurement
  gap: no documented timing fix exists for its I2S block, so the S3 is
  refused until one is found.

### Power and outputs

- **D-05 power switch:** the LR7843 switching and dimming a real DC load,
  including the MOSFET temperature at 50% duty; the row's requirements are in
  the support matrix.
- **D-05 Mosfetti:** the MonkMakes Mosfetti's four channels held off through
  setup, switched independently, one dimmed at 1 kHz, with the board total kept
  under 2 A; the row's requirements are in the support matrix.
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
- **D-05 PD trigger:** the ZY12PDN negotiating each voltage it offers from a named
  charger and cable, measured at its output pads before any load is connected; the
  row's requirements are in the support matrix.
- **D-05 controller buck:** a board powered through its 5 V pin from the
  LM2596 at 12 V and at 24 V, output set to 5.0 V first, with the controller
  and its 5 V modules running.
- **D-05 LED rail converter:** a loaded 5 V LED rail powered from the Mean Well
  SD-100A-5 at 12 V and the SD-100B-5 at 24 V, with source current, output
  voltage, case temperature, FG and the isolated-output ground bond recorded.

### Sensors and inputs

- **D-05 light sensor:** the Adafruit BH1750's Lux against a reference meter in
  dim, room and bright light; the row's requirements are in the support matrix.
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
- **D-05 laser distance sensor:** the VL53L0X and VL53L1X (the latter also past
  1.2 m) on 3V3 and the I2C bus, read against a tape measure at two distances,
  with Connected dropping when it is unplugged and recovering; the row's
  requirements are in the support matrix.
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
- **D-05a IR remote:** receiver, remote, board, FQBN and GPIO recorded;
  tap/hold/alternate/unknown/rapid keys in all three build modes; reception
  during long clockless LED `show()` calls
  ([plan](docs/design/ir-remote-controls.md)). The
  [KS0026/S3 partial bench pass](docs/release/beta-support-matrix.md#recorded-validations-that-are-not-yet-full-support-rows)
  confirms learning and remote LED power, including Toggle's separate On/Off
  inputs; the remaining key/repeat/long-run and build-mode checks stay open.

### Network and data links

- **D-05 wired Ethernet:** the WIZ850io on a real network: link-up, DHCP and
  static addressing, Art-Net over the cable, NTP sync, and cable pull/replug
  recovery; the row's requirements are in the support matrix.
- **D-05 DMX transceiver:** the C25B MAX485 module on 5 V, with its RO divider,
  receiving a real DMX512 line; the row's requirements are in the support
  matrix.
- **D-05 pixel data extender:** the NLED TX/RX pair driving a WS2812B run over
  a long twisted A/B/ground cable, with the length recorded, powered from
  separate supplies at each end with bonded grounds.

## 5. Release track (in order)

- [ ] **HW-14 · Independent electrical review (M).** Renamed from "audit". It
  happens *after* components are in the app and appear in the Build Diagram:
  a career electronics engineering lecturer checks that the generated wiring,
  calculations, tables and wording are safe and recommended practice. It
  reviews what exists, so it gates nothing in D-05; hold it until the power
  families v1 will include are in the app, and give families added later a
  follow-up pass. Record findings and corrections against
  [the Build Diagram contract](docs/architecture/build-diagram.md).
  One change to review first: on 2026-09-27 the wire table moved from figures
  of uncertain origin (10 AWG at 65 A) to NEC 310.16 at 90 C, fuse and wire
  are now coordinated, and each supply has a main fuse and trunk
  ([Build Diagram rules](docs/architecture/build-diagram.md)).
- [ ] **HW-17 · Distribution smoke tests (M).** Clean-profile offline-PWA
  relaunch and clean end-user-machine desktop runs; platform signing and
  notarization before publishing: Authenticode for the Windows launcher and
  bundled executables, macOS application layout, hardened runtime and
  notarization, and checksums with a provenance record for every archive.
  Before a macOS package is a release candidate, reconcile the fbuild 2.5.4
  tools it substitutes with the pinned Python dependency and repeat its smoke
  ([desktop distribution](docs/release/desktop-distribution.md#github-package-workflow)).
  Exit: per-platform launch/install, helper discovery, permissions, offline
  and recovery evidence.
- [ ] **HW-18 · v1 scope and format baseline (M).** The pre-1.0 compatibility
  sweep is done ([cleanup record](docs/release/versioning-and-releases.md#pre-v1-cleanup-record));
  new leftovers found later are removed the same way, without migrations.
  *At release:*
  choose the supported combinations from the evidence then on record,
  reconcile release copy, freeze the panel/document/control save format, and
  record limitations and deferments. Repeat the
  [keyboard and screen-reader smoke test](docs/release/accessibility-smoke-test.md)
  on the candidate build, because the recorded pass (2026-07-26) predates the
  workspace tabs and shelves. Follow the
  [release checklist](docs/release/versioning-and-releases.md#release-checklist).
  Never merge `main` and `Hardware`.

## 6. Deferred until after v1

- [ ] **D-01 · Broader control graph.** Time-dependent/nested-group evaluation
  and structured colour/pattern/status bindings in template builds. Wired
  slideshow Master Speed and the Performance Generator's real playback
  Display reading are complete. Preserve the music player's track-position
  clock. Show and player templates still cannot read arbitrary RTC sources.
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
  separate unless user research establishes a better model. Networking beyond
  the ESP32/ESP8266 FQBN gate (NTP and Art-Net on the UNO R4 WiFi), and any
  networking in the show and SD-player generators.
- [ ] **D-04 · Code/field fidelity.** Code-node overflow, persistent globals,
  timing macros/includes/palette/XY support and richer inference; writable
  FieldFormula buffers. VU expansion beyond the current contract (clocked
  strings, unequal lengths, multiple pairs, stereo FFT or streamed audio) needs
  its own protocol/resource design. So do show-side Vibe, Song Structure,
  Pitch Detect and Waveform, which would need per-frame detector output baked
  offline ([audio detectors](docs/design/audio-detectors.md)). Retain explicit
  approximation limits until a concrete use case justifies the work.
- [ ] **D-06 · Pattern and output follow-ons**, from
  [pattern node expansion, Phase 11](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons)
  and its design notes:
  - Colour profile: blocked until the pinned FastLED (3.10.5) gains
    `fl::profiles` and `ChannelOptions::setColorProfile`.
  - Segment networks: strings as the edges of a graph with a travelling
    `Ripple`, the Chromancer model. It needs a layout editor.
  - Positioned strings everywhere: draw them in the main LED Output pane and
    the Build Diagram, and generate the map in Music Player and SD-player
    sketches, which `findShowOutputFormErrors` refuses today.
  - A raw, pre-palette `field` output on `Noise`
    ([ANIMartRIX note](docs/design/animartrix-float-field.md)).
  - One `.h` per pattern in show output, only if flash size or build time
    calls for it ([generative show](docs/design/generative-pattern-show.md)).
- [ ] **D-07 · Workspace information shelves.** Build Diagram's own tidy-up
  (whether its left column becomes the sidebar), then its information shelf;
  then Upload's, if it wants one
  ([workspace shelves](docs/plans/workspace-shelves.md#order)).

- [ ] **fbuild upkeep** ([runbook](docs/runbooks/fbuild-workarounds.md)). On hold
  since 2026-10-08: development compiles on Arduino CLI alone, and fbuild stays
  in the helper untested until the repository matures, which may come before
  v1. Then rerun every fbuild leg and pick these up:
  - Report the RP2040, Renesas and SAMD21 IR failures upstream; all three
    still fail on 2.5.37.
  - Add the upstream note that Windows ESP32 builds need
    `LongPathsEnabled=1`. Every surviving workaround now has an upstream
    issue: §12 LVGL archive length
    ([FastLED/fbuild#1656](https://github.com/FastLED/fbuild/issues/1656)),
    §7 ESP8266 `deploy`
    ([FastLED/fbuild#1657](https://github.com/FastLED/fbuild/issues/1657)) and
    §5 no size summary on a link overflow
    ([FastLED/fbuild#1658](https://github.com/FastLED/fbuild/issues/1658)).
  - Move the four vendored libraries the helper never patches
    (ESP32-audioI2S, esp_dmx, HUB75, ZeroI2S/ZeroDMA) from `lib/` to
    `lib_deps`. FastLED stays vendored until its SAMD51 patches land upstream
    (§1).
  - Compile the IR fbuild legs for RP2040, Renesas and SAMD21 as each one's
    fbuild fix lands.

## Completed

Outcomes are recorded where linked; the per-item narratives up to 2026-09-24
are in the [archived backlog](docs/archive/hardware-todo-to-2026-09-24.md).

- **HW-01–HW-10, HW-15, HW-21–HW-31**: controls and screens, workflow, catalogue
  and helper work.
- **Direct controls and LED output status**: software complete; bench readings
  are in section 4
  ([design](docs/design/direct-controls-and-output-status.md)).
- **HW-11 · Touch/LVGL budget and calibration**: instrument built, five
  runs recorded, budgets set, and guided calibration done on the CYD
  ([bench](docs/development/testing/display-budget-bench.md)). The shared-bus
  run is in section 4.
- **HW-13 · display compile half**: twelve fixtures pass on both engines
  ([compile record](docs/reports/compile/display-compile-checks.md)). The bench
  matrix is in section 4.
- **HW-16 · First-user journey**: a first-time user built and uploaded a
  working sketch within minutes, without guidance (reported 2026-09-24).
  The blocker classes are automated in `deployGates.test.ts`.
- **HW-19 · ICS-43434 and Generic I2S MEMS**: software complete; compiles
  pass on arduino-cli and fbuild.
- **HW-20 phases 2–5**: Option B chain, power amplifiers, the SPH0645LM4H
  (classic ESP32, app-owned capture) and the MAX98357A stereo pair
  ([plan](docs/design/audio-hardware.md#phases)).
- **D-05a · IR remote**: steps 1–13
  ([IR compile checks](docs/reports/compile/ir-compile-checks.md)).
- **D-05 parts, roadmap steps 1–10 and the sensor, control, output and power
  families after them**: LR7843 and Mosfetti power switches, INA219 and
  INA226, MAX485, HLK-LD2410C, BH1750, Grove Touch, WIZ850io, NLED data
  extender, LM2596 and SD-100A/B-5 with main fuses and trunks, BME280,
  DS18B20, HC-SR04, VL53L0X and VL53L1X, KY-023, GY-521, RCWL-0516, MPR121,
  4x4 keypad, PCA9685, ULN2803A, KY-012 and ZY12PDN, each in software and
  compiled where it has firmware
  ([roadmap](docs/plans/hardware-expansion-roadmap.md);
  [compile records](docs/index.md#compile-checks)).
- **Pattern node expansion**: Phases 0–10, and Phase 11's render scale,
  positioned strings, white point and SD Video, all compiled
  ([plan](docs/plans/pattern-node-expansion.md)).
- **App review, 24 September 2026**: all 24 items and the walkthrough's
  layout and repair findings
  ([plan](docs/plans/2026-09-24-app-review.md)), including its level-gate
  compile on 7 October 2026.
- **Workspace shelves**: the preview in all four workspaces and the Hardware
  shelf ([plan](docs/plans/workspace-shelves.md)).
- **Custom boards**: steps 1–8 in software and tests, 2026-10-06
  ([design](docs/design/custom-board-pin-layouts.md)); compiled 2026-10-07,
  the classic-ESP32 SD player after LVGL's pool moved to the heap
  ([compile record](docs/reports/compile/custom-board-compile-checks.md));
  bench is in section 4.
