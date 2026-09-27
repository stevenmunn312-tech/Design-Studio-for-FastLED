# Power-switch dimming compile checks

> **Status: complete.** All eight builds passed on 27 September 2026, across
> classic ESP32 (cores 3.3.11 and 2.0.17), ESP8266, RP2040 and AVR. This is
> compile evidence only; the LR7843 power switch and its dimming remain
> experimental in the [support matrix](../release/beta-support-matrix.md) until
> a recorded bench run exists.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each drives an LR7843 opto-isolated MOSFET module (`PowerSwitchOutput`) beside
one LED output, so every fixture is an ordinary normal sketch.

| Fixture | Graph | Dimmed switches |
| --- | --- | --- |
| `plain` | Button → On, Level at 1 | 0: the original on/off firmware |
| `level-field` | Button → On, Level field 0.4 | 1 |
| `level-wired` | Potentiometer → Level, On unwired | 1 |
| `gated` | Button → On and Potentiometer → Level on one switch; the potentiometer alone on a second | 2 (LEDC channels 0 and 1) |
| `gated-esp8266` | `gated`'s first switch on NodeMCU pins | 1 |
| `gated-rp2040` | the same on Raspberry Pi Pico pins | 1 |
| `gated-avr` | the same on Arduino Uno pins (switch on timer pin D9) | 1 |

The generator refuses a fixture whose count of `flsPwmBegin` calls or PWM
shims differs from the table, so `plain` also proves Level 1 emits no PWM.

## Reproduce

From the repository root:

```powershell
npm run gen:power-switch-compile-fixtures
python scripts/compile-presence-smoke.py arduino-cli backend/sketches/power-switch-fixtures/plain.ino --fqbn esp32:esp32:esp32 --tag esp32 --label power-switch
```

Repeat for each fixture with its FQBN: `esp32:esp32:esp32` for the first four,
`esp8266:esp8266:nodemcuv2`, `rp2040:rp2040:rpipico` and `arduino:avr:uno`.
The runner uses the helper's real `_compile_upload` path and never flashes.
`backend/sketches/` is gitignored, so this page is the durable result.

The ESP32 core 2 branch (`ledcSetup`/`ledcAttachPin`) is compiled with the
isolated core 2.0.17 install, which the helper does not use:

```powershell
& "C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" `
  --config-file "$env:LOCALAPPDATA\Arduino15-esp32-core2\arduino-cli.yaml" `
  compile --fqbn esp32:esp32:esp32 <folder containing gated.ino>
```

## Results, 27 September 2026

Toolchain: arduino-cli 1.5.1 and FastLED 3.10.5.

| Fixture | Target | Core | Result | Flash | RAM |
| --- | --- | --- | --- | --- | --- |
| plain | `esp32:esp32:esp32` | 3.3.11 | pass | 391,723 / 3,145,728 (12%) | 28,820 / 327,680 (8%) |
| level-field | `esp32:esp32:esp32` | 3.3.11 | pass | 400,463 / 3,145,728 (12%) | 29,028 / 327,680 (8%) |
| level-wired | `esp32:esp32:esp32` | 3.3.11 | pass | 406,339 / 3,145,728 (12%) | 29,116 / 327,680 (8%) |
| gated | `esp32:esp32:esp32` | 3.3.11 | pass | 406,567 / 3,145,728 (12%) | 29,116 / 327,680 (8%) |
| gated-esp8266 | `esp8266:esp8266:nodemcuv2` | 3.1.2 | pass | 241,328 / 1,048,576 (23%) | 30,292 / 80,192 (37%) |
| gated-rp2040 | `rp2040:rp2040:rpipico` | 6.1.0 | pass | 70,292 / 2,093,056 (3%) | 11,524 / 262,144 (4%) |
| gated-avr | `arduino:avr:uno` | 1.8.8 | pass | 7,166 / 32,256 (22%) | 1,878 / 2,048 (91%) |
| gated | `esp32:esp32:esp32` | 2.0.17 | pass | 744,469 / 1,310,720 (56%) | 31,608 / 327,680 (9%) |

The ESP32 core 3 builds use the helper's `huge_app` partition; the core 2.0.17
build uses that core's default 1.25 MB app partition, which is why its flash
share differs. Its larger image is the IDF 4.4 core, not the shim.

Source hashes: `plain` `a1f55ca5`, `level-field` `2fda6af1`, `level-wired`
`e4515002`, `gated` `6138ca91`, `gated-esp8266` `4cb78acf`, `gated-rp2040`
`27bdac67`, and `gated-avr` `02ae8691`.

What the numbers show:

- Level at 1 emits no PWM, and `plain` still builds as the switch always did.
- Dimming one switch on classic ESP32 core 3 costs 8,740 bytes of flash and
  208 bytes of RAM (`level-field` against `plain`), most of it the LEDC
  driver. A second dimmed switch adds 228 bytes of flash (`gated` against
  `level-wired`).
- Every branch of the shim compiles: LEDC on ESP32 cores 3 and 2,
  `analogWriteFreq` on ESP8266 and RP2040, and AVR's fixed timer PWM. The
  Teensy branch is not compiled here, because no Teensy core is installed.

No generator or firmware repair was needed on any target. The Uno's 91% RAM
is its 2 KB holding a 30-LED sketch, not the dimming.
