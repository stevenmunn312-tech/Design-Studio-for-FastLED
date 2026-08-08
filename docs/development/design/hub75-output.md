# HUB75 output — design note

Status: proposed (not started) · Owner: app · Date: 2026-08-07

Scopes a second physical-output family for `MatrixOutput`: HUB75 scan-panel
matrices (the common indoor P2–P10 modules), driven over their ribbon
connector instead of a single-wire addressable chipset. Written before any
code exists, so this records a proposal and open questions, not a shipped
contract — update it as decisions get made.

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

### New per-route properties

- `panelResX` / `panelResY` (typically 64×32 or 64×64 per physical panel)
- `chainLength` (panels wired in series) and `panelRows`/`panelCols` if the
  chain is folded into a 2D virtual-panel grid rather than a single row
- `colorDepthBits` (PWM bit depth — trades refresh-rate smoothness/flicker
  against CPU/DMA bandwidth; the DMA library exposes this directly)
- The 13–14 HUB75 pin fields, defaulted to the DMA library's documented
  default pinout for whichever board is selected, each joining the existing
  shared GPIO-conflict namespace

### Vendoring

Follow the existing `ESP32-audioI2S` pattern (`_ensure_fbuild_audio_lib` in
`backend/app.py`): `git clone` the DMA library into the fbuild project's
`lib/` on first use, pinned to a known-good tag rather than tracking a
branch (the audio-lib vendoring hit a real regression from doing that — see
`todo.md`'s hardware-validation entry from 2026-07-28). `arduino-cli` should
be able to pull it through its own library manager as a fallback engine.

## Open questions

- **Can a HUB75 route and an addressable-strip route share one board?**
  Both the DMA library and FastLED's own clockless/RMT output lean on
  DMA-capable peripherals (I2S/RMT). Whether they can run concurrently
  without contention is unverified — needs to be answered with real hardware
  before allowing a mixed rig in the UI, and blocked (with a validation-graph
  error) until it is.
- **Virtual-panel chaining model.** Single-row chain vs. a folded 2D grid of
  panels both exist in the wild; `MatrixOutput`'s existing `panels` tiling
  layout (`src/state/xyLayout.ts`) already solves a similar problem for
  addressable panels — worth reusing its rotation/serpentine-chain model
  rather than inventing a second one.
- **Preview fidelity.** The live preview already renders LEDs as discs with
  glow (`webglRenderer.ts`); a HUB75 panel's actual visual character (visible
  scan lines, lower effective bit depth at high refresh) is different enough
  that the preview may want a distinct render mode, or may be fine reusing
  the existing one — needs a look once something is on screen.
- **Brightness/power model.** `estimatePowerLoad()`'s ~60 mA/LED worst-case
  figure is tuned for addressable strips; HUB75 panels have their own
  published max-draw figures (per panel, not per LED) that should replace it
  for HUB75 routes rather than silently reusing the wrong number.

## Deliberately out of v1

- Outdoor-brightness / higher-PWM-frequency panel variants — start with the
  common indoor P2–P10 class.
- Mixed HUB75 + addressable-strip rigs, until the peripheral-contention
  question above is answered.
- Any board family besides ESP32/S2/S3 — the DMA library is ESP32-only.

## Follow-ups

Tracked in `todo.md` under **Node additions worth considering → HUB75 Output
node**.
