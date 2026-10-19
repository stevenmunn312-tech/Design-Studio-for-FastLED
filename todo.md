# Hardware → v1.0.0 implementation backlog

Single active checklist for `Hardware`; `main` stays frozen. Restructured
2026-09-24 and reconciled against every document under `docs/` on 2026-10-07.
The full history of every item up to 2026-09-24, with its evidence narrative,
is in [the archived backlog](docs/archive/hardware-todo-to-2026-09-24.md); item
ids are unchanged, so links to "root todo, HW-nn" still name the same work.

## How this list works

- **Sections run in order of progression:** finish section 3 before the
  release track, and gather bench evidence while the release track runs;
  section 6 waits until after v1. New parts keep landing
  through the [hardware expansion roadmap](docs/plans/hardware-expansion-roadmap.md),
  each experimental until its bench row in section 4.
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

## 3. Frame performance (before the release track)

A frame costs the time to compute its pixels plus the time to send them with
`FastLED.show()`. A clockless LED takes about 30 µs to send, so a large fixture
runs out of wire time before CPU time. These steps make the Board's frame rate
true, say when the wire is the limit and how to lift it, and then cut
calculation where a measurement shows it pays. Run them in order. A step that
changes firmware closes on the dead-code corpus compile
(`python scripts/compile-fixtures/compile-matrix.py --only dead-code/`); new
hardware behaviour ships experimental and gets its bench row in section 4 when
it lands.

