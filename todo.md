# Hardware → v1.0.0 implementation backlog

Single active checklist for `Hardware`; `main` stays frozen. Restructured
2026-09-24 and reconciled against every document under `docs/` on 2026-10-07.
The full history of every item up to 2026-09-24, with its evidence narrative,
is in [the archived backlog](docs/archive/hardware-todo-to-2026-09-24.md); item
ids are unchanged, so links to "root todo, HW-nn" still name the same work.

## How this list works

- **Sections run in order of progression:** keep expanding hardware, gather
  bench evidence alongside it, then run the release track. Within a
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

## 3. Hardware expansion (ongoing, not a release blocker)

- [x] **D-05 · Hardware expansion.** Candidate families and their shared
  definition of done are in the
  [hardware expansion roadmap](docs/plans/hardware-expansion-roadmap.md),
  which records each finished part. Each part starts with its Blender model,
  ships experimental, and gets its bench row in section 4. Switching power and
  energy families are built like the relay slice: in the app, in the Build
  Diagram, and marked experimental; HW-14 then checks them rather than gating
  them. Battery power is implemented as experimental Build Diagram guidance.
  Its three reference builds remain open bench rows below, and HW-14 still
  owns independent electrical review. No implementation work remains in D-05.

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

## D-02 · Larger UI scope, v1 part

The one-screen budgets these widgets waited on are measured (HW-11), so the
cheaper ones join v1. Each adds to the screen-design save format, so land them
before HW-18 freezes it. The rest of D-02 is in section 6.

