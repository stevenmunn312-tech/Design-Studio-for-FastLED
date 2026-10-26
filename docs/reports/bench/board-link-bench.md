# Board links over ESP-NOW — bench record

The D-13 bench row in the root todo, section 4, run on real boards. Design
and limits are in [board links](../../design/board-links.md); the compiles
behind these sketches are in the
[compile checks](../compile/board-link-compile-checks.md). Support scope
belongs to the [support matrix](../../release/beta-support-matrix.md). This
record applies to the rig below.

## Run 1 — a Music Player and its touch screen, 2026-10-26

The first linked pair to run. The bench row names an XC4630 colour panel for
Board 2; an ESP32-2432S028R (CYD) took its place, so the screen design, the
touch panel and its controls are the board's own.

### Rig

| | |
|---|---|
| Board 1 | Generic ESP32-S3 N16R8, 44-pin: Music Player, 26x17 WS2812B matrix on pin 1, microSD on SPI (MISO 13, MOSI 11, SCK 12, CS 10), MAX98357A (LRC 18, BCLK 17, DIN 16) |
| Board 2 | ESP32-2432S028R: its ST7789 panel and XPT2046 touch, a screen design with Previous, Play / Pause, Next and a volume Slider bound to the player |
| Links | Board 2's Touch Screen Controls into the Music Player; the Music Player's Display into Board 2's panel |
| Network | None, then a phone hotspot (Board 2 on it through Keep boards in time; Board 1 joins no Wi-Fi) |
| Telemetry | Report telemetry on both boards; both serial ports logged on one PC with its own timestamps |
| Toolchain | arduino-cli 1.5.1, ESP32 core 3.3.11, FastLED 3.10.5, ESP32-audioI2S 3.0.12 |

### Results

| Test | Result |
|---|---|
| Next, Play / Pause from Board 2 | Pass: every press acted, 4 of 4 and 7 of 7 Nexts in two runs |
| Title and position on Board 2 | Pass: the title changes with the track |
| Volume slider | Pass: follows the finger, holds where released, survives a track change |
| Board 2 reset | Pass: Board 1 kept playing at the same volume; Board 1 heard Board 2 again 2.8 s after the reset |
| Board 1 reset | Pass: Board 2 blanked its title, kept its slider, and Board 1 came back at Board 2's volume; the link was down about 11 s while Board 1 restarted and mounted its card |
| On a Wi-Fi network | Pass: Board 1 found the hotspot's channel and both directions ran as off Wi-Fi |
| Hotspot off, then on | Pass: the link limped on the old channel while the hotspot was down and was whole again 1 to 1.5 s after it returned |
| Range | 15 m through four interior walls with no frame lost to distance; the limit was not reached |
| Latency, touch to action | 240, 239 and 285 ms from Board 2 logging a press on Next to Board 1 closing the track |
| Wi-Fi heap on Board 1 | 130,236 bytes free without the link; 55,400 with it, on or off Wi-Fi: about 75 KB |
| Rejected frames | 0 by key, link id, schema or age in every run |

Frames ran at about five a second each way. Latency is mostly that cadence
and Board 1's loop (about 75 ms): the radio's own share is a few
milliseconds. It is measured through two USB serial ports on one PC, so each
figure carries a few milliseconds of jitter.

### What the bench changed

Each was a firmware bug found here and fixed before the passing runs above:

- FastLED's `FL_DBG` lines were on in every build and filled Board 1's
  serial; both engines now pass `-DFASTLED_DISABLE_DBG=1` (`ddbf174e`).
- The player reported its volume out of 21 but set it out of 18, so the
  synced slider shrank it to zero round trip by round trip (`4a7160be`).
- The decoder tap's ring was shared unlocked between the audio task and the
  loop; a lost update froze the LEDs and the link for 9 to 16 seconds after a
  track change (`95ccb428`). Board 1 rose from 9 to 14 fps with it.
- A synced control took a reading still a round trip behind the finger, and
  took the reading's lost value while the sender was quiet (`e68e6801`), and
  took a restarted sender's start-up value (`9cce84c4`).
- A board off Wi-Fi stayed on the link channel beside one on a network; it
  now scans for that network's channel (`a87e4dea`).

### Still open

- A track change blocks Board 1's loop for about 1.35 s while the decoder
  primes the new file, so the link is late by that much once per track.
- Board 1 renders at 14 fps while playing: FastLED's audio analysis costs
  about 30 ms per 512-sample block. Not a link fault.
- While its network is gone, Board 2 prints
  `wifi:sta is connecting, cannot set config` every 5 seconds: the reconnect
  calls `WiFi.begin` again during a connect.

## Run 2 — an OLED and a bare encoder as the remote, 2026-10-27

