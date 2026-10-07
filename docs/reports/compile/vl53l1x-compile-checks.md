# VL53L1X compile checks

> **Status: complete.** The normal, slideshow and player sketches passed on classic
> ESP32 on 1 October 2026, and the normal sketch on fbuild on 8 October. This is
> compile evidence only; the VL53L1X remains
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
npm run gen:compile-fixtures -- vl53l1x
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/vl53l1x-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/vl53l1x-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/vl53l1x-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result. Run the
compiles one at a time: they share one arduino-cli workspace per label, and two
runs at once, or a run killed part-way, leave a truncated cached object that
fails the next link with `ld: final link failed: file truncated`. The player
build takes several minutes.

The 1 October compiles used arduino-cli, which installs the library. On 8 October
the normal sketch also passed on fbuild, which vendors the pinned library from
GitHub; see [fbuild, 8 October 2026](#fbuild-8-october-2026).

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

## fbuild, 8 October 2026

`normal` (`5347b4650bb4`, the same source as the table above) passed on fbuild 2.5.37
for `esp32:esp32:esp32` in a `compile-matrix.py` run. The helper vendored
Pololu VL53L1X 1.3.1 into fbuild's `lib/` and the build compiled it: 633,948 /
3,145,728 bytes flash (20%) and 29,041 / 327,680 bytes static RAM (9%). This
closes the fbuild vendoring path, which was covered only by tests before. The
slideshow and player sketches were not built on fbuild.
