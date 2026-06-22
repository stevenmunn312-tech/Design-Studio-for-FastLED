import type { StudioNode, StudioEdge } from '../state/graphStore'

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_')
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

export function generateCpp(nodes: StudioNode[], edges: StudioEdge[]): string {
  if (nodes.length === 0) return '// No nodes in graph\n'

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
        const sp = props(src)
        const name = src.data.nodeType === 'PaletteBlend' ? sp.paletteA : sp.palette
        return fastledPalette(String(name ?? 'rainbow'))
      }
    }
    return fastledPalette(String(nodeProps.palette ?? 'rainbow'))
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

      case 'Span': {
        // Paints over whatever earlier nodes wrote to leds[] (the implicit base).
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 128)}, ${Number(p.b ?? 255)})`
        const row   = Math.floor(Number(p.row   ?? 0))
        const start = Math.floor(Number(p.start ?? 0))
        const count = Math.floor(Number(p.count ?? width))
        const x0 = Math.max(0, start), x1 = Math.min(width, start + count)
        if (row >= 0 && row < height && x1 > x0)
          ln(`  for (int _x = ${x0}; _x < ${x1}; _x++) leds[${row} * WIDTH + _x] = ${colorE};`)
        break
      }

      case 'Rect': {
        const colorE = incoming.get(`${node.id}:color`)
          ? colorExpr(node.id, 'color')
          : `CRGB(${Number(p.r ?? 0)}, ${Number(p.g ?? 128)}, ${Number(p.b ?? 255)})`
        const rx = Math.floor(Number(p.x ?? 0)), ry = Math.floor(Number(p.y ?? 0))
        const rw = Math.floor(Number(p.w ?? width)), rh = Math.floor(Number(p.h ?? height))
        const x0 = Math.max(0, rx), x1 = Math.min(width, rx + rw)
        const y0 = Math.max(0, ry), y1 = Math.min(height, ry + rh)
        if (x1 > x0 && y1 > y0)
          ln(`  for (int _y = ${y0}; _y < ${y1}; _y++) for (int _x = ${x0}; _x < ${x1}; _x++) leds[_y * WIDTH + _x] = ${colorE};`)
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

      case 'Noise2D': {
        needsT.v = true
        const speed = f('speed', 'speed', 0.4), scale = f('scale', 'scale', 0.4)
        ln(`  { float _spd=${speed},_sc=${scale}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _v=sin(_x*_sc+t*_spd+1.7f)*cos(_y*_sc*1.3f+t*_spd*0.8f+2.3f)+0.5f*sin(_x*_sc*2.1f+t*_spd*2.0f)*cos(_y*_sc*2.7f+t*_spd*1.6f);`)
        ln(`    leds[_y*WIDTH+_x]=CHSV((uint8_t)((_v*0.5f+0.5f)*255),255,220);}}`)
        break
      }

      case 'RadialBurst': {
        needsT.v = true
        const speed = f('speed', 'speed', 1)
        const r = Number(p.r ?? 0), g = Number(p.g ?? 200), b = Number(p.b ?? 255)
        ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _w=(sin((_d*8-t*_spd*3)*3.14159f)+1)/2.0f;`)
        ln(`    leds[_y*WIDTH+_x]=CRGB((uint8_t)(${r}*_w),(uint8_t)(${g}*_w),(uint8_t)(${b}*_w));}}`)
        break
      }

      case 'Spiral': {
        needsT.v = true
        const speed = f('speed', 'speed', 1), arms = Number(p.arms ?? 2)
        ln(`  { float _spd=${speed}; for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _d=sqrt((_x-WIDTH/2.0f)*(_x-WIDTH/2.0f)+(_y-HEIGHT/2.0f)*(_y-HEIGHT/2.0f))/sqrt(WIDTH*WIDTH/4.0f+HEIGHT*HEIGHT/4.0f);`)
        ln(`    float _a=atan2(_y-HEIGHT/2.0f,_x-WIDTH/2.0f);float _s=(_a+_d*12.57f-t*_spd*3.14159f)*${arms};`)
        ln(`    leds[_y*WIDTH+_x]=CHSV((uint8_t)(_d*255+t*30),255,(uint8_t)((sin(_s)+1)/2.0f*230));}}`)
        break
      }

      case 'Kaleidoscope':
        ln(`  // Kaleidoscope: apply after a pattern node has written to leds[]`)
        break

      case 'Particles':
        ln(`  // Particles: complex stateful pattern — see FastLED particle examples`)
        break

      case 'Invert':
        ln(`  for(int _i=0;_i<NUM_LEDS;_i++){leds[_i].r=255-leds[_i].r;leds[_i].g=255-leds[_i].g;leds[_i].b=255-leds[_i].b;}`)
        break

      case 'GradientFrame': {
        const rA = Number(p.rA ?? 0), gA = Number(p.gA ?? 200), bA = Number(p.bA ?? 255)
        const rB = Number(p.rB ?? 255), gB = Number(p.gB ?? 0), bB = Number(p.bB ?? 255)
        const vert = Boolean(p.vertical)
        ln(`  { for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`    float _t=${vert ? '_y/(HEIGHT-1.0f)' : '_x/(WIDTH-1.0f)'};`)
        ln(`    leds[_y*WIDTH+_x]=CRGB((uint8_t)(${rA}*(1-_t)+${rB}*_t),(uint8_t)(${gA}*(1-_t)+${gB}*_t),(uint8_t)(${bA}*(1-_t)+${bB}*_t));}}`)
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
        const mix = f('t', 't', 0.5)
        ln(`  { uint8_t _mix = (uint8_t)((${mix}) * 255); /* Crossfade: blend frame A into frame B */ }`)
        break
      }

      case 'Wipe': {
        needsT.v = true
        const tt = f('t', 't', 0.5)
        const dir = String(p.direction ?? 'right')
        const axis = (dir === 'up' || dir === 'down') ? '_y' : '_x'
        const dim  = (dir === 'up' || dir === 'down') ? 'HEIGHT' : 'WIDTH'
        const cmp  = (dir === 'right' || dir === 'down') ? '<' : '>'
        const rhs  = (dir === 'right' || dir === 'down') ? `(int)((${tt})*${dim})` : `(int)((1.0f-(${tt}))*${dim})`
        ln(`  { for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`    if(${axis} ${cmp} ${rhs}) { /* wipe to: pixel from frame B */ } }`)
        break
      }

      case 'Dissolve': {
        const tt = f('t', 't', 0.5)
        ln(`  { float _tt=${tt}; for(int _i=0;_i<NUM_LEDS;_i++){`)
        ln(`    uint32_t _h=((uint32_t)(_i)*1664525u+1013904223u);`)
        ln(`    if((_h&0xFFFF)<(uint32_t)(_tt*65535)) { /* dissolve to: pixel from frame B */ }}}`)
        break
      }

      case 'Simplex2D': {
        needsT.v = true
        const speed = f('speed', 'speed', 0.4), scale = f('scale', 'scale', 0.3)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Simplex2D`)
        ln(`    float _spd=${speed},_sc=${scale};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _n=sin(_x*_sc+sin(_y*_sc*0.8f+t*_spd*0.5f)+t*_spd)`)
        ln(`            +0.5f*sin(_x*_sc*2+t*_spd*1.9f)+0.25f*sin(_x*_sc*4+t*_spd*4.1f);`)
        ln(`      leds[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_n*0.25f+0.5f)*255));}}`)
        break
      }

      case 'Noise3D': {
        needsT.v = true
        const speed = f('speed', 'speed', 0.5), scale = f('scale', 'scale', 0.3)
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { // Noise3D`)
        ln(`    float _spd=${speed},_sc=${scale};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float _n=(sin(_x*_sc+t*_spd)+cos(_y*_sc+t*_spd*0.7f))*0.5f`)
        ln(`            +(sin(_x*_sc*1.7f+t*_spd*1.3f+_y*_sc*0.9f)*0.33f)`)
        ln(`            +(cos(_x*_sc*2.9f+t*_spd*2.1f)*0.17f);`)
        ln(`      leds[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)((_n*0.3f+0.5f)*255));}}`)
        break
      }

      case 'PatternMaster':
        ln(`  // PatternMaster — implement pattern cycling logic in setup()/loop()`)
        break

      case 'CustomFormula': {
        needsT.v = true
        const formula = String(p.formula ?? 'sin(x*6+t)*0.5+0.5').replace(/\*\//g, '* /')
        const pal = paletteExpr(node.id, 'paletteIn', p)
        ln(`  { /* CustomFormula: ${formula} */`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){`)
        ln(`      float x=(float)_x/(WIDTH-1>0?WIDTH-1:1),y=(float)_y/(HEIGHT-1>0?HEIGHT-1:1);`)
        ln(`      float _v=${formula};`)
        ln(`      leds[_y*WIDTH+_x]=ColorFromPalette(${pal},(uint8_t)(fmod(fmod(_v,1)+1,1)*255));}}`)
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

      case 'PaletteBlend':
        ln(`  // PaletteBlend — nblendPaletteTowardPalette(paletteA, paletteB, (uint8_t)(${f('amount','amount',0.5)}*255));`)
        break

      case 'BeatSin': {
        const bpm = Number(p.bpm ?? 60), lo = Number(p.low ?? 0), hi = Number(p.high ?? 255)
        ln(`  uint8_t ${v('value')} = beatsin8(${bpm}, ${lo}, ${hi});`)
        break
      }

      case 'Fire2012': {
        const cooling = Number(p.cooling ?? 55), sparking = Number(p.sparking ?? 120)
        ln(`  { // Fire2012 (cooling=${cooling}, sparking=${sparking})`)
        ln(`    static uint8_t _heat[HEIGHT][WIDTH] = {};`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`      _heat[_y][_x]=qsub8(_heat[_y][_x],random8(0,((${cooling}*10/HEIGHT)+2)));`)
        ln(`    for(int _y=0;_y<HEIGHT-2;_y++) for(int _x=0;_x<WIDTH;_x++)`)
        ln(`      _heat[_y][_x]=(_heat[_y+1][_x]+_heat[_y+2][max(0,_x-1)]+_heat[_y+2][_x]+_heat[_y+2][min(WIDTH-1,_x+1)])/4;`)
        ln(`    for(int _x=0;_x<WIDTH;_x++) if(random8()<${sparking}) _heat[HEIGHT-1][_x]=qadd8(_heat[HEIGHT-1][_x],random8(160,255));`)
        ln(`    for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++) leds[_y*WIDTH+_x]=HeatColor(_heat[_y][_x]);`)
        ln(`  }`)
        break
      }

      case 'Blur2D': {
        const amount = Number(p.amount ?? 40)
        ln(`  blur2d(leds, WIDTH, HEIGHT, ${amount});`)
        break
      }

      case 'XYMapper': {
        const xx = f('x', 'x', 0), yy = f('y', 'y', 0)
        ln(`  uint16_t ${v('index')} = (uint16_t)(${xx}) + (uint16_t)(${yy}) * WIDTH;`)
        break
      }

      case 'LayerBlend': {
        const amount = f('amount', 'amount', 128)
        ln(`  blend(leds, leds, leds, NUM_LEDS, (uint8_t)(${amount}));  // LayerBlend: provide two source arrays`)
        break
      }

      case 'AudioHue': {
        const bass = f('bass','bass',0.5), mids = f('mids','mids',0.5), treble = f('treble','treble',0.5)
        ln(`  uint8_t ${v('hue')} = (uint8_t)(((${bass})*0.5f+(${mids})*0.3f+(${treble})*0.2f)*255);`)
        break
      }

      case 'MatrixOutput':
        ln(`  FastLED.show();`)
        break

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
