# Hardware model

Status: implemented on `Hardware`; microphone, PCM1802 line-in, player-decoder
Audio sources, self-growing button banks, capacitive touch, and 1/2/4/8-channel
relay modules shipped · Owner: app · Updated: 2026-09-27

The current branch models each physical component once and presents it in the
views where it has meaning. The user-facing workflow is in the
[hardware workbench guide](../user/hardware-workbench.md); this note records
the implementation contract.

## One component, two views

- The **hardware workbench** shows the selected board and every attached part.
  It owns physical existence, exact module identity, and wiring assignments.
- The **graph** shows only parts that carry signal. It owns dataflow edges and
  composition-facing properties.

Both views read and update the same root-graph node. Hardware-only nodes are not
rendered on the graph, but remain persisted graph records so validation and
generators have one source of truth.

The app always renders graph and hardware panes together, separated by a
resizable horizontal divider. The lower pane switches between **Hardware** and
**Upload** tabs. Its camera supports pan, zoom, Fit, and anchor preservation
across layout changes.

## Hardware is created from the workbench

Hardware node types are hidden from the Node Library and canvas picker. The
workbench's **Add Hardware** menu is the creation path for:

- signal inputs: I2S MEMS microphone (INMP441, ICS-43434 or generic), PCM1802
  line-in ADC, button, button bank, Grove capacitive touch,
  potentiometer, encoder, PIR motion, HLK-LD2410C radar presence, ambient light,
  INA219 power monitor, and RTC modules;
- switching outputs: 1, 2, 4, and 8-channel active-low 5 V relay modules, the
  opto-isolated LR7843 MOSFET module for DC loads, and the four-channel
  MonkMakes Mosfetti for small DC loads;
- workbench-only fixtures: SD Card and amplifier/DAC modules; and
- LED String, LED Matrix, LED Ring, LED Corkscrew, and HUB75 Panel outputs.

Creation targets the root graph even while the user is editing a pattern group.
The new part receives board-profile starting pins where available. GPIO
allocation respects capability, existing uses, and the selected part option.

Changing boards retargets assignments made by Studio and preserves explicit
user choices. User-selected pins are remembered by part and board so switching
away and back restores the intended wiring.

An LED output with a Frame/show wire is treated as an existing fixture: its
`dataPin` is preserved during board retargeting rather than silently moved to
the new board's starter GPIO. If that retained pin does not match the selected
board's LED starter pins, Graph Health warns the user to confirm the physical
data lead or choose a new pin.

## Which parts appear in the graph

`isHardwareManagedSignalNodeType` defines the parts visible in both views:

- `MicInput`, `LineInput`, `ButtonInput`, `TouchButtonInput`, `ButtonBank`,
  `PotInput`, and `EncoderInput`;
- `MotionInput`, `PresenceInput`, `LightInput` and `PowerMonitorInput`;
- `RTCInput`, `RelayOutput` and `PowerSwitchOutput`; and
- `MatrixOutput` (the implementation type behind all five LED-output forms).

`Board`, `SDCard`, and `Amplifier` are hardware-only. They carry configuration,
not graph data.

`RelayOutput` is a terminal sink whose selected physical module determines its
one to eight boolean channel inputs and matching GPIO assignments. Generated
firmware writes the inactive HIGH level before changing each GPIO to OUTPUT,
preventing an active-low relay click during setup. Relay contact ratings and
mains-voltage warnings remain attached to the exact catalogue part; the app
does not treat switched-load terminals as low-voltage GPIO wiring.

`PdTriggerSource` is the ZY12PDN, a config-only fixture like `PowerConverter`: no
ports, no pins and no firmware. Its `pdTrigger` catalogue block carries the selectable
voltages, a default, and the current and power ratings; the node's `requestedVoltage`
is a string from that list (a select), read by `pdTriggerVoltage`, which returns `null`
for a value the module cannot request. The manifest item is kind `pd-trigger` with the
requested voltage as a fact. The bench draws no run from the board to it, since nothing
on it reaches the board, and the Build Diagram leaves it out of the peripheral rows as
it does the converters. `pdTriggerWarnings` in `electricalPlan.ts` treats it as the one
upstream source the converters share and warns, never blocks, because a trigger may feed
something the plan cannot see: a converter set to a different voltage, more than one
trigger, and a converter input current above the trigger's rating.

`DarlingtonDriverOutput` is the ULN2803A: eight boolean `channel1` to `channel8` inputs
on eight GPIOs (`drive1Pin` to `drive8Pin`), the relay's shape with an active-high
contract. The catalogue's `driverChip` block carries the channel count, the input level
that turns a channel on, the output type and limits, and the package pinout in pin
order, which is also the Build Diagram's pad order. The part is a bare DIP with no
header, so its pad points are the lead tips measured from the render, pins 1 to 9 down
the left edge and 10 to 18 up the right; the diagram draws 1B to 8B and GND and no supply
pad, since COM is the load supply's clamp return rather than a controller rail. Firmware
latches each pin LOW before enabling it so reset does not pulse a load.

