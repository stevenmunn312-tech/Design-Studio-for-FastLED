# Hardware expansion roadmap

Status: **candidate roadmap, not an implementation promise** · Owner: app ·
Updated: 2026-10-08

This document records the next physical hardware families that would make
Design Studio more useful for complete LED installations. It deliberately
prioritises parts that improve control, power integrity, monitoring and long
cable runs over collecting arbitrary Arduino breakouts.

Active execution remains in [D-05 of the root todo](../../todo.md). A part
listed here is not supported until its exact module, firmware path and physical
build have passed the normal evidence gates.

## Selection rules

- Add an exact, source-backed module rather than a generic picture standing in
  for incompatible supplier variants.
- Prefer hardware that creates a useful graph signal, safely drives a load, or
  explains a real Build Diagram connection.
- Keep electrical role and graph role separate. A buck converter belongs in
  the power plan; a light sensor belongs in the signal graph; a MOSFET module
  can appear in both because it is a physical switch controlled by a signal.
- Do not claim a board or module as supported from code generation alone.
  Compile evidence and a recorded bench run remain separate requirements.
- Treat mains switching, batteries and high-current distribution as gated work,
  not ordinary catalogue expansion.

## Highest-priority additions

| Priority | Hardware family | Proposed app role | Primary value |
| --- | --- | --- | --- |
| P0 | 1/4/8-channel logic-level N-channel MOSFET modules | `PowerSwitchOutput` | Silent, fast DC LED-power or auxiliary-load switching without mechanical relay wear. The LR7843 (one channel), MonkMakes Mosfetti (four) and YYNMOS-4 LR7843 revision (four, for LED rails) are in; software and compile complete, bench open. |
| P0 | INA219 / INA226 current and voltage monitors | `PowerMonitorInput` | Both are in and experimental: publish volts, amps and watts to the graph and support measured overcurrent warnings; the INA226 reads to 36 V and 20 A. Bench rows open. |
| P0 | MAX485 / SN75176 DMX transceiver module | Exact physical option for `DMXInput` | Completes the existing ESP32 DMX512 firmware path with a real transceiver, pinout and Build Diagram part. |
| P0 | VS1838B / TSOP38238 demodulating IR receiver | `IRRemoteInput` | Remote control of brightness, patterns, transport, relay channels and other graph properties. |
| P0 | LD2410C mmWave presence sensor | `PresenceInput` | Detect stationary occupants that a PIR can miss. |
| P0 | BH1750 digital ambient-light sensor | `LightInput` module option | Calibrated I2C readings and repeatable thresholds instead of raw LDR response. |
| P0 | Seeed Grove Touch Sensor (TTP223-BA6) | `TouchButtonInput` | One inexpensive active-high touch event for toggles, scenes and power control; software and compile complete, bench open. |
| P0 | W5500 Ethernet module | Network hardware fixture | Stable wired Art-Net, NTP and future streaming without depending on Wi-Fi. |
| P0 | Differential pixel-data transmitter/receiver pair | LED-output accessory pair | Reliable addressable-LED data over long cable runs. |
| P0 | LM2596 / MP1584 buck-converter module | Power-conversion fixture | Make 12/24 V supply to 5 V controller/LED conversion explicit in the power plan. |

## Sensors and physical controls

