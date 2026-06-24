import type { StudioNode, StudioEdge } from '../state/graphStore'
import type { GroupRegistry } from '../state/graphEvaluator'
import { asFont, textColumns } from '../state/font'
import { asImage } from '../state/image'
import { polineStops16, hexToRgb } from '../state/polinePalette'

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
}

/**
 * Expand every `Group` node into the graph in place: the group's subgraph nodes
 * are inlined (their ids prefixed with the group-instance path so repeated or
 * nested groups stay unique), the `GroupOutput` terminal is dropped, and the
 * group's external consumers are rewired to whatever fed that terminal. The
 * result is a flat graph the rest of the generator already understands.
 *
 * Edges into a Group are dropped (groups expose no inputs yet — ADR Phase 3),
 * and unknown or self-referential groups are skipped.
 */
function flattenGroups(
  nodes: StudioNode[],
  edges: StudioEdge[],
  groups: GroupRegistry,
  prefix = '',
  groupStack: ReadonlySet<string> = new Set(),
): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const pid = (id: string) => prefix + id
  const nodeType = (n: StudioNode) => (n.data as { nodeType?: string }).nodeType
  const outNodes: StudioNode[] = []
  const outEdges: StudioEdge[] = []
  // Prefixed Group-node id → the flattened source that fed its GroupOutput.
  const terminalFor = new Map<string, { id: string; port: string }>()
  // Prefixed Group-node id → (paramId → internal consumers of that GroupInput).
  const paramConsumers = new Map<string, Map<string, { id: string; port: string }[]>>()

  for (const n of nodes) {
    if (nodeType(n) === 'Group') {
      const groupId = (n.data.properties as { groupId?: string })?.groupId
      if (!groupId || !groups[groupId] || groupStack.has(groupId)) continue
      const sub = groups[groupId]
      const flat = flattenGroups(sub.nodes, sub.edges, groups, `${pid(n.id)}__`, new Set([...groupStack, groupId]))

      const out = flat.nodes.find((x) => nodeType(x) === 'GroupOutput')
      if (out) {
        const fed = flat.edges.find((e) => e.target === out.id && e.targetHandle === 'frame')
        if (fed?.source && fed.sourceHandle) terminalFor.set(pid(n.id), { id: fed.source, port: fed.sourceHandle })
      }

      // Record each GroupInput's downstream consumers so the boundary edge that
      // feeds this group's param can be wired straight to them.
      const giNodes = flat.nodes.filter((x) => nodeType(x) === 'GroupInput')
      const giIds = new Set(giNodes.map((x) => x.id))
      const consumers = new Map<string, { id: string; port: string }[]>()
      for (const gi of giNodes) {
        const paramId = (gi.data.properties as { paramId?: string })?.paramId ?? ''
        consumers.set(paramId, flat.edges
          .filter((e) => e.source === gi.id && e.target && e.targetHandle)
          .map((e) => ({ id: e.target!, port: e.targetHandle! })))
      }
      paramConsumers.set(pid(n.id), consumers)

      for (const x of flat.nodes) if (nodeType(x) !== 'GroupOutput' && nodeType(x) !== 'GroupInput') outNodes.push(x)
      for (const e of flat.edges) if (!(out && e.target === out.id) && !giIds.has(e.source!)) outEdges.push(e)
    } else {
      outNodes.push({ ...n, id: pid(n.id) })
    }
  }

  const isGroup = (id?: string | null) =>
    nodes.some((n) => n.id === id && nodeType(n) === 'Group')

  for (const e of edges) {
    if (!e.source || !e.target) continue
    // Resolve the source through a group's GroupOutput terminal if needed.
    const term = terminalFor.get(pid(e.source))
    const srcId = term ? term.id : pid(e.source)
    const srcPort = term ? term.port : e.sourceHandle

    if (isGroup(e.target)) {
      // Boundary edge into a group param → wire the source to each consumer of
      // the matching GroupInput inside the (now-inlined) subgraph.
      const cons = paramConsumers.get(pid(e.target))?.get(e.targetHandle ?? '') ?? []
      for (const c of cons) {
        outEdges.push({
          id: pid(`${e.id ?? `${e.source}-${e.target}`}-${c.id}`),
          source: srcId, sourceHandle: srcPort, target: c.id, targetHandle: c.port,
        } as StudioEdge)
      }
      continue
    }

    outEdges.push({
      ...e,
      id: pid(e.id ?? `${e.source}-${e.target}`),
      source: srcId,
      sourceHandle: srcPort,
      target: pid(e.target),
      targetHandle: e.targetHandle,
    } as StudioEdge)
  }

  return { nodes: outNodes, edges: outEdges }
}

