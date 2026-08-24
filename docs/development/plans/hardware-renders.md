# Hardware renders — what the app needs

Tracks the renders required by the `Hardware` branch's two-view model (see
[`hardware-nodes.md`](../design/hardware-nodes.md)): a full render per part in
the hardware view, and a thumbnail of the same asset in the graph.

Complements — does not replace — `BOARD_MODELING_CHECKLIST.md` in the Blender
asset folder, which tracks the *modelling* workflow for boards. This file
tracks what the **app** is waiting on, and covers the non-board parts that
checklist does not.

The baseline LED-output renders are complete. Use
[`hardware-todo.md`](hardware-todo.md) for active product work; this file now
tracks asset/import status only.

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

Finished parts carry `part.json` dimensions verified against a datasheet or
fabrication print. Import those manifests instead of hand-declaring footprints;
the remaining work is catalogue/import coverage, not recreating finished
renders.

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

### Imported and live (63)

Every board folder in the Blender workspace has a usable `board.json`. Running
`scripts/import-board-assets.py` imports all 63 manifests, writes all 63 WebP
renders to `public/boards/`, and merges all 63 profiles into `BOARD_PROFILES`.
There is no remaining board-render import backlog.

The original 13-board batch remains live:

- [x] adafruit-feather-esp32-s2
- [x] adafruit-feather-esp32-s3
- [x] adafruit-feather-esp32-v2
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

### Requested 15-board import batch

Imported with render, catalogue entry, pin map, GPIO capability data, and
peripheral defaults where the manifest provides them. Sparse or unresolved
labels remain neutral rather than being treated as safe pins.

- [x] arduino-uno-r3-dip
- [x] esp32-c3-devkitm-1
- [x] esp32-c3-super-mini
- [x] esp32-c6-devkitc-1
- [x] esp32-c6-devkitm-1
- [x] esp32-c6-super-mini
- [x] esp32-h2-devkitm-1
- [x] esp32-h2-super-mini
- [x] esp8266-adafruit-feather-huzzah
- [x] esp8266-lolin-d1-mini
- [x] esp8266-nodemcu-v2-amica
- [x] esp8266-wemos-d1-r2
- [x] lolin-c3-mini
- [x] seeed-xiao-esp32c3
- [x] seeed-xiao-esp32c6

The other 35 modelled boards in the workspace are also imported and live. The
generated catalogue is the authoritative inventory; this document no longer
duplicates that full list.

### Data-quality safeguards

Imported does not mean hardware-validated. Profiles without a positive
pin-safety allowlist report their pins as `unknown`, and generated pin maps keep
the visible not-hand-checked caveat until verified against a physical board.
Every imported profile with header pins now carries a conservative positive
allowlist, and alias-heavy silkscreens carry explicit Arduino pin-number maps.
The MatrixPortal M4 intentionally has no general-purpose header rail and is not
reported as missing data. `UNLISTED_SAFETY_IDS`, `UNMAPPED_CAPABILITY_IDS`, and
the board-profile validator keep these distinctions covered by tests.
