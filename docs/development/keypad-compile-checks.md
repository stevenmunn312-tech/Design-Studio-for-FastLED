# Keypad compile checks

> **Status: complete.** The normal, slideshow, player and no-keypad guard
> sketches passed on classic ESP32 on 1 October 2026. This is compile evidence
> only; the 4x4 matrix keypad remains experimental in the
> [support matrix](../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each fixture reads a `KeypadInput` with rows on GPIO 13, 14, 27 and 26 and
columns on GPIO 25, 33, 32 and 4, and maps the key index (0 to 15) onto LED
brightness. The slideshow and player carry that value through a `ControlMap`. A
fourth no-keypad fixture proves that an unrelated sketch does not acquire the scan
helper. Fixture generation refuses any set that does not contain exactly one
helper and one scan per keypad sketch, none in the guard, and any keypad, `Wire`
or I2C-expander include: a matrix scan is plain GPIO and needs no library.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-keypad` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:keypad-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/keypad-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label keypad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/keypad-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label keypad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/keypad-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label keypad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/keypad-fixtures/no-keypad.ino --fqbn esp32:esp32:esp32 --tag esp32 --label keypad
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

Source hashes: `normal` `d54cb5f3`, `slideshow` `0a6262af`, `player`
`afd4ffe1`, and `no-keypad` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 391,923 / 3,145,728 (12%) | 27,684 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 397,487 / 3,145,728 (12%) | 27,896 / 327,680 (8%) |
| player | arduino-cli | pass | 1,080,651 / 3,145,728 (34%) | 44,656 / 327,680 (13%) |
| no-keypad | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal keypad graph uses 764 bytes more flash and 16 bytes more static RAM
than the no-keypad guard. The player figures equal the distance-sensor player
build exactly; the generated player sketch does contain the scan helper and the
log names the keypad build directory, and the equality is not explained.