- [ ] **HW-32 · Frame performance (L).** Exit: every generator paces to the
  Board's frame rate and never re-sends past the deadline; Graph Health names
  the frame rate a wire-bound graph can reach and offers the fix; lanes and
  driver choice are compiled and marked experimental; the dead-code corpus
  compiles on Arduino CLI. Bench readings are section 4 rows, not part of the
  exit.
  - [ ] **1. Split render time from send time in device telemetry.** `loopmax`
    covers the whole pass, so a slow frame cannot say whether the pixels or the
    wire cost it. Time each frame's `FastLED.show()` and report the interval's
    worst render and worst send as two new keys, left out when nothing is sent
    through FastLED (HUB75). Define them once in
    `src/state/upload/deviceTelemetry.ts`, emit them from
    `src/codegen/deviceTelemetryCpp.ts` (found from the sketch text, the way
    `withDeviceTelemetry` finds the pacing line), parse them in
    `deviceTelemetryStore.ts` and show them on `DeviceTelemetryCard`. Add both
    to the key table in the
    [display budget bench](docs/development/testing/display-budget-bench.md).
    Every later step is measured with this.
  - [ ] **2. Pace each frame to a deadline and send it once.** The normal, show
    and player sketches end `loop()` with `FastLED.show()` and then
    `FastLED.delay(1000 / frameRate)` (`src/codegen/loopPacing.ts`). FastLED
    3.10.5's `delay` calls `show()` at least once more and keeps re-sending
    until the time is up, so every frame is sent at least twice and the sleep
    is added to the work instead of absorbing it. A display-budget bench run
    recorded 50.0 fps from a 2.0 ms pass under the 60 fps default
    ([bench](docs/development/testing/display-budget-bench.md)), and a
    1,000-LED strip tops out near 16 fps where one send a frame allows about
    33. Wait instead for a fixed next-frame deadline, still emitted at the end
    of the loop so all three generators keep one insertion point, and keep
    FastLED's dither refreshes only while a whole send still fits before the
    deadline. Keep `isLoopPacing`/`plainPacing`, `withDeviceTelemetry`'s pacing
    finder, the show builder's line filter (`showGenerator.ts`) and
    `screenOnlyFastLed.test.ts` in step. Record the trap in
    [firmware generation](docs/development/patterns/firmware-generation.md),
    and make the Board's frame-rate help describe a cap the sketch meets when
    the work fits. Its bench row records fps before and after on a long strip.
  - [ ] **3. Record each board family's LED drivers as facts.** One module keyed
    by `BuildTargetFamily` (`src/build/buildProfile.ts`), with a profile
    override where one family covers different chips (`teensy`), read from the
    pinned FastLED 3.10.5: the default clockless and SPI bus (`DefaultBus` in
    `fl/channels/bus.h`); how many outputs send at once (RMT TX channels from
    the RMT5 driver README: ESP32 8, S3 4, C3, C6 and H2 2; ObjectFLED on
    Teensy 4; one after another where there is no parallel driver); the RMT
    memory a channel takes idle and with a network up; whether the chip has a
    floating-point unit; and each chipset's send time per LED (24 bits at
    800 kHz for most clockless parts, more for RGBW and 16-bit ones; clocked
    parts at FastLED's default rates, APA102 6 MHz, HD108 25 MHz, WS2801
    1 MHz). The estimate, Graph Health and code generation all read it.
    Document it in [board capabilities](docs/architecture/board-capabilities.md).
  - [ ] **4. Estimate the wire time per board and advise when it is the
    limit.** `estimateLedRefreshTime` (`src/utils/validateGraph.ts`) charges
    30 µs for every LED as if all outputs sent one after another, and shows the
    result only as a note on the readiness strip's Pins chip. Use step 3's
    facts instead and compare the result with the Board's frame period. When
    the wire cannot keep up, Graph Health gives advice, never an error: the
    frame rate this graph can reach and the fixes that apply (a lower frame
    rate now; a faster clock, more data pins and a parallel driver as steps
    5–7 land). Show the reachable frame rate on the readiness strip
    (`HardwareReadiness.tsx`). On ESP32-family boards also flag outputs that
    need more RMT memory than the chip has with Wi-Fi or Ethernet up, counting
    the IR receiver's share, because FastLED then shares fewer channels and
    the outputs send in turn.
  - [ ] **5. Set the data rate of clocked chipsets.** APA102, APA102HD, HD108
    and WS2801 outputs always send at FastLED's default clock. Add a data-rate
    setting to the LED output for those chipsets, emitted as the `addLeds`
    data-rate argument from `fastledSetupCpp`
    (`src/codegen/output/ledHardwareCpp.ts`) so every generator gets it, with
    FastLED's own value as the default. Offer only rates the chipset supports,
    say in the help that long APA102 runs lose data at high clock rates, and
    feed the rate to step 4's estimate.
  - [ ] **6. Feed one LED output from several data pins.** A long fixture keeps
    one LED output, one `leds` array and one render, but its chain is split
    into equal lanes, each fed from its own pin by
    `addLeds<...>(leds, offset, count)` from `fastledSetupCpp`, so FastLED sends
    the lanes at once where step 3 says the board can. Preview, XY map, RAM and
    power stay as they are. Every lane pin is a pin claim in
    `findPinConflicts` and the pin pickers; the Build Diagram draws a data wire
    (and a data-extender pair, where one is used) to each lane's first LED;
    the wiring diagnostic lights each lane in turn. Step 4's advice gains a
    **Split across pins** fix that sets the lanes and picks free output pins,
    offering only counts whose boundaries fall on whole rows or panels. Record
    the contract in
    [multi-output routing](docs/architecture/multi-output-routing.md).
  - [ ] **7. Choose the LED driver on the Board.** **Auto**, the default, keeps
    FastLED's choice. Offer the other drivers FastLED 3.10.5 builds for the
    selected family (`fl::Bus`, such as LCD_CLOCKLESS on the S3 and PARLIO on
    the C6; check how the classic ESP32's I2S driver is selected, because
    `Bus::I2S` names the S3 path), emitted as
    `FastLED.setExclusiveDriver<fl::Bus::...>()` before the first `addLeds`.
    Graph Health offers fixes when a parallel driver's lanes differ in chipset
    or timing, and when the driver needs a peripheral already in use: I2S
    audio and the classic ESP32's HUB75 library on I2S, HUB75 and parallel TFT
    panels on the S3's LCD_CAM, and the IR receiver's share of RMT. Suggest a
    parallel driver when an S3 graph needs more lanes than its four RMT
    channels. Compile one fixture per driver and family; its bench row covers
    each driver under Wi-Fi load.
  - [ ] **8. Measure each node's share of the frame.** With telemetry on, time
    each node's block in a normal sketch's loop and report the three costliest
    each interval as a new key, shown by node label on the telemetry card.
    Measure the boards without a floating-point unit that telemetry supports
    (ESP32-C3, ESP32-C6, ESP8266) first; they pay most for float maths. Steps
    10 and 11 are judged against these numbers.
  - [ ] **9. Skip per-pixel geometry that nothing reads.** FieldFormula
    (`src/nodes/field/codegen.ts`) and the Code node
    (`src/nodes/code/codegen.ts`) compute `r` and `angle` (`sqrtf` and
    `atan2f`) for every pixel of every frame even when the formula never names
    them, because the `(void)r;(void)angle;` that silences warnings counts as a
    read in `withoutUnreadLocals` (`src/codegen/cppCleanup.ts`). Teach the pass
    that a bare `(void)name;` is no read and remove it with the declaration, so
    every emitter benefits, and keep `deadCodeCorpus.test.ts` passing.
  - [ ] **10. Render frame-invariant nodes once.** A node whose emitter never
    reads the time, and whose inputs and wired properties come only from such
    nodes, draws the same pixels every frame: a static gradient, mask or shape.
    Track the time dependency per node instead of the sketch-wide `needsT`
    flag (`src/codegen/emitContext.ts`), render those nodes on the first frame
    only, and mark their buffers persistent so scratch sharing and show
    pooling (`scratchSharing.ts`, `renderBuffers.ts`) leave them alone; count
    that RAM in `estimateFirmwareRam`. The preview is unchanged. Take this on
    when step 8 shows such nodes cost a measurable share of a frame.
  - [ ] **11. Use integer maths in the costliest emitters.** Where step 8
    shows one node dominating the frame on a board without a floating-point
    unit, move its inner loop to FastLED's integer helpers (`sin8`/`sin16`,
    `scale8`, `qadd8`, `inoise8`, and the bulk `fadeToBlackBy`,
    `nscale8_video` and `blur2d`) in the preview and the sketch together, one
    path on every board so the two stay identical. Each converted node gets a
    native `g++` parity test like `turingNativeParity.test.ts` and a
    before-and-after reading from step 8.

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
  pinout, then representative projects flashed. The software compile is
  recorded
  ([compile record](docs/reports/compile/custom-board-compile-checks.md)).

