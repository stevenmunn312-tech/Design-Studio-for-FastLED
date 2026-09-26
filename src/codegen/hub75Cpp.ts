import { tileRotationAt, rotatePoint } from '../state/xyLayout'
import { DEFAULT_CONTROLLER_SETTINGS } from '../state/controllerSettings'
import { sanitizePin } from './hardwarePins'

// ── HUB75 hardware setup (MatrixOutput → ESP32-HUB75-MatrixPanel-DMA) ──────
// A HUB75 route (docs/development/design/hub75-output.md) has no FastLED
// driver — it's driven over its own 13-14 signal ribbon via a separate DMA
// library instead of FastLED's addLeds<>()/leds[]/show(). Scoped for now to a
// single LED output route and no supersampling — see findHub75ConfigIssues
// in validateGraph.ts for the gate.

/** A folded 2D grid of chained panels (`layout: 'panels'`, `tilesY > 1`)
 *  needs the DMA library's `VirtualMatrixPanel_T` wrapper — the base
 *  `MatrixPanel_I2S_DMA` class can only address one row's worth of height
 *  (`mx_height`) directly, so a second row of panels has nowhere to go
 *  without it. `chainType` is a compile-time template parameter (an enum
 *  value baked into the generated source, not a runtime string) — one of
 *  the 8 real `PANEL_CHAIN_TYPE` values, verified against the vendored
 *  header (tag 3.0.14). Picked `CHAIN_TOP_LEFT_DOWN`/`_ZZ` as the best match
 *  for this app's existing row-major-from-top-left model (`tileSerpentine`
 *  → the `_ZZ` zigzag variant) — the class's own naming describes exactly
 *  that topology, but the precise row-to-DMA-offset direction inside its
 *  transform wasn't independently confirmed against real 2+ panel hardware
 *  (only against the source, which was ambiguous on this one point). May
 *  need revisiting once real multi-row hardware exists to test against. */
export interface Hub75VirtualGrid {
  rows: number
  cols: number
  chainType: string
}

export interface Hub75Hardware {
  panelResX: number
  panelResY: number
  chainLength: number
  virtualGrid: Hub75VirtualGrid | null
  // Logical (x, y) -> display-space (x, y) remap for per-panel tileRotations,
  // packed as y<<8 | x (MatrixOutput dimensions clamp to <=64).
  coordMap: number[] | null
  pins: {
    r1: number; g1: number; b1: number; r2: number; g2: number; b2: number
    a: number; b: number; c: number; d: number; e: number
    lat: number; oe: number; clk: number
  }
  colorDepthBits: number
  brightness: number
}

function hub75CoordMapFromProps(
  p: Record<string, unknown>,
  width: number,
  height: number,
  tilesX: number,
  tilesY: number,
): number[] | null {
  if (String(p.layout ?? 'matrix') !== 'panels') return null
  if (width % tilesX !== 0 || height % tilesY !== 0) return null
  const tileW = width / tilesX
  const tileH = height / tilesY
  const map = new Array<number>(width * height)
  let needsMap = false
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tx = Math.floor(x / tileW)
      const ty = Math.floor(y / tileH)
      const lx = x - tx * tileW
      const ly = y - ty * tileH
      const deg = tileRotationAt(p, ty * tilesX + tx)
      if (deg !== 0) needsMap = true
      const r = rotatePoint(lx, ly, tileW, tileH, deg)
      map[y * width + x] = ((ty * tileH + r.y) << 8) | (tx * tileW + r.x)
    }
  }
  return needsMap ? map : null
}

/** Resolve + sanitise a MatrixOutput node's HUB75 properties. `width`/`height`
 *  are the composed matrix's dimensions; for `layout: 'panels'`,
 *  `width`/`height` split evenly across `tilesX`×`tilesY` chained panels. A
 *  single row (`tilesY === 1`) needs no wrapper at all: the DMA library's base
 *  class already addresses that whole chain directly
 *  (`PIXELS_PER_ROW = mx_width * chain_length`). A folded 2D grid
 *  (`tilesY > 1`) uses `VirtualMatrixPanel_T` for the chain routing, and an
 *  optional coordMap handles this app's independent per-panel tileRotations on
 *  top of that virtual display. `hub75EPin` is only meaningful when
 *  `hub75WideScan` is on — the DMA library's own convention for "unused" is
 *  -1, matching its documented default pinout. Fallback pin numbers MUST
 *  match nodeLibrary.ts's MatrixOutput defaultProperties exactly (kept in
 *  sync by hand) — hardwareManifest.ts's collectPinUses reads the same library
 *  defaults to check pins that were never explicitly saved on an older node,
 *  so a mismatch here would let a codegen-only default escape validation
 *  again. Chosen as the exact intersection of valid, output-capable GPIOs
 *  across every `HUB75_SUPPORTED_FQBNS` board (ESP32/S2/S3) — see the
 *  comment on these defaults in nodeLibrary.ts for the full derivation and
 *  the GPIO0/CLK caveat. */