| Hardware family | Proposed app role | Notes |
| --- | --- | --- |
| BME280 temperature, humidity and pressure sensor | `EnvironmentInput` | Three measured outputs from one shared I2C module. |
| DS18B20 waterproof temperature probe | `TemperatureInput` | Useful for outdoor enclosures, heatsinks and power-supply monitoring. Software and compile complete (Adafruit 381 form, 4.7 kΩ pull-up drawn); bench open. |
| VL53L0X / VL53L1X time-of-flight sensor | `DistanceInput` | The VL53L0X and VL53L1X are in and experimental, through the pinned Pololu libraries. Two can share one I2C bus: each gets its own SHDN or XSHUT pin and an address from 0x30 to 0x33, and 0x29 stays free. Bench open. |
| HC-SR04 ultrasonic module | `DistanceInput` | Lower-cost distance sensing with explicit 5 V echo-level handling. In the app and experimental: Trig/Echo on two GPIOs with the Build Diagram's 1 kΩ / 2 kΩ echo divider; bench open. |
| MPU6050 accelerometer and gyroscope | `MotionVectorInput` | Orientation and movement-driven effects for portable installations. In the app and experimental: GY-521 at 0x68 or 0x69, six physical axes in g and degrees per second; bench open. |
| MPR121 12-channel capacitive-touch module | `TouchPadInput` | In the app and experimental as one Electrode index (0 to 11) plus Touched, Count and Connected rather than twelve ports; 0x5A to 0x5D; bench open. |
| KY-023 joystick module | `JoystickInput` | Two signed float axes and one boolean. In the app and experimental: powered from 3V3, dead zone property; bench open. |
| 4×4 matrix keypad | `KeypadInput` | Direct scene, preset and show selection. In the app and experimental as one Key index (0 to 15) plus Pressed rather than sixteen ports; passive, no supply or ground drawn; bench open. |
| RCWL-0516 microwave-motion module | `MotionInput` option | A second inexpensive presence technology beside PIR and mmWave. In the app and experimental as a second `MotionInput` module: VIN from 5 V, OUT 3.3 V; no new firmware; bench open. |
| Rotary encoder with an addressable feedback ring | Encoder plus LED fixture | Combines an existing input idiom with visible state feedback. Waiting for an integrated module: on 2026-10-08 no shop sold one board with both (Adafruit, DFRobot, M5Stack, Seeed and Waveshare sell them separately). Until then, an encoder, a Gauge and an LED Ring output already show a position. |

## Outputs, switching and power infrastructure

| Hardware family | Proposed app role | Notes |
| --- | --- | --- |
| Protected high-side load switch / eFuse module | Protected `PowerSwitchOutput` | Soft start, current limiting and a fault signal are a better LED-rail primitive than a bare relay. |
| Solid-state relay module | `RelayOutput` option, in and experimental: the Seeed Grove 2-channel board, two Omron G3MC-202P phototriacs. Load kind, leakage and isolation are catalogue facts. AC only, active-high, zero-cross, bench open. | Reuses `RelayOutput`. A DC load latches on. VCC is 5 V. |
| PCA9685 16-channel PWM module | `PwmDriverOutput`, in and experimental: sixteen 0 to 1 channels at one shared frequency, 0x40 to 0x6F, V+ not drawn, bench open. Multi-channel PWM output | Useful for analog dimming, indicators and servos; not an addressable-pixel output. |
| ULN2803A driver board | `DarlingtonDriverOutput`, in and experimental: eight active-high channels on eight GPIOs, sink only, bench open. Eight-channel load driver | Low-side driver for relay coils, lamps and small inductive loads with explicit limits. |
| Noctua NF-A4x10 5V PWM fan | `CoolingFanOutput`, in and experimental: a 0 to 1 speed input plus measured RPM and Running outputs, 25 kHz active-high PWM, ESP32-family normal sketch, bench open. | Enables enclosure cooling tied to temperature or power measurements. |
| Piezo buzzer module | `BuzzerOutput` | The KY-012 active buzzer is in and experimental as a boolean Sound sink at a fixed pitch. The KY-006 passive buzzer is in and experimental too: it adds a Pitch input in hertz, played with `tone()`, one per board. Bench open for both. |
| DFPlayer Mini | `DFPlayerOutput`, in and experimental: Play, Next, Previous, Track and Volume over UART, a BUSY Playing output, speaker or line out, ESP32-family normal sketch, bench open. | Plays numbered files from the module's own microSD card. Line Out can feed a power amplifier. |
| USB-C PD trigger module | `PdTriggerSource`, in and experimental as a config-only fixture; the plan checks its requested voltage against the converters; bench open. Power-negotiation fixture | Records the requested source voltage before a downstream converter or load. |