- [x] **Shared-document panel interaction.** Two same-size panels can show one
  drawing. Each glass keeps its own touch, Enabled latch and widget values.
  Image bytes are emitted once. An unshared sketch keeps its document-id symbols
  ([large displays](docs/design/large-displays-and-control-routing.md#one-physical-panel-its-own-screen-design)).
- [x] **Choice and Step controls.** Choice Strip (two to six options, outputs
  the chosen index) and Step Control (minus/value/plus, repeats when held),
  built from LVGL buttons and labels
  ([widget ports](docs/reference/displays.md#widget-ports)).
- [x] **Colour Picker and Arc Gauge.** A hue strip with a colour output and
  colour Set, and a ranged arc readout, built from LVGL objects, gradients and
  the existing arc ([widget ports](docs/reference/displays.md#widget-ports)).
- [x] **Marquees.** One line of text that travels continuously, entering on
  the right, at an authored speed, built from an LVGL label moved inside a
  clipping container ([widget ports](docs/reference/displays.md#widget-ports)).
- [x] **Containers and overlap.** Widgets may overlap, drawn in a stacking
  order the designer can change, with touch reaching only controls. A Container
  is a framed panel whose children move, copy and delete with it and are
  clipped to it, built as LVGL child objects
  ([layout](docs/reference/displays.md#layout-and-assets)).

## D-04 · Code-node preview fidelity, v1 part

A pasted FastLED classic such as DemoReel100 moves in the preview as it does
on the board. All three fixes are in the preview's C++-to-JS shim
([code node](docs/design/code-node.md)); the firmware is unchanged.

- [x] **Persistent globals.** The Global section runs once per compile in the
  preview and the loop closes over it, so a counter such as `gHue` keeps its
  value across frames, as the board does.
- [x] **Integer wrap.** Every scalar declared with an 8- or 16-bit type wraps
  to its width on assignment, increment and compound assignment.
- [x] **Timing macros.** `EVERY_N_MILLISECONDS`, `EVERY_N_MILLIS` and
  `EVERY_N_SECONDS` run in the preview on the evaluator's clock, with
  FastLED's re-arm-from-fire-time behaviour.

## D-06 · Pattern and output follow-ons, v1 part

From [pattern node expansion, Phase 11](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons)
and its design notes.

- [x] **Shaped outputs in show and player sketches.** The Music Player and the
  SD player compose into `leds` and copy it through the same ring, corkscrew
  or position map the normal sketch bakes, from one emitter
  (`src/codegen/output/shapeMapCpp.ts`), so the refusal is gone for all three
  forms. The same stage carries a wired matrix's XY table, which both sketches
  had silently skipped, and the SD player now takes a string its length rather
  than the grid defaults.
- [x] **Shapes in the main LED Output pane.** The pane draws a ring, a
  corkscrew and a positioned string where their LEDs are, from the same
  geometry the node preview and the hardware bay use
  (`shapeLayoutFor` in `src/components/Hardware/ledPreviewGeometry.ts`), on a
  canvas sized in LED-pitch cells so the per-LED pixel budget is a matrix's.
- [x] **Raw `field` output on `Noise`.** Already shipped: the node's `Field`
  port carries the noise values before the palette (`src/nodes/generative/`,
  evaluator and firmware alike), so other field nodes can mix, warp or mask
  them before colouring. The [ANIMartRIX note](docs/design/animartrix-float-field.md)
  no longer lists it as deferred.
- [x] **One `.h` per pattern in show output.** The show sketch carries each
  `render_pN()` as a marked block (`src/codegen/sketchBundle.ts`); the helper
  client splits the blocks into `pattern_N.h` files beside the controller
  `.ino`, and the helper writes, caches and prunes them in the sketch
  workspace and the fbuild scaffold for uploads, capacity checks and binary
  exports. View Code and Export .ino keep the one-file form, which is the same
  sketch with the blocks as comments
  ([generative show](docs/design/generative-pattern-show.md#codegen-target)).

## D-08 · Node lock-in before the Help rewrite, v1 part

From the node-by-node audit of 2026-10-13 (per-node detail and every tooltip
draft are in the local, regenerable `tmp/node-audit/` reports; `REPORT.md`
there is the summary). The goal is to freeze node names, property names, types
and layout so the Help node reference is written once. Do the items in order:
the first three change every node at once, the rest narrow down to single
nodes, and the Help rewrite is last because it documents the result.

No firmware compiles while working through D-08. When an item needs one to
prove a sketch builds, add the arduino-cli command to the local
`tmp/node-audit/compiles.ps1` queue (one compile at a time, never in
parallel) and note the item here; the queue is run unattended overnight and
its results are checked before the item is ticked. D-08.1 needed none: its
test holds the sketch from a corrupt save byte-identical to the one from
library defaults.

- [x] **D-08.1 · One NaN guard for every property.** Done: the shared
  pre-pass `resolveNodeNumericProperties` gives preview, firmware and the
  control graph a finite number for every numeric property, with `num()` and
  `floatExpr` keeping a finiteness fallback
  ([graph and nodes](docs/development/patterns/graph-and-nodes.md#node-authoring-and-property-inputs)).
- [x] **D-08.2 · Property row grid.** Done: `.propRow` is a
  `minmax(0, 1fr) 112px 16px` grid, so every control starts and ends on the
  same x and the pin slot is reserved on every row; the node cards draw the
  same grid. At the 240 px node width a label gets 84 px (11 characters);
  D-08.7 gives the nodes whose labels cannot fit their widths
  ([workspace UI](docs/development/patterns/workspace-ui.md#layout-and-input-traps)).
- [x] **D-08.3 · Remove dead properties and stale metadata.** Done: Zones
  `aName`…`dName`, SegmentDisplay `decimals`/`leadingZero` and Board `volts`
  are gone from the definitions, metadata and bundled patterns; the LED
  output's Power and Bench groups, its volts/milliamps/overclock gating and the
  empty `findOutputResourceErrors` seam left from the Board split are deleted;
  `tftLayout`'s options derive from `TRANSPORT_DISPLAY_LAYOUTS`; PaletteBank's
  `palettes` and Transition's `transitionType` are off the generic rows, and
  Transition's `t` is one ungrouped row (the body's scrub slider is gone).
  Pre-1.0, no migration: a save made before this still shows its stale keys as
  raw rows until the node is replaced. No compile needed.
- [x] **D-08.4 · Definition bugs.** Done; the `d084` ESP32-S3 compile passed
  on 2026-10-14 (Game of Life and Blend firmware changed).
  Line's end point defaults to `max_x`, `max_y`, which the scalar-expression
  rules now accept as a matrix-relative default; Math ships `a: 0, b: 0`, and
  changing its operation moves an operand still at the old identity to the
  new one, so Add to Multiply passes a wired input through; Blend passes A
  through in every mode while B is unwired, preview and firmware; HUB75 pins,
  the deploy popup's and wizard's topology flash, the RAM alias check and the
  validation profile all key on `form === 'hub75'` (the hardware catalogue
  makes a panel by `form` alone); Fire `intensity` and Blobs `count` sliders
  match their clamps; firmware Game of Life reseeds after four empty or
  frozen steps, as the preview does; DMX `universe`/`previewPort` and LightInput `maxLux` are
  bounded number fields (`entry: 'number'` on the slider meta); Custom Formula
  has the Code node's editor, its 320 px width and an inline parse error. The
  DFPlayer tooltip was already overridden; a test now holds it. Pre-1.0, no
  migration: a Math saved without A/B still evaluates the identity but shows 0.
- [x] **D-08.5 · Beat response that honours its controls.** Done; the `d085`
  compile passed on 2026-10-14 (the gate's `getBeatConfidence()` and a float
  Kick into a bool Beat). On live audio
  Threshold (default 0.4) now gates FastLED's beat on its confidence, with a
  cooldown of 0.6 of the beat period (250–600 ms), in preview, the sketch and
  the SD player's decoder-fed control sample, which reads Threshold from the
  node and refuses a wire into it; the node reports Threshold and Cooldown.
  Attack, Decay and flux/onset/contrast still act only on a baked show
  envelope, and their tooltips say so. A float wired into a bool port is true
  from 0.5 in the evaluator's `input` and in firmware `boolExpr`/`floatExpr`.
  `energy` shows as `reactivity`, port label Reactivity, on the fifteen
  audio-reactive patterns that carry it (the audit said seventeen; fifteen
  do). Bundled patterns with a Beat Detect, authored while Threshold did
  nothing live, now use 0.4
  ([player, shows and controls](docs/development/patterns/player-shows-and-controls.md#audio-levels)).
- [x] **D-08.6 · Data-type and sanitising sweep.** Done; the `d086` normal
  sketch and `d086show` show controller compiles passed on 2026-10-14. Spiral `arms`, Kaleidoscope `segments`, Circle `radius`,
  Shape `size`, Text `scroll` are sliders; ClockDisplay `durationSec` (to
  99:59:59), RTCInput `startYear` (1970–2099) and the amplifiers' `maxVolume`
  (0–21, now a clamped field in the part panel) are bounded number fields.
  Slider and clamp now name one constant (`generative/limits.ts`,
  `simulations/limits.ts`): Reaction Diffusion 1–20 steps, Flow Field 8–400
  and Starfield 8–300 particles; Path `scale` 0.1–1, Frame Feedback `angle`
  ±45°, the LED output's tiles 1–16. Wired values clamp alike on both sides:
  Particles `rate`/`decay`, Wave Sim `impulse`, Formula Field and Formula
  Points `speed`, Array `falloff`, Flow Field and Game of Life `fade`, Beat
  Flash `decay`, the Boids weights and `visualRange`, the
  colour nodes' CHSV bytes (shared `levelByteCpp` and siblings), the five
  audio-pattern speeds. A wired Poline anchor now builds the palette on the
  board (`_polineStops16`, held to the library by `polineFirmware.test.ts`).
  Thirty-six nodes' same-named number/switch ports are declared property
  inputs, drawn by default (`propertyInputs.test.ts` derives the rule);
  Field Rotate's code fallback for `spin` now matches its default of 30.
  Counter integrates on the shared clock; Time `dt` is measured; Interval no
  longer drifts in firmware; `statefulSignalParity.test.ts` runs Interval,
  Envelope, Counter, Time, Clock and every Trigger variant's firmware against
  the preview frame by frame (`test-utils/cppSnippet.ts`). Button and
  Encoder `pullup` moved to the part panel; part panel fields carry their
  tooltips. An unassigned Button Bank button (pin −1) was only a warning and
  read GPIO0; it is now never pressed, and the warning says it has no GPIO.
  Unchanged on purpose: Gabor Noise is unclamped but identical on both sides.
- [x] **D-08.7 · Labels, groups and widths.** Done, no compile needed (no
  firmware changed). `PROPERTY_LABELS` names every camelCase row on the
  composite, field, show, output, math and input nodes and the Shapes & Text,
  Simulations and Audio-Reactive patterns (Pattern Master `min hold (s)`,
  `max hold (s)`, `fade (s)`; the pool patterns' `lifetime ×`, `ring width ×`,
  `blob size ×`); the audio-reactive `reactivity` label is merged per node so
  a node's own entries no longer replace it. Every node that draws more than
  six rows at its defaults has `PROPERTY_GROUPS` (the seventeen listed plus
  Circle, GradientSampler, BlendColors, DigitalRain, FlowField, SpectraMosaic,
  FluidSim and FractalField), Pattern Master leads with Playback (`volume`,
  `order`) and the LED output with Output (`enabled`, `brightness`), and
  Formula Field has one group per formula. A row the node's mode does not use
  is hidden on every node (it was only the LED output and the power switch);
  a row whose socket is exposed or wired stays, disabled, so the wire keeps
  its handle. `NODE_WIDTH_OVERRIDES` as listed; `SUBCATEGORY_ORDER.math` of
  Math, Logic, Text with every math node tagged; PatternSlideshow after
  Pattern Master in the show order. `propertyLayout.test.ts` holds the label,
  group and sidebar rules; the Music Player card shows `Beat Transitions` in
  full again. Pre-1.0, no migration: nothing saved changed
  ([workspace UI](docs/development/patterns/workspace-ui.md#layout-and-input-traps)).
- [x] **D-08.8 · Tooltips on every property.** Done, no compile needed (no
  firmware changed). Every non-internal property of every `NODE_LIBRARY` node
  has a `propertyDescription`: the audit drafts landed as per-node
  `PROPERTY_DESCRIPTIONS_OVERRIDES` (an existing override was kept; a draft
  that contradicted a slider range was corrected to it), the audio levels,
  `spawnSpread`, `palette` and the `r`/`g`/`b` channels became global
  `PROPERTY_DESCRIPTIONS`, and the body-edited properties the drafts skipped
  (`sourceId`, `buttons`, `controls`, `patternIds`, `transitions`, the Poline
  anchors, Code, Board `profileId`, Power Switch levels) say what their body
  edits. `FORMULA_LANG_HELP` is built from `NODE_FORMULA_VARIABLES`,
  `MATH_FUNCTION_NAMES`, `MATH_CONSTANT_NAMES` and `SHIM_NAMES`, so it lists
  exactly what the sandbox accepts. `nodeLibrary.test.ts` holds the lock-in
  (every property described; every override names a property or input its
  node has)
  ([graph and nodes](docs/development/patterns/graph-and-nodes.md#node-authoring-and-property-inputs)).
- [ ] **D-08.9 · Merges, renames and category moves.** First pass applied
  and compiled on 2026-10-14 (`d086` builds the merged colour nodes; `d0810`
  covers the rest). Merged: Sin, Cos
  and Abs into one Function node (`fn`: sin, cos, abs, sqrt, square, floor,
  round); Mod into Math as `modulo`, plus `average`, so ComplexWave is gone;
  BlendColors into GradientSampler; CHSV into HSVToRGB with a `hueUnits`
  select (degrees or FastLED bytes); Circle into Shape's ellipse; FieldLerp
  into FieldMath's `mix` with a wireable T; Fade into Brightness; XYMapper
  removed. Temperature's `kelvin` is now `warmth`. Pre-1.0, no migration: a
  save holding a merged node shows it as an unknown type until replaced; the
  bundled patterns, live examples and node cards are regenerated. Still to
  decide, then apply in a second pass: Fire into Fire2012 as a style;
  Particles `swarm` into Boids; FractalNoise and GaborNoise as Noise variants;
  Counter and BeatSin into Wave once Wave has offset, unipolar and a Hz/BPM
  unit; DistanceField into ShapeField; SpectrumBars into SpectrumVisualizer.
  Renames: Formula Field (clashes with Field Formula); Fractal (clashes with
  Fractal Noise); TouchInput to Touch Screen; MotionInput to PIR Motion
  Sensor; PowerConverter's "Buck Converter" to "DC-DC Converter";
  TransitionSet to Transition Pool. Moves: Kaleidoscope to Effects; Image and
  SDVideo to a Media subcategory; the portless power and network parts out of
  Inputs into a non-sidebar hardware category. Open questions: Sunrise's
  clock source, Transform's one-way zoom and 0–360 rate, ClockDisplay's
  legacy scalar ports.
- [x] **D-08.10 · Nodes the library lacks.** Both batches built and compiled
  on 2026-10-14 (`d0810` and `d0810show` for the first batch; `d0810b`, every
  second-batch node in one ESP32-S3 sketch, and `d0810ada`, an Adalight
  stream, for the second). First batch:
  Color, Constant, Logic and Expression (`sourceAndLogicNodes.test.ts`).
  Second batch (`libraryGapNodes.test.ts` holds both sides of each): Theater
  Chase, Color Wipe and Breathe (`generative/classics1d.ts`), a Glitter
  overlay (`composite/glitter.ts`), Frame Transform (`composite/
  frameTransform.ts`) and a Blend `mask` input; Gradient Field, Float →
  Field and Field Blur (`field/gradientField.ts`); Frequency Band
  (`audio/frequencyBand.ts`, the 16 EQ bin centres), Stereo Levels, Beat
  Phase (`audio/beatPhase.ts`, wall-clock) and a Level Meter pattern
  (`audioReactive/levelMeter.ts`); Text with a `text` string input drawn at
  run time from one emitted font table (`shared/fontCpp.ts`) and a Palette
  Transform builder; sACN as a third DMX input mode (helper parses either
  protocol on one listener and joins the multicast group; `dmxUsesNetwork`
  replaces every `'Art-Net'` compare), a DDP Input frame source (helper
  listener, `ddpStore`, trust-held like Art-Net) and a DIN (UART) source on
  the MIDI node (`peripherals/midiSource.ts`; Web MIDI stays preview-only);
  the Board's `frameRate` cap (`codegen/loopPacing.ts` paces the normal, show
  and player sketches, `LEDPreview` gates to it), a Frame Stream output (DDP
  or Adalight, `output/frameStream.ts`) and an Analog RGB Strip on three
  LEDC/analogWrite pins. DIN MIDI is drawn on the wiring diagram as the
  Adafruit MIDI FeatherWing (product 4740, H11L1MS). The analog strip is still
  pins-only: it registers its GPIOs in the manifest's pin walk and stays out
  of the wiring diagram until a verified Blender asset lands. Hardware validation of sACN, DDP, DIN MIDI, the
  stream and the analog strip is not recorded; they are experimental
  ([graph and nodes](docs/development/patterns/graph-and-nodes.md)).
- [ ] **D-08.11 · Help node reference rewrite.** Only after D-08.1 to D-08.10:
  one card per node from the frozen definitions, reusing the property
  descriptions and the redrawn node cards, with a live example per node.

## 5. Release track (in order)

- [x] **HW-14 · Independent electrical review (M).** Renamed from "audit". It
  happens *after* components are in the app and appear in the Build Diagram:
  a career electronics engineering lecturer checks that the generated wiring,
  calculations, tables and wording are safe and recommended practice. It
  reviews what exists, so it gates nothing in D-05. Findings and dispositions
  are recorded in
  [the Build Diagram contract](docs/architecture/build-diagram.md#independent-electrical-review).
  - [x] First pass (October 2026, against `main`): no blocking safety issue
    in the fixed-supply WS2812 5 V path. Its one correction, a 5% branch
    voltage-drop allowance instead of 0.4 V, landed on 2026-10-13 as ruleset
    v8. Its wire-table caution was already fixed on 2026-09-27.
  - [x] Second pass (October 2026, against `Hardware` at `5d10f5e7`, ruleset
    v8): main fuse and trunk, the NEC 310.16 transcription, bolt-down fuse
    classes and interrupt ratings, battery packs and protection, buck and
    isolated rail converters, and the PD trigger. No blocking safety issue;
    six non-blocking cautions recorded with dispositions. One tightening
    landed: a battery cell with no usable internal-resistance figure now
    warns that the main-fuse interrupt rating was not checked.
  Any power family added after `5d10f5e7` reopens this item for its own pass
  before it leaves experimental.
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
  part is above the release track; dropped items are listed in
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
  globals, integer wrap and timing macros are in v1, above the release track.
- [ ] **D-06 · Pattern and output follow-ons**, from
  [pattern node expansion, Phase 11](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons)
  and its design notes:
  - Colour profile: blocked until the pinned FastLED (3.10.5) gains
    `fl::profiles` and `ChannelOptions::setColorProfile`.
  - Segment networks: strings as the edges of a graph with a travelling
    `Ripple`, the Chromancer model. It needs a layout editor.
  - Positioned strings in the Build Diagram, which needs positions in
    millimetres rather than canvas units.
  - Shaped outputs in show and player sketches, the main LED Output pane
    drawing, raw `Noise` field output and one `.h` per pattern are in v1,
    above the release track.
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
