# Light-sensor firmware compile checks

> **Status: complete.** The BH1750 normal, slideshow and player sketches, the
> LDR sketch and the no-sensor guard passed on classic ESP32 on 25 September
> 2026. This is compile evidence only; the Adafruit BH1750 remains
> experimental in the [support matrix](../release/beta-support-matrix.md) until
> its recorded bench run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each BH1750 fixture reads the sensor at 0x23 on SDA 21 / SCL 22, maps 0–1000 lux
to 0–1, and uses that value as LED brightness. The slideshow and player carry
the value through a `ControlMap`; the normal sketch wires it directly to the LED
output's exposed Brightness input. The `ldr` fixture wires an LDR's Level on
GPIO 34 to brightness, because the LDR's normal path gained a Lux local in the
same change. A fifth no-sensor fixture proves that an unrelated sketch does not
acquire the BH1750 helpers or `Wire`. Fixture generation refuses any set that
does not contain exactly one BH1750 helper, setup and read per sensor sketch,
and none in the LDR or guard.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `ldr` | `generateCpp` | **Pass** |
| `no-sensor` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:light-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/light-sensor-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label light
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/light-sensor-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label light
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/light-sensor-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label light
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/light-sensor-fixtures/ldr.ino --fqbn esp32:esp32:esp32 --tag esp32 --label light
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/light-sensor-fixtures/no-sensor.ino --fqbn esp32:esp32:esp32 --tag esp32 --label light
```

The runner is shared with the [presence-sensor checks](presence-sensor-compile-checks.md);
`--label light` gives these fixtures their own arduino-cli workspace. It uses
the helper's real `_compile_upload` path and never flashes. It writes a log and
JSON report beside the generated sketch. `backend/sketches/` is gitignored, so
this page is the durable result.

## Results, 25 September 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32`.

Source hashes: `normal` `792f8885`, `slideshow` `b7111dc2`, `player`
`27345415`, `ldr` `9713bb46`, and `no-sensor` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 417,907 / 1,310,720 (31%) | 29,068 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 423,607 / 1,310,720 (32%) | 29,288 / 327,680 (8%) |
| player | arduino-cli | pass | 1,101,615 / 1,310,720 (84%) | 46,048 / 327,680 (14%) |
| ldr | arduino-cli | pass | 397,287 / 1,310,720 (30%) | 27,772 / 327,680 (8%) |
| no-sensor | arduino-cli | pass | 391,095 / 1,310,720 (29%) | 27,668 / 327,680 (8%) |

The normal BH1750 graph adds 26,812 bytes of flash and 1,400 bytes of static RAM
over the no-sensor guard, most of it the `Wire` library. The LDR graph adds
6,192 bytes and 104 bytes. No generator or firmware repair was needed for any
path.