`PwmDriverOutput` is the PCA9685 on the board's one `Wire` bus: sixteen float
inputs, `channel0` to `channel15`, each a 0 to 1 level. Its `pwmDriver` catalogue block
carries the channel count, resolution, the offered addresses (0x40 to 0x6F, since 0x70
is the chip's all-call address and the range above is reserved), the oscillator and the
frequency range, so the firmware, the address picker and validation read one source.
The prescale is `round(osc / (4096 * hz)) - 1`, computed in `pwmDriverPrescale`. Firmware
configures the chip on first contact and again after any failed write, retried once a
second while it is absent without stalling the loop, writes only the channels that have
a wire and only when the quantised level changes, and sets the full-off and full-on bits
at the ends so 0 and 1 are true 0% and 100%. Initialization writes ALL_LED_OFF_H before
sleep, clearing retained outputs after a controller-only reboot; unwired channels stay
off even when the chip remains powered. Address validation and bus collision detection
use the same resolver as firmware. Its helper goes in the sketch once, through
`globalLines`, however many drivers there are. The Build Diagram powers VCC from the
logic rail, draws SDA and SCL only, and leaves OE floating (enabled) and V+ undrawn.

`BuzzerOutput` is the smallest terminal sink: one boolean `on` input and one GPIO
(`sigPin`). The catalogue's `buzzer` block carries the type, the pin level that
sounds it, the fixed pitch of an active part and the current it draws; the firmware
reads the level from it, latching the silent level before the pin becomes an output
so reset does not chirp. The KY-012 brings out no supply pad, so
`peripheralPowerPadIndex` reports none and the Build Diagram draws SIG and GND only.
It is generated by the normal sketch generator only, and its preview is the same
no-op the relay has: the browser makes no sound.

`PowerSwitchOutput` is the DC counterpart: MOSFET channels, each with a
boolean `On` input, a 0-1 `Level`, and one GPIO. The selected board decides how
many channels there are, as a relay module's does: the LR7843 has one, the
MonkMakes Mosfetti four. Every channel is active-high, so generated firmware
latches each pin LOW before making it an output, and a HIGH turns that load on.
The load side is described rather than wired: the catalogue's `mosfet` block
(load supply range, continuous current, active level, isolation, flyback
diode, terminal order) travels into the hardware manifest as facts, with the
channel count and each channel's drive. A power switch takes no supply from the
controller, so `peripheralPowerPadIndex` reports no supply pad for it and the
Build Diagram draws GND and the channel inputs only rather than falling back
to pad 0, which is GND on the LR7843.

The first channel keeps the names a one-channel board has always used: `on`,
`level`, `signalPin`. The rest are numbered: `on2`, `level2`, `signal2Pin` and
on (`powerSwitchChannels` in `src/state/peripherals/powerSwitch.ts`). Port labels and
channel rows come from the board's printed letters (`mosfet.channelLabels`),
so the Mosfetti's ports read On A to Level D, its pins A to D, and the
Build Diagram finds each wire's pad by that letter. Everything that draws,
normalises or creates the node asks `partDerivedInputs` for its ports, the
same helper the relay uses. The library declares the other channels'
`Level` ports as `variantInputs`, which lets each Level be a property input
without the library drawing sixteen ports; the node hides the rows of channels
its board does not have, as the LED output does.

The two boards differ in more than channel count:

| | LR7843 | MonkMakes Mosfetti |
| --- | --- | --- |
| Channels | 1, printed PWM | 4, printed A to D |
| Gate drive | optocoupler, from the load supply | the GPIO, directly; 100 k pull-down |
| Isolation | opto-isolated | none: header GND is the load supply's negative |
| Load supply | 6-28 V DC | 3-16 V DC |
| Current | 15 A (module guidance) | 2 A per channel and 2 A in total (one resettable fuse) |
| Flyback diode | none | one per channel |
| PWM | 500 Hz, derived from the gate drive | 1 kHz, from MonkMakes' own examples |

`Level` dims a channel's load with PWM. It is a property input (field default
1), and `src/state/peripherals/powerSwitch.ts` holds the one rule the evaluator and the
emitter both follow, per channel:

- The switch dims only when the module has a catalogued `mosfet.pwmHz` and
  something asks for less than full: a wire on Level, or the field below 1.
  A Level of 1, unwired, emits the original `digitalWrite` firmware unchanged,
  and a switch saved without the field reads it as 1, not 0.
- Nothing wired is off. A wire on `On` gates the load; with `On` unwired, a
  wire on Level alone may run a dimmed load, so a knob can be a dimmer by
  itself. The Level field is not a signal and never turns the load on alone.
- Firmware drives an 8-bit duty through one shim, `flsPwmBegin`/`flsPwmWrite`
  (`src/codegen/powerSwitchCpp.ts`): LEDC on ESP32 (`ledcAttach` on core 3,
  a channel per dimmed switch channel on core 2), `analogWriteFreq` on ESP8266
  and RP2040, `analogWriteFrequency` on Teensy, and AVR's fixed ~490 Hz timer
  PWM. The duty is written only when it changes, because rewriting it every
  frame restarts ESP8266's software waveform.
- Two boards can ask for two frequencies, and some cores cannot give them.
  `powerSwitchPwmPlan` plans every dimmed channel in the sketch at once. On
  ESP32 core 2, LEDC channels share a timer in pairs, and a timer runs at one
  frequency, so each frequency starts on an even channel: an LR7843 at 500 Hz
  takes channel 0, and a Mosfetti's 1 kHz channels start at 2. ESP8266 and
  RP2040 set one frequency for every pin, so the shim is built with the lowest
  any dimmed part asks for. Slower is the safe direction: the LR7843 loses more
  to switching as the frequency rises, while the Mosfetti's GPIO-driven gates
  are indifferent.
- The frequency is the part's, not the app's. The LR7843's gate charges
  through its 4.7 k divider rather than a gate driver, so it switches in tens
  of microseconds; its `pwmHz` of 500 keeps switching loss below conduction
  loss at the module's 15 A guidance. The derivation is in the part's
  `Sources.md` in the asset workspace.
- The preview publishes each channel's share of power as `load`, `load2` and
  on, which the node body draws as one bar per channel; the Build Diagram
  states each channel's drive as `on/off` or `PWM 500 Hz`, prefixed with its
  letter on a lettered board.

A four-channel LR7843-class board with the high-current channels is still
wanted. None found so far has a reliable reference: seller listings disagree
on layout, and the one documented four-channel opto board (FR1205) drives its
gates past 20 V above about 20 V of supply. See the
[hardware expansion roadmap](../plans/hardware-expansion-roadmap.md).

