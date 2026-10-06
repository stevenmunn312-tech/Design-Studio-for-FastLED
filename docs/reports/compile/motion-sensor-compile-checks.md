# Motion-sensor compile checks

> **Status: complete.** The normal, slideshow, player and no-sensor guard
> sketches passed on classic ESP32 on 1 October 2026. This is compile evidence
> only; the GY-521 MPU-6050 remains experimental in the
> [support matrix](../../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each sensor fixture reads a `MotionVectorInput` at 0x68 on SDA GPIO 21 and SCL
GPIO 22 and maps the X acceleration (-1 to 1 g) onto LED brightness. The
slideshow and player carry that value through a `ControlMap`. A fourth no-sensor
fixture proves that an unrelated sketch does not acquire the MPU-6050 helper.
Fixture generation refuses any set that does not contain exactly one helper,
begin and read per sensor sketch, none in the guard, and any MPU or I2Cdev
library include: the sensor is driven by the sketch's own register helper over
`Wire` and needs no library.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-sensor` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:motion-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/motion-sensor-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label motion
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/motion-sensor-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label motion
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/motion-sensor-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label motion
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/motion-sensor-fixtures/no-sensor.ino --fqbn esp32:esp32:esp32 --tag esp32 --label motion
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result.

Run the four compiles one at a time. They share one arduino-cli workspace per
label, and two runs at once, or a run killed part-way, leave a truncated cached
object that fails the next link with `ld: final link failed: file truncated`.

## Results, 1 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `7af7e8e5`, `slideshow` `eba2cdb0`, `player`
`268dd7c9`, and `no-sensor` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 418,267 / 3,145,728 (13%) | 29,100 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 423,983 / 3,145,728 (13%) | 29,304 / 327,680 (8%) |
| player | arduino-cli | pass | 1,103,255 / 3,145,728 (35%) | 46,080 / 327,680 (14%) |
| no-sensor | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal motion graph uses 27,108 bytes more flash and 1,432 bytes more static
RAM than the no-sensor guard, almost all of it the `Wire` I2C driver that any
I2C part pulls in.
