# Bench and community testing backlog

Moved out of the [root todo](../../todo.md) on 2026-11-12, when that list was
cut down to the steps that release v1. None of these rows holds up the
release: they are gathered in parallel, and
[HW-18](../../todo.md#6-hw-18--v1-scope-and-format-baseline) chooses the
supported combinations from whatever is on record then.

Hardware nobody here owns is not a blocker. A feature ships marked
**experimental** in the [support matrix](../release/beta-support-matrix.md) and
graduates when a dated bench row lands, from the maintainer or from community
testing. A bench gate may hold back implementation only where the facts cannot
be known without measuring, such as the controller or pinout of an unbranded
clone board. New parts keep landing through the
[hardware expansion roadmap](hardware-expansion-roadmap.md), each experimental
until its row here. Remove an entry once its outcome is recorded in a report
and the support matrix.

Each entry is a support-matrix row waiting for evidence. The feature is already
in the app and marked experimental; nothing here holds up development. HW-18
chooses the supported combinations from whatever is on record at release.

## Controls, displays and boards

- **Direct controls:** real touch, panel enable and re-enable, LED and status
  response, and widget feedback during playback, on hardware
  ([design, step 10](../design/direct-controls-and-output-status.md#10-verify-the-complete-workflows)).
- **On-glass labels:** a captioned screen photographed on a panel; it
  compiled on 7 October 2026
  ([compile record](../reports/compile/display-compile-checks.md#captions-and-starts-at-7-october-2026)).
- **HW-11 shared bus:** TFT + SD + touch on one bus with audio playing. The CYD
  cannot host this run (its card is on the second SPI host), so it needs another
  rig. All other HW-11 measurements are recorded, and its budgets are set.
- **LVGL pool from heap:** on the CYD, a custom screen still starts and free
  heap after `lv_init()` matches the earlier runs, now that ESP32 takes LVGL's
  64 KiB pool from internal heap
  ([compile record](../reports/compile/custom-board-compile-checks.md#after-the-lvgl-pool-fix-7-october-2026);
  [bench runs](../development/testing/display-budget-bench.md)).
- **XC4630 parallel panel:** on an ESP32-S3 N16R8 the LEDs work but the panel
  has never drawn, so its touch is unjudged. Next step: instrument the
  generated `setup()` with serial markers and read the last one
  ([bring-up](../reports/bench/xc4630-bring-up.md#next-step)).
- **D-02 screens and widgets:** on a touch panel, a design with two screens
  moved by a Go to screen button and by a wired Screen input; a Text Entry typed
  on the keyboard and its text reaching a Text; a Chart filling at its interval
  and a Spectrum following a microphone; Show Status picturing the slideshow's
  pattern. All compile only at the v1 freeze
  ([custom screens](../development/patterns/custom-screens.md)).
- **D-02 Web Remote:** the phone page on an ESP32 and an ESP8266 on a real
  Wi-Fi network, reached by its `.local` name, every control type driving the
  LEDs, a held button released by the timeout, and a reconnect after Wi-Fi drops
  ([design](../design/web-remote.md)). Part done 2026-11-11 on a LOLIN D1
  mini (FastLED 3.10.9, built by arduino-cli): the page loaded at
  `fastled-board.local` in desktop Chrome, showed live, and its Speed and Count
  sliders drove a Juggle on 9 LEDs. Still to do: a phone, an ESP32, the other
  control types, the held-button timeout and the reconnect.
- **Custom boards:** one custom layout compared against its board's documented
  pinout, then representative projects flashed. The software compile is
  recorded
  ([compile record](../reports/compile/custom-board-compile-checks.md)).

- **D-05 Arduino Nano ESP32:** flashed from Studio through its DFU bootloader,
  an LED output on D6 lighting from GPIO9 (proof that the GPIO numbering
  reaches the board), the I2C default on A4/A5, and Serial on the USB port.
  The row's requirements are in the support matrix.
- **D-05 WT32-ETH01:** an Ethernet link, DHCP and static addressing, Art-Net
  over the cable driving an LED output, NTP sync, recovery after a cable pull,
  and an upload through a USB-to-serial adapter. The row's requirements are in
  the support matrix.

## Firmware and show matrix

- **FastLED 3.10.9 on real boards:** it compiles on every family
  ([record](../runbooks/fbuild-workarounds.md#fastled-3109-and-fbuild-2551-run-10-november-2026)),
  and nothing has run on it yet. On an ESP32 with Arduino core 3.3.2 to
  3.3.12 FastLED replaces the core's `app_main`/`loopTask`, so watch boot,
  USB serial and the loop watchdog; `-DFL_ESP32_STOCK_ARDUINO_MAIN=1` in
  `_FASTLED_BUILD_FLAGS` restores the stock startup. On an ESP8266, check
  that `addLeds()` on GPIO12 no longer hangs and the `D1`-style pin
  constants work. On a SAMD51, the microphone and LEDs now build with
  hardware SPI enabled and no library patch, unproven on a board.
- **HW-13 firmware/bench matrix:**
  - classic-ESP32 SD provisioning and player, following the
    [SD-show run](../release/beta-hardware-validation.md#sd-show-validation-run);
    it also clears the three defects left from the 2026-07-28 run;
  - S3 PSRAM variants;
  - tiled, rotated or custom-XY layouts, and native multi-output;
  - baked audio and collection modulation;
  - GeometryField and FormulaPoints;
  - pattern nodes with compile evidence only: the Fluid solver's C++, and
    Turing Field's pixels against the preview;
  - a real Art-Net controller, and DMX512 over RS-485;
  - long-duration RTC software-clock drift, and DS3231 recovery;
  - an NTP RTC Clock inside a generative show and an SD-player build, synced
    over Wi-Fi and over the WIZ850io, with the clock read on a panel;
  - Button, Pot, Encoder and PIR, including the encoder's Confirm with a Music
    Player and its detent edge cases
    ([input bench](../reports/bench/input-peripheral-bench.md));
  - a HUB75 full support row, streaming, folded/chained/rotated topology, and
    show/player (confirm chain orientation, preview fidelity and panel power
    assumptions).
- **SD Video:** measured card read bandwidth per board, against the 400 KB/s
  estimate ([SD Video limits](../design/sd-video.md#limits)).
- **Persistent patterns across a transition:** preview versus LEDs on Trails,
  Frame Feedback, Reaction Diffusion and Fluid across a show transition, for
  both entry policies. Restart clears that state as the incoming transition
  starts. Resume keeps it, and the preview holds it while the pattern is away.
  Text-level coverage is in `persistentRenderBuffers.test.ts` and
  `entryReset.test.ts`
  ([compile record](../reports/compile/render-buffer-ram-compile-checks.md)).
- **HW-32 frame performance**, each experimental in the
  [support matrix](../release/beta-support-matrix.md):
  - deadline pacing: fps and `renderms`/`sendms` before and after on a strip
    of 500 LEDs or more at the 60 fps default, against the readiness strip's
    reachable frame rate;
  - **Split across pins**: two and four lanes sending at once on a classic
    ESP32 and an S3, with the wiring diagnostic lighting each lane in turn;
  - each offered LED driver (classic ESP32 I2S, S3 LCD_CLOCKLESS and I2S, C6
    and H2 RMT) driving three outputs with Wi-Fi up;
  - an APA102 run at a raised data rate, and where its length starts to lose
    data;
  - node shares on an ESP32-C3 and an ESP32-C6
    ([node-share bench](../reports/bench/node-share-bench.md#not-yet-measured)).
- **D-12 integer kernels:** the after-reading of every converted node on the
  ESP8266 node-share bench, each under 10 ms a 256-pixel frame, and FastLED's
  own `inoise8` checked against the sketch's copy on the device
  ([node-share bench](../reports/bench/node-share-bench.md#converted-for-d-12)).
- **Deploy gate on accreted graphs:** anyone with a graph that uploaded before
  2026-09-11 and is refused now should report it as a gate bug, not rewire the
  graph. Shipped starters are covered by `deployGates.test.ts`.

## Audio

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

## Power and outputs

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

## Sensors and inputs

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
  ([plan](../design/ir-remote-controls.md)). The
  [KS0026/S3 partial bench pass](../release/beta-support-matrix.md#recorded-validations-that-are-not-yet-full-support-rows)
  confirms learning and remote LED power, including Toggle's separate On/Off
  inputs; the remaining key/repeat/long-run and build-mode checks stay open.

## Network and data links

- **D-03 multi-board sync:** two ESP32 boards on one Wi-Fi network, the
  primary leading, running the same pattern and then the same collection
  show: the follower's clock offset settles and the two stay on one pattern
  through transitions, and the follower resumes its own picks five seconds
  after the leader is unplugged. Compile both partitions first; no
  multi-board sketch has compiled yet.
- **D-03 UNO R4 WiFi networking:** NTP sync and Art-Net receive through
  WiFiS3 on an Arduino UNO R4 WiFi: first compile on arduino-cli (the
  `ARDUINO_UNOWIFIR4` define, `WiFiS3.h`, `setHostname` and the
  DNS-second `config` order are assumed from the core), then an NTP-synced
  Clock Display and a desk-driven Art-Net universe.
- **D-05 wired Ethernet:** the WIZ850io on a real network: link-up, DHCP and
  static addressing, Art-Net over the cable, NTP sync, and cable pull/replug
  recovery; the row's requirements are in the support matrix.
- **D-05 DMX transceiver:** the C25B MAX485 module on 5 V, with its RO divider,
  receiving a real DMX512 line through the sketch's own receiver (2026-11-11,
  compiled and host-tested only: check channel 1 lands on channel 1, a desk
  with no gap between packets, and a short universe); the row's requirements are in the support
  matrix.
- **D-05 pixel data extender:** the NLED TX/RX pair driving a WS2812B run over
  a long twisted A/B/ground cable, with the length recorded, powered from
  separate supplies at each end with bonded grounds.