## Additional controller profiles

These should arrive as exact measured boards with pin maps, not only as broad
compile families. Each one is done when its profile is authored from the
maker's documents and the Build Diagram draws its render with every wire on a
measured pad.

- ESP32-C3 SuperMini, Espressif ESP32-C6-DevKitC-1, ESP8266 D1 Mini,
  Raspberry Pi Pico W and Teensy 4.1: done 2026-10-08. The review found the
  Super Mini's rails reversed (copied from an underside pinout) and the D1
  Mini's rails 20.4 mm apart instead of 22.86 mm; both models were corrected
  and re-rendered. The D1 Mini's outline still omits its rounded corners,
  mounting holes and reset notch, and the Pico W and Teensy 4.1 renders put
  their rails about 0.2 mm off true on each side, which the sheet cannot show.
- Arduino Nano ESP32: done 2026-10-08. Modelled from Arduino's datasheet and
  top-view pinout, and built with the core's GPIO pin numbering; its
  [compile fixture](../reports/compile/controller-board-compile-checks.md)
  passes and the bench run is open.
- WT32-ETH01: done 2026-10-09. Modelled from Wireless-Tag's datasheet and
  pinout drawing. Its LAN8720A is a board profile fact that Art-Net and NTP
  use in place of Wi-Fi, and the board has no USB, so it is powered through
  its 5V pin. Its [compile fixture](../reports/compile/controller-board-compile-checks.md)
  passes and the bench run is open.
- QuinLED Dig-Uno: done 2026-10-09. The pre-assembled v3.1 profile draws its
  exact 48.523 x 39.370 mm board and scattered terminal/header pads, fixes
  LED1 and LED2 to the level-shifted GPIO16/GPIO3 outputs, exposes the six
  general inputs plus I2C, and accepts 5-24 V through its fused main terminal.
  It shares the already-covered generic ESP32 build, so it needs no separate
  compile fixture. Its bench run is open.
- QuinLED Dig-Quad: done 2026-10-09. The pre-assembled v3.1 profile draws its
  exact 100.394 x 48.209 mm board, dual high-current input, seven positive and
  seven ground outputs, four level-shifted LED outputs and scattered headers.
  LED1-LED4 are fixed to GPIO16/GPIO3/GPIO1/GPIO4. The board accepts 5-24 V,
  distributes up to 30 A through five ATO fuses with suitable wiring and
  cooling, and shares the already-covered generic ESP32 build. Its bench run
  is open.

## Suggested implementation order

1. Logic-level MOSFET switching, sharing the relay family's boolean-terminal
   behavior while declaring DC load voltage/current limits separately. The
   opto-isolated LR7843 module (`PowerSwitchOutput`) is in and experimental.
   It switches from `On` and dims from `Level` with PWM at the part's 500 Hz;
   the [dimming compile fixtures](../reports/compile/power-switch-compile-checks.md) pass.
   The first multi-channel board is the MonkMakes Mosfetti: four
   GPIO-driven, lettered channels (A to D) for small loads, 3-16 V and 2 A for
   the whole board, with a flyback diode per channel. It is modelled from
   MonkMakes' 1:1 mechanical drawing, the Power Switch's ports and pins now
   follow the selected board as a relay's do, and its
   [compile fixtures](../reports/compile/power-switch-compile-checks.md) pass; the bench run is
   open. The four-channel board for LED rails is the YYNMOS-4's LR7843
   revision (`yynmos-4-lr7843-mosfet-module`, 2026-10-08), modelled from a
   seller listing Steve supplied. Three boards share the YYNMOS-4 name, which
   is why earlier listings disagreed on layout; this one has four IRLR7843s,
   four PC817s and a 78L12 that caps the gate drive near 12 V, avoiding the
   FR1205 board's gate overdrive above about 20 V. The same regulator needs
   about 7 V, so the board takes 7-28 V and cannot switch a 5 V rail. Its
   inputs are separate PWM and GND pairs, so the Build Diagram draws a ground
   on each numbered GND. Its terminal order is inferred from the earlier
   revisions' printed undersides, and its
   [compile fixture](../reports/compile/power-switch-compile-checks.md) passes;
   the bench run, which checks the order first, is open.
