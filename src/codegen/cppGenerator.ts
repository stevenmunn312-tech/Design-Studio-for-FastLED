import type { StudioNode, StudioEdge } from '../state/graphStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

/** Topological sort: dependencies before dependents */
function topoSort(nodes: StudioNode[], edges: StudioEdge[]): StudioNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const parents = new Map<string, string[]>()
  for (const n of nodes) parents.set(n.id, [])
  for (const e of edges) {
    if (e.source && e.target) parents.get(e.target)?.push(e.source)
  }

  const visited = new Set<string>()
  const result: StudioNode[] = []

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    for (const p of parents.get(id) ?? []) visit(p)
    const n = nodeMap.get(id)
    if (n) result.push(n)
  }

  for (const n of nodes) visit(n.id)
  return result
}

// ── Code generator ────────────────────────────────────────────────────────────

export function generateCpp(nodes: StudioNode[], edges: StudioEdge[]): string {
  if (nodes.length === 0) return '// No nodes in graph\n'

  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const e of edges) {
    if (e.source && e.target && e.sourceHandle && e.targetHandle)
      incoming.set(`${e.target}:${e.targetHandle}`, { srcId: e.source, srcPort: e.sourceHandle })
  }

  const outputNode = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const props = (n: StudioNode) => n.data.properties as Record<string, unknown>

  const width      = Number(outputNode ? props(outputNode).width      ?? 16  : 16)
  const height     = Number(outputNode ? props(outputNode).height     ?? 16  : 16)
  const dataPin    = Number(outputNode ? props(outputNode).dataPin    ?? 5   : 5)
  const chipset    = String(outputNode ? props(outputNode).chipset    ?? 'WS2812B' : 'WS2812B')
  const colorOrder = String(outputNode ? props(outputNode).colorOrder ?? 'GRB' : 'GRB')

  const sorted = topoSort(nodes, edges)

  // Resolve a float input to a C++ expression
  function floatExpr(nodeId: string, portId: string, nodeProps: Record<string, unknown>, propKey: string, def: number): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${up.srcPort}`
    const pv = nodeProps[propKey]
    return pv !== undefined ? String(Number(pv)) : String(def)
  }

  function boolExpr(nodeId: string, portId: string): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${up.srcPort}`
    return 'false'
  }

  function colorExpr(nodeId: string, portId: string): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) return `n_${safeId(up.srcId)}_${up.srcPort}`
    return 'CRGB::Black'
  }

  const loopLines: string[] = []
  const needsMapFloat: boolean[] = [false]
  const needsT = { v: false }

  function emit(node: StudioNode): void {
    const id = safeId(node.id)
    const p = props(node)
    const type = node.data.nodeType as string

    const ln = (s: string) => loopLines.push(s)
    const v = (port: string) => `n_${id}_${port}`
    const f = (port: string, pk: string, def: number) => floatExpr(node.id, port, p, pk, def)

    switch (type) {
      case 'TimeNode':
        needsT.v = true
        ln(`  float ${v('time')} = t;`)
        ln(`  float ${v('dt')} = 0.016f;`)
        break

      case 'MathAdd':
        ln(`  float ${v('result')} = (${f('a', 'a', 0)}) + (${f('b', 'b', 0)});`)
        break

      case 'Multiply':
        ln(`  float ${v('result')} = (${f('a', 'a', 1)}) * (${f('b', 'b', 1)});`)
        break

      case 'Lerp':
        ln(`  float ${v('result')} = (${f('a', 'a', 0)}) + ((${f('b', 'b', 1)}) - (${f('a', 'a', 0)})) * (${f('t', 't', 0.5)});`)
        break

      case 'Clamp':
        ln(`  float ${v('result')} = constrain(${f('value', 'value', 0)}, ${f('min', 'min', 0)}, ${f('max', 'max', 1)});`)
        break

      case 'MapRange':
        needsMapFloat[0] = true
        ln(`  float ${v('result')} = mapFloat(${f('value', 'value', 0)}, ${f('inMin', 'inMin', 0)}, ${f('inMax', 'inMax', 1)}, ${Number(p.outMin ?? 0)}, ${Number(p.outMax ?? 1)});`)
        break

      case 'Sin':
        ln(`  float ${v('result')} = sin((${f('x', 'x', 0)}) * TWO_PI);`)
        break

      case 'Cos':
        ln(`  float ${v('result')} = cos((${f('x', 'x', 0)}) * TWO_PI);`)
        break

      case 'HSVToRGB':
        ln(`  CRGB ${v('color')} = CHSV((uint8_t)((${f('h', 'h', 0)}) / 360.0f * 255), (uint8_t)((${f('s', 's', 1)}) * 255), (uint8_t)((${f('v', 'v', 1)}) * 255));`)
        break

      case 'BlendColors': {
        const ca = colorExpr(node.id, 'a')
        const cb = colorExpr(node.id, 'b')
        const mix = f('t', 't', 0.5)
        ln(`  CRGB ${v('color')} = blend(${ca}, ${cb}, (uint8_t)((${mix}) * 255));`)
        break
      }

      case 'FFTAnalyzer':
        ln(`  // FFTAnalyzer — wire to an audio library in your sketch`)
        ln(`  float ${v('bass')} = 0.5f;  // replace with real FFT data`)
        ln(`  float ${v('mids')} = 0.5f;`)
        ln(`  float ${v('treble')} = 0.5f;`)
        break

      case 'BeatDetect':
        ln(`  // BeatDetect — wire to your beat detection logic`)
        ln(`  bool ${v('beat')} = false;`)
        ln(`  float ${v('bpm')} = 120.0f;`)
        break

      case 'MicInput':
        ln(`  // MicInput — connect your audio source here`)
        break

      case 'ButtonInput':
        ln(`  bool ${v('pressed')} = digitalRead(${Number(p.pin ?? 0)}) == LOW;`)
        break

      case 'PotInput':
        ln(`  float ${v('value')} = analogRead(${Number(p.pin ?? 34)}) / 4095.0f;`)
        break

      case 'SolidColor': {
        const r = Number(p.r ?? 255), g = Number(p.g ?? 0), b = Number(p.b ?? 128)
        ln(`  fill_solid(leds, NUM_LEDS, CRGB(${r}, ${g}, ${b}));`)
        break
      }

      case 'NoiseField': {
        needsT.v = true
        const speed = f('speed', 'speed', 1)
        const scale = f('scale', 'scale', 1)
        ln(`  {`)
        ln(`    float _spd = ${speed}, _scl = ${scale};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _v = (sin(_x * _scl * 0.5f + t * _spd) + cos(_y * _scl * 0.5f + t * _spd * 0.7f)) / 2.0f;`)
        ln(`      leds[_y * WIDTH + _x] = CHSV((uint8_t)((_v + 1) * 90 + t * 30), 255, 220);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Plasma': {
        needsT.v = true
        const speed = f('speed', 'speed', 1)
        ln(`  {`)
        ln(`    float _spd = ${speed};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _v = sin(_x / 3.0f + t * _spd) + sin(_y / 3.0f + t * _spd * 0.8f)`)
        ln(`              + sin((_x + _y) / 5.0f + t * _spd * 0.6f)`)
        ln(`              + sin(sqrt((_x - WIDTH/2.0f)*(_x - WIDTH/2.0f) + (_y - HEIGHT/2.0f)*(_y - HEIGHT/2.0f)) / 3.0f + t * _spd * 0.5f);`)
        ln(`      leds[_y * WIDTH + _x] = CHSV((uint8_t)(_v * 45 + t * 20), 255, 230);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Fire': {
        ln(`  // Fire pattern — static heat array`)
        ln(`  {`)
        ln(`    static uint8_t heat[HEIGHT][WIDTH];`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      heat[_y][_x] = qsub8(heat[_y][_x], random8(0, 55));`)
        ln(`    for (int _y = 0; _y < HEIGHT - 1; _y++) for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      heat[_y][_x] = (heat[_y][_x] + heat[_y+1][max(0,_x-1)] + heat[_y+1][_x] + heat[_y+1][min(WIDTH-1,_x+1)]) / 4;`)
        ln(`    for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      if (random8() < 120) heat[HEIGHT-1][_x] = random8(200, 255);`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      uint8_t h = heat[_y][_x];`)
        ln(`      leds[_y * WIDTH + _x] = h < 85 ? CRGB(h * 3, 0, 0) : h < 170 ? CRGB(255, (h-85)*3, 0) : CRGB(255, 255, (h-170)*3);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'SpectrumBars':
        ln(`  // SpectrumBars — wire bass/mids/treble from your audio source`)
        ln(`  fill_solid(leds, NUM_LEDS, CRGB::Black);`)
        break

      case 'BassPulse': {
        const r = Number(p.r ?? 255), g = Number(p.g ?? 0), b = Number(p.b ?? 80)
        const bass = f('bass', 'bass', 0.5)
        ln(`  { float _b = ${bass}; fill_solid(leds, NUM_LEDS, CRGB((uint8_t)(${r} * _b), (uint8_t)(${g} * _b), (uint8_t)(${b} * _b))); }`)
        break
      }

      case 'MidrangeWaves': {
        needsT.v = true
        const mids = f('mids', 'mids', 0.5)
        const speed = f('speed', 'speed', 1)
        ln(`  {`)
        ln(`    float _m = ${mids}, _spd = ${speed};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _w = sin(_x * 0.8f + t * _spd * 4) * sin(_y * 0.5f + t * _spd * 2.5f);`)
        ln(`      float _v = (_w + 1) / 2.0f * (0.3f + _m * 0.7f);`)
        ln(`      leds[_y * WIDTH + _x] = CHSV((uint8_t)(200 + _w * 40), 255, (uint8_t)(_v * 255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'TrebleSparks': {
        const treble = f('treble', 'treble', 0.5)
        const density = f('density', 'density', 0.5)
        ln(`  {`)
        ln(`    float _t = ${treble}, _d = ${density};`)
        ln(`    float _thresh = (1.0f - _d * _t) * 255;`)
        ln(`    for (int _i = 0; _i < NUM_LEDS; _i++)`)
        ln(`      if (random8() > _thresh) leds[_i] = CHSV(random8(180, 240), random8(150, 255), random8() * _t);`)
        ln(`      else leds[_i] = CRGB::Black;`)
        ln(`  }`)
        break
      }

      case 'BeatFlash': {
        const beat = boolExpr(node.id, 'beat')
        const decay = f('decay', 'decay', 0.85)
        ln(`  {`)
        ln(`    static float _flash = 0;`)
        ln(`    if (${beat}) _flash = 1.0f; else _flash *= ${decay};`)
        ln(`    for (int _i = 0; _i < NUM_LEDS; _i++) {`)
        ln(`      leds[_i].r = qadd8(leds[_i].r, (uint8_t)((255 - leds[_i].r) * _flash));`)
        ln(`      leds[_i].g = qadd8(leds[_i].g, (uint8_t)((255 - leds[_i].g) * _flash));`)
        ln(`      leds[_i].b = qadd8(leds[_i].b, (uint8_t)((255 - leds[_i].b) * _flash));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'BrightnessMod': {
        const br = f('brightness', 'brightness', 1)
        ln(`  { uint8_t _br = (uint8_t)(constrain(${br}, 0, 1) * 255); for (int _i = 0; _i < NUM_LEDS; _i++) leds[_i].nscale8(_br); }`)
        break
      }

      case 'HueShift': {
        const shift = f('shift', 'shift', 0)
        ln(`  { uint8_t _sh = (uint8_t)((${shift}) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) leds[_i] = CHSV(rgb2hsv_approximate(leds[_i]).hue + _sh, rgb2hsv_approximate(leds[_i]).sat, rgb2hsv_approximate(leds[_i]).val); }`)
        break
      }

      case 'BlendFrames': {
        const mix = f('t', 't', 0.5)
        ln(`  { uint8_t _mix = (uint8_t)((${mix}) * 255); /* BlendFrames: blend source A into current leds */ }`)
        break
      }

      case 'MatrixOutput':
        ln(`  FastLED.show();`)
        break

      default:
        ln(`  // ${type} — not yet supported in code gen`)
    }
  }

  const lines: string[] = []

  // Header
  lines.push(`#include <FastLED.h>`)
  lines.push(``)
  lines.push(`#define WIDTH    ${width}`)
  lines.push(`#define HEIGHT   ${height}`)
  lines.push(`#define NUM_LEDS (WIDTH * HEIGHT)`)
  lines.push(`#define DATA_PIN ${dataPin}`)
  lines.push(``)
  lines.push(`CRGB leds[NUM_LEDS];`)
  lines.push(``)

  if (needsMapFloat[0]) {
    lines.push(`float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {`)
    lines.push(`  if (inMax == inMin) return outMin;`)
    lines.push(`  return outMin + (x - inMin) * (outMax - outMin) / (inMax - inMin);`)
    lines.push(`}`)
    lines.push(``)
  }

  lines.push(`void setup() {`)
  lines.push(`  FastLED.addLeds<${chipset}, DATA_PIN, ${colorOrder}>(leds, NUM_LEDS);`)
  lines.push(`  FastLED.setBrightness(200);`)
  lines.push(`}`)
  lines.push(``)

  // Emit all node snippets (collect first to detect needsMapFloat, needsT)
  for (const node of sorted) emit(node)

  // needsT might have been set during emit — re-check
  lines.push(`void loop() {`)
  if (needsT.v) lines.push(`  float t = millis() / 1000.0f;`)
  lines.push(...loopLines)
  if (!sorted.some((n) => n.data.nodeType === 'MatrixOutput')) {
    lines.push(`  FastLED.show();`)
  }
  lines.push(`  FastLED.delay(16);  // ~60 fps`)
  lines.push(`}`)

  return lines.join('\n')
}
