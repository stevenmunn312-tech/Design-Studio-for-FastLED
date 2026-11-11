> **Archived 2026-11-12.** The root todo was cut down that day to the steps
> that release v1; the active list is [the root todo](../../todo.md). This is
> what it recorded as done, and its engineering section as it stood. Nothing
> here is current.

# v1.0.0 backlog: completed items to 2026-11-12

## Completed

Outcomes are recorded where linked; the per-item narratives up to 2026-09-24
are in the [archived backlog](../archive/hardware-todo-to-2026-09-24.md).

- **FastLED 3.10.9 and fbuild 2.5.51**: every board family compiles on both
  engines, ESP32-C3 and C6 without the `FL_NO_EXCEPT` flag and SAMD51 with
  FastLED as released; the pacing, microphone and wire-time notes were
  reread against 3.10.9, which corrected the SM16824E bit time
  ([record](../runbooks/fbuild-workarounds.md#fastled-3109-and-fbuild-2551-run-10-november-2026)).
  Bench checks are in the [bench backlog](../plans/bench-backlog.md).
- **D-13 · Board links over ESP-NOW**: controls and readings between the
  boards of one project over authenticated ESP-NOW, with channel following
  for a board off Wi-Fi, held hand-set values through a sender restart, and
  the Encoder's Level output found on the way
  ([design](../design/board-links.md#as-built);
  [compile checks](../reports/compile/board-link-compile-checks.md)). All
  three bench runs passed on 2026-10-26 and 27: a Music Player with a touch
  screen, with an OLED and a bare encoder, and set by an ESP8266 Web Remote
  ([bench record](../reports/bench/board-link-bench.md)).
- **D-11 · Richer show and timeline tools**: weighted and tagged picks,
  Restart/Resume entry policies, song-show lanes with ramps and named inputs,
  locked-range regeneration, and looping Slideshow and Music Player sequences
  ([design](../design/show-sequencing.md);
  [compile checks](../reports/compile/show-sequencing-compile-checks.md)).
  Software and compile work is complete; preview-versus-LED bench evidence remains
  in the [bench backlog](../plans/bench-backlog.md) and the [support matrix](../release/beta-support-matrix.md).
- **D-04 · Code and field fidelity**: Code-node includes and defines, gradient
  palettes, custom XY maps, static locals and typed arrays in the preview
  ([code node](../design/code-node.md)); writable Field Formula buffers
  (`prev`); show-side Vibe, Song Structure and Pitch Detect baked into an
  `ADET` trailer, Waveform inactive in shows by design
  ([audio detectors](../design/audio-detectors.md)); Stereo VU Meter
  clocked rails, unequal rail lengths and several fixtures per board, with
  the stereo FFT and streamed audio deferred until a consumer exists
  ([expansion design](../design/stereo-vu-expansion.md)).
- **D-06 · Segment networks and millimetre string positions**: a positioned
  string's span in millimetres on the Build Diagram card with an overlap
  warning; `stripLayout: 'network'` laying a string along a graph's edges
  (hexagon and triangle presets, custom JSON, a layout editor); and the
  `Ripple` pattern that travels the network, with the turning rule baked into
  the sketch ([segment networks](../design/segment-networks.md)).
- **D-07 · Build Diagram panel in the shared sidebar**: the information
  panel portals into the shared sidebar host with the shared width, resize and
  toggle controls, its own controls removed; the content is unchanged
  ([workspace shelves](../plans/workspace-shelves.md#order)).
- **D-02 · Custom screens, v1 remainder**: several screens with Go to screen
  and a Screen input, Text Entry, Chart and Spectrum, the Web Remote node,
  panel-measured size limits, and Show Status artwork
  ([custom screens](../development/patterns/custom-screens.md);
  [Web Remote](../design/web-remote.md)).
- **D-02 · Larger UI scope, v1 part**: shared-document panels, Choice Strip,
  Step Control, Colour Picker, Arc Gauge, Marquee and Containers
  ([widget ports](../reference/displays.md#widget-ports)).
- **D-04 · Code-node preview fidelity, v1 part**: persistent globals, integer
  wrap and timing macros in the preview shim
  ([code node](../design/code-node.md)).
- **D-05 · Hardware expansion**: no implementation work remains; each part
  is recorded in the [roadmap](../plans/hardware-expansion-roadmap.md) and
  its bench row is in the [bench backlog](../plans/bench-backlog.md).
- **D-06 · Pattern and output follow-ons, v1 part**: shaped outputs in show
  and player sketches, shapes in the LED Output pane, the raw Noise field and
  one `.h` per pattern
  ([pattern node expansion](../plans/pattern-node-expansion.md#phase-11--output-layout-and-media-follow-ons)).
- **D-08 · Node lock-in and the Help node reference rewrite**: NaN guard,
  property grid, dead properties, definition bugs, beat gate, data-type
  sweep, labels and groups, tooltips, merges and new nodes, then a
  hand-written Help page and live example for every node
  ([graph and nodes](../development/patterns/graph-and-nodes.md);
  [compile record](../reports/compile/pattern-node-compile-checks.md#node-lock-in-d-08-14-october-2026)).
- **D-09 · Dead code in generated firmware**: one pruning pass after all
  three generators, held by `deadCodeCorpus.test.ts` and compiled
  ([firmware generation](../development/patterns/firmware-generation.md#dead-code-pruning)).
- **D-10 · Render-buffer RAM**: scratch pooled across collected patterns,
  shared within one graph, and never a persistent terminal aliased to `leds`
  ([compile record](../reports/compile/render-buffer-ram-compile-checks.md)).
  The bench row is in the [bench backlog](../plans/bench-backlog.md).
- **D-12 · Integer kernels for the remaining costly nodes**: every node the
  node-share bench measured at 10 ms or more draws its pixels with integer
  maths, each with a native parity test, except the exemptions decided on
  2026-10-21: Turing Field and Slice Tiling (near-ties would move edges),
  Reaction Diffusion (a float simulation), Custom Formula (the user's own
  expression) and Animartrix (vendored)
  ([firmware generation](../development/patterns/firmware-generation.md#integer-pattern-kernels)).
  The device readings are a [bench backlog](../plans/bench-backlog.md) row.
- **HW-32 · Frame performance**: deadline pacing with render and send timed
  apart, per-board wire-time advice, clocked data rates, one LED output split
  across pins, a Board LED driver choice, per-node timing, frame-invariant
  nodes drawn once, and integer kernels for the five costliest formula
  patterns on an ESP8266
  ([board capabilities](../architecture/board-capabilities.md);
  [multi-output routing](../architecture/multi-output-routing.md);
  [firmware generation](../development/patterns/firmware-generation.md#integer-pattern-kernels);
  [node-share bench](../reports/bench/node-share-bench.md)). The bench rows
  are in the [bench backlog](../plans/bench-backlog.md).
- **HW-14 · Independent electrical review**: two passes, no blocking safety
  issue ([findings](../architecture/build-diagram.md#independent-electrical-review)).
  Any power family added after `5d10f5e7` reopens it for its own pass before
  it leaves experimental.
- **D-01 · Broader control graph**: Interval, Time, Wave, nested groups,
  colour, pattern selection, LED status, wall-clock signal nodes and a wired
  local RTC in show and player builds
  ([control routing](../design/large-displays-and-control-routing.md#d-01-implementation);
  [compile checks](../reports/compile/control-graph-compile-checks.md)).
- **D-03 · Networking in every firmware output, v1 part**: an NTP RTC Clock
  in the generative-show and SD-player sketches brings up the same Wi-Fi or
  wired Ethernet connection the normal sketch uses, through one shared
  emitter, and the control graph's NTP refusal is lifted
  ([RTC design](../design/rtc-clock-and-schedule.md#time-sources-software-clock-optional-ntp-or-a-ds3231);
  [compile checks](../reports/compile/control-graph-compile-checks.md)).
- **D-03 · Multi-board, library sharing and UNO R4 networking** (software
  complete 2026-10-22): a project carries several boards as partitions of
  the root graph, each with its own parts, pins, validation, sketch and
  upload target, worked on one at a time through a board selector in the
  Hardware pane, the Build Diagram and the Upload tab; with clock sync on
  the primary board leads over UDP and followers adopt its clock and show
  state ([design](../design/multi-board.md)). Patterns, palettes and
  collections travel as one library bundle by file, clipboard or link,
  never remembered as known content on import
  ([design](../design/library-sharing.md)). NTP and Art-Net/sACN/DDP work
  on the Arduino UNO R4 WiFi through WiFiS3, with the RTC running its own
  SNTP exchange. Collection and engine ownership stay separate. Compiles
  and bench rows are in the [bench backlog](../plans/bench-backlog.md).
- **HW-01–HW-10, HW-15, HW-21–HW-31**: controls and screens, workflow, catalogue
  and helper work.
- **Direct controls and LED output status**: software complete; bench readings
  are in the [bench backlog](../plans/bench-backlog.md)
  ([design](../design/direct-controls-and-output-status.md)).
- **HW-11 · Touch/LVGL budget and calibration**: instrument built, five
  runs recorded, budgets set, and guided calibration done on the CYD
  ([bench](../development/testing/display-budget-bench.md)). The shared-bus
  run is in the [bench backlog](../plans/bench-backlog.md).
- **HW-13 · display compile half**: twelve fixtures pass on both engines
  ([compile record](../reports/compile/display-compile-checks.md)). The bench
  matrix is in the [bench backlog](../plans/bench-backlog.md).
- **HW-16 · First-user journey**: a first-time user built and uploaded a
  working sketch within minutes, without guidance (reported 2026-09-24).
  The blocker classes are automated in `deployGates.test.ts`.
- **HW-19 · ICS-43434 and Generic I2S MEMS**: software complete; compiles
  pass on arduino-cli and fbuild.
- **HW-20 phases 2–5**: Option B chain, power amplifiers, the SPH0645LM4H
  (classic ESP32, app-owned capture) and the MAX98357A stereo pair
  ([plan](../design/audio-hardware.md#phases)).
- **D-05a · IR remote**: steps 1–13
  ([IR compile checks](../reports/compile/ir-compile-checks.md)).
- **D-05 parts, roadmap steps 1–10 and the sensor, control, output and power
  families after them**: LR7843 and Mosfetti power switches, INA219 and
  INA226, MAX485, HLK-LD2410C, BH1750, Grove Touch, WIZ850io, NLED data
  extender, LM2596 and SD-100A/B-5 with main fuses and trunks, BME280,
  DS18B20, HC-SR04, VL53L0X and VL53L1X (including two on one bus, each with its
  own SHDN or XSHUT pin and an address from 0x30 to 0x33), KY-023, GY-521, RCWL-0516, MPR121,
  4x4 keypad, PCA9685, ULN2803A, KY-012, KY-006, ZY12PDN, the YYNMOS-4
  (LR7843 revision) and the Noctua NF-A4x10 5V PWM cooling fan, each in software
  and compiled where it has firmware
  ([roadmap](../plans/hardware-expansion-roadmap.md);
  [compile records](../index.md#compile-checks)).
- **Controller profiles**: the ESP32-C3 Super Mini, ESP32-C6-DevKitC-1, D1 Mini,
  Pico W, Teensy 4.1 and Arduino Nano ESP32 are authored and drawn on their
  measured pads, 2026-10-08; the Super Mini's reversed rails and the D1 Mini's
  rail spacing were corrected in their models, and the Nano ESP32 is modelled
  and compiled. The WT32-ETH01 followed on 2026-10-09 with its LAN8720A
  Ethernet as a board profile fact and power through its 5V pin. The QuinLED
  Dig-Uno v3.1 followed that day with its exact terminal and header map, fixed
  level-shifted GPIO16/GPIO3 LED outputs, and 5-24 V fused input; it shares the
  existing generic ESP32 compile target
  ([compile record](../reports/compile/controller-board-compile-checks.md))
  ([roadmap](../plans/hardware-expansion-roadmap.md#additional-controller-profiles)).
  The QuinLED Dig-Quad v3.1 completed the exact-controller batch on 2026-10-09
  with its 100.394 x 48.209 mm model, dual high-current input, five fused power
  groups, seven positive and seven ground outputs, and level-shifted LED1-LED4
  on GPIO16/GPIO3/GPIO1/GPIO4.
- **Pattern node expansion**: Phases 0–10, and Phase 11's render scale,
  positioned strings, white point and SD Video, all compiled
  ([plan](../plans/pattern-node-expansion.md)).
- **App review, 24 September 2026**: all 24 items and the walkthrough's
  layout and repair findings
  ([plan](../plans/2026-09-24-app-review.md)), including its level-gate
  compile on 7 October 2026.
- **Workspace shelves**: the preview in all four workspaces and the Hardware
  shelf ([plan](../plans/workspace-shelves.md)).
- **Custom boards**: steps 1–8 in software and tests, 2026-10-06
  ([design](../design/custom-board-pin-layouts.md)); compiled 2026-10-07,
  the classic-ESP32 SD player after LVGL's pool moved to the heap
  ([compile record](../reports/compile/custom-board-compile-checks.md));
  bench is in the [bench backlog](../plans/bench-backlog.md).

## Engineering before the release track, as it stood

HW-32 (frame performance) is under [Completed](#completed); its bench rows are
in the [bench backlog](../plans/bench-backlog.md).

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
moved to the [post-v1 list](../plans/post-v1.md). The last eighteen landed the same day, chosen so every
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

### Found while landing the follow-up pass

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