`PowerMonitorInput` measures a DC load through the Adafruit INA219 and
publishes `volts`, `amps` and `watts`. Its electrical contract (shunt ohms,
selectable I2C addresses, bus-voltage and current limits) is the catalogue's
`powerMonitor` block, read by the firmware, the address picker and validation
alike (`src/state/peripherals/powerMonitor.ts`). It joins the board's one `Wire` bus beside
the RTC and any I2C display: its SDA/SCL follow the board's Wire pair on a board
change, and the one-bus check (`i2cBusValidationIssues` in `validateGraph.ts`)
now asks whenever two I2C parts disagree rather than only when a display is
among them. Firmware reads the bus (0x02) and shunt (0x01) registers directly,
with no library and no calibration register: amps are the shunt voltage over the
catalogued shunt, and watts is volts times amps on both sides of the parity
line. A monitor that does not answer reads zero rather than a stale value. The
browser has no sensor, so the node body offers volts and amps sliders across the
part's own range. The board has no regulator and its bus pull-ups tie to VIN, so
the Build Diagram powers it from the logic rail, not from 5 V. It is emitted by
the normal sketch generator only, like the other sensors.

The INA226 module is a second `PowerMonitorInput` part. Its catalogue block says
`device: 'INA226'`, a 2 milliohm shunt, 36 V and 20 A, and sixteen addresses; the
firmware picks its driver by that device name, so a sketch carries the INA219
helper, the INA226 helper, or both, once each, and each node calls its own. The
INA226 scales differ (bus 1.25 mV per bit, shunt 2.5 uV per bit) and its power-up
configuration is rewritten at setup, but the read path is the same two registers
with no calibration. The inspector lists each part's own addresses through
`propertyOptions`, and validation rejects an address the chosen part cannot be
strapped to.

`PresenceInput` reads one HLK-LD2410C radar module at 256000 baud and publishes
`presence`, `moving`, `still`, and detection `distance` in metres. The module
streams without a command, so the board needs only one receive GPIO: sensor TX
to the node's RX pin; sensor RX and OUT remain unwired. Firmware validates all
four header bytes, follows the frame's little-endian length, accepts both basic
and engineering reports, and expires a stale report after one second. One
shared parser owns ESP32 UART1, so validation permits one sensor and refuses a
DMX512 receiver configured on the same UART; DMX may move to UART2 on a board
that provides it. The browser
models the same outputs with moving/still latches and a distance slider across
the catalogued 6 m range. The Build Diagram powers VCC from 5 V and wires the
3.3 V UART TX directly to the ESP32 receive pin. Normal, slideshow, and player
control generators share this reader through `controlInputCpp`.

`TouchButtonInput` is the exact Seeed Grove Touch Sensor (SKU 101020037) built
around a TTP223-BA6. It publishes one `touched` boolean. The fitted board is in
the factory momentary, active-high mode, so firmware configures SIG as plain
`INPUT` and reads HIGH while touched; it must not reuse `ButtonInput`'s optional
internal pull-up because the sensor actively drives the line. The catalogue's
`touchSensor` block owns polarity, mode, 2.0–5.5 V range and 60–220 ms response
range. The Build Diagram powers VCC from 3V3 so SIG remains in the controller's
logic domain, leaves NC unwired, and resolves the photographed touch-face order
as `SIG, NC, VCC, GND` from left to right. Preview, normal, slideshow and player
generators share the same contract; the on-node touch control drives preview.
This hardware input is distinct from a display's `Touch` node, which represents
coordinates from an integrated screen controller rather than a standalone
boolean sensor.

`LightInput` is one node for two modules, chosen by `partId` from
`LIGHT_SENSOR_MODULES` (`src/state/peripherals/lightSensor.ts`). Both publish `level`
(0-1) and `lux`. An LDR is a divider on one ADC pin: `level` is relative
brightness and `lux` stays 0, because a bare divider has no calibration to
illuminance. The Adafruit BH1750 is an I2C part on the shared bus, at 0x23 or
0x5C (ADDR high); the address list and range come from its catalogue
`lightSensor` block. Firmware talks to the chip directly — power on,
continuous high-resolution mode, a two-byte read every 180 ms divided by 1.2 —
and `level` is `lux / maxLux`, clamped. Which pins the node claims and which
fields it shows both follow the module (`lightSensorPinKeys`,
`isPropertyEnabled`), and an address ADDR cannot select is a deploy-blocking
error. The breakout's level shifter pulls the controller side of SDA/SCL up to
VIN, so the Build Diagram powers VIN from 3V3. Normal, slideshow and player
generators all emit it; the latter two through `controlInputCpp`.

`EnvironmentInput` is the Adafruit product-2652 BME280 on the same shared I2C
bus. It publishes `temperature` in °C, `humidity` in percent RH and `pressure`
in hPa, preserving physical units rather than inventing a normalized contract.
Its catalogue `environmentSensor` block owns the two SDO-selected addresses and
all three operating ranges. `environmentSensorCpp.ts` reads the Bosch
calibration registers once per node and applies the published compensation
formulas directly, avoiding a library dependency; a failed transaction zeros
that pass and retries initialization. The browser's three sliders span the
same catalogue ranges. Build Diagram wiring resolves SDA to the board's SDI
pad and SCL to SCK, leaves SDO and CS unwired in I2C mode, and powers VIN from
3V3 so the bus stays in the controller logic domain. Normal, slideshow and
player generators share the same emitter through `controlInputCpp`.

