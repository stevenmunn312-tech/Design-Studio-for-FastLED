# VL53L0X compile checks

> **Status: complete.** The normal, slideshow, player and no-laser guard sketches
> passed on classic ESP32 on 1 October 2026, and the normal sketch on fbuild on
> 8 October. This is compile evidence only; the
> VL53L0X remains experimental in the
> [support matrix](../../release/beta-support-matrix.md) until its recorded bench run
> exists.

The fixtures come from real Studio graphs. Each reads a `DistanceInput` using the
Adafruit VL53L0X on GPIO 21 and 22 at 0x29, maps the distance (30 to 1200 mm)
onto LED brightness, and the slideshow and player carry that value through a
`ControlMap`. A fourth no-laser fixture proves that an unrelated sketch does not
acquire the library. Fixture generation refuses any set that does not contain
exactly one sensor object, one library include and one bus start per laser sketch,
and none in the guard.

Unlike the other I2C parts, the sensor is driven through Pololu's VL53L0X library,
pinned to 1.3.1 (`VL53L0X_VERSION`, mirrored by `_VL53L0X_VERSION` in the backend).
The library was installed with `arduino-cli lib install VL53L0X@1.3.1`.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-laser` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- vl53l0x
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/vl53l0x-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/vl53l0x-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/vl53l0x-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/vl53l0x-fixtures/no-laser.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
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

Source hashes: `normal` `8c1c6b94`, `slideshow` `b69c6b33`, `player` `d5d448ee`,
and `no-laser` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 421,955 / 3,145,728 (13%) | 29,108 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 427,679 / 3,145,728 (13%) | 29,328 / 327,680 (8%) |
| player | arduino-cli | pass | 1,107,299 / 3,145,728 (35%) | 46,088 / 327,680 (14%) |
| no-laser | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal laser graph uses 30,796 bytes more flash and 1,440 bytes more static
RAM than the no-laser guard.

## fbuild, 8 October 2026

`normal` (`8c1c6b940422`, the same source as the table above) passed on fbuild 2.5.37
for `esp32:esp32:esp32` in a `compile-matrix.py` run. The helper vendored
Pololu VL53L0X 1.3.1 into fbuild's `lib/` and the build compiled it: 634,696 /
3,145,728 bytes flash (20%) and 29,010 / 327,680 bytes static RAM (9%). This
closes the fbuild vendoring path, which was covered only by tests before. The
slideshow and player sketches were not built on fbuild.
