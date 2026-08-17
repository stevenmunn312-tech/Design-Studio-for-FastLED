# Hardware renders — what the app needs

Tracks the renders required by the `Hardware` branch's two-view model (see
[`hardware-nodes.md`](../design/hardware-nodes.md)): a full render per part in
the hardware view, and a thumbnail of the same asset in the graph.

Complements — does not replace — `BOARD_MODELING_CHECKLIST.md` in the Blender
asset folder, which tracks the *modelling* workflow for boards. This file
tracks what the **app** is waiting on, and covers the non-board parts that
checklist does not.

Priorities follow the phases in [`hardware-todo.md`](hardware-todo.md).
**Phase 1 needs LED outputs before anything else** — the split canvas is proven
with the board plus LED outputs only, so those four are the blocking set.

Render contract is the existing board one: orthographic, 800 px wide,
transparent background, tight calculated crop, raw Cycles PNG. Conversion to
WebP happens at import (`scripts/import-board-assets.py`).

## Blocking — Phase 1 (LED outputs)

Nothing else in the branch can be demonstrated without these.

- [ ] **WS2812B strip** — a short run, tileable or croppable to any length.
- [ ] **WS2812B matrix panel, 16×16** — the validated reference configuration.
- [ ] **LED ring** — the new form. Decide whether one parametric ring covers
  12/16/24 px or each count needs its own render.
- [ ] **HUB75 panel** — 64×64 P4, matching the hardware-validated setup.

## Phase 3 — parts with a signal role

- [ ] **INMP441 I2S microphone.** The default microphone and the part the whole
  mic pin story is built around. The Build Diagram already draws a schematic
  version, so there is reference to work from.
- [ ] **microSD SPI breakout.** Note there are two common variants — the 5 V
  module with a regulator and level shifter, and the bare 3.3 V breakout. They
  are wired differently and one is destroyed by 5 V, so they may warrant
  separate parts rather than one render.
- [x] **Button module** — `button_module.blend` / `.png`.
- [x] **Potentiometer module** — `potentiometer_module.blend` / `.png`.
- [x] **Rotary encoder module** — `encoder_module.blend` / `.png`.

## Phase 3 — parts with no signal role

Hardware view only; these never appear in the graph.

- [ ] **MAX98357A I2S amplifier.** The default amplifier, and the part that
  cost an evening when its pin defaults disagreed with the wiring guide.
- [ ] **Speaker**, 4–8 Ω. Needed to make the amplifier's output legible.
- [ ] **74AHCT125 level shifter.** The Build Diagram draws one already; check
  whether that asset can be reused before modelling.

## Phase 4 — audio sources

- [ ] **DFPlayer Mini** or equivalent self-contained player module. In scope
  because it is the case that makes line-in mandatory: its decoding happens on
  the module, so it can never be decoder-tapped.
- [ ] **Line-in ADC breakout** (PCM1802 / ES8388 class).

## Support parts

Already modelled — confirm each is exported to the render contract and wire up
the import path.

- [x] **5 V PSU** — birdseye, front, and front-section variants exist.
- [x] **330 Ω resistor** — top-down.
- [x] **1000 µF capacitor** (Panasonic EEUFR0J102B) — top-down.

## Boards

### Imported and live (13)

Present in `public/boards/` and merged into `BOARD_PROFILES`.

- [x] adafruit-feather-esp32-s2
- [x] adafruit-feather-esp32-s3
- [x] adafruit-feather-esp32-v2 *(capability data only — no pin map, see below)*
- [x] adafruit-qt-py-esp32-s2
- [x] esp32-devkit-v1-30pin-esp32d
- [x] esp32-generic-devkit-38pin
- [x] espressif-esp32-devkitc-v4-38pin
- [x] espressif-esp32-s2-devkitc-1
- [x] espressif-esp32-s3-devkitc-1
- [x] generic-esp32-s3-n16r8-44pin-dual-usbc
- [x] lolin-s2-mini
- [x] lolin-s3-40pin-dual-usbc
- [x] seeed-xiao-esp32s3

### Modelled, awaiting import (15)

Blender folders exist but these were not present when the importer last ran.
Re-running `scripts/import-board-assets.py` will report which have a usable
`board.json` and which are rejected for thin GPIO coverage.

- [ ] arduino-uno-r3-dip
- [ ] esp32-c3-devkitm-1
- [ ] esp32-c3-super-mini
- [ ] esp32-c6-devkitc-1
- [ ] esp32-c6-devkitm-1
- [ ] esp32-c6-super-mini
- [ ] esp32-h2-devkitm-1
- [ ] esp32-h2-super-mini
- [ ] esp8266-adafruit-feather-huzzah
- [ ] esp8266-lolin-d1-mini
- [ ] esp8266-nodemcu-v2-amica
- [ ] esp8266-wemos-d1-r2
- [ ] lolin-c3-mini
- [ ] seeed-xiao-esp32c3
- [ ] seeed-xiao-esp32c6

Each also needs a catalogue entry, a GPIO table and mic pin defaults, or the
existing tests fail — see `uploadStore.ts`, `boardGpio.ts`,
`micPinDefaults.ts`.

### Known gaps

- [ ] **adafruit-feather-esp32-v2 has no pin map.** Rejected by the importer at
  4/23 pins resolving to a GPIO: it silkscreens aliases only (`SDA`, `D14`) and
  its manifest has no `alias/GPIOn` entries to bridge them. Fix upstream in the
  asset by adding a `safeGeneralPurpose` in that form.
- [ ] **Six boards carry no pin-safety data**, so they give no positive pin
  advice — reported by `UNLISTED_SAFETY_IDS`.
- [ ] **Teensy, RP2040, SAMD and AVR boards** are in the upload catalogue with
  no model at all. Compile-only targets by design, but they will look empty in
  a hardware view that shows every other board as a picture. Decide whether
  they get a generic outline or are simply not selectable there.