`TouchPadInput` is an MPR121 twelve-electrode capacitive-touch controller on the board
I2C bus. Twelve boolean ports would make the node taller than it is wide, so it publishes
`electrode`, the lowest electrode touched as an index (0 to 11, held after release),
`touched`, `count` and `connected`; a scene or preset picker wants the index. The firmware
resets the chip, accepts it only if CONFIG2 reads its 0x24 reset value, writes Adafruit's
baseline-filter, debounce and auto-configuration values and the touch and release
thresholds, then enables all twelve electrodes and reads the two status bytes each
frame. A missing chip reads as untouched with `connected` false and is retried once a
second. The part carries its address list, electrode count and default thresholds, and the
node's `i2cAddress` joins the shared-bus collision check. The Build Diagram powers Vin from
3V3 and draws only SDA and SCL; IRQ is not needed.

`KeypadInput` is a 4x4 membrane matrix keypad on eight GPIOs. Sixteen boolean
ports would make the node taller than it is wide, so it publishes `key`, the last key
pressed as an index (0 to 15, row by row, in the order printed), and `pressed`, true
while any key is down; a scene or preset picker wants the index. The firmware scans
column by column: rows are `INPUT_PULLUP`, one column at a time is driven LOW and the
others float, and a row that reads LOW is the closed key. Two matching reads accept a
key, which is a debounce of a frame or two at the sketch's rate, and the last key is
held after release. With no diodes in the matrix, two keys down can ghost a third and
only the first found is reported. The keypad is passive, so the Build Diagram draws
neither a supply nor a ground: `peripheralPowerPadIndex` returns null and
`peripheralHasGround` is false for it. Rows request a pin with a pull-up and
columns request `digitalOutput`.

`MotionInput` has two modules, chosen by its `partId`: the HC-SR501 PIR and the
RCWL-0516 microwave radar. Both drive OUT high on movement at 3.3 V, so the node,
preview and firmware are the same and the choice only changes the picture, the
notes and the Build Diagram. The RCWL-0516 prints 3V3 as well as VIN, but 3V3 is its
regulator's output, so `peripheralPowerPadIndex` lands the supply on VIN for a
motion sensor before it falls back to the first power-looking label. Its OUT holds
about two seconds after the last movement; nothing in the graph compensates, so a
design that needs a pulse should edge-detect it.

`MotionVectorInput` is the GY-521 MPU-6050 on the shared I2C bus. It publishes
acceleration in g (`accelX/Y/Z`), rotation rate in degrees per second
(`gyroX/Y/Z`) and `connected`, and holds the last good values when a read fails.
The catalogue `motionVectorSensor` block owns the address list and the full-scale
ranges; the preview sliders and the firmware's count scaling (32768 divided by the
range) both read it, and setup writes the matching full-scale codes so a board
another sketch configured reads the same way. `motionVectorCpp.ts` wakes the chip
(PWR_MGMT_1 with the gyro X PLL as the clock) and reads one 14-byte burst from
ACCEL_XOUT_H: accel, temperature, gyro. The missing sensor is retried once a
second. The address is a property (0x68 or 0x69), validated like the BME280's, and
the default collides with a DS3231 at 0x68, which the shared address check reports.
VCC comes from 3V3 because the board's I2C pull-ups follow it.

`JoystickInput` is the KY-023 thumb stick: two analog axes and a push switch on
three GPIOs. The axes publish -1 to 1 with 0 at rest (not 0-1 like `PotInput`),
because a stick's centre means something, and a `deadzone` property removes the
resting play and rescales the rest so full travel still reaches 1. `joystickAxis`
in `state/peripherals/joystick.ts` and the firmware's `_joyAxis` compute the same thing, from a
slider position and from a 12-bit ADC count. `pressed` reads LOW through
`INPUT_PULLUP`. The module is marked +5V, but it is only two potentiometers and a
switch, so the Build Diagram powers it from 3V3 to keep both axes inside the ADC
range; the catalogue `joystick` block records the pot value and the switch sense.
The axes request `analogInput`, and `swPin` needs a pin with a pull-up, which
GPIO 34 to 39 lack.

`DistanceInput` has two parts. The VL53L0X is the second, an I2C time-of-flight sensor
that follows the `LightInput` precedent of one node with a part-dependent transport: the
catalogue's `distanceSensor.interface` is `I2C`, `distanceSensorTransport` returns `i2c`,
`distanceSensorPinKeys` swaps Trig/Echo for SDA/SCL, and the manifest, pin plans, GPIO
requirements, inspector fields, validation and Build Diagram each read the transport
rather than a list of part ids. The `distanceSensor` block carries the address list and the
30 to 1200 mm window; the trigger pulse and echo level are optional because only a pulse
part has them. Firmware is not library-free: ST's init and calibration sequence is long
and cannot be checked without hardware, so `distanceSensorCpp.ts` drives Pololu's VL53L0X
library (`init`, `startContinuous`, `readRangeContinuousMillimeters`), reads at most
every 60 ms, and re-runs `init` once a second when the sensor is absent. The version is
pinned in `VL53L0X_VERSION` and mirrored by `_VL53L0X_VERSION` in the backend, which
installs it through arduino-cli, vendors it for fbuild, and puts the version in the sketch
hash so a bump rebuilds. A test fails if the two constants drift. The Build Diagram powers
VIN from the logic rail, since the board level-shifts its bus to VIN, and draws no Echo
divider.

The VL53L1X is a third part on the same path. The catalogue's `device` names the chip and
`distanceSensorLibraryInclude` picks `VL53L1X.h` or `VL53L0X.h` from it, so a sketch includes
only the library its sensors need; the show and player compilers read the same function.
The VL53L1X firmware differs from the VL53L0X's because its library does: it sets long
distance mode and a 50 ms budget, then polls `dataReady` and reads with `read(false)` rather
than blocking, accepts a range only when `range_status` is valid, and treats one second without
data as lost. Its `init` checks the model id, so an absent sensor costs no stall. The backend
pins the second library separately (`_VL53L1X_VERSION`, mirrored by `VL53L1X_VERSION`), with
its own install, vendoring, sketch-hash marker and drift test.

