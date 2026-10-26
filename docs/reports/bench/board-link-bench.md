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
- Runs 2 (an OLED and a bare encoder) and 3 (an ESP8266 Web Remote) are not
  yet run.