- **D-05 Arduino Nano ESP32:** flashed from Studio through its DFU bootloader,
  an LED output on D6 lighting from GPIO9 (proof that the GPIO numbering
  reaches the board), the I2C default on A4/A5, and Serial on the USB port.
  The row's requirements are in the support matrix.
- **D-05 WT32-ETH01:** an Ethernet link, DHCP and static addressing, Art-Net
  over the cable driving an LED output, NTP sync, recovery after a cable pull,
  and an upload through a USB-to-serial adapter. The row's requirements are in
  the support matrix.

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
  - an NTP RTC Clock inside a generative show and an SD-player build, synced
    over Wi-Fi and over the WIZ850io, with the clock read on a panel;
  - Button, Pot, Encoder and PIR, including the encoder's Confirm with a Music
    Player and its detent edge cases
    ([input bench](docs/reports/bench/input-peripheral-bench.md));
  - a HUB75 full support row, streaming, folded/chained/rotated topology, and
    show/player (confirm chain orientation, preview fidelity and panel power
    assumptions).
- **SD Video:** measured card read bandwidth per board, against the 400 KB/s
  estimate ([SD Video limits](docs/design/sd-video.md#limits)).
- **Persistent patterns across a transition:** preview versus LEDs on Trails,
  Frame Feedback, Reaction Diffusion and Fluid across a show transition, now
  that collected patterns pool their scratch buffers. Text-level coverage is
  in `persistentRenderBuffers.test.ts`
  ([compile record](docs/reports/compile/render-buffer-ram-compile-checks.md)).
- **Deploy gate on accreted graphs:** anyone with a graph that uploaded before
  2026-09-11 and is refused now should report it as a gate bug, not rewire the
  graph. Shipped starters are covered by `deployGates.test.ts`.

### Audio

- **D-05 DFPlayer Mini:** a numbered file in `/mp3` starts when Play rises and
  pauses when it falls, Next and Previous step the card, volume follows the
  0 to 1 input across the 30 hardware steps, and BUSY reads low while a file
  is playing. Line Out feeds a power amplifier from DAC_L and DAC_R. The
  row's requirements are in the support matrix.
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

- **D-05 solid-state relay:** the Seeed Grove 2-channel board switching a real
  AC load within 0.1 to 2 A, both channels held off through reset and setup,
  each channel independent, the 1.5 mA off-state leakage observable or measured,
  VCC at 5 V, and a DC load confirmed not to turn off. The row's requirements
  are in the support matrix.
- **D-05 power switch:** the LR7843 switching and dimming a real DC load,
  including the MOSFET temperature at 50% duty; the row's requirements are in
  the support matrix.
- **D-05 Mosfetti:** the MonkMakes Mosfetti's four channels held off through
  setup, switched independently, one dimmed at 1 kHz, with the board total kept
  under 2 A; the row's requirements are in the support matrix.
- **D-05 YYNMOS-4:** the LR7843 revision's terminal order checked on the board
  first (it is inferred from the family's earlier boards), then four channels
  held off through setup, switched independently from 3.3 V GPIOs, one dimmed
  at 500 Hz with the MOSFET temperature at 50% duty, and the gate voltage at the
  lowest supply used; the row's requirements are in the support matrix.
- **D-05 Darlington driver:** the ULN2803A switching a real load from each channel,
  every input held low through reset and setup, with the load supply's ground joined
  to the controller's; the row's requirements are in the support matrix.
- **D-05 PWM driver:** the PCA9685 on the I2C bus, an LED dimmed across the range,
  a channel at exactly 0 and 1, a servo or oscilloscope reading at the chosen
  frequency, and outputs staying off until written; the row's requirements are in the
  support matrix.
- **D-05 buzzers:** the KY-012 sounded from a GPIO, silent through reset and setup,
  sounding while Sound is true and silent when it falls; and the KY-006 the same
  way, plus a pitch sweep following a wired Pitch and its transducer's measured
  DC resistance. The rows' requirements are in the support matrix.
- **D-05 cooling fan:** the Noctua NF-A4x10 5V PWM driven through 0%, 20%, 50%
  and 100% commands, with PWM frequency checked at 25 kHz and reported RPM
  compared with an optical tachometer. Confirm it stops at 0%, starts reliably,
  stays off through reset and setup, and reports a stall when the rotor is held.
  The row's requirements are in the support matrix.
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
- **D-05 1S battery build:** a Samsung INR18650-35E cell with the IP5305T
  boost, charge and protection module powering about ten LEDs. Measure pack
  minimum and full voltage, charge current, 5 V full-white output, protection
  disconnect, fuse operation, temperatures and runtime.
- **D-05 4S 16×16 battery build:** Samsung INR18650-35E cells with the
  HX-4S-F30A BMS, IP2368 charger and DGXBY 20 A buck powering a 16×16 matrix.
  Verify B0 through B4 sense order and the P- return; record charge ceiling,
  low-end dropout, pack current, fuse operation, wire and board temperatures,
  and full-white runtime.
- **D-05 4S 32×32 battery build:** Samsung INR18650-35E cells with the BM3451
  60 A BMS, IP2368 charger and two RCNUN 60 A bucks powering a 32×32 matrix.
  Run uncapped full-white hardware checks and the 30 A FastLED running limit;
  record the same voltages, currents, protection, temperatures and runtime as
  the 16×16 build, with a high-power low-voltage professional reviewing it.

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

- [ ] **D-02 · Rest of the larger UI scope.** Multiple screens and navigation,
  free drawing, charts and histories, XY pad and Launch Pad, text entry, remote
  and phone UI, TFT video, RGB and HDMI panels, size thresholds and density from
  actual capabilities and legibility, and Show Status colour-pattern artwork
  feeding the player-owned 96x96 bake from a Slideshow's collection. The v1
  part shipped; dropped items are listed in
  [auxiliary displays](docs/design/auxiliary-displays.md#deferred-dropped-and-why).

- [ ] **D-03 · Other architecture/authoring.** Multi-board, Raspberry Pi/Linux
  backend, richer timed sequences, pattern weighting/tags, broader library
  sharing and distinct per-input modulation. Keep Collection/engine ownership
  separate unless user research establishes a better model. Networking beyond
  the ESP32/ESP8266 FQBN gate (NTP and Art-Net on the UNO R4 WiFi). Art-Net in
  the show and SD-player generators is an open question, because a show
  already owns its LEDs; NTP in those generators shipped with D-03.
- [ ] **D-04 · Code/field fidelity.** Code-node includes, custom gradient
  palettes, custom XY maps and richer type inference in the preview; writable
  FieldFormula buffers. VU expansion beyond the current contract (clocked
  strings, unequal lengths, multiple pairs, stereo FFT or streamed audio) needs
  its own protocol/resource design. So do show-side Vibe, Song Structure,
  Pitch Detect and Waveform, which would need per-frame detector output baked
  offline ([audio detectors](docs/design/audio-detectors.md)). Retain explicit
  approximation limits until a concrete use case justifies the work. Persistent
  globals, integer wrap and timing macros shipped in v1.
- [ ] **D-06 · Pattern and output follow-ons**, from
  [pattern node expansion, Phase 11](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons)
  and its design notes:
  - Colour profile: blocked until the pinned FastLED (3.10.5) gains
    `fl::profiles` and `ChannelOptions::setColorProfile`.
  - Segment networks: strings as the edges of a graph with a travelling
    `Ripple`, the Chromancer model. It needs a layout editor.
  - Positioned strings in the Build Diagram, which needs positions in
    millimetres rather than canvas units.
- [ ] **D-07 · Build Diagram panel into the shared sidebar.** Build Diagram's
  own left panel already is its information shelf (power, readiness,
  connections, parts, requirements and exports), but it is a separate `<aside>`
  with its own width and hide controls, and the shared sidebar is switched off
  on that workspace. Move it into the shared sidebar host the way Hardware and
  Upload do, so all four workspaces behave alike. The content does not change.
  An Upload information shelf waits for a user asking for one
  ([workspace shelves](docs/plans/workspace-shelves.md#order)).

- [ ] **fbuild upkeep** ([runbook](docs/runbooks/fbuild-workarounds.md)). On hold
  since 2026-10-08: development compiles on Arduino CLI alone, and fbuild stays
  in the helper untested until the repository matures, which may come before
  v1. Then rerun every fbuild leg and pick these up:
  - Every known fbuild problem now has an upstream issue: §12 LVGL archive
    length ([#1656](https://github.com/FastLED/fbuild/issues/1656)), §7
    ESP8266 `deploy` ([#1657](https://github.com/FastLED/fbuild/issues/1657)),
    §5 no size summary on a link overflow
    ([#1658](https://github.com/FastLED/fbuild/issues/1658)), the RP2040,
    Renesas and SAMD21 build failures
    ([#1670](https://github.com/FastLED/fbuild/issues/1670),
    [#1671](https://github.com/FastLED/fbuild/issues/1671),
    [#1672](https://github.com/FastLED/fbuild/issues/1672)) and Windows long
    paths ([#1673](https://github.com/FastLED/fbuild/issues/1673)). Drop each
    workaround as its fix lands.
  - Compile the IR fbuild legs for RP2040, Renesas and SAMD21 as each one's
    fbuild fix lands.
  - The four unpatched vendored libraries stay in `lib/`: on 2.5.37 a GitHub
    `lib_deps` ignores its `#ref`, the HUB75 pin is ignored, esp_dmx 4.1.0
    does not build on IDF 5.5, and every `lib_deps` library is compiled
    whether used or not (§1). Not yet reported upstream; revisit after that.

## Completed

Outcomes are recorded where linked; the per-item narratives up to 2026-09-24
are in the [archived backlog](docs/archive/hardware-todo-to-2026-09-24.md).

- **D-02 · Larger UI scope, v1 part**: shared-document panels, Choice Strip,
  Step Control, Colour Picker, Arc Gauge, Marquee and Containers
  ([widget ports](docs/reference/displays.md#widget-ports)).
- **D-04 · Code-node preview fidelity, v1 part**: persistent globals, integer
  wrap and timing macros in the preview shim
  ([code node](docs/design/code-node.md)).
- **D-05 · Hardware expansion**: no implementation work remains; each part
  is recorded in the [roadmap](docs/plans/hardware-expansion-roadmap.md) and
  its bench row is in section 4.
- **D-06 · Pattern and output follow-ons, v1 part**: shaped outputs in show
  and player sketches, shapes in the LED Output pane, the raw Noise field and
  one `.h` per pattern
  ([pattern node expansion](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons)).
- **D-08 · Node lock-in and the Help node reference rewrite**: NaN guard,
  property grid, dead properties, definition bugs, beat gate, data-type
  sweep, labels and groups, tooltips, merges and new nodes, then a
  hand-written Help page and live example for every node
  ([graph and nodes](docs/development/patterns/graph-and-nodes.md);
  [compile record](docs/reports/compile/pattern-node-compile-checks.md#node-lock-in-d-08-14-october-2026)).
- **D-09 · Dead code in generated firmware**: one pruning pass after all
  three generators, held by `deadCodeCorpus.test.ts` and compiled
  ([firmware generation](docs/development/patterns/firmware-generation.md#dead-code-pruning)).
- **D-10 · Render-buffer RAM**: scratch pooled across collected patterns,
  shared within one graph, and never a persistent terminal aliased to `leds`
  ([compile record](docs/reports/compile/render-buffer-ram-compile-checks.md)).
  The bench row is in section 4.
- **HW-14 · Independent electrical review**: two passes, no blocking safety
  issue ([findings](docs/architecture/build-diagram.md#independent-electrical-review)).
  Any power family added after `5d10f5e7` reopens it for its own pass before
  it leaves experimental.
- **D-01 · Broader control graph**: Interval, Time, Wave, nested groups,
  colour, pattern selection, LED status, wall-clock signal nodes and a wired
  local RTC in show and player builds
  ([control routing](docs/design/large-displays-and-control-routing.md#d-01-implementation);
  [compile checks](docs/reports/compile/control-graph-compile-checks.md)).
- **D-03 · Networking in every firmware output, v1 part**: an NTP RTC Clock
  in the generative-show and SD-player sketches brings up the same Wi-Fi or
  wired Ethernet connection the normal sketch uses, through one shared
  emitter, and the control graph's NTP refusal is lifted
  ([RTC design](docs/design/rtc-clock-and-schedule.md#time-sources-software-clock-optional-ntp-or-a-ds3231);
  [compile checks](docs/reports/compile/control-graph-compile-checks.md)).
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
  DS18B20, HC-SR04, VL53L0X and VL53L1X (including two on one bus, each with its
  own SHDN or XSHUT pin and an address from 0x30 to 0x33), KY-023, GY-521, RCWL-0516, MPR121,
  4x4 keypad, PCA9685, ULN2803A, KY-012, KY-006, ZY12PDN, the YYNMOS-4
  (LR7843 revision) and the Noctua NF-A4x10 5V PWM cooling fan, each in software
  and compiled where it has firmware
  ([roadmap](docs/plans/hardware-expansion-roadmap.md);
  [compile records](docs/index.md#compile-checks)).
- **Controller profiles**: the ESP32-C3 Super Mini, ESP32-C6-DevKitC-1, D1 Mini,
  Pico W, Teensy 4.1 and Arduino Nano ESP32 are authored and drawn on their
  measured pads, 2026-10-08; the Super Mini's reversed rails and the D1 Mini's
  rail spacing were corrected in their models, and the Nano ESP32 is modelled
  and compiled. The WT32-ETH01 followed on 2026-10-09 with its LAN8720A
  Ethernet as a board profile fact and power through its 5V pin. The QuinLED
  Dig-Uno v3.1 followed that day with its exact terminal and header map, fixed
  level-shifted GPIO16/GPIO3 LED outputs, and 5-24 V fused input; it shares the
  existing generic ESP32 compile target
  ([compile record](docs/reports/compile/controller-board-compile-checks.md))
  ([roadmap](docs/plans/hardware-expansion-roadmap.md#additional-controller-profiles)).
  The QuinLED Dig-Quad v3.1 completed the exact-controller batch on 2026-10-09
  with its 100.394 x 48.209 mm model, dual high-current input, five fused power
  groups, seven positive and seven ground outputs, and level-shifted LED1-LED4
  on GPIO16/GPIO3/GPIO1/GPIO4.
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