# Hardware expansion roadmap

Status: **candidate roadmap, not an implementation promise** · Owner: app ·
Updated: 2026-09-21

This document records the next physical hardware families that would make
Design Studio more useful for complete LED installations. It deliberately
prioritises parts that improve control, power integrity, monitoring and long
cable runs over collecting arbitrary Arduino breakouts.

Active execution remains in [D-05 of the root todo](../../../todo.md). A part
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
| P0 | 1/4/8-channel logic-level N-channel MOSFET modules | `PowerSwitchOutput` | Silent, fast DC LED-power or auxiliary-load switching without mechanical relay wear. |
| P0 | INA219 / INA226 current and voltage monitors | `PowerMonitorInput` | Publish volts, amps and watts to the graph and support measured overcurrent warnings. |
| P0 | MAX485 / SN75176 DMX transceiver module | Exact physical option for `DMXInput` | Completes the existing ESP32 DMX512 firmware path with a real transceiver, pinout and Build Diagram part. |
| P0 | VS1838B / TSOP38238 demodulating IR receiver | `IRRemoteInput` | Remote control of brightness, patterns, transport, relay channels and other graph properties. |
| P0 | LD2410C mmWave presence sensor | `PresenceInput` | Detect stationary occupants that a PIR can miss. |
| P0 | BH1750 digital ambient-light sensor | `LightInput` module option | Calibrated I2C readings and repeatable thresholds instead of raw LDR response. |
| P0 | TTP223 capacitive-touch module | `TouchButtonInput` | One inexpensive touch event for toggles, scenes and power control. |
| P0 | W5500 Ethernet module | Network hardware fixture | Stable wired Art-Net, NTP and future streaming without depending on Wi-Fi. |
| P0 | Differential pixel-data transmitter/receiver pair | LED-output accessory pair | Reliable addressable-LED data over long cable runs. |
| P0 | LM2596 / MP1584 buck-converter module | Power-conversion fixture | Make 12/24 V supply to 5 V controller/LED conversion explicit in the power plan. |

## Sensors and physical controls

| Hardware family | Proposed app role | Notes |
| --- | --- | --- |
| BME280 temperature, humidity and pressure sensor | `EnvironmentInput` | Three measured outputs from one shared I2C module. |
| DS18B20 waterproof temperature probe | `TemperatureInput` | Useful for outdoor enclosures, heatsinks and power-supply monitoring. |
| VL53L0X / VL53L1X time-of-flight sensor | `DistanceInput` | Compact I2C proximity and interaction input. |
| HC-SR04 ultrasonic module | `DistanceInput` option | Lower-cost distance sensing with explicit 5 V echo-level handling. |
| MPU6050 accelerometer and gyroscope | `MotionVectorInput` | Orientation and movement-driven effects for portable installations. |
| MPR121 12-channel capacitive-touch module | Dynamic multi-touch input | Named, stable touch outputs using the same dynamic-port discipline as Button Bank. |
| KY-023 joystick module | Two-axis control plus button | Maps naturally to two float signals and one boolean signal. |
| 4×4 matrix keypad | Dynamic key outputs | Direct scene, preset and show selection. |
| RCWL-0516 microwave-motion module | `MotionInput` option | A second inexpensive presence technology beside PIR and mmWave. |
| Rotary encoder with an addressable feedback ring | Encoder plus LED fixture | Combines an existing input idiom with visible state feedback. |

## Outputs, switching and power infrastructure

| Hardware family | Proposed app role | Notes |
| --- | --- | --- |
| Protected high-side load switch / eFuse module | Protected `PowerSwitchOutput` | Soft start, current limiting and a fault signal are a better LED-rail primitive than a bare relay. |
| Solid-state relay module | `RelayOutput` option or separate switch type | Only after AC/DC load type, leakage and isolation are represented honestly. |
| PCA9685 16-channel PWM module | Multi-channel PWM output | Useful for analog dimming, indicators and servos; not an addressable-pixel output. |
| ULN2803A driver board | Eight-channel load driver | Low-side driver for relay coils, lamps and small inductive loads with explicit limits. |
| Fan module with tachometer | Cooling output plus speed input | Enables enclosure cooling tied to temperature or power measurements. |
| Piezo buzzer module | Alert/status output | Small audible warnings for faults, timers and interaction feedback. |
| DFPlayer Mini | Player hardware integration | The verified Blender asset already exists; graph control, firmware ownership and audio routing remain to be integrated. |
| USB-C PD trigger module | Power-negotiation fixture | Records the requested source voltage before a downstream converter or load. |

## Additional controller profiles

These should arrive as exact measured boards with pin maps, not only as broad
compile families:

- ESP32-C3 SuperMini;
- Espressif ESP32-C6-DevKitC-1;
- ESP8266 D1 Mini;
- Raspberry Pi Pico W / RP2040;
- Teensy 4.1;
- Arduino Nano ESP32;
- WT32-ETH01; and
- QuinLED Dig-Uno and Dig-Quad.

## Suggested implementation order

1. Logic-level MOSFET switching, sharing the relay family's boolean-terminal
   behavior while declaring DC load voltage/current limits separately. The
   opto-isolated LR7843 module (`PowerSwitchOutput`) is in, on/off only and
   experimental; PWM dimming and multi-channel boards are still open.
2. INA219/INA226 monitoring and a minimal volts/amps/watts signal contract.
   The Adafruit INA219 (`PowerMonitorInput`) is in, experimental, on the
   normal sketch; the INA226 and overcurrent warnings built on the readings are
   still open.
3. An exact MAX485-class DMX transceiver and recorded DMX512 bench run.
   The "C25B" MAX485 module (`max485-rs485-module`) is in: modelled, catalogued
   and drawn on the Build Diagram for a DMX512 `DMXInput`, on 5 V with a
   1 k / 2 k divider on RO, and experimental. The bench run is still open.
4. The existing [IR remote-control plan](ir-remote-controls.md).
5. LD2410 presence sensing, followed by BH1750 ambient light. The
   HLK-LD2410C (`PresenceInput`) is now modelled, catalogued, drawn, previewed,
   and generated for ESP32 normal/show/player control paths. All four
   [compile fixtures pass](../presence-sensor-compile-checks.md); the bench run
   remains open, so it stays experimental. The Adafruit BH1750 is now a
   `LightInput` module option: modelled, catalogued, drawn, previewed and
   generated for normal/show/player paths. All five
   [compile fixtures pass](../light-sensor-compile-checks.md); the bench run
   remains open, so it stays experimental.
6. W5500 wired networking. The WIZnet WIZ850io (`EthernetModule`) is now
   modelled from WIZnet's board file, catalogued, drawn and generated for the
   normal sketch, where it carries Art-Net and NTP instead of Wi-Fi. It is
   experimental: its [compile fixtures pass](../ethernet-compile-checks.md),
   and the bench run is still open. See
   [wired Ethernet](../design/wired-ethernet.md).
7. A differential pixel-data pair and long-cable validation. The NLED Pixel
   Data Extender TX/RX pair (`nled-pixel-data-extender-pair`) is in: modelled,
   catalogued, and chosen per LED output through its **data link** property.
   The Build Diagram, connection list and parts list route data through it. It
   adds no firmware, so no compile is owed. It stays experimental until a
   long-cable bench run is recorded. See
   [hardware nodes](../design/hardware-nodes.md#long-data-runs).
8. Buck conversion and protected high-side switching in the Build Diagram
   power model.

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
[independent electrical review (HW-14)](../../../todo.md) then checks the
generated wiring and guidance once they are in the app and the Build Diagram;
it reviews what exists rather than gating development.
