import type { StudioNode } from '../state/graphStore'
import { buildXYTable, tileRotationAt } from '../state/xyLayout'
import { ledHardwareFromProps, fastledSetupCpp, overclockDefineCpp, hub75HardwareFromProps, hub75SetupCpp, hub75IncludesCpp, hub75GlobalsCpp, hub75BlitRowsCpp } from './cppGenerator'
import { sanitizePin } from './hardwarePins'
import { SPI_CHIPSETS, HUB75_CHIPSET } from '../state/nodeLibrary'

function intProp(val: unknown, def: number, min: number, max: number): number {
  const n = Math.round(Number(val))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def
}

function matrixOutputNode(nodes: StudioNode[], outputNodeId?: string): StudioNode | undefined {
  return nodes.find((node) => node.id === outputNodeId && node.data.nodeType === 'MatrixOutput')
    ?? nodes.find((n) => n.data.nodeType === 'MatrixOutput')
}

export type WiringDiagnosticMode = 'cycle' | 'hub75-panel-topology'

/** Generate a standalone hardware-wiring diagnostic sketch from the current
 *  MatrixOutput settings. The sketch cycles through color-order solids,
 *  brightness/current-limit bars, an orientation gradient, panel numbering,
 *  a logical XY chase, and a direct physical-index chase, so it can be flashed
 *  before the user has built a normal creative graph. */