The HC-SR04 is the first part: `DistanceInput` on two GPIOs: Trig, requested
as `digitalOutput`, and Echo, requested as `digitalInput`. It publishes
`distance` in millimetres and a `connected` flag; a sensor that hears no echo has
no reading, so a timeout clears `connected` and holds the last good distance
rather than publishing a sentinel. The catalogue `distanceSensor` block owns the
20 to 4000 mm window, the 10 µs trigger and the 5 V Echo level, which the preview
slider and the Build Diagram both read. `distanceSensorCpp.ts` raises Trig, times
Echo with `pulseIn` and converts at 0.1715 mm per microsecond, with no library.
`pulseIn` blocks up to a round trip past 4 m, so a reading is taken at most every
60 ms, the module's own recommended cycle, and held between; a missing sensor then
costs a bounded stall about sixteen times a second instead of one on every frame.
The module runs on 5 V and Echo swings to 5 V, so the Build Diagram powers VCC
from the 5 V rail and reuses the DMX transceiver's receive divider
(`receiveDivider`): a 1 kΩ series resistor and a 2 kΩ shunt bring Echo to 3.33 V
and Echo's controller wire ends on the junction.

`TemperatureInput` is the waterproof DS18B20 probe of Adafruit product 381 on
one GPIO. It publishes `temperature` in °C and a `connected` flag; a bare probe
has no meaningful reading, so a failed read clears `connected` and holds the
last good temperature instead of publishing a sentinel such as -127. The
catalogue `temperatureSensor` block owns the -55 to 125 °C range and the 4.7 kΩ
pull-up, which the preview slider and the Build Diagram both read.
`temperatureSensorCpp.ts` bit-bangs 1-Wire with no library: reset, skip ROM,
convert, then read the scratchpad 800 ms later and check its CRC-8, so a
timing slip drops a reading rather than corrupting one. Each bit slot runs with
interrupts off. Only one probe per pin is supported, which is why skip ROM is
safe; the pin claim rejects a second. The bus is driven low and released, so
the pin request is `digitalOutput` and input-only GPIOs are refused. The three
wires are ordered VCC, GND, DATA so DATA is the last pad: the Build Diagram
draws the pull-up under the probe to its right (`dataPullUp`), crossing neither
supply stub, and ends DATA's controller wire on the resistor junction the way
the DMX transceiver's receive divider does.

`EthernetModule` is a hardware-only part with no ports: a WIZnet WIZ850io
(W5500) that carries Art-Net and NTP over a cable instead of Wi-Fi. It claims
SCLK, MOSI, MISO, SCNn, INTn and RSTn from the general pool, on its own SPI host
where the chip has a second one. See [wired Ethernet](../design/wired-ethernet.md).

Deleting a hardware-managed signal node on the canvas removes its signal edges
but retains the part. Removing it through the workbench deletes the root-graph
record completely. This keeps a canvas edit from silently claiming a physical
part was unplugged.

## Wiring ownership

Clicking a part opens `HardwarePartBody` in a workbench inspector. GPIO fields
use `BoardPinPicker`, which filters by required capability, distinguishes
recommended and caution pins, detects conflicts across root hardware, and
allows an explicit custom GPIO.

`ButtonBank` is the compact graph form for several independent momentary
buttons. Its final hollow output is a UI-only invitation. Connecting that
socket materializes a stable boolean output, copies the destination input's
label (for example **Play / Pause**), allocates a free board-compatible GPIO,
and exposes another empty socket in the same undoable transaction. Disconnecting
the noodle retains the row and its wiring. The graph shows the inherited name,
preview press control, and assigned GPIO; the workbench inspector owns editing
the name, pin, and per-button internal pull-up. Stable row ids keep edges intact
when labels or pins change; removing a row there also removes the noodles fed
by that output. Board retargeting tracks app-assigned and user-owned
pins per row and restores hand wiring when returning to a board.

The workbench draws automatic semantic links between the board and parts. They
confirm attachment; they are not editable graph edges and are not a complete
wiring schematic. The Build Diagram remains responsible for pin-level
connections, level shifting, power distribution, fusing, parts/connection
exports, and print sheets.

## Board ownership

There is exactly one root Board node. It selects an exact physical profile and
owns settings that generated firmware can apply only once:

- master brightness;
- global clockless-chipset overclock;
- global power cap;
- PSRAM policy/mode; and
- serial route.

Board/profile selection and the durable controller policy live with the
project. The selected USB port, build engine, toolchain/core state, and current
readiness remain desk-local deployment state.

### Boards with hardware already on them

Most boards are a controller and nothing else, so the bench model holds: you
add a part, and Studio allocates pins for it. An integrated board breaks that
in one direction only — its panel is soldered to the same PCB, on pins nobody
chose. Allocating for it is not merely unhelpful, it is wrong every time: the
bench notes for the ESP32-2432S028R ("CYD") record every one of its twelve
display pins being typed in by hand before the board would light up.

`src/build/boards/integratedBoardHardware.ts` states what is fitted to which board
profile, and two things read it.

- `graphStore.selectBoardProfile` — the one action board choice goes through;
  `BoardNodeBody` on the Hardware tab owns both its select and the side-by-side
  `BoardPinoutPicker`, Build Diagram having been reduced to reporting the board
  rather than choosing it — materializes the panel and its `TouchInput` when that profile is chosen. It
  is idempotent and adoption-first: a panel it placed earlier, or one the user
  wired to the same fixed pinout themselves, is updated in place rather than
  duplicated. Whether the glass gets a Touch node is the part catalogue's
  answer (`display.touchController`), not a second flag here.
- `pinRetarget`'s `ownedNow` answers with those pins before any other rule, so
  they are claimed — every other part routes around them — and never moved,
  because there is nowhere to move them to. Board-fitted wiring outranks even
  a remembered user choice: there is no choice to remember.

