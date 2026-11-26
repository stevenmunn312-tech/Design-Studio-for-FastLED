# Shipping v1.0.2

v1.0.0 and v1.0.1 were tagged on 2026-11-22 and never published; v1.0.2
(2026-11-26) replaces them. Only the steps that ship v1.0.2 are here; tick a step when its outcome is recorded where it belongs, and empty
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
- [ ] The Store smoke test under Publish below, on the 1.0.2 package, on an
  account that has never run fbuild, through first download and upload.
  Until it passes, the halt stands.

State: the Store holds only the certified, unpublished 1.0.0 dry run (leave
it alone); tags `v1.0.0` and `v1.0.1` exist with private draft releases, both
superseded by `v1.0.2`. The 1.0.1 builds are also on an unlisted preview page
on the website for one invited tester.

## Pre-release firmware review (2026-11-26)

A desk review of the generated firmware for every hardware item, by three
reviewers, with no hardware and 11 local compiles. Nothing below is fixed yet:
tick an item when you have decided it (fix for v1.0.2, defer to
[post-v1](docs/plans/post-v1.md), or reject). Each item says how far it was
proved: **compiled** (a local build shows it), **emitted** (seen in a finished
sketch), or **bench** (needs hardware to settle). Time figures are estimates;
byte figures were measured. Reviewer notes and sketches are in the local,
gitignored `tmp/firmware-review/`.

### Builds fail or the part cannot work

- [ ] **I2C sensors in shows and players, every non-ESP board** (compiled).
  The control graph emits `Wire.begin(sda, scl)` on all boards
  (`controlInputCpp.ts:155,164,173`, `motionVectorCpp.ts:47`,
  `touchPadCpp.ts:68`, `distanceSensorCpp.ts:53`). RP2040 fails with
  `no matching function for call to 'TwoWire::begin(int, int)'`; AVR, Teensy
  and Renesas have no such overload either; on Adafruit SAMD it compiles as
  `begin(address, generalCall)` and makes the board an I2C slave. Validation
  passes all of them. The normal sketch is right (`cppGenerator.ts:840-844`).
- [ ] **IR on UNO, Nano and Nano Every** (compiled). The IR learner uses
  `Serial.printf` (`irLearnSketch.ts:41`), which AVR lacks, so keys cannot be
  mapped on those boards at all. Encoder Debug fails the same way
  (`controlInputCpp.ts:133`).
- [ ] **SH1106 SPI OLED and MAX7219 on a shared SPI bus** (emitted, bench).
  Both bit-bang with `digitalWrite` on SCK/MOSI pins the hardware SPI host
  owns once a TFT or card starts it; ESP32 core 3.3.12 refuses that write
  silently, so the part stays dark. `busTopology.ts:114-158` allows the
  sharing and `part-families.ino` builds it.
- [ ] **Pot, joystick and LDR on ESP32-S2** (emitted). The S2 ADC returns 13
  bits and the sketch divides by 4095 (`helpers/analogReadCpp.ts:14-15`): a
  pot is full at half travel. Fix: `analogReadResolution(12)`.
- [ ] **Live Stream on UNO, Nano and Mega** (arithmetic). 921600 baud lands at
  1,000,000 on a 16 MHz AVR, 8.5 % off (`streamReceiverGenerator.ts:76,131`).
- [ ] **Power limit on 12 V strips** (emitted). `setMaxPowerInVoltsAndMilliamps`
  runs on FastLED's 5 V WS2812 model, so the cap passes about 3.3 times the
  set current on WS2811 and 1.4 times on WS2815 and at 5 V, against the
  app's own `build/power/ledDraw.ts`. No generator emits `setPowerModel`.
- [ ] **Stereo VU with a second LED output** (emitted). The VU rails miss the
  Board's master brightness and run about twice as bright
  (`cppGenerator.ts:1714-1725`, `showGenerator.ts:1413`).
- [ ] **Wi-Fi hostname on ESP32 core 3** (emitted, core source). Set after
  `WiFi.mode`, so the router never sees it (`networkCpp.ts:150-158`).