2. INA219/INA226 monitoring and a minimal volts/amps/watts signal contract.
   The Adafruit INA219 (`PowerMonitorInput`) is in, experimental, on the
   normal sketch. It also publishes an `Overcurrent` bool, true while the
   measured amps exceed the node's limit (default 2.5 A); the preview and
   firmware agree, and it compiles on classic ESP32 (2026-09-30). The INA226
   module is in too as a second part of the same node (2026-10-01), compiled on
   classic ESP32 and open for a bench row.
3. An exact MAX485-class DMX transceiver and recorded DMX512 bench run.
   The "C25B" MAX485 module (`max485-rs485-module`) is in: modelled, catalogued
   and drawn on the Build Diagram for a DMX512 `DMXInput`, on 5 V with a
   1 k / 2 k divider on RO, and experimental. The bench run is still open.
4. The existing [IR remote-control plan](../design/ir-remote-controls.md).
5. LD2410 presence sensing, followed by BH1750 ambient light. The
   HLK-LD2410C (`PresenceInput`) is now modelled, catalogued, drawn, previewed,
   and generated for ESP32 normal/show/player control paths. All four
   [compile fixtures pass](../reports/compile/presence-sensor-compile-checks.md); the bench run
   remains open, so it stays experimental. The Adafruit BH1750 is now a
   `LightInput` module option: modelled, catalogued, drawn, previewed and
   generated for normal/show/player paths. All five
   [compile fixtures pass](../reports/compile/light-sensor-compile-checks.md); the bench run
   remains open, so it stays experimental.
6. W5500 wired networking. The WIZnet WIZ850io (`EthernetModule`) is now
   modelled from WIZnet's board file, catalogued, drawn and generated for the
   normal sketch, where it carries Art-Net and NTP instead of Wi-Fi. It is
   experimental: its [compile fixtures pass](../reports/compile/ethernet-compile-checks.md),
   and the bench run is still open. See
   [wired Ethernet](../design/wired-ethernet.md).
