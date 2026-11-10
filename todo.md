# v1.0.0 implementation backlog

Single active checklist for `main`. Restructured
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
  changes firmware. They do not wait for hardware. The full matrix runs on
  GitHub (`Compile matrix` workflow, both engines); a local fixture compile
  uses Arduino CLI, one at a time, since overlapping runs corrupt its cache.
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

## 3. Engineering before the release track

HW-32 (frame performance) is under [Completed](#completed); its bench rows are
in section 4.

- [ ] **DMX512 firmware does not compile on the pinned ESP32 core (M).**
  Found by the 2026-11-10 matrix: `dead-code/normal-DmxTransceiver` fails on
  both engines. esp_dmx (4.1.0, its default branch and `dev`) reads
  `uart_periph_signal[n].module`, which ESP-IDF 5.5 removed, so a DMX512
  input cannot build on Arduino core 3.3.12. On Arduino CLI the helper also
  never installs esp_dmx (`esp_dmx.h: No such file or directory` on a clean
  machine). Choose between a pinned, patched esp_dmx, another DMX library or
  the app's own UART receiver, then install it for both engines and rebuild
  that leg. Art-Net input is unaffected.

### Node review follow-ups

From the 2026-11-09 review of every library node (235). The ten bugs it
found that were confirmed in code are fixed (`aedaa095`), and on 2026-11-10
the rest of its suggestions were checked against the code and most landed
(see CHANGELOG). The decisions taken that day also landed: one network
identity per Board, the Clock library node with the DS3231 as its provider,
Frame Transform and Field Transform, Shape Field's rose and superformula,
the position Units select, Power Switch's RGB strip load and the Particles
prune. Three suggestions were dropped (merging TouchButton and Motion into
Button, wired Palette Bank slots, a Field -> Frame palette offset) and three
moved to section 6. The last eighteen landed the same day, chosen so every
bundled look stays the same: `energy` -> `reactivity` and the audio Speed
remap, the band patterns' Audio input and palettes, Audio Features Level,
Color Trails' linked axes, Mirror Radial (Kaleidoscope removed), output
Gamma, Math Switch Select, the Noise/Plasma merge, simulation motion on the
clock, strip centring, Text Size, Button as a one-row bank, Clock time zones
and 4096-LED strings. A follow-up pass the same day landed what those
turned up: DMX512 and DIN MIDI as bench parts with a UART allocator, the
built-in Simplex2D pace and a Kaleidoscope source, log sliders, the rest of
the simulations on the clock, and Path, Fourier and radial Mirror on a
one-row strip. What follows is what is left, plus what that pass turned up. Merges, renames and removed properties change saved shapes: land
them before the HW-18 format freeze, or drop them.

New firmware from those passes has not been compiled yet. Before the
freeze, compile one fixture each for: DMX and DDP Live, Presence `connected`
and mm, Keypad keys and Digit, Touch Pad pads, Accel Shake, the Code node's
a/b block, Encoder clicks (`CtlDetent` with `lroundf`), demo drums, the
envelope clock, Beat Phase, Schedule Trigger's DateTime, Saturation Keep
Brightness, Frame Warp motion, the shared trail knob, Game of Life's
period-2 reseed, Plasma Scale, Path speed, Text Base, the Music Player seed,
Frame Transform (a Smooth rotate such as Psydance, and an Exact rate such as
Laser Monsoon Parade), Field Transform (Lissajous Lattice's wired tiles and
spin, Golden Ratio Cathedral), Shape Field's rose with spin and
superformula, Text and the analog clock in Pixels, a 0-1 Line, the Power
Switch RGB strip (`yynmos4-rgb`, `mosfetti-rgb-avr`), the Board network
identity (`ethernet` static, `control-graph` show-ntp, player-ntp and
show-ethernet, the `board-links` runs) and a DS3231 Clock reading its
module (no fixture yet).

Also from 2026-11-10, uncompiled: the Clock's time zone (`configTzTime` on
an ESP32 and `configTime(tz, server)` on an ESP8266, through `control-graph`
show-ntp and player-ntp, now on Europe/Paris; `_rtcTzOffset` on an UNO R4
WiFi NTP clock, no fixture yet) and long strings (a 720- and a 4096-LED
string with Waveform's line style and an elementary Automaton, which lost
their stack arrays, no fixture yet) before a long chain is trusted on
hardware. Also: the audio Speed doubling and 2.0 clamps (Bass Cathedral
Collapse, Chromatic Orbit Reactor, Beat Temple), the `reactivity` role in the
show and SD player (`show-sequencing` ramped-param player with a
`SET_ENERGY` ramp), the band patterns' `audioBandsCpp` block (ESP32-S3 + mic
into Ember Pulse on Palette, Gravity Well, Hi-Hat Shards and AnimARTrix; a
Slideshow group feeding Audio Cascade; the same graph with no mic), Dance
Flash and Ember Pulse on Palette, Gravity Well `_gwIdx`, Audio Features
Level, Color Trails' half-life fade (linked and independent), Mirror Radial
turned and rotation-only (Prism Fracture, Chromasonic Vortex), output Gamma
(single output, two outputs, show controller, SD player, a mapped ring), the
Math Switch literal, Noise Contrast and Plasma Fractal on lava, Plasma Sine
Grid and Sine 2D, Particles (luminova, comet, fireworks, chase), String
Particles on a ring, Formula Points logistic and attractor, strip centring
and long-side sizing (a 60x1 strip with Geometry Field, a formula reading
`r`, Shape Field, Path, Fourier; AVR for the `min`/`max` macros), Text and
Clock Display at Size 2 (a 64x32 HUB75), and Button rows (`ssr`,
`board-links`, `control-graph`, the Player Buttons and Screen starter).