// Maps the studio palette names (see samplePalette in graphEvaluator) to the
// matching FastLED preset palette constants.
const PALETTE_CPP: Record<string, string> = {
  rainbow: 'RainbowColors_p',
  heat:    'HeatColors_p',
  ocean:   'OceanColors_p',
  lava:    'LavaColors_p',
  forest:  'ForestColors_p',
  party:   'PartyColors_p',
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

export function generateCpp(nodes: StudioNode[], edges: StudioEdge[], groups: GroupRegistry = {}): string {
  if (nodes.length === 0) return '// No nodes in graph\n'

  // Inline any Group nodes so the rest of the generator works on a flat graph.
  const flat = flattenGroups(nodes, edges, groups)
  nodes = flat.nodes
  edges = flat.edges

  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const e of edges) {
    if (e.source && e.target && e.sourceHandle && e.targetHandle)
      incoming.set(`${e.target}:${e.targetHandle}`, { srcId: e.source, srcPort: e.sourceHandle })
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  const outputNode = nodes.find((n) => n.data.nodeType === 'MatrixOutput')
  const props = (n: StudioNode) => n.data.properties as Record<string, unknown>

  const width      = Number(outputNode ? props(outputNode).width      ?? 16  : 16)
  const height     = Number(outputNode ? props(outputNode).height     ?? 16  : 16)
  const dataPin    = Number(outputNode ? props(outputNode).dataPin    ?? 5   : 5)
  const chipset    = String(outputNode ? props(outputNode).chipset    ?? 'WS2812B' : 'WS2812B')
  const colorOrder = String(outputNode ? props(outputNode).colorOrder ?? 'GRB' : 'GRB')
  // Serpentine (zig-zag) matrices wire alternate rows in reverse; buffers stay
  // row-major and MatrixOutput remaps grid → physical index via XY().
  const serpentine = (outputNode ? props(outputNode).serpentine : false) === true

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

  // Resolve a palette name to its FastLED preset palette constant.
  function fastledPalette(name: string): string {
    return PALETTE_CPP[name.toLowerCase()] ?? 'RainbowColors_p'
  }

  // Resolve the FastLED palette constant for a palette-consuming port: follow a
  // connected PaletteSelector/PaletteBlend back to its chosen palette, otherwise
  // fall back to the node's own `palette` property. (PaletteBlend resolves to its
  // base palette A; runtime blending is left as a generated comment.)
  function paletteExpr(nodeId: string, portId: string, nodeProps: Record<string, unknown>): string {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (up) {
      const src = nodeMap.get(up.srcId)
      if (src) {
        // CustomPalette and PaletteBlend build a runtime CRGBPalette16 (see
        // their emit cases); reference it by name.
        if (src.data.nodeType === 'CustomPalette' || src.data.nodeType === 'PaletteBlend' || src.data.nodeType === 'Poline') return `pal_${safeId(up.srcId)}`
        return fastledPalette(String(props(src).palette ?? 'rainbow'))
      }
    }
    return fastledPalette(String(nodeProps.palette ?? 'rainbow'))
  }

  const loopLines: string[] = []
  const needsMapFloat: boolean[] = [false]
  const needsWorley = { v: false }
  const needsKelvin = { v: false }
  const needsT = { v: false }
  // Frame-producing nodes each render into their own CRGB buffer, so multiple
  // layers can coexist and be composited. Collected here, declared as globals.
  const frameBufs = new Set<string>()

  function emit(node: StudioNode): void {
    const id = safeId(node.id)
    const p = props(node)
    const type = node.data.nodeType as string

    const ln = (s: string) => loopLines.push(s)
    const v = (port: string) => `n_${id}_${port}`
    const f = (port: string, pk: string, def: number) => floatExpr(node.id, port, p, pk, def)

    // This node's own frame buffer (registers it for global declaration).
    const fbuf = `buf_${id}`
    const ownBuf = () => { frameBufs.add(id); return fbuf }
    // The buffer of the node feeding `port`, or null if unconnected.
    const srcBuf = (port: string): string | null => {
      const up = incoming.get(`${node.id}:${port}`)
      if (!up) return null
      frameBufs.add(safeId(up.srcId))
      return `buf_${safeId(up.srcId)}`
    }
    // A statement that seeds `fbuf` from a frame input (or black if unwired).
    const seedFrom = (port: string) => {
      const s = srcBuf(port)
      return s ? `::memmove(${fbuf}, ${s}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${fbuf}, NUM_LEDS, CRGB::Black);`
    }

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

      case 'Wave': {
        needsT.v = true
        const amp = f('amplitude', 'amplitude', 1), freq = f('frequency', 'frequency', 1), phase = f('phase', 'phase', 0)
        const wf = String(p.waveform ?? 'sine')
        const arg = `((${freq}) * t + (${phase}))`
        let wave: string
        switch (wf) {
          case 'square':   wave = `((_ph < 0.5f) ? (${amp}) : -(${amp}))`; break
          case 'sawtooth': wave = `((${amp}) * (2.0f * _ph - 1.0f))`; break
          case 'triangle': wave = `((${amp}) * (4.0f * fabsf(_ph - 0.5f) - 1.0f))`; break
          default:         wave = `((${amp}) * sinf(6.2831853f * _arg))` // sine
        }
        ln(`  float ${v('result')};`)
        ln(`  { float _arg = ${arg}, _ph = fmodf(fmodf(_arg, 1.0f) + 1.0f, 1.0f); ${v('result')} = ${wave}; }`)
        break
      }

      case 'ComplexWave': {
        const a = f('a', 'a', 0), b = f('b', 'b', 0)
        const op = String(p.operation ?? 'add')
        let expr: string
        switch (op) {
          case 'multiply':   expr = `(${a}) * (${b})`; break
          case 'average':    expr = `((${a}) + (${b})) * 0.5f`; break
          case 'min':        expr = `min((float)(${a}), (float)(${b}))`; break
          case 'max':        expr = `max((float)(${a}), (float)(${b}))`; break
          case 'difference': expr = `(${a}) - (${b})`; break
          default:           expr = `(${a}) + (${b})` // add
        }
        ln(`  float ${v('result')} = ${expr};`)
        break
      }

      case 'HSVToRGB':
        ln(`  CRGB ${v('color')} = CHSV((uint8_t)((${f('h', 'h', 0)}) / 360.0f * 255), (uint8_t)((${f('s', 's', 1)}) * 255), (uint8_t)((${f('v', 'v', 1)}) * 255));`)
        break

      case 'Temperature':
        needsKelvin.v = true
        ln(`  CRGB ${v('color')} = kelvinToRGB(${f('kelvin', 'kelvin', 4000)});`)
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
        const ob = ownBuf()
        const r = Number(p.r ?? 255), g = Number(p.g ?? 0), b = Number(p.b ?? 128)
        ln(`  fill_solid(${ob}, NUM_LEDS, CRGB(${r}, ${g}, ${b}));`)
        break
      }

      case 'Span': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 128)}, ${Number(p.b ?? 255)})`
        const row   = Math.floor(Number(p.row   ?? 0))
        const start = Math.floor(Number(p.start ?? 0))
        const count = Math.floor(Number(p.count ?? width))
        const x0 = Math.max(0, start), x1 = Math.min(width, start + count)
        ln(`  ${seedFrom('base')}`)
        if (row >= 0 && row < height && x1 > x0)
          ln(`  for (int _x = ${x0}; _x < ${x1}; _x++) ${ob}[${row} * WIDTH + _x] = ${colorE};`)
        break
      }

      case 'Rect': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 128)}, ${Number(p.b ?? 255)})`
        const rx = Math.floor(Number(p.x ?? 0)), ry = Math.floor(Number(p.y ?? 0))
        const rw = Math.floor(Number(p.w ?? width)), rh = Math.floor(Number(p.h ?? height))
        const x0 = Math.max(0, rx), x1 = Math.min(width, rx + rw)
        const y0 = Math.max(0, ry), y1 = Math.min(height, ry + rh)
        ln(`  ${seedFrom('base')}`)
        if (x1 > x0 && y1 > y0)
          ln(`  for (int _y = ${y0}; _y < ${y1}; _y++) for (int _x = ${x0}; _x < ${x1}; _x++) ${ob}[_y * WIDTH + _x] = ${colorE};`)
        break
      }

      case 'Circle': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 0)}, ${Number(p.b ?? 128)})`
        const cx = Number(p.cx ?? 8), cy = Number(p.cy ?? 8), rad = Number(p.radius ?? 4)
        const test = p.filled
          ? `_d <= ${rad} + 0.5f`
          : `fabsf(_d - ${rad}) < 0.5f`
        ln(`  { ${seedFrom('base')}`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _d = sqrtf((_x - ${cx}) * (_x - ${cx}) + (_y - ${cy}) * (_y - ${cy}));`)
        ln(`      if (${test}) ${ob}[_y * WIDTH + _x] = ${colorE}; } }`)
        break
      }

      case 'Line': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 200)}, ${Number(p.b ?? 255)})`
        const x1 = Math.round(Number(p.x1 ?? 0)), y1 = Math.round(Number(p.y1 ?? 0))
        const x2 = Math.round(Number(p.x2 ?? 0)), y2 = Math.round(Number(p.y2 ?? 0))
        ln(`  { ${seedFrom('base')}`)
        ln(`    int _x0 = ${x1}, _y0 = ${y1}, _dx = abs(${x2} - _x0), _dy = -abs(${y2} - _y0);`)
        ln(`    int _sx = _x0 < ${x2} ? 1 : -1, _sy = _y0 < ${y2} ? 1 : -1, _err = _dx + _dy;`)
        ln(`    for (;;) { if (_x0 >= 0 && _x0 < WIDTH && _y0 >= 0 && _y0 < HEIGHT) ${ob}[_y0 * WIDTH + _x0] = ${colorE};`)
        ln(`      if (_x0 == ${x2} && _y0 == ${y2}) break; int _e2 = 2 * _err;`)
        ln(`      if (_e2 >= _dy) { _err += _dy; _x0 += _sx; } if (_e2 <= _dx) { _err += _dx; _y0 += _sy; } } }`)
        break
      }

      case 'Text': {
        const ob = ownBuf()
        const text = String(p.text ?? 'HELLO')
        const font = asFont(p.font)
        const cols = textColumns(text, font)
        const sx = Math.floor(Number(p.x ?? 0)), sy = Math.floor(Number(p.y ?? 0))
        const dynamic = !!incoming.get(`${node.id}:scroll`) || Number(p.scroll ?? 0) !== 0
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 255)})`
        ln(`  { // Text "${text.replace(/[^ -~]/g, '?')}"`)
        ln(`    static const uint8_t _txt_${id}[] = {${cols.join(',')}};`)
        ln(`    const int _tn_${id} = ${cols.length};`)
        ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        if (dynamic) {
          needsT.v = true
          ln(`    int _tot = _tn_${id} + WIDTH, _off = (((int)(t * (${f('scroll', 'scroll', 0)})) % _tot) + _tot) % _tot;`)
        } else {
          ln(`    int _off = 0;`)
        }
        ln(`    for (int _x = 0; _x < WIDTH; _x++) { int _ci = _x - ${sx} + _off; if (_ci < 0 || _ci >= _tn_${id}) continue; uint8_t _col = _txt_${id}[_ci];`)
        ln(`      for (int _r = 0; _r < ${font.h}; _r++) if (_col & (1 << _r)) { int _yy = ${sy} + _r; if (_yy >= 0 && _yy < HEIGHT) ${ob}[_yy * WIDTH + _x] = ${colorE}; } }`)
        ln(`  }`)
        break
      }

      case 'NoiseField': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 1)
        const scale = f('scale', 'scale', 1)
        ln(`  {`)
        ln(`    float _spd = ${speed}, _scl = ${scale};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _v = (sin(_x * _scl * 0.5f + t * _spd) + cos(_y * _scl * 0.5f + t * _spd * 0.7f)) / 2.0f;`)
        ln(`      ${ob}[_y * WIDTH + _x] = CHSV((uint8_t)((_v + 1) * 90 + t * 30), 255, 220);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Plasma': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 1)
        ln(`  {`)
        ln(`    float _spd = ${speed};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _v = sin(_x / 3.0f + t * _spd) + sin(_y / 3.0f + t * _spd * 0.8f)`)
        ln(`              + sin((_x + _y) / 5.0f + t * _spd * 0.6f)`)
        ln(`              + sin(sqrt((_x - WIDTH/2.0f)*(_x - WIDTH/2.0f) + (_y - HEIGHT/2.0f)*(_y - HEIGHT/2.0f)) / 3.0f + t * _spd * 0.5f);`)
        ln(`      ${ob}[_y * WIDTH + _x] = CHSV((uint8_t)(_v * 45 + t * 20), 255, 230);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'Fire': {
        const ob = ownBuf()
        ln(`  { // Fire pattern`)
        ln(`    static uint8_t heat_${id}[HEIGHT][WIDTH];`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      heat_${id}[_y][_x] = qsub8(heat_${id}[_y][_x], random8(0, 55));`)
        ln(`    for (int _y = 0; _y < HEIGHT - 1; _y++) for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      heat_${id}[_y][_x] = (heat_${id}[_y][_x] + heat_${id}[_y+1][max(0,_x-1)] + heat_${id}[_y+1][_x] + heat_${id}[_y+1][min(WIDTH-1,_x+1)]) / 4;`)
        ln(`    for (int _x = 0; _x < WIDTH; _x++)`)
        ln(`      if (random8() < 120) heat_${id}[HEIGHT-1][_x] = random8(200, 255);`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      uint8_t h = heat_${id}[_y][_x];`)
        ln(`      ${ob}[_y * WIDTH + _x] = h < 85 ? CRGB(h * 3, 0, 0) : h < 170 ? CRGB(255, (h-85)*3, 0) : CRGB(255, 255, (h-170)*3);`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'SpectrumBars': {
        const ob = ownBuf()
        ln(`  // SpectrumBars — wire bass/mids/treble from your audio source`)
        ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        break
      }

      case 'BassPulse': {
        const ob = ownBuf()
        const r = Number(p.r ?? 255), g = Number(p.g ?? 0), b = Number(p.b ?? 80)
        const bass = f('bass', 'bass', 0.5)
        ln(`  { float _b = ${bass}; fill_solid(${ob}, NUM_LEDS, CRGB((uint8_t)(${r} * _b), (uint8_t)(${g} * _b), (uint8_t)(${b} * _b))); }`)
        break
      }

      case 'MidrangeWaves': {
        needsT.v = true
        const ob = ownBuf()
        const mids = f('mids', 'mids', 0.5)
        const speed = f('speed', 'speed', 1)
        ln(`  {`)
        ln(`    float _m = ${mids}, _spd = ${speed};`)
        ln(`    for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {`)
        ln(`      float _w = sin(_x * 0.8f + t * _spd * 4) * sin(_y * 0.5f + t * _spd * 2.5f);`)
        ln(`      float _v = (_w + 1) / 2.0f * (0.3f + _m * 0.7f);`)
        ln(`      ${ob}[_y * WIDTH + _x] = CHSV((uint8_t)(200 + _w * 40), 255, (uint8_t)(_v * 255));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'TrebleSparks': {
        const ob = ownBuf()
        const treble = f('treble', 'treble', 0.5)
        const density = f('density', 'density', 0.5)
        ln(`  {`)
        ln(`    float _t = ${treble}, _d = ${density};`)
        ln(`    float _thresh = (1.0f - _d * _t) * 255;`)
        ln(`    for (int _i = 0; _i < NUM_LEDS; _i++)`)
        ln(`      if (random8() > _thresh) ${ob}[_i] = CHSV(random8(180, 240), random8(150, 255), random8() * _t);`)
        ln(`      else ${ob}[_i] = CRGB::Black;`)
        ln(`  }`)
        break
      }

      case 'BeatFlash': {
        const ob = ownBuf()
        const beat = boolExpr(node.id, 'beat')
        const decay = f('decay', 'decay', 0.85)
        ln(`  {`)
        ln(`    ${seedFrom('frame')}`)
        ln(`    static float _flash_${id} = 0;`)
        ln(`    if (${beat}) _flash_${id} = 1.0f; else _flash_${id} *= ${decay};`)
        ln(`    for (int _i = 0; _i < NUM_LEDS; _i++) {`)
        ln(`      ${ob}[_i].r = qadd8(${ob}[_i].r, (uint8_t)((255 - ${ob}[_i].r) * _flash_${id}));`)
        ln(`      ${ob}[_i].g = qadd8(${ob}[_i].g, (uint8_t)((255 - ${ob}[_i].g) * _flash_${id}));`)
        ln(`      ${ob}[_i].b = qadd8(${ob}[_i].b, (uint8_t)((255 - ${ob}[_i].b) * _flash_${id}));`)
        ln(`    }`)
        ln(`  }`)
        break
      }

      case 'BrightnessMod': {
        const ob = ownBuf()
        const br = f('brightness', 'brightness', 1)
        ln(`  { ${seedFrom('frame')} uint8_t _br = (uint8_t)(constrain(${br}, 0, 1) * 255); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i].nscale8(_br); }`)
        break
      }

      case 'Mask': {
        const ob = ownBuf()
        const mask = srcBuf('mask')
        ln(`  { ${seedFrom('frame')}`)
        if (mask) ln(`    for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i].nscale8((${mask}[_i].r + ${mask}[_i].g + ${mask}[_i].b) / 3);`)
        ln(`  }`)
        break
      }

      case 'HueShift': {
        const ob = ownBuf()
        const shift = f('shift', 'shift', 0)
        ln(`  { ${seedFrom('frame')} uint8_t _sh = (uint8_t)((${shift}) / 360.0f * 255); for (int _i = 0; _i < NUM_LEDS; _i++) ${ob}[_i] = CHSV(rgb2hsv_approximate(${ob}[_i]).hue + _sh, rgb2hsv_approximate(${ob}[_i]).sat, rgb2hsv_approximate(${ob}[_i]).val); }`)
        break
      }

      case 'Transform': {
        needsT.v = true
        const ob = ownBuf()
        const src = srcBuf('frame')
        if (!src) { ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Transform: no input`); break }
        const mode = String(p.transform ?? 'rotate')
        const rate = f('rate', 'rate', 90)
        const angle = Number(p.angle ?? 0)
        ln(`  { float _cx=(WIDTH-1)/2.0f,_cy=(HEIGHT-1)/2.0f,_rate=${rate};`)
        if (mode === 'translate') {
          ln(`    float _a=${angle}*0.01745329f,_dx=cos(_a)*_rate*t,_dy=sin(_a)*_rate*t;`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`      int _sx=(((int)floorf(_x-_dx+0.5f))%WIDTH+WIDTH)%WIDTH, _sy=(((int)floorf(_y-_dy+0.5f))%HEIGHT+HEIGHT)%HEIGHT;`)
          ln(`      ${ob}[_y*WIDTH+_x]=${src}[_sy*WIDTH+_sx];}}`)
        } else if (mode === 'scale') {
          ln(`    float _s=1.0f+(_rate/100.0f)*t; _s=constrain(_s,0.05f,20.0f);`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`      int _sx=(int)floorf(_cx+(_x-_cx)/_s+0.5f), _sy=(int)floorf(_cy+(_y-_cy)/_s+0.5f);`)
          ln(`      ${ob}[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${src}[_sy*WIDTH+_sx]:CRGB::Black;}}`)
        } else {
          ln(`    float _a=_rate*t*0.01745329f,_co=cos(_a),_si=sin(_a);`)
          ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
          ln(`      float _rx=_x-_cx,_ry=_y-_cy; int _sx=(int)floorf(_cx+_rx*_co+_ry*_si+0.5f), _sy=(int)floorf(_cy-_rx*_si+_ry*_co+0.5f);`)
          ln(`      ${ob}[_y*WIDTH+_x]=(_sx>=0&&_sx<WIDTH&&_sy>=0&&_sy<HEIGHT)?${src}[_sy*WIDTH+_sx]:CRGB::Black;}}`)
        }
        break
      }

      case 'BlendFrames': {
        const ob = ownBuf()
        const a = srcBuf('a'), b = srcBuf('b'), mix = f('t', 't', 0.5)
        ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
        ln(`    nblend(${ob}, ${b ?? ob}, NUM_LEDS, (uint8_t)((${mix}) * 255)); }`)
        break
      }

      case 'Noise2D': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 0.4), scale = f('scale', 'scale', 0.4)
        ln(`  { float _spd=${speed},_sc=${scale}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _v=sin(_x*_sc+t*_spd+1.7f)*cos(_y*_sc*1.3f+t*_spd*0.8f+2.3f)+0.5f*sin(_x*_sc*2.1f+t*_spd*2.0f)*cos(_y*_sc*2.7f+t*_spd*1.6f);`)
        ln(`    ${ob}[_y*WIDTH+_x]=CHSV((uint8_t)((_v*0.5f+0.5f)*255),255,220);}}`)
        break
      }

      case 'RadialBurst': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 1)
        const r = Number(p.r ?? 0), g = Number(p.g ?? 200), b = Number(p.b ?? 255)
        ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _w=(sin((_d*8-t*_spd*3)*3.14159f)+1)/2.0f;`)
        ln(`    ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)(${r}*_w),(uint8_t)(${g}*_w),(uint8_t)(${b}*_w));}}`)
        break
      }

      case 'Spiral': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 1), arms = Number(p.arms ?? 2)
        ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _a=atan2(_y-HEIGHT/2.0f,_x-WIDTH/2.0f);float _s=(_a+_d*12.57f-t*_spd*3.14159f)*${arms};`)
        ln(`    ${ob}[_y*WIDTH+_x]=CHSV((uint8_t)(_d*255+t*30),255,(uint8_t)((sin(_s)+1)/2.0f*230));}}`)
        break
      }

      case 'Kaleidoscope': {
        const ob = ownBuf()
        ln(`  ${seedFrom('frame')}  // Kaleidoscope: mirror logic to apply on ${ob}`)
        break
      }

      case 'Particles': {
        const ob = ownBuf()
        ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black);  // Particles: stateful — see FastLED particle examples`)
        break
      }

      case 'Invert': {
        const ob = ownBuf()
        ln(`  ${seedFrom('frame')} for(int _i=0;_i<NUM_LEDS;_i++){${ob}[_i].r=255-${ob}[_i].r;${ob}[_i].g=255-${ob}[_i].g;${ob}[_i].b=255-${ob}[_i].b;}`)
        break
      }

      case 'GradientFrame': {
        const ob = ownBuf()
        const rA = Number(p.rA ?? 0), gA = Number(p.gA ?? 200), bA = Number(p.bA ?? 255)
        const rB = Number(p.rB ?? 255), gB = Number(p.gB ?? 0), bB = Number(p.bB ?? 255)
        const vert = Boolean(p.vertical)
        ln(`  { for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _t=${vert ? '_y/(HEIGHT-1.0f)' : '_x/(WIDTH-1.0f)'};`)
        ln(`    ${ob}[_y*WIDTH+_x]=CRGB((uint8_t)(${rA}*(1-_t)+${rB}*_t),(uint8_t)(${gA}*(1-_t)+${gB}*_t),(uint8_t)(${bA}*(1-_t)+${bB}*_t));}}`)
        break
      }

      case 'GradientSampler': {
        const tt = f('t', 't', 0)
        const rA = Number(p.rA ?? 0), gA = Number(p.gA ?? 200), bA = Number(p.bA ?? 255)
        const rB = Number(p.rB ?? 255), gB = Number(p.gB ?? 0), bB = Number(p.bB ?? 255)
        ln(`  CRGB ${v('color')} = CRGB((uint8_t)(${rA}*(1-(${tt}))+${rB}*(${tt})),(uint8_t)(${gA}*(1-(${tt}))+${gB}*(${tt})),(uint8_t)(${bA}*(1-(${tt}))+${bB}*(${tt})));`)
        break
      }

      case 'PaletteSampler': {
        const tt = f('t', 't', 0), pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  CRGB ${v('color')} = ColorFromPalette(${pal}, (uint8_t)((${tt})*255));`)
        break
      }

      case 'Abs':
        ln(`  float ${v('result')} = fabs(${f('x', 'x', 0)});`)
        break

      case 'Mod': {
        const mx = f('x', 'x', 0), mm = f('m', 'm', 1)
        ln(`  float ${v('result')} = fmod(fmod(${mx}, ${mm}) + (${mm}), ${mm});`)
        break
      }

      case 'MinNode':
        ln(`  float ${v('result')} = min(${f('a', 'a', 0)}, ${f('b', 'b', 0)});`)
        break

      case 'MaxNode':
        ln(`  float ${v('result')} = max(${f('a', 'a', 0)}, ${f('b', 'b', 0)});`)
        break

      case 'Random': {
        const lo = Number(p.min ?? 0), hi = Number(p.max ?? 1)
        ln(`  float ${v('value')} = ${lo} + random8() / 255.0f * ${hi - lo};`)
        break
      }

      case 'Counter': {
        const speed = f('speed', 'speed', 0.5)
        ln(`  static float ${v('value')} = 0;`)
        ln(`  ${v('value')} = fmod(${v('value')} + (${speed}) / 60.0f, 1.0f);`)
        break
      }

      case 'Gate': {
        const val = f('value', 'value', 0), gate = boolExpr(node.id, 'gate')
        ln(`  float ${v('result')} = (${gate}) ? (${val}) : ${Number(p.fallback ?? 0)};`)
        break
      }

      case 'Not': {
        const x = boolExpr(node.id, 'x')
        ln(`  bool ${v('result')} = !(${x});`)
        break
      }

      case 'Compare': {
        const a = f('a', 'a', 0), b2 = f('b', 'b', 0.5)
        ln(`  bool ${v('result')} = (${a}) > (${b2});`)
        break
      }

      case 'Crossfade': {
        const ob = ownBuf()
        const a = srcBuf('a'), b = srcBuf('b'), mix = f('t', 't', 0.5)
        ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
        ln(`    nblend(${ob}, ${b ?? ob}, NUM_LEDS, (uint8_t)((${mix}) * 255)); }`)
        break
      }

      case 'Wipe': {
        const ob = ownBuf()
        const a = srcBuf('a'), b = srcBuf('b'), tt = f('t', 't', 0.5)
        const dir = String(p.direction ?? 'right')
        const axis = (dir === 'up' || dir === 'down') ? '_y' : '_x'
        const dim  = (dir === 'up' || dir === 'down') ? 'HEIGHT' : 'WIDTH'
        const cmp  = (dir === 'right' || dir === 'down') ? '<' : '>'
        const rhs  = (dir === 'right' || dir === 'down') ? `(int)((${tt})*${dim})` : `(int)((1.0f-(${tt}))*${dim})`
        ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`      if(${axis} ${cmp} ${rhs}) ${ob}[_y*WIDTH+_x] = ${b ?? ob}[_y*WIDTH+_x]; }`)
        break
      }

      case 'Dissolve': {
        const ob = ownBuf()
        const a = srcBuf('a'), b = srcBuf('b'), tt = f('t', 't', 0.5)
        ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
        ln(`    float _tt=${tt}; for(int _i=0;_i<NUM_LEDS;_i++){`)
        ln(`      uint32_t _h=((uint32_t)(_i)*1664525u+1013904223u);`)
        ln(`      if((_h&0xFFFF)<(uint32_t)(_tt*65535)) ${ob}[_i] = ${b ?? ob}[_i]; }}`)
        break
      }

      case 'Simplex2D': {
        needsT.v = true
        const speed = f('speed', 'speed', 0.4), scale = f('scale', 'scale', 0.3)
        const ob = ownBuf()
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Simplex2D`)
        ln(`    float _spd=${speed},_sc=${scale};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _n=sin(_x*_sc+sin(_y*_sc*0.8f+t*_spd*0.5f)+t*_spd)`)
        ln(`            +0.5f*sin(_x*_sc*2+t*_spd*1.9f)+0.25f*sin(_x*_sc*4+t*_spd*4.1f);`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_n*0.25f+0.5f)*255));}}`)
        break
      }

      case 'Noise3D': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 0.5), scale = f('scale', 'scale', 0.3)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Noise3D`)
        ln(`    float _spd=${speed},_sc=${scale};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _n=(sin(_x*_sc+t*_spd)+cos(_y*_sc+t*_spd*0.7f))*0.5f`)
        ln(`            +(sin(_x*_sc*1.7f+t*_spd*1.3f+_y*_sc*0.9f)*0.33f)`)
        ln(`            +(cos(_x*_sc*2.9f+t*_spd*2.1f)*0.17f);`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_n*0.3f+0.5f)*255));}}`)
        break
      }

      case 'Worley': {
        needsT.v = true
        needsWorley.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 0.5), scale = f('scale', 'scale', 0.3)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Worley noise`)
        ln(`    float _spd=${speed},_sc=${scale};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _f1=1e9f;`)
        ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
        ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy);`)
        ln(`        float _fx=_cx+0.5f+0.45f*sin(t*_spd+_h*6.2831f);`)
        ln(`        float _fy=_cy+0.5f+0.45f*cos(t*_spd*1.1f+_h*6.2831f);`)
        ln(`        float _d=sqrtf((_px-_fx)*(_px-_fx)+(_py-_fy)*(_py-_fy)); if(_d<_f1)_f1=_d; }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(min(1.0f,_f1)*255));}}`)
        break
      }

      case 'FractalNoise': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 0.3), scale = f('scale', 'scale', 0.15)
        const octaves = Math.max(1, Math.min(6, Math.floor(Number(p.octaves ?? 4))))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Fractal noise (fBm via inoise8)`)
        ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*_spd*40);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=0,_amp=0.5f,_norm=0,_freq=_sc*96;`)
        ln(`      for(int _o=0;_o<${octaves};_o++){`)
        ln(`        _v+=_amp*(inoise8((uint16_t)(_x*_freq),(uint16_t)(_y*_freq),_z)/255.0f);`)
        ln(`        _norm+=_amp; _amp*=0.5f; _freq*=2; }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v/_norm)*255));}}`)
        break
      }

      case 'GaborNoise': {
        needsT.v = true
        needsWorley.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 0.5), scale = f('scale', 'scale', 0.35)
        const freq = f('frequency', 'frequency', 1.2)
        const orientation = Number(p.orientation ?? 45)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Gabor noise`)
        ln(`    float _spd=${speed},_sc=${scale},_fr=${freq},_om=${orientation}*0.01745329f,_co=cos(_om),_si=sin(_om);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _px=_x*_sc,_py=_y*_sc; int _xi=(int)floorf(_px),_yi=(int)floorf(_py); float _v=0;`)
        ln(`      for(int _dj=-1;_dj<=1;_dj++) for(int _di=-1;_di<=1;_di++){`)
        ln(`        int _cx=_xi+_di,_cy=_yi+_dj; float _h=_worleyHash(_cx,_cy),_h2=_worleyHash(_cx+31,_cy-17);`)
        ln(`        float _fx=_cx+0.5f+(_h-0.5f),_fy=_cy+0.5f+(_h2-0.5f);`)
        ln(`        float _dx=_px-_fx,_dy=_py-_fy,_g=expf(-2.5f*(_dx*_dx+_dy*_dy));`)
        ln(`        float _proj=_dx*_co+_dy*_si,_w=_h2<0.5f?1.0f:-1.0f;`)
        ln(`        _v+=_w*_g*cosf(6.2831853f*_fr*_proj+t*_spd+_h*6.2831853f); }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_v*0.5f+0.5f)*255));}}`)
        break
      }

      case 'PaletteGradient': {
        const ob = ownBuf()
        const angle = Number(p.angle ?? 45), repeat = Number(p.repeat ?? 1), speed = Number(p.speed ?? 0)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const scroll = speed !== 0 ? `+t*${speed}f` : ''
        if (speed !== 0) needsT.v = true
        ln(`  { // Palette gradient`)
        ln(`    float _a=${angle}*0.01745329f,_co=cos(_a),_si=sin(_a);`)
        ln(`    float _pmin=(_co<0?(WIDTH-1)*_co:0)+(_si<0?(HEIGHT-1)*_si:0);`)
        ln(`    float _pmax=(_co>0?(WIDTH-1)*_co:0)+(_si>0?(HEIGHT-1)*_si:0);`)
        ln(`    float _rng=max(1e-6f,_pmax-_pmin);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _tn=(_x*_co+_y*_si-_pmin)/_rng;`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_tn*${repeat}f${scroll})*255));}}`)
        break
      }

      case 'Image': {
        const ob = ownBuf()
        const img = asImage(p.image)
        if (!img) {
          ln(`  fill_solid(${ob}, NUM_LEDS, CRGB::Black); // Image: none uploaded`)
          break
        }
        ln(`  { // Image ${img.w}x${img.h}`)
        ln(`    static const uint8_t _img_${id}[] PROGMEM = {${img.pixels.join(',')}};`)
        ln(`    const int _iw=${img.w}, _ih=${img.h};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      int _sx=min(_iw-1,(int)((long)_x*_iw/WIDTH)), _sy=min(_ih-1,(int)((long)_y*_ih/HEIGHT));`)
        ln(`      int _ii=(_sy*_iw+_sx)*3;`)
        ln(`      ${ob}[_y*WIDTH+_x]=CRGB(pgm_read_byte(&_img_${id}[_ii]),pgm_read_byte(&_img_${id}[_ii+1]),pgm_read_byte(&_img_${id}[_ii+2]));}}`)
        break
      }

      case 'Blobs': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 0.6), scale = f('scale', 'scale', 0.22)
        const count = Math.max(1, Math.min(6, Math.floor(Number(p.count ?? 3))))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Blobs (metaballs)`)
        ln(`    float _spd=${speed}, _r=${scale}*min(WIDTH,HEIGHT), _r2=_r*_r;`)
        ln(`    float _bx[${count}], _by[${count}];`)
        ln(`    for(int _i=0;_i<${count};_i++){ _bx[_i]=WIDTH*(0.5f+0.4f*sin(t*_spd*(0.7f+_i*0.13f)+_i*1.7f)); _by[_i]=HEIGHT*(0.5f+0.4f*cos(t*_spd*(0.6f+_i*0.17f)+_i*2.3f)); }`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){ float _f=0;`)
        ln(`      for(int _i=0;_i<${count};_i++){ float _dx=_x-_bx[_i],_dy=_y-_by[_i]; _f+=_r2/(_dx*_dx+_dy*_dy+1.0f); }`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_f/(_f+1.0f))*255)); }}`)
        break
      }

      case 'FlowField': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 1), scale = f('scale', 'scale', 0.08)
        const count = Math.max(8, Math.min(400, Math.floor(Number(p.count ?? 80))))
        const fade = Number(p.fade ?? 0.9)
        const fadeL = (Number.isInteger(fade) ? `${fade}.0` : `${fade}`) + 'f'
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const px = `_fpx_${id}`, py = `_fpy_${id}`, tr = `_ftr_${id}`
        ln(`  { // Flow field`)
        ln(`    static float ${px}[${count}], ${py}[${count}], ${tr}[NUM_LEDS]; static bool _fi_${id}=false;`)
        ln(`    if(!_fi_${id}){ for(int _i=0;_i<${count};_i++){ ${px}[_i]=(random8()/255.0f)*WIDTH; ${py}[_i]=(random8()/255.0f)*HEIGHT; } for(int _i=0;_i<NUM_LEDS;_i++)${tr}[_i]=0; _fi_${id}=true; }`)
        ln(`    float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*100);`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${tr}[_i]*=${fadeL};`)
        ln(`    for(int _i=0;_i<${count};_i++){`)
        ln(`      float _a=(inoise8((uint16_t)(${px}[_i]*_sc*256),(uint16_t)(${py}[_i]*_sc*256),_z)/255.0f)*6.2831f*2;`)
        ln(`      ${px}[_i]=fmodf(${px}[_i]+cos(_a)*_spd*0.6f+WIDTH,WIDTH); ${py}[_i]=fmodf(${py}[_i]+sin(_a)*_spd*0.6f+HEIGHT,HEIGHT);`)
        ln(`      int _xi=(int)${px}[_i],_yi=(int)${py}[_i]; if(_xi>=0&&_xi<WIDTH&&_yi>=0&&_yi<HEIGHT){ int _id=_yi*WIDTH+_xi; ${tr}[_id]=min(1.0f,${tr}[_id]+0.5f); } }`)
        ln(`    for(int _i=0;_i<NUM_LEDS;_i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${tr}[_i]*255)); }`)
        break
      }

      case 'Starfield': {
        const ob = ownBuf()
        const speed = f('speed', 'speed', 1)
        const count = Math.max(8, Math.min(300, Math.floor(Number(p.count ?? 60))))
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 255)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 255)})`
        const sx = `_sfx_${id}`, sy = `_sfy_${id}`, sz = `_sfz_${id}`
        ln(`  { // Starfield`)
        ln(`    static float ${sx}[${count}], ${sy}[${count}], ${sz}[${count}]; static bool _sfi_${id}=false;`)
        ln(`    if(!_sfi_${id}){ for(int _i=0;_i<${count};_i++){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=random8()/255.0f*0.9f+0.1f; } _sfi_${id}=true; }`)
        ln(`    float _spd=${speed}; fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        ln(`    for(int _i=0;_i<${count};_i++){ ${sz}[_i]-=_spd*0.015f;`)
        ln(`      if(${sz}[_i]<=0.02f){ ${sx}[_i]=random8()/127.5f-1; ${sy}[_i]=random8()/127.5f-1; ${sz}[_i]=1; }`)
        ln(`      int _px=(int)(WIDTH/2.0f+(${sx}[_i]/${sz}[_i])*WIDTH*0.35f), _py=(int)(HEIGHT/2.0f+(${sy}[_i]/${sz}[_i])*HEIGHT*0.35f);`)
        ln(`      if(_px>=0&&_px<WIDTH&&_py>=0&&_py<HEIGHT){ ${ob}[_py*WIDTH+_px]=${colorE}; ${ob}[_py*WIDTH+_px].nscale8((uint8_t)(min(1.0f,1-${sz}[_i])*255)); } } }`)
        break
      }

      case 'PlasmaFractal': {
        needsT.v = true
        const ob = ownBuf()
        const speed = f('speed', 'speed', 1), scale = f('scale', 'scale', 0.15)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _spd=${speed},_sc=${scale}; uint16_t _z=(uint16_t)(t*_spd*10);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _v=sin(_x*0.2f+t*_spd)+sin(_y*0.25f+t*_spd*0.8f)+sin((_x+_y)*0.15f+t*_spd*0.6f);`)
        ln(`      float _amp=1,_fr=_sc*96,_fn=0; for(int _o=0;_o<3;_o++){ _fn+=_amp*(inoise8((uint16_t)(_x*_fr),(uint16_t)(_y*_fr),_z)/255.0f-0.5f); _amp*=0.5f; _fr*=2; }`)
        ln(`      _v+=_fn*5; int _idx=((int)(_v*38)%256+256)%256;`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)_idx);}}`)
        break
      }

      case 'AudioFlow': {
        needsT.v = true
        const ob = ownBuf()
        const bass = f('bass', 'bass', 0.5), mids = f('mids', 'mids', 0.5), treble = f('treble', 'treble', 0.3)
        const speed = f('speed', 'speed', 1), scale = f('scale', 'scale', 0.2)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { float _b=${bass},_m=${mids},_tr=${treble},_spd=${speed},_sc=${scale};`)
        ln(`    float _flow=t*_spd*(0.2f+_m*1.5f); uint8_t _bright=(uint8_t)(min(1.0f,0.3f+_b)*255);`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      uint8_t _v=inoise8((uint16_t)((_x*_sc+_flow)*256),(uint16_t)(_y*_sc*0.6f*256));`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(_v+_tr*80)); ${ob}[_y*WIDTH+_x].nscale8(_bright);}}`)
        break
      }

      case 'ReactionDiffusion': {
        const ob = ownBuf()
        const feed = f('feed', 'feed', 0.055), kill = f('kill', 'kill', 0.062)
        const iters = Math.max(1, Math.min(20, Math.floor(Number(p.speed ?? 8))))
        const pal = paletteExpr(node.id, 'paletteIn', p)
        const u = `_u_${id}`, v = `_v_${id}`, un = `_un_${id}`, vn = `_vn_${id}`
        ln(`  { // ReactionDiffusion (Gray-Scott)`)
        ln(`    static float ${u}[NUM_LEDS], ${v}[NUM_LEDS], ${un}[NUM_LEDS], ${vn}[NUM_LEDS]; static bool _rd_${id} = false;`)
        ln(`    if (!_rd_${id}) { for (int _i = 0; _i < NUM_LEDS; _i++) { ${u}[_i] = 1; ${v}[_i] = 0; }`)
        ln(`      for (int _y = HEIGHT/2-2; _y <= HEIGHT/2+1; _y++) for (int _x = WIDTH/2-2; _x <= WIDTH/2+1; _x++)`)
        ln(`        if (_x>=0&&_x<WIDTH&&_y>=0&&_y<HEIGHT) { ${u}[_y*WIDTH+_x]=0.5f; ${v}[_y*WIDTH+_x]=0.5f; } _rd_${id}=true; }`)
        ln(`    float _f=${feed}, _k=${kill};`)
        ln(`    for (int _it=0; _it<${iters}; _it++) {`)
        ln(`      for (int _y=0; _y<HEIGHT; _y++) { int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
        ln(`        for (int _x=0; _x<WIDTH; _x++) { int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
        ln(`          float _lu=(${u}[_ym+_x]+${u}[_yp+_x]+${u}[_yr+_xm]+${u}[_yr+_xp])*0.2f+(${u}[_ym+_xm]+${u}[_ym+_xp]+${u}[_yp+_xm]+${u}[_yp+_xp])*0.05f-${u}[_i];`)
        ln(`          float _lv=(${v}[_ym+_x]+${v}[_yp+_x]+${v}[_yr+_xm]+${v}[_yr+_xp])*0.2f+(${v}[_ym+_xm]+${v}[_ym+_xp]+${v}[_yp+_xm]+${v}[_yp+_xp])*0.05f-${v}[_i];`)
        ln(`          float _uvv=${u}[_i]*${v}[_i]*${v}[_i];`)
        ln(`          ${un}[_i]=constrain(${u}[_i]+0.16f*_lu-_uvv+_f*(1-${u}[_i]),0.0f,1.0f);`)
        ln(`          ${vn}[_i]=constrain(${v}[_i]+0.08f*_lv+_uvv-(_k+_f)*${v}[_i],0.0f,1.0f); } }`)
        ln(`      ::memcpy(${u},${un},sizeof(${u})); ::memcpy(${v},${vn},sizeof(${v})); }`)
        ln(`    for (int _i=0; _i<NUM_LEDS; _i++) ${ob}[_i]=ColorFromPalette(${pal},(uint8_t)(${v}[_i]*255)); }`)
        break
      }

      case 'GameOfLife': {
        const ob = ownBuf()
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 255)}, ${Number(p.b ?? 70)})`
        const speed = f('speed', 'speed', 8)
        const fade = Number(p.fade ?? 0.75)
        const fadeL = (Number.isInteger(fade) ? `${fade}.0` : `${fade}`) + 'f'
        const c = `_gc_${id}`, nx = `_gn_${id}`, br = `_gb_${id}`
        ln(`  { // Game of Life`)
        ln(`    static uint8_t ${c}[NUM_LEDS], ${nx}[NUM_LEDS]; static float ${br}[NUM_LEDS]; static bool _gi_${id}=false; static uint32_t _gt_${id}=0;`)
        ln(`    if (!_gi_${id}) { for (int _i=0;_i<NUM_LEDS;_i++){${c}[_i]=random8()<77?1:0;${br}[_i]=0;} _gi_${id}=true; }`)
        ln(`    if (millis() - _gt_${id} >= (uint32_t)(1000.0f / max(1.0f, (float)(${speed})))) {`)
        ln(`      int _pop=0;`)
        ln(`      for (int _y=0;_y<HEIGHT;_y++){ int _ym=((_y-1+HEIGHT)%HEIGHT)*WIDTH,_yp=((_y+1)%HEIGHT)*WIDTH,_yr=_y*WIDTH;`)
        ln(`        for (int _x=0;_x<WIDTH;_x++){ int _xm=(_x-1+WIDTH)%WIDTH,_xp=(_x+1)%WIDTH,_i=_yr+_x;`)
        ln(`          int _n=${c}[_ym+_xm]+${c}[_ym+_x]+${c}[_ym+_xp]+${c}[_yr+_xm]+${c}[_yr+_xp]+${c}[_yp+_xm]+${c}[_yp+_x]+${c}[_yp+_xp];`)
        ln(`          ${nx}[_i]=${c}[_i]?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+=${nx}[_i]; } }`)
        ln(`      ::memcpy(${c},${nx},sizeof(${c}));`)
        ln(`      if (_pop==0) { for (int _i=0;_i<NUM_LEDS;_i++) ${c}[_i]=random8()<77?1:0; }`)
        ln(`      _gt_${id}=millis(); }`)
        ln(`    for (int _i=0;_i<NUM_LEDS;_i++){ ${br}[_i]=${c}[_i]?1.0f:${br}[_i]*${fadeL}; ${ob}[_i]=${colorE}; ${ob}[_i].nscale8((uint8_t)(${br}[_i]*255)); } }`)
        break
      }

      case 'PatternMaster':
        ln(`  // PatternMaster — implement pattern cycling logic in setup()/loop()`)
        break

      case 'Sequencer': {
        const ob = ownBuf()
        const interval = Number(p.interval ?? 4), fade = Number(p.fade ?? 1)
        const bufs = ['p0', 'p1', 'p2', 'p3'].map((port) => srcBuf(port)).filter((b): b is string => !!b)
        // C++ float literal (avoids "4f" — needs "4.0f").
        const fl = (x: number) => { const s = (+x.toFixed(4)).toString(); return (s.includes('.') ? s : `${s}.0`) + 'f' }
        const iv = Math.max(0.1, interval)
        const fadeDur = Math.max(0, Math.min(fade, iv))
        ln(`  { // Sequencer (interval ${interval}s, fade ${fade}s)`)
        if (bufs.length === 0) {
          ln(`    fill_solid(${ob}, NUM_LEDS, CRGB::Black);`)
        } else if (bufs.length === 1) {
          ln(`    ::memmove(${ob}, ${bufs[0]}, sizeof(CRGB) * NUM_LEDS);`)
        } else {
          needsT.v = true
          const n = bufs.length
          ln(`    static CRGB* const _seq_${id}[] = { ${bufs.join(', ')} };`)
          ln(`    float _ph = t / ${fl(iv)};`)
          ln(`    int _idx = ((int)floor(_ph)) % ${n};`)
          ln(`    float _into = (_ph - floor(_ph)) * ${fl(iv)};`)
          ln(`    ::memmove(${ob}, _seq_${id}[_idx], sizeof(CRGB) * NUM_LEDS);`)
          if (fadeDur > 0) {
            ln(`    if (_into >= ${fl(iv - fadeDur)}) {`)
            ln(`      uint8_t _m = (uint8_t)((_into - ${fl(iv - fadeDur)}) / ${fl(fadeDur)} * 255);`)
            ln(`      nblend(${ob}, _seq_${id}[(_idx + 1) % ${n}], NUM_LEDS, _m);`)
            ln(`    }`)
          }
        }
        ln(`  }`)
        break
      }

      case 'CustomFormula': {
        needsT.v = true
        const ob = ownBuf()
        const formula = String(p.formula ?? 'sin(x*6+t)*0.5+0.5').replace(/\*\//g, '* /')
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { /* CustomFormula: ${formula} */`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);`)
        ln(`      float _v=${formula};`)
        ln(`      ${ob}[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}`)
        break
      }

      case 'CHSV': {
        const hue = f('hue', 'hue', 128), sat = f('sat', 'sat', 255), val = f('val', 'val', 255)
        ln(`  CRGB ${v('rgb')} = CHSV((uint8_t)(${hue}), (uint8_t)(${sat}), (uint8_t)(${val}));`)
        break
      }

      case 'PaletteSelector':
        ln(`  // PaletteSelector — drives ${fastledPalette(String(p.palette ?? 'rainbow'))} in connected palette-consuming nodes`)
        break

      case 'CustomPalette': {
        // Build a CRGBPalette16 from connected colors (CRGBPalette16 has 1–4 and
        // 16 colour constructors); consumers reference pal_<id> via paletteExpr.
        const cols = ['color0', 'color1', 'color2', 'color3']
          .filter((port) => incoming.get(`${node.id}:${port}`))
          .map((port) => colorExpr(node.id, port))
        if (cols.length === 0) ln(`  CRGBPalette16 pal_${id} = RainbowColors_p;`)
        else ln(`  CRGBPalette16 pal_${id}(${cols.join(', ')});`)
        break
      }

      case 'Poline': {
        // Bake the poline palette (computed from the configured anchor hex
        // props) into a CRGBPalette16. Live-wired anchors drive only the
        // preview; firmware uses the configured anchors.
        const a = hexToRgb(String(p.anchorA ?? '#1020ff'))
        const b = hexToRgb(String(p.anchorB ?? '#ff20a0'))
        const stops = polineStops16(a, b, Number(p.points ?? 4), String(p.position ?? 'sinusoidal'))
        const cppStops = stops.map((s) => `CRGB(${s.r},${s.g},${s.b})`).join(', ')
        if (incoming.get(`${node.id}:colorA`) || incoming.get(`${node.id}:colorB`)) {
          ln(`  // Poline: wired anchors drive the live preview; firmware bakes the configured anchors.`)
        }
        ln(`  CRGBPalette16 pal_${id}(${cppStops});`)
        break
      }

      case 'PaletteBlend': {
        // Build a CRGBPalette16 by blending both palettes entry-by-entry.
        const a = paletteExpr(node.id, 'paletteA', { palette: p.paletteA })
        const b = paletteExpr(node.id, 'paletteB', { palette: p.paletteB })
        const amt = f('amount', 'amount', 128)
        ln(`  CRGBPalette16 pal_${id};`)
        ln(`  { uint8_t _amt = (uint8_t)(${amt}); for (int _i = 0; _i < 16; _i++) { uint8_t _p = (uint8_t)(_i * 255 / 15);`)
        ln(`    pal_${id}[_i] = blend(ColorFromPalette(${a}, _p), ColorFromPalette(${b}, _p), _amt); } }`)
        break
      }

      case 'BeatSin': {
        const bpm = Number(p.bpm ?? 60), lo = Number(p.low ?? 0), hi = Number(p.high ?? 255)
        ln(`  uint8_t ${v('value')} = beatsin8(${bpm}, ${lo}, ${hi});`)
        break
      }

      case 'Fire2012': {
        const ob = ownBuf()
        const cooling = Number(p.cooling ?? 55), sparking = Number(p.sparking ?? 120)
        ln(`  { // Fire2012 (cooling=${cooling}, sparking=${sparking})`)
        ln(`    static uint8_t _heat_${id}[HEIGHT][WIDTH] = {};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`      _heat_${id}[_y][_x]=qsub8(_heat_${id}[_y][_x],random8(0,((${cooling}*10/HEIGHT)+2)));`)
        ln(`    for(int _y=0;_y<HEIGHT-2;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`      _heat_${id}[_y][_x]=(_heat_${id}[_y+1][_x]+_heat_${id}[_y+2][max(0,_x-1)]+_heat_${id}[_y+2][_x]+_heat_${id}[_y+2][min(WIDTH-1,_x+1)])/4;`)
        ln(`    for(int _x=0;_x<WIDTH;_x++) if(random8()<${sparking}) _heat_${id}[HEIGHT-1][_x]=qadd8(_heat_${id}[HEIGHT-1][_x],random8(160,255));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++) ${ob}[_y*WIDTH+_x]=HeatColor(_heat_${id}[_y][_x]);`)
        ln(`  }`)
        break
      }

      case 'Blur2D': {
        const ob = ownBuf()
        const amount = Number(p.amount ?? 40)
        ln(`  ${seedFrom('frame')} blur2d(${ob}, WIDTH, HEIGHT, ${amount});`)
        break
      }

      case 'XYMapper': {
        const xx = f('x', 'x', 0), yy = f('y', 'y', 0)
        ln(`  uint16_t ${v('index')} = (uint16_t)(${xx}) + (uint16_t)(${yy}) * WIDTH;`)
        break
      }

      case 'LayerBlend': {
        const ob = ownBuf()
        const a = srcBuf('a'), b = srcBuf('b'), amount = f('amount', 'amount', 128)
        ln(`  { ${a ? `::memmove(${ob}, ${a}, sizeof(CRGB) * NUM_LEDS);` : `fill_solid(${ob}, NUM_LEDS, CRGB::Black);`}`)
        ln(`    nblend(${ob}, ${b ?? ob}, NUM_LEDS, (uint8_t)(${amount})); }`)
        break
      }

      case 'AudioHue': {
        const bass = f('bass','bass',0.5), mids = f('mids','mids',0.5), treble = f('treble','treble',0.5)
        ln(`  uint8_t ${v('hue')} = (uint8_t)(((${bass})*0.5f+(${mids})*0.3f+(${treble})*0.2f)*255);`)
        break
      }

      case 'MatrixOutput': {
        const src = srcBuf('frame')
        if (!src) ln(`  fill_solid(leds, NUM_LEDS, CRGB::Black);`)
        else if (serpentine) ln(`  for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) leds[XY(_x, _y)] = ${src}[_y * WIDTH + _x];`)
        else ln(`  ::memmove(leds, ${src}, sizeof(CRGB) * NUM_LEDS);`)
        ln(`  FastLED.show();`)
        break
      }

      default:
        ln(`  // ${type} — not yet supported in code gen`)
    }
  }

  // Emit all node snippets first to collect needsMapFloat and needsT flags
  for (const node of sorted) emit(node)

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
  // One render buffer per frame-producing node so layers can be composited.
  for (const b of frameBufs) lines.push(`CRGB buf_${b}[NUM_LEDS];`)
  lines.push(``)

  if (needsMapFloat[0]) {
    lines.push(`float mapFloat(float x, float inMin, float inMax, float outMin, float outMax) {`)
    lines.push(`  if (inMax == inMin) return outMin;`)
    lines.push(`  return outMin + (x - inMin) * (outMax - outMin) / (inMax - inMin);`)
    lines.push(`}`)
    lines.push(``)
  }

  if (needsKelvin.v) {
    lines.push(`// Approximate black-body white point for a colour temperature (Kelvin).`)
    lines.push(`CRGB kelvinToRGB(float kelvin) {`)
    lines.push(`  float t = constrain(kelvin, 1000.0f, 40000.0f) / 100.0f, r, g, b;`)
    lines.push(`  if (t <= 66) { r = 255; g = 99.4708025861f * log(t) - 161.1195681661f; }`)
    lines.push(`  else { r = 329.698727446f * pow(t - 60, -0.1332047592f); g = 288.1221695283f * pow(t - 60, -0.0755148492f); }`)
    lines.push(`  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231f * log(t - 10) - 305.0447927307f;`)
    lines.push(`  return CRGB(constrain((int)r, 0, 255), constrain((int)g, 0, 255), constrain((int)b, 0, 255));`)
    lines.push(`}`)
    lines.push(``)
  }

  if (needsWorley.v) {
    lines.push(`// Integer hash → [0,1) placing one feature point per cell (Worley noise).`)
    lines.push(`float _worleyHash(int x, int y) {`)
    lines.push(`  uint32_t h = (uint32_t)(x * 374761393) + (uint32_t)(y * 668265263);`)
    lines.push(`  h = (h ^ (h >> 13)) * 1274126177u;`)
    lines.push(`  return ((h ^ (h >> 16)) & 0xFFFFFF) / 16777216.0f;`)
    lines.push(`}`)
    lines.push(``)
  }

  if (serpentine) {
    lines.push(`// Serpentine (zig-zag) layout: every other row runs right-to-left.`)
    lines.push(`uint16_t XY(uint8_t x, uint8_t y) {`)
    lines.push(`  return (y & 0x01) ? (uint16_t)y * WIDTH + (WIDTH - 1 - x) : (uint16_t)y * WIDTH + x;`)
    lines.push(`}`)
    lines.push(``)
  }

  lines.push(`void setup() {`)
  lines.push(`  FastLED.addLeds<${chipset}, DATA_PIN, ${colorOrder}>(leds, NUM_LEDS);`)
  lines.push(`  FastLED.setBrightness(200);`)
  lines.push(`}`)
  lines.push(``)

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
