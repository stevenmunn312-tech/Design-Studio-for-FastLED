# Power-switch compile checks

> **Status: complete.** All 13 fixtures passed on their listed targets on
> 8 October 2026, and the mixed-frequency fixture also passed on classic
> ESP32 core 2.0.17 on 27 September. Coverage spans classic ESP32 cores 3.3.11
> and 2.0.17, ESP8266, RP2040, AVR and Teensy 4.1, so every branch of the PWM
> shim has compiled. This is compile evidence only; both power-switch
> boards remain experimental in the
> [support matrix](../../release/beta-support-matrix.md) until recorded bench runs
> exist.

The fixtures come from real Studio graphs rather than hand-written sketches.
Each drives an LR7843, a four-channel MonkMakes Mosfetti, or both
(`PowerSwitchOutput`) beside one LED output, so every fixture is an ordinary
normal sketch.

| Fixture | Graph | Dimmed switches |
| --- | --- | --- |
| `plain` | Button → On, Level at 1 | 0: the original on/off firmware |
| `level-field` | Button → On, Level field 0.4 | 1 |
| `level-wired` | Potentiometer → Level, On unwired | 1 |
| `gated` | Button → On and Potentiometer → Level on one switch; the potentiometer alone on a second | 2 (LEDC channels 0 and 1) |
| `gated-esp8266` | `gated`'s first switch on NodeMCU pins | 1 |
| `gated-rp2040` | the same on Raspberry Pi Pico pins | 1 |
| `gated-avr` | the same on Arduino Uno pins (switch on timer pin D9) | 1 |
| `mosfetti` | Mosfetti A switched; B wired Level; C field Level gated by On; D held off | 2 |
| `mixed` | LR7843 at 500 Hz beside two Mosfetti channels at 1 kHz | 3 (LEDC channels 0, 2 and 3) |
| `mixed-esp8266` | the mixed graph on NodeMCU pins | 3, all at the safe shared 500 Hz |
| `mixed-rp2040` | the mixed graph on Raspberry Pi Pico pins | 3, all at the safe shared 500 Hz |
| `mixed-teensy` | the mixed graph on Teensy 4.1 pins | 3, all at the safe shared 500 Hz |
| `mosfetti-avr` | Mosfetti A switched and B dimmed on Arduino Uno PWM pins | 1 |

The generator refuses a fixture whose count of `flsPwmBegin` calls or PWM
shims differs from the table, so `plain` also proves Level 1 emits no PWM. It
also inspects every mixed fixture: the 500 Hz LR7843 must use LEDC channel 0,
the Mosfetti's 1 kHz pair must start on channels 2 and 3, the shared-core
branch must contain `analogWriteFreq(500)`, and the Teensy branch
`analogWriteFrequency(pin, 500)`.

## Reproduce

From the repository root:

```powershell
python scripts/compile-fixtures/compile-matrix.py --only power-switch/
```

That regenerates the fixtures and compiles each on its target through
`compile-presence-smoke.py --label power-switch`, which uses the helper's real
`_compile_upload` path and never flashes. `backend/sketches/` is gitignored,
so this page is the durable result.

The ESP32 core 2 branch (`ledcSetup`/`ledcAttachPin`) is compiled with the
isolated core 2.0.17 install, which the helper does not use:

```powershell
& "C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" `
  --config-file "$env:LOCALAPPDATA\Arduino15-esp32-core2\arduino-cli.yaml" `
  compile --fqbn esp32:esp32:esp32 <folder containing mixed.ino>
```

## Results, 8 October 2026

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
| mosfetti | `esp32:esp32:esp32` | 3.3.11 | pass | 406,639 / 3,145,728 (12%) | 29,116 / 327,680 (8%) |
| mixed | `esp32:esp32:esp32` | 3.3.11 | pass | 406,655 / 3,145,728 (12%) | 29,116 / 327,680 (8%) |
| mixed-esp8266 | `esp8266:esp8266:nodemcuv2` | 3.1.2 | pass | 241,504 / 1,048,576 (23%) | 30,296 / 80,192 (37%) |
| mixed-rp2040 | `rp2040:rp2040:rpipico` | 6.1.0 | pass | 70,468 / 2,093,056 (3%) | 11,524 / 262,144 (4%) |
| mosfetti-avr | `arduino:avr:uno` | 1.8.8 | pass | 7,252 / 32,256 (22%) | 1,878 / 2,048 (91%) |
| mixed-teensy | `teensy:avr:teensy41` | 1.62.0 | pass | 59,388 (code 40,840, data 9,672, headers 8,876) | RAM1 13,504 variables; RAM2 17,568 |
| mixed (27 September) | `esp32:esp32:esp32` | 2.0.17 | pass | 744,557 / 1,310,720 (56%) | 31,624 / 327,680 (9%) |

The Teensy core prints its own size format, which the runner does not parse;
its figures are read from `teensy_size` in the build log.

The ESP32 core 3 builds use the helper's `huge_app` partition; the core 2.0.17
build uses that core's default 1.25 MB app partition, which is why its flash
share differs. Its larger image is the IDF 4.4 core, not the shim.

Source hashes: `plain` `a1f55ca5`, `level-field` `0325b64f`, `level-wired`
`a6bc5cc1`, `gated` `eef7f4af`, `gated-esp8266` `52b24a28`, `gated-rp2040`
`4fc6aade`, `gated-avr` `406d77b2`, `mosfetti` `e91efba8`, `mixed` `e685e90c`,
`mixed-esp8266` `bab7bd74`, `mixed-rp2040` `27ffcc7d`, `mosfetti-avr`
`6b849e30` and `mixed-teensy` `defde3d3`. Every dimmed fixture's source changed
since 27 September because the shim's Teensy branch now takes the shared
frequency (`5a2db8dd`); that branch is compiled out everywhere else, and each
of those builds is byte-identical in size to its 27 September build. The core
2.0.17 row predates the change and was not rebuilt, for the same reason.

What the numbers show:

- Level at 1 emits no PWM, and `plain` still builds as the switch always did.
- Dimming one switch on classic ESP32 core 3 costs 8,740 bytes of flash and
  208 bytes of RAM (`level-field` against `plain`), most of it the LEDC
  driver. A second dimmed switch adds 228 bytes of flash (`gated` against
  `level-wired`).
- Every branch of the shim compiles: LEDC on ESP32 cores 3 and 2,
  `analogWriteFreq` on ESP8266 and RP2040, `analogWriteFrequency` on Teensy,
  and AVR's fixed timer PWM.
- All four Mosfetti GPIOs compile as independent outputs. The mixed core-2
  build proves its two 1 kHz LEDC channels do not share the LR7843's 500 Hz
  timer; the ESP8266, RP2040 and Teensy builds prove the common-frequency
  fallback. Teensy sets a frequency per timer rather than per core, but the
  generator does not know which pins share a timer, so it takes the slowest
  part's frequency on every dimmed pin.

Adding the Teensy fixture led to one firmware repair: the Teensy branch had
set each pin to its own part's frequency, so a 1 kHz Mosfetti channel could
retune an LR7843 on the same timer away from 500 Hz (`5a2db8dd`). No other
target needed one. The Uno's 91% RAM
is its 2 KB holding a 30-LED sketch, not the dimming.
