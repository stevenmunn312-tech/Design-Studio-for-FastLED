# Distance-sensor compile checks

> **Status: complete.** The normal, slideshow, player and no-sensor guard
> sketches passed on classic ESP32 on 30 September 2026. This is compile
> evidence only; the HC-SR04 remains experimental in the
> [support matrix](../../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each sensor fixture reads a `DistanceInput` on Trig GPIO 27 and Echo GPIO 26 and
maps 100 mm to 1.5 m onto LED brightness. The slideshow and player carry that
value through a `ControlMap`. A fourth no-sensor fixture proves that an
unrelated sketch does not acquire the ranging helper. Fixture generation refuses
any set that does not contain exactly one helper and one read per sensor sketch,
none in the guard, and any `Wire`, `NewPing` or `Ultrasonic` include: the sensor
is driven by the sketch's own trigger/echo helper and needs no library.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-sensor` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- distance
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/distance-sensor-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label distance
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/distance-sensor-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label distance
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/distance-sensor-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label distance
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/distance-sensor-fixtures/no-sensor.ino --fqbn esp32:esp32:esp32 --tag esp32 --label distance
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

Source hashes: `normal` `307c6c57`, `slideshow` `b74c512e`, `player`
`0237e847`, and `no-sensor` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 391,951 / 3,145,728 (12%) | 27,676 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 397,511 / 3,145,728 (12%) | 27,904 / 327,680 (8%) |
| player | arduino-cli | pass | 1,080,651 / 3,145,728 (34%) | 44,656 / 327,680 (13%) |
| no-sensor | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal distance graph uses 792 bytes more flash and 8 bytes more static RAM
than the no-sensor guard.
