# Touch-pad compile checks

> **Status: complete.** The normal, slideshow, player and no-touchpad guard
> sketches passed on classic ESP32 on 1 October 2026. This is compile evidence
> only; the MPR121 touch controller remains experimental in the
> [support matrix](../release/beta-support-matrix.md) until its recorded bench
> run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each fixture reads a `TouchPadInput` at address 0x5A on GPIO 21 and 22, with
thresholds 12 and 6, and maps the electrode index (0 to 11) onto LED brightness.
The slideshow and player carry that value through a `ControlMap`. A fourth
no-touchpad fixture proves that an unrelated sketch does not acquire the
driver. Fixture generation refuses any set that does not contain exactly one
register helper, one status read and one bus start per touch-pad sketch, none in
the guard, and any MPR121 library include: the chip is driven through its
registers over `Wire` and needs no library.

| Fixture | Generator | Result |
| --- | --- | --- |
| `normal` | `generateCpp` | **Pass** |
| `slideshow` | `generateShowSketch` | **Pass** |
| `player` | `buildShowPlayer` | **Pass** |
| `no-touchpad` | `generateCpp` | **Pass** |

## Reproduce

From the repository root:

```powershell
npm run gen:touchpad-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/touchpad-fixtures/normal.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/touchpad-fixtures/slideshow.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/touchpad-fixtures/player.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/touchpad-fixtures/no-touchpad.ino --fqbn esp32:esp32:esp32 --tag esp32 --label touchpad
```

The runner uses the helper's real `_compile_upload` path and never flashes. It
writes a log and JSON report beside each generated sketch.
`backend/sketches/` is gitignored, so this page is the durable result.

Run the four compiles one at a time. They share one arduino-cli workspace per
label, and two runs at once, or a run killed part-way, leave a truncated cached
object that fails the next link with `ld: final link failed: file truncated`.
The first run for a new label also builds FastLED and the core from scratch, so
it takes several minutes.

## Results, 1 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5. Target:
`esp32:esp32:esp32` with the helper's `huge_app` partition setting.

Source hashes: `normal` `0f357cbb`, `slideshow` `49eb9e4e`, `player`
`a4edc9ad`, and `no-touchpad` `7285b779`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| normal | arduino-cli | pass | 418,315 / 3,145,728 (13%) | 29,076 / 327,680 (8%) |
| slideshow | arduino-cli | pass | 423,851 / 3,145,728 (13%) | 29,296 / 327,680 (8%) |
| player | arduino-cli | pass | 1,103,479 / 3,145,728 (35%) | 46,056 / 327,680 (14%) |
| no-touchpad | arduino-cli | pass | 391,159 / 3,145,728 (12%) | 27,668 / 327,680 (8%) |

The normal touch-pad graph uses 27,156 bytes more flash and 1,408 bytes more
static RAM than the no-touchpad guard. The `Wire` library the core links in for
any I2C part probably accounts for most of the flash, but that was not measured
separately.