The marker property `integratedBoardProfileId` names the board a panel is
fitted to. Leaving that board does not delete the panel — a screen design or a
wired layout is the user's work — it simply stops being fitted hardware, and
its pins become movable like any other module's. Selecting the board again
re-adopts it through the marker.

A board can also tie a line off-GPIO: the CYD's panel reset is wired to its own
`EN`. That is stated as `NO_PIN` (255), the value the generated firmware
already guards on, and `pinPropertyIsUnwired` in `nodeLibrary.ts` names the
only properties allowed to carry it — exactly the ones a sketch guards. Every
pin claim derives from `collectPinUses`, so exempting it there is what keeps a
tied reset from reading as a part sitting on GPIO 255 and refusing the build
over wiring that does not exist. An OLED drives its reset unconditionally and
therefore has no exemption.

The rest of such a board is a second question: what is left for everything
else. The CYD's package carries no `pinSafetySummary`, so its imported profile
arrived with no `pinSafety` at all and every other part's pins came from the
chip-level table — which on a classic ESP32 starts at GPIO1, this board's
USB-serial TX. `src/build/boards/boardPinSafetyOverrides.ts` supplies that missing
half by hand, the same way `boardI2cDefaults.ts` supplies a bus the manifests
cannot see, and it wins over imported data for the same reason a hand-authored
profile does.

Two things about its shape are worth keeping.

- The reserved half is **derived** from `integratedBoardHardware.ts` rather
  than restated, so a bench rerun that corrects a panel pin corrects the safety
  table with it. A line the board ties off-GPIO carries `NO_PIN` and reserves
  nothing, because no GPIO is involved.
- A pin reserved *for* the fitted panel is not denied *to* it.
  `findExactBoardPinIssues` turns a reserved pin into a build-blocking error,
  so without an exemption every graph on this board reported eleven errors
  about wiring nobody chose and nobody can change. Validation asks
  `integratedPinsFor` — the same question `pinRetarget`'s `ownedNow` asks
  before every other rule — rather than answering it a second way.

The pool that leaves is **GPIO22 and GPIO27**: of the four GPIO pads the board
brings out, GPIO21 drives the fitted panel's backlight and GPIO35 is input-only
on a classic ESP32. Two pads is a small pool, and a graph can ask for one part
too many — a DS3231 takes the board's own I²C bus, which is both of them.

When that happens the app says the board is full, as a count rather than a
fault. `assignPartPins` builds its refusal from the profile's allowlist. Either
the board is full and every spare pad is named with the part holding it, or it
has *n* pads left and the part needs more. A board whose profile states no
allowlist keeps the general "No free GPIO" wording, because a pool read from the
chip table is no claim about which pads exist. On a board change, the part that
cannot be moved keeps the pin it arrived on. `findExactBoardPinIssues` then adds
that the board has no spare pin to move it to, so the named repair is freeing a
pad, not picking another pin. `boardSparePins` answers both.

Still not modelled, and deliberately: this board's onboard microSD slot, RGB
LED, light sensor and speaker amplifier. Their pins are well documented for the
family but have not been measured on the bench unit, and the allowlist already
keeps them out of the allocator's reach — an unmeasured pin is better left
`unknown` than described wrongly.

## LED outputs

One `MatrixOutput` implementation backs five physical forms exposed separately
by **Add Hardware**. Each form has its own display label and renderer:

- LED String;
- LED Matrix;
- LED Ring;
- LED Corkscrew; and
- HUB75 Panel.

The physical form cannot be changed from the signal node. The workbench creates
the object the user owns. Responsibilities are split as follows:

- the workbench inspector owns GPIO assignments and module identity;
- the graph node owns size/count, chipset and colour order where applicable,
  frame fit/crop route, matrix/panel/custom mapping, correction, dithering, and
  supersampling; and
- the Board owns brightness, power, overclock, and memory policy.

The corkscrew form uses an unwrapped-cylinder authoring canvas whose horizontal
axis travels around the cylinder and whose vertical axis travels down its
height. LED count, turns, start angle, winding direction, diameter, and height
produce one shared preview/firmware sample map. Its physical preview draws the
same helical chain front-on with depth cues.

Every output renders in its own shape in the graph and workbench. Clicking a
workbench output also selects the route shown in the side preview. Multi-output
firmware remains one synchronized sketch for one board.

### Long data runs

An LED output's **data link** property says how its one-wire pixel signal
reaches the LEDs. **Direct** is ordinary short wiring. **NLED Pixel Data
Extender** puts a matched transmitter/receiver pair on the route
(`nled-pixel-data-extender-pair`, `src/state/peripherals/pixelDataExtender.ts`). It is a
physical fact only. The generated firmware is identical either way, so the
evaluator and generators need nothing. The manifest records the pair on the
output (`dataLinkPartId`). From that, the Build Diagram draws TX and RX below
the fixture, and the connection and BOM exports route the conditioned data
through TX, the twisted A/B/ground run and RX, then into DIN. The distance and
conductor facts come from the imported part's `pixelDataExtender` block, not
from constants.

The pair carries one asynchronous line. A clocked chipset or a HUB75 ribbon
cannot use it, so `findPixelDataExtenderErrors` blocks deploy and Graph Health
explains it. Clocked and HUB75 outputs normally disable the field. It stays
editable while it names the extender, so a chipset change that made the choice
invalid can be undone from the field itself.

### Converting a 12 V or 24 V source to 5 V

A **Buck Converter** (`PowerConverter`, `src/state/peripherals/powerConverter.ts`) is a
hardware-only bench part, like Ethernet: no ports, no pins, no evaluation. It
names a converter module and the `sourceVoltage` feeding it. The module's role
and ratings (input range, dropout, output, continuous current, efficiency,
isolation) come from the imported part's `powerConverter` block and are never
restated in code. The LM2596 module (`lm2596-buck-module`) is the first, with
the `controller` role.