Also uncompiled, from the later 2026-11-10 pass: the DMX transceiver and MIDI
interface bench parts (a DMX512 node on a classic ESP32 and on an ESP32-C3,
whose one spare UART takes the `CONFIG_IDF_TARGET_*` branch; two DIN MIDI
nodes sharing `midiDinCpp`'s reader; DMX512 beside a radar and a DFPlayer so
the allocator moves it), simulations on the clock (Fire classic, smoke and
Fire2012, Boids in density mode with `_bnx`/`_bny`/`_bnn` as statics,
Reaction Diffusion, String Particles drift and meteors, Formula Points
Lissajous and rose, Particles fireworks and waterfall), a log Slider and
Dial on an LVGL screen (`_rsLogValue`, `_rsLogPosition`), the Simplex2D show
clock and the Kaleidoscope show pattern (`performance` player), Path and
Fourier on a 60x1 strip (`FLAT_PATH_ROW_CPP`), and radial Mirror on a strip.

#### Found while landing the follow-up pass

- [x] **Trails: short byte trails read brighter at 30 fps (Low, S).** The
  shared byte fade (`trailFade.ts`) now steps a 60th of a second at a time,
  so every frame rate spends the same `fadeToBlackBy` bytes. Uncompiled: add
  a byte-trail node (Confetti, Trails, String Particles, Fourier) to the
  pre-freeze compile pass.
- [x] **DIN MIDI inside a show or SD-player pattern reads idle (Low, S).**
  Refused: Graph Health and the deploy gate flag a wired DIN node inside a
  collected pattern. Giving the show and SD-player sketches the board's
  shared reader stays open as a feature if anyone asks for it; it also needs
  the UART allocator to see readers inside patterns.
- [x] **Help cards cut long part names (Low, S).** A card title steps down
  to 11px before it is cut. Sixteen longer titles, mostly variant names
  such as "Mirror · Horizontal", are still cut at that size.

### Requested 2026-11-10