export function generateWiringDiagnosticSketch(
  nodes: StudioNode[],
  outputNodeId?: string,
  diagnosticMode: WiringDiagnosticMode = 'cycle',
): string | null {
  const outputNode = matrixOutputNode(nodes, outputNodeId)
  if (!outputNode) return null

  const p = outputNode.data.properties as Record<string, unknown>
  const width = intProp(p.width, 16, 1, 64)
  const height = intProp(p.height, 16, 1, 64)
  const dataPin = sanitizePin(p.dataPin, 5)
  const hw = ledHardwareFromProps(p)
  const isHub75 = hw.chipset === HUB75_CHIPSET
  const hub75Hw = isHub75 ? hub75HardwareFromProps(p, width, height) : null
  // Addressable LEDs need the baked grid -> physical-index table. HUB75's DMA
  // display / VirtualMatrixPanel_T path already owns chain routing, with
  // hub75Hw.coordMap handling per-tile rotation, so applying buildXYTable here
  // as well would remap a folded grid twice.
  const xyTable = isHub75 ? null : buildXYTable(width, height, p)
  const powerLimit = p.powerLimit === true
  const volts = intProp(p.volts, 5, 1, 24)
  const milliamps = intProp(p.milliamps, 2000, 100, 50000)
  const layout = p.layout === 'panels' ? 'panels' : 'matrix'
  const tilesX = layout === 'panels' ? intProp(p.tilesX, 1, 1, 8) : 1
  const tilesY = layout === 'panels' ? intProp(p.tilesY, 1, 1, 8) : 1
  const panelsValid = layout === 'panels' && width % tilesX === 0 && height % tilesY === 0
  const effectiveTilesX = panelsValid ? tilesX : 1
  const effectiveTilesY = panelsValid ? tilesY : 1
  const tileW = Math.max(1, Math.floor(width / effectiveTilesX))
  const tileH = Math.max(1, Math.floor(height / effectiveTilesY))
  const hub75TopologyAvailable = isHub75 && panelsValid && effectiveTilesY > 1
  if (diagnosticMode === 'hub75-panel-topology' && !hub75TopologyAvailable) return null
  const topologyOnly = diagnosticMode === 'hub75-panel-topology'
  const tileSerpentine = p.tileSerpentine === true
  const tileRotations = Array.from(
    { length: effectiveTilesX * effectiveTilesY },
    (_, index) => tileRotationAt(p, index),
  )
  const modeMs = 3200
  const chaseMs = 90

  const lines: string[] = []
  lines.push('// Design Studio for FastLED — LED output wiring diagnostic.')
  lines.push('// Flash this when you want to verify hardware before loading a creative graph.')
  lines.push('// The sketch cycles through: RGB color-order solids, brightness/current-limit')
  lines.push('// bars, an orientation gradient, panel numbering, a logical XY chase, and a')
  lines.push('// direct physical-index chase for dead-pixel / chain-order checks.')
  if (hub75TopologyAvailable) {
    lines.push('// HUB75 folded-grid mode adds per-panel X/Y axes, fixed-colour corners,')
    lines.push('// grid coordinates, configured rotation, chain ordinal, and chain arrows.')
  }
  lines.push(...overclockDefineCpp(hw))
  lines.push('#include <FastLED.h>')
  if (isHub75) lines.push(...hub75IncludesCpp(hub75Hw!))
  lines.push('#include <stdio.h>')
  lines.push('')
  if (!isHub75) {
    lines.push(`#define DATA_PIN ${dataPin}`)
    if (SPI_CHIPSETS.has(hw.chipset)) lines.push(`#define CLOCK_PIN ${hw.clockPin}`)
  }
  lines.push(`#define WIDTH ${width}`)
  lines.push(`#define HEIGHT ${height}`)
  lines.push('#define NUM_LEDS (WIDTH * HEIGHT)')
  lines.push(`#define PANEL_TILES_X ${effectiveTilesX}`)
  lines.push(`#define PANEL_TILES_Y ${effectiveTilesY}`)
  lines.push(`#define PANEL_W ${tileW}`)
  lines.push(`#define PANEL_H ${tileH}`)
  if (hub75TopologyAvailable) {
    lines.push(`#define PANEL_SERPENTINE ${tileSerpentine ? 1 : 0}`)
    lines.push(`#define HUB75_PANEL_TOPOLOGY_ONLY ${topologyOnly ? 1 : 0}`)
  }
  lines.push(`#define DIAG_MODE_MS ${modeMs}`)
  lines.push(`#define DIAG_CHASE_MS ${chaseMs}`)
  lines.push('')
  lines.push('CRGB leds[NUM_LEDS];')
  if (isHub75) lines.push(...hub75GlobalsCpp(hub75Hw!))
  lines.push('')
  if (xyTable) {
    lines.push('// Physical wiring map (grid index -> physical LED index), baked from')
    lines.push("// MatrixOutput's serpentine / panel / custom-layout settings.")
    lines.push(`const uint16_t _xytable[${width * height}] PROGMEM = { ${xyTable.join(',')} };`)
    lines.push(`uint16_t XY(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable[(uint16_t)y * WIDTH + x]); }`)
    lines.push('')
  }
  lines.push('const uint8_t DIGITS[10][5] PROGMEM = {')
  lines.push('  { 0b111, 0b101, 0b101, 0b101, 0b111 },')
  lines.push('  { 0b010, 0b110, 0b010, 0b010, 0b111 },')
  lines.push('  { 0b111, 0b001, 0b111, 0b100, 0b111 },')
  lines.push('  { 0b111, 0b001, 0b111, 0b001, 0b111 },')
  lines.push('  { 0b101, 0b101, 0b111, 0b001, 0b001 },')
  lines.push('  { 0b111, 0b100, 0b111, 0b001, 0b111 },')
  lines.push('  { 0b111, 0b100, 0b111, 0b101, 0b111 },')
  lines.push('  { 0b111, 0b001, 0b001, 0b001, 0b001 },')
  lines.push('  { 0b111, 0b101, 0b111, 0b101, 0b111 },')
  lines.push('  { 0b111, 0b101, 0b111, 0b001, 0b111 }')
  lines.push('};')
  if (hub75TopologyAvailable) {
    lines.push('const uint8_t GLYPH_X[5] PROGMEM = { 0b101, 0b101, 0b010, 0b101, 0b101 };')
    lines.push('const uint8_t GLYPH_Y[5] PROGMEM = { 0b101, 0b101, 0b010, 0b010, 0b010 };')
    lines.push('const uint8_t GLYPH_P[5] PROGMEM = { 0b110, 0b101, 0b110, 0b100, 0b100 };')
    lines.push('const uint8_t GLYPH_R[5] PROGMEM = { 0b110, 0b101, 0b110, 0b101, 0b101 };')
    lines.push(`const uint16_t PANEL_ROTATIONS[PANEL_TILES_X * PANEL_TILES_Y] PROGMEM = { ${tileRotations.join(',')} };`)
  }
  lines.push('')
  lines.push('void plot(int x, int y, const CRGB& color) {')
  lines.push('  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;')
  if (xyTable) lines.push('  leds[XY((uint8_t)x, (uint8_t)y)] = color;')
  else lines.push('  leds[(uint16_t)y * WIDTH + x] = color;')
  lines.push('}')
  lines.push('')
  if (hub75TopologyAvailable) {
    lines.push('void drawGlyph3x5(int x, int y, const uint8_t glyph[5], const CRGB& color) {')
    lines.push('  for (int row = 0; row < 5; row++) {')
    lines.push('    uint8_t bits = pgm_read_byte(&glyph[row]);')
    lines.push('    for (int col = 0; col < 3; col++) if (bits & (1 << (2 - col))) plot(x + col, y + row, color);')
    lines.push('  }')
    lines.push('}')
    lines.push('')
    lines.push('void drawHorizontalArrow(int x0, int x1, int y, bool right, const CRGB& color) {')
    lines.push('  if (x1 < x0) return;')
    lines.push('  for (int x = x0; x <= x1; x++) plot(x, y, color);')
    lines.push('  int tip = right ? x1 : x0;')
    lines.push('  int stem = right ? tip - 1 : tip + 1;')
    lines.push('  plot(stem, y - 1, color); plot(stem, y + 1, color);')
    lines.push('}')
    lines.push('')
    lines.push('void drawVerticalArrow(int x, int y0, int y1, const CRGB& color) {')
    lines.push('  if (y1 < y0) return;')
    lines.push('  for (int y = y0; y <= y1; y++) plot(x, y, color);')
    lines.push('  plot(x - 1, y1 - 1, color); plot(x + 1, y1 - 1, color);')
    lines.push('}')
    lines.push('')
  }
  lines.push('void drawDigit(int x, int y, int digit, const CRGB& color) {')
  lines.push('  if (digit < 0 || digit > 9) return;')
  lines.push('  for (int row = 0; row < 5; row++) {')
  lines.push('    uint8_t bits = pgm_read_byte(&DIGITS[digit][row]);')
  lines.push('    for (int col = 0; col < 3; col++) {')
  lines.push('      if (bits & (1 << (2 - col))) plot(x + col, y + row, color);')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('void drawNumber(int x, int y, int value, const CRGB& color) {')
  lines.push('  char buf[8];')
  lines.push('  if (value < 0) value = 0;')
  lines.push('  snprintf(buf, sizeof(buf), "%d", value);')
  lines.push('  for (int i = 0; buf[i] && i < 7; i++) {')
  lines.push('    int digit = buf[i] - \'0\';')
  lines.push('    if (digit >= 0 && digit <= 9) drawDigit(x + i * 4, y, digit, color);')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('void drawBrightnessBars() {')
  lines.push('  static const uint8_t levels[5] = { 16, 48, 96, 160, 255 };')
  lines.push('  for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {')
  lines.push('    int band = (x * 5) / WIDTH; if (band > 4) band = 4;')
  lines.push('    uint8_t v = levels[band];')
  lines.push('    plot(x, y, CRGB(v, v, v));')
  lines.push('  }')
  lines.push('  if (HEIGHT >= 6) {')
  lines.push('    int labelY = HEIGHT - 5;')
  lines.push('    for (int band = 0; band < 5; band++) {')
  lines.push('      int startX = (band * WIDTH) / 5;')
  lines.push('      int endX = ((band + 1) * WIDTH) / 5 - 1;')
  lines.push('      int labelX = startX + ((endX - startX + 1) - 3) / 2;')
  lines.push('      drawDigit(labelX, labelY, band + 1, levels[band] >= 128 ? CRGB::Black : CRGB::White);')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  lines.push('void drawOrientationMap(bool blink) {')
  lines.push('  for (int y = 0; y < HEIGHT; y++) for (int x = 0; x < WIDTH; x++) {')
  lines.push('    uint8_t r = WIDTH > 1 ? (uint8_t)((x * 255) / (WIDTH - 1)) : 255;')
  lines.push('    uint8_t b = HEIGHT > 1 ? (uint8_t)((y * 255) / (HEIGHT - 1)) : 255;')
  lines.push('    plot(x, y, CRGB(r, 20, b));')
  lines.push('  }')
  lines.push('  plot(0, 0, blink ? CRGB::White : CRGB(40, 40, 40));')
  lines.push('  if (WIDTH > 1) plot(WIDTH - 1, 0, CRGB::Red);')
  lines.push('  if (HEIGHT > 1) plot(0, HEIGHT - 1, CRGB::Blue);')
  lines.push('  if (WIDTH > 1 && HEIGHT > 1) plot(WIDTH - 1, HEIGHT - 1, CRGB::Green);')
  lines.push('  if (WIDTH > 2) plot(1, 0, CRGB::White);')
  lines.push('  if (HEIGHT > 2) plot(0, 1, CRGB::White);')
  lines.push('}')
  lines.push('')
  lines.push('void drawPanelDiagnostic() {')
  lines.push('  fill_solid(leds, NUM_LEDS, CRGB::Black);')
  lines.push('  for (int ty = 0; ty < PANEL_TILES_Y; ty++) for (int tx = 0; tx < PANEL_TILES_X; tx++) {')
  lines.push('    int panelIndex = ty * PANEL_TILES_X + tx;')
  lines.push('    int px = tx * PANEL_W;')
  lines.push('    int py = ty * PANEL_H;')
  lines.push('    CHSV fill = CHSV((uint8_t)(panelIndex * 37), 210, 28);')
  lines.push('    CHSV edge = CHSV((uint8_t)(panelIndex * 37), 255, 120);')
  lines.push('    for (int y = 0; y < PANEL_H; y++) for (int x = 0; x < PANEL_W; x++) plot(px + x, py + y, fill);')
  lines.push('    for (int x = 0; x < PANEL_W; x++) { plot(px + x, py, edge); plot(px + x, py + PANEL_H - 1, edge); }')
  lines.push('    for (int y = 0; y < PANEL_H; y++) { plot(px, py + y, edge); plot(px + PANEL_W - 1, py + y, edge); }')
  lines.push('    int notchW = PANEL_W > 3 ? 2 : 1;')
  lines.push('    int notchH = PANEL_H > 3 ? 2 : 1;')
  lines.push('    for (int ny = 0; ny < notchH; ny++) for (int nx = 0; nx < notchW; nx++) plot(px + nx, py + ny, CRGB::White);')
  lines.push('    if (PANEL_W >= 3 && PANEL_H >= 5) {')
  lines.push('      char label[4];')
  lines.push('      snprintf(label, sizeof(label), "%d", panelIndex);')
  lines.push('      int digits = (label[1] == \'\\0\') ? 1 : (label[2] == \'\\0\') ? 2 : 3;')
  lines.push('      int labelW = digits * 4 - 1;')
  lines.push('      int labelX = px + (PANEL_W - labelW) / 2;')
  lines.push('      int labelY = py + (PANEL_H - 5) / 2;')
  lines.push('      drawNumber(labelX, labelY, panelIndex, CRGB::White);')
  lines.push('    }')
  lines.push('  }')
  lines.push('}')
  lines.push('')
  if (hub75TopologyAvailable) {
    lines.push('void drawHub75PanelTopology(bool blink) {')
    lines.push('  fill_solid(leds, NUM_LEDS, CRGB::Black);')
    lines.push('  for (int ty = 0; ty < PANEL_TILES_Y; ty++) for (int tx = 0; tx < PANEL_TILES_X; tx++) {')
    lines.push('    int panelIndex = ty * PANEL_TILES_X + tx;')
    lines.push('    int chainX = (PANEL_SERPENTINE && (ty & 1)) ? PANEL_TILES_X - 1 - tx : tx;')
    lines.push('    int chainOrdinal = ty * PANEL_TILES_X + chainX;')
    lines.push('    bool chainRight = !(PANEL_SERPENTINE && (ty & 1));')
    lines.push('    int px = tx * PANEL_W; int py = ty * PANEL_H;')
    lines.push('    CHSV fill = CHSV((uint8_t)(chainOrdinal * 47), 220, 18);')
    lines.push('    CHSV edge = CHSV((uint8_t)(chainOrdinal * 47), 255, 105);')
    lines.push('    for (int y = 0; y < PANEL_H; y++) for (int x = 0; x < PANEL_W; x++) plot(px + x, py + y, fill);')
    lines.push('    for (int x = 0; x < PANEL_W; x++) { plot(px + x, py, edge); plot(px + x, py + PANEL_H - 1, edge); }')
    lines.push('    for (int y = 0; y < PANEL_H; y++) { plot(px, py + y, edge); plot(px + PANEL_W - 1, py + y, edge); }')
    lines.push('')
    lines.push('    // Global logical axes: red always points +X/right; blue always points +Y/down.')
    lines.push('    if (PANEL_W >= 7) drawHorizontalArrow(px + 2, px + PANEL_W - 3, py + 2, true, CRGB::Red);')
    lines.push('    if (PANEL_H >= 7) drawVerticalArrow(px + 2, py + 2, py + PANEL_H - 3, CRGB::Blue);')
    lines.push('')
    lines.push('    // Four invariant corner blocks make every 90/180/270-degree error obvious.')
    lines.push('    CRGB topLeft = (chainOrdinal == 0 && blink) ? CRGB::Cyan : CRGB::White;')
    lines.push('    CRGB bottomRight = (chainOrdinal == PANEL_TILES_X * PANEL_TILES_Y - 1 && blink) ? CRGB::Magenta : CRGB::Green;')
    lines.push('    plot(px, py, topLeft); plot(px + 1, py, topLeft); plot(px, py + 1, topLeft);')
    lines.push('    plot(px + PANEL_W - 1, py, CRGB::Red); plot(px + PANEL_W - 2, py, CRGB::Red); plot(px + PANEL_W - 1, py + 1, CRGB::Red);')
    lines.push('    plot(px, py + PANEL_H - 1, CRGB::Blue); plot(px + 1, py + PANEL_H - 1, CRGB::Blue); plot(px, py + PANEL_H - 2, CRGB::Blue);')
    lines.push('    plot(px + PANEL_W - 1, py + PANEL_H - 1, bottomRight); plot(px + PANEL_W - 2, py + PANEL_H - 1, bottomRight); plot(px + PANEL_W - 1, py + PANEL_H - 2, bottomRight);')
    lines.push('')
    lines.push('    // Yellow is physical chain direction; alternating rows expose serpentine folds.')
    lines.push('    if (PANEL_W >= 9) drawHorizontalArrow(px + 3, px + PANEL_W - 4, py + PANEL_H / 2, chainRight, CRGB::Yellow);')
    lines.push('')
    lines.push('    if (PANEL_W >= 13 && PANEL_H >= 13) {')
    lines.push('      drawGlyph3x5(px + 5, py + 4, GLYPH_X, CRGB::Red); drawNumber(px + 9, py + 4, tx, CRGB::White);')
    lines.push('      drawGlyph3x5(px + 5, py + 10, GLYPH_Y, CRGB::Blue); drawNumber(px + 9, py + 10, ty, CRGB::White);')
    lines.push('    }')
    lines.push('    if (PANEL_W >= 16 && PANEL_H >= 26) {')
    lines.push('      int chainLabelY = py + PANEL_H / 2 + 2;')
    lines.push('      drawGlyph3x5(px + 5, chainLabelY, GLYPH_P, CRGB::Yellow); drawNumber(px + 9, chainLabelY, chainOrdinal, CRGB::White);')
    lines.push('    }')
    lines.push('    if (PANEL_W >= 20 && PANEL_H >= 20) {')
    lines.push('      int rotation = pgm_read_word(&PANEL_ROTATIONS[panelIndex]);')
    lines.push('      drawGlyph3x5(px + 5, py + PANEL_H - 7, GLYPH_R, CRGB::Orange); drawNumber(px + 9, py + PANEL_H - 7, rotation, CRGB::White);')
    lines.push('    }')
    lines.push('  }')
    lines.push('}')
    lines.push('')
  }
  lines.push('void drawLogicalChase(uint32_t now) {')
  lines.push('  fill_solid(leds, NUM_LEDS, CRGB::Black);')
  lines.push('  int logical = (int)((now / DIAG_CHASE_MS) % NUM_LEDS);')
  lines.push('  int x = logical % WIDTH;')
  lines.push('  int y = logical / WIDTH;')
  lines.push('  plot(x, y, CHSV((uint8_t)(logical * 11), 255, 255));')
  lines.push('  drawNumber(0, 0, logical, CRGB::White);')
  lines.push('}')
  lines.push('')
  lines.push('void drawPhysicalChase(uint32_t now) {')
  lines.push('  fill_solid(leds, NUM_LEDS, CRGB::Black);')
  lines.push('  int physical = (int)((now / DIAG_CHASE_MS) % NUM_LEDS);')
  lines.push('  leds[physical] = CHSV((uint8_t)(physical * 13), 255, 255);')
  lines.push('  if (NUM_LEDS > 1) leds[(physical + NUM_LEDS - 1) % NUM_LEDS] = CHSV((uint8_t)(physical * 13), 255, 72);')
  lines.push('  drawNumber(0, 0, physical, CRGB::White);')
  lines.push('}')
  lines.push('')
  lines.push('void setup() {')
  if (isHub75) lines.push(...hub75SetupCpp(hub75Hw!))
  else lines.push(...fastledSetupCpp(hw))
  // HUB75 has no FastLED CLEDController registered, so setMaxPowerInVoltsAndMilliamps
  // would have nothing to throttle — mirrors cppGenerator.ts's same gate.
  if (powerLimit && !isHub75) lines.push(`  FastLED.setMaxPowerInVoltsAndMilliamps(${volts}, ${milliamps});`)
  lines.push('}')
  lines.push('')
  lines.push('void loop() {')
  lines.push('  uint32_t now = millis();')
  lines.push('  bool blink = ((now / 240) & 1) == 0;')
  if (topologyOnly) {
    lines.push('  drawHub75PanelTopology(blink);')
  } else {
    lines.push(`  uint8_t mode = (uint8_t)((now / DIAG_MODE_MS) % ${hub75TopologyAvailable ? 9 : 8});`)
    lines.push('  switch (mode) {')
    lines.push('    case 0: fill_solid(leds, NUM_LEDS, CRGB::Red); break;')
    lines.push('    case 1: fill_solid(leds, NUM_LEDS, CRGB::Green); break;')
    lines.push('    case 2: fill_solid(leds, NUM_LEDS, CRGB::Blue); break;')
    lines.push('    case 3: drawBrightnessBars(); break;')
    lines.push('    case 4: drawOrientationMap(blink); break;')
    lines.push('    case 5: drawPanelDiagnostic(); break;')
    if (hub75TopologyAvailable) {
      lines.push('    case 6: drawHub75PanelTopology(blink); break;')
      lines.push('    case 7: drawLogicalChase(now); break;')
    } else {
      lines.push('    case 6: drawLogicalChase(now); break;')
    }
    lines.push('    default: drawPhysicalChase(now); break;')
    lines.push('  }')
  }
  if (isHub75) {
    lines.push(...hub75BlitRowsCpp(hub75Hw!, 'leds[(uint16_t)_y * WIDTH + _x]'))
  } else {
    lines.push('  FastLED.show();')
  }
  lines.push('  FastLED.delay(16);')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}
