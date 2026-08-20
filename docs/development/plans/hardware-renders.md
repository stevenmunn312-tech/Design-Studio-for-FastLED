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
WebP happens at import (`scripts/import-board-assets.py` /
`scripts/import-part-assets.py`).

## Blender workspace

Do not create app hardware renders as hand-drawn placeholders when a new
physical part is requested. The source-of-truth asset workspace is:

```text
C:\Users\User\Desktop\Blender Assets\
```

Use `Parts\` for non-board modules, with each finished part in its own folder
containing a `.blend`, raw render PNG, and `part.json`. Blender is normally
already running with the Blender MCP add-on on port `9876`; use that session to
create or inspect the model, render the transparent orthographic PNG, then run:

```bash
python scripts/import-part-assets.py "C:/Users/User/Desktop/Blender Assets/Parts"
```

The importer writes `public/parts/<part-id>.webp` and refreshes
`src/build/generated/partCatalogueData.ts`. Keep dimensions in `part.json`
verified against a datasheet, fabrication print, or supplier page before
importing.

Pin silkscreen is part of render quality, not decorative polish. Header labels
must be clear at the size the hardware bench displays them: high contrast,
unobscured by components or traces, and large enough to distinguish the exact
pin order before a user wires the part.

> **This file had gone stale.** Sixteen parts under `Blender Assets/Parts/`
> are finished — every blocking Phase 1 item included — while this list still
> showed them outstanding. Checked against the folder on 2026-08-19. What is
> actually missing is not the renders but the **import**: only the INMP441,
> 74AHCT125, button, potentiometer and encoder have reached
> `src/assets/components/`, and the amplifier only did so on that date.
>
> Each finished part carries a `part.json` with `dimensionsMm` verified against
> a datasheet or fabrication print. The app should read those rather than
> hand-declaring footprints — two of the three it had guessed were wrong (see
> the note under the amplifier). That is Phase 3's part-catalogue item.

## Blocking — Phase 1 (LED outputs)

Nothing else in the branch can be demonstrated without these.

- [x] **WS2812B strip** — 100.2 × 12.5 mm, `ws2812b-strip`.
- [x] **WS2812B matrix panel, 16×16** — 160 × 160 mm, `ws2812b-matrix-16x16`.
- [x] **HUB75 panel** — 64×64 P4, 256 × 256 mm, `hub75-panel-64x64-p4`.

**LED rings — one render per LED count**, not a single parametric ring. The
count is the thing the user bought, and the whole point of the picture is
recognising your own part:

- [x] 8 LEDs — 32.2 mm diameter
- [x] 12 LEDs — 37.0 mm
- [x] 16 LEDs — 44.5 mm
- [x] 24 LEDs — 65.5 mm
- [x] 60 LEDs — 158.0 mm

These are the measured diameters, and they are not linear in LED count — the
app currently derives a ring's size as `N x 10 mm / pi`, which gives 25.5 mm at
8 LEDs and 191 mm at 60 against the real 32.2 and 158. Another reason the
catalogue should carry the numbers.

## Phase 3 — parts with a signal role

- [x] **INMP441 I2S microphone** — 15.0 × 10.5 mm, imported.
  Note: the app declares this part as 20.5 × 14.5 mm, which disagrees with the
  asset it is displaying by a third. Unconfirmed which is intended.
**microSD breakout — two separate parts, two renders.** The 5 V module carries
a regulator and level shifter; the bare 3.3 V breakout does not and is damaged
by 5 V. Showing one generic picture for both would be exactly the quiet lie
this model exists to remove.

- [x] microSD module, 5 V (onboard regulator + level shifter) — 24 × 42 mm
- [x] microSD breakout, 3.3 V (bare) — 20.32 × 21.59 mm
- [x] **Button module** — `button_module.blend` / `.png`.
- [x] **Potentiometer module** — `potentiometer_module.blend` / `.png`.
- [x] **Rotary encoder module** — `encoder_module.blend` / `.png`.

## Phase 3 — parts with no signal role

Hardware view only; these never appear in the graph.

- [x] **MAX98357A I2S amplifier** — 17.78 × 25.4 mm (0.70 × 1.00 in), modelled
  2026-08-17, imported to the app 2026-08-19. The app had guessed 17.8 × 13.2
  and drew it at about half its real length; in a view whose purpose is true
  relative scale that is the one error that cannot be shrugged off.
- [x] **Speaker**, 4 Ω 3 W 40 mm — `speaker-4ohm-3w-40mm`.
- [x] **74AHCT125 level shifter** — 11.71 × 19.3 mm, already imported.

## Phase 4 — audio sources

- [x] **DFPlayer Mini** — 20 × 20 mm. In scope because it is the case that makes
  line-in mandatory: its decoding happens on the module, so it can never be
  decoder-tapped.
- [x] **Line-in ADC breakout** — PCM1802, 52 × 38 mm.

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

### Boards still to model

Every board in the upload catalogue gets a real model — no generic outlines. A
board shown as a grey box in a view where every other board is a photograph
reads as unfinished, and the point of the hardware view is recognising the part
in your hand.

Five catalogue entries are chip-family targets rather than specific boards
(`esp32c3`, `esp32c6`, `esp32h2`, `nodemcuv2`, `arduino:avr:uno`) and are
already covered by models awaiting import above.

That leaves 28, grouped by family so they can be batched:

**Teensy (7)**
- [ ] Teensy 4.1 · [ ] Teensy 4.0 · [ ] Teensy 3.6 · [ ] Teensy 3.5
- [ ] Teensy 3.1 / 3.2 · [ ] Teensy 3.0 · [ ] Teensy LC

**Adafruit SAMD / nRF52 (6)**
- [ ] Feather M0 (SAMD21) · [ ] QT Py M0 (SAMD21) · [ ] Feather M4 (SAMD51)
- [ ] Grand Central M4 · [ ] Matrix Portal M4 · [ ] nRF52840 DK

**Arduino (7)**
- [ ] Nano · [ ] Leonardo · [ ] Mega · [ ] Nano Every
- [ ] Nano 33 IoT · [ ] Zero · [ ] Due

**STM32 (4)**
- [ ] Blue Pill F103C8 · [ ] Black Pill F411CE
- [ ] Nucleo F429ZI · [ ] Nucleo F439ZI

**Other (4)**
- [ ] ESP32 Wrover Module · [ ] RP2040 Pico · [ ] RP2350 Pico 2
- [ ] Arduino UNO R4 WiFi

Lowest priority of everything in this file — none of them is hardware
validated, and the ESP32 family covers the boards actually being tested. Worth
doing in family batches once the parts above are done, since a family shares
most of its geometry.