- [ ] **Rotary encoder** (emitted, bench for how much). Sampled once a frame,
  so brisk turns and slow frames drop detents (`controlInputCpp.ts:109-115`).
- [ ] **IR receive on AVR** (FastLED source, bench). `FastLED.show()` and the
  dither refreshes hold interrupts off for most of each frame.
- [ ] **Animation clock on long runs** (arithmetic). `float t = millis()/1000.0f`
  is coarser than a frame after about 1.5 days (`player/masterSpeedCpp.ts:42`).
- [ ] **SD Video** (emitted, bench). The card mounts before the other chip
  selects on its bus are high, and never retries (`nodes/shapes/codegen.ts:99`).
- [ ] **Touch calibration on ILI9341** (emitted, bench). The sketch skips the
  controller init stream (`touchCalibrationSketch.ts:153`).
- [ ] **Clock sync follower** (emitted, experimental). Steps its clock on every
  datagram with Wi-Fi sleep on (`boardSyncCpp.ts:240`).
- [ ] Not settled without a bench: SD player audio dropouts beside TFT
  repaints; microphone adapters on RP2040, SAMD51 and STM32 blocking 11.6 ms a
  read; PCM1802 sample alignment (it compiles on the S3); DS18B20 slot timing
  on core 3; joystick centre bias on classic ESP32.

### Speed, size and memory

- [ ] **Output gamma as a baked table.** Default gamma 2.2 runs a fixed-point
  `pow` three times per LED per frame (`ledOutputRuntimeCpp.ts:131-140`).
  Measured on the Uno: flash 9,890 to 8,382 bytes, RAM unchanged. Estimated
  time: 17 ms a frame for 30 LEDs on the Uno, 5 to 9 ms for 16x16 on ESP8266.
- [ ] **Segment and OLED drivers per transport.** Kind, transport and
  controller are run-time fields, so a TM1637 sketch carries the MAX7219
  driver and an SPI OLED carries `Wire` and the I2C arms. Measured on the S3:
  an SPI-only OLED drops 27,992 bytes of flash and 1,392 of RAM without them.
- [ ] **I2C at 400 kHz.** No sketch calls `Wire.setClock`. An I2C OLED flush is
  about 110 ms once a second; each I2C sensor read is 0.7 to 1.1 ms slower
  than it needs to be.
- [ ] **TFT text and LVGL flush in bulk SPI.** Fixed layouts draw one fill per
  lit font pixel, a byte per transfer (`tftDisplayCpp.ts:729-747`); the LVGL
  flush is a byte per transfer and keeps the parallel arm in SPI builds
  (`customDisplayPanelCpp.ts:173,201-215`). `TftPanel::scratch` is unused: 64
  bytes of RAM a panel.
- [ ] **Microphone detectors on demand.** Beat, bass, mid, treble and BPM are
  always registered and polled, so FastLED runs analysers nothing reads
  (`audioEngineCpp.ts:339-346,366-396`).
- [ ] Smaller: BME280 read every frame against a 1 s standby; PCA9685
  rewritten on ADC noise; half-resolution upscale in float (integer form is
  identical); show patterns copied into `leds` (3 x NUM_LEDS bytes); the two
  INA read helpers are identical.

### Code the sketch cannot reach

- [ ] `boardCppFacts` (`cppSpecialize.ts:6-17`) does not know
  `CONFIG_IDF_TARGET_*`, `ARDUINO_ARCH_*`, `TEENSYDUINO` or `HSPI`, so those
  `#if` arms stay as text. No binary cost.
- [ ] The touch calibration sketch skips `finishCpp` (`_tftPaint`, `_tftField`
  and `_tftFit` unused); the wiring diagnostic paces with `FastLED.delay`.
- [ ] `// Board — not yet supported in code gen` is in every real sketch
  (`cppGenerator.ts:1165`); `firmware-generation.md:35` says the fixed
  layouts use the 3x5 font, the sketches use 5x8.

### Compile coverage

