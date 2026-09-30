# Temperature-probe compile checks

> **Status: complete.** The normal, slideshow, player and no-sensor guard
> sketches passed on classic ESP32 on 30 September 2026. This is compile
> evidence only; the waterproof DS18B20 remains experimental in the
> [support matrix](../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each sensor fixture reads a `TemperatureInput` on GPIO 4 and maps 10–35 °C onto
LED brightness. The slideshow and player carry that value through a
`ControlMap`. A fourth no-sensor fixture proves that an unrelated sketch does
not acquire the 1-Wire helper. Fixture generation refuses any set that does not
contain exactly one helper, start and read per sensor sketch, none in the
guard, and any `Wire`, `OneWire` or `DallasTemperature` include: the probe is
driven by the sketch's own bit-banged helper and needs no library.

The normal compile passed first time. No forward declaration was needed, unlike
the BME280, because the helper's signatures use only primitive types.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-sensor` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:temperature-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/temperature-sensor-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label temperature
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/temperature-sensor-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label temperature
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/temperature-sensor-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label temperature
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/temperature-sensor-fixtures/no-sensor.ino --fqbn esp32:esp32:esp32 --tag esp32 --label temperature
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result.

Run the four compiles one at a time. They share one arduino-cli workspace per
label, and two runs at once, or a run killed part-way, leave a truncated cached
object that fails the next link with `ld: final link failed: file truncated`.
Move the workspace's cache directory aside and rebuild if that appears.

## Results, 30 September 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `9782e253`, `slideshow` `fb2496f1`, `player`
`1a1b76d9`, and `no-sensor` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 392,303 / 3,145,728 (12%) | 27,676 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 397,839 / 3,145,728 (12%) | 27,904 / 327,680 (8%) |
| player | arduino-cli | pass | 1,081,403 / 3,145,728 (34%) | 44,664 / 327,680 (13%) |
| no-sensor | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal temperature graph uses 1,144 bytes more flash and 8 bytes more static
RAM than the no-sensor guard.
