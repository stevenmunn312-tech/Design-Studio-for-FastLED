# Grove Touch Sensor firmware compile checks

> **Status: complete.** The normal, slideshow, player and no-touch guard
> sketches passed on classic ESP32 on 27 September 2026. This is compile
> evidence only; the Seeed Grove Touch Sensor remains experimental in the
> [support matrix](../../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each sensor fixture reads the Seeed Grove Touch Sensor's TTP223-BA6 output on
GPIO 21 as an active-high, actively driven signal. The normal graph wires
`touched` to the LED output's exposed Enabled input. The slideshow and player
carry it through `ControlMap` as `ledToggle`. A fourth no-touch fixture proves
that an unrelated sketch does not acquire the GPIO setup or read. Fixture
generation also refuses `INPUT_PULLUP`, protecting the electrical distinction
from a mechanical button.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-touch` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- touch-button
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/touch-button-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touch-button
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/touch-button-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touch-button
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/touch-button-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touch-button
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/touch-button-fixtures/no-touch.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touch-button
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result.

## Results, 27 September 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `98b56c39`, `slideshow` `bedd7052`, `player`
`b136c148`, and `no-touch` `5ad484c4`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 391,291 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 397,319 / 3,145,728 (12%) | 27,912 / 327,680 (8%) |
| player | arduino-cli | pass | 1,079,211 / 3,145,728 (34%) | 44,664 / 327,680 (13%) |
| no-touch | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal touch graph adds 132 bytes of flash and no static RAM over the
no-touch guard. No generator or firmware repair was needed for any path.