7. A differential pixel-data pair and long-cable validation. The NLED Pixel
   Data Extender TX/RX pair (`nled-pixel-data-extender-pair`) is in: modelled,
   catalogued, and chosen per LED output through its **data link** property.
   The Build Diagram, connection list and parts list route data through it. It
   adds no firmware, so no compile is owed. It stays experimental until a
   long-cable bench run is recorded. See
   [hardware nodes](../architecture/hardware-model.md#long-data-runs).
8. Buck conversion and protected high-side switching in the Build Diagram
   power model. Complete in software: the LM2596 controller buck, the Mean
   Well SD-100A/B-5 LED rail converters (`PowerConverter`), and main supply
   fuses and trunks. See
   [power conversion and protection](power-conversion-and-protection.md).
9. One-button capacitive touch. The exact Seeed Grove Touch Sensor
   (`TouchButtonInput`) is modelled from its board files and product references,
   catalogued, drawn, previewed and generated for normal/show/player paths. Its
   orientation is locked as `SIG, NC, VCC, GND` left to right when viewed on the
   touch face with the connector holes at the bottom. All four
   [compile fixtures pass](../reports/compile/touch-button-compile-checks.md); the physical bench
   run remains open, so it stays experimental.
10. Environmental sensing. The Adafruit product-2652 BME280
    (`EnvironmentInput`) is now modelled, catalogued, drawn, previewed and
    generated for normal/show/player paths. It publishes compensated
    temperature, relative humidity and pressure from the shared I2C bus at
    0x77 or 0x76. All four
    [compile fixtures pass](../reports/compile/environment-sensor-compile-checks.md); the
    physical bench run remains open, so it stays experimental.
11. Output, layout and media follow-ons from the pattern-node review: a
    half-resolution render scale, positioned string layouts in the manner of
    FastLED's ScreenMap, the colour-profile pipeline and a white point per
    output, SD video through the codec module, and segment-network layouts.
    Ordered and checkboxed as Phase 11 of the
    [pattern node expansion plan](pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons).
12. Enclosure cooling. The exact Noctua NF-A4x10 5V PWM
    (`CoolingFanOutput`) is modelled, catalogued, drawn, previewed and generated
    for the normal ESP32 sketch. Speed drives active-high PWM at 25 kHz. The
    open-collector tachometer reports measured RPM from two pulses per
    revolution. Its [compile fixture](../reports/compile/cooling-fan-compile-checks.md)
    passes on classic ESP32; the bench run remains open, so it stays experimental.
13. A self-contained MP3 player. The DFPlayer Mini (`DFPlayerOutput`) is
    modelled, catalogued, drawn, previewed and generated for the normal ESP32
    sketch. The graph plays a numbered file in the module's `/mp3` folder,
    steps to the next or previous file, and sets the 30 volume steps. Playing
    on the board is the active-low BUSY pin. Speaker mode uses SPK1/SPK2;
    Line Out feeds a power amplifier from DAC_L/DAC_R. Its
    [compile fixture](../reports/compile/dfplayer-compile-checks.md) passes on
    classic ESP32; the bench run remains open, so it stays experimental.
14. An AC solid-state relay. The Seeed Grove 2-Channel Solid State Relay
    (`seeed-grove-2ch-ssr`, a `RelayOutput` option) is modelled, catalogued,
    drawn and generated for the normal ESP32 sketch. Two Omron G3MC-202P
    phototriacs, active-high on CTR1 and CTR2, AC only. The relay catalogue now
    states load kind, leakage and isolation for this board and for the
    mechanical modules. Its
    [compile fixture](../reports/compile/ssr-compile-checks.md) passes on
    classic ESP32; the bench run remains open, so it stays experimental.

## Definition of done for each addition

A hardware family is not complete when its picture appears in the shelf. Each
addition must cover the parts of the product its role actually uses:

1. A source-backed Blender package with editable `.blend`, final transparent
   render, `part.json` and `Sources.md`. External connection headers remain
   unpopulated plated holes by default; onboard configuration jumpers remain
   fitted when that is the reference board's normal state. Every unpopulated
   through-hole is a real hole: the transparent render shows the background
   through it, not a dark disc (`through_holes.py` in the asset workspace
   drills them and checks each one).
2. Catalogue import, exact dimensions, pin labels, voltage/current facts and
   safety notes.
3. Hardware shelf entry, inspector fields, GPIO/bus requirements, pin
   allocation and board-retarget behavior.
4. A graph node only when the part carries a signal. Power-only fixtures remain
   in Hardware and the Build Diagram.
5. Preview/evaluator and firmware parity for every claimed signal or output.
6. Hardware manifest, Build Diagram geometry, connection list and parts list.
7. Graph Health diagnostics for incompatible boards, voltage domains, missing
   support parts and unsafe or incomplete wiring.
8. Help content, generated node-reference assets where applicable, automated
   registry/codegen tests, compile evidence and a recorded physical bench run.

## Families that extend the power model

Battery chargers, cell balancers, battery-management systems, mains SSRs,
contactors and large motor drivers need the power model to represent source
voltage, state of charge, continuous and peak current, protection behavior,
isolation, fusing and enclosure requirements. A render and a pin picker are not
enough to offer installation guidance for them, so extending the power model is
part of implementing each one, not a precondition someone else must meet
first. They ship experimental like any other family. The
[independent electrical review (HW-14)](../../todo.md) then checks the
generated wiring and guidance once they are in the app and the Build Diagram;
it reviews what exists rather than gating development.
