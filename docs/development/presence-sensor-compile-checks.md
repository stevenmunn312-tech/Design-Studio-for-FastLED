# HLK-LD2410C firmware compile checks

> **Status: complete.** The normal, slideshow, player and no-sensor guard
> sketches passed on classic ESP32 on 24–25 September 2026. This is compile
> evidence only; the HLK-LD2410C remains experimental in the
> [support matrix](../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each sensor fixture reads an HLK-LD2410C on GPIO 18 through UART1 at 256000
baud, maps its 0–6 m distance to 0–1, and uses that value as LED brightness.
The slideshow and player carry the value through a `ControlMap`; the normal
sketch wires it directly to the LED output's exposed Brightness input. A
fourth no-sensor fixture proves that an unrelated sketch does not acquire the
parser or UART setup. Fixture generation refuses any set that does not contain
exactly one parser/setup pair per sensor sketch and none in the guard.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-sensor` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:presence-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/presence-sensor-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/presence-sensor-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/presence-sensor-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/presence-sensor-fixtures/no-sensor.ino --fqbn esp32:esp32:esp32 --tag esp32
```

The runner uses the helper's real `_compile_upload` or
`_compile_upload_fbuild` path and never flashes. It writes a log and JSON report
beside the generated sketch. `backend/sketches/` is gitignored, so this page is
the durable result.

## Results, 24–25 September 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32`.

Source hashes: `normal` `b4748504`, `slideshow` `84c86517`, `player`
`b1816337`, and `no-sensor` `401d7057`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 405,851 / 1,310,720 (30%) | 27,748 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 411,315 / 1,310,720 (31%) | 27,968 / 327,680 (8%) |
| player | arduino-cli | pass | 1,079,491 / 1,310,720 (82%) | 44,728 / 327,680 (13%) |
| no-sensor | arduino-cli | pass | 391,091 / 1,310,720 (29%) | 27,668 / 327,680 (8%) |

The normal sensor graph adds 14,760 bytes of flash and 80 bytes of static RAM
over the no-sensor guard. No generator or firmware repair was needed for any
path.
