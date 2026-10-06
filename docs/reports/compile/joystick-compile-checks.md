# Joystick compile checks

> **Status: complete.** The normal, slideshow, player and no-sensor guard
> sketches passed on classic ESP32 on 30 September 2026. This is compile
> evidence only; the KY-023 remains experimental in the
> [support matrix](../../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each fixture reads a `JoystickInput` with VRx on GPIO 32, VRy on GPIO 33 and SW
on GPIO 25, and maps the X axis (-1 to 1) onto LED brightness. The slideshow and
player carry that value through a `ControlMap`. A fourth no-sensor fixture
proves that an unrelated sketch does not acquire the axis helper. Fixture
generation refuses any set that does not contain exactly one helper and one X
read per joystick sketch, none in the guard, and any `Wire` or joystick library
include: the module is two ADC reads and a switch and needs no library.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-sensor` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- joystick
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/joystick-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label joystick
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/joystick-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label joystick
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/joystick-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label joystick
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/joystick-fixtures/no-sensor.ino --fqbn esp32:esp32:esp32 --tag esp32 --label joystick
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result.

Run the four compiles one at a time. They share one arduino-cli workspace per
label, and two runs at once, or a run killed part-way, leave a truncated cached
object that fails the next link with `ld: final link failed: file truncated`.

## Results, 30 September 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `e356d641`, `slideshow` `1cfb817d`, `player`
`6012c9b3`, and `no-sensor` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 397,555 / 3,145,728 (12%) | 27,772 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 397,263 / 3,145,728 (12%) | 27,896 / 327,680 (8%) |
| player | arduino-cli | pass | 1,086,367 / 3,145,728 (34%) | 44,752 / 327,680 (13%) |
| no-sensor | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal joystick graph uses 6,396 bytes more flash and 104 bytes more static
RAM than the no-sensor guard, most of it the ADC driver and floating-point
support that `analogRead` and `fabsf` pull in.