With one on the bench, the Build Diagram's power plan (`controllerSupply` in
`electricalPlan.ts`) feeds the board's own `power-in` pin from it instead of
USB. Its input fuse and wire are sized for the converter's full rated output,
not an estimated controller load, so a 5 V module added later cannot outgrow
them. The plan blocks a source outside the module's range (input minimum, or
output plus dropout, up to the rated maximum), a board with no `power-in` pin,
a board whose onboard power path is unverified (`pinout-verified`), and a
second controller converter. It says to set an adjustable module's output with
a meter before connecting it, and not to run USB at the same time unless the
board isolates its 5 V pin.

The diagram draws the module in the USB block's place under the board and
joins it to the board by a matching `CTRL 5V` symbol on OUT+ and on the
board's pin, rather than a wire across the board. The module sits in no
peripheral row. See [power conversion and protection](../plans/power-conversion-and-protection.md).

The same hardware-only node also offers the isolated Mean Well SD-100A-5 and
SD-100B-5 with the `led-rail` role. One selected model becomes the type used
for every generated 5 V power zone: feeds are packed only while the converter
retains 20% headroom at a 40 °C enclosure ambient, so a larger installation
gets another converter rather than an overloaded zone. The B model's 20 A
nameplate becomes 17.333 A at that ambient from its imported derating curve;
the A model remains at 18 A.

Each zone keeps the ordinary output main fuse and 5 V trunk, and adds a
source-side fuse and conductor sized from its planned output power, efficiency
and selected source voltage. The Build Diagram and connection export follow
the seven printed terminals: 1 V+ and 2 V- from the source, 3 FG to protective
earth or the enclosure, 4-5 -V bonded to common ground at the distribution
point, and 6-7 +V through the zone's main fuse. Converter outputs are never
paralleled. A controller buck in the same build joins the upstream source
budget; giving it a different source voltage blocks the electrical plan.

## Hardware part identity and rendering

Exact part options drive the label, pin roles, notes, thumbnail, and workbench
render. Board and part assets carry verified dimensions.

An LED part is drawn as its own emitters on bare board, never over a photograph
of itself. A string is a matrix one row high and a VU rail is one column of the
same thing, so one pitch (`WS2812B_PITCH_MM`) gives a run both its length and
its square cells, and `LED_CELL_FILL` answers where the LED sits in a cell once
for every part: the middle of it.

A photograph of real tape used to be drawn under a string and a rail, and it
cost a second geometry everywhere. The light had to come out of the thing in the
picture, so an emitter had to be located within the render — right of centre,
past the current-limiting resistor, about a quarter of the pitch wide against
two thirds of the tape's width — and the rail had to rotate that tile a quarter
turn and swap its axes; the bloom needed a second, wider stack so it landed on
the photographed PCB; and the render's own pitch could not be re-tiled, so a
panel squeezing that 2.6:1 segment into a square cell turned into noise. A drawn
LED lands on drawn board by construction, and all of it is gone. The trade is
that a string is drawn one pitch tall rather than at tape's real 8 mm width: a
run's length already dominates its box, and square cells are what make it read
as the row of LEDs it is.

Every form draws a lit LED as one group holding the package and the bloom around
it, all inheriting a single fill, so a frame costs one attribute write per
emitter and the glow can never drift out of step with the LED. `EMITTER_GLOW` is
that bloom — one soft layer, for every part: a real WS2812B blows its package
out to white and throws its colour about a pitch in every direction, but on a
grid where the next LED is a pitch away anything wider only washes the board
out, and the diffuser above already supplies the dome. It is stacked layers
rather than a blur for the reason the rest of that file avoids filters — the
content changes every frame — and the preview overflows its part's box on
purpose, because light lands past the edge of the board it is mounted on.

Graph nodes use compact thumbnails only. The workbench is the recognition view:
what it owes the user is "this is the module you are holding", not a measurable
ratio between two of them. LED fixtures add live output previews, diffuser
treatment, and sampled light spill.

### Size is compressed, not shared

One millimetre scale across every part spans twenty to one the moment a panel
and a microphone share a bench, and neither framing it allows is usable: fit
the panel and the controller is four pixels wide, size the controller and the
panel is off the stage. Each part is therefore drawn at its own scale, taken
from the cube root of its size (`SCALE_COMPRESSION` in `hardwareLayout.ts`), so
a 320 mm panel reads at roughly one and a half times a 63 mm controller instead
of five times it.

The compression is one factor per part, so no part is distorted — a strip stays
as long and thin as a strip is — and the ordering holds, so a physically larger
part still draws larger. What is given up is the literal ratio, which was never
measurable off a screen and which the bench cannot offer a comparison for
anyway: there is only ever one board on it. Do not reintroduce a single shared
`mmScale`; anything drawn in physical units on a part (an LED pitch, a diffuser
tile) reads that part's own `mmScale` from its `PlacedPart`.

### Runs are sized by their emitters, and drawn broken

A run of repeated emitters — a string, a VU rail — is the one part whose
compressed size is the wrong answer, because the diagonal it is derived from is
dominated by a length that is a fact about how much tape was bought. Compressed
that way, a metre of tape draws a hairline: true to its own aspect and a picture
of nothing. So a run is scaled by its *emitter* instead, and its length is
bounded separately by drawing it **broken** — the mechanical-drawing convention
for a long part shown short: both ends at true pitch, the middle removed, two
strokes across the cut, and the real count in the caption. Breaking cannot
substitute for the emitter scale, because removing emitters does not make the
remaining ones any bigger.

How big that emitter is drawn is not a free choice either. Every WS2812B on the
bench is the same component, so a panel already settles the size of one, and a
run of the same LED takes its scale from that panel rather than from a floor of
its own (`emitterMm` on a part box, matched in `partScale`). Otherwise a string
beside a 32x32 panel drew LEDs three times the panel's and read as a different
component. The floor (`RUN_MIN_EMITTER_BANDS`) remains for the bench that has no
panel to match, and a part built on a different LED — a HUB75 panel's 4 mm pixel
— is deliberately not a match: it is a denser part, and that difference is the
thing worth seeing.