Landed 2026-11-11, all uncompiled and none seen on hardware: the Font select
on Text and Clock Display (3x5, 4x6, 5x8, bold 6x8; glyphs drawn for this
project because FastLED's console fonts carry no licence), the suggestion
in the Add patterns picker to run Pattern Insights on unrated patterns, estimated cost
per pattern (render weight and firmware RAM), the LED matrix start corner
and first run, the Audio node an SD card reader brings, the Performance
Generator playing only in the main preview, and the Music Player and
Music-synced SD Show starters opening with twenty Exceptional patterns and
the demo track analysed. What is left:

- [x] **Pattern cost: steadier render weight (S).** Done 2026-11-11. Render
  weight is timed in its own pass on a fixed 32x32 grid, about 5% between
  scans. RAM is banded against the chosen board's internal-RAM budget, per
  LED only when the board declares none. Flash is estimated from the
  firmware a pattern generates, fitted to four compiled show sketches
  (`patternFlash.ts`); the fit is within 10% on large collections and 50% on
  the smallest.


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
- **D-02 screens and widgets:** on a touch panel, a design with two screens
  moved by a Go to screen button and by a wired Screen input; a Text Entry typed
  on the keyboard and its text reaching a Text; a Chart filling at its interval
  and a Spectrum following a microphone; Show Status picturing the slideshow's
  pattern. All compile only at the v1 freeze
  ([custom screens](docs/development/patterns/custom-screens.md)).
- **D-02 Web Remote:** the phone page on an ESP32 and an ESP8266 on a real
  Wi-Fi network, reached by its `.local` name, every control type driving the
  LEDs, a held button released by the timeout, and a reconnect after Wi-Fi drops
  ([design](docs/design/web-remote.md)).
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

- **FastLED 3.10.9 on real boards:** it compiles on every family
  ([record](docs/runbooks/fbuild-workarounds.md#fastled-3109-and-fbuild-2551-run-10-november-2026)),
  and nothing has run on it yet. On an ESP32 with Arduino core 3.3.2 to
  3.3.12 FastLED replaces the core's `app_main`/`loopTask`, so watch boot,
  USB serial and the loop watchdog; `-DFL_ESP32_STOCK_ARDUINO_MAIN=1` in
  `_FASTLED_BUILD_FLAGS` restores the stock startup. On an ESP8266, check
  that `addLeds()` on GPIO12 no longer hangs and the `D1`-style pin
  constants work. On a SAMD51, the microphone and LEDs now build with
  hardware SPI enabled and no library patch, unproven on a board.
- **HW-13 firmware/bench matrix:**
  - classic-ESP32 SD provisioning and player, following the
    [SD-show run](docs/release/beta-hardware-validation.md#sd-show-validation-run);
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
    ([input bench](docs/reports/bench/input-peripheral-bench.md));
  - a HUB75 full support row, streaming, folded/chained/rotated topology, and
    show/player (confirm chain orientation, preview fidelity and panel power
    assumptions).
- **SD Video:** measured card read bandwidth per board, against the 400 KB/s
  estimate ([SD Video limits](docs/design/sd-video.md#limits)).
- **Persistent patterns across a transition:** preview versus LEDs on Trails,
  Frame Feedback, Reaction Diffusion and Fluid across a show transition, for
  both entry policies. Restart clears that state as the incoming transition
  starts. Resume keeps it, and the preview holds it while the pattern is away.
  Text-level coverage is in `persistentRenderBuffers.test.ts` and
  `entryReset.test.ts`
  ([compile record](docs/reports/compile/render-buffer-ram-compile-checks.md)).
- **HW-32 frame performance**, each experimental in the
  [support matrix](docs/release/beta-support-matrix.md):
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
    ([node-share bench](docs/reports/bench/node-share-bench.md#not-yet-measured)).
- **D-12 integer kernels:** the after-reading of every converted node on the
  ESP8266 node-share bench, each under 10 ms a 256-pixel frame, and FastLED's
  own `inoise8` checked against the sketch's copy on the device
  ([node-share bench](docs/reports/bench/node-share-bench.md#converted-for-d-12)).
- **Compile matrix at the v1 freeze:** no compile runs during active v1
  development, because every sketch keeps changing. Once the release track is
  done and before HW-18, run
  `python scripts/compile-fixtures/compile-matrix.py --engine all` at the
  frozen code. On 2026-10-27 that plan was 198 builds: 131 on Arduino CLI
  and 67 on fbuild, picked from every fixture of every family so each board
  builds every library, configuration and FastLED, core or library name the
  fixtures use at least once (Steve chose this rule over 397 and 139). The
  count moves with the code; `--list` gives the current one. Runs go to the
  `Compile matrix` GitHub workflow (20 Windows runners). 2026-10-28, on FastLED
  3.10.8 and Arduino core 3.3.12: Arduino CLI 130 of 130 pass
  (`artifacts/compile-matrix/cloud-40518148901`, commit `ea42a73b`); fbuild
  63 of 66 (`cloud-40505040758`), the two S3 LED-driver legs since fixed and
  passing, the Nano ESP32 failing on an fbuild board-flag bug
  ([FastLED/fbuild#1760](https://github.com/FastLED/fbuild/issues/1760)). The freeze run repeats this on the frozen code.
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
  receiving a real DMX512 line; the row's requirements are in the support
  matrix.
- **D-05 pixel data extender:** the NLED TX/RX pair driving a WS2812B run over
  a long twisted A/B/ground cable, with the length recorded, powered from
  separate supplies at each end with bonded grounds.

## 5. Release track (in order)

- [ ] **fbuild upkeep (S)** ([runbook](docs/runbooks/fbuild-workarounds.md)).
  The full run on fbuild 2.5.51 passed 65 of 66 legs on 2026-11-10, the one
  failure being the DMX library on both engines (section 3)
  ([record](docs/runbooks/fbuild-workarounds.md#fastled-3109-and-fbuild-2551-run-10-november-2026)).
  The LVGL archive recovery (§12), the SAMD51 FastLED patches and the SAMD51
  `-DARDUINO_ARCH_SAMD`/`EIC_IRQn`/software-SPI flags are removed. Left:
  - **Release blocker for fbuild on Windows:** check with a short build on a
    desktop that no console window opens per compile (§13,
    [#1722](https://github.com/FastLED/fbuild/issues/1722), fixed by #1723 in
    2.5.45). A headless runner cannot show it. `backend/.venv` and the
    Espressif Python still hold 2.5.45, so install the 2.5.51 pin first.
  - ESP8266 `deploy` (§7, [#1657](https://github.com/FastLED/fbuild/issues/1657)):
    2.5.45 added a deployer; flash a board through fbuild, then drop the
    Arduino CLI fallback.
  - ESP32-H2 is still built on Arduino CLI alone (`ARDUINO_CLI_ONLY` in
    `compile-matrix.py`); recheck whether 2.5.51 has `esp32-h2-devkitc-1`.
  - The SAMD51 environments still repeat `-D__SAMD51__` and the MCU define
    for library sources; try one build without them.
  - §5 ([#1658](https://github.com/FastLED/fbuild/issues/1658)) and
    [#1673](https://github.com/FastLED/fbuild/issues/1673) have no fixture of
    their own. Open and not posted (`tmp/fbuild-main/drafts/`): RP2040/RP2350
    flash counts the `.heap` reservation, and fbuild ESP32 images carry about
    255 KB more `.eh_frame` than Arduino CLI's, cause not yet found.
  - The four unpatched vendored libraries stay in `lib/`: on 2.5.37 a GitHub
    `lib_deps` ignores its `#ref`, the HUB75 pin is ignored, esp_dmx 4.1.0
    does not build on IDF 5.5, and every `lib_deps` library is compiled
    whether used or not (§1). Recheck on 2.5.51, report upstream, then
    revisit. FastLED itself no longer needs vendoring for patches.
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

## 6. Deferred until after v1

Scope set item by item on 2026-10-21. Items dropped then are recorded in
their design notes: free drawing, XY Pad, Launch Pad and TFT video in
[auxiliary displays](docs/design/auxiliary-displays.md#deferred-dropped-and-why);
per-input modulation from song analysis in
[collection-driven performance](docs/design/collection-driven-performance.md);
colour profile in
[pattern node expansion](docs/plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons);
and an Upload information shelf in
[workspace shelves](docs/plans/workspace-shelves.md#order).

- [ ] **D-02 · Large display panels.** Parallel-RGB LCD panels and HDMI output
  as display targets. Each is a different runtime class, with new board
  profiles, a display driver and its own LVGL memory budget
  ([auxiliary displays](docs/design/auxiliary-displays.md#deferred-dropped-and-why)).
- [ ] **D-03 · Linux backend and show-side Art-Net.** A Raspberry Pi/Linux
  code-generation backend beside the C++ firmware path. Art-Net in the show and
  SD-player generators is an open question, because a show already owns its
  LEDs: take the LEDs over while packets arrive, or act only as remote control.
  NTP in those generators shipped with D-03.
- [ ] **User font import for LED text (M).** Import a bitmap font (BDF, or a
  pasted glyph sheet) as a `BitmapFont` saved with the project, validated
  before any glyph byte reaches generated C++. Follows the built-in Font
  select in section 3. Proportional widths and kerning are a separate
  decision: every layout helper assumes a fixed advance today.
- [ ] **More typefaces on custom screens (M).** LVGL screens use Montserrat
  only, at even sizes 8 to 48. Extra faces, built in or imported, need an
  `lv_font_conv` step in the build helper and a flash budget per face and
  size.
- [ ] **TrueType text on LED matrices (L).** FastLED 3.10.9 carries
  `fl::TrueType` (stb_truetype). Not planned: the preview would need the
  same rasteriser in TypeScript, and the flash and RAM cost is unmeasured.
  Revisit only if large panels make the bitmap fonts look coarse.

- [ ] **Node review: Category: Grow field nodes so pattern/field twins are not subsets
  (Low, M).** Noise has 9 algorithms vs Field Noise's fBm only; Game of Life
  has no Automaton equivalent; Reaction Diffusion/Turing Field, Custom
  Formula/Field Formula and the gradient patterns repeat likewise. Add
  `noiseType` to Field Noise and a Conway `life` type to Automaton so field
  chains are not stuck with the subset.
- [ ] **Node review: Clock Display: Split Stopwatch/Timer into a signal node (Low, M).**
  A transport lives inside a drawing node; anyone wanting only `done` still
  draws digits. Consider a small Timer signal node with Clock Display drawing
  a wired `seconds`.
- [ ] **Node review: Category: Default Ripple and String Particles to the LED output's
  network (Med, M).** Ripple needs the output's network preset, JSON and LEDs
  per edge, and String Particles needs the ring LED count, all copied by hand
  with nothing keeping them in sync. Default both to "match LED output" read
  from the root graph's MatrixOutput, with the current fields as an override.
  The Ripple default `ledsPerEdge: 14` rarely matches a real build and the
  Help example uses 4. For String Particles, a ring form gives the ring track
  and LED count and a strip form gives row. Open questions before building
  it: which output to match when a board drives several (the multi-board
  partition model feeds consumers the active board's partition), what the
  preview does inside a group or pattern where no LED output is reachable,
  and how a "match" value is saved so a later output change follows it.
  Evidence `src/state/nodeLibrary.ts:2244`, `:2261`.

## Completed

Outcomes are recorded where linked; the per-item narratives up to 2026-09-24
are in the [archived backlog](docs/archive/hardware-todo-to-2026-09-24.md).

- **FastLED 3.10.9 and fbuild 2.5.51**: every board family compiles on both
  engines, ESP32-C3 and C6 without the `FL_NO_EXCEPT` flag and SAMD51 with
  FastLED as released; the pacing, microphone and wire-time notes were
  reread against 3.10.9, which corrected the SM16824E bit time
  ([record](docs/runbooks/fbuild-workarounds.md#fastled-3109-and-fbuild-2551-run-10-november-2026)).
  Bench checks are in section 4.
- **D-13 · Board links over ESP-NOW**: controls and readings between the
  boards of one project over authenticated ESP-NOW, with channel following
  for a board off Wi-Fi, held hand-set values through a sender restart, and
  the Encoder's Level output found on the way
  ([design](docs/design/board-links.md#as-built);
  [compile checks](docs/reports/compile/board-link-compile-checks.md)). All
  three bench runs passed on 2026-10-26 and 27: a Music Player with a touch
  screen, with an OLED and a bare encoder, and set by an ESP8266 Web Remote
  ([bench record](docs/reports/bench/board-link-bench.md)).
- **D-11 · Richer show and timeline tools**: weighted and tagged picks,
  Restart/Resume entry policies, song-show lanes with ramps and named inputs,
  locked-range regeneration, and looping Slideshow and Music Player sequences
  ([design](docs/design/show-sequencing.md);
  [compile checks](docs/reports/compile/show-sequencing-compile-checks.md)).
  Software and compile work is complete; preview-versus-LED bench evidence remains
  in section 4 and the [support matrix](docs/release/beta-support-matrix.md).
- **D-04 · Code and field fidelity**: Code-node includes and defines, gradient
  palettes, custom XY maps, static locals and typed arrays in the preview
  ([code node](docs/design/code-node.md)); writable Field Formula buffers
  (`prev`); show-side Vibe, Song Structure and Pitch Detect baked into an
  `ADET` trailer, Waveform inactive in shows by design
  ([audio detectors](docs/design/audio-detectors.md)); Stereo VU Meter
  clocked rails, unequal rail lengths and several fixtures per board, with
  the stereo FFT and streamed audio deferred until a consumer exists
  ([expansion design](docs/design/stereo-vu-expansion.md)).
- **D-06 · Segment networks and millimetre string positions**: a positioned
  string's span in millimetres on the Build Diagram card with an overlap
  warning; `stripLayout: 'network'` laying a string along a graph's edges
  (hexagon and triangle presets, custom JSON, a layout editor); and the
  `Ripple` pattern that travels the network, with the turning rule baked into
  the sketch ([segment networks](docs/design/segment-networks.md)).
- **D-07 · Build Diagram panel in the shared sidebar**: the information
  panel portals into the shared sidebar host with the shared width, resize and
  toggle controls, its own controls removed; the content is unchanged
  ([workspace shelves](docs/plans/workspace-shelves.md#order)).
- **D-02 · Custom screens, v1 remainder**: several screens with Go to screen
  and a Screen input, Text Entry, Chart and Spectrum, the Web Remote node,
  panel-measured size limits, and Show Status artwork
  ([custom screens](docs/development/patterns/custom-screens.md);
  [Web Remote](docs/design/web-remote.md)).
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
- **D-12 · Integer kernels for the remaining costly nodes**: every node the
  node-share bench measured at 10 ms or more draws its pixels with integer
  maths, each with a native parity test, except the exemptions decided on
  2026-10-21: Turing Field and Slice Tiling (near-ties would move edges),
  Reaction Diffusion (a float simulation), Custom Formula (the user's own
  expression) and Animartrix (vendored)
  ([firmware generation](docs/development/patterns/firmware-generation.md#integer-pattern-kernels)).
  The device readings are a section 4 row.
- **HW-32 · Frame performance**: deadline pacing with render and send timed
  apart, per-board wire-time advice, clocked data rates, one LED output split
  across pins, a Board LED driver choice, per-node timing, frame-invariant
  nodes drawn once, and integer kernels for the five costliest formula
  patterns on an ESP8266
  ([board capabilities](docs/architecture/board-capabilities.md);
  [multi-output routing](docs/architecture/multi-output-routing.md);
  [firmware generation](docs/development/patterns/firmware-generation.md#integer-pattern-kernels);
  [node-share bench](docs/reports/bench/node-share-bench.md)). The bench rows
  are in section 4.
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
- **D-03 · Multi-board, library sharing and UNO R4 networking** (software
  complete 2026-10-22): a project carries several boards as partitions of
  the root graph, each with its own parts, pins, validation, sketch and
  upload target, worked on one at a time through a board selector in the
  Hardware pane, the Build Diagram and the Upload tab; with clock sync on
  the primary board leads over UDP and followers adopt its clock and show
  state ([design](docs/design/multi-board.md)). Patterns, palettes and
  collections travel as one library bundle by file, clipboard or link,
  never remembered as known content on import
  ([design](docs/design/library-sharing.md)). NTP and Art-Net/sACN/DDP work
  on the Arduino UNO R4 WiFi through WiFiS3, with the RTC running its own
  SNTP exchange. Collection and engine ownership stay separate. Compiles
  and bench rows are in section 4.
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
