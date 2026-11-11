# v1 targeted compile pass

Compile evidence for [root todo](../../../todo.md), step 2: firmware that
landed between 2026-11-09 and 2026-11-11 and had only unit and host tests
behind it. Each section is one run. This is compile evidence only; nothing
here was flashed, and bench rows stay in the
[bench backlog](../../plans/bench-backlog.md).

## The six fixtures added on 12 November 2026

Twelve sketches from five generators, built on GitHub `windows-latest`
runners by the `Compile matrix` workflow with `every` on, so no leg was
pruned.

| Family | Sketches | What it compiles |
| --- | --- | --- |
| `control-graph` | `normal-ds3231`, `show-ds3231` | A Clock reading the DS3231 on the OLED's I2C bus (SDA 8, SCL 9), through the normal sketch's emitter and the control graph's |
| `uno-r4-wifi` | `ntp-zone`, `artnet-static` | WiFiS3 on an Arduino UNO R4 WiFi: NTP in Europe/Paris through `_rtcTzOffset`; Art-Net beside NTP on a named board at a static address (`setHostname`, DNS-second `config`) |
| `long-strings` | `string-720`, `string-4096` | Waveform's line style over an elementary Automaton on one LED string |
| `clock-sync` | `pattern-leader`, `pattern-follower`, `show-leader`, `show-follower` | Both boards of a two-board clock-sync project, cut by `boardPartition`, as one pattern and as the same collection show |
| `display` | `screens-normal`, `screens-show` | A design with two screens, a Go to screen button, a wired Screen input, a Text Entry feeding a Text and a Chart; a Spectrum on a microphone in the normal sketch, and Show Status on a second panel in the show |

A show analyses no live audio and refuses a Spectrum widget, so
`screens-show` leaves it out.

### Reproduce

```text
gh workflow run compile-matrix.yml -f every=true -f only="clock-sync/ uno-r4-wifi/ long-strings/ ds3231 display/screens"
```

Locally, one family at a time on Arduino CLI:

```text
python scripts/compile-fixtures/compile-matrix.py --every --only clock-sync/
```

### Result

Arduino CLI 1.5.1 with ESP32 core 3.3.12 and `arduino:renesas_uno` 1.6.0;
fbuild 2.5.51; FastLED 3.10.9. Sources are `main` at `2dbe01f4`
([run 43035986760](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43035986760)).
The three fbuild ESP32-S3 legs marked † are from the rerun at `ff821bd0`
([run 43043729239](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43043729239)),
at the same source hashes. `esp32` is `esp32:esp32:esp32`, `esp32s3` the
N16R8 FQBN the display runner uses, `unor4wifi`
`arduino:renesas_uno:unor4wifi`. Byte counts are comparable across engines
only loosely: fbuild counts RAM differently on the S3.

| Leg | Board | Source SHA-256 prefix | Arduino flash | Arduino RAM | fbuild flash | fbuild RAM |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `clock-sync/pattern-leader` | esp32 | `8c08c514d7e2` | 926,171 | 49,216 | 952,494 | 49,347 |
| `clock-sync/pattern-follower` | esp32 | `df33bb97c1e8` | 926,163 | 49,216 | 952,484 | 49,347 |
| `clock-sync/show-leader` | esp32 | `5c6df7ddfedd` | 929,679 | 50,208 | 955,802 | 50,371 |
| `clock-sync/show-follower` | esp32 | `c97280b53633` | 929,963 | 50,224 | 956,027 | 50,381 |
| `long-strings/string-720` | esp32 | `a3dc1d0aa6ab` | 396,663 | 33,640 | 398,756 | 33,782 |
| `long-strings/string-4096` | esp32 | `70fb9a56dc4d` | 396,595 | 64,024 | 398,715 | 64,164 |
| `control-graph/normal-ds3231` | esp32s3 | `64fa96885ce1` | 401,171 | 27,628 | 460,524 † | 85,412 † |
| `control-graph/show-ds3231` | esp32s3 | `20d432838899` | 563,887 | 38,444 | 619,919 | 95,662 |
| `display/screens-normal` | esp32s3 | `0587ef3f23f5` | 623,123 | 37,764 | 675,082 † | 91,648 † |
| `display/screens-show` | esp32s3 | `ac2b52319024` | 542,619 | 35,788 | 595,917 † | 89,416 † |
| `uno-r4-wifi/ntp-zone` | unor4wifi | `0cc5826dde10` | 66,496 | 9,824 | failed | — |
| `uno-r4-wifi/artnet-static` | unor4wifi | `3b9080ccb4d2` | 68,096 | 11,832 | failed | — |