A two-dimensional panel is not broken: its size is bounded and its shape is
information.

`hardwareLayout.ts` owns the cut. The drawn box, the bare board behind it and
the live emitters over it all read that one answer, so the picture and the
geometry cannot drift apart, and a broken run's cells name the emitters they
really are: the LED after the break is LED 59, not the LED that would sit there
had the run been drawn whole. The cut is deliberately independent of the band —
every length in it scales with the band together — so the shrink-to-fit pass
cannot make a run gain or lose emitters as it narrows the bench around it.

The gap is masked into the board layer and the diffuser over it, never into the
part itself: a mask clips its whole subtree and isolates it from the backdrop,
which over the live cells would take the LEDs' bloom with it and leave a lit run
looking printed. The emitters need no mask at all — they are drawn per slot and
simply leave the gap empty — and the two strokes across the cut are a sibling of
the part for the same reason.

### The bench is a bus, not a dataflow column

Parts sit in two rows: everything that feeds the board above it, everything the
board drives below it. Which row a part belongs in is read off the runs rather
than declared, so nothing has to tell the layout what a part is.

Runs between them are orthogonal — down out of a part, along a horizontal lane
in the channel between the rows, and down into the next, turning rounded square
corners. The shape is the one a wiring or network diagram uses, and it is what
lets the bench spread sideways: adding a part widens the arrangement instead of
lengthening a diagonal across it, which puts the pane's spare horizontal space
to use rather than growing a column down the middle of it.

Each run gets a lane of its own rather than sharing a trunk. A network bus draws
one line for many devices because it really is one wire; these are not — every
run is a different pin, and stacking them on one line would say they were
joined. Lanes are ordered left to right, which reads as a fan; crossings still
occur where a wide row fans out of a narrow board, and cannot be removed while
every run leaves the same part.

Labels go on the outside: a part in the upper row labels above itself, one in
the lower row below, so the channel between them is left to the wiring. The
board is the one part wired on both sides, so its label sits beside it.

### Captions hold their size and drop detail

Captions live inside the panned and zoomed world, so left alone they are
multiplied by zoom twice over — dust at a fit-everything view, a billboard when
you close in on a pin. They are counter-scaled to one readable size on screen
instead, and where a part becomes too small to label the detail drops rather
than the type: pin summary first, then the name. The layout reserves slot
height by the same rule, so a dense bench stops paying height for labels it is
never going to draw.

The measurement is the *slot* a part was given, not the part's own render: a
label's problem is its neighbour's label, and the slot is the width it has to
itself. A row therefore also sizes its slots for the labels they will carry, so
a 45 px module with a long pin summary is not placed hard against the next one.

## Upload tab

Deployment tools now live in the lower pane rather than on the LED output node.
The Upload tab contains readiness, the explicit measured-capacity check,
compile/upload/cancel, firmware reuse/export/view, diagnostics, validation
reporting, Stream Receiver/Live Stream, and an embedded Output/Serial console.

The console has filtered and verbose toolchain output plus a serial monitor with
baud selection and connection controls. A compile log therefore stays visible
in the same full-width workbench where the action was started.

## Audio capability and deferred work

The graph now has an `Audio` capability node whose source picker is derived from
attached board hardware. It discovers microphones, PCM1802 line-in ADCs and,
when an SD Card, amplifier, and Music Player define the on-board player workflow,
the player's decoder tap. The picker lists only Microphone, Line Input, and
Audio Decoder, with Microphone as the default. Every choice is
selectable before its Hardware provider exists; the node then stays disabled
and explains how to enable that source. Adding the provider resolves the menu
entry to its concrete hardware label, such as `Microphone - INMP441`. Audio
cables carry the live/recorded/baked signal
payload through FFT, beat, percussion, feature, spectrum, group, preview, and
firmware paths instead of letting analysis nodes read ambient browser state.
`MicInput` and `LineInput` remain concrete Hardware providers for wiring and
code generation but do not appear as signal nodes or carry graph cables.

The selected source names the same role in both environments, not the same
physical device. **Microphone** listens to the computer's microphone in the app
and the attached microphone on hardware. **Audio Decoder** listens to the
in-app music player in preview and the on-device Music Player's decoder tap on
hardware. This keeps preview useful without pretending the browser can sample
an attached controller's peripherals.

Collection shows compile against the player-hosted audio globals. The pinned
ESP32-audioI2S callback queues decoded PCM immediately before I2S/DAC output;
after the write is fed, FastLED's existing Processor derives EQ bands, beat, and
BPM for the compiled patterns. The baked show envelope remains a startup and
decoder-failure fallback rather than the primary on-device analysis source.

For external players whose decoder is not running on the controller, the
ESP32-S3 firmware can capture the player's line-level DAC output through a
PCM1802 breakout. The part owns MCLK, BCLK, LRCLK, and DOUT assignments, exposes
left/right/both channel selection, appears in Build Diagram exports, and feeds
the same FastLED audio processor as the microphone path. It must receive a
line-level output, not a bridge-tied speaker output. Browser preview still uses
the browser/OS audio source because it cannot sample the physical ADC.

A `Storage` capability abstracts the storage providers available to the root
hardware graph: the concrete SD Card workbench part, the controller's onboard
flash, and its USB transfer path. It defaults only when there is one provider;
otherwise the provider is explicit. SD Card remains a concrete workbench-only
part used by the music-synchronised player workflow.

Multi-board graphs and a Raspberry Pi backend remain out of scope. Per-output
native rendering is designed separately in
[`per-output-native-render.md`](per-output-native-render.md).
