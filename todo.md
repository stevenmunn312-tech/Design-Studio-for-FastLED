# Shipping v1.0.4

v1.0.0 and v1.0.1 were tagged on 2026-11-22, v1.0.2 on 2026-11-26 and v1.0.3 on
2026-11-28, and none was published; v1.0.4 (2026-11-28) replaces them. Only the steps that ship v1.0.4 are here; tick a step when its outcome is recorded where it belongs, and empty
this file when they are done.

- **Bench and community testing** is in the
  [bench backlog](docs/plans/bench-backlog.md).
- **Work deferred until after v1** is in the
  [post-v1 list](docs/plans/post-v1.md).
- **Completed release work** is recorded in the
  [changelog](CHANGELOG.md), the
  [support matrix](docs/release/beta-support-matrix.md), the
  [smoke tests](docs/release/clean-machine-smoke-test.md) and Git history.

## Halted 2026-11-23: release blocker

**Do not submit or publish anything.** With Windows long-path support off
(the Windows default), fbuild 2.5.52 cannot install the ESP32 toolchain or
Arduino framework, so the app's default engine cannot build any ESP32 sketch.
Seen on a new standard account with `LongPathsEnabled = 0` running Store
package 1.0.1; it affects the Store package and the portable ZIP alike. Every
earlier passing run used this PC with long paths on machine-wide, so none of
them covered this. The cause, the measurements and the test conditions are in
the [long-paths blocker](docs/release/long-paths-blocker.md) handoff.

- Cause: fbuild's fallback accepts paths up to 247 characters, and the ESP32
  packages need 245 to 290 below the cache root. No cache folder can work.
- Reported upstream on 2026-11-23 as FastLED/fbuild#2156. FastLED/fbuild#2159
  (a repair prompt at start-up) does not cover it: the app runs fbuild without
  a terminal, and a standard user cannot approve the prompt.
