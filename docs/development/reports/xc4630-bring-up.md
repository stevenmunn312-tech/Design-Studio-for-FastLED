# XC4630 parallel touch panel — bring-up state

Working notes for the Duinotech XC4630 (ILI9341, 8-bit parallel, bare resistive
sheet) on an ESP32-S3 N16R8. Written mid-bring-up; delete once the panel works
and the findings have moved to the design docs.

## Where it stands

- **LEDs: working.** 60 WS2812B on GPIO 1, driven by the real generated sketch.
- **Panel: still dark.** Never displayed anything, from any build.
- **Touch: unjudged.** `_resPoint` is emitted and the LVGL input device
  registers, but nothing can be assessed until the panel draws.

## Fixed along the way

Each was real, and none on its own made the board work — they were stacked.

| Fault | Commit |
| --- | --- |
| Screen designs had no parallel transport at all | `03cfa589` |
| `SPI.begin` on invented SCK/MOSI — GPIO23 does not exist on an S3 | `03cfa589` |
| XPT2046 pins claimed for a panel with no digitiser; `pinMode(23)` aborted in `setup()` | `9a83f3cf` |
| Touch controls started at 0 in firmware, so a slider-driven brightness read zero | `48afcb92` |
| ILI9341 sent the ST7789 power-on sequence | `00e5fb81` |

The last three share a cause: the screen-design driver was written as a
near-copy of the fixed-layout driver and drifted, so rules the older one had
stated for years were simply absent from it. Prefer collapsing that duplication
over fixing the same thing twice.

## Next step

Instrument the real sketch rather than infer. `backend/sketches/fastled_pattern/`
holds exactly what was last compiled; insert `Serial.begin(115200)` plus a
marker per top-level statement of `setup()`, flash, and read the last marker.

Flash a diagnostic directly with the helper, bypassing the app:

```
POST http://localhost:8008/api/upload
{ "ino": "...", "fqbn": "esp32:esp32:esp32s3:PSRAM=opi,CDCOnBoot=cdc,FlashSize=16M",
  "port": "COM7", "flashMb": 16 }
```

`CDCOnBoot=cdc` is **required** for serial to reach the USB-C socket — see below.
Note the helper compiles every upload from one reused directory, so flashing a
diagnostic overwrites the generated sketch on disk; regenerate it with one
Upload from the app before instrumenting.

## Two bugs found here, not yet fixed

- **`usbCdcOnBoot` is dropped on the arduino-cli path.** `/api/upload` reads it
  and passes it only to `_compile_upload_fbuild`; `_compile_upload` never sees
  it. Every arduino-cli build therefore has *USB CDC On Boot: Disabled* and
  `Serial` goes to UART0 on GPIO 43/44, not the USB socket. No build made by
  this app can talk to its own serial console on an S3.
- **A wired fixture can be silently retargeted.** `MatrixOutput` is in
  `PART_PIN_PLANS` with `dataPin` retargetable, so adding a part can move a
  strip's data pin with nothing to say the physical wire is now wrong.
  Integrated board hardware is protected from this by `ownedNow`; hand-wired
  fixtures are not.

## Hardware facts worth keeping

- A panicking S3 re-enumerates, so its port fails to open with Windows error 31.
  A *hung* S3 keeps the USB-Serial/JTAG peripheral up: the port opens and stays
  silent. The two are distinguishable from the host, without a debugger.
- `esp32:esp32:esp32s3` FQBN options that matter here: `PSRAM=opi`,
  `CDCOnBoot=cdc`, `FlashSize=16M`.
