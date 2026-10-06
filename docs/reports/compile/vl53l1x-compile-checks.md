# VL53L1X compile checks

> **Status: complete.** The normal, slideshow and player sketches passed on classic
> ESP32 on 1 October 2026. This is compile evidence only; the VL53L1X remains
> experimental in the [support matrix](../../release/beta-support-matrix.md) until its
> recorded bench run exists.

The fixtures come from real Studio graphs. Each reads a `DistanceInput` using the
Adafruit VL53L1X on GPIO 21 and 22 at 0x29, maps the distance (30 to 4000 mm) onto
LED brightness, and the slideshow and player carry that value through a `ControlMap`.
Fixture generation refuses any set that does not contain exactly one sensor object,
one library include and one bus start. The no-library guard is the one recorded in the
[VL53L0X checks](vl53l0x-compile-checks.md): a sketch with no laser sensor is the same
sketch.

The sensor is driven through Pololu's VL53L1X library, pinned to 1.3.1
(`VL53L1X_VERSION`, mirrored by `_VL53L1X_VERSION` in the backend), installed with
`arduino-cli lib install VL53L1X@1.3.1`.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:vl53l1x-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/vl53l1x-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/vl53l1x-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/vl53l1x-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result. Run the
compiles one at a time: they share one arduino-cli workspace per label, and two
runs at once, or a run killed part-way, leave a truncated cached object that
fails the next link with `ld: final link failed: file truncated`. The player
build takes several minutes.

The compiles used arduino-cli, which installs the library. The backend's fbuild
path, which vendors the library from GitHub, is covered by tests of its calls and
was not run against a real build.

## Results, 1 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `5347b465`, `slideshow` `657683ce`, `player` `062eb43f`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 420,963 / 3,145,728 (13%) | 29,132 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 426,667 / 3,145,728 (13%) | 29,352 / 327,680 (8%) |
| player | arduino-cli | pass | 1,106,223 / 3,145,728 (35%) | 46,112 / 327,680 (14%) |

The normal VL53L1X graph uses 29,804 bytes more flash and 1,464 bytes more static RAM
than the no-laser guard (391,159 and 27,668 bytes).
