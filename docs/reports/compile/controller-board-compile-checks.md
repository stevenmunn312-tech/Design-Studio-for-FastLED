# Controller-board compile checks

> **Status: Arduino Nano ESP32 complete.** Its fixture passed on 8 October
> 2026. This is compile evidence only; the board stays experimental in the
> [support matrix](../../release/beta-support-matrix.md) until a recorded
> bench run exists. The WT32-ETH01 and QuinLED boards are added here as they
> land.

A new controller board needs a compile only where its build differs from a
target that already passes. The ESP32-C3 Super Mini, ESP32-C6-DevKitC-1, LOLIN
D1 Mini, Pico W and Teensy 4.1 build on FQBNs the other records already cover,
so their profiles needed none.

## Arduino Nano ESP32

The board's core numbers pins by their D and A names unless its Pin Numbering
menu says otherwise. Studio's sketches use GPIO numbers, so the helper builds
`esp32:esp32:nano_nora` as
`esp32:esp32:nano_nora:PinNumbers=byGPIONumber,PartitionScheme=default`
(`_arduino_fqbn` in `backend/toolchain.py`). The board's partition menu has no
`huge_app`, so it keeps its own 16 MB table with a 3 MB app slot.

The fixture comes from a real Studio graph on the `arduino-nano-esp32` profile:
two LED outputs on D6 (GPIO9) and D12 (GPIO47), a pot on A0 (GPIO1), and a
BH1750 on A4/A5 (GPIO11/12), the board's default I2C pair. Fixture generation
refuses a sketch whose pins are not those GPIO numbers. The build log shows
`BOARD_USES_HW_GPIO_NUMBERS` defined, so the core's D-number remap is off.

### Reproduce

From the repository root:

```powershell
npm run gen:compile-fixtures -- nano-esp32
python scripts/compile-fixtures/compile-presence-smoke.py arduino-cli backend/sketches/nano-esp32-fixtures/nano-esp32.ino --fqbn esp32:esp32:nano_nora --tag nano-esp32 --label nano-esp32
```

The runner uses the helper's real `_compile_upload` path and never flashes.
`backend/sketches/` is gitignored, so this page is the durable result. Run
compiles one at a time; they share one arduino-cli workspace.

### Result, 8 October 2026

Toolchain: arduino-cli 1.5.1, ESP32 core 3.3.11 and FastLED 3.10.5.

Source hash: `nano-esp32` `5af01433`.

| Fixture | Engine | Result | Flash | RAM |
| --- | --- | --- | --- | --- |
| nano-esp32 | arduino-cli | pass | 521,555 / 3,145,728 (16%) | 62,148 / 327,680 (18%) |

Not established: uploading. The board flashes through Arduino's DFU
bootloader, which `arduino-cli upload` drives for this FQBN, but no board has
been flashed from Studio yet.