- [ ] Run the pre-release matrix once the fixes above are in, after your
  go-ahead: `python scripts/compile-fixtures/compile-matrix.py --preset prerelease`
  (54 builds, 52 on arduino-cli and 2 on fbuild; the legs and what each
  proves are in `scripts/compile-fixtures/prerelease-legs.json`).
- [ ] Add the legs nothing builds today: a chipset sweep (RGBW, WS2816,
  SM16824E, HD108, `DATA_RATE_MHZ`; it built on the Uno, classic ESP32 and C6
  in this review), the IR learner on AVR, a show with an I2C sensor on RP2040,
  the stream receiver, HUB75 on the S3, PCM1802 line-in, the SD pin probe.
- [ ] Not reviewed: the standalone display, board-link waiting screens, the VU
  level emitter, Bluetooth and radio sources, the provisioner sketch.

## Fresh preview for the invited tester

`main` has moved well past 1.0.1 (first-launch showcase, true-light previews,
Gamma 2.2 default, the gamma floor, the loudness retune, the volume fix, the
shelf fix). The preview page still serves 1.0.1.

- [x] Bench-check Gamma 2.2 on a real matrix against the preview: colours and
  contrast match, a fade reaches off without stepping badly, Gamma 1 looks
  washed out on both. Steve, 2026-11-24.
- [ ] Once that passes, run the Desktop Packages workflow on GitHub for all
  four platforms (Steve approved this one run on 2026-11-23). Use a
  pre-release tag, not `v1.0.0` or `v1.0.1`; no draft release.
- [ ] Replace the files on the preview page (bucket folder unchanged, so the
  link stays the same) and tell the tester what is still open: ESP32 builds
  with long paths off, unsigned builds.

## Publish

v1.0.2 is the release: `main` on 2026-11-26, with fbuild 2.5.55 and the
esptool fix that let a Store install build ESP32 boards with long paths off.
The v1.0.0 and v1.0.1 draft releases and their MSIX files are superseded.

- [ ] Pico W, Teensy and STM32 boards: fbuild 2.5.55 cannot build them with
  long paths off
  ([record](docs/release/long-paths-blocker.md#other-board-families-on-fbuild-2555-2026-11-26)).
  Reported on 2026-11-26 as FastLED/fbuild#2187, and Steve messaged Zach.
  Decision, 2026-11-26: wait for the upstream answer before choosing. When a
  fixed fbuild is released, move the pin and rerun the three boards in
  `tmp/fbuild-shortpath-repro` with long paths off. If no fix comes, ship
  with the
  [known limitation](docs/release/beta-support-matrix.md#known-limitations-in-v100)
  or build those families with arduino-cli when long paths are off (a code
  change, so a new version).
- [ ] Build the v1.0.2 packages with the Desktop Packages workflow on GitHub
  (needs Steve's go-ahead for this run). The same run can refresh the
  preview page above.
- [ ] Test the v1.0.2 Store package the way a real user meets it: Windows
  long paths **off**, a new account with a long username that has never run
  fbuild, first build and upload
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md)).
- [ ] Run WACK on the v1.0.2 MSIX (the v1.0.1 pass, 2026-11-22, does not
  carry over).
- [ ] Microsoft Store: cancel the certified dry-run submission, swap in the
  1.0.2.0 package, resubmit, and **Publish now** once certified
  ([Microsoft Store](docs/release/microsoft-store.md#submit)).
- [ ] Review the v1.0.2 draft GitHub release and publish it; delete the
  v1.0.0 and v1.0.1 drafts.

## macOS and Linux

The macOS and Linux archives ship unsigned and experimental until these pass.

- [ ] Join the Apple Developer Program (decided 2026-11-22, after Store
  certification), then sign the macOS app with a Developer ID and the hardened
  runtime, notarize and staple it.
- [ ] Run the macOS package on a clean machine, Apple Silicon and Intel
  ([clean-machine smoke test](docs/release/clean-machine-smoke-test.md#macos-and-linux)).
- [ ] Run the Linux package on a clean machine.