Board 2 is a classic ESP32 with a 128x64 SSD1306 and a bare encoder: the
player's volume from turning, Next from pressing, and its title and position
on the OLED. Both boards off Wi-Fi.

### Rig

| | |
|---|---|
| Board 1 | Run 1's ESP32-S3 Music Player |
| Board 2 | Generic ESP32 DevKit, 38-pin: an SSD1306 0.96-inch OLED on I2C (SDA 21, SCL 22, 0x3C) and a Jaycar SR1230 bare encoder (A 13, B 14, SW 16, C and the switch's other leg to ground) |
| Links | The Encoder's Level (start 1, 10 clicks from 0 to 1) into the Music Player's Volume; its Pressed into Next; the Music Player's Display into the OLED |
| Network | None |
| Telemetry | As run 1 |
| Toolchain | As run 1 |

### Results

| Test | Result |
|---|---|
| Volume from turning | Pass: the volume follows the knob and stops at silence and at full |
| Next from pressing | Pass |
| Title and position on the OLED | Pass |
| Link | About five frames a second each way; Board 2 at 60 fps with its loop under 19 ms, 226 KB heap free |
| Rejected frames | 0 by key, link id, tag or age. 784 by link hash, all before Board 2's upload caught up with Board 1's |

### What the bench changed

- Volume from an encoder needed a Map Range from its raw Position with a
  range worked out by hand, and Position ran on past the ends, so turning
  back from silence did nothing for as many clicks as had been turned too
  far. The Encoder now has a Level output held between 0 and 1 as it counts
  (`e381f929`).
- Nothing on the board said whether the encoder was being read. Its Debug
  toggle prints Level, Position and each press and release to the serial
  monitor (`a08074ec`).

## Run 3 — an ESP8266 Web Remote on another board's brightness, 2026-10-26

A phone page served by Board 2 sets the brightness of Board 1's LEDs while
Board 1 plays music: a sender on Wi-Fi, a receiver off it, and an ESP8266 on
the link for the first time.

### Rig

| | |
|---|---|
| Board 1 | Run 1's ESP32-S3 Music Player, its LED output's Brightness wired from Board 2 |
| Board 2 | Wemos D1 R2 (ESP8266): a Web Remote with one Brightness slider, 0 to 1 in steps of 0.01, wired to Board 1's LED output Brightness |
| Network | A phone hotspot on channel 1: Board 2 joins it to serve the page; Board 1 joins no Wi-Fi and follows the channel |
| Telemetry | As run 1 |
| Toolchain | As run 1, with ESP8266 core 3.1.2 for Board 2 |

### Results

| Test | Result |
|---|---|
| Slider to brightness | Pass: Board 1's LEDs follow the phone's slider |
| The page | Pass: answers in 65 to 115 ms over the hotspot, at its address and at `fastled-remote.local` |
| Board 2 reset | Pass: Board 1 kept the brightness set by hand; frames resumed about 2 s after the reset, the longest gap 518 ms |
| Board 1 reset | Pass: Board 1 came back at the remote's current value |
| Hotspot off 30 s, then on | Pass: the link was never lost. For about 35 s Board 1 heard half the usual frames while Board 2 searched for the network, the longest gap 890 ms against the 1 s loss limit; Board 2 rejoined without a restart, its page and name came back, and the slider kept its value |
| Board 2 load | 60 fps, loop under 1 ms (8 ms while serving the page), about 47 KB heap free |
| Rejected frames | 0 by key, link id, tag or age. 194 by link hash, all in the 40 s between the two boards' uploads, when they ran builds of different graphs |

### What the bench changed

- The Upload tab refused a board whose only job is to send over a link
  (`a59dab50`).
- Graph Health kept "is missing its Wi-Fi SSID" after a name was typed into
  the Web Remote, until the next graph edit (`ca26fa7f`).
- A Music Player driving an LED output whose Brightness is wired from
  another node, here the remote, failed validation (`a63c69d9`).
- A Web Remote that restarted threw Board 1 back to its slider's start; the
  receiver now keeps a hand-set value until the restarted sender moves it
  (`6eb889d8`).
- The ESP8266 never served its page. The Wi-Fi bootstrap called
  `WiFi.begin` again while the core was still reconnecting, which left
  `status()` short of connected with an address in hand and sent the radio
  scanning every 5 s (`78407551`).
- The slider started at 0, not at the Brightness it drives, so a Board 1
  reset after a remote restart came up dark. The start is now taken from the
  driven property at build time (`c5c73200`, `6dc26443`).

### Still open

- A restarted remote shows its start value on its page while Board 1 keeps
  the value set by hand; moving the slider puts them back in step. Saving a
  remote's values across restarts would close this, and is not planned.
- A lookup of `fastled-remote.local` from the PC sometimes timed out where
  the address answered.
