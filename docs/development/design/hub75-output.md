# HUB75 output — design note

Status: in progress — property model, vendoring, single-panel codegen (normal
Upload/Export, Flash Wiring Test, Live Stream), board-family gating, and a
HUB75-specific power estimate implemented. **Hardware-validated (2026-08-09)**:
Flash Wiring Test on a real ESP32-S3 + P4 64×64 panel confirmed the diagnostic
pattern displays correctly (see `todo.md` for the two boot-failure bugs found
and fixed along the way — a validation gap in `collectPinUses` and a default
pinout that collided with the S3's flash pins). Panel chaining, the show
controller and music-sync player generators, and HUB75+addressable
peripheral-contention are not yet implemented/validated. · Owner: app ·
Date: 2026-08-07

Scopes a second physical-output family for `MatrixOutput`: HUB75 scan-panel
matrices (the common indoor P2–P10 modules), driven over their ribbon
connector instead of a single-wire addressable chipset. Originally written
before any code existed; update it as decisions get made (see `todo.md`'s
**HUB75 Output node** entry for the current checklist).

## The shape of the problem

Every output Studio currently drives — WS2812B, APA102, WS2801, HD108, … —
is an **addressable strip**: one data pin (plus a clock pin for SPI parts),
driven through FastLED's own `addLeds<CHIPSET, PIN, ORDER>()`. HUB75 is a
different animal:

1. **No FastLED driver.** FastLED has no native HUB75 support today —
   confirmed against the current upstream repo and release notes. Every
   working HUB75 setup in the wild goes through a separate library.
2. **A 13–14 signal ribbon, not one pin.** `R1/G1/B1/R2/G2/B2` (two pixel
   rows driven per clock, feeding the panel's row-doubled scan), `A/B/C/D`
   (and `E` on 64-row panels) row-select address lines, plus `CLK`/`LAT`/`OE`.
   None of this fits `MatrixOutput`'s existing single-`dataPin`(+`clockPin`)
   model.
3. **A DMA-driven refresh loop, not `FastLED.show()`.** A HUB75 panel has no
   per-pixel latch — it must be continuously scanned (bit-angle modulation
   across the row-select lines) or it flickers/dims. The standard approach
   uses the ESP32's I2S/LCD peripheral + DMA to do this in the background,
   which is a fundamentally different runtime model from FastLED writing a
   framebuffer once per frame.
4. **Real brightness/power tradeoffs the current model doesn't capture.**
   Indoor HUB75 panels are quite dim outside artificial-light conditions —
   confirmed against direct hardware experience with a P4 indoor panel — and
   draw meaningfully more current per panel than the ~60 mA/LED assumption
   `estimatePowerLoad()` already uses for addressable strips.

## Proposed decisions

### Driver: `ESP32-HUB75-MatrixPanel-DMA`, not SmartMatrix

Researched two real options (see the conversation this note came out of for
the source links):

- **[`mrcodetastic/ESP32-HUB75-MatrixPanel-DMA`](https://github.com/mrcodetastic/ESP32-HUB75-MatrixPanel-DMA)**
  — actively maintained, ESP32/S2/S3-native, DMA/I2S-driven, Adafruit-GFX
  compatible, with a `Framebuffer_GFX` shim that exposes a CRGB-buffer-style
  surface.
- **[`pixelmatix/SmartMatrix`](https://github.com/pixelmatix/SmartMatrix)**
  — the library closest to a literal "FastLED → HUB75 bridge" (its own docs
  describe drawing patterns with FastLED while SmartMatrix owns the HUB75
  refresh). Mature on Teensy 3/4; explicitly **experimental** on ESP32, with
  a long-standing FastLED issue
  ([FastLED#586](https://github.com/FastLED/FastLED/issues/586)) about the
  ESP32 path needing a Teensy-core-only header.

Studio's validated hardware center of gravity is ESP32-S3. Recommendation:
build against `ESP32-HUB75-MatrixPanel-DMA`. Personal hardware experience
(a plain ESP32 + 64×64 P4 panel) confirms this library works well on exactly
this class of board. SmartMatrix's ESP32 path stays a "not this" unless a
Teensy-first user specifically asks for it later.

### A new route family on `MatrixOutput`, not a standalone node type

`MatrixOutput` is already a multi-route architecture (`src/state/outputRouting.ts`,
`docs/architecture/multi-output-routing.md`): each instance is an independent
physical route with its own pins, chipset, size, layout, and brightness,
composited from a shared canvas via `fit`/crop. A HUB75 panel is still
conceptually "a Frame routed to physical LEDs" — it just needs a third
hardware family alongside the existing clockless/SPI chipset lists.

Proposed: add `'HUB75'` as a `chipset` option whose selection swaps the pin
editors from the current `dataPin`/`clockPin` pair to the full HUB75 pin set
(gated the same way `isPropertyEnabled` already gates SPI-only `clockPin`)
and swaps codegen's `addLeds<>()` path for the DMA library's panel-config +
init. This reuses composition, power/RAM estimation plumbing, and the Graph
Health/GPIO-conflict machinery instead of duplicating them in a parallel node
type. Rejected alternative: a standalone `HUB75Output` node — would fork the
route/composition logic MatrixOutput already owns for no clear benefit, since
a HUB75 panel plays the identical *role* in a graph (a Frame sink).

### New per-route properties (implemented — `src/state/nodeLibrary.ts`)

- No separate panel-resolution/chain-length properties: per-panel resolution
  falls out of the existing `width`/`height` ÷ `tilesX`/`tilesY` (reusing the
  `panels` layout — see the resolved chaining-model question below).
- `hub75ColorDepthBits` (PWM bit depth, 1–8 — trades refresh-rate
  smoothness/flicker against CPU/DMA bandwidth; the DMA library exposes this
  directly)
- `hub75WideScan` (bool) gates `hub75EPin`, the row-select line only 1:32-scan
  (typically 64-row) panels need
- The 13–14 HUB75 pin fields (`hub75R1Pin`…`hub75OePin`), defaulted to the DMA
  library's documented classic-ESP32 pinout (per-board remapping is a
  follow-up, same as every other hardware node), each joining the existing
  shared GPIO-conflict namespace (`GPIO_PIN_PROPERTIES`, `collectPinUses` in
  `src/utils/validateGraph.ts`)

### Vendoring (implemented — `backend/app.py`)

Follows the existing `ESP32-audioI2S`/`esp_dmx` pattern
(`_ensure_fbuild_hub75_lib`): `git clone` the DMA library into the fbuild
project's `lib/` on first use, pinned to tag `3.0.14` (the newest
non-prerelease release as of 2026-08-08) rather than tracking a
branch (the audio-lib vendoring hit a real regression from doing that — see
`todo.md`'s hardware-validation entry from 2026-07-28). `arduino-cli` should
be able to pull it through its own library manager as a fallback engine.

### Codegen (implemented, single panel only — `src/codegen/cppGenerator.ts`)

`hub75HardwareFromProps`/`hub75SetupCpp` swap `ledHardwareFromProps`/
`FastLED.addLeds<>()` for `HUB75_I2S_CFG`/`MatrixPanel_I2S_DMA` — verified
against the vendored library's real header and bundled example sketch at tag
`3.0.14`, not guessed: the `i2s_pins` struct field order, the
`HUB75_I2S_CFG(width, height, chain, pins)` constructor,
`setPixelColorDepthBits()`, `begin()`, `setBrightness8()`, and
`drawPixelRGB888(x, y, r, g, b)` are all real API surface. Per frame, the
composited buffer is walked pixel-by-pixel into `drawPixelRGB888()` instead
of a `leds[]` array + `FastLED.show()`; `FastLED.setMaxPowerInVoltsAndMilliamps`
is skipped for HUB75 since no `CLEDController` is registered for it to
throttle.

This is intentionally narrow: only a **single** `MatrixOutput` route, only
`layout: 'matrix'` (one panel, no chaining/tiling), and no supersampling.
`findHub75ConfigErrors`/`findHub75ConfigIssues` in `validateGraph.ts`
(renamed from the earlier blanket `findUnimplementedChipsetErrors`) allow
that supported shape and block every other HUB75 combination — multiple
Matrix Output routes, a non-Matrix layout, or supersampling — each with its
own message pointing at what to change. The other four sketch generators
that share the same `ledHardwareFromProps`/`fastledSetupCpp` helpers (show
controller, music-sync player, live-stream receiver, standalone wiring
diagnostic) do **not** have HUB75 support yet; `validateGraph`'s single-route
rule keeps a HUB75-plus-any-of-those combination from being reachable via the
UI today, but those generators have no HUB75-aware codepath of their own if
ever called directly. Not yet hardware-validated.

## Open questions

- **Can a HUB75 route and an addressable-strip route share one board?**
  Both the DMA library and FastLED's own clockless/RMT output lean on
  DMA-capable peripherals (I2S/RMT). Whether they can run concurrently
  without contention is still unverified — needs real hardware to answer.
  Currently moot in practice: codegen only supports a single Matrix Output
  route at all (see above), so a mixed HUB75 + addressable-strip rig is
  blocked regardless of this question's answer.
- ~~**Virtual-panel chaining model.**~~ **Resolved for the property model,
  open for codegen:** the property model reuses the existing
  `layout: 'panels'` tiling (`tilesX`/`tilesY`/`tileRotations`/
  `tileSerpentine`, `src/state/xyLayout.ts`) rather than inventing separate
  panel-resolution/chain-length properties — a HUB75 chain's per-panel
  resolution falls out of `width`/`height` ÷ `tilesX`/`tilesY`, same as an
  addressable panel grid. Codegen doesn't act on that yet, though: turning a
  `tilesX`/`tilesY` grid into a real DMA chain needs the library's separate
  `VirtualMatrixPanel` wrapper class for anything beyond `chain_length = 1`
  panels in a single row, and that class's API hasn't been verified against
  the vendored source yet (unlike `HUB75_I2S_CFG`/`MatrixPanel_I2S_DMA`
  above). `findHub75ConfigErrors` blocks `layout !== 'matrix'` for HUB75
  until this is done.
- **Preview fidelity.** The live preview already renders LEDs as discs with
  glow (`webglRenderer.ts`); a HUB75 panel's actual visual character (visible
  scan lines, lower effective bit depth at high refresh) is different enough
  that the preview may want a distinct render mode, or may be fine reusing
  the existing one — needs a look once something is on screen.
- ~~**Brightness/power model.**~~ **Resolved:** `estimatePowerLoad()` now
  rates HUB75 routes at `MA_PER_HUB75_PIXEL_WORST_CASE` (~1 mA/px) instead of
  the addressable-strip `MA_PER_LED_WORST_CASE` (60 mA/LED) — derived from
  real current draw Steve reported on a P4 64×64 panel (1.0–2.5 A typical, up
  to ~4 A worst case; anchored to the ~4 A high end, matching the existing
  figure's "worst case" framing). One measured data point for one panel
  model, not a published spec-sheet figure — may not generalize to other
  panel resolutions or driver ICs.

## Deliberately out of v1

- Outdoor-brightness / higher-PWM-frequency panel variants — start with the
  common indoor P2–P10 class.
- Mixed HUB75 + addressable-strip rigs, until the peripheral-contention
  question above is answered.
- Any board family besides ESP32/S2/S3 — the DMA library is ESP32-only.

## Follow-ups

Tracked in `todo.md` under **Node additions worth considering → HUB75 Output
node**.