export function hub75HardwareFromProps(p: Record<string, unknown>, width: number, height: number): Hub75Hardware {
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
  }
  const wideScan = p.hub75WideScan === true
  const isPanels = String(p.layout ?? 'matrix') === 'panels'
  const tilesX = isPanels ? Math.max(1, Math.round(Number(p.tilesX ?? 1))) : 1
  const tilesY = isPanels ? Math.max(1, Math.round(Number(p.tilesY ?? 1))) : 1
  const chainLength = tilesX * tilesY
  const panelResX = tilesX > 1 ? Math.round(width / tilesX) : width
  const panelResY = tilesY > 1 ? Math.round(height / tilesY) : height
  const chainType = p.tileSerpentine === true ? 'CHAIN_TOP_LEFT_DOWN_ZZ' : 'CHAIN_TOP_LEFT_DOWN'
  return {
    panelResX,
    panelResY,
    chainLength,
    virtualGrid: tilesY > 1 ? { rows: tilesY, cols: tilesX, chainType } : null,
    coordMap: hub75CoordMapFromProps(p, width, height, tilesX, tilesY),
    pins: {
      r1: sanitizePin(p.hub75R1Pin, 1), g1: sanitizePin(p.hub75G1Pin, 2), b1: sanitizePin(p.hub75B1Pin, 3),
      r2: sanitizePin(p.hub75R2Pin, 4), g2: sanitizePin(p.hub75G2Pin, 5), b2: sanitizePin(p.hub75B2Pin, 12),
      a: sanitizePin(p.hub75APin, 13), b: sanitizePin(p.hub75BPin, 14), c: sanitizePin(p.hub75CPin, 15), d: sanitizePin(p.hub75DPin, 16),
      e: wideScan ? sanitizePin(p.hub75EPin, 33) : -1,
      lat: sanitizePin(p.hub75LatPin, 17), oe: sanitizePin(p.hub75OePin, 18), clk: sanitizePin(p.hub75ClkPin, 0),
    },
    colorDepthBits: Math.round(num(p.hub75ColorDepthBits, 8, 1, 8)),
    brightness: Math.round(num(p.brightness, DEFAULT_CONTROLLER_SETTINGS.brightness, 0, 255)),
  }
}

/** `#include` lines a HUB75 sketch needs — the base header always, plus the
 *  VirtualMatrixPanel_T header when a 2D panel grid needs it. */
export function hub75IncludesCpp(hw: Hub75Hardware): string[] {
  return [
    '#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>',
    ...(hw.virtualGrid ? ['#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>'] : []),
  ]
}

/** Global-scope declarations for the display object(s) — the base DMA
 *  display always, plus the virtual-grid wrapper (templated on its chain
 *  type) when needed. */
export function hub75GlobalsCpp(hw: Hub75Hardware): string[] {
  return [
    'MatrixPanel_I2S_DMA *dma_display = nullptr;',
    ...(hw.virtualGrid ? [`VirtualMatrixPanel_T<${hw.virtualGrid.chainType}> *hub75Virtual = nullptr;`] : []),
    ...(hw.coordMap ? ['const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = { ' + hw.coordMap.join(',') + ' };'] : []),
  ]
}

/** Which display object a per-pixel `drawPixelRGB888()` call should target —
 *  the virtual-grid wrapper when one exists (it re-maps into the base
 *  display internally), otherwise the base DMA display directly. */
export function hub75DisplayVar(hw: Hub75Hardware): string {
  return hw.virtualGrid ? 'hub75Virtual' : 'dma_display'
}

/** Emit the row-major CRGB -> HUB75 blit. When per-panel tileRotations are in
 *  play, `_hub75CoordMap` remaps each logical pixel into the correct panel-
 *  local rotated coordinate before handing it to the DMA display object. */
export function hub75BlitRowsCpp(hw: Hub75Hardware, srcExpr = 'leds[_y * WIDTH + _x]'): string[] {
  const display = hub75DisplayVar(hw)
  const lines = [
    '  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {',
    `    CRGB _c = ${srcExpr};`,
  ]
  if (hw.coordMap) {
    lines.push(
      '    uint16_t _hub75XY = pgm_read_word(&_hub75CoordMap[_y * WIDTH + _x]);',
      `    ${display}->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);`,
    )
  } else {
    lines.push(`    ${display}->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);`)
  }
  lines.push('  }')
  return lines
}

/** setup() lines initialising the DMA display: pin struct, HUB75_I2S_CFG,
 *  MatrixPanel_I2S_DMA, begin(), brightness, an initial clear, and (for a 2D
 *  panel grid) the VirtualMatrixPanel_T wrapper — mirrors the example
 *  sketches bundled with ESP32-HUB75-MatrixPanel-DMA (verified against the
 *  vendored tag, 3.0.14). */
export function hub75SetupCpp(hw: Hub75Hardware): string[] {
  const p = hw.pins
  const lines = [
    `  HUB75_I2S_CFG::i2s_pins _hub75Pins = { ${p.r1}, ${p.g1}, ${p.b1}, ${p.r2}, ${p.g2}, ${p.b2}, ${p.a}, ${p.b}, ${p.c}, ${p.d}, ${p.e}, ${p.lat}, ${p.oe}, ${p.clk} };`,
    `  HUB75_I2S_CFG _hub75Cfg(${hw.panelResX}, ${hw.panelResY}, ${hw.chainLength}, _hub75Pins);`,
    `  _hub75Cfg.setPixelColorDepthBits(${hw.colorDepthBits});`,
    `  dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);`,
    `  dma_display->begin();`,
    `  dma_display->setBrightness8(${hw.brightness});`,
    `  dma_display->clearScreen();`,
  ]
  if (hw.virtualGrid) {
    lines.push(
      `  hub75Virtual = new VirtualMatrixPanel_T<${hw.virtualGrid.chainType}>(${hw.virtualGrid.rows}, ${hw.virtualGrid.cols}, ${hw.panelResX}, ${hw.panelResY});`,
      `  hub75Virtual->setDisplay(*dma_display);`,
    )
  }
  return lines
}