- arduino-cli installs and builds the ESP32-S3 under the same conditions
  (Steve's test, 2026-11-23). Other ESP32 boards are untested.
- Decision, 2026-11-23: wait for the fbuild fix. If it does not come, the
  fallback is to have the app use arduino-cli for ESP32 boards when long paths
  are off.

- [x] A fixed fbuild is released: move the pin and rerun the minimal project in
  `tmp/fbuild-longpath-repro`. fbuild 2.5.55 (FastLED/fbuild#2175) pinned on
  2026-11-26; the repro passed with long paths off
  ([retest](docs/release/long-paths-blocker.md#retest-on-fbuild-2555)).
- [x] In the packaged app, 2.5.55 compiled but could not start the bundled
  esptool ("Access is denied"). Fixed 2026-11-26: the helper hands fbuild a
  copy in the build folder
  ([details](docs/release/long-paths-blocker.md#the-packaged-app-could-not-run-esptool-found-and-fixed-2026-11-26)).
- [x] Store-identity layout built locally from `main` (`8df5772c`), on
  `storetest-longname` with long paths off: build and upload to the ESP32-S3
  passed, 2026-11-26. It did not cover a first download or the package that
  ships ([what it covered](docs/release/long-paths-blocker.md#the-packaged-app-could-not-run-esptool-found-and-fixed-2026-11-26)).
- [x] Decide what ships: a new version, 1.0.2, from `main` (Steve,
  2026-11-26). The `v1.0.1` tag stays as it is.
- [x] The Store smoke test under Publish below, on the 1.0.3 package, on an
  account that has never run fbuild, through first download and upload.
  Passed 2026-11-28 with one retry: the first ESP32 download failed
  ([result](docs/release/clean-machine-smoke-test.md#results)).

State: the Store holds only the certified, unpublished 1.0.0 dry run (leave
it alone); tags `v1.0.0`, `v1.0.1` and `v1.0.2` exist, all superseded by
`v1.0.4` (as is `v1.0.3`). Their private draft releases and the website preview page, which
were only for sharing builds with Zach, were deleted on 2026-11-28.

## Pre-release firmware review (2026-11-26)

A desk review of the generated firmware for every hardware item, by three
reviewers, with no hardware and 11 local compiles. Nothing below is fixed yet:
tick an item when you have decided it (fix for v1.0.3, defer to
[post-v1](docs/plans/post-v1.md), or reject). Each item says how far it was
proved: **compiled** (a local build shows it), **emitted** (seen in a finished
sketch), or **bench** (needs hardware to settle). Time figures are estimates;
byte figures were measured. Reviewer notes and sketches are in the local,
gitignored `tmp/firmware-review/`.

### Builds fail or the part cannot work

Ten of these were fixed on 2026-11-26 ([changelog](CHANGELOG.md)); a ticked
item keeps its original description. What the fixes changed that you will
notice:

- An SPI OLED or MAX7219 on the same clock and data pins as a colour panel,
  SD card or Ethernet module is now a pin conflict, not a silent dark part.
  The firmware still bit-bangs these parts; driving them through the SPI
  host instead is the alternative, and needs a bench.
- A power-limited build runs dimmer at the limit than before: the limiter
  now counts a 5 V LED at 300 mW (it was 210) and a 12 V WS2811 pixel at
  720 mW, the figures the Build Diagram sizes from.
- Live Stream to an AVR board runs at 1,000,000 baud. Whether an UNO keeps
  up while it sends LEDs is still unproven.
- None of the ten was run on hardware.

Three more were done later the same day, on your say-so and with no bench
(you were away): the encoder, IR on AVR and the clock-sync follower. They
compile; none has run on a board, so each needs one bench check before it
is called fixed. The animation clock is left as it is, your decision.

- [x] Fixed 2026-11-26, with the IR item below: both rebuilt clean on the Uno
  and RP2040 ([changelog](CHANGELOG.md)). An I2C OLED in a show had the same
  fault and is fixed with it; that case and the SAMD case were not compiled.
  **I2C sensors in shows and players, every non-ESP board** (compiled).
  The control graph emits `Wire.begin(sda, scl)` on all boards
  (`controlInputCpp.ts:155,164,173`, `motionVectorCpp.ts:47`,
  `touchPadCpp.ts:68`, `distanceSensorCpp.ts:53`). RP2040 fails with
  `no matching function for call to 'TwoWire::begin(int, int)'`; AVR, Teensy
  and Renesas have no such overload either; on Adafruit SAMD it compiles as
  `begin(address, generalCall)` and makes the board an I2C slave. Validation
  passes all of them. The normal sketch is right (`cppGenerator.ts:840-844`).
- [x] **IR on UNO, Nano and Nano Every** (compiled). The IR learner uses
  `Serial.printf` (`irLearnSketch.ts:41`), which AVR lacks, so keys cannot be
  mapped on those boards at all. Encoder Debug fails the same way
  (`controlInputCpp.ts:133`).
- [x] **SH1106 SPI OLED and MAX7219 on a shared SPI bus** (emitted, bench).
  Both bit-bang with `digitalWrite` on SCK/MOSI pins the hardware SPI host
  owns once a TFT or card starts it; ESP32 core 3.3.12 refuses that write
  silently, so the part stays dark. `busTopology.ts:114-158` allows the
  sharing and `part-families.ino` builds it.
- [x] **Pot, joystick and LDR on ESP32-S2** (emitted). The S2 ADC returns 13
  bits and the sketch divides by 4095 (`helpers/analogReadCpp.ts:14-15`): a
  pot is full at half travel. Fix: `analogReadResolution(12)`.
- [x] **Live Stream on UNO, Nano and Mega** (arithmetic). 921600 baud lands at
  1,000,000 on a 16 MHz AVR, 8.5 % off (`streamReceiverGenerator.ts:76,131`).
- [x] **Power limit on 12 V strips** (emitted). `setMaxPowerInVoltsAndMilliamps`
  runs on FastLED's 5 V WS2812 model, so the cap passes about 3.3 times the
  set current on WS2811 and 1.4 times on WS2815 and at 5 V, against the
  app's own `build/power/ledDraw.ts`. No generator emits `setPowerModel`.
- [x] **Stereo VU with a second LED output** (emitted). The VU rails miss the
  Board's master brightness and run about twice as bright in a normal
  sketch (`cppGenerator.ts`). The show sketch already folded it in; the
  review was wrong about `showGenerator.ts`. A HUB75 panel with VU rails had
  the same gap in the normal sketch and is fixed with it.
- [x] **Wi-Fi hostname on ESP32 core 3** (emitted, core source). Set after
  `WiFi.mode`, so the router never sees it (`networkCpp.ts:150-158`).
- [x] **Rotary encoder** (emitted, bench for how much). Sampled once a frame,
  so brisk turns and slow frames dropped detents. The decode is now a
  function the frame wait polls about once a millisecond. Bench: turn it
  fast and count. Not covered: an encoder wired straight to a Music Player
  control (`ControlEncoder` in the player sketch) is still read once a frame.
- [x] **IR receive on AVR** (FastLED source, bench). `FastLED.show()` and the
  dither refreshes held interrupts off for most of each frame. With an IR
  receiver on an AVR board the frame is now sent only while the receiver is
  idle, and the wait sends nothing. Costs: no temporal dithering there, and
  a frame is skipped while a key is held. A long strip still blinds the
  receiver for the length of its send (about 30 microseconds an LED).
  Bench: an UNO, a remote, 64 LEDs.
- [ ] **Animation clock on long runs** (arithmetic). `float t = millis()/1000.0f`
  is coarser than a frame after about 1.5 days (`player/masterSpeedCpp.ts:42`).
  Left as it is (Steve, 2026-11-26).
- [x] **SD Video** (emitted, bench). The card mounts before the other chip
  selects on its bus are high, and never retries (`nodes/shapes/codegen.ts:99`).
- [x] **Touch calibration on ILI9341** (emitted, bench). The sketch skips the
  controller init stream (`touchCalibrationSketch.ts:153`).
- [x] **Clock sync follower** (emitted, experimental). Stepped its clock on
  every datagram with Wi-Fi sleep on. A Wi-Fi follower now keeps its radio
  awake, takes the best offset of each four-second window, and closes on it
  a millisecond a pass; a gap past half a second is taken at once. Bench:
  two boards, one show.
- [ ] Not settled without a bench: SD player audio dropouts beside TFT
  repaints; microphone adapters on RP2040, SAMD51 and STM32 blocking 11.6 ms a
  read; PCM1802 sample alignment (it compiles on the S3); DS18B20 slot timing
  on core 3; joystick centre bias on classic ESP32.

### Speed, size and memory

Four were done on 2026-11-26 ([changelog](CHANGELOG.md)); the byte figures
below them are compiled, the time figures are still estimates and no frame
rate was measured. Two more followed later that day: the I2C speed and the
microphone detectors. TFT and LVGL bulk SPI is skipped and the smaller items
are deferred, both your decisions.

- [x] **Output gamma as a baked table.** Default gamma 2.2 ran a fixed-point
  `pow` three times per LED per frame. Now a 256-byte table built at
  generation from the bytes the preview reads. Compiled on the Uno: flash
  9,890 to 8,382 bytes, RAM unchanged. Estimated time saved: 17 ms a frame
  for 30 LEDs on the Uno, 5 to 9 ms for 16x16 on ESP8266.
- [x] **Segment and OLED drivers per transport.** A TM1637 sketch carried the
  MAX7219 driver and an SPI OLED carried `Wire` and the I2C arms. Now each
  is emitted for the parts in the sketch. Compiled on the S3: an SPI-only
  OLED went from 364,099 to 335,579 bytes of flash and lost 1,392 of RAM.
  Controller arms inside the OLED driver (SH1106 against SSD1306) still
  ship together; they are a few bytes.
- [x] **I2C at 400 kHz.** No sketch called `Wire.setClock`. The Board has an
  I2C speed setting, 400 kHz by default and 100 kHz for long wires; every
  existing project moves to 400 kHz on its next build. Estimated: an I2C
  OLED flush drops from about 110 ms to about 30, and each sensor read by
  0.7 to 1.1 ms. Not done: the OLED still resends every page each second.
- [ ] **TFT text and LVGL flush in bulk SPI.** Skipped (Steve, 2026-11-26). Fixed layouts draw one fill per
  lit font pixel, a byte per transfer (`tftDisplayCpp.ts:729-747`); the LVGL
  flush is a byte per transfer and keeps the parallel arm in SPI builds
  (`customDisplayPanelCpp.ts:173,201-215`). Needs a panel on the bench to
  check what is drawn.
- [x] `TftPanel::scratch` was unused: 64 bytes of RAM a panel, removed.
- [x] **Microphone detectors on demand.** Beat, bass, mid, treble and BPM were
  always registered and polled, so FastLED ran analysers nothing read. A
  pass over the pruned sketch now drops each detector whose values survive
  only as bare calls. What it saves a frame was not measured.
- [x] BME280 was read every frame against a 1 s standby; now once a second,
  and a missing sensor is retried at that rate.
- [ ] Deferred (Steve, 2026-11-26). Smaller: PCA9685 rewritten on ADC noise; half-resolution upscale in
  float (the integer form is claimed identical, unproven); show patterns
  copied into `leds` (3 x NUM_LEDS bytes); the two INA read helpers are
  identical.

### Code the sketch cannot reach

All three were done on 2026-11-26 ([changelog](CHANGELOG.md)), and tracing
the first turned up a fault the review had filed as dead text:

- [x] **Wired Ethernet on the ESP32-C3 and C6 could not start** (core source,
  bench). The sketch chose the module's SPI host with `#if defined(HSPI)`,
  and ESP32 core 3 defines `HSPI` on every chip, so the C3 and C6 asked for a
  second host they do not have (`SPI bus index 1 is out of range`). The host
  is now chosen by chip. It compiles on the C3; no W5500 was on a bench.
- [x] `boardCppFacts` now knows `CONFIG_IDF_TARGET_*`, `ARDUINO_ARCH_*` and
  `TEENSYDUINO`, so an arm for another chip folds out of a sketch whose
  Board names the chip: one UART declaration, one pin mode, one SPI host.
  The SD player still knows only that it is an ESP32.
- [x] The touch calibration sketch is pruned (`_tftPaint`, `_tftField` and
  `_tftFit` gone); the wiring diagnostic paces with the shared `_paceFrame`.
- [x] `// Board — not yet supported in code gen` is gone from the loop; an
  unknown node type is still flagged. `firmware-generation.md` now says the
  fixed layouts draw the 5x8 font.

### Compile coverage

- [ ] Run the pre-release matrix once the fixes above are in, after your
  go-ahead: `python scripts/compile-fixtures/compile-matrix.py --preset prerelease`
  (77 builds, 72 on arduino-cli and 5 on fbuild; the legs and what each
  proves are in `scripts/compile-fixtures/prerelease-legs.json`). fbuild
  2.5.56 with FastLED/fbuild#2188 is pinned since 2026-11-28, and the
  RP2040, Teensy and STM32 pattern legs on fbuild are in the preset.
- [x] Legs nothing built before: ten sketches from
  `scripts/compile-fixtures/review-gaps.ts` (a chipset sweep on three boards,
  the stream receiver on three, HUB75 on the S3, PCM1802 line-in, the SD pin
  probe, a show with an I2C sensor on a Pico W), plus `ir/learn` and
  `ir/normal-uno` on AVR. All are in the matrix and the preset. Each was
  built once on 2026-11-26 the way the app builds it
  (`scripts/compile-fixtures/app-build.py`: fbuild 2.5.55, long paths off):
  nine passed. The Pico W show failed at fbuild's package install, the known
  long-path fault, and the same sketch built on arduino-cli (344,984 bytes).
- [x] The app ended that Pico W failure with "The sketch didn't compile". It
  did not get as far as the sketch: fbuild could not install the board
  package. The helper now says so and points at the arduino-cli engine.
- [x] The five areas the first pass left out were reviewed on 2026-11-26
  (desk review, one reviewer). Its findings are the next list.

### Second review pass (2026-11-26)

Standalone displays, board-link waiting screens, the Stereo VU meter, the
Bluetooth and radio players, and the provisioner. Most were fixed the same
day; a ticked item says what was done. None ran on hardware. Reviewer sketches are in the local
`tmp/firmware-review/extra/`.

- [x] **Live Stream receiver and wiring test with a display, on UNO R4, SAMD
  and Nano Every** (compiled). Both sketches skipped `withQualifiedMinMax`,
  so a bare `max(` reached cores where it is ambiguous. The receiver with an
  OLED failed on the UNO R4 WiFi (`call of overloaded 'max(int, int)' is
  ambiguous`). Fixed 2026-11-26 in both sketches; the fixture
  `review-gaps/stream-receiver-r4-oled` holds it.
- [x] **The Setup Wizard's wiring test read the whole project, not the board
  being set up** (emitted, multi-board). It started another board's OLED on
  this board's pins. It now uses the active board's partition, as the deploy
  popup does.
- [x] **Stereo VU shuffle order differed between preview and board**
  (emitted). The preview seeded it from the node id and its audio source,
  the firmware from the id alone. Both now use the id. Shuffle is the default
  policy, so a saved project's preview order changes to match its board.
- [x] **VU rails and Loudness led the music by about 186 ms on the SD and
  radio players** (emitted). Each block's level now waits in the ring with
  the block and is published when it reaches the speaker, as bass, mids,
  treble and beat already were. Bench: watch the rails against a kick drum.
- [x] **Internet Radio: Play/Pause could freeze the LEDs while a station
  connects** (library source). The button now asks the radio task, as a
  station change does. Bench: press Pause while a dead station is connecting.
- [x] **Live Stream receiver beside an OLED or TFT** (bench). With a display
  the receiver asks for a 4096-byte serial buffer on ESP boards. Whether a
  frame still corrupts on a bench is not known.
- [x] Standalone sketches go through the pruning passes (`finishCpp`); a
  `#define` the wiring test never read is gone with them.
- [x] Board-link waiting screen: no second full-screen fill at boot, and a
  lost link says "CHECK SENDER BOARD". Left: the fill on each link change,
  and touch buttons that stay live under "WAITING".
- [ ] Stereo VU: a Manual fixture still carries all twelve modes, both
  history arrays and the shuffle table (8 bytes of RAM a LED); the history
  tick is 33 ms against the preview's 33.3.
- [x] The provisioner sketch was dead source: removed, with its tests, and
  the helper's comment now names the receiver in the player sketch.
- [x] Legs added (`review-gaps`): the stream receiver and the wiring test
  with an OLED, a segment module and a TFT, the wiring test with VU rails,
  Stereo VU in a normal sketch and in a show, the Bluetooth player and the
  Internet Radio player. Still unbuilt: clocked VU rails, and a board-link
  segment or SPI-TFT waiting screen.

## Publish

v1.0.4 is the release: 1.0.3 plus a retry when a first ESP32 package download
breaks off (every first download on Steve's PC needed one by hand) and a
`desktop.log` that survives a relaunch. 1.0.3 is `main` on 2026-11-28, with
fbuild 2.5.56 and the esptool fix, so a Store install builds every supported
family with long paths off, plus everything on `main` since 1.0.2 (the Debug
node, runtime audio source switching and the firmware review fixes, most not
yet run on a board). The 1.0.0 to 1.0.3 tags are superseded.

- [x] Pico W, Teensy and STM32 boards: fbuild 2.5.55 cannot build them with
  long paths off
  ([record](docs/release/long-paths-blocker.md#other-board-families-on-fbuild-2555-2026-11-26)),
  reported on 2026-11-26 as FastLED/fbuild#2187. Fixed in fbuild 2.5.56
  (FastLED/fbuild#2188), pinned on 2026-11-28. With long paths off and an
  empty package cache, the three blank sketches and one pattern sketch per
  family built from a shell
  ([retest](docs/release/long-paths-blocker.md#retest-on-fbuild-2556-2026-11-28)).
- [x] Decide how the fix ships: a new version, 1.0.3, from `main` (Steve,
  2026-11-28). The `v1.0.2` tag stays as it is.
- [x] Build the v1.0.3 packages with the Desktop Packages workflow on GitHub
  (Steve's go-ahead, 2026-11-28; no draft release). Run 46099584414 on the
  tag built Windows (with the MSIX), macOS Apple Silicon and Linux; macOS
  Intel failed in the smoke's cleanup (fixed in `92dd0f7e`) and was rebuilt
  from `main` in run 46101612183, which differs from the tag only in that
  smoke step.
- [x] Test the v1.0.3 Store package the way a real user meets it: Windows
  long paths **off**, a new account with a long username that has never run
  fbuild, first build and upload
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md)).
  Pass on 2026-11-28 (`storetest-v103-long`, ESP32-S3), after pressing
  Upload a second time when the first ESP32 package download failed.
- [x] Run WACK on the v1.0.3 MSIX. PASS on 2026-11-28 (kit 10.0.26100.8249,
  app 1.0.3.0): 23 tests passed, only the optional Blocked executables
  failing, as expected; SHA-256 `843909ee…78fe6995`, from run 46099584414.
  Report `artifacts/wack-report-1.0.3.xml`.
- [x] Decide what follows the 1.0.3 smoke test: fix the first-download
  failure and ship 1.0.4 (Steve, 2026-11-28). fbuild 2.5.56 fetches the
  per-chip ESP32 toolchain slice in one read with no retry; the helper now
  runs the build up to twice more when a download broke off. Upstream report
  drafted, unposted: `tmp/fbuild-main/drafts/chip-slice-download-not-retried.md`.
- [ ] Build the v1.0.4 packages with the Desktop Packages workflow on GitHub
  (all four platforms, no draft release).
- [ ] Run WACK on the v1.0.4 MSIX.
- [ ] Smoke test the v1.0.4 Store package on a new account, long paths off:
  first launch and first upload to the ESP32-S3, the steps the change
  touches. Steve's report is the result.
- [ ] Microsoft Store: cancel the certified dry-run submission, swap in the
  1.0.4.0 package, resubmit, and **Publish now** once certified
  ([Microsoft Store](docs/release/microsoft-store.md#submit)).
- [ ] Decide whether 1.0.4 also gets a public GitHub release.

## macOS and Linux

The macOS and Linux archives ship unsigned and experimental until these pass.

- [ ] Join the Apple Developer Program (decided 2026-11-22, after Store
  certification), then sign the macOS app with a Developer ID and the hardened
  runtime, notarize and staple it.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md#macos-and-linux)).
- [ ] Run the Linux package on a clean machine.