All twelve pass on Arduino CLI. Ten pass on fbuild.

### What the run found

- **fbuild does not find `WiFiS3.h`.** Both `uno-r4-wifi` sketches stop at the
  include on fbuild 2.5.51. The app now builds an UNO R4 WiFi sketch that
  uses the network with arduino-cli, and the matrix keeps this family off
  fbuild ([runbook §16](../../runbooks/fbuild-workarounds.md#16-uno-r4-wifi-sketches-that-use-the-network-do-not-compile)).
  The names assumed from the Renesas core (`ARDUINO_UNOWIFIR4`, `WiFiS3.h`,
  `setHostname`, the DNS-second `config`) compile as written on core 1.6.0.
- **A runner ran short of disk.** On the first run the three † legs built
  nothing: fbuild's preflight wants 5 GB free beside its cache and the shard
  had 4.98 GB. The workflow now sets `FBUILD_MIN_DISK_BYTES` to 2 GB, and the
  rerun passed.
- **The 4096-LED string costs 30 KB more static RAM than the 720-LED one**
  on a classic ESP32 (64,024 against 33,640 bytes), and no more flash.

### Not established here

- Whether the boards keep time: the clock-sync bench row needs two boards on
  one network.
- Whether WiFiS3 joins, syncs or receives Art-Net on a real UNO R4 WiFi.
- A DS3231 answering on the bus, and a 4096-LED string lighting.

## The rest of step 2, 12 November 2026

Every line of step 2 that had no compile behind it, built on GitHub
`windows-latest` runners with `every` on. 426 legs pass: 423 on Arduino CLI
1.5.1 (ESP32 core 3.3.12) and 3 on fbuild 2.5.51, with FastLED 3.10.9.

The new family is `v1-variants`: 95 sketches from
`scripts/compile-fixtures/v1-variants.ts`, one for each node setting the pass
names that no other fixture reaches. The other families already existed and
were run because the pass names them.

### Reproduce

```text
gh workflow run compile-matrix.yml -f engine=arduino-cli -f every=true -f shards=20 -f only="v1-variants/ dead-code/ pattern-collections/ show-sequencing/ control-graph/ ethernet/ board-links/ power-switch/ ssr/ dmx/ keypad/ touchpad/ presence/ encoder/ motion/ display/screens"
```

The workflow holds one waiting run for each branch: a second dispatch while
one waits cancels the first.

### Runs

| Run | Sources | What it built |
| --- | --- | --- |
| [43052607583](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43052607583) | `9398628c` | The whole pass, Arduino CLI: 396 of 399 legs passed, and one runner was lost with 21 legs unbuilt |
| [43068722586](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43068722586) | `a5c7d5ea` | The three failures after their fixes, both engines |
| [43069083943](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43069083943) | `1bb65960` | Five of the legs the lost runner held |
| [43073898275](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43073898275) | `1bb65960` | The other sixteen, and three variants added after the first run |
| [43085616039](https://github.com/stevenmunn312-tech/Design-Studio-for-FastLED/actions/runs/43085616039) | `ad9bc689` | The seeded Music Player variant |

### Result by family

| Family | Legs | What it compiles |
| --- | ---: | --- |
| `dead-code` | 253 | A normal sketch for every node's live example, and the music, performance, slideshow and telemetry variants |
| `pattern-collections` | 4 | Every bundled pattern, as SD player collections |
| `show-sequencing` | 6 | Sequenced, weighted, tagged-dwell and ramped shows and players, with the `SET_ENERGY` ramp in `ramped-show` |
| `control-graph` | 8 | The control graph in the normal sketch, show and player, with NTP in Europe/Paris, Ethernet and the DS3231 |
| `ethernet` | 8 | Wired and Wi-Fi network identity on a classic ESP32, S2, S3 and C3 |
| `board-links` | 8 | Every board of the five linked-board runs, ESP32, ESP32-S3 and ESP8266 |
| `power-switch` | 16 | Power Switch on ESP32, ESP8266, AVR, RP2040 and Teensy 4.1, with the RGB strip on `yynmos4-rgb` and `mosfetti-rgb-avr` |
| `dmx` | 4 | A DMX512 node on a classic ESP32, S3, C3 and C6 |
| `ssr` | 1 | The solid-state relay and its button row |
| `keypad` | 4 | Keypad in the normal sketch, slideshow and player |
| `touchpad` | 4 | Touch Pad in the normal sketch, slideshow and player |
| `presence` | 4 | The radar in the normal sketch, slideshow and player |
| `encoder` | 3 | Encoder clicks, bare and as a module, in the normal sketch and slideshow |
| `motion` | 4 | The accelerometer in the normal sketch, slideshow and player |
| `display` | 2 | Custom screens, now with a log Slider and Dial |
| `v1-variants` | 97 | The table below |

Per-leg hashes and sizes for these families are in each run's
`compile-matrix-record` artifact.

### The variant sketches

`esp32` is `esp32:esp32:esp32`, `esp32s3` an ESP32-S3 (the two starters on the
N16R8 FQBN with the 16 MB partition scheme), `uno` `arduino:avr:uno` and
`d1_mini` `esp8266:esp8266:d1_mini`. The two sketches fixed after the first
run also pass on fbuild.

| Sketch | Board | Engine | Source SHA-256 prefix | Flash | RAM |
| --- | --- | --- | --- | ---: | ---: |
| `accel-shake` | esp32 | Arduino CLI | `0e5806765f85` | 330,215 | 25,352 |
| `audio-features-level` | esp32 | Arduino CLI | `34f3b7390911` | 396,427 | 26,680 |
| `bands-mic-s3` | esp32s3 | Arduino CLI | `21d3fb159e96` | 419,171 | 29,680 |
| `bands-no-mic` | esp32 | Arduino CLI | `dc673c37fa00` | 317,811 | 27,632 |
| `boids-density` | esp32 | Arduino CLI | `6d1fbdb0ba3b` | 309,131 | 27,392 |
| `bundled-bass-cathedral-collapse` | esp32 | Arduino CLI | `c18301353c38` | 412,723 | 32,832 |
| `bundled-beat-temple` | esp32 | Arduino CLI | `4103b5db0edc` | 402,303 | 27,912 |
| `bundled-chromasonic-vortex` | esp32 | Arduino CLI | `19d7918257ca` | 411,367 | 29,592 |
| `bundled-chromatic-orbit-reactor` | esp32 | Arduino CLI | `b5d9d4050dc4` | 407,079 | 32,096 |
| `bundled-golden-ratio-cathedral` | esp32 | Arduino CLI | `fcbc12be1be3` | 409,863 | 33,848 |
| `bundled-laser-monsoon-parade` | esp32 | Arduino CLI | `2bc1fe4b743f` | 402,135 | 29,552 |
| `bundled-lissajous-lattice` | esp32 | Arduino CLI | `4ab50d1d00b9` | 405,511 | 30,744 |
| `bundled-prism-fracture` | esp32 | Arduino CLI | `6c21892b6292` | 406,207 | 28,864 |
| `bundled-psydance` | esp32 | Arduino CLI | `4dcb94454a1f` | 406,407 | 29,432 |
| `clock-zone-esp8266` | d1_mini | Arduino CLI | `8b22bfce5a75` | 250,812 | 29,260 |
| `code-ab` | esp32 | Arduino CLI | `631a31221493` | 302,583 | 25,096 |
| `color-trails-independent` | esp32 | Arduino CLI | `9b5e14c08c6c` | 312,799 | 25,944 |
| `color-trails-linked` | esp32 | Arduino CLI | `d1892a8e81bc` | 312,783 | 25,944 |
| `dance-flash-ember-palette` | esp32 | Arduino CLI | `bdea8308eb9f` | 398,071 | 27,856 |
| `ddp-live` | esp32 | Arduino CLI | `ccc0b7448d19` | 924,731 | 49,144 |
| `demo-drums-kick-shock` | esp32 | Arduino CLI | `5f4d3fb7c4ff` | 305,175 | 25,264 |
| `demo-drums-percussion-blobs` | esp32 | Arduino CLI | `8887020f84a1` | 304,283 | 25,312 |
| `dmx-beside-dfplayer` | esp32 | Arduino CLI | `012e07a45e42` | 324,907 | 25,832 |
| `dmx-beside-radar` | esp32 | Arduino CLI | `1f7e954d53e6` | 324,811 | 25,808 |
| `dmx-live` | esp32 | Arduino CLI | `7404bddb064a` | 925,107 | 49,656 |
| `envelope-beat-phase` | esp32 | Arduino CLI | `71a1f5f90f80` | 394,123 | 26,448 |
| `fire-2012` | esp32 | Arduino CLI | `86ce957fe57c` | 303,431 | 25,400 |
| `fire-classic` | esp32 | Arduino CLI | `6df75eadff1e` | 303,427 | 25,400 |
| `fire-smoke` | esp32 | Arduino CLI | `a3b5dccba9fe` | 304,363 | 25,400 |
| `font-3x5` | esp32 | Arduino CLI | `8c526ddbfffa` | 305,663 | 30,496 |
| `font-4x6` | esp32 | Arduino CLI | `21c2625cbfc2` | 305,735 | 30,496 |
| `font-5x8` | esp32 | Arduino CLI | `e6a125b97460` | 305,715 | 30,496 |
| `font-6x8` | esp32 | Arduino CLI | `292dde2375fb` | 305,747 | 30,496 |
| `formula-points-attractor` | esp32 | Arduino CLI | `ba38b05ce9c3` | 312,835 | 25,176 |
| `formula-points-lissajous` | esp32 | Arduino CLI | `24bfe1d7778a` | 315,415 | 25,184 |
| `formula-points-logistic` | esp32 | Arduino CLI | `362b997bbfde` | 307,491 | 25,144 |
| `formula-points-rose` | esp32 | Arduino CLI | `d52e10cb92d6` | 315,563 | 25,184 |
| `frame-transform-exact-rate` | esp32 | Arduino CLI | `533876446803` | 304,951 | 26,944 |
| `frame-transform-smooth` | esp32 | Arduino CLI | `25b93f468de3` | 308,603 | 26,944 |
| `frame-warp-ripple` | esp32 | Arduino CLI | `4f4dc8f45379` | 308,667 | 26,944 |
| `frame-warp-swirl` | esp32 | Arduino CLI | `f834c615bb2b` | 308,811 | 26,944 |
| `frame-warp-turbulence` | esp32 | Arduino CLI | `8901798395f9` | 308,671 | 26,944 |
| `gamma-player` | esp32s3 | Arduino CLI | `e599eae98075` | 963,899 | 43,952 |
| `gamma-ring` | esp32 | Arduino CLI | `21e3ac50f08b` | 303,955 | 23,872 |
| `gamma-show` | esp32 | Arduino CLI | `55123688009c` | 307,879 | 28,660 |
| `gamma-single` | esp32 | Arduino CLI | `81158d09cf03` | 304,443 | 25,144 |
| `gamma-two-outputs` | esp32 | Arduino CLI | `76d7a525ba10` | 306,319 | 25,304 |
| `hub75-size-2` | esp32 | fbuild | `da70728763fb` | 269,548 | 28,232 |
| `keypad-keys-digit` | esp32 | Arduino CLI | `9f8a3acfd0da` | 302,667 | 23,944 |
| `midi-din-pair` | esp32 | Arduino CLI | `6d3e289dfcd1` | 322,275 | 24,264 |
| `mirror-radial-rotation-only` | esp32 | Arduino CLI | `4bf32ebf48b1` | 305,051 | 26,936 |
| `mirror-radial-strip` | esp32 | Arduino CLI | `80e3dac2f48c` | 304,783 | 24,216 |
| `mirror-radial-turned` | esp32 | Arduino CLI | `c31411fb90d0` | 305,551 | 26,944 |
| `noise-contrast` | esp32 | Arduino CLI | `a9bddc54ee87` | 304,111 | 26,168 |
| `noise-plasma-lava` | esp32 | Arduino CLI | `e8e2b07130c6` | 307,843 | 26,168 |
| `particles-chase` | esp32 | Arduino CLI | `49595b4a0bde` | 310,887 | 27,552 |
| `particles-comet` | esp32 | Arduino CLI | `1ba83e8db376` | 310,315 | 26,592 |
| `particles-fireworks` | esp32 | Arduino CLI | `e32a08e18197` | 310,755 | 27,552 |
| `particles-luminova` | esp32 | Arduino CLI | `d958667c2b84` | 312,219 | 29,000 |
| `particles-waterfall` | esp32 | Arduino CLI | `d9afff5f0817` | 306,911 | 27,552 |
| `path-speed` | esp32 | Arduino CLI | `ca8fa084b51e` | 307,155 | 25,096 |
| `pixels-text-clock-line` | esp32 | Arduino CLI | `3d7be546b769` | 309,383 | 28,192 |
| `plasma-scale` | esp32 | Arduino CLI | `49df10f378d4` | 303,627 | 25,144 |
| `plasma-sine-2d` | esp32 | Arduino CLI | `87d7e868cf21` | 306,987 | 25,144 |
| `plasma-sine-grid` | esp32 | Arduino CLI | `1ae2a0d52e52` | 303,451 | 25,144 |
| `player-seed` | esp32s3 | Arduino CLI | `c3a48397a96c` | 963,891 | 43,952 |
| `presence-connected-mm` | esp32 | Arduino CLI | `211a4ef12f67` | 322,303 | 24,248 |
| `reaction-diffusion` | esp32 | Arduino CLI | `5962f979439b` | 303,815 | 29,248 |
| `saturation-keep-brightness` | esp32 | Arduino CLI | `3b7393c93662` | 304,255 | 26,168 |
| `shape-field-rose-spin` | esp32 | Arduino CLI | `00174ad93925` | 308,275 | 26,168 |
| `shape-field-superformula` | esp32 | Arduino CLI | `e1a0cdb2ca0d` | 310,403 | 26,168 |
| `slideshow-audio-cascade` | esp32 | Arduino CLI | `14c0ae0a346d` | 400,751 | 30,300 |
| `start-corner-bottom-left-tiled` | esp32 | Arduino CLI | `d817cd2a1622` | 302,803 | 23,944 |
| `start-corner-bottom-right-vertical` | esp32 | Arduino CLI | `63114cffb5e8` | 303,199 | 25,096 |
| `start-corner-top-right-rows` | esp32 | Arduino CLI | `2af9f55040df` | 303,199 | 25,096 |
| `starter-generative-show` | esp32s3 | Arduino CLI | `71884e3e6895` | 1,213,183 | 102,812 |
| `starter-player-transport` | esp32s3 | Arduino CLI | `ef81dc64e999` | 1,247,335 | 106,644 |
| `string-particles-ring-drift` | esp32 | Arduino CLI | `eb3db36b58a2` | 316,183 | 26,312 |
| `string-particles-ring-meteors` | esp32 | Arduino CLI | `0f9167e0ecc4` | 317,319 | 26,312 |
| `strip-formula-r-avr` | uno | Arduino CLI | `712cd20d1bfe` | 6,000 | 603 |
| `strip-formula-r` | esp32 | Arduino CLI | `5e122809bc31` | 302,535 | 24,024 |
| `strip-fourier-avr` | uno | Arduino CLI | `a980db2bb7a0` | 9,222 | 560 |
| `strip-fourier` | esp32 | Arduino CLI | `67c1f68c2746` | 308,303 | 23,968 |
| `strip-geometry-avr` | uno | Arduino CLI | `68de0d9a2c41` | 7,132 | 603 |
| `strip-geometry` | esp32 | Arduino CLI | `d18929a89f14` | 304,607 | 24,032 |
| `strip-path-avr` | uno | Arduino CLI | `b2d5e0e6a6c8` | 6,296 | 315 |
| `strip-path` | esp32 | Arduino CLI | `7b54d4d97247` | 306,355 | 23,744 |
| `strip-shape-field-avr` | uno | Arduino CLI | `036276ee076d` | 6,042 | 596 |
| `strip-shape-field` | esp32 | Arduino CLI | `c80b637fdf41` | 302,559 | 24,032 |
| `switch-literal` | esp32 | Arduino CLI | `b610e00500a8` | 301,807 | 23,944 |
| `text-base` | esp32 | Arduino CLI | `aae98f444065` | 304,379 | 26,688 |
| `touchpad-pads` | esp32 | Arduino CLI | `249b2633d20d` | 329,907 | 25,336 |
| `trail-confetti` | esp32 | Arduino CLI | `9d39a933b435` | 307,915 | 25,184 |
| `trail-game-of-life` | esp32 | Arduino CLI | `49fa87e06846` | 306,011 | 26,944 |
| `trail-trails` | esp32 | Arduino CLI | `0b0eaf2c335d` | 309,367 | 26,960 |

### What the pass found

- **Audio Features' Level and Silence did not compile alone.** Both read the
  host's loudness, and the host published `_audioLoudness` only while the
  Loudness output itself was wired. A sketch reading only Level stopped at
  `'_audioLoudness' was not declared in this scope`. Fixed in `a5c7d5ea`.
- **A two-output sketch could lose half a declaration.** The cleanup that
  removes unread locals did not know `constexpr`: where no node in the render
  body read the LED count, it removed `int RENDER_LEDS = ...;` and left
  `static constexpr` behind. Plasma into a matrix and a strip was enough.
  Fixed in `a5c7d5ea`.
- **A HUB75 sketch does not build on the Arduino CLI engine.** The helper
  vendors the DMA library for fbuild only, so Arduino CLI stops at
  `ESP32-HUB75-MatrixPanel-I2S-DMA.h`. `hub75-size-2` passes on fbuild and the
  matrix keeps it there. The gap is open in the [root todo](../../../todo.md).
- **DMX512, a radar and a DFPlayer do not fit one classic ESP32.** The deploy
  gate refuses the third UART, so the allocator is compiled as two sketches,
  DMX512 beside each of the others.
- **The five strip sketches fit an Arduino Uno**, the largest at 9,222 bytes of
  flash and 603 bytes of static RAM.

### Not established here

- The Music-synced SD Show starter as its own sketch: it needs an analysed
  track. Its generator is covered by the `dead-code/performance-*` legs.
- Anything on fbuild beyond the three variants named above; the full matrix
  on both engines is step 5.
- Whether any of it runs: nothing here was flashed.
