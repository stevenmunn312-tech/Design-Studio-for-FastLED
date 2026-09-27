# BME280 environment-sensor compile checks

> **Status: complete.** The normal, slideshow, player and no-sensor guard
> sketches passed on classic ESP32 on 27 September 2026. This is compile
> evidence only; the Adafruit BME280 remains experimental in the
> [support matrix](../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each sensor fixture reads the Adafruit product-2652 BME280 at 0x77 on SDA 21 /
SCL 22 and maps 10–35 °C onto LED brightness. The slideshow and player carry
that value through a `ControlMap`. A fourth no-sensor fixture proves that an
unrelated sketch does not acquire the BME280 helper or `Wire`. Fixture
generation refuses any set that does not contain exactly one helper, begin and
read per sensor sketch, and none in the guard.

The first normal compile failed: the Arduino preprocessor hoists prototypes
for `_bmeBegin` and `_bmeMeasure` above the calibration struct, so those
signatures could not see `_Bme280Calibration`. `generateCpp`, the slideshow
generator and the player generator now forward-declare that struct with the
other hoisted-type declarations. No compensation or wiring change was needed
after that.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-sensor` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:environment-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/environment-sensor-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label environment
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/environment-sensor-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label environment
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/environment-sensor-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label environment
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/environment-sensor-fixtures/no-sensor.ino --fqbn esp32:esp32:esp32 --tag esp32 --label environment
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result.

## Results, 27 September 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `239c8dc6`, `slideshow` `a393b2be`, `player`
`337e06fe`, and `no-sensor` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 418,971 / 3,145,728 (13%) | 29,100 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 424,607 / 3,145,728 (13%) | 29,328 / 327,680 (8%) |
| player | arduino-cli | pass | 1,103,207 / 3,145,728 (35%) | 46,088 / 327,680 (14%) |
| no-sensor | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal environment graph uses 27,812 bytes more flash and 1,432 bytes more
static RAM than the no-sensor guard.
