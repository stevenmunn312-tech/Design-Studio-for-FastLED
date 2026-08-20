import { describe, it, expect } from 'vitest'
import { generateCpp, audioEngineForGraph } from '../cppGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'
import { DEFAULT_FONT, textColumns } from '../../state/font'
import { ringSampleMapForProps } from '../../state/ledOutputForm'

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

function edge(id: string, source: string, target: string, sh: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const outputNode = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('generateCpp', () => {
  it('returns comment for empty graph', () => {
    expect(generateCpp([], [])).toBe('// No nodes in graph\n')
  })

  it('always includes FastLED header and setup', () => {
    const cpp = generateCpp([outputNode], [])
    expect(cpp).toContain('#include <FastLED.h>')
    expect(cpp).toContain('void setup()')
    expect(cpp).toContain('void loop()')
    expect(cpp).toContain('FastLED.addLeds')
  })

  it('uses MatrixOutput dimensions and pin', () => {
    const cpp = generateCpp([outputNode], [])
    expect(cpp).toContain('#define WIDTH    8')
    expect(cpp).toContain('#define HEIGHT   8')
    expect(cpp).toContain('#define DATA_PIN 5')
    expect(cpp).toContain('WS2812B')
    expect(cpp).toContain('GRB')
  })

  it('emits independently wired synchronized controllers with Board-wide brightness', () => {
    const patternA = node('pattern-a', 'SolidColor', 'pattern')
    const patternB = node('pattern-b', 'Plasma', 'pattern')
    const outA = node('out-a', 'MatrixOutput', 'output', {
      width: 8, height: 8, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB', brightness: 64,
      layout: 'matrix', serpentine: true, routeMode: 'fit',
    })
    const outB = node('out-b', 'MatrixOutput', 'output', {
      width: 16, height: 4, dataPin: 12, clockPin: 13, chipset: 'APA102', colorOrder: 'BGR', brightness: 180,
      layout: 'strip', routeMode: 'crop', routeX: 2, routeY: 1,
    })
    const cpp = generateCpp(
      [node('board', 'Board', 'output', { brightness: 64 }), patternA, patternB, outA, outB],
      [edge('ea', 'pattern-a', 'out-a', 'frame', 'frame'), edge('eb', 'pattern-b', 'out-b', 'frame', 'frame')],
    )

    expect(cpp).toContain('#define WIDTH    16')
    expect(cpp).toContain('#define HEIGHT   8')
    expect(cpp).toContain('#define DATA_PIN_out_a 5')
    expect(cpp).toContain('#define DATA_PIN_out_b 12')
    expect(cpp).toContain('#define CLOCK_PIN_out_b 13')
    expect(cpp).toContain('CRGB leds_out_a[64];')
    expect(cpp).toContain('CRGB leds_out_b[64];')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, DATA_PIN_out_a, GRB>(leds_out_a, 64)')
    expect(cpp).toContain('FastLED.addLeds<APA102, DATA_PIN_out_b, CLOCK_PIN_out_b, BGR>(leds_out_b, 64)')
    expect(cpp).toContain('_c.nscale8_video(64)')
    expect(cpp).not.toContain('_c.nscale8_video(180)')
    expect(cpp).toContain('int _sx = (2 + _x) % WIDTH, _sy = (1 + _y) % HEIGHT;')
    expect(cpp.match(/FastLED\.show\(\);/g)).toHaveLength(1)
  })

  // ── LED output forms ───────────────────────────────────────────────────────
  // A string used to be its own node type with no `case` in this generator at
  // all, so a strip-only graph compiled to a "not yet supported" comment. It is
  // one `form` of the single output node now, which is what gives it firmware.

  it('renders a string on its own 1 x N grid', () => {
    const out = node('out', 'MatrixOutput', 'output', { form: 'strip', ledCount: 144, dataPin: 18 })
    const cpp = generateCpp([node('sc', 'SolidColor', 'pattern'), out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('#define WIDTH    144')
    expect(cpp).toContain('#define HEIGHT   1')
    expect(cpp).toContain('#define DATA_PIN 18')
    expect(cpp).toContain('CRGB leds[NUM_LEDS];')
    // Row-major already is the physical order on a single run, so no XY table.
    expect(cpp).not.toContain('_xytable')
    // The terminal node renders into `leds` directly — no second buffer to copy.
    expect(cpp).toContain('CRGB* const buf_sc = leds;')
    expect(cpp).not.toContain('::memmove(leds, buf_sc,')
  })

  it('ignores a serpentine flag a string inherited from an earlier form', () => {
    const out = node('out', 'MatrixOutput', 'output', { form: 'strip', ledCount: 60, serpentine: true })
    expect(generateCpp([out], [])).not.toContain('_xytable')
  })

  it('bakes a ring sample map and drives the ring through it', () => {
    const out = node('out', 'MatrixOutput', 'output', {
      form: 'ring', ledCount: 24, ringStartAngle: 0, ringDirection: 'cw', dataPin: 7,
    })
    const cpp = generateCpp([node('sc', 'SolidColor', 'pattern'), out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    // The render canvas is the square the ring is inscribed in; the LEDs are
    // the chain around it.
    expect(cpp).toContain('#define WIDTH    8')
    expect(cpp).toContain('#define HEIGHT   8')
    expect(cpp).toContain('#define RING_LEDS 24')
    expect(cpp).toContain('CRGB leds[RING_LEDS];')
    expect(cpp).toContain('const uint16_t _ringmap[RING_LEDS] PROGMEM = {')
    expect(cpp).toContain('for (int _i = 0; _i < RING_LEDS; _i++) leds[_i] = buf_sc[pgm_read_word(&_ringmap[_i])];')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, RING_LEDS);')
  })

  it('bakes the same ring map the live preview routes through', () => {
    const props = { form: 'ring', ledCount: 16, ringStartAngle: 45, ringDirection: 'ccw' }
    const cpp = generateCpp([node('out', 'MatrixOutput', 'output', props)], [])
    const baked = cpp.match(/_ringmap\[RING_LEDS\] PROGMEM = \{ ([^}]+) \}/)![1]
    expect(baked.split(',').map(Number)).toEqual(ringSampleMapForProps(props))
  })

  it('drives a ring alongside a panel on its own map', () => {
    const ring = node('ring', 'MatrixOutput', 'output', { form: 'ring', ledCount: 12, dataPin: 6, brightness: 90 })
    const panel = node('panel', 'MatrixOutput', 'output', { form: 'matrix', width: 8, height: 8, dataPin: 5 })
    const cpp = generateCpp(
      [node('sc', 'SolidColor', 'pattern'), ring, panel],
      [edge('e1', 'sc', 'ring', 'frame', 'frame'), edge('e2', 'sc', 'panel', 'frame', 'frame')],
    )
    expect(cpp).toContain('CRGB leds_ring[12];')
    expect(cpp).toContain('CRGB leds_panel[64];')
    expect(cpp).toContain('const uint16_t _ringmap_ring[12] PROGMEM = {')
    expect(cpp).toContain('CRGB _c = buf_sc[pgm_read_word(&_ringmap_ring[_i])]; _c.nscale8_video(90);')
  })

  it('treats the HUB75 form as a scan panel whatever chipset string it carries', () => {
    const out = node('out', 'MatrixOutput', 'output', { form: 'hub75', chipset: 'WS2812B', width: 64, height: 32 })
    const cpp = generateCpp([out], [])
    expect(cpp).toContain('ESP32-HUB75-MatrixPanel-I2S-DMA.h')
    expect(cpp).not.toContain('FastLED.addLeds')
  })

  it('emits one controller for two runs wired in parallel on the same pin', () => {
    const a = node('a', 'MatrixOutput', 'output', { form: 'matrix', width: 8, height: 8, dataPin: 18 })
    const b = node('b', 'MatrixOutput', 'output', { form: 'matrix', width: 8, height: 8, dataPin: 18 })
    const cpp = generateCpp(
      [node('sc', 'SolidColor', 'pattern'), a, b],
      [edge('e1', 'sc', 'a', 'frame', 'frame'), edge('e2', 'sc', 'b', 'frame', 'frame')],
    )
    // Both panels hang off one wire, so the sketch is the one-panel sketch.
    expect(cpp).toContain('CRGB leds[NUM_LEDS];')
    expect(cpp).not.toContain('leds_a')
    expect(cpp).not.toContain('leds_b')
    expect(cpp.match(/FastLED\.addLeds/g)).toHaveLength(1)
    expect(cpp).toContain('wired in parallel with')
  })

  it('still emits a controller each when same-frame runs are on different pins', () => {
    const a = node('a', 'MatrixOutput', 'output', { form: 'matrix', width: 8, height: 8, dataPin: 18 })
    const b = node('b', 'MatrixOutput', 'output', { form: 'matrix', width: 8, height: 8, dataPin: 19 })
    const cpp = generateCpp(
      [node('sc', 'SolidColor', 'pattern'), a, b],
      [edge('e1', 'sc', 'a', 'frame', 'frame'), edge('e2', 'sc', 'b', 'frame', 'frame')],
    )
    expect(cpp).toContain('CRGB leds_a[64];')
    expect(cpp).toContain('CRGB leds_b[64];')
    expect(cpp.match(/FastLED\.addLeds/g)).toHaveLength(2)
  })

  it('emits the default hardware setup (brightness 200, no correction, dither untouched)', () => {
    const cpp = generateCpp([outputNode], [])
    expect(cpp).toContain('FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);')
    expect(cpp).toContain('FastLED.setBrightness(200);')
    expect(cpp).not.toContain('setCorrection')
    expect(cpp).not.toContain('setDither')
    expect(cpp).not.toContain('FASTLED_OVERCLOCK')
    expect(cpp).not.toContain('CLOCK_PIN')
  })

  it('honours brightness / correction / dither-off on MatrixOutput', () => {
    const out = node('out', 'MatrixOutput', 'output', {
      brightness: 96, correction: 'TypicalLEDStrip', dither: false,
    })
    const cpp = generateCpp([out], [])
    expect(cpp).toContain('FastLED.setBrightness(96);')
    expect(cpp).toContain('FastLED.setCorrection(TypicalLEDStrip);')
    expect(cpp).toContain('FastLED.setDither(DISABLE_DITHER);')
  })

  it('emits a setup() pinMode for ButtonInput honouring the pullup property', () => {
    const btn = node('btn', 'ButtonInput', 'input', { pin: 7, pullup: true })
    const bm = node('bm', 'BrightnessMod', 'composite', {})
    const sc = node('sc', 'SolidColor', 'pattern', {})
    const edges = [
      edge('e1', 'btn', 'bm', 'pressed', 'brightness'),
      edge('e2', 'sc', 'bm', 'frame', 'frame'),
      edge('e3', 'bm', 'out', 'frame', 'frame'),
    ]
    const cpp = generateCpp([btn, bm, sc, outputNode], edges)
    const pinMode = cpp.indexOf('pinMode(7, INPUT_PULLUP);')
    expect(pinMode).toBeGreaterThan(cpp.indexOf('void setup()'))
    expect(pinMode).toBeLessThan(cpp.indexOf('void loop()'))
    expect(cpp).toContain('digitalRead(7) == LOW')

    const noPull = node('btn', 'ButtonInput', 'input', { pin: 7, pullup: false })
    expect(generateCpp([noPull, bm, sc, outputNode], edges)).toContain('pinMode(7, INPUT);')
  })

  it('emits setup() pinModes for all three EncoderInput pins, honouring pullup', () => {
    const enc = node('enc', 'EncoderInput', 'input', { pinA: 18, pinB: 19, pinSW: 21, pullup: true })
    const bm = node('bm', 'BrightnessMod', 'composite', {})
    const sc = node('sc', 'SolidColor', 'pattern', {})
    const edges = [
      edge('e1', 'enc', 'bm', 'position', 'brightness'),
      edge('e2', 'sc', 'bm', 'frame', 'frame'),
      edge('e3', 'bm', 'out', 'frame', 'frame'),
    ]
    const cpp = generateCpp([enc, bm, sc, outputNode], edges)
    const setupIdx = cpp.indexOf('void setup()')
    const loopIdx = cpp.indexOf('void loop()')
    for (const pin of [18, 19, 21]) {
      const pinMode = cpp.indexOf(`pinMode(${pin}, INPUT_PULLUP);`)
      expect(pinMode).toBeGreaterThan(setupIdx)
      expect(pinMode).toBeLessThan(loopIdx)
    }

    const noPull = node('enc', 'EncoderInput', 'input', { pinA: 18, pinB: 19, pinSW: 21, pullup: false })
    const cpp2 = generateCpp([noPull, bm, sc, outputNode], edges)
    for (const pin of [18, 19, 21]) expect(cpp2).toContain(`pinMode(${pin}, INPUT);`)
  })

  it('rounds and clamps out-of-range pins to a valid GPIO instead of emitting them literally', () => {
    // A fractional/negative/too-large pin must never reach generated C++ as-is
    // (the shared sanitizePin helper) — mirrors the same clamp MicInput's I2S
    // pins already had.
    const btn = node('btn', 'ButtonInput', 'input', { pin: -5.7 })
    expect(generateCpp([btn], [])).toContain('pinMode(0,')
    expect(generateCpp([btn], [])).not.toContain('-5.7')

    const pot = node('pot', 'PotInput', 'hardware', { pin: 9999 })
    expect(generateCpp([pot], [])).toContain('analogRead(255)')

    const enc = node('enc', 'EncoderInput', 'input', { pinA: 32.4, pinB: 33, pinSW: 25 })
    expect(generateCpp([enc], [])).toContain('pinMode(32,')

    const out = node('out', 'MatrixOutput', 'output', {
      dataPin: -9.2,
      clockPin: 500,
      chipset: 'APA102',
    })
    const outCpp = generateCpp([out], [])
    expect(outCpp).toContain('#define DATA_PIN 0')
    expect(outCpp).toContain('#define CLOCK_PIN 255')
  })

  it('emits the FASTLED_OVERCLOCK define before the FastLED include', () => {
    const out = node('out', 'MatrixOutput', 'output', { overclock: 1.25 })
    const cpp = generateCpp([out], [])
    const def = cpp.indexOf('#define FASTLED_OVERCLOCK 1.25')
    const inc = cpp.indexOf('#include <FastLED.h>')
    expect(def).toBeGreaterThanOrEqual(0)
    expect(def).toBeLessThan(inc)
  })

  it('gives SPI chipsets a clock pin and suppresses the overclock define', () => {
    const out = node('out', 'MatrixOutput', 'output', {
      chipset: 'APA102HD', colorOrder: 'BGR', clockPin: 12, overclock: 1.25,
    })
    const cpp = generateCpp([out], [])
    expect(cpp).toContain('#define CLOCK_PIN 12')
    expect(cpp).toContain('FastLED.addLeds<APA102HD, DATA_PIN, CLOCK_PIN, BGR>(leds, NUM_LEDS);')
    expect(cpp).not.toContain('FASTLED_OVERCLOCK')
  })

  it('maps SK6812-RGBW to SK6812 with an Rgbw mode', () => {
    const out = node('out', 'MatrixOutput', 'output', { chipset: 'SK6812-RGBW' })
    const cpp = generateCpp([out], [])
    expect(cpp).toContain('FastLED.addLeds<SK6812, DATA_PIN, GRB>(leds, NUM_LEDS).setRgbw(RgbwDefault());')
  })

  it('sanitises a garbage chipset/correction so C++ template args stay valid', () => {
    const out = node('out', 'MatrixOutput', 'output', {
      chipset: 'WS9999; system("rm")', correction: 'Bogus', brightness: 'loud',
    })
    const cpp = generateCpp([out], [])
    expect(cpp).toContain('FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);')
    expect(cpp).toContain('FastLED.setBrightness(200);')
    expect(cpp).not.toContain('setCorrection')
  })

  it('clamps a garbage width/height to a sane default (never emits NaN)', () => {
    const bad = node('out', 'MatrixOutput', 'output', { width: '1efdd6', height: -5, dataPin: 5 })
    const cpp = generateCpp([bad], [])
    expect(cpp).not.toContain('NaN')
    expect(cpp).toContain('#define WIDTH    16')  // garbage string → default
    expect(cpp).toContain('#define HEIGHT   1')   // -5 → clamped to min 1
  })

  it('emits fill_solid for SolidColor node', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const cpp = generateCpp([sc, outputNode], [edge('e1', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('fill_solid(buf_sc, NUM_LEDS, CRGB(255, 0, 0))')
  })

  it('BrightnessMod amplifies and saturates channels instead of clamping its multiplier', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 80, g: 100, b: 200 })
    const bm = node('bm', 'BrightnessMod', 'composite', { brightness: 2.5 })
    const cpp = generateCpp(
      [sc, bm, outputNode],
      [
        edge('e1', 'sc', 'bm', 'frame', 'frame'),
        edge('e2', 'bm', 'out', 'frame', 'frame'),
      ],
    )

    expect(cpp).toContain('float _br = fmaxf(0.0f, 2.5)')
    expect(cpp).toContain('fminf(255.0f, buf_bm[_i].r * _br)')
    expect(cpp).not.toContain('constrain(2.5, 0, 1)')
    expect(cpp).not.toContain('nscale8(_br)')
  })

  it('PerformanceGenerator has no frame port to wire into MatrixOutput', () => {
    // Music-sync shows only ever play back through the SD-card export
    // (`shows` → SDCard) or the in-browser preview — never a normal sketch's
    // frame path (see nodeLibrary.ts). It contributes no render buffer and no
    // loop body, but it is deliberately handled elsewhere rather than missing,
    // so the sketch says where instead of calling it unsupported.
    const generator = node('pg', 'PerformanceGenerator', 'show')
    const cpp = generateCpp([generator], [])
    expect(cpp).not.toContain('buf_pg')
    expect(cpp).toContain('// PerformanceGenerator —')
    expect(cpp).not.toContain('not yet supported')
  })

  it('TrebleSparks colours its sparks from the connected palette input', () => {
    const pal = node('c', 'PaletteSelector', 'color', { palette: 'ocean' })
    const sparks = node('ts', 'TrebleSparks', 'pattern', { treble: 1, density: 1 })
    const cpp = generateCpp(
      [pal, sparks, outputNode],
      [
        edge('e1', 'c', 'ts', 'palette', 'paletteIn'),
        edge('e2', 'ts', 'out', 'frame', 'frame'),
      ],
    )
    expect(cpp).toContain('CRGB _spark = blend(ColorFromPalette(paldef_ocean, random8()), CRGB::White')
    expect(cpp).toContain('fadeToBlackBy(buf_ts, NUM_LEDS')
  })

  it('includes float t when a time-dependent node is present', () => {
    const plasma = node('p', 'Plasma', 'pattern', { speed: 1 })
    const cpp = generateCpp([plasma, outputNode], [edge('e1', 'p', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float t = millis()')
  })

  it('normalizes a 0–1 speed slider onto the node’s internal rate', () => {
    const plasma = node('p', 'Plasma', 'pattern', { speed: 1 })
    const cpp = generateCpp([plasma, outputNode], [edge('e1', 'p', 'out', 'frame', 'frame')])
    // Plasma's slider max maps to an internal rate of 2 (was a raw 0–5 speed).
    expect(cpp).toContain('* 2.000f)')
  })

  it('emits a Boids flocking block with count-sized state and the wired colour', () => {
    const boids = node('bd', 'Boids', 'pattern', { count: 200, speed: 1, r: 10, g: 20, b: 30 })
    const cpp = generateCpp([boids, outputNode], [edge('e1', 'bd', 'out', 'frame', 'frame')])
    expect(cpp).toContain('// Boids (Reynolds flocking)')
    // count clamped to 80 ⇒ state arrays sized [80]; speed slider max ⇒ 0.700 rate.
    expect(cpp).toContain('_bx_bd[80]')
    expect(cpp).toContain('* 0.700f)')
    // Unwired colour falls back to the r/g/b props.
    expect(cpp).toContain('CRGB(10, 20, 30)')
  })

  it('emits CHSV per-boid colouring for the heading and spectrum colour modes', () => {
    const mk = (colorMode: string) =>
      generateCpp([node('bd', 'Boids', 'pattern', { colorMode, count: 10 }), outputNode], [edge('e1', 'bd', 'out', 'frame', 'frame')])
    expect(mk('heading')).toContain('atan2f(_diry,_dirx)')
    expect(mk('spectrum')).toContain('_i/(float)_count*255.0f')
    // Density colours by neighbour count — only this mode allocates the _nn array.
    expect(mk('density')).toContain('_bnn_bd[_i]/8.0f')
    expect(mk('density')).toContain('int _bnn_bd[80];')
    expect(mk('spectrum')).not.toContain('_bnn_bd[80]')
    // Position colours by matrix coordinate.
    expect(mk('position')).toContain('_bx_bd[_i]/WIDTH+_by_bd[_i]/HEIGHT')
    // Cycle is time-driven, so it pulls in the `t` clock; radial builds a
    // centre-distance ramp with pre-loop centre/max-radius constants.
    expect(mk('cycle')).toContain('t*0.1f*255.0f')
    expect(mk('cycle')).toContain('float t = millis()')
    expect(mk('radial')).toContain('float _bcx=WIDTH/2.0f,_bcy=HEIGHT/2.0f')
    expect(mk('radial')).toContain('/_bmr*255.0f')
    // Solid keeps the single base-colour path (no per-boid hue maths).
    expect(mk('solid')).toContain('_bc=_bc0')
    expect(mk('solid')).not.toContain('atan2f')
  })

  it('scales Noise speed per noiseType variant', () => {
    const worley = node('w', 'Noise', 'pattern', { noiseType: 'worley', speed: 1, scale: 1 })
    const simplex = node('s', 'Noise', 'pattern', { noiseType: 'simplex', speed: 1, scale: 1 })
    const noise4d = node('n4', 'Noise', 'pattern', { noiseType: 'noise4d', speed: 1, scale: 1 })
    expect(generateCpp([worley, outputNode], [edge('e', 'w', 'out', 'frame', 'frame')])).toContain('* 5.000f)')
    expect(generateCpp([simplex, outputNode], [edge('e', 's', 'out', 'frame', 'frame')])).toContain('* 3.000f)')
    expect(generateCpp([noise4d, outputNode], [edge('e', 'n4', 'out', 'frame', 'frame')])).toContain('* 2.000f)')
  })

  it('does not include float t for static graphs', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 100, g: 100, b: 100 })
    const cpp = generateCpp([sc, outputNode], [edge('e1', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('float t =')
  })

  it('emits mapFloat helper only when MapRange is present', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 0, g: 0, b: 0 })
    const withoutMapRange = generateCpp([sc, outputNode], [edge('e1', 'sc', 'out', 'frame', 'frame')])
    expect(withoutMapRange).not.toContain('mapFloat')

    const mr = node('mr', 'MapRange', 'math', { inMin: 0, inMax: 1, outMin: 0, outMax: 255 })
    const withMapRange = generateCpp([mr], [])
    expect(withMapRange).toContain('float mapFloat(')
  })

  it('emits wired MapRange output bounds', () => {
    const value = node('value', 'Math', 'math', { mathOp: 'add', a: 0.5, b: 0 })
    const lo = node('lo', 'Math', 'math', { mathOp: 'add', a: 10, b: 0 })
    const hi = node('hi', 'Math', 'math', { mathOp: 'add', a: 20, b: 0 })
    const mr = node('mr', 'MapRange', 'math', { inMin: 0, inMax: 1, outMin: 0, outMax: 1 })
    const cpp = generateCpp(
      [value, lo, hi, mr],
      [
        edge('e1', 'value', 'mr', 'result', 'value'),
        edge('e2', 'lo', 'mr', 'result', 'outMin'),
        edge('e3', 'hi', 'mr', 'result', 'outMax'),
      ])
    expect(cpp).toContain('mapFloat(n_value_result, 0, 1, n_lo_result, n_hi_result)')
  })

  it('emits Math result variable for the selected operation', () => {
    const add = node('a', 'Math', 'math', { mathOp: 'add', a: 1, b: 2 })
    const cpp = generateCpp([add], [])
    expect(cpp).toContain('n_a_result')
    expect(cpp).toContain('(1) + (2)')
    const mul = generateCpp([node('a', 'Math', 'math', { mathOp: 'multiply', a: 3, b: 4 })], [])
    expect(mul).toContain('(3) * (4)')
  })

  it('emits every Ease variant through its compatible FastLED primitive', () => {
    const expected = {
      inOutCubic: 'ease8InOutCubic(',
      inOutQuad: 'ease8InOutQuad(',
      inOutApprox: 'ease8InOutApprox(',
      inQuad: 'fl::easeInQuad8(',
      outQuad: 'fl::easeOutQuad8(',
      inCubic: 'fl::easeInCubic8(',
      outCubic: 'fl::easeOutCubic8(',
      inSine: 'fl::easeInSine8(',
      outSine: 'fl::easeOutSine8(',
      inOutSine: 'fl::easeInOutSine8(',
      triwave: 'triwave8(',
      quadwave: 'quadwave8(',
      cubicwave: 'cubicwave8(',
    }
    for (const [easeType, primitive] of Object.entries(expected)) {
      const ease = node('ease', 'Ease', 'math', { easeType, t: 0.5 })
      expect(generateCpp([ease], []), easeType).toContain(primitive)
    }

    const linear = generateCpp([node('ease', 'Ease', 'math', { easeType: 'linear', t: 0.5 })], [])
    expect(linear).toContain('float n_ease_result = (uint8_t)(constrain(0.5, 0.0f, 1.0f) * 255) / 255.0f;')
    expect(linear).not.toContain('fl::ease')

    const unknown = generateCpp([node('ease', 'Ease', 'math', { easeType: 'unknown', t: 0.5 })], [])
    expect(unknown).toContain('ease8InOutCubic(')
  })

  it('chains node output as input to downstream node', () => {
    const timeN = node('t1', 'TimeNode', 'math', {})
    const sin   = node('s1', 'Sin', 'math', {})
    const cpp = generateCpp(
      [timeN, sin],
      [edge('e1', 't1', 's1', 'time', 'x')]
    )
    expect(cpp).toContain('n_t1_time')
    expect(cpp).toContain('float n_t1_dt = 1.0f / 60.0f;')
    expect(cpp).toContain('n_s1_result')
  })

  it('emits CHSV node with 0–255 channel values', () => {
    const chsv = node('c', 'CHSV', 'math', { hue: 128, sat: 255, val: 200 })
    const cpp = generateCpp([chsv], [])
    expect(cpp).toContain('CHSV(')
    expect(cpp).toContain('128')
    expect(cpp).toContain('255')
    expect(cpp).toContain('200')
  })

  it('emits a time-based HueCycle color in cycles per second', () => {
    const hueCycle = node('hc', 'HueCycle', 'color', { rate: 0.25, s: 0.8, v: 0.7 })
    const solid = node('sc', 'SolidColor', 'pattern')
    const cpp = generateCpp(
      [hueCycle, solid, outputNode],
      [
        edge('e1', 'hc', 'sc', 'color', 'color'),
        edge('e2', 'sc', 'out', 'frame', 'frame'),
      ],
    )
    expect(cpp).toContain('float t = millis() / 1000.0f;')
    expect(cpp).toContain('fmodf(fmodf(t * (0.25), 1.0f) + 1.0f, 1.0f)')
    expect(cpp).toContain('n_hc_color = CHSV((uint8_t)(_huePhase * 256.0f)')
    expect(cpp).toContain('(0.8) * 255.0f')
    expect(cpp).toContain('(0.7) * 255.0f')
    expect(cpp).toContain('fill_solid(buf_sc, NUM_LEDS, n_hc_color);')
  })

  it('emits BeatSin node with bpm/low/high', () => {
    const bs = node('b', 'BeatSin', 'math', { bpm: 120, low: 0, high: 1 })
    const cpp = generateCpp([bs], [])
    expect(cpp).toContain('float n_b_value = 0.000f + ((sinf(((millis() / 1000.0f) * 120.000f / 60.0f) * 6.2831853f) + 1.0f) * 0.5f) * (1.000f - 0.000f);')
  })

  it('resolves matrix expressions before emitting scalar properties', () => {
    const bs = node('bx', 'BeatSin', 'math', { bpm: 80, low: 'center_y', high: 'num_leds / 8' })
    const random = node('rx', 'Random', 'signal', { min: 'max_x', max: 'w + h' })
    const sc = node('sc', 'SolidColor', 'pattern', {})
    const b1 = node('b1', 'BrightnessMod', 'composite', {})
    const b2 = node('b2', 'BrightnessMod', 'composite', {})
    const cpp = generateCpp([bs, random, sc, b1, b2, outputNode], [
      edge('e1', 'sc', 'b1', 'frame', 'frame'),
      edge('e2', 'b1', 'b2', 'frame', 'frame'),
      edge('e3', 'b2', 'out', 'frame', 'frame'),
      edge('e4', 'bx', 'b1', 'value', 'brightness'),
      edge('e5', 'rx', 'b2', 'value', 'brightness'),
    ])
    expect(cpp).toContain('* 80.000f / 60.0f')
    expect(cpp).toContain('3.500f')
    expect(cpp).toContain('(8.000f - 3.500f)')
    expect(cpp).toContain('float n_rx_value = 7.0f + (random16() / 65535.0f) * 9.0f;')
  })

  it('emits seeded Random with a per-instance 16-bit LCG draw', () => {
    const random = node('rs', 'Random', 'signal', { min: -1, max: 1, seed: 77 })
    const cpp = generateCpp([random], [])
    expect(cpp).toContain('static uint32_t _rng_rs = 77u')
    expect(cpp).toContain('(_rng_rs >> 16) & 0xFFFFu')
    expect(cpp).not.toContain('random16() / 65535.0f')
  })

  it('emits a millis()-based Clock with bpm/beatsPerBar/subdivision baked in', () => {
    const clk = node('clk', 'Clock', 'signal', { bpm: 128, beatsPerBar: 4, subdivision: 2 })
    const cpp = generateCpp([clk], [])
    expect(cpp).toContain('_clkOrigin_clk')
    expect(cpp).toContain('128.0f')
    expect(cpp).toContain('% 4u == 0u')
    expect(cpp).toContain('float n_clk_bpm')
    expect(cpp).toContain('float n_clk_phase')
    expect(cpp).toContain('bool n_clk_beat')
    expect(cpp).toContain('bool n_clk_bar')
    expect(cpp).toContain('bool n_clk_sub')
  })

  it('Clock reads tap/sync/reset from wired bool sources', () => {
    const tap = node('tapsrc', 'Compare', 'math', {})
    const clk = node('clk2', 'Clock', 'signal', { bpm: 100 })
    const cpp = generateCpp([tap, clk], [
      edge('e1', 'tapsrc', 'clk2', 'result', 'tap'),
    ])
    expect(cpp).toContain('n_tapsrc_result')
  })

  it('emits a sine Wave oscillator', () => {
    const w = node('w', 'Wave', 'math', { amplitude: 2, frequency: 0.5, phase: 0.25, waveform: 'sine' })
    const cpp = generateCpp([w], [])
    expect(cpp).toContain('_arg = ((0.5) * t + (0.25))')
    expect(cpp).toContain('sinf(6.2831853f * _arg)')
    expect(cpp).toContain('float t = millis()') // needs the time variable
  })

  it('emits each Wave waveform shape', () => {
    const shape = (waveform: string) =>
      generateCpp([node('w', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0, waveform })], [])
    expect(shape('square')).toContain('(_ph < 0.5f) ?')
    expect(shape('sawtooth')).toContain('2.0f * _ph - 1.0f')
    expect(shape('triangle')).toContain('4.0f * fabsf(_ph - 0.5f) - 1.0f')
  })

  it('emits ComplexWave combining two waves per operation', () => {
    // Two Wave nodes feed a ComplexWave; check the combine expression.
    const mk = (operation: string) => {
      const wa = node('wa', 'Wave', 'math', { amplitude: 1, frequency: 1, phase: 0, waveform: 'sine' })
      const wb = node('wb', 'Wave', 'math', { amplitude: 1, frequency: 2, phase: 0, waveform: 'sine' })
      const cw = node('cw', 'ComplexWave', 'math', { operation })
      return generateCpp([wa, wb, cw], [
        edge('e1', 'wa', 'cw', 'result', 'a'),
        edge('e2', 'wb', 'cw', 'result', 'b'),
      ])
    }
    expect(mk('add')).toContain('(n_wa_result) + (n_wb_result)')
    expect(mk('multiply')).toContain('(n_wa_result) * (n_wb_result)')
    expect(mk('average')).toContain('((n_wa_result) + (n_wb_result)) * 0.5f')
    expect(mk('max')).toContain('max((float)(n_wa_result), (float)(n_wb_result))')
  })

  it('emits NoiseField coloured through its palette', () => {
    const nf = node('nf', 'Noise', 'pattern', { noiseType: 'field', speed: 1, scale: 1, palette: 'ocean' })
    const cpp = generateCpp([nf, outputNode], [edge('e', 'nf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
    expect(cpp).not.toContain('CHSV((uint8_t)((_v')  // no longer hardcoded hue
  })

  it('emits blur2d with an XYMap (required since FastLED 3.10)', () => {
    const blur = node('bl', 'Blur2D', 'pattern', { amount: 0.5 })
    const cpp = generateCpp([blur], [])
    expect(cpp).toContain('blur2d(buf_bl, WIDTH, HEIGHT, (uint8_t)(constrain(0.5,0.0f,1.0f)*255.0f), _xyMap)')
    expect(cpp).toContain('fl::XYMap _xyMap = fl::XYMap::constructRectangularGrid(WIDTH, HEIGHT);')
  })

  it('omits the XYMap declaration when nothing blurs', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const cpp = generateCpp([sc, outputNode], [edge('e1', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('XYMap')
  })

  it('emits fadeToBlackBy for a Fade node', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const fd = node('fd', 'Fade', 'composite', { fade: 0.75 })
    const cpp = generateCpp([sc, fd, outputNode], [
      edge('e1', 'sc', 'fd', 'frame', 'frame'),
      edge('e2', 'fd', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('fadeToBlackBy(buf_fd, NUM_LEDS, _fa)')
    expect(cpp).toContain('constrain(0.75, 0, 1) * 255')   // 0.75 → 191
  })

  it('emits a Code node body verbatim into its buffer', () => {
    const code = 'leds[beatsin16(7, 0, NUM_LEDS - 1)] |= CHSV(0, 200, 255);'
    const cd = node('cd', 'Code', 'pattern', { code })
    const cpp = generateCpp([cd, outputNode], [edge('e', 'cd', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB* leds = buf_cd;')
    expect(cpp).toContain(code)   // pasted verbatim, no transpile
  })

  it('emits a Code node global section at file scope, loop body in loop()', () => {
    const cd = node('cd', 'Code', 'pattern', {
      globalCode: 'uint8_t gHue = 0;',
      code: 'leds[0] = CHSV(gHue, 255, 255);',
    })
    const cpp = generateCpp([cd, outputNode], [edge('e', 'cd', 'out', 'frame', 'frame')])
    // Global declaration lands above setup(), not inside the loop.
    expect(cpp).toContain('uint8_t gHue = 0;')
    expect(cpp.indexOf('uint8_t gHue = 0;')).toBeLessThan(cpp.indexOf('void setup()'))
    // Loop body is still emitted inside loop(), after setup().
    expect(cpp.indexOf('CRGB* leds = buf_cd;')).toBeGreaterThan(cpp.indexOf('void loop()'))
  })

  it('seeds a Code node buffer from a wired frame input', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 })
    const cd = node('cd', 'Code', 'pattern', { code: 'fadeToBlackBy(leds, NUM_LEDS, 40);' })
    const cpp = generateCpp([sc, cd, outputNode], [
      edge('e1', 'sc', 'cd', 'frame', 'frame'),
      edge('e2', 'cd', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('::memmove(buf_cd, buf_sc, sizeof(CRGB) * NUM_LEDS);')
  })

  it('emits a Transform that resamples from the source buffer per mode', () => {
    const mk = (transform: string, extra: Record<string, unknown> = {}) => {
      const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
      const tr = node('tr', 'Transform', 'composite', { transform, rate: 90, angle: 45, ...extra })
      return generateCpp([sc, tr, outputNode], [
        edge('e1', 'sc', 'tr', 'frame', 'frame'),
        edge('e2', 'tr', 'out', 'frame', 'frame'),
      ])
    }
    expect(mk('rotate')).toContain('_co=cos(_a)')
    expect(mk('rotate')).toContain('buf_sc[')               // gathers from the source buffer
    expect(mk('translate')).toContain('%WIDTH+WIDTH)%WIDTH') // toroidal wrap
    expect(mk('scale')).toContain('constrain(_s,0.05f,20.0f)')
  })

  it('emits a blank Transform when its frame input is unconnected', () => {
    const tr = node('tr', 'Transform', 'composite', { transform: 'rotate', rate: 90 })
    const cpp = generateCpp([tr, outputNode], [edge('e', 'tr', 'out', 'frame', 'frame')])
    expect(cpp).toContain('Transform: no input')
  })

  it('emits an Array loop that composites accumulating copies from the source', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const mk = (props: Record<string, unknown>) => {
      const arr = node('arr', 'Array', 'composite', props)
      return generateCpp([sc, arr, outputNode], [
        edge('e1', 'sc', 'arr', 'frame', 'frame'),
        edge('e2', 'arr', 'out', 'frame', 'frame'),
      ])
    }
    const add = mk({ count: 4, offsetX: 3, offsetY: 0, angle: 30, scale: 0.9, falloff: 0.7, blendMode: 'add' })
    expect(add).toContain('// Array x4')
    expect(add).toContain('for(int _i=3;_i>=0;_i--)')       // high→low paint order
    expect(add).toContain('_inv=1.0f/powf(max(0.05f, 0.9),_i)') // per-copy scale accumulation
    expect(add).toContain('_dim=powf(0.7,_i)')                  // per-copy falloff
    expect(add).toContain('buf_sc[_sy*WIDTH+_sx]')           // samples the source buffer
    expect(add).toContain('qadd8(_o.r,_r)')                  // add = saturating add
    expect(mk({ blendMode: 'lighten' })).toContain('max(_o.r,_r)')
    expect(mk({ blendMode: 'over' })).toContain('_cov=max(_r,max(_g,_b))/255.0f')
  })

  it('emits a blank Array when its frame input is unconnected', () => {
    const arr = node('arr', 'Array', 'composite', { count: 3 })
    const cpp = generateCpp([arr, outputNode], [edge('e', 'arr', 'out', 'frame', 'frame')])
    expect(cpp).toContain('Array: no input')
  })

  it('uses a runtime loop bound when count/angle are wired', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const cnt = node('cnt', 'Counter', 'signal', { rate: 1 })
    const ang = node('ang', 'TimeNode', 'signal', {})
    const arr = node('arr', 'Array', 'composite', { count: 5, angle: 0, blendMode: 'add' })
    const cpp = generateCpp([sc, cnt, ang, arr, outputNode], [
      edge('e1', 'sc', 'arr', 'frame', 'frame'),
      edge('e2', 'cnt', 'arr', 'value', 'count'),
      edge('e3', 'ang', 'arr', 'time', 'angle'),
      edge('e4', 'arr', 'out', 'frame', 'frame'),
    ])
    // Wired count → runtime bound clamped to [1,32]; wired angle → expression.
    expect(cpp).toContain('_cnt=_cnt<1?1:(_cnt>32?32:_cnt)')
    expect(cpp).toContain('for(int _i=_cnt-1;_i>=0;_i--)')
    expect(cpp).toContain('_a=n_ang_time*_i*0.01745329f')
    expect(cpp).not.toContain('// Array x')                  // count is dynamic now
  })

  it('remaps through XY() for a serpentine matrix', () => {
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, serpentine: true })
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('uint16_t XY(uint8_t x, uint8_t y)')
    expect(cpp).toContain('leds[XY(_x, _y)] = buf_sc[_y * WIDTH + _x]')
    expect(cpp).not.toContain('::memmove(leds,')
  })

  it('uses a straight memmove (no XY) for a progressive matrix', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, outputNode], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('XY(')
    // The terminal node renders into `leds` directly — no second buffer to copy.
    expect(cpp).toContain('CRGB* const buf_sc = leds;')
    expect(cpp).not.toContain('::memmove(leds, buf_sc,')
  })

  it('renders at 2× and downscales into leds when supersample is on', () => {
    const out = node('out', 'MatrixOutput', 'output', { width: 16, height: 16, supersample: true })
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    // Render buffers are the 2× resolution; the physical strip stays 16×16.
    expect(cpp).toContain('#define SS       2')
    expect(cpp).toContain('#define PANEL_W  16')
    expect(cpp).toContain('#define PANEL_LEDS (PANEL_W * PANEL_H)')
    expect(cpp).toContain('#define WIDTH    (PANEL_W * SS)')
    expect(cpp).toContain('CRGB leds[PANEL_LEDS];')
    expect(cpp).toContain('FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, PANEL_LEDS)')
    // Block-average downscale into the physical LED index.
    expect(cpp).toContain('CRGB _c = buf_sc[(_y * SS + _sy) * WIDTH + (_x * SS + _sx)];')
    expect(cpp).toContain('leds[_y * PANEL_W + _x] = CRGB(_r / (SS * SS), _g / (SS * SS), _b / (SS * SS));')
    expect(cpp).not.toContain('::memmove(leds,')
  })

  it('downscales through XY() when supersample and serpentine are both on', () => {
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, supersample: true, serpentine: true })
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('const uint16_t _xytable[64] PROGMEM')
    expect(cpp).toContain('uint16_t XY(uint8_t x, uint8_t y) { return pgm_read_word(&_xytable[(uint16_t)y * PANEL_W + x]); }')
    expect(cpp).toContain('leds[XY(_x, _y)] = CRGB(_r / (SS * SS), _g / (SS * SS), _b / (SS * SS));')
  })

  it('bakes a wiring table for a 2x2 panel layout', () => {
    const out = node('out', 'MatrixOutput', 'output', {
      width: 4, height: 4, layout: 'panels', tilesX: 2, tilesY: 2,
    })
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    // Each 2x2 tile is 4 LEDs; tile (0,0) covers rows 0-1 cols 0-1 -> indices 0-3
    // row-major within the tile, tile (1,0) is the next chain slot (indices 4-7).
    expect(cpp).toContain('const uint16_t _xytable[16] PROGMEM = { 0,1,4,5,2,3,6,7,8,9,12,13,10,11,14,15 };')
    expect(cpp).toContain('leds[XY(_x, _y)] = buf_sc[_y * WIDTH + _x]')
  })

  it('falls back to plain matrix wiring for an invalid custom XY map', () => {
    const out = node('out', 'MatrixOutput', 'output', { width: 4, height: 4, layout: 'custom', customXYMap: 'not json' })
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('XY(')
    // The terminal node renders into `leds` directly — no second buffer to copy.
    expect(cpp).toContain('CRGB* const buf_sc = leds;')
    expect(cpp).not.toContain('::memmove(leds, buf_sc,')
  })

  it('leaves output unchanged when supersample is off', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, outputNode], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('#define SS')
    expect(cpp).not.toContain('PANEL_')
    expect(cpp).toContain('#define NUM_LEDS (WIDTH * HEIGHT)')
    expect(cpp).toContain('CRGB leds[NUM_LEDS];')
  })

  it('emits Fire2012 heat simulation coloured through its palette', () => {
    const fire = node('f', 'Fire2012', 'pattern', { cooling: 55, sparking: 120, palette: 'heat' })
    const cpp = generateCpp([fire], [])
    expect(cpp).toContain('Fire2012')
    // Default 'heat' palette reproduces the classic HeatColors fire ramp.
    expect(cpp).toContain('ColorFromPalette(paldef_heat, _h)')
  })

  describe.each(['Fire', 'Fire2012'] as const)('%s extra controls', (type) => {
    it('direction picks which macro is the primary (flame-base) axis', () => {
      const up = generateCpp([node('f', type, 'pattern', { direction: 'up' })], [])
      expect(up).toContain('[HEIGHT][WIDTH]')
      const left = generateCpp([node('f', type, 'pattern', { direction: 'left' })], [])
      expect(left).toContain('[WIDTH][HEIGHT]')
      // 'left' bases at the right edge, mapping x = WIDTH-1-p.
      expect(left).toContain('WIDTH-1-(_p)')
    })

    it('turbulence widens the sideways diffusion window', () => {
      const narrow = generateCpp([node('f', type, 'pattern', { turbulence: 0 })], [])
      const wide = generateCpp([node('f', type, 'pattern', { turbulence: 2 })], [])
      expect(narrow).toContain('_ds=-0; _ds<=0')
      expect(wide).toContain('_ds=-2; _ds<=2')
    })

    it('paletteMix<1 blends the palette colour with heat-brightness grayscale', () => {
      const cpp = generateCpp([node('f', type, 'pattern', { paletteMix: 0.25 })], [])
      expect(cpp).toContain('_h*0.75f+_c.r*0.25f')
    })

    it('mirror folds the rendered buffer symmetric across its width', () => {
      const cpp = generateCpp([node('f', type, 'pattern', { mirror: true })], [])
      expect(cpp).toContain('WIDTH-1-_x')
    })

    it('a nonzero seed emits a per-instance LCG instead of random8()', () => {
      const seeded = generateCpp([node('f', type, 'pattern', { seed: 7 })], [])
      expect(seeded).toContain('_fireLcg_f = 7u')
      expect(seeded).not.toContain('random8()/255.0f')
      const unseeded = generateCpp([node('f', type, 'pattern', {})], [])
      expect(unseeded).not.toContain('_fireLcg_f')
      expect(unseeded).toContain('random8()/255.0f')
    })
  })

  it('emits deterministic seed hooks for seeded stochastic nodes', () => {
    const particles = generateCpp([node('p', 'Particles', 'pattern', { seed: 321 })], [])
    expect(particles).toContain('random16_set_seed(321u)')

    const noiseCpp = generateCpp([node('n', 'Noise', 'pattern', { noiseType: 'simplex', seed: 9 })], [])
    expect(noiseCpp).toContain('float _spd=')
    expect(noiseCpp).toContain('(t+0.117f)')

    const confetti = generateCpp([node('c', 'Confetti', 'pattern', { seed: 17 })], [])
    expect(confetti).toContain('static uint32_t _rng_c=17u')
    expect(confetti).not.toContain('random16(NUM_LEDS)')
  })

  it('emits a Shape polygon with a fractional-sides morph blend and AA composite', () => {
    const shape = node('sh', 'Shape', 'pattern', {
      shape: 'polygon', cx: 0.5, cy: 0.5, size: 6, sides: 5, rotation: 30,
      thickness: 1.5, filled: true, fill: '#ff0080', edge: '#00e0ff',
    })
    const cpp = generateCpp([shape, outputNode], [edge('e1', 'sh', 'out', 'frame', 'frame')])
    expect(cpp).toContain('int _nlo=(int)floorf(_n); float _fr=_n-_nlo')  // fractional morph
    expect(cpp).toContain('atan2f(_ly,_lx)')                              // polygon SDF
    expect(cpp).toContain('CRGB _fill=CRGB(255, 0, 128)')                 // fill hex → CRGB
    expect(cpp).toContain('CRGB(0, 224, 255)')                           // edge hex → CRGB
    expect(cpp).toContain('nblend(buf_sh[_y*WIDTH+_x],_col,')             // over-composite
    expect((cpp.match(/\{/g) ?? []).length).toBe((cpp.match(/\}/g) ?? []).length) // balanced braces
  })

  it('emits a Shape rect/ellipse without the polygon branch', () => {
    const rectShape = node('sh', 'Shape', 'pattern', { shape: 'rect', cx: 0.5, cy: 0.5, size: 4, aspect: 2, filled: true, thickness: 0 })
    const rectCpp = generateCpp([rectShape, outputNode], [edge('e1', 'sh', 'out', 'frame', 'frame')])
    expect(rectCpp).toContain('float _ax=_size*_aspect,_ay=_size;')
    expect(rectCpp).toContain('fabsf(_lx)-_ax')
    expect(rectCpp).not.toContain('atan2f')          // no polygon math
    const ell = node('sh', 'Shape', 'pattern', { shape: 'ellipse', cx: 0.5, cy: 0.5, size: 4, aspect: 1 })
    const ellCpp = generateCpp([ell, outputNode], [edge('e1', 'sh', 'out', 'frame', 'frame')])
    expect(ellCpp).toContain('sqrtf(_ex*_ex+_ey*_ey)')
  })

  it('emits wrapped Shape copies when wrap is enabled', () => {
    const shape = node('sh', 'Shape', 'pattern', { shape: 'rect', cx: 0.25, cy: 0.5, size: 2, aspect: 1, wrap: true, filled: true })
    const cpp = generateCpp([shape, outputNode], [edge('e1', 'sh', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _cxv=0.25,_cyv=0.5;')
    expect(cpp).toContain('float _cx=_cxv>1.0f?_cxv:(WIDTH*0.5f-WIDTH)+_cxv*(WIDTH*2.0f),_cy=_cyv>1.0f?_cyv:(HEIGHT*0.5f-HEIGHT)+_cyv*(HEIGHT*2.0f);')
    expect(cpp).toContain('float _wrapX[3]={-(float)WIDTH,0.0f,(float)WIDTH};')
    expect(cpp).toContain('float _wcx=_cx+_wrapX[_wx],_wcy=_cy+_wrapY[_wy];')
    expect((cpp.match(/\{/g) ?? []).length).toBe((cpp.match(/\}/g) ?? []).length) // balanced braces
  })

  it('emits Shape pixel-space center compatibility', () => {
    const shape = node('sh', 'Shape', 'pattern', { shape: 'rect', cx: 4, cy: 4, size: 2, aspect: 1 })
    const cpp = generateCpp([shape, outputNode], [edge('e1', 'sh', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _cxv=4,_cyv=4;')
    expect(cpp).toContain('float _cx=_cxv>1.0f?_cxv:(0.5f-_mx)+_cxv*((WIDTH-1.0f)+2.0f*_mx),_cy=_cyv>1.0f?_cyv:(0.5f-_my)+_cyv*((HEIGHT-1.0f)+2.0f*_my);')
  })

  it('Shape count/sides can be driven by a wired signal', () => {
    const shape = node('sh', 'Shape', 'pattern', { shape: 'polygon', sides: 5 })
    const time = node('tm', 'TimeNode', 'signal', {})
    const cpp = generateCpp([time, shape, outputNode], [
      edge('e1', 'tm', 'sh', 'time', 'sides'),
      edge('e2', 'sh', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('max(3.0f,(float)(n_tm_time))')   // wired sides expression
  })

  it('maps a Simplex2D palette property to its FastLED constant', () => {
    const sx = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'lava' })
    const cpp = generateCpp([sx, outputNode], [edge('e1', 'sx', 'out', 'frame', 'frame')])
    expect(cpp).toContain('ColorFromPalette(paldef_lava')
  })

  it('emits custom named palettes for generated firmware', () => {
    const sx = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'synthwave' })
    const cpp = generateCpp([sx, outputNode], [edge('e1', 'sx', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGBPalette16 paldef_synthwave(')
    expect(cpp).toContain('ColorFromPalette(paldef_synthwave')
  })

  it('resolves a connected PaletteSelector into the consuming node', () => {
    const sel = node('sel', 'PaletteSelector', 'color', { palette: 'ocean' })
    const sx  = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'rainbow' })
    const cpp = generateCpp([sel, sx, outputNode], [
      edge('e1', 'sel', 'sx', 'palette', 'paletteIn'),
      edge('e2', 'sx', 'out', 'frame', 'frame'),
    ])
    // The connected selector's palette wins over the node's own property.
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
    expect(cpp).not.toContain('ColorFromPalette(paldef_rainbow')
  })

  it('resolves a connected PaletteBlend to its base palette A', () => {
    const blend = node('bl', 'PaletteBlend', 'color', { paletteA: 'forest', paletteB: 'party', amount: 0.5 })
    const samp  = node('s', 'PaletteSampler', 'color', { t: 0.5 })
    const cpp = generateCpp([blend, samp], [edge('e1', 'bl', 's', 'palette', 'paletteIn')])
    expect(cpp).toContain('ColorFromPalette(paldef_forest')
  })

  it('generates a self-contained eased palette sweep', () => {
    const sweep = node('ps', 'PaletteSweep', 'color', { palette: 'ocean', rate: 0.5, easing: 'cubic' })
    const solid = node('solid', 'SolidColor', 'pattern')
    const cpp = generateCpp([sweep, solid, outputNode], [
      edge('e1', 'ps', 'solid', 'color', 'color'),
      edge('e2', 'solid', 'out', 'frame', 'frame'),
    ])

    expect(cpp).toContain('fmodf(t * fmaxf(0.0f, (0.5')
    expect(cpp).toContain('powf(-2.0f * _psPos_ps + 2.0f, 3.0f)')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
  })

  it('inlines a group’s pattern code into the sketch', () => {
    const groups = {
      blue: {
        nodes: [
          node('sc', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'sc', 'go', 'frame', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'composite', { groupId: 'blue' })
    const cpp = generateCpp([grp, outputNode], [edge('e1', 'g1', 'out', 'frame', 'frame')], groups)
    expect(cpp).toContain('fill_solid(buf_g1__sc, NUM_LEDS, CRGB(0, 0, 255))')
  })

  it('flattens nested groups', () => {
    const groups = {
      inner: {
        nodes: [
          node('sc', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'sc', 'go', 'frame', 'frame')],
      },
      outer: {
        nodes: [
          node('ig', 'Group', 'composite', { groupId: 'inner' }),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [edge('e', 'ig', 'go', 'frame', 'frame')],
      },
    }
    const grp = node('g1', 'Group', 'composite', { groupId: 'outer' })
    const cpp = generateCpp([grp, outputNode], [edge('e1', 'g1', 'out', 'frame', 'frame')], groups)
    expect(cpp).toContain('fill_solid(buf_g1__ig__sc, NUM_LEDS, CRGB(0, 255, 0))')
  })

  it('emits a time-based Sequencer over its input buffers', () => {
    const a = node('a', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const b = node('b', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const seq = node('s', 'Sequencer', 'composite', { interval: 4, fade: 1 })
    const cpp = generateCpp([a, b, seq, outputNode], [
      edge('e1', 'a', 's', 'frame', 'p0'),
      edge('e2', 'b', 's', 'frame', 'p1'),
      edge('e3', 's', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('static CRGB* const _seq_s[] = { buf_a, buf_b };')
    expect(cpp).toContain('::memmove(buf_s, _seq_s[_idx], sizeof(CRGB) * NUM_LEDS)')
    expect(cpp).toContain('nblend(buf_s, _seq_s[(_idx + 1) % 2], NUM_LEDS, _m)')
    expect(cpp).toContain('float t = millis()')
  })

  it('a single-input Sequencer just copies that buffer', () => {
    const a = node('a', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const seq = node('s', 'Sequencer', 'composite', {})
    const cpp = generateCpp([a, seq, outputNode], [
      edge('e1', 'a', 's', 'frame', 'p0'),
      edge('e2', 's', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('::memmove(buf_s, buf_a, sizeof(CRGB) * NUM_LEDS)')
  })

  it('wires an exposed group parameter to its internal consumer', () => {
    const groups = {
      dim: {
        nodes: [
          node('gi', 'GroupInput', 'composite', { paramId: 'p' }),
          node('white', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 }),
          node('bm', 'BrightnessMod', 'composite', {}),
          node('go', 'GroupOutput', 'output', {}),
        ],
        edges: [
          edge('e1', 'gi', 'bm', 'out', 'brightness'),
          edge('e2', 'white', 'bm', 'frame', 'frame'),
          edge('e3', 'bm', 'go', 'frame', 'frame'),
        ],
      },
    }
    const pot = node('pot', 'PotInput', 'hardware', { pin: 34 })
    const grp = node('g1', 'Group', 'composite', { groupId: 'dim' })
    ;(grp.data as unknown as { inputs: unknown[] }).inputs = [{ id: 'p', label: 'p', dataType: 'float' }]
    const cpp = generateCpp([pot, grp, outputNode], [
      edge('e1', 'pot', 'g1', 'value', 'p'),
      edge('e2', 'g1', 'out', 'frame', 'frame'),
    ], groups)
    // The PotInput value reaches the group's BrightnessMod through the param.
    expect(cpp).toContain('n_pot_value')
  })

  it('emits a blended CRGBPalette16 for PaletteBlend', () => {
    const pb = node('pb', 'PaletteBlend', 'color', { paletteA: 'heat', paletteB: 'ocean', amount: 0.5 })
    const sx = node('sx', 'Noise', 'pattern', { noiseType: 'simplex' })
    const cpp = generateCpp([pb, sx, outputNode], [
      edge('e1', 'pb', 'sx', 'palette', 'paletteIn'),
      edge('e2', 'sx', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGBPalette16 pal_pb;')
    expect(cpp).toContain('blend(ColorFromPalette(paldef_heat, _p), ColorFromPalette(paldef_ocean, _p), _amt)')
    expect(cpp).toContain('ColorFromPalette(pal_pb,')
  })

  it('builds a CRGBPalette16 from a CustomPalette and uses it downstream', () => {
    const c1 = node('c1', 'CHSV', 'color', { hue: 0, sat: 255, val: 255 })
    const c2 = node('c2', 'CHSV', 'color', { hue: 120, sat: 255, val: 255 })
    const cp = node('cp', 'CustomPalette', 'color', {})
    const sx = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'rainbow' })
    const cpp = generateCpp([c1, c2, cp, sx, outputNode], [
      edge('e1', 'c1', 'cp', 'rgb', 'color0'),
      edge('e2', 'c2', 'cp', 'rgb', 'color1'),
      edge('e3', 'cp', 'sx', 'palette', 'paletteIn'),
      edge('e4', 'sx', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toMatch(/CRGBPalette16 pal_cp\((?:[^;]*, ){15}[^;]*\);/)
    expect(cpp).toContain('blend(n_c1_rgb, n_c2_rgb')
    expect(cpp).toContain('ColorFromPalette(pal_cp,')
  })

  it('bakes positioned CustomPalette stops into the generated palette', () => {
    const cp = node('cp', 'CustomPalette', 'color', {
      colors: ['#000000', '#ffffff', '#ff0000'],
      positions: [0, 0.25, 1],
    })
    const sx = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'rainbow' })
    const cpp = generateCpp([cp, sx, outputNode], [
      edge('e1', 'cp', 'sx', 'palette', 'paletteIn'),
      edge('e2', 'sx', 'out', 'frame', 'frame'),
    ])

    expect(cpp).toContain('CRGBPalette16 pal_cp(CRGB(0,0,0)')
    expect(cpp).toContain('CRGB(68,68,68)')
    expect(cpp).toContain('CRGB(255,0,0))')
  })

  it('bakes an uploaded Image dominant colours into a reusable palette', () => {
    const image = {
      w: 4,
      h: 1,
      pixels: [255, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 255],
    }
    const img = node('img', 'Image', 'pattern', { image })
    const extract = node('extract', 'PaletteFromImage', 'color', { count: 2 })
    const noise = node('noise', 'Noise', 'pattern', { noiseType: 'simplex' })
    const cpp = generateCpp([img, extract, noise, outputNode], [
      edge('e1', 'img', 'extract', 'image', 'image'),
      edge('e2', 'extract', 'noise', 'palette', 'paletteIn'),
      edge('e3', 'noise', 'out', 'frame', 'frame'),
    ])

    expect(cpp).toContain('const CRGBPalette16 pal_extract(CRGB(0,0,255)')
    expect(cpp).toContain('CRGB(255,0,0));')
    expect(cpp).toContain('ColorFromPalette(pal_extract,')
  })

  it('bakes a poline palette into a CRGBPalette16 used downstream', () => {
    const pl = node('pl', 'Poline', 'color', { anchorA: '#ff0000', anchorB: '#0000ff', anchorC: '#00ff00', points: 4, position: 'sinusoidal' })
    const sx = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'rainbow' })
    const cpp = generateCpp([pl, sx, outputNode], [
      edge('e1', 'pl', 'sx', 'palette', 'paletteIn'),
      edge('e2', 'sx', 'out', 'frame', 'frame'),
    ])
    // 16 baked CRGB stops across the configured anchors.
    expect(cpp).toContain('CRGBPalette16 pal_pl(CRGB(255,0,0)')
    expect(cpp).toMatch(/CRGBPalette16 pal_pl\((CRGB\(\d+,\d+,\d+\), ){15}CRGB\(\d+,\d+,\d+\)\);/)
    expect(cpp).toContain('ColorFromPalette(pal_pl,')
  })

  it('emits a Game of Life simulation with millis-based stepping', () => {
    const gol = node('g', 'GameOfLife', 'pattern', { speed: 8, fade: 0.75, palette: 'mojito' })
    const cpp = generateCpp([gol, outputNode], [edge('e', 'g', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static uint8_t _gc_g[NUM_LEDS], _gn_g[NUM_LEDS]')
    expect(cpp).toContain('millis() - _gt_g')
    expect(cpp).toContain('ColorFromPalette(paldef_mojito,(uint8_t)(_gb_g[_i]*255))')
    expect(cpp).toContain('_gb_g[_i]=_gc_g[_i]?1.0f:_gb_g[_i]*0.75')
  })

  it('emits a Gray-Scott reaction-diffusion simulation', () => {
    const rd = node('rd', 'ReactionDiffusion', 'pattern', { feed: 0.055, kill: 0.062, speed: 8, palette: 'ocean' })
    const cpp = generateCpp([rd, outputNode], [edge('e', 'rd', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static float _u_rd[NUM_LEDS]')
    expect(cpp).toContain('::memcpy(_u_rd,_un_rd,sizeof(_u_rd))')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
  })

  it('emits a Blobs metaball field', () => {
    const b = node('b', 'Blobs', 'pattern', { speed: 0.6, scale: 0.22, count: 3, palette: 'lava' })
    const cpp = generateCpp([b, outputNode], [edge('e', 'b', 'out', 'frame', 'frame')])
    expect(cpp).toContain('int _count=max(1,min(6,(int)floorf(3)))')
    expect(cpp).toContain('float _bx[6], _by[6]')
    expect(cpp).toContain('_f/(_f+1.0f)')
    expect(cpp).toContain('ColorFromPalette(paldef_lava')
  })

  it('emits a stateful FlowField with particle buffers', () => {
    const ff = node('ff', 'FlowField', 'pattern', { speed: 1, scale: 0.08, count: 50, fade: 0.9, palette: 'ocean' })
    const cpp = generateCpp([ff, outputNode], [edge('e', 'ff', 'out', 'frame', 'frame')])
    expect(cpp).toContain('const int _count=max(8,min(400,(int)floorf(50)))')
    expect(cpp).toContain('static float _fpx_ff[400], _fpy_ff[400], _ftr_ff[NUM_LEDS]')
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('_ftr_ff[_i]*=0.9')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
  })

  it('emits a stateful Starfield with star buffers and projection', () => {
    const sf = node('sf', 'Starfield', 'pattern', { speed: 2, count: 80, r: 255, g: 255, b: 255 })
    const cpp = generateCpp([sf, outputNode], [edge('e', 'sf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('const int _count=max(8,min(300,(int)floorf(80)))')
    expect(cpp).toContain('static float _sfx_sf[300], _sfy_sf[300], _sfz_sf[300]')
    expect(cpp).toContain('fill_solid(buf_sf, NUM_LEDS, CRGB::Black)')
    expect(cpp).toContain('.nscale8(')
  })

  // Each `paldef_*` is a non-const 48-byte global, so declaring all 29
  // unconditionally cost 1,392 bytes of RAM — over half an Uno's SRAM — on
  // sketches that reference none of them.
  describe('palette declarations', () => {
    it('declares no palettes when the graph names none', () => {
      const sc = node('sc', 'SolidColor', 'pattern', { r: 200, g: 40, b: 90 })
      const cpp = generateCpp([sc, outputNode], [edge('e', 'sc', 'out', 'frame', 'frame')])
      expect(cpp).not.toContain('CRGBPalette16 paldef_')
    })

    it('declares only the palettes the graph actually names', () => {
      const pf = node('pf', 'Noise', 'pattern', { noiseType: 'plasma', palette: 'ocean' })
      const cpp = generateCpp([pf, outputNode], [edge('e', 'pf', 'out', 'frame', 'frame')])
      expect(cpp).toContain('CRGBPalette16 paldef_ocean(')
      expect(cpp).not.toContain('CRGBPalette16 paldef_rainbow(')
      expect(cpp).not.toContain('CRGBPalette16 paldef_lava(')
      expect((cpp.match(/CRGBPalette16 paldef_/g) ?? []).length).toBe(1)
    })

    it('declares each named palette once across several consumers', () => {
      const a = node('a', 'Noise', 'pattern', { noiseType: 'plasma', palette: 'ocean' })
      const b = node('b', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'ocean' })
      const c = node('c', 'Noise', 'pattern', { noiseType: 'worley', palette: 'lava' })
      const cpp = generateCpp(
        [a, b, c, outputNode],
        [edge('e1', 'a', 'out', 'frame', 'frame'), edge('e2', 'b', 'out', 'frame', 'frame'), edge('e3', 'c', 'out', 'frame', 'frame')],
      )
      expect((cpp.match(/CRGBPalette16 paldef_ocean\(/g) ?? []).length).toBe(1)
      expect((cpp.match(/CRGBPalette16 paldef_lava\(/g) ?? []).length).toBe(1)
      expect((cpp.match(/CRGBPalette16 paldef_/g) ?? []).length).toBe(2)
    })

    it('falls back to rainbow for an unknown palette name, and declares it', () => {
      const pf = node('pf', 'Noise', 'pattern', { noiseType: 'plasma', palette: 'not-a-palette' })
      const cpp = generateCpp([pf, outputNode], [edge('e', 'pf', 'out', 'frame', 'frame')])
      expect(cpp).toContain('CRGBPalette16 paldef_rainbow(')
      expect(cpp).toContain('ColorFromPalette(paldef_rainbow')
    })
  })

  it('emits a PlasmaFractal with sin sums and inoise8 octaves', () => {
    const pf = node('pf', 'Noise', 'pattern', { noiseType: 'plasma', speed: 1, scale: 0.15, palette: 'rainbow' })
    const cpp = generateCpp([pf, outputNode], [edge('e', 'pf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('ColorFromPalette(paldef_rainbow')
    expect(cpp).toContain('float t = millis()')
  })

  it('emits an AudioFlow with flow advection scaled by bass brightness', () => {
    const af = node('af', 'AudioFlow', 'pattern', { speed: 0.5, scale: 0.5, palette: 'party', bass: 0.5, mids: 0.5, treble: 0.3 })
    const cpp = generateCpp([af, outputNode], [edge('e', 'af', 'out', 'frame', 'frame')])
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('ColorFromPalette(paldef_party')
    expect(cpp).toContain('.nscale8(_bright)')
    expect(cpp).toContain('sqrtf(constrain(_b,0.0f,1.0f))*0.75f')
    expect(cpp).toContain('constrain((')
    expect(cpp).toContain('* 0.200f')
  })

  it('emits ColorTrails as persistent two-pass subpixel advection with beat bloom', () => {
    const beat = node('ctbeat', 'Compare', 'math', { a: 1, b: 0.5 })
    const ct = node('ct', 'ColorTrails', 'pattern', {
      bass: 0.4, mids: 0.3, treble: 0.2,
      xSpeed: 0.1, xAmplitude: 1, xFrequency: 0.33,
      ySpeed: 0.1, yAmplitude: 1, yFrequency: 0.32,
      displacement: 1.8, endpointSpeed: 0.35, colorSpeed: 0.1,
      persistence: 0.99922, palette: 'rainbow', seed: 42,
    })
    const cpp = generateCpp([beat, ct, outputNode], [
      edge('ct-eb', 'ctbeat', 'ct', 'result', 'beat'),
      edge('ct-eo', 'ct', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB buf_cttmp_ct[NUM_LEDS];')
    expect(cpp).toContain('ColorTrails: Moving Line injection + two-pass subpixel feedback advection')
    expect(cpp).toContain('Adapted from prototype work by Stefan Petrick, creator of AnimARTrix')
    expect(cpp).toContain('https://github.com/StefanPetrick/animartrix')
    expect(cpp).toContain('0x7feb352dU')
    expect(cpp).toContain('_xf*_xf*_xf*(_xf*(_xf*6.0f-15.0f)+10.0f)')
    expect(cpp).toContain('ColorFromPalette(paldef_rainbow')
    expect(cpp).toContain('_ctBeatPulse_ct=(n_ctbeat_result)?1.0f')
    expect(cpp.match(/float _shift=constrain\(_profile\*_ctDisp,-1\.0f,1\.0f\)/g)).toHaveLength(2)
    expect(cpp).toContain('fmodf(_x-_shift,(float)WIDTH)')
    expect(cpp).toContain('fmodf(_y-_shift,(float)HEIGHT)')
    expect(cpp).toContain('powf(constrain((float)(0.99922),0.0f,0.99999f),_ctDtf)')
  })

  it('emits the ColorTrails liquid frame with morphing 2D Perlin flow', () => {
    const ct = node('liquid', 'ColorTrails', 'pattern', {
      injectionMode: 'Rainbow Border', flowMode: 'Morphing 2D',
      xSpeed: 0.1, xAmplitude: 1, xFrequency: 0.33,
      ySpeed: 0.1, yAmplitude: 1, yFrequency: 0.32,
      displacement: 1.8, persistence: 0.99922, palette: 'rainbow', seed: 42,
    })
    const cpp = generateCpp([ct, outputNode], [edge('liquid-out', 'liquid', 'out', 'frame', 'frame')])
    expect(cpp).toContain('ColorTrails: Rainbow Border injection')
    expect(cpp).toContain('auto _ctNoise2=')
    expect(cpp).toContain('_ctNoise2(_y*0.23f*')
    expect(cpp).toContain('2*WIDTH+2*HEIGHT-4')
    expect(cpp).toContain('_ctBlend(_x,0,_ctColor(')
    expect(cpp).not.toContain('float _x1=_cx')
    expect(cpp.match(/float _shift=constrain\(_profile\*_ctDisp,-1\.0f,1\.0f\)/g)).toHaveLength(2)
  })

  it('emits a credited audio-reactive AnimARTrix renderer with structural percussion', () => {
    const ax = node('ax', 'Animartrix', 'pattern', {
      effect: 'Complex Kaleido', speed: 0.72, audioAmount: 1.25,
      bass: 0.3, mids: 0.4, treble: 0.5, kick: 0.6, snare: 0.7, hihat: 0.8,
    })
    const cpp = generateCpp([ax, outputNode], [edge('ax-out', 'ax', 'out', 'frame', 'frame')])
    expect(cpp).toContain('AnimARTrix Complex Kaleido — Stefan Petrick')
    expect(cpp).toContain('CC BY-NC-SA 4.0')
    expect(cpp).toContain('https://github.com/StefanPetrick/animartrix')
    expect(cpp).toContain('_ax_axSnare')
    expect(cpp).toContain('acosf(cosf(_th*_sym))')
    expect(cpp).toContain('CRGB* const buf_ax = leds;')
  })

  it('emits MidrangeWaves through a FastLED palette with energy-controlled reactivity', () => {
    const mw = node('mw', 'MidrangeWaves', 'pattern', { energy: 1.4, speed: 1, palette: 'ocean', mids: 0.5 })
    const cpp = generateCpp([mw, outputNode], [edge('e', 'mw', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _m =')
    expect(cpp).toContain('float _strength = min(1.0f, max(0.0f, _intensity));')
    expect(cpp).toContain('float _motion = _spd * (1.0f + _mAmt * 1.5f * _strength);')
    expect(cpp).toContain('float _contrast = 0.7f + _mAmt * 1.8f * _strength;')
    expect(cpp).toContain('powf(_mAmt, 0.65f) * 1.25f * _strength')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
    expect(cpp).toContain('.nscale8((uint8_t)(_v * 255))')
  })

  it('emits BassRings as a radial sine pattern with bass-scaled density and brightness', () => {
    const br = node('br', 'BassRings', 'pattern', { bass: 0.6, energy: 0.75, speed: 1.25, palette: 'lava' })
    const cpp = generateCpp([br, outputNode], [edge('e', 'br', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _strength = min(1.0f, max(0.0f,')
    expect(cpp).toContain('float _spd = min(1.0f, max(0.0f,')
    expect(cpp).toContain('float _motion = _spd * (0.75f + _b * 1.75f * _strength);')
    expect(cpp).toContain('float _rings = 4.0f + _b * 8.0f * _strength;')
    expect(cpp).toContain('sinf(_dist * _rings * 6.2831853f - _phase)')
    expect(cpp).toContain('powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f)')
    expect(cpp).toContain('ColorFromPalette(paldef_lava, (uint8_t)(_dist * 255))')
  })

  it('emits MidrangeBloom through a palette with radial bloom modulation', () => {
    const mb = node('mb', 'MidrangeBloom', 'pattern', { mids: 0.7, energy: 0.8, speed: 0.6, palette: 'party' })
    const cpp = generateCpp([mb, outputNode], [edge('e', 'mb', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);')
    expect(cpp).toContain('float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f)')
    expect(cpp).toContain('float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f')
    expect(cpp).toContain('ColorFromPalette(paldef_party')
    expect(cpp).toContain('.nscale8((uint8_t)(_v * 255))')
  })

  it('emits TreblePrism as sharp diagonal treble-reactive shards', () => {
    const tp = node('tp', 'TreblePrism', 'pattern', { treble: 0.85, energy: 0.9, speed: 0.7, palette: 'amethyst' })
    const cpp = generateCpp([tp, outputNode], [edge('e', 'tp', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _motion = _spd * (1.2f + _t * 3.2f * _strength);')
    expect(cpp).toContain('float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);')
    expect(cpp).toContain('powf(_prism, 3.6f)')
    expect(cpp).toContain('powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f)')
    expect(cpp).toContain('ColorFromPalette(paldef_amethyst, (uint8_t)(_pt * 255))')
  })

  it('emits AudioCascade as a full-spectrum palette pattern with ribbons and shimmer', () => {
    const ac = node('ac', 'AudioCascade', 'pattern', { bass: 0.8, mids: 0.7, treble: 0.9, energy: 0.85, speed: 0.75, palette: 'rainbow' })
    const cpp = generateCpp([ac, outputNode], [edge('e', 'ac', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);')
    expect(cpp).toContain('float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));')
    expect(cpp).toContain('float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);')
    expect(cpp).toContain('ColorFromPalette(paldef_rainbow')
    expect(cpp).toContain('.nscale8((uint8_t)(_v * 255));')
  })

  it('emits Gabor noise with its Gaussian-cosine kernel and hash helper', () => {
    const g = node('g', 'GaborNoise', 'pattern', { speed: 0.5, scale: 0.35, frequency: 1.2, orientation: 45, palette: 'ocean' })
    const cpp = generateCpp([g, outputNode], [edge('e', 'g', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _worleyHash(int x, int y)')
    expect(cpp).toContain('expf(')
    expect(cpp).toContain('cosf(')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
  })

  it('emits an angled palette gradient with projection normalisation', () => {
    const g = node('g', 'PaletteGradient', 'pattern', { angle: 45, repeat: 2, speed: 0, palette: 'rainbow' })
    const cpp = generateCpp([g, outputNode], [edge('e', 'g', 'out', 'frame', 'frame')])
    expect(cpp).toContain('45*0.01745329f')
    expect(cpp).toContain('_pmax-_pmin')
    expect(cpp).toContain('ColorFromPalette(paldef_rainbow')
    expect(cpp).toContain('_tn*2+t*')
  })

  it('declares CustomFormula A/B inputs before using them', () => {
    const formula = node('cf', 'CustomFormula', 'pattern', { formula: 'sin(r + a + b + t)', a: 0.2, b: 0.4 })
    const cpp = generateCpp([formula, outputNode], [edge('e', 'cf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float a=0.2, b=0.4;')
    expect(cpp.indexOf('float a=')).toBeLessThan(cpp.indexOf('float _v=sin(r + a + b + t)'))
  })

  // A formula string travels inside a shared graph, so codegen must apply the
  // same sandboxed-parser check the preview does. Before this, the raw string
  // was pasted straight into `float _v=<formula>;`, so an untrusted project
  // could smuggle arbitrary C++ into a sketch the user then flashed.
  it('refuses to emit CustomFormula source that the sandbox parser rejects', () => {
    const injected = '0.0f; digitalWrite(2, HIGH); float _x = 0'
    const cf = node('cf', 'CustomFormula', 'pattern', { formula: injected })
    const cpp = generateCpp([cf, outputNode], [edge('e', 'cf', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('digitalWrite(2, HIGH)')
    expect(cpp).toContain('float _v=0.0f;')
    expect(cpp).toContain('invalid formula')
  })

  it('refuses to emit FieldFormula source that the sandbox parser rejects', () => {
    const injected = '0.0f; } void evil() { for(;;)'
    const ff = node('ff', 'FieldFormula', 'field', { formula: injected })
    const toFrame = node('tf', 'FieldToFrame', 'field', {})
    const cpp = generateCpp([ff, toFrame, outputNode], [
      edge('e1', 'ff', 'tf', 'field', 'field'),
      edge('e2', 'tf', 'out', 'frame', 'frame'),
    ])
    expect(cpp).not.toContain('void evil()')
    expect(cpp).toContain('float _v=0.0f;')
  })

  it('still emits a valid formula unchanged', () => {
    const cf = node('cf', 'CustomFormula', 'pattern', { formula: 'sin(x*6+t)*0.5+0.5' })
    const cpp = generateCpp([cf, outputNode], [edge('e', 'cf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _v=sin(x*6+t)*0.5+0.5;')
    expect(cpp).not.toContain('invalid formula')
  })

  // The de Jong coefficients are looked up from a fixed table, but the preset
  // name was echoed raw into a `//` comment — a newline ends the comment.
  it('resolves the FormulaPoints attractor preset name before echoing it', () => {
    const fp = node('fp', 'FormulaPoints', 'pattern', {
      formulaType: 'attractor',
      preset: 'classic\n  digitalWrite(2, HIGH);',
    })
    const cpp = generateCpp([fp, outputNode], [edge('e', 'fp', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('digitalWrite(2, HIGH)')
    expect(cpp).toContain('de Jong, classic)')
  })

  it('emits an Image as a PROGMEM pixel array blitted to the matrix', () => {
    const image = { w: 2, h: 2, pixels: [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255] }
    const img = node('img', 'Image', 'pattern', { image })
    const cpp = generateCpp([img, outputNode], [edge('e', 'img', 'out', 'frame', 'frame')])
    expect(cpp).toContain('PROGMEM = {255,0,0,0,255,0,0,0,255,255,255,255}')
    expect(cpp).toContain('pgm_read_byte(')
    expect(cpp).toContain('const int _iw=2, _ih=2')
  })

  it('emits a blank fill for an Image with no uploaded picture', () => {
    const img = node('img', 'Image', 'pattern', {})
    const cpp = generateCpp([img, outputNode], [edge('e', 'img', 'out', 'frame', 'frame')])
    expect(cpp).toContain('Image: none uploaded')
  })

  it('emits Image fit, position, rotation, and flip transforms', () => {
    const image = { w: 2, h: 1, pixels: [255, 0, 0, 0, 255, 0] }
    const img = node('img', 'Image', 'pattern', {
      image, fit: 'contain', positionX: 0.25, positionY: 1, rotation: '90', flipX: true, flipY: true,
    })
    const cpp = generateCpp([img, outputNode], [edge('e', 'img', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_rw=(_rot&1)?_ih:_iw, _rh=(_rot&1)?_iw:_ih;')
    expect(cpp).toContain('fminf((float)WIDTH/_rw,(float)HEIGHT/_rh)')
    expect(cpp).toContain('(WIDTH-_dw)*constrain(0.25,0.0f,1.0f)')
    expect(cpp).toContain('(HEIGHT-_dh)*constrain(1,0.0f,1.0f)')
    expect(cpp).toContain('_px=_rw-1-_px')
    expect(cpp).toContain('_py=_rh-1-_py')
    expect(cpp).toContain('if(_rot==1){ _sx=_py; _sy=_ih-1-_px; }')
  })

  it('emits Image smooth sampling, brightness, and background colour', () => {
    const image = { w: 2, h: 1, pixels: [0, 0, 0, 100, 200, 40] }
    const img = node('img', 'Image', 'pattern', {
      image, fit: 'contain', sampling: 'smooth', brightness: 0.5, background: '#102030',
    })
    const cpp = generateCpp([img, outputNode], [edge('e', 'img', 'out', 'frame', 'frame')])
    expect(cpp).toContain('const float _ibr=max(0.0f,min(1.0f,0.5))')
    expect(cpp).toContain('_imgcolor({16.0f,32.0f,48.0f,1.0f},_x,_y); continue;')
    expect(cpp).toContain('floorf(_fx)')
    expect(cpp).toContain('_ImgPx _c00=_imgpx(')
    expect(cpp).toContain('_imgcolor({_rr,_rg,_rb,_ra},_x,_y)')
  })

  it('emits Image alpha compositing and crop/zoom controls', () => {
    const image = { w: 2, h: 1, pixels: [255, 0, 0, 0, 0, 255], alpha: [0, 128] }
    const img = node('img', 'Image', 'pattern', {
      image, zoom: 2, cropX: 0.25, cropY: 0.75, background: '#102030',
    })
    const cpp = generateCpp([img, outputNode], [edge('e', 'img', 'out', 'frame', 'frame')])
    expect(cpp).toContain('PROGMEM = {0,128}')
    expect(cpp).toContain('_izv=1.0f/max(1.0f,min(8.0f,2))')
    expect(cpp).toContain('_u=(1-_izv)*constrain(0.25,0.0f,1.0f)+_u*_izv')
    expect(cpp).toContain('_v=(1-_izv)*constrain(0.75,0.0f,1.0f)+_v*_izv')
    expect(cpp).toContain('pgm_read_byte(&_imga_img[_ai])/255.0f')
    expect(cpp).toContain('_p.r+16.0f*(1-_p.a)')
  })

  it('emits Image colour treatment, gamma, palette reduction, and dithering', () => {
    const image = { w: 1, h: 1, pixels: [100, 120, 140] }
    const img = node('img', 'Image', 'pattern', {
      image, saturation: 0.5, contrast: 1.2, hueShift: 90, gamma: 2.2,
      paletteLevels: '4', dithering: 'ordered4x4',
    })
    const cpp = generateCpp([img, outputNode], [edge('e', 'img', 'out', 'frame', 'frame')])
    expect(cpp).toContain('powf(constrain(_r')
    expect(cpp).toContain('_idither[] PROGMEM={0,8,2,10')
    expect(cpp).toContain('(_y&3)*4+(_x&3)')
    expect(cpp).toContain('_c*3.0f/255.0f')
  })

  it('emits an Image node animation with frame data and source timing', () => {
    const animation = {
      frames: [
        { w: 1, h: 1, pixels: [255, 0, 0] },
        { w: 1, h: 1, pixels: [0, 0, 255], alpha: [128] },
      ],
      durations: [100, 200],
    }
    const animated = node('anim', 'Image', 'pattern', { animation, playbackRate: 2, loop: true })
    const cpp = generateCpp([animated, outputNode], [edge('e', 'anim', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_img_anim[] PROGMEM = {255,0,0,0,0,255}')
    expect(cpp).toContain('_imga_anim[] PROGMEM = {255,128}')
    expect(cpp).toContain('_imgd_anim[] PROGMEM = {100,200}')
    expect(cpp).toContain('millis()*max(0.25f,min(4.0f,2))')
    expect(cpp).toContain('_it%=300UL')
    expect(cpp).toContain('_ibase=_ifr*_iw*_ih')
  })

  it('emits fractal noise via summed inoise8 octaves', () => {
    const fn = node('fn', 'FractalNoise', 'pattern', { speed: 0.3, scale: 0.15, octaves: 4, palette: 'forest' })
    const cpp = generateCpp([fn, outputNode], [edge('e', 'fn', 'out', 'frame', 'frame')])
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('_o<4')
    expect(cpp).toContain('ColorFromPalette(paldef_forest')
  })

  it('emits Worley noise with its hash helper', () => {
    const w = node('w', 'Noise', 'pattern', { noiseType: 'worley', speed: 0.5, scale: 0.3, palette: 'forest' })
    const cpp = generateCpp([w, outputNode], [edge('e', 'w', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _worleyHash(int x, int y)')
    expect(cpp).toContain('_worleyHash(_cx,_cy)')
    expect(cpp).toContain('ColorFromPalette(paldef_forest')
  })

  it('emits looping 4D noise through inoise16(x, y, z, t)', () => {
    const n4 = node('n4', 'Noise', 'pattern', { noiseType: 'noise4d', speed: 0.5, scale: 0.5, palette: 'ocean' })
    const cpp = generateCpp([n4, outputNode], [edge('e', 'n4', 'out', 'frame', 'frame')])
    expect(cpp).toContain('inoise16((uint32_t)(_x*_fr),(uint32_t)(_y*_fr),_z+(uint32_t)(_o*8192),_w+(uint32_t)(_o*12288))')
    expect(cpp).toContain('float _spd=')
    expect(cpp).toContain('_ang=_t*_spd*6.2831853f;')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
  })

  it('emits the right Transition code per transitionType', () => {
    const emit = (transitionType: string, props: Record<string, unknown> = {}) =>
      generateCpp([node('tr', 'Transition', 'composite', { transitionType, t: 0.5, ...props }), outputNode],
        [edge('e', 'tr', 'out', 'frame', 'frame')])
    expect(emit('crossfade')).toContain('nblend(')
    const wipe = emit('wipe', { direction: 'up' })
    expect(wipe).toContain('if(_y')                      // wipe iterates on the y axis
    expect(emit('dissolve')).toContain('1664525u')       // dissolve hash constant
  })

  it('emits a Color Temperature node with the kelvinToRGB helper', () => {
    const t = node('t', 'Temperature', 'color', { kelvin: (3000 - 1000) / 11000 })
    const sp = node('sp', 'Circle', 'pattern', { cx: 2, cy: 2, radius: 2 })
    const cpp = generateCpp([t, sp, outputNode], [
      edge('e1', 't', 'sp', 'color', 'edge'),
      edge('e2', 'sp', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB kelvinToRGB(float kelvin)')
    expect(cpp).toContain('n_t_color = kelvinToRGB(mapFloat(constrain(0.18181818181818182, 0.0f, 1.0f), 0.0f, 1.0f, 1000.0f, 12000.0f))')
  })

  it('emits a Circle SDF coverage loop with thickness (Shape-style)', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0.5, cy: 0.5, radius: 3, thickness: 2, filled: false, edge: '#ff0000' })
    const cpp = generateCpp([c, outputNode], [edge('e', 'c', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _rad=max(0.5f,3);')
    expect(cpp).toContain('float _th=max(0.0f,2);')
    expect(cpp).toContain('float _cxv=0.5,_cyv=0.5;')
    expect(cpp).toContain('float _cx=_cxv>1.0f?_cxv:(0.5f-_m)+_cxv*((WIDTH-1.0f)+2.0f*_m),_cy=_cyv>1.0f?_cyv:(0.5f-_m)+_cyv*((HEIGHT-1.0f)+2.0f*_m);')
    expect(cpp).toContain('_sd=sqrtf(_dx*_dx+_dy*_dy)-_rad;')
    expect(cpp).toContain('float _fc=0.0f;')                                        // unfilled: no fill coverage
    expect(cpp).toContain('float _ec=constrain(_th*0.5f+0.5f-fabsf(_sd),0.0f,1.0f);')
    expect(cpp).toContain('CRGB _col=_fill; nblend(_col,_edge,(uint8_t)(_ec*255.0f));')
    expect(cpp).toContain('CRGB(255, 0, 0)')
  })

  it('scales the Circle radius by matrix size only when scaleWithMatrix is on', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0.5, cy: 0.5, radius: 3, thickness: 2, filled: false, edge: '#ff0000', scaleWithMatrix: true })
    const cpp = generateCpp([c, outputNode], [edge('e', 'c', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _rad=max(0.5f,3*(min(WIDTH,HEIGHT)/16.0f));')
  })

  it('emits a Circle fill color for filled discs', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0.5, cy: 0.5, radius: 3, filled: true, edge: '#ff0000', fill: '#00ff00' })
    const cpp = generateCpp([c, outputNode], [edge('e', 'c', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB _fill=CRGB(0, 255, 0),_edge=CRGB(255, 0, 0);')
    expect(cpp).toContain('float _fc=constrain(0.5f-_sd,0.0f,1.0f);')
    expect(cpp).toContain('float _al=max(_fc,_ec); if(_al<=0.0f) continue;')
  })

  it('emits wrapped Circle copies when wrap is enabled', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 0, cy: 0.5, radius: 3, wrap: true, edge: '#ff0000' })
    const cpp = generateCpp([c, outputNode], [edge('e', 'c', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _cxv=0,_cyv=0.5;')
    expect(cpp).toContain('float _cx=_cxv>1.0f?_cxv:(WIDTH*0.5f-WIDTH)+_cxv*(WIDTH*2.0f),_cy=_cyv>1.0f?_cyv:(HEIGHT*0.5f-HEIGHT)+_cyv*(HEIGHT*2.0f);')
    expect(cpp).toContain('float _wrapX[3]={-(float)WIDTH,0.0f,(float)WIDTH};')
    expect(cpp).toContain('float _wrapY[3]={-(float)HEIGHT,0.0f,(float)HEIGHT};')
    expect(cpp).toContain('float _wcx=_cx+_wrapX[_wx],_wcy=_cy+_wrapY[_wy];')
  })

  it('emits Circle pixel-space center compatibility', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 8, cy: 8, radius: 3 })
    const cpp = generateCpp([c, outputNode], [edge('e', 'c', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _cxv=8,_cyv=8;')
    expect(cpp).toContain('float _cx=_cxv>1.0f?_cxv:(0.5f-_m)+_cxv*((WIDTH-1.0f)+2.0f*_m),_cy=_cyv>1.0f?_cyv:(0.5f-_m)+_cyv*((HEIGHT-1.0f)+2.0f*_m);')
  })

  it('emits a sampled subpixel loop for a Line', () => {
    const l = node('l', 'Line', 'pattern', { x1: 0, y1: 0, x2: 7, y2: 7, r: 0, g: 200, b: 255 })
    const cpp = generateCpp([l, outputNode], [edge('e', 'l', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _len = sqrtf((_x1 - _x0) * (_x1 - _x0) + (_y1 - _y0) * (_y1 - _y0));')
    expect(cpp).toContain('int _steps = max(1, (int)ceilf(_len * 2.0f));')
    expect(cpp).toContain('float _cov = constrain(_rad + 0.5f - sqrtf(_dx * _dx + _dy * _dy), 0.0f, 1.0f);')
    expect(cpp).toContain('CRGB(0, 200, 255)')
  })

  it('emits a Path curve with subpixel splat coverage', () => {
    const p = node('p', 'Path', 'pattern', { pathShape: 'heart', t: 0.25, scale: 0.8, thickness: 1.5, r: 255, g: 220, b: 80 })
    const cpp = generateCpp([p, outputNode], [edge('e', 'p', 'out', 'frame', 'frame')])
    expect(cpp).toContain('powf(sinf(_ang), 3.0f)')
    expect(cpp).toContain('float _cov = constrain(_rad + 0.5f - sqrtf(_dx * _dx + _dy * _dy), 0.0f, 1.0f);')
    expect(cpp).toContain('_add.nscale8((uint8_t)(_cov * 255.0f));')
    expect(cpp).toContain('buf_p[_y * WIDTH + _x] += _add;')
  })

  it('Path codegen uses a wired t input over the property', () => {
    const tVal = node('tv', 'Math', 'math', { mathOp: 'add', a: 0.25, b: 0 })
    const p = node('p', 'Path', 'pattern', { pathShape: 'rose', t: 0, scale: 0.8, thickness: 1.25 })
    const cpp = generateCpp([tVal, p, outputNode], [
      edge('e1', 'tv', 'p', 'result', 't'),
      edge('e2', 'p', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('float _tt = constrain(n_tv_result, 0.0f, 1.0f);')
    expect(cpp).toContain('float _pr = cosf(_ang * 4.0f);')
  })

  it('emits a rotating Wireframe3D cube with balanced braces and a baked vertex/edge table', () => {
    const wf = node('wf', 'Wireframe3D', 'pattern', { model: 'cube', spinY: 40, r: 0, g: 200, b: 255 })
    const cpp = generateCpp([wf, outputNode], [edge('e', 'wf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static const float _vtx_wf[]')
    expect(cpp).toContain('static const uint8_t _edg_wf[]')
    // Cube: 8 vertices, 12 edges.
    expect(cpp).toContain('for (int _i = 0; _i < 8; _i++)')
    expect(cpp).toContain('for (int _e = 0; _e < 12; _e++)')
    expect(cpp).toContain('float t = millis() / 1000.0f;')
    expect(cpp).toContain('CRGB(0, 200, 255)')
    const opens = (cpp.match(/\{/g) ?? []).length
    const closes = (cpp.match(/\}/g) ?? []).length
    expect(opens).toBe(closes)
  })

  it('Wireframe3D emits a perspective-projection branch only when selected', () => {
    const ortho = node('wfo', 'Wireframe3D', 'pattern', { model: 'octahedron', projection: 'orthographic' })
    const persp = node('wfp', 'Wireframe3D', 'pattern', { model: 'octahedron', projection: 'perspective', perspectiveStrength: 0.7 })
    const orthoCpp = generateCpp([ortho, outputNode], [edge('e', 'wfo', 'out', 'frame', 'frame')])
    const perspCpp = generateCpp([persp, outputNode], [edge('e', 'wfp', 'out', 'frame', 'frame')])
    expect(orthoCpp).not.toContain('_factor')
    expect(perspCpp).toContain('float _factor=')
  })

  it('Wireframe3D bakes a validated custom mesh instead of the cube preset', () => {
    const wf = node('wfc', 'Wireframe3D', 'pattern', {
      model: 'custom',
      mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], edges: [0, 1, 1, 2] },
    })
    const cpp = generateCpp([wf, outputNode], [edge('e', 'wfc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('for (int _i = 0; _i < 3; _i++)')
    expect(cpp).toContain('for (int _e = 0; _e < 2; _e++)')
  })

  it('emits a Text node with embedded font columns', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'HI', x: 0.5, y: 0.5, scroll: 0, r: 0, g: 255, b: 0 })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static const uint8_t _txt_t_0[] = {')
    expect(cpp).toContain('CRGB(0, 255, 0)')
    expect(cpp).not.toContain('millis()')   // static text → no time variable
  })

  it('Text codegen uses a custom font height', () => {
    const font = { w: 3, h: 7, glyphs: { A: [1, 1, 1, 1, 1, 1, 1] } }
    const txt = node('t', 'Text', 'pattern', { text: 'A', x: 0.5, y: 0.5, scroll: 0, font })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_r < 7;')
  })

  it('emits one bitmap array per multiline Text row', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'A\nBC', x: 0.5, y: 0.5, scroll: 0 })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static const uint8_t _txt_t_0[] = {')
    expect(cpp).toContain('static const uint8_t _txt_t_1[] = {')
    expect(cpp).toContain('int _yy = (_sy + 6) + _r - _offY;')
  })

  it('emits a scrolling Text node that uses millis()', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'GO', x: 0.5, y: 0.5, scroll: 4 })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float t = millis()')
    expect(cpp).toContain('_offX =')
  })

  it('emits wrapped Text copies when wrap is enabled', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'I', x: 0.25, y: 0.5, wrap: true, scroll: 0 })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('int _sx_0 = (int)floorf((WIDTH * 0.5f - WIDTH) + (0.25) * (WIDTH * 2.0f) - ((_tn_t_0) * 0.5f));')
    expect(cpp).toContain('int _wrapX[3] = {-WIDTH, 0, WIDTH};')
    expect(cpp).toContain('_sx_0 + _wrapX[_wx]')
  })

  it('emits vertically scrolling Text with a distinct offset axis', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'GO', x: 0.5, y: 0.5, scroll: 2, scrollAxis: 'vertical' })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_totY =')
    expect(cpp).toContain('_offX = 0;')
    expect(cpp).not.toContain('_totX =')
  })

  it('Text codegen honours left/right and top/bottom alignment', () => {
    const left = node('t', 'Text', 'pattern', { text: 'HI', x: 0, y: 0.5, hAlign: 'left' })
    const leftCpp = generateCpp([left, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    // 'start' align drops the centring `- (halfWidth)` term entirely.
    expect(leftCpp).not.toContain('_tn_t) * 0.5f')

    const bottom = node('t2', 'Text', 'pattern', { text: 'HI', x: 0.5, y: 1, vAlign: 'bottom' })
    const bottomCpp = generateCpp([bottom, outputNode], [edge('e', 't2', 'out', 'frame', 'frame')])
    expect(bottomCpp).toContain('- (5)')   // 'end' align subtracts the font height after the floor
  })

  it('Text codegen honours letterSpacing', () => {
    const tight = node('t', 'Text', 'pattern', { text: 'HI', letterSpacing: 0 })
    const wide = node('t2', 'Text', 'pattern', { text: 'HI', letterSpacing: 3 })
    const tightCpp = generateCpp([tight, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    const wideCpp = generateCpp([wide, outputNode], [edge('e', 't2', 'out', 'frame', 'frame')])
    const tightN = Number(tightCpp.match(/const int _tn_t_0 = (\d+);/)?.[1])
    const wideN = Number(wideCpp.match(/const int _tn_t2_0 = (\d+);/)?.[1])
    expect(wideN - tightN).toBe(2 * 3)   // 2 glyphs × 3 extra spacing columns
  })

  it('emits a luminance Mask that scales the frame buffer', () => {
    const content = node('w', 'SolidColor', 'pattern', { r: 200, g: 200, b: 200 })
    const mask    = node('m', 'GradientFrame', 'pattern', {})
    const msk     = node('mk', 'Mask', 'composite', {})
    const cpp = generateCpp([content, mask, msk, outputNode], [
      edge('e1', 'w', 'mk', 'frame', 'frame'),
      edge('e2', 'm', 'mk', 'frame', 'mask'),
      edge('e3', 'mk', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('::memmove(buf_mk, buf_w, sizeof(CRGB) * NUM_LEDS)')
    expect(cpp).toContain('buf_mk[_i].nscale8((buf_m[_i].r + buf_m[_i].g + buf_m[_i].b) / 3)')
  })

  it('Blend normal mode composites with nblend and copies the result to leds', () => {
    const a  = node('a', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const b  = node('b', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 })
    const lb = node('lb', 'Blend', 'composite', { blendMode: 'normal', amount: 0.5 })
    const cpp = generateCpp([a, b, lb, outputNode], [
      edge('e1', 'a', 'lb', 'frame', 'a'),
      edge('e2', 'b', 'lb', 'frame', 'b'),
      edge('e3', 'lb', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB buf_a[NUM_LEDS];')
    expect(cpp).toContain('CRGB buf_b[NUM_LEDS];')
    expect(cpp).toContain('::memmove(buf_lb, buf_a, sizeof(CRGB) * NUM_LEDS)')
    expect(cpp).toContain('nblend(buf_lb, buf_b, NUM_LEDS, (uint8_t)((0.5) * 255))')
    // The terminal node renders into `leds` directly — no second buffer to copy.
    expect(cpp).toContain('CRGB* const buf_lb = leds;')
    expect(cpp).not.toContain('::memmove(leds, buf_lb,')
  })

  it('Blend non-normal mode emits a per-channel blend loop', () => {
    const a  = node('a', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const b  = node('b', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 })
    const bl = node('bl', 'Blend', 'composite', { blendMode: 'multiply', amount: 0.5 })
    const cpp = generateCpp([a, b, bl, outputNode], [
      edge('e1', 'a', 'bl', 'frame', 'a'),
      edge('e2', 'b', 'bl', 'frame', 'b'),
      edge('e3', 'bl', 'out', 'frame', 'frame'),
    ])
    expect(cpp).not.toContain('nblend(buf_bl')        // not the linear path
    expect(cpp).toContain('float _op=(0.5)')
    expect(cpp).toContain('float _r=_av*_bv;')        // multiply expression
  })

  it('skips an unknown group reference and still emits a valid sketch', () => {
    const grp = node('g1', 'Group', 'composite', { groupId: 'missing' })
    const cpp = generateCpp([grp, outputNode], [edge('e1', 'g1', 'out', 'frame', 'frame')], {})
    expect(cpp).toContain('void loop()')
  })

  // The 13 transition variants ported from the touchscreen branch shipped with
  // placeholder C++ (comments like `/* use pixel from frame B */` instead of real
  // writes). These assert each variant emits genuine buffer compositing — seeded
  // from A, writing B into the node's own buffer — and never a stub comment.
  function transitionCpp(transitionType: string, props: Record<string, unknown> = {}) {
    const a  = node('a', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const b  = node('b', 'SolidColor', 'pattern', { r: 0, g: 255, b: 0 })
    const tr = node('tr', 'Transition', 'composite', { transitionType, t: 0.5, ...props })
    return generateCpp([a, b, tr, outputNode], [
      edge('e1', 'a', 'tr', 'frame', 'a'),
      edge('e2', 'b', 'tr', 'frame', 'b'),
      edge('e3', 'tr', 'out', 'frame', 'frame'),
    ])
  }

  const NEW_VARIANTS = [
    'iris', 'clockwipe', 'push', 'checkerboard', 'diagonal', 'fadeblack',
    'fadewhite', 'blinds', 'ripple', 'spiral', 'curtain', 'scanlines', 'zoom',
  ]
  for (const variant of NEW_VARIANTS) {
    it(`Transition '${variant}' emits real buffer writes, not stub comments`, () => {
      const cpp = transitionCpp(variant)
      expect(cpp).not.toContain('/* use pixel')        // no placeholder stubs
      expect(cpp).not.toContain('/* blend A')
      expect(cpp).toContain('buf_tr[')                 // writes its own frame buffer
      // reads from at least one source buffer (A seed and/or B composite)
      expect(/buf_(a|b)\[/.test(cpp)).toBe(true)
    })
  }

  it("Transition 'push' branches on direction at codegen time", () => {
    expect(transitionCpp('push', { direction: 'up' })).toContain('roundf(_y-_tt*HEIGHT)')
    expect(transitionCpp('push', { direction: 'right' })).toContain('roundf(_x+_tt*WIDTH)')
  })

  it("Transition 'checkerboard' bakes the tile size into the C++", () => {
    expect(transitionCpp('checkerboard', { tileSize: 3 })).toContain('_x/3')
  })
})

describe('Float Field codegen', () => {
  it('FieldFormula declares a float field buffer and writes into it', () => {
    const ff = node('ff', 'FieldFormula', 'pattern', { formula: 'r' })
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'ocean', brightness: 1 })
    const cpp = generateCpp(
      [ff, f2f, outputNode],
      [edge('e1', 'ff', 'f2f', 'field', 'field'), edge('e2', 'f2f', 'out', 'frame', 'frame')],
    )
    expect(cpp).toContain('float field_ff[NUM_LEDS];')
    expect(cpp).toContain('field_ff[_y*WIDTH+_x]=constrain(')
    // polar/centred coordinate vars available to the expression
    expect(cpp).toContain('float r=sqrtf(cx*cx+cy*cy)')
  })

  it('FieldToFrame maps the upstream field through a palette', () => {
    const ff = node('ff', 'FieldFormula', 'pattern', { formula: '0.5' })
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'ocean', brightness: 1 })
    const cpp = generateCpp(
      [ff, f2f, outputNode],
      [edge('e1', 'ff', 'f2f', 'field', 'field'), edge('e2', 'f2f', 'out', 'frame', 'frame')],
    )
    expect(cpp).toContain('ColorFromPalette(')
    expect(cpp).toContain('field_ff[_i]*255')
  })

  it('emits the float shim helpers only when a formula uses them', () => {
    const withShim = node('ff', 'FieldFormula', 'pattern', { formula: 'sin8(r*200)/255' })
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    const a = generateCpp(
      [withShim, f2f, outputNode],
      [edge('e1', 'ff', 'f2f', 'field', 'field'), edge('e2', 'f2f', 'out', 'frame', 'frame')],
    )
    expect(a).toContain('float _fsin8(float x)')
    expect(a).toContain('_fsin8(r*200)/255')   // call rewritten to the wrapper

    const noShim = node('ff', 'FieldFormula', 'pattern', { formula: 'r' })
    const b = generateCpp(
      [noShim, f2f, outputNode],
      [edge('e1', 'ff', 'f2f', 'field', 'field'), edge('e2', 'f2f', 'out', 'frame', 'frame')],
    )
    expect(b).not.toContain('_fsin8')
  })

  it('Noise declares a raw field buffer and remaps it through the palette', () => {
    const nz = node('nz', 'Noise', 'pattern', { noiseType: 'simplex', speed: 0.4, scale: 0.5, palette: 'ocean' })
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'ocean', brightness: 1 })
    const cpp = generateCpp(
      [nz, f2f, outputNode],
      [edge('e1', 'nz', 'f2f', 'field', 'field'), edge('e2', 'f2f', 'out', 'frame', 'frame')],
    )
    expect(cpp).toContain('float field_nz[NUM_LEDS];')
    expect(cpp).toContain('field_nz[_y*WIDTH+_x]=')
    expect(cpp).toContain('buf_nz[_i]=ColorFromPalette(paldef_ocean,(uint8_t)(constrain(field_nz[_i],0.0f,1.0f)*255.0f));')
    expect(cpp).toContain('field_nz[_i]*255')
  })

  it('FieldToFrame fills black when no field is wired', () => {
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    const cpp = generateCpp([f2f, outputNode], [edge('e2', 'f2f', 'out', 'frame', 'frame')])
    expect(cpp).toContain('fill_solid(buf_f2f, NUM_LEDS, CRGB::Black)')
  })

  it('WaveSim emits a persistent damped ripple field with trigger edge detection', () => {
    const trig = node('tr', 'Math', 'math', { mathOp: 'add', a: 1, b: 0 })
    const ws = node('ws', 'WaveSim', 'field', { speed: 4, damping: 0.985, impulse: 1 })
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'ocean', brightness: 1 })
    const cpp = generateCpp(
      [trig, ws, f2f, outputNode],
      [
        edge('e1', 'tr', 'ws', 'result', 'trigger'),
        edge('e2', 'ws', 'f2f', 'field', 'field'),
        edge('e3', 'f2f', 'out', 'frame', 'frame'),
      ],
    )
    expect(cpp).toContain('// WaveSim')
    expect(cpp).toContain('static float _ws_wsp[NUM_LEDS], _ws_wsc[NUM_LEDS], _ws_wsn[NUM_LEDS];')
    expect(cpp).toContain('bool _tr=(n_tr_result);')
    expect(cpp).toContain('fabsf(_ws_wsc[_i])')
    expect(cpp).toContain('field_ws[_i]=constrain(')
  })
})

describe('Float Field — Phase 2 codegen', () => {
  const tail = (srcId: string) => {
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    return {
      nodes: [f2f, outputNode],
      edges: [edge('zf', srcId, 'f2f', 'field', 'field'), edge('zo', 'f2f', 'out', 'frame', 'frame')],
    }
  }

  it('DistanceField writes a normalised distance into its field buffer', () => {
    const df = node('df', 'DistanceField', 'pattern', { px: 0.5, py: 0.5, scale: 2 })
    const t = tail('df')
    const cpp = generateCpp([df, ...t.nodes], t.edges)
    expect(cpp).toContain('float field_df[NUM_LEDS];')
    expect(cpp).toContain('/* DistanceField */')
    expect(cpp).toContain('sqrtf(_dx*_dx+_dy*_dy)/1.41421356f')
    expect(cpp).toContain('field_df[_y*WIDTH+_x]=constrain(')
  })

  it('FieldMath emits the operator for the selected fieldOp', () => {
    const a = node('a', 'FieldFormula', 'pattern', { formula: '0.5' })
    const b = node('b', 'FieldFormula', 'pattern', { formula: '0.4' })
    const fm = node('fm', 'FieldMath', 'pattern', { fieldOp: 'difference' })
    const t = tail('fm')
    const cpp = generateCpp([a, b, fm, ...t.nodes], [
      edge('e1', 'a', 'fm', 'field', 'a'),
      edge('e2', 'b', 'fm', 'field', 'b'),
      ...t.edges,
    ])
    expect(cpp).toContain('float _a=field_a[_i], _b=field_b[_i];')
    expect(cpp).toContain('fabsf(_a - _b)')
  })

  it('FieldWarp samples the source field with a clamped offset', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const dx = node('dx', 'FieldFormula', 'pattern', { formula: '1' })
    const fw = node('fw', 'FieldWarp', 'composite', { strength: 2 })
    const t = tail('fw')
    const cpp = generateCpp([src, dx, fw, ...t.nodes], [
      edge('e1', 'src', 'fw', 'field', 'field'),
      edge('e2', 'dx', 'fw', 'field', 'dx'),
      ...t.edges,
    ])
    expect(cpp).toContain('/* FieldWarp */')
    expect(cpp).toContain('(2.0f*field_dx[_y*WIDTH+_x]-1.0f)*_st')
    expect(cpp).toContain('field_fw[_y*WIDTH+_x]=field_src[_sy*WIDTH+_sx]')
    expect(cpp).toContain('if(_sx>WIDTH-1)_sx=WIDTH-1')
  })
})

describe('Float Field — Phase 3 codegen', () => {
  const tail = (srcId: string) => {
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    return {
      nodes: [f2f, outputNode],
      edges: [edge('zf', srcId, 'f2f', 'field', 'field'), edge('zo', 'f2f', 'out', 'frame', 'frame')],
    }
  }

  it('FieldRotate emits a time-driven rotation sampling the source field', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const fr = node('fr', 'FieldRotate', 'composite', { angle: 0, spin: 45 })
    const t = tail('fr')
    const cpp = generateCpp([src, fr, ...t.nodes], [
      edge('e1', 'src', 'fr', 'field', 'field'),
      ...t.edges,
    ])
    expect(cpp).toContain('/* FieldRotate */')
    expect(cpp).toContain('t*45')                 // spin baked in
    expect(cpp).toContain('float t = millis()')   // needsT triggered
    expect(cpp).toContain('field_fr[_y*WIDTH+_x]=field_src[_sy*WIDTH+_sx]')
  })

  it('FieldTile bakes the tile counts into the C++', () => {
    const src = node('src', 'FieldFormula', 'pattern', { formula: 'x/(W-1)' })
    const ft = node('ft', 'FieldTile', 'composite', { tilesX: 3, tilesY: 2 })
    const t = tail('ft')
    const cpp = generateCpp([src, ft, ...t.nodes], [
      edge('e1', 'src', 'ft', 'field', 'field'),
      ...t.edges,
    ])
    expect(cpp).toContain('/* FieldTile */')
    expect(cpp).toContain('int _tx=max(1,(int)roundf(3)),_ty=max(1,(int)roundf(2)); int _sx=(_x*_tx)%WIDTH,_sy=(_y*_ty)%HEIGHT;')
  })
})

describe('Formula Field codegen', () => {
  const tail = (srcId: string) => {
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    return {
      nodes: [f2f, outputNode],
      edges: [edge('zf', srcId, 'f2f', 'field', 'field'), edge('zo', 'f2f', 'out', 'frame', 'frame')],
    }
  }

  it('emits a dedicated block per formulaType, baked at generation time', () => {
    const ff = node('ff', 'FormulaField', 'field', { formulaType: 'rose', petals: 4, speed: 0.5 })
    const t = tail('ff')
    const cpp = generateCpp([ff, ...t.nodes], t.edges)
    expect(cpp).toContain('float field_ff[NUM_LEDS];')
    expect(cpp).toContain('/* Formula Field: rose */')
    expect(cpp).toContain('cosf(4.0f*(_ang+0.0f+_rot))')
    expect(cpp).toContain('field_ff[_y*WIDTH+_x]=constrain((_rr+1.0f)/2.0f*(1.0f-_r*0.15f),0.0f,1.0f);')
    expect(cpp).toContain('float t = millis()')   // needsT triggered
  })

  it('superformula bakes its Gielis parameters', () => {
    const ff = node('ff', 'FormulaField', 'field', {
      formulaType: 'superformula', symmetry: 8, n1: 1, n2: 1, n3: 1, a: 1, b: 1, speed: 0,
    })
    const t = tail('ff')
    const cpp = generateCpp([ff, ...t.nodes], t.edges)
    expect(cpp).toContain('/* Formula Field: superformula */')
    expect(cpp).toContain('powf(powf(_t1,1.0f)+powf(_t2,1.0f),-1.0f)')
  })

  it('fibonacciSpiral bakes turns into the angular period', () => {
    const ff = node('ff', 'FormulaField', 'field', {
      formulaType: 'fibonacciSpiral', turns: 4, tightness: 0.15, bandWidth: 0.25, speed: 0,
    })
    const t = tail('ff')
    const cpp = generateCpp([ff, ...t.nodes], t.edges)
    expect(cpp).toContain('/* Formula Field: fibonacciSpiral */')
    // period = 2π/4 ≈ 1.5708
    expect(cpp).toContain('fmodf(_ang+_rot-_phaseAtR,1.5708f)')
  })

  it('goldenTiling bakes density and phase', () => {
    const ff = node('ff', 'FormulaField', 'field', { formulaType: 'goldenTiling', density: 20, phase: 0.25, speed: 0 })
    const t = tail('ff')
    const cpp = generateCpp([ff, ...t.nodes], t.edges)
    expect(cpp).toContain('/* Formula Field: goldenTiling */')
    expect(cpp).toContain('_r*20.0f+_rot+0.25f')
  })

  it('lissajousField bakes the sample count and frequencies', () => {
    const ff = node('ff', 'FormulaField', 'field', { formulaType: 'lissajousField', freqA: 5, freqB: 4, thickness: 0.1, speed: 0 })
    const t = tail('ff')
    const cpp = generateCpp([ff, ...t.nodes], t.edges)
    expect(cpp).toContain('/* Formula Field: lissajousField */')
    expect(cpp).toContain('for(int _s=0;_s<48;_s++)')
    expect(cpp).toContain('sinf(5.0f*_sp+_rot),_ly=sinf(4.0f*_sp)')
  })

  it('CustomFormula referencing PHI emits the golden-ratio #define', () => {
    const cf = node('cf', 'CustomFormula', 'pattern', { formula: 'sin(x*PHI)' })
    const cpp = generateCpp([cf, outputNode], [edge('e1', 'cf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('#define PHI 1.618033988749895f')
  })

  it('a formula without PHI does not emit the define', () => {
    const cf = node('cf', 'CustomFormula', 'pattern', { formula: 'sin(x)' })
    const cpp = generateCpp([cf, outputNode], [edge('e1', 'cf', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('#define PHI')
  })
})

describe('generateCpp — RadialBurst', () => {
  it('uses the compatible arms port as live ring density', () => {
    const density = node('density', 'Random', 'signal', { min: 2, max: 12 })
    const radial = node('radial', 'RadialBurst', 'pattern', {})
    const cpp = generateCpp([density, radial, outputNode], [
      edge('densityEdge', 'density', 'radial', 'value', 'arms'),
      edge('outEdge', 'radial', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('_rings=max(1.0f,min(32.0f,n_density_value))')
    expect(cpp).toContain('_d*_rings')
  })
})

describe('generateCpp — Kaleidoscope', () => {
  const src = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
  const gen = (props: Record<string, unknown> = {}, extra: StudioNode[] = [], extraEdges: StudioEdge[] = []) => {
    const kal = node('kal', 'Kaleidoscope', 'pattern', props)
    return generateCpp([src, kal, ...extra, outputNode], [
      edge('e1', 'sc', 'kal', 'frame', 'frame'),
      edge('e2', 'kal', 'out', 'frame', 'frame'),
      ...extraEdges,
    ])
  }

  // Regression guard: this case used to be a stub that copied the input frame
  // straight through, so the effect worked in the preview and silently
  // vanished on hardware.
  it('samples the source through the wedge fold instead of copying it through', () => {
    const cpp = gen({ segments: 6 })
    expect(cpp).toContain('CRGB* const buf_kal = leds;')
    expect(cpp).toContain('buf_kal[_y*WIDTH+_x]=(_ksx<0||_ksx>=WIDTH||_ksy<0||_ksy>=HEIGHT)?CRGB::Black:buf_sc[_ksy*WIDTH+_ksx];')
    expect(cpp).not.toContain('::memmove(buf_kal, buf_sc')
    expect(cpp).not.toContain('mirror logic to apply')
  })

  // The fold, centre and rounding must match evalKaleidoscope in
  // graphEvaluator.ts or preview and firmware diverge.
  it('mirrors the evaluator centre, two-step angle fold and rounding', () => {
    const cpp = gen({ segments: 6 })
    expect(cpp).toContain('float _kCx=WIDTH/2.0f,_kCy=HEIGHT/2.0f;')
    expect(cpp).toContain('float _kdx=_x-_kCx,_kdy=_y-_kCy,_kd=sqrtf(_kdx*_kdx+_kdy*_kdy);')
    expect(cpp).toContain('float _ka=fmodf(fmodf(atan2f(_kdy,_kdx),_kSeg)+_kSeg,_kSeg);')
    expect(cpp).toContain('if(_ka>_kSeg*0.5f) _ka=_kSeg-_ka;')
    expect(cpp).toContain('int _ksx=(int)floorf(_kCx+_kd*cosf(_ka)+0.5f),_ksy=(int)floorf(_kCy+_kd*sinf(_ka)+0.5f);')
  })

  it('bakes an unwired segments property and clamps it to the evaluator floor of 2', () => {
    expect(gen({ segments: 8 })).toContain('float _kSeg=6.2831853f/max(2.0f,(float)(8));')
    expect(gen({ segments: 1 })).toContain('max(2.0f,(float)(1))')
  })

  it('recomputes the wedge angle from a wired segments input', () => {
    const seg = node('seg', 'Random', 'signal', { min: 3, max: 9 })
    const cpp = gen({ segments: 6 }, [seg], [edge('e3', 'seg', 'kal', 'value', 'segments')])
    expect(cpp).toContain('float _kSeg=6.2831853f/max(2.0f,(float)(n_seg_value));')
  })

  it('renders black when nothing is wired into the frame input', () => {
    const kal = node('kal', 'Kaleidoscope', 'pattern', { segments: 6 })
    const cpp = generateCpp([kal, outputNode], [edge('e', 'kal', 'out', 'frame', 'frame')])
    expect(cpp).toContain('fill_solid(buf_kal, NUM_LEDS, CRGB::Black); // Kaleidoscope: no input')
  })
})

describe('generateCpp — Particles modes', () => {
  const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
  const gen = (mode: string, props: Record<string, unknown> = {}) => {
    const pn = node('pp', 'Particles', 'pattern', { particleType: mode, rate: 0.5, ...props })
    return generateCpp([pn, out], [edge('e', 'pp', 'out', 'frame', 'frame')])
  }

  for (const m of [
    'fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow', 'swarm',
    'rain', 'embers', 'bubbles', 'vortex', 'orbit', 'confetti', 'fireflies',
    'meteor', 'tornado', 'pinwheel', 'bounce', 'attractor', 'waterfall',
  ]) {
    it(`emits a real fixed-pool engine for "${m}"`, () => {
      const cpp = gen(m)
      expect(cpp).toContain(`// Particles: ${m}`)
      expect(cpp).toContain('_PN=')
      // additive render of every live particle at its life brightness
      expect(cpp).toContain('float _k=min(1.0f,_pa_ppl[i]), _sx=_pa_ppx[i], _sy=_pa_ppy[i];')
      expect(cpp).toContain('float _cov=constrain(')
      expect(cpp).toContain('buf_pp[_y*WIDTH+_x]+=_add;')
    })
  }

  it('particles render from float centres instead of rounded integer pixels', () => {
    const cpp = gen('fountain')
    expect(cpp).not.toContain('int X=(int)(_pa_ppx[i]+0.5f), Y=(int)(_pa_ppy[i]+0.5f);')
    expect(cpp).toContain('float _dx=(_x+0.5f)-_sx,_dy=(_y+0.5f)-_sy;')
  })

  it('swarm sizes its pool directly from count and uses a flocking (boids) step', () => {
    const cpp = gen('swarm')
    expect(cpp).toContain('_PN=24') // default count
    expect(cpp).toContain('sqrtf(')
    expect(gen('swarm', { count: 40 })).toContain('_PN=40')
  })

  it('fireworks bursts with a random hue', () => {
    expect(gen('fireworks')).toContain('CHSV(_hue')
  })

  it('comet is time-driven (needs t)', () => {
    const cpp = gen('comet')
    expect(cpp).toContain('float t = millis()')
    expect(cpp).toContain('sin(t*0.9f)')
  })

  it('time-driven displays emit the shared animation clock', () => {
    for (const mode of ['embers', 'bubbles', 'fireflies', 'meteor', 'tornado', 'attractor']) {
      expect(gen(mode)).toContain('float t = millis()')
    }
  })

  it('count sets the fixed-population pool size for orbit/fireflies/bounce too', () => {
    expect(gen('orbit', { count: 10 })).toContain('_target=10')
    expect(gen('fireflies', { count: 15 })).toContain('_target=15')
    expect(gen('bounce', { count: 7 })).toContain('_target=7')
  })

  it("spread widens/narrows a width-spawning mode's spawn area", () => {
    expect(gen('fountain', { spread: 0.5 })).toContain('WIDTH*0.5f+(random8()/255.0f-0.5f)*WIDTH*0.5f')
    expect(gen('waterfall', { spread: 2 })).toContain('(random8()/255.0f-0.5f)*0.3f*WIDTH*2.0f')
  })

  it("gravity and bounce scale a mode's built-in accel/restitution constants", () => {
    const cpp = gen('gravity', { gravity: 2, bounce: 0.5 })
    expect(cpp).toContain('0.045f*2.0f')
    expect(cpp).toContain('-0.55f*0.5f')
  })

  it('size scales the rendered particle radius (visible on a larger matrix)', () => {
    const out32 = node('out', 'MatrixOutput', 'output', { width: 32, height: 32 })
    const cppSmall = generateCpp(
      [node('pp', 'Particles', 'pattern', { particleType: 'fountain', size: 1 }), out32],
      [edge('e', 'pp', 'out', 'frame', 'frame')],
    )
    const cppBig = generateCpp(
      [node('pp', 'Particles', 'pattern', { particleType: 'fountain', size: 2 }), out32],
      [edge('e', 'pp', 'out', 'frame', 'frame')],
    )
    expect(cppSmall).toContain('floorf(_sx-1.0f-1.0f)')
    expect(cppBig).toContain('floorf(_sx-2.0f-1.0f)')
  })
})

describe('Formula Points codegen', () => {
  const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
  const gen = (formulaType: string, props: Record<string, unknown> = {}) => {
    const fp = node('fp', 'FormulaPoints', 'pattern', { formulaType, ...props })
    return generateCpp([fp, out], [edge('e', 'fp', 'out', 'frame', 'frame')])
  }

  for (const v of ['phyllotaxis', 'lissajousPath', 'rosePath', 'logisticMap', 'attractor']) {
    it(`emits a dedicated block for "${v}", baked at generation time`, () => {
      const cpp = gen(v)
      expect(cpp).toContain(`// Formula Points: ${v}`)
      expect(cpp).toContain('float _dx=(_px+0.5f)-_sx,_dy=(_py+0.5f)-_sy;')
      expect(cpp).toContain('buf_fp[_py*WIDTH+_px]+=_add;')
    })
  }

  it('phyllotaxis is time-driven and bakes the golden angle', () => {
    const cpp = gen('phyllotaxis')
    expect(cpp).toContain('float t = millis()')
    expect(cpp).toContain('_i*2.39996323f') // golden angle, 8-digit precision (see codegen comment)
  })

  it('logisticMap is not time-driven (no needsT) and bakes chaos', () => {
    const cpp = gen('logisticMap', { chaos: 3.9 })
    expect(cpp).not.toContain('float t = millis()')
    expect(cpp).toContain('float _r=3.9f;')
    expect(cpp).toContain('static float _fp_fpx=0.5f;')
  })

  it('logisticMap persists its running x as a static local', () => {
    const cpp = gen('logisticMap')
    expect(cpp).toContain('_fp_fpx=_r*_fp_fpx*(1.0f-_fp_fpx);')
  })

  it('attractor bakes the selected preset coefficients', () => {
    const classic = gen('attractor', { preset: 'classic' })
    expect(classic).toContain('// Formula Points: attractor (de Jong, classic)')
    expect(classic).toContain('sinf(1.4f*_fp_fpay)-cosf(-2.3f*_fp_fpax)')
    const web = gen('attractor', { preset: 'web' })
    expect(web).toContain('sinf(-0.827f*_fp_fpay)-cosf(-1.637f*_fp_fpax)')
  })

  it('attractor and the trail variants fade the persistent buffer by (1 - persistence)', () => {
    const cpp = gen('attractor', { persistence: 0.9 })
    expect(cpp).toContain('fadeToBlackBy(buf_fp, NUM_LEDS, (uint8_t)(0.1f*255.0f));')
  })

  it('lissajousPath bakes frequency ratios and cycles hue with phase', () => {
    const cpp = gen('lissajousPath', { freqA: 5, freqB: 4 })
    expect(cpp).toContain('// Formula Points: lissajousPath')
    expect(cpp).toContain('sinf(5.0f*_phase), _cy=sinf(4.0f*_phase)')
    expect(cpp).toContain('_hue=fmodf(_phase/6.2831853f,1.0f)')
  })

  it('rosePath bakes the petal count', () => {
    const cpp = gen('rosePath', { petals: 7 })
    expect(cpp).toContain('float _rr=cosf(7.0f*_phase);')
  })

  it('unknown formulaType falls back to the phyllotaxis block', () => {
    const cpp = gen('bogus')
    expect(cpp).toContain('// Formula Points: phyllotaxis')
  })

  it('dotSize scales the rendered point radius (visible on a larger matrix)', () => {
    const out32 = node('out', 'MatrixOutput', 'output', { width: 32, height: 32 })
    const small = generateCpp(
      [node('fp', 'FormulaPoints', 'pattern', { formulaType: 'phyllotaxis', dotSize: 1 }), out32],
      [edge('e', 'fp', 'out', 'frame', 'frame')],
    )
    const big = generateCpp(
      [node('fp', 'FormulaPoints', 'pattern', { formulaType: 'phyllotaxis', dotSize: 2 }), out32],
      [edge('e', 'fp', 'out', 'frame', 'frame')],
    )
    expect(small).toContain('_sx-1.0f-1.0f')
    expect(big).toContain('_sx-2.0f-1.0f')
  })
})

describe('generateCpp — INMP441 audio engine', () => {
  const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
  const micBoard = node('board', 'Board', 'hardware', { profileId: 'espressif-esp32-s3-devkitc-1' })
  const micGraph = (channel = 'Left') => {
    const mic = node('mic', 'MicInput', 'hardware', { i2sWs: 39, i2sSck: 40, i2sSd: 41, channel })
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const bp = node('bp', 'BassPulse', 'pattern', {})
    return generateCpp([micBoard, mic, fft, bp, out], [
      edge('e1', 'mic', 'fft', 'audio', 'audio'),
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
  }

  it('uses FastLED audio instead of emitting a second I2S driver and FFT', () => {
    const cpp = micGraph()
    expect(cpp).not.toContain('#include <driver/i2s_std.h>')
    expect(cpp).not.toContain('#include <driver/i2s.h>')
    expect(cpp).not.toContain('void _audioFFT(')
    expect(cpp).toContain('#define MIC_WS    39')
    expect(cpp).toContain('#define MIC_SCK   40')
    expect(cpp).toContain('#define MIC_SD    41')
    expect(cpp).toContain('#define MIC_GAIN')
    expect(cpp).toContain('fl::audio::Config::CreateInmp441(MIC_WS, MIC_SD, MIC_SCK, fl::audio::AudioChannel::Left)')
    expect(cpp).toContain('_audioProcessor = FastLED.add(config);')
    expect(cpp).toContain('_audioProcessor->setGain(MIC_GAIN);')
    expect(cpp).toContain('_audioProcessor->getBassLevel()')
    expect(cpp).toContain('_audioProcessor->getEqBin(i >> 1)')
    expect(cpp).toContain('void setupAudio()')
    expect(cpp).toContain('void updateAudio()')
    // wired into the lifecycle
    expect(cpp).toContain('setupAudio();')
    expect(cpp).toContain('updateAudio();')
  })

  it('prints FastLED processor levels and conditioner stats when Serial Debug is on', () => {
    const dbgMic = node('mic', 'MicInput', 'hardware', { serialDebug: true })
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const bp = node('bp', 'BassPulse', 'pattern', {})
    const on = generateCpp([micBoard, dbgMic, fft, bp, out], [
      edge('e1', 'mic', 'fft', 'audio', 'audio'),
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
    expect(on).toContain('#define MIC_DEBUG 1')
    expect(on).toContain('Serial.begin(115200);')
    expect(on).toContain('getSignalConditionerStats()')
    expect(on).toContain('Serial.printf("fastled audio bass=%.2f mids=%.2f treble=%.2f beat=%d bpm=%.0f gate=%d dc=%ld spikes=%lu\\n"')
    // Off by default — the print block is still emitted but compiled out.
    expect(micGraph()).toContain('#define MIC_DEBUG 0')
  })

  it('FFTAnalyzer resamples the live spectrum into bands when a mic is present', () => {
    const cpp = micGraph()
    // `bands` (default 24) genuinely drives resolution: the raw 32-bin
    // spectrum is resampled into a `_fftBands_<id>` array, then averaged in
    // contiguous thirds — not a direct read of FastLED's own _audioBass/
    // _audioMids/_audioTreble globals (which ignored `bands` entirely).
    expect(cpp).toContain('float _fftBands_fft[24];')
    expect(cpp).toContain('_sum += _audioSpectrum[_i];')
    expect(cpp).toContain('n_fft_bass_target = constrain(n_fft_bass_raw * 1.000f')
    expect(cpp).not.toContain('n_fft_bass_target = constrain(_audioBass')
    expect(cpp).not.toContain('float n_fft_bass = 0.5f')
  })

  it('applies FFT Analyzer gain and smoothing on-device', () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const fft = node('fft', 'FFTAnalyzer', 'audio', { gain: 1.5, smoothing: 0.8 })
    const bp = node('bp', 'BassPulse', 'pattern', {})
    const cpp = generateCpp([micBoard, mic, fft, bp, out], [
      edge('e1', 'mic', 'fft', 'audio', 'audio'),
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('n_fft_bass_raw * 1.500f')
    expect(cpp).toContain('_smooth * 0.800f')
    expect(cpp).toContain('* 0.200f')
  })

  it("FFTAnalyzer's bands property changes the generated resample resolution", () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const fft = node('fft', 'FFTAnalyzer', 'audio', { bands: 12 })
    const bp = node('bp', 'BassPulse', 'pattern', {})
    const cpp = generateCpp([micBoard, mic, fft, bp, out], [
      edge('e1', 'mic', 'fft', 'audio', 'audio'),
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('float _fftBands_fft[12];')
    expect(cpp).toContain('for (int _b = 0; _b < 12; _b++)')
  })

  it('emits SpectrumBars as a palette-driven on-device equalizer', () => {
    const sb = node('sb', 'SpectrumBars', 'pattern', {
      bass: 0.8,
      mids: 0.5,
      treble: 0.9,
      energy: 0.7,
      speed: 0.6,
      palette: 'ocean',
      mirror: true,
    })
    const cpp = generateCpp([sb, out], [edge('e1', 'sb', 'out', 'frame', 'frame')])
    expect(cpp).toContain('fill_solid(buf_sb, NUM_LEDS, CRGB::Black);')
    expect(cpp).toContain('float _levels[3] = { _b, _m, _t };')
    expect(cpp).toContain('float _paletteScroll = t * (0.08f + _spd * 0.42f);')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
    expect(cpp).toContain('WIDTH - 1 - _x')
    expect(cpp).not.toContain('// SpectrumBars')
  })

  it('keeps unwired audio-only patterns silent in firmware like the preview', () => {
    const bars = node('silentBars', 'SpectrumBars', 'pattern', {})
    const pulse = node('silentPulse', 'BassPulse', 'pattern', {})
    const barsCpp = generateCpp([bars, out], [edge('bars-out', 'silentBars', 'out', 'frame', 'frame')])
    const pulseCpp = generateCpp([pulse, out], [edge('pulse-out', 'silentPulse', 'out', 'frame', 'frame')])

    expect(barsCpp).toContain('float _b = min(1.0f, max(0.0f, 0))')
    expect(barsCpp).toContain('_m = min(1.0f, max(0.0f, 0))')
    expect(barsCpp).toContain('_t = min(1.0f, max(0.0f, 0))')
    expect(pulseCpp).toContain('float _lv = constrain(0, 0.0f, 1.0f)')
  })

  it('emits Audio to Hue in the documented 0-360 degree range', () => {
    const audioHue = node('ah', 'AudioHue', 'audio', { bass: 1, mids: 0.5, treble: 0.25 })
    const cpp = generateCpp([audioHue], [])

    expect(cpp).toContain('float n_ah_hue = ((1)*0.5f+(0.5)*0.3f+(0.25)*0.2f)*360.0f;')
    expect(cpp).not.toContain('uint8_t n_ah_hue')
  })

  it('bakes Audio to Hue band weights as literals', () => {
    const audioHue = node('ah', 'AudioHue', 'audio', {
      bass: 1, mids: 0.5, treble: 0.25,
      bassWeight: 0, midsWeight: 0.2, trebleWeight: 1,
    })
    const cpp = generateCpp([audioHue], [])

    expect(cpp).toContain('float n_ah_hue = ((1)*0.0f+(0.5)*0.2f+(0.25)*1.0f)*360.0f;')
  })

  it('keeps Turbulent Bloom responsive across FastLED\'s upper bass range', () => {
    const bloom = node('tb', 'TurbulentBloom', 'pattern', { bass: 0.8, mids: 0.5, treble: 0.5 })
    const cpp = generateCpp([bloom, out], [edge('tb-out', 'tb', 'out', 'frame', 'frame')])

    expect(cpp).toContain('_bassPulse=0.5f+sqrtf(constrain(_b,0.0f,1.0f))*0.5f')
    expect(cpp).not.toContain('_bassPulse=min(1.0f,0.5f+_b*0.9f)')
  })

  it('emits SpectrumVisualizer from the shared 32-bin spectrum with held gravity peaks', () => {
    const mic = node('svmic', 'MicInput', 'input', {})
    const visualizer = node('sv', 'SpectrumVisualizer', 'pattern', {
      style: 'Bars', bands: 16, gain: 1.25, smoothing: 0.58, tilt: 0.2,
      peakHold: 0.42, peakGravity: 1.8, waterfallSpeed: 10, palette: 'citrus',
    })
    const cpp = generateCpp([micBoard, mic, visualizer, out], [
      edge('sv-audio', 'svmic', 'sv', 'audio', 'audio'),
      edge('sv-frame', 'sv', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('SpectrumVisualizer · Bars')
    expect(cpp).toContain('float _svBands[16]')
    expect(cpp).toContain('_sum+=_audioSpectrum[_i]')
    expect(cpp).toContain('_svHold_sv[_x]=_svNow+420U')
    expect(cpp).toContain('_svVelocity_sv[_x]+=1.8000f*_svDt')
    expect(cpp).toContain('ColorFromPalette(paldef_citrus')
  })

  it('emits SpectrumVisualizer waterfall history and stays silent without wired audio', () => {
    const visualizer = node('svw', 'SpectrumVisualizer', 'pattern', {
      style: 'Waterfall', bands: 12, waterfallSpeed: 14, palette: 'ocean',
    })
    const cpp = generateCpp([visualizer, out], [edge('svw-frame', 'svw', 'out', 'frame', 'frame')])
    expect(cpp).toContain('SpectrumVisualizer · Waterfall')
    expect(cpp).toContain('::memmove(buf_svw,buf_svw+WIDTH')
    expect(cpp).toContain('Connect a Microphone to the Audio input')
    expect(cpp).not.toContain('_sum+=_audioSpectrum[_i]')
  })

  it('uses FastLED native beat and BPM for a live MicInput graph', () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const beat = node('bd', 'BeatDetect', 'audio', { threshold: 0.08, attack: 0.3, decay: 0.05 })
    const cpp = generateCpp([micBoard, mic, beat, out], [
      edge('e1', 'mic', 'bd', 'audio', 'audio'),
      edge('e2', 'bd', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('bool n_bd_beat = _audioBeat; float n_bd_bpm = _audioBpm;')
    expect(cpp).not.toContain('n_bd_detector_fast')
  })

  it('keeps the tunable BeatDetect envelope for external baked SD audio', () => {
    const beat = node('bd', 'BeatDetect', 'audio', { threshold: 0.08, attack: 0.3, decay: 0.05 })
    const cpp = generateCpp([beat], [], {}, { externalAudio: true })
    expect(cpp).toContain('bool n_bd_beat = false;')
    expect(cpp).toContain('n_bd_detector_fast += (_flux - n_bd_detector_fast)')
    expect(cpp).toContain('_audioSpectrum[_i] - n_bd_detector_prevSpectrum[_i]')
  })

  it('emits heuristic PercussionDetect envelopes from the live spectrum', () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const perc = node('pd', 'PercussionDetect', 'audio', { sensitivity: 0.65, decay: 0.6, separation: 0.5 })
    const cpp = generateCpp([micBoard, mic, perc, out], [
      edge('e1', 'mic', 'pd', 'audio', 'audio'),
      edge('e2', 'pd', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('static float n_pd_perc_prevSpectrum[32];')
    expect(cpp).toContain('float n_pd_kick = 0.0f, n_pd_snare = 0.0f, n_pd_hihat = 0.0f;')
    expect(cpp).toContain('_audioSpectrum[_i]')
    expect(cpp).toContain('_kickTarget')
    expect(cpp).toContain('_hihatTarget')
  })

  it('emits heuristic AudioFeatures outputs from the live spectrum', () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const feat = node('af', 'AudioFeatures', 'audio', { sensitivity: 0.6, gate: 0.1, smoothing: 0.2 })
    const cpp = generateCpp([micBoard, mic, feat, out], [
      edge('e1', 'mic', 'af', 'audio', 'audio'),
      edge('e2', 'af', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('static float n_af_feat_prevSpectrum[32];')
    expect(cpp).toContain('float n_af_vocals = 0.0f, n_af_energy = 0.0f;')
    expect(cpp).toContain('bool n_af_silence = n_af_energy <')
    expect(cpp).toContain('_presenceFlux')
    expect(cpp).toContain('_energyTarget')
  })

  it('softens VocalAurora input in generated firmware', () => {
    const aurora = node('aurora', 'VocalAurora', 'pattern', { vocals: 1, energy: 0.7 })
    const cpp = generateCpp([aurora, out], [
      edge('e1', 'aurora', 'out', 'frame', 'frame'),
    ])

    expect(cpp).toContain('float _rawLevel=')
    expect(cpp).toContain('_rawLevel*(0.5f+_rawLevel*0.2f)')
    // Drift is an integrated phase accumulator, not absolute t scaled by the
    // level-dependent rate (which would jump on every vocals change).
    expect(cpp).toContain('_vaPhase_aurora+=_vaDt_aurora')
    expect(cpp).toContain('float _drift=_vaPhase_aurora;')
    expect(cpp).not.toContain('float _drift=t*')
  })

  it('integrates audio-modulated drift phases in generated firmware', () => {
    // Same accumulator pattern as VocalAurora for every node whose animation
    // rate depends on a live audio level (see the matching evaluator test).
    const cases: Array<[string, string[]]> = [
      ['BeatKaleidoscope', ['_bkPhase_n1+=_bkDt_n1', 'float _rot=_bkPhase_n1']],
      ['SpectraMosaic', ['_smPhase_n1+=_smDt_n1', 'float _phase=_cx*0.6f+_cy*0.9f+_smPhase_n1;']],
      ['TurbulentBloom', ['_tbFast_n1+=_tbDt_n1', 'float _tFast=_tbFast_n1,_tSlow=_tbSlow_n1;']],
      ['PrismStorm', ['_psPhase_n1+=_psDt_n1', 'float _drift=_psPhase_n1;']],
      ['AudioFlow', ['_afPhase_n1+=_afDt_n1', 'float _flow=_afPhase_n1;']],
    ]
    for (const [type, expected] of cases) {
      const gen = node('n1', type, 'pattern')
      const cpp = generateCpp([gen, out], [edge('e1', 'n1', 'out', 'frame', 'frame')])
      for (const snippet of expected) expect(cpp, type).toContain(snippet)
    }
  })

  it('honours the selected I2S channel', () => {
    expect(micGraph('Left')).toContain('fl::audio::AudioChannel::Left')
    expect(micGraph('Right')).toContain('fl::audio::AudioChannel::Right')
  })

  it.each([
    ['teensy-4-0', 'CreateTeensyI2S', '#include <Audio.h>'],
    ['raspberry-pi-pico', 'class StudioInmp441Input', '#include <I2S.h>'],
    ['adafruit-feather-m4-express', 'Adafruit_ZeroI2S _i2s', '#include <Adafruit_ZeroI2S.h>'],
    ['weact-black-pill-f411ce', 'STM32 SPI2/I2S2 polling receiver', 'SPI2->I2SCFGR'],
  ])('emits the %s capture adapter while keeping the shared processor contract', (profileId, capture, include) => {
    const board = node('board', 'Board', 'hardware', { profileId })
    const mic = node('mic', 'MicInput', 'hardware', {})
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const bp = node('bp', 'BassPulse', 'pattern', {})
    const cpp = generateCpp([board, mic, fft, bp, out], [
      edge('e1', 'mic', 'fft', 'audio', 'audio'),
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain(capture)
    expect(cpp).toContain(include)
    expect(cpp).toContain('_audioProcessor->getBassLevel()')
    expect(cpp).toContain('_audioProcessor->getEqBin(i >> 1)')
  })

  it('selects the dependency-free SAMD51 software-SPI fallback before FastLED is included', () => {
    const board = node('board', 'Board', 'hardware', { profileId: 'adafruit-feather-m4-express' })
    const mic = node('mic', 'MicInput', 'hardware', {})
    const cpp = generateCpp([board, mic, out], [])
    expect(cpp.indexOf('#define FASTLED_FORCE_SOFTWARE_SPI 1')).toBeLessThan(cpp.indexOf('#include <FastLED.h>'))
  })

  it('falls back to silence with no mic node', () => {
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const bp = node('bp', 'BassPulse', 'pattern', {})
    const cpp = generateCpp([fft, bp, out], [
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
    expect(cpp).not.toContain('driver/i2s.h')
    expect(cpp).not.toContain('updateAudio()')
    expect(cpp).toContain('_sum += 0.0f;')
    expect(cpp).toContain('constrain(n_fft_bass_raw * 1.000f')
    expect(cpp).toContain('float n_fft_bass = n_fft_bass_smooth')
  })

  it('externalAudio references the live spectrum without emitting the engine', () => {
    // A host controller provides _audioSpectrum etc.; this subgraph must
    // resample the live array (not the always-zero placeholder) yet not
    // re-declare the engine.
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const bp = node('bp', 'BassPulse', 'pattern', {})
    const cpp = generateCpp([fft, bp, out], [
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ], {}, { externalAudio: true })
    expect(cpp).toContain('_sum += _audioSpectrum[_i];')   // live global, not the 0.0f placeholder
    expect(cpp).not.toContain('_sum += 0.0f;')
    expect(cpp).toContain('constrain(n_fft_bass_raw * 1.000f')
    expect(cpp).not.toContain('void updateAudio()')          // engine is the host's job
    expect(cpp).not.toContain('driver/i2s.h')
    expect(cpp).not.toContain('setupAudio();')
  })
})

describe('audioEngineForGraph', () => {
  const micBoard = node('board', 'Board', 'hardware', { profileId: 'espressif-esp32-s3-devkitc-1' })
  it('returns null when the graph has no MicInput', () => {
    expect(audioEngineForGraph([node('fft', 'FFTAnalyzer', 'audio', {})])).toBeNull()
  })

  it('returns FastLED processor setup when a MicInput is present', () => {
    const mic = node('mic', 'MicInput', 'hardware', { i2sWs: 39, i2sSck: 40, i2sSd: 41, channel: 'Right' })
    const eng = audioEngineForGraph([micBoard, mic])!
    expect(eng.include).toContain('same FastLED Processor contract as preview')
    expect(eng.backend).toBe('fastled-esp32')
    expect(eng.fqbn).toBe('esp32:esp32:esp32s3')
    const joined = eng.code.join('\n')
    expect(joined).toContain('void setupAudio()')
    expect(joined).toContain('void updateAudio()')
    expect(joined).toContain('fl::audio::AudioChannel::Right')
    expect(joined).toContain('FastLED.add(config)')
    expect(joined).not.toContain('i2s_driver_install')
  })

  it('does not invent a firmware target when no Board node is selected', () => {
    expect(audioEngineForGraph([node('mic', 'MicInput', 'hardware', {})])).toBeNull()
  })
})

describe('PSRAM buffer placement (MatrixOutput usePsram)', () => {
  const psOut = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, dataPin: 5, usePsram: true })
  const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
  // A Fade sits between the source and the output so `buf_sc` is a real
  // placeable buffer — the node feeding the output aliases `leds` instead of
  // owning one, and `leds` never moves to PSRAM.
  const fd = node('fd', 'Fade', 'composite', { fade: 0.5 })
  const wiring = [edge('e1', 'sc', 'fd', 'frame', 'frame'), edge('e2', 'fd', 'out', 'frame', 'frame')]

  it('moves per-node buffers to _psAlloc and keeps leds internal', () => {
    const cpp = generateCpp([sc, fd, psOut], wiring)
    expect(cpp).toContain('CRGB* buf_sc = nullptr;')
    expect(cpp).toContain('buf_sc = (CRGB*)_psAlloc(sizeof(CRGB) * NUM_LEDS);')
    expect(cpp).toContain('void* _psAlloc(size_t n)')
    // leds stays a static internal-RAM array — FastLED's ESP32 drivers read it
    // from ISR/DMA context where PSRAM access can fault.
    expect(cpp).toContain('CRGB leds[NUM_LEDS];')
    expect(cpp).not.toContain('CRGB buf_sc[NUM_LEDS];')
    // …and the aliased terminal buffer is `leds`, so it is never allocated.
    expect(cpp).toContain('CRGB* const buf_fd = leds;')
    expect(cpp).not.toContain('buf_fd = (CRGB*)_psAlloc')
  })

  it('ignores a stale toggle when the board has no PSRAM (psramAllowed: false)', () => {
    const cpp = generateCpp([sc, fd, psOut], wiring, {}, { psramAllowed: false })
    expect(cpp).toContain('CRGB buf_sc[NUM_LEDS];')
    expect(cpp).not.toContain('_psAlloc')
  })

  it('emits plain static buffers when the toggle is off', () => {
    const cpp = generateCpp([sc, fd, outputNode], wiring)
    expect(cpp).toContain('CRGB buf_sc[NUM_LEDS];')
    expect(cpp).not.toContain('_psAlloc')
  })
})

describe('HUB75 codegen (docs/development/design/hub75-output.md)', () => {
  const hub75Out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'HUB75' })
  const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
  const wiring = [edge('e1', 'sc', 'out', 'frame', 'frame')]

  it('drives the DMA display instead of FastLED addLeds<>()', () => {
    const cpp = generateCpp([sc, hub75Out], wiring)
    expect(cpp).toContain('#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>')
    expect(cpp).toContain('MatrixPanel_I2S_DMA *dma_display = nullptr;')
    expect(cpp).not.toContain('FastLED.addLeds<')
    expect(cpp).not.toContain('CRGB leds[')
    expect(cpp).not.toContain('#define DATA_PIN')
    expect(cpp).not.toContain('#define CLOCK_PIN')
    expect(cpp).not.toContain('FastLED.show();')
  })

  it('emits the documented default pinout with E disabled (-1) when wide-scan is off', () => {
    const cpp = generateCpp([sc, hub75Out], wiring)
    expect(cpp).toContain(
      'HUB75_I2S_CFG::i2s_pins _hub75Pins = { 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, -1, 17, 18, 0 };',
    )
    expect(cpp).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 1, _hub75Pins);')
    expect(cpp).toContain('_hub75Cfg.setPixelColorDepthBits(8);')
    expect(cpp).toContain('dma_display = new MatrixPanel_I2S_DMA(_hub75Cfg);')
    expect(cpp).toContain('dma_display->begin();')
    expect(cpp).toContain('dma_display->setBrightness8(200);')
  })

  it('wires the real E pin when hub75WideScan is on', () => {
    const wideOut = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'HUB75', hub75WideScan: true, hub75EPin: 22 })
    const cpp = generateCpp([sc, wideOut], wiring)
    expect(cpp).toContain('_hub75Pins = { 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 22, 17, 18, 0 };')
  })

  it('draws the composited frame per-pixel via drawPixelRGB888', () => {
    const cpp = generateCpp([sc, hub75Out], wiring)
    expect(cpp).toContain('for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {')
    expect(cpp).toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
  })

  it('clears the panel instead of writing garbage when nothing is wired', () => {
    const cpp = generateCpp([hub75Out], [])
    expect(cpp).toContain('dma_display->clearScreen();')
    expect(cpp).not.toContain('drawPixelRGB888')
  })

  it('respects a custom color depth', () => {
    const deepOut = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, chipset: 'HUB75', hub75ColorDepthBits: 4 })
    const cpp = generateCpp([sc, deepOut], wiring)
    expect(cpp).toContain('_hub75Cfg.setPixelColorDepthBits(4);')
  })

  it('drives a single-row panel chain via chain_length, no VirtualMatrixPanel wrapper', () => {
    // 24-wide composed matrix, 3 panels of 8px each in a single row: the DMA
    // library's base class addresses the whole chain directly, so this is
    // still per-pixel drawPixelRGB888(x, y) over the FULL composed canvas —
    // no XY remap, no extra include.
    const chainedOut = node('out', 'MatrixOutput', 'output', {
      width: 24, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 3, tilesY: 1,
    })
    const cpp = generateCpp([sc, chainedOut], wiring)
    expect(cpp).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 3, _hub75Pins);')
    expect(cpp).not.toContain('VirtualMatrixPanel')
    expect(cpp).toContain('for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {')
    expect(cpp).toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
  })

  it('remaps square-tile per-panel rotation through a HUB75 coord table', () => {
    const rotatedOut = node('out', 'MatrixOutput', 'output', {
      width: 16, height: 8, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 1, tileRotations: '0,90',
    })
    const cpp = generateCpp([sc, rotatedOut], wiring)
    expect(cpp).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
    expect(cpp).toContain('uint16_t _hub75XY = pgm_read_word(&_hub75CoordMap[_y * WIDTH + _x]);')
    expect(cpp).toContain('dma_display->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
    expect(cpp).not.toContain('dma_display->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
  })

  it('skips setMaxPowerInVoltsAndMilliamps — no FastLED controller is registered to throttle', () => {
    const poweredOut = node('out', 'MatrixOutput', 'output', {
      width: 8, height: 8, chipset: 'HUB75', powerLimit: true, volts: 5, milliamps: 2000,
    })
    const cpp = generateCpp([sc, poweredOut], wiring)
    expect(cpp).not.toContain('setMaxPowerInVoltsAndMilliamps')
  })

  it('drives a folded 2D panel grid via VirtualMatrixPanel_T', () => {
    // 16x16 composed canvas, 2x2 grid of 8px panels folded into a virtual
    // module — the base DMA class can only address one row's height
    // directly, so a 2D grid needs the VirtualMatrixPanel_T wrapper.
    const gridOut = node('out', 'MatrixOutput', 'output', {
      width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2,
    })
    const cpp = generateCpp([sc, gridOut], wiring)
    expect(cpp).toContain('#include <ESP32-HUB75-VirtualMatrixPanel_T.hpp>')
    expect(cpp).toContain('HUB75_I2S_CFG _hub75Cfg(8, 8, 4, _hub75Pins);')
    expect(cpp).toContain('VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN> *hub75Virtual = nullptr;')
    expect(cpp).toContain('hub75Virtual = new VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN>(2, 2, 8, 8);')
    expect(cpp).toContain('hub75Virtual->setDisplay(*dma_display);')
    expect(cpp).toContain('for (int _y = 0; _y < HEIGHT; _y++) for (int _x = 0; _x < WIDTH; _x++) {')
    expect(cpp).toContain('hub75Virtual->drawPixelRGB888(_x, _y, _c.r, _c.g, _c.b);')
  })

  it('remaps rotated tiles before drawing into a folded 2D HUB75 virtual grid', () => {
    const rotatedGridOut = node('out', 'MatrixOutput', 'output', {
      width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2, tileRotations: '0,90,180,270',
    })
    const cpp = generateCpp([sc, rotatedGridOut], wiring)
    expect(cpp).toContain('const uint16_t _hub75CoordMap[NUM_LEDS] PROGMEM = {')
    expect(cpp).toContain('hub75Virtual->drawPixelRGB888(_hub75XY & 0xFF, _hub75XY >> 8, _c.r, _c.g, _c.b);')
  })

  it('selects the zig-zag chain type when the panel chain is serpentine', () => {
    const gridOut = node('out', 'MatrixOutput', 'output', {
      width: 16, height: 16, chipset: 'HUB75', layout: 'panels', tilesX: 2, tilesY: 2, tileSerpentine: true,
    })
    const cpp = generateCpp([sc, gridOut], wiring)
    expect(cpp).toContain('VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN_ZZ> *hub75Virtual = nullptr;')
    expect(cpp).toContain('hub75Virtual = new VirtualMatrixPanel_T<CHAIN_TOP_LEFT_DOWN_ZZ>(2, 2, 8, 8);')
  })
})

describe('signal utility nodes (Smooth / SampleHold / Switch / Envelope / FrameSwitch)', () => {
  // Each scalar node drives BrightnessMod so its output participates in the sketch.
  const tail = (srcId: string, srcPort: string) => {
    const sc = node('bg', 'SolidColor', 'pattern', { r: 255, g: 255, b: 255 })
    const bm = node('bm', 'BrightnessMod', 'composite', {})
    return {
      nodes: [sc, bm, outputNode],
      edges: [
        edge('t1', 'bg', 'bm', 'frame', 'frame'),
        edge('t2', srcId, 'bm', srcPort, 'brightness'),
        edge('t3', 'bm', 'out', 'frame', 'frame'),
      ],
    }
  }

  it('Smooth emits a millis()-based EMA seeded from the first sample', () => {
    const t = tail('sm', 'result')
    const cpp = generateCpp([node('sm', 'Smooth', 'math', { value: 0.5, response: 0.25 }), ...t.nodes], t.edges)
    expect(cpp).toContain('static float n_sm_result')
    expect(cpp).toContain('expf(')
    expect(cpp).toContain('0.250f')
  })

  it('Smooth with ~0 response is a passthrough', () => {
    const t = tail('sm', 'result')
    const cpp = generateCpp([node('sm', 'Smooth', 'math', { value: 0.5, response: 0 }), ...t.nodes], t.edges)
    expect(cpp).toContain('float n_sm_result = 0.5;')
    expect(cpp).not.toContain('expf(')
  })

  it('SampleHold latches on a rising edge with static state', () => {
    const t = tail('sh', 'result')
    const iv = node('iv', 'Interval', 'signal', { interval: 1 })
    const cpp = generateCpp([iv, node('sh', 'SampleHold', 'math', { value: 0.5 }), ...t.nodes],
      [edge('e0', 'iv', 'sh', 'pulse', 'trigger'), ...t.edges])
    expect(cpp).toContain('static float n_sh_result')
    expect(cpp).toContain('_t && !_shP_sh')
    expect(cpp).toContain('n_iv_pulse')
  })

  it('Switch emits a ternary over both live inputs', () => {
    const t = tail('sw', 'result')
    const cpp = generateCpp([node('sw', 'Switch', 'math', { a: 0.25, b: 0.75 }), ...t.nodes], t.edges)
    expect(cpp).toContain('float n_sw_result = (false) ? (0.75) : (0.25);')
  })

  it('Envelope decays from a millis() fire time over the decay window', () => {
    const t = tail('env', 'result')
    const iv = node('iv', 'Interval', 'signal', { interval: 1 })
    const cpp = generateCpp([iv, node('env', 'Envelope', 'signal', { decay: 0.5 }), ...t.nodes],
      [edge('e0', 'iv', 'env', 'pulse', 'trigger'), ...t.edges])
    expect(cpp).toContain('static uint32_t _envT_env')
    expect(cpp).toContain('constrain(1.0f - _envAge_env / 500.0f, 0.0f, 1.0f)')
  })

  it('Envelope emits an attack ramp when configured', () => {
    const t = tail('env', 'result')
    const iv = node('iv', 'Interval', 'signal', { interval: 1 })
    const cpp = generateCpp([iv, node('env', 'Envelope', 'signal', { attack: 0.25, decay: 0.5 }), ...t.nodes],
      [edge('e0', 'iv', 'env', 'pulse', 'trigger'), ...t.edges])
    expect(cpp).toContain('_envAge_env < 250u')
    expect(cpp).toContain('_envAge_env / 250.0f')
    expect(cpp).toContain('(_envAge_env - 250u) / 500.0f')
  })

  it('Trigger debounce emits a millis()-based stability window', () => {
    const t = tail('trb', 'out')
    const cpp = generateCpp([node('trb', 'Trigger', 'math', { triggerOp: 'debounce', stableTime: 0.2 }), ...t.nodes], t.edges)
    expect(cpp).toContain('_trSince_trb')
    expect(cpp).toContain('200u')
  })

  it('Trigger toggle flips a static bool on each rising edge', () => {
    const t = tail('trt', 'out')
    const cpp = generateCpp([node('trt', 'Trigger', 'math', { triggerOp: 'toggle' }), ...t.nodes], t.edges)
    expect(cpp).toContain('static bool n_trt_out = false;')
    expect(cpp).toContain('n_trt_out = !n_trt_out;')
  })

  it('Trigger oneShot holds true for holdTime after a rising edge', () => {
    const t = tail('tro', 'out')
    const cpp = generateCpp([node('tro', 'Trigger', 'math', { triggerOp: 'oneShot', holdTime: 0.3 }), ...t.nodes], t.edges)
    expect(cpp).toContain('_trT_tro')
    expect(cpp).toContain('300u')
  })

  it('Trigger pulseDivider counts rising edges up to divideBy', () => {
    const t = tail('trd', 'out')
    const cpp = generateCpp([node('trd', 'Trigger', 'math', { triggerOp: 'pulseDivider', divideBy: 4 }), ...t.nodes], t.edges)
    expect(cpp).toContain('_trC_trd >= 4')
  })

  it('Trigger delay schedules a millis() fire time after the rising edge', () => {
    const t = tail('trl', 'out')
    const cpp = generateCpp([node('trl', 'Trigger', 'math', { triggerOp: 'delay', delayTime: 0.4 }), ...t.nodes], t.edges)
    expect(cpp).toContain('_trS_trl = millis() + 400u;')
  })

  it('FrameSwitch copies the selected source buffer', () => {
    const a = node('fa', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const b = node('fb', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 })
    const fs = node('fs', 'FrameSwitch', 'composite', {})
    const cpp = generateCpp([a, b, fs, outputNode], [
      edge('e1', 'fa', 'fs', 'frame', 'a'),
      edge('e2', 'fb', 'fs', 'frame', 'b'),
      edge('e3', 'fs', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('::memmove(buf_fs, (false) ? buf_fb : buf_fa, sizeof(CRGB) * NUM_LEDS);')
  })

  it('FrameSwitch with one wired side copies it regardless of sel', () => {
    const a = node('fa', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const fs = node('fs', 'FrameSwitch', 'composite', {})
    const cpp = generateCpp([a, fs, outputNode], [
      edge('e1', 'fa', 'fs', 'frame', 'a'),
      edge('e3', 'fs', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('::memmove(buf_fs, buf_fa, sizeof(CRGB) * NUM_LEDS);')
  })
})

describe('Zones', () => {
  it('seeds from base then copies each enabled+wired zone into its own rectangle', () => {
    const base = node('zbase', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const a = node('za', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const zones = node('zn', 'Zones', 'composite', { aX: 0, aY: 0, aW: 0.5, aH: 1 })
    const cpp = generateCpp([base, a, zones, outputNode], [
      edge('e1', 'zbase', 'zn', 'frame', 'base'),
      edge('e2', 'za', 'zn', 'frame', 'a'),
      edge('e3', 'zn', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('::memmove(buf_zn, buf_zbase, sizeof(CRGB) * NUM_LEDS);')
    expect(cpp).toContain('for (int _y=(int)(0.0f*HEIGHT); _y<(int)(1.0f*HEIGHT) && _y<HEIGHT; _y++)')
    expect(cpp).toContain('for (int _x=(int)(0.0f*WIDTH); _x<(int)(0.5f*WIDTH) && _x<WIDTH; _x++)')
    expect(cpp).toContain('buf_zn[_y*WIDTH+_x] = buf_za[_y*WIDTH+_x];')
  })

  it('seeds black when base is unwired, and skips a disabled zone', () => {
    const a = node('za2', 'SolidColor', 'pattern', { r: 9, g: 9, b: 9 })
    const zones = node('zn2', 'Zones', 'composite', { aEnabled: false })
    const cpp = generateCpp([a, zones, outputNode], [
      edge('e1', 'za2', 'zn2', 'frame', 'a'),
      edge('e2', 'zn2', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('fill_solid(buf_zn2, NUM_LEDS, CRGB::Black);')
    expect(cpp).not.toContain('buf_zn2[_y*WIDTH+_x] = buf_za2[_y*WIDTH+_x];')
  })
})

describe('Trails (feedback/persistence)', () => {
  it('fades the persistent buffer in place and re-lightens from the input (no reset)', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const tr = node('tr', 'Trails', 'composite', { decay: 0.4 })
    const cpp = generateCpp([sc, tr, outputNode], [
      edge('e1', 'sc', 'tr', 'frame', 'frame'),
      edge('e2', 'tr', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB* const buf_tr = leds;')
    expect(cpp).toContain('float _decay = constrain(0.4,0.0f,1.0f); _decay = _decay*_decay*_decay;')
    expect(cpp).toContain('fadeToBlackBy(buf_tr, NUM_LEDS, (uint8_t)(_decay*255.0f));')
    expect(cpp).toContain('if(buf_sc[_i].r>buf_tr[_i].r)buf_tr[_i].r=buf_sc[_i].r;')
    // No memmove/fill_solid seeding buf_tr from buf_sc — it must persist across frames.
    expect(cpp).not.toContain('::memmove(buf_tr')
  })

  it('fills solid black when unwired', () => {
    const tr = node('tr', 'Trails', 'composite', {})
    const cpp = generateCpp([tr, outputNode], [edge('e1', 'tr', 'out', 'frame', 'frame')])
    expect(cpp).toContain('fill_solid(buf_tr, NUM_LEDS, CRGB::Black);')
  })
})

describe('FrameFeedback (bounded delay feedback)', () => {
  it('emits a fixed recursive ring buffer and stores the produced output', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const fb = node('fb', 'FrameFeedback', 'composite', {
      delayFrames: 2,
      fade: 0.1,
      amount: 0.6,
      blendMode: 'screen',
      feedbackTransform: 'translate',
      offsetX: 1,
      offsetY: 0,
    })
    const cpp = generateCpp([sc, fb, outputNode], [
      edge('e1', 'sc', 'fb', 'frame', 'frame'),
      edge('e2', 'fb', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB _fb_fb[3][NUM_LEDS];')
    expect(cpp).toContain('uint8_t _fb_read_fb=(_fb_idx_fb+_fb_cap_fb-2)%_fb_cap_fb;')
    expect(cpp).toContain('float _fb_fade_fb=1.0f-constrain(0.1,0.0f,1.0f);')
    expect(cpp).toContain('CRGB _fb=_fb_fb[_fb_read_fb][_sy*WIDTH+_sx];')
    expect(cpp).toContain('::memmove(_fb_fb[_fb_idx_fb], buf_fb, sizeof(CRGB) * NUM_LEDS);')
  })
})

describe('FieldNoise / FrameToField', () => {
  it('FieldNoise declares a field buffer and writes an inoise8-based fBm', () => {
    const fn = node('fn', 'FieldNoise', 'pattern', { speed: 0.4, scale: 0.3, octaves: 3 })
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'ocean' })
    const cpp = generateCpp(
      [fn, f2f, outputNode],
      [edge('e1', 'fn', 'f2f', 'field', 'field'), edge('e2', 'f2f', 'out', 'frame', 'frame')],
    )
    expect(cpp).toContain('float field_fn[NUM_LEDS];')
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('for(int _o=0;_o<3;_o++){')
  })

  it('FrameToField extracts average brightness per pixel', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 128, b: 0 })
    const f2f = node('f2f', 'FrameToField', 'pattern', {})
    const back = node('back', 'FieldToFrame', 'pattern', { palette: 'ocean' })
    const cpp = generateCpp(
      [sc, f2f, back, outputNode],
      [
        edge('e1', 'sc', 'f2f', 'frame', 'frame'),
        edge('e2', 'f2f', 'back', 'field', 'field'),
        edge('e3', 'back', 'out', 'frame', 'frame'),
      ],
    )
    expect(cpp).toContain('float field_f2f[NUM_LEDS];')
    expect(cpp).toContain('field_f2f[_i]=(buf_sc[_i].r+buf_sc[_i].g+buf_sc[_i].b)/3.0f/255.0f;')
  })

  it('FrameToField zeroes the field when unwired', () => {
    const f2f = node('f2f', 'FrameToField', 'pattern', {})
    const back = node('back', 'FieldToFrame', 'pattern', { palette: 'ocean' })
    const cpp = generateCpp(
      [f2f, back, outputNode],
      [edge('e1', 'f2f', 'back', 'field', 'field'), edge('e2', 'back', 'out', 'frame', 'frame')],
    )
    expect(cpp).toContain('field_f2f[_i]=0.0f;')
  })
})

describe('Pride2015 / Pacifica (codegen)', () => {
  it('Pride2015 emits the shared per-pixel loop mapped through CHSV', () => {
    const pr = node('pr', 'Pride2015', 'pattern', { speed: 0.4, scale: 0.4 })
    const cpp = generateCpp([pr, outputNode], [edge('e1', 'pr', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB* const buf_pr = leds;')
    expect(cpp).toContain('buf_pr[_y*WIDTH+_x]=CHSV(')
    expect(cpp).toContain('fmodf(_i*_sc*6.0f+t*_spd*40.0f,360.0f)')
  })

  it('Pacifica emits the layered-wave formula through ColorFromPalette with a whitecap blend', () => {
    const pa = node('pa', 'Pacifica', 'pattern', { speed: 0.35, scale: 0.5, palette: 'ocean' })
    const cpp = generateCpp([pa, outputNode], [edge('e1', 'pa', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB* const buf_pa = leds;')
    expect(cpp).toContain('ColorFromPalette(paldef_ocean,(uint8_t)(_n*255.0f))')
    expect(cpp).toContain('if(_foam>0.85f)')
  })

  it('TwinkleFox emits the shared per-pixel hash + twinkle cycle through the palette', () => {
    const tf = node('tf', 'TwinkleFox', 'pattern', { speed: 0.5, density: 0.5, palette: 'party' })
    const cpp = generateCpp([tf, outputNode], [edge('e1', 'tf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB* const buf_tf = leds;')
    expect(cpp).toContain('int _si=_i+0;')
    expect(cpp).toContain('_ph=sinf(_si*12.9898f)*43758.5453f')
    expect(cpp).toContain('float _tri=1.0f-fabsf(2.0f*_cy-1.0f);')
    expect(cpp).toContain('ColorFromPalette(paldef_party,(uint8_t)(_ci*255.0f))')
    expect(cpp).toContain('_px.nscale8_video((uint8_t)(_bri*255.0f))')
  })

  it('Scanner emits a ping-pong palette beam along the selected axis', () => {
    const sc = node('sc', 'Scanner', 'pattern', { speed: 0.45, width: 2, fade: 0.6, axis: 'vertical', palette: 'lava' })
    const cpp = generateCpp([sc, outputNode], [edge('e1', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB* const buf_sc = leds;')
    expect(cpp).toContain('float _travel=_ph<=1.0f?_ph:2.0f-_ph;')
    expect(cpp).toContain('ColorFromPalette(paldef_lava,(uint8_t)(_travel*255.0f))')
    expect(cpp).toContain('float _coord=(float)_y;')
    expect(cpp).toContain('_px.nscale8_video((uint8_t)(_v*255.0f));')
  })

  it('Confetti emits persistent fade-and-sprinkle palette logic', () => {
    const cf = node('cf', 'Confetti', 'pattern', { speed: 0.45, density: 0.45, fade: 0.28, palette: 'party' })
    const cpp = generateCpp([cf, outputNode], [edge('e1', 'cf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB* const buf_cf = leds;')
    expect(cpp).toContain('fadeToBlackBy(buf_cf, NUM_LEDS, (uint8_t)(_fd * 255.0f));')
    expect(cpp).toContain('int _spawns=(int)(_den * (0.08f + _spd * 0.2142857f) * sqrtf((float)NUM_LEDS));')
    expect(cpp).toContain('buf_cf[_i] += ColorFromPalette(paldef_party, random8() + _drift);')
  })

  it('Juggle emits fading multi-dot palette motion and supports the Sinelon count=1 case', () => {
    const jg = node('jg', 'Juggle', 'pattern', { speed: 0.5, count: 1, fade: 0.22, palette: 'rainbow' })
    const cpp = generateCpp([jg, outputNode], [edge('e1', 'jg', 'out', 'frame', 'frame')])
    expect(cpp).toContain('CRGB* const buf_jg = leds;')
    expect(cpp).toContain('const int _dots=1;')
    expect(cpp).toContain('fadeToBlackBy(buf_jg, NUM_LEDS, (uint8_t)(_fd * 255.0f));')
    expect(cpp).toContain('float _phase=0.0f;')
    expect(cpp).toContain('float _travel=sinf(t*_spd*(2.5f+_d*0.35f)+_d*0.9f+_phase)*0.5f+0.5f;')
    expect(cpp).toContain('ColorFromPalette(paldef_rainbow, (uint8_t)fmodf((_travel*0.35f+_d/(float)_dots)*255.0f, 255.0f));')
  })
})

describe('Saturation / RGBToHSV (codegen)', () => {
  it('Saturation scales sat via rgb2hsv_approximate and reconstructs with CHSV', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 200, g: 50, b: 50 })
    const satn = node('satn', 'Saturation', 'composite', { amount: 0 })
    const cpp = generateCpp(
      [sc, satn, outputNode],
      [edge('e1', 'sc', 'satn', 'frame', 'frame'), edge('e2', 'satn', 'out', 'frame', 'frame')],
    )
    expect(cpp).toContain('rgb2hsv_approximate(buf_satn[_i])')
    expect(cpp).toContain('_hs.sat * (0)')
  })

  it('ColorBoost emits luminance-preserving channel scaling', () => {
    const sc = node('scb', 'SolidColor', 'pattern', { r: 170, g: 140, b: 120 })
    const cb = node('cb', 'ColorBoost', 'composite', { boost: 1 })
    const cpp = generateCpp(
      [sc, cb, outputNode],
      [edge('e1', 'scb', 'cb', 'frame', 'frame'), edge('e2', 'cb', 'out', 'frame', 'frame')],
    )
    expect(cpp).toContain('float _cb = constrain(1, 0.0f, 1.0f);')
    expect(cpp).toContain('float _l = buf_cb[_i].r * 0.2126f + buf_cb[_i].g * 0.7152f + buf_cb[_i].b * 0.0722f;')
    expect(cpp).toContain('buf_cb[_i].r = (uint8_t)constrain(_l + (buf_cb[_i].r - _l) * _cs, 0.0f, 255.0f);')
  })

  it('BlendColors emits editable fallback swatches when color inputs are unwired', () => {
    const bc = node('bc', 'BlendColors', 'color', {
      rA: 10, gA: 20, bA: 30,
      rB: 110, gB: 220, bB: 130,
      t: 0.25,
    })
    const cpp = generateCpp([bc], [])
    expect(cpp).toContain('CRGB n_bc_color = blend(CRGB(10,20,30), CRGB(110,220,130), (uint8_t)((0.25) * 255));')
  })

  it('RGBToHSV emits h/s/v floats via rgb2hsv_approximate', () => {
    const c = node('c', 'CHSV', 'color', { hue: 0, sat: 255, val: 255 })
    const rh = node('rh', 'RGBToHSV', 'color', {})
    const sc = node('sc', 'SolidColor', 'pattern', {})
    const bm = node('bm', 'BrightnessMod', 'composite', {})
    const cpp = generateCpp(
      [c, rh, sc, bm, outputNode],
      [
        edge('e1', 'c', 'rh', 'rgb', 'rgb'),
        edge('e2', 'sc', 'bm', 'frame', 'frame'),
        edge('e3', 'rh', 'bm', 'v', 'brightness'),
        edge('e4', 'bm', 'out', 'frame', 'frame'),
      ],
    )
    expect(cpp).toContain('CHSV _hsv_rh = rgb2hsv_approximate(n_c_rgb);')
    expect(cpp).toContain('float n_rh_h = _hsv_rh.hue / 255.0f * 360.0f;')
    expect(cpp).toContain('float n_rh_s = _hsv_rh.sat / 255.0f;')
    expect(cpp).toContain('float n_rh_v = _hsv_rh.val / 255.0f;')
  })

  it('RGBToHSV emits its editable color fallback when unwired', () => {
    const rh = node('rh', 'RGBToHSV', 'color', { r: 0, g: 255, b: 0 })
    const cpp = generateCpp([rh], [])
    expect(cpp).toContain('CHSV _hsv_rh = rgb2hsv_approximate(CRGB(0,255,0));')
  })
})

describe('EncoderInput (codegen)', () => {
  it('emits a polling quadrature decode with static per-node state', () => {
    const enc = node('enc', 'EncoderInput', 'input', { pinA: 32, pinB: 33, pinSW: 25 })
    const cpp = generateCpp([enc], [])
    expect(cpp).toContain('static int8_t _encLast_enc = 0; static float _encPos_enc = 0;')
    expect(cpp).toContain('digitalRead(32)')
    expect(cpp).toContain('digitalRead(33)')
    expect(cpp).toContain('float n_enc_position = _encPos_enc;')
    expect(cpp).toContain('bool n_enc_pressed = digitalRead(25) == LOW;')
  })

  it('omits the reset-on-press latch when resetOnPress is off (the default)', () => {
    const enc = node('enc', 'EncoderInput', 'input', { pinA: 32, pinB: 33, pinSW: 25, resetOnPress: false })
    const cpp = generateCpp([enc], [])
    expect(cpp).not.toContain('_encSwLast_enc')
  })

  it('zeros the running position on a press edge when resetOnPress is on', () => {
    const enc = node('enc', 'EncoderInput', 'input', { pinA: 32, pinB: 33, pinSW: 25, resetOnPress: true })
    const cpp = generateCpp([enc], [])
    expect(cpp).toContain('static bool _encSwLast_enc = false;')
    expect(cpp).toContain('if (n_enc_pressed && !_encSwLast_enc) _encPos_enc = 0;')
    expect(cpp).toContain('_encSwLast_enc = n_enc_pressed;')
    // The latch must run before `position` is read out, so the same frame a
    // press lands already reports the reset value.
    expect(cpp.indexOf('_encPos_enc = 0;')).toBeLessThan(cpp.indexOf('float n_enc_position = _encPos_enc;'))
  })
})

describe('RTCInput (codegen)', () => {
  it('emits compile-time-seeded firmware clock support by default', () => {
    const rtc = node('rtc', 'RTCInput', 'input', {})
    const cpp = generateCpp([rtc], [])
    expect(cpp).toContain('struct _RtcDateTime {')
    expect(cpp).toContain('_rtcSeedValid_rtc = _rtcParseBuildStamp(__DATE__, __TIME__, _rtcBuild_rtc);')
    expect(cpp).toContain('static uint64_t _rtcElapsedMillis_rtc = 0;')
    expect(cpp).toContain('n_rtc_valid = true;')
    expect(cpp).toContain('n_rtc_secondsOfDay = (float)_rtcSecondsOfDay_rtc + _rtcMillisRema_rtc / 1000.0f;')
    expect(cpp).toContain('_RtcDateTimeValue n_rtc_dateTime = { n_rtc_valid, n_rtc_synced, n_rtc_stale')
  })

  it('emits a manual firmware clock seed when requested', () => {
    const rtc = node('rtc', 'RTCInput', 'input', {
      timeSource: 'Manual',
      startYear: 2026,
      startMonth: 12,
      startDay: 31,
      startHour: 23,
      startMinute: 59,
      startSecond: 58,
    })
    const cpp = generateCpp([rtc], [])
    expect(cpp).toContain('_rtcSeedValid_rtc = _rtcValidDateTime(2026, 12, 31, 23, 59, 58);')
    expect(cpp).toContain('_rtcBaseDays_rtc = _rtcDaysFromCivil(2026, 12, 31);')
    expect(cpp).toContain('_rtcBaseSeconds_rtc = (uint32_t)(23) * 3600u + (uint32_t)(59) * 60u + (uint32_t)(58);')
  })

  it('reads a DS3231 directly over Wire without a third-party RTC library', () => {
    const rtc = node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' })
    const cpp = generateCpp([rtc], [])
    expect(cpp).toContain('#include <Wire.h>')
    expect(cpp).toContain("Wire.begin();  // DS3231 on the board's default SDA/SCL pins")
    expect(cpp).toContain('bool _rtcReadDs3231(_RtcDateTime &out, bool &oscillatorStopped)')
    expect(cpp).toContain('Wire.beginTransmission(0x68);')
    expect(cpp).toContain('oscillatorStopped = (Wire.read() & 0x80u) != 0;')
    expect(cpp).toContain('void _rtcHandleSerialSet()')
    expect(cpp).toContain('FLS_RTC_SET %d-%d-%d %d:%d:%d')
    expect(cpp).toContain('n_rtc_synced = !_rtcChipStale_rtc;')
    expect(cpp).toContain('n_rtc_stale = _rtcChipStale_rtc;')
    expect(cpp).not.toContain('#include <RTClib.h>')
    expect(cpp).not.toContain('_rtcParseBuildStamp(__DATE__, __TIME__, _rtcBuild_rtc);')
  })

  it('uses an exact Espressif board profile when its Wire pins differ from the generic target', () => {
    const board = node('board', 'Board', 'input', { profileId: 'seeed-xiao-esp32s3' })
    const rtc = node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' })
    const cpp = generateCpp([board, rtc], [])
    expect(cpp).toContain('Wire.begin(5, 6);  // DS3231 I2C pins from the RTC node')
  })

  it('uses editable RTC pin properties on Espressif targets', () => {
    const board = node('board', 'Board', 'input', { profileId: 'seeed-xiao-esp32s3' })
    const rtc = node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231', sdaPin: 7, sclPin: 8 })
    const cpp = generateCpp([board, rtc], [])
    expect(cpp).toContain('Wire.begin(7, 8);  // DS3231 I2C pins from the RTC node')
  })
})

describe('ScheduleTrigger (codegen)', () => {
  // The firmware trigger has to fire on the crossing, not while inside a
  // one-second band, or a coarse clock or slow frame drops the day's pulse.
  it('fires a trigger on the crossing and remembers the previous sample', () => {
    const rtc = node('rtc', 'RTCInput', 'input', {})
    const sched = node('sch', 'ScheduleTrigger', 'signal', {
      scheduleMode: 'Trigger', startHour: 18, startMinute: 0, startSecond: 0,
    })
    const cpp = generateCpp([rtc, sched], [
      edge('e1', 'rtc', 'sch', 'valid', 'valid'),
      edge('e2', 'rtc', 'sch', 'secondsOfDay', 'secondsOfDay'),
    ])
    expect(cpp).toContain('static float _schedulePrevSeconds_sch = -1.0f;')
    expect(cpp).toContain('static int32_t _schedulePrevDay_sch = -1;')
    expect(cpp).toContain('_scheduleSince_sch < 64800.0f && _scheduleSeconds_sch >= 64800.0f')
    expect(cpp).toContain('_schedulePrevSeconds_sch = _scheduleTimeReady_sch ? _scheduleSeconds_sch : -1.0f;')
  })

  it('emits window progress with the span baked in', () => {
    const sched = node('sch', 'ScheduleTrigger', 'signal', {
      scheduleMode: 'Window', startHour: 18, endHour: 20,
    })
    const cpp = generateCpp([sched], [])
    expect(cpp).toContain('float n_sch_progress = 0.0f;')
    // 18:00 → 20:00 is a 7200 s span starting at 64800 s.
    expect(cpp).toContain('n_sch_progress = constrain(_scheduleElapsed_sch / 7200.0f, 0.0f, 1.0f);')
  })

  it('measures a midnight-wrapping window across the wrap', () => {
    const sched = node('sch', 'ScheduleTrigger', 'signal', {
      scheduleMode: 'Window', startHour: 22, endHour: 2,
    })
    const cpp = generateCpp([sched], [])
    // 22:00 → 02:00 is four hours, and the pre-midnight part is 7200 s long.
    expect(cpp).toContain('n_sch_progress = constrain(_scheduleElapsed_sch / 14400.0f, 0.0f, 1.0f);')
    expect(cpp).toContain('? _scheduleSeconds_sch - 79200.0f : 7200.0f + _scheduleSeconds_sch;')
  })

  // Both sides clamp the calendar day, so the one-pulse-per-day key matches.
  it('clamps the day of month the same way the evaluator does', () => {
    const sched = node('sch', 'ScheduleTrigger', 'signal', { scheduleMode: 'Trigger' })
    expect(generateCpp([sched], [])).toContain(
      'int _scheduleDay_sch = constrain((int)roundf(1), 1, 31);',
    )
  })

  // Summing before clamping mapped an out-of-range saved hour to a different
  // instant than the evaluator reached.
  it('clamps each time field before summing', () => {
    const sched = node('sch', 'ScheduleTrigger', 'signal', {
      scheduleMode: 'Window', startHour: 30, startMinute: 0, startSecond: 0, endHour: 23, endMinute: 59, endSecond: 59,
    })
    // Hour clamps to 23, not a total clamped to 86399.
    expect(generateCpp([sched], [])).toContain('_scheduleSeconds_sch >= 82800.0f')
  })
})

describe('ClockDisplay (codegen)', () => {
  it('reads time and health through the DateTime connection', () => {
    const rtc = node('rtc', 'RTCInput', 'input', { timeSource: 'DS3231' })
    const clk = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Digital + Date' })
    const cpp = generateCpp([rtc, clk, outputNode], [
      edge('dt', 'rtc', 'clk', 'dateTime', 'dateTime'),
      edge('frame', 'clk', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('(n_rtc_dateTime.valid && n_rtc_dateTime.synced && !n_rtc_dateTime.stale)')
    expect(cpp).toContain('n_rtc_dateTime.secondsOfDay')
    expect(cpp).toContain('n_rtc_dateTime.day')
    expect(cpp).toContain('n_rtc_dateTime.month')
  })

  it('emits a dynamic bitmap text renderer for RTC-fed clock/date modes', () => {
    const rtc = node('rtc', 'RTCInput', 'input', {})
    const clk = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Digital + Date' })
    const cpp = generateCpp([rtc, clk, outputNode], [
      edge('e1', 'rtc', 'clk', 'secondsOfDay', 'secondsOfDay'),
      edge('e2', 'rtc', 'clk', 'valid', 'valid'),
      edge('e3', 'rtc', 'clk', 'day', 'day'),
      edge('e4', 'rtc', 'clk', 'month', 'month'),
      edge('e5', 'clk', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('auto _clkCols = [&](char _ch, uint8_t *_cols)')
    expect(cpp).toContain('snprintf(_clkSub_clk, sizeof(_clkSub_clk), "%02d.%02d"')
    expect(cpp).toContain('if (n_rtc_valid)')
    expect(cpp).toContain('_clkText(_clkMain_clk')
  })

  // The runtime glyph table has to come from the shared bitmap font, not a
  // hand-written copy, or preview and firmware can drift apart silently.
  it('bakes its glyph table from the shared font', () => {
    const rtc = node('rtc', 'RTCInput', 'input', {})
    const clk = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Digital HH:MM' })
    const cpp = generateCpp([rtc, clk, outputNode], [
      edge('e1', 'rtc', 'clk', 'secondsOfDay', 'secondsOfDay'),
      edge('e2', 'clk', 'out', 'frame', 'frame'),
    ])
    const chars = /static const char _clkChars_clk\[\] = "([^"]+)";/.exec(cpp)?.[1] ?? ''
    expect(chars).not.toHaveLength(0)
    const table = /static const uint8_t _clkGlyphs_clk\[\]\[3\] = \{(.+)\};/.exec(cpp)?.[1] ?? ''
    const rows = table.split('}, ').map((row) => row.replace(/[{}]/g, '').split(',').map(Number))
    expect(rows).toHaveLength(chars.length)
    for (let i = 0; i < chars.length; i++) {
      expect(rows[i]).toEqual(textColumns(chars[i], DEFAULT_FONT, 0))
    }
  })

  it('scales the analog face radius by matrix size only when scaleWithMatrix is on', () => {
    const clk = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Analog', radius: 6 })
    const cpp = generateCpp([clk, outputNode], [edge('e1', 'clk', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _clkRad_clk = max(2.0f, 6);')

    const scaled = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Analog', radius: 6, scaleWithMatrix: true })
    const scaledCpp = generateCpp([scaled, outputNode], [edge('e1', 'clk', 'out', 'frame', 'frame')])
    expect(scaledCpp).toContain('float _clkRad_clk = max(2.0f, 6*(min(WIDTH,HEIGHT)/16.0f));')
  })

  // Wiring the time but not the valid flag used to preview a running clock and
  // then flash permanent dashes.
  it('treats a wired time with an unwired valid flag as valid, and an unwired time as invalid', () => {
    const rtc = node('rtc', 'RTCInput', 'input', {})
    const clk = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Digital HH:MM' })
    const wired = generateCpp([rtc, clk, outputNode], [
      edge('e1', 'rtc', 'clk', 'secondsOfDay', 'secondsOfDay'),
      edge('e2', 'clk', 'out', 'frame', 'frame'),
    ])
    expect(wired).toContain('if (true) snprintf(_clkMain_clk')
    const bare = generateCpp([clk, outputNode], [edge('e1', 'clk', 'out', 'frame', 'frame')])
    expect(bare).toContain('if (false) snprintf(_clkMain_clk')
  })

  it('emits millis-driven stopwatch/timer state for transport modes', () => {
    const clk = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Timer', durationSec: 90, run: true })
    const cpp = generateCpp([clk, outputNode], [edge('e1', 'clk', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static float _clkElapsed_clk = 0.0f, _clkRemaining_clk = 0.0f, _clkLastDuration_clk = -1.0f;')
    expect(cpp).toContain('uint32_t _clkNow_clk = millis();')
    expect(cpp).toContain('if (_clkRun_clk) _clkRemaining_clk = max(0.0f, _clkRemaining_clk - _clkDt_clk);')
    expect(cpp).toContain('snprintf(_clkMain_clk, sizeof(_clkMain_clk), "%02d:%02d"')
  })

  it('publishes transport readouts so a timer can drive the rest of the graph', () => {
    const clk = node('clk', 'ClockDisplay', 'pattern', { displayMode: 'Timer', durationSec: 90 })
    const cpp = generateCpp([clk, outputNode], [edge('e1', 'clk', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float n_clk_seconds = 0.0f; bool n_clk_done = false;')
    expect(cpp).toContain('n_clk_seconds = _clkShow_clk;')
    expect(cpp).toContain('n_clk_done = _clkRemaining_clk <= 0.0f;')
  })
})

describe('bypassed nodes (codegen)', () => {
  // The generic `node()` helper leaves inputs/outputs empty; bypass needs the
  // real frame/field port lists to find a matching pass-through pair.
  const withPorts = (n: StudioNode, inputs: { id: string; dataType: string }[], outputs: { id: string; dataType: string }[]) => {
    ;(n.data as unknown as { inputs: unknown; outputs: unknown }).inputs = inputs
    ;(n.data as unknown as { inputs: unknown; outputs: unknown }).outputs = outputs
    return n
  }

  it('a bypassed frame node copies its input buffer instead of rendering its own effect', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const bm = withPorts(
      node('bm', 'BrightnessMod', 'composite', { brightness: 0, bypassed: true }),
      [{ id: 'frame', dataType: 'frame' }, { id: 'brightness', dataType: 'float' }],
      [{ id: 'frame', dataType: 'frame' }],
    )
    const cpp = generateCpp([sc, bm, outputNode], [
      edge('e1', 'sc', 'bm', 'frame', 'frame'),
      edge('e2', 'bm', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('::memmove(buf_bm, buf_sc, sizeof(CRGB) * NUM_LEDS);')
    // The node's own brightness-scaling logic must not run.
    expect(cpp).not.toContain('nscale8')
  })

  it('a bypassed field node memcpys its input field buffer', () => {
    const fn = node('fn', 'FieldNoise', 'pattern', { speed: 0.4, scale: 0.3, octaves: 3 })
    const fw = withPorts(
      node('fw', 'FieldRotate', 'composite', { spin: 10, bypassed: true }),
      [{ id: 'field', dataType: 'field' }, { id: 'angle', dataType: 'float' }],
      [{ id: 'field', dataType: 'field' }],
    )
    const f2f = node('f2f', 'FieldToFrame', 'pattern', { palette: 'ocean' })
    const cpp = generateCpp([fn, fw, f2f, outputNode], [
      edge('e1', 'fn', 'fw', 'field', 'field'),
      edge('e2', 'fw', 'f2f', 'field', 'field'),
      edge('e3', 'f2f', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('memcpy(field_fw, field_fn, sizeof(float) * NUM_LEDS);')
  })
})

describe('generateCpp — BeatFlash', () => {
  const beat = node('beat', 'ButtonInput', 'input', {})
  const base = node('base', 'SolidColor', 'pattern', { r: 10, g: 20, b: 30 })

  it('defaults to a solid CRGB flash color, screen-blended, with an attack ramp', () => {
    const bf = node('bf', 'BeatFlash', 'pattern', {})
    const cpp = generateCpp([beat, base, bf], [
      edge('e1', 'beat', 'bf', 'pressed', 'beat'),
      edge('e2', 'base', 'bf', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB(255, 255, 255)')
    expect(cpp).toContain('_fAtkStep_bf')
    expect(cpp).not.toContain('ColorFromPalette(paldef_rainbow')
    // Screen blend subtracts the base pixel from the flash color.
    expect(cpp).toMatch(/_fc_bf\.r - .*\[_i\]\.r/)
  })

  it('samples a palette instead of the solid color when one is selected', () => {
    const bf = node('bf2', 'BeatFlash', 'pattern', { palette: 'ocean' })
    const cpp = generateCpp([beat, base, bf], [
      edge('e1', 'beat', 'bf2', 'pressed', 'beat'),
      edge('e2', 'base', 'bf2', 'frame', 'frame'),
    ])
    expect(cpp).toContain('ColorFromPalette(paldef_ocean')
    expect(cpp).not.toContain('CRGB(255, 255, 255)')
  })

  it('preserveBase=false overwrites the pixel outright instead of blending', () => {
    const bf = node('bf3', 'BeatFlash', 'pattern', { preserveBase: false, r: 0, g: 255, b: 0 })
    const cpp = generateCpp([beat, base, bf], [
      edge('e1', 'beat', 'bf3', 'pressed', 'beat'),
      edge('e2', 'base', 'bf3', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB(0, 255, 0)')
    expect(cpp).toMatch(/buf_bf3\[_i\] = CRGB\(/)
  })

  it('blendMode "add" adds the flash color without subtracting the base', () => {
    const bf = node('bf4', 'BeatFlash', 'pattern', { blendMode: 'add' })
    const cpp = generateCpp([beat, base, bf], [
      edge('e1', 'beat', 'bf4', 'pressed', 'beat'),
      edge('e2', 'base', 'bf4', 'frame', 'frame'),
    ])
    expect(cpp).toMatch(/qadd8\(buf_bf4\[_i\]\.r, \(uint8_t\)min\(255\.0f, _fc_bf4\.r \* _feff_bf4\)\)/)
  })
})

describe('KickShock / PercussionBlobs / RainRipples pool-spawner codegen', () => {
  it('KickShock consumes its tiles input and remaps pixels into tile-local coordinates', () => {
    const tiles = node('tiles', 'Random', 'signal', { min: 2, max: 4 })
    const ks = node('ksTiles', 'KickShock', 'pattern', {})
    const cpp = generateCpp([tiles, ks, outputNode], [
      edge('tilesEdge', 'tiles', 'ksTiles', 'value', 'tiles'),
      edge('outEdge', 'ksTiles', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('roundf(n_tiles_value)')
    expect(cpp).toContain('fmodf((_x+0.5f)*_tiles,WIDTH)/_tiles-0.5f')
  })

  it('KickShock bakes count into the static array size and combine mode', () => {
    const ks = node('ks', 'KickShock', 'pattern', { count: 5, blendMode: 'max' })
    const cpp = generateCpp([ks, outputNode], [edge('e', 'ks', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_ksBorn_ks[5]')
    expect(cpp).toContain('_ksX_ks[5]')
    expect(cpp).toContain('%5)')
    expect(cpp).toContain('_wave=max(_wave,_front*(1.0f-_age/_life));')
    expect(cpp).not.toContain('_wave+=_front')
  })

  it('KickShock defaults to additive combine and count=8', () => {
    const ks = node('ks2', 'KickShock', 'pattern', {})
    const cpp = generateCpp([ks, outputNode], [edge('e', 'ks2', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_ksBorn_ks2[8]')
    expect(cpp).toContain('_wave+=_front*(1.0f-_age/_life);')
  })

  it('KickShock divides speed by decay so total ring travel stays constant', () => {
    const ks = node('ks3', 'KickShock', 'pattern', { decay: 2 })
    const cpp = generateCpp([ks, outputNode], [edge('e', 'ks3', 'out', 'frame', 'frame')])
    expect(cpp).toContain('/2.0000f, _spdS=_spdK*1.8f;')
    expect(cpp).toContain('_lifeK=3.8000f')
  })

  it('KickShock spawnSpread=0 keeps every ring spawn at the shared centre', () => {
    const ks = node('ks4', 'KickShock', 'pattern', {})
    const cpp = generateCpp([ks, outputNode], [edge('e', 'ks4', 'out', 'frame', 'frame')])
    expect(cpp).toContain('-_ksCx)*0.0f')
  })

  it('PercussionBlobs bakes count/size/decay/blendMode', () => {
    const pb = node('pb', 'PercussionBlobs', 'pattern', { count: 6, size: 2, decay: 0.5, blendMode: 'max' })
    const cpp = generateCpp([pb, outputNode], [edge('e', 'pb', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_pbx_pb[6]')
    expect(cpp).toContain('_pr[3]={0.6800f,0.4000f,0.2000f}')
    expect(cpp).toContain('_pl[3]={0.7000f,0.3500f,0.1750f}')
    expect(cpp).toContain('_field=max(_field,')
  })

  it('PercussionBlobs defaults to additive combine', () => {
    const pb = node('pb2', 'PercussionBlobs', 'pattern', {})
    const cpp = generateCpp([pb, outputNode], [edge('e', 'pb2', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_field+=_decay*(_radius*_radius)')
  })

  it('RainRipples bakes count/thickness/decay and defaults to max combine', () => {
    const rr = node('rr', 'RainRipples', 'pattern', { count: 4, thickness: 2, decay: 0.5 })
    const cpp = generateCpp([rr, outputNode], [edge('e', 'rr', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_rrx_rr[4]')
    expect(cpp).toContain('_life=(1.6f/_spd)*0.5000f')
    expect(cpp).toContain('_band=(0.9f+(1.0f-_strength)*0.6f)*2.0000f')
    expect(cpp).toContain('_v=max(_v,_ring*(1.0f-_age/_life));')
  })

  it('RainRipples blendMode="add" switches to additive combine', () => {
    const rr = node('rr2', 'RainRipples', 'pattern', { blendMode: 'add' })
    const cpp = generateCpp([rr, outputNode], [edge('e', 'rr2', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_v+=_ring*(1.0f-_age/_life);')
  })

  it('RainRipples spawnSpread defaults to 1 (fully random)', () => {
    const rr = node('rr3', 'RainRipples', 'pattern', {})
    const cpp = generateCpp([rr, outputNode], [edge('e', 'rr3', 'out', 'frame', 'frame')])
    expect(cpp).toContain('-_rrCx)*1.0f')
  })
})

describe('show-pipeline nodes in a normal sketch', () => {
  // These five have no emit() case by design — a different generator handles
  // them. The default branch used to label them "not yet supported in code
  // gen", which two shipped starters baked into their exported .ino.
  const SHOW_PIPELINE = ['MusicLibrary', 'PerformanceGenerator', 'SDCard', 'PatternCollection', 'TransitionSet']

  it('explains where each one is handled instead of calling it unsupported', () => {
    for (const type of SHOW_PIPELINE) {
      const cpp = generateCpp([node(`n-${type}`, type, 'show', {})], [])
      expect(cpp, type).toContain(`// ${type} —`)
      expect(cpp, type).not.toContain('not yet supported')
    }
  })

  describe('dead-branch pruning', () => {
    // emit() used to run over every node on the canvas, so a parked pattern got
    // a global buffer and a full render in loop() — executing every frame, after
    // FastLED.show(), on pixels nothing displays.
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, dataPin: 5 })
    const live = node('live', 'Rainbow', 'pattern')

    it('emits nothing for a node that cannot reach an output', () => {
      const cpp = generateCpp([out, live, node('orphan', 'Fire', 'pattern')],
        [edge('e1', 'live', 'out', 'frame', 'frame')])
      expect(cpp).not.toContain('buf_orphan')
      expect(cpp).not.toContain('_fireHeat_orphan')
      expect(cpp).toContain('fill_rainbow(buf_live')
    })

    it('drops a whole branch whose end feeds nothing', () => {
      const cpp = generateCpp(
        [out, live, node('d1', 'Fire', 'pattern'), node('d2', 'Blur2D', 'pattern')],
        [edge('e1', 'live', 'out', 'frame', 'frame'), edge('e2', 'd1', 'd2', 'frame', 'frame')],
      )
      expect(cpp).not.toContain('buf_d1')
      expect(cpp).not.toContain('buf_d2')
      // …including the XYMap only the dropped Blur2D needed.
      expect(cpp).not.toContain('XYMap')
    })

    it('does not emit the audio engine for a MicInput wired to nothing', () => {
      const board = node('board', 'Board', 'hardware', { profileId: 'espressif-esp32-s3-devkitc-1' })
      const cpp = generateCpp([board, out, live, node('mic', 'MicInput', 'hardware', {})],
        [edge('e1', 'live', 'out', 'frame', 'frame')])
      expect(cpp).not.toContain('void setupAudio()')
      expect(cpp).not.toContain('CreateInmp441')
    })

    it('keeps the Board node, which is configuration rather than dataflow', () => {
      const board = node('board', 'Board', 'hardware', { profileId: 'espressif-esp32-s3-devkitc-1' })
      const mic = node('mic', 'MicInput', 'hardware', {})
      const fft = node('fft', 'FFTAnalyzer', 'audio', {})
      const bp = node('bp', 'BassPulse', 'pattern', {})
      const cpp = generateCpp([board, mic, fft, bp, out], [
        edge('e1', 'mic', 'fft', 'audio', 'audio'),
        edge('e2', 'fft', 'bp', 'bass', 'bass'),
        edge('e3', 'bp', 'out', 'frame', 'frame'),
      ])
      expect(cpp).toContain('CreateInmp441')
    })

    it('leaves a graph with no output alone', () => {
      // Nothing to walk back from; validateGraph reports the missing output.
      expect(generateCpp([node('m', 'Math', 'math', { mathOp: 'add', a: 1, b: 2 })], []))
        .toContain('n_m_result')
    })
  })

  describe('terminal buffer alias', () => {
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, dataPin: 5 })

    it('renders the node feeding the output straight into leds', () => {
      const cpp = generateCpp([node('sc', 'SolidColor', 'pattern'), out],
        [edge('e1', 'sc', 'out', 'frame', 'frame')])
      expect(cpp).toContain('CRGB* const buf_sc = leds;')
      expect(cpp).not.toContain('CRGB buf_sc[NUM_LEDS];')
      expect(cpp).not.toContain('::memmove(leds, buf_sc,')
    })

    it('keeps a real buffer when the frame also feeds something else', () => {
      // A second consumer reads that buffer, so it cannot be the output array.
      const cpp = generateCpp(
        [node('sc', 'SolidColor', 'pattern'), node('fd', 'Fade', 'composite'), out],
        [
          edge('e1', 'sc', 'out', 'frame', 'frame'),
          edge('e2', 'sc', 'fd', 'frame', 'frame'),
        ],
      )
      expect(cpp).toContain('CRGB buf_sc[NUM_LEDS];')
      expect(cpp).toContain('::memmove(leds, buf_sc,')
    })

    it('keeps a real buffer when the output remaps pixels on the way out', () => {
      const serp = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, dataPin: 5, serpentine: true })
      const cpp = generateCpp([node('sc', 'SolidColor', 'pattern'), serp],
        [edge('e1', 'sc', 'out', 'frame', 'frame')])
      expect(cpp).toContain('CRGB buf_sc[NUM_LEDS];')
      expect(cpp).toContain('leds[XY(_x, _y)] = buf_sc[_y * WIDTH + _x]')
    })

    it('keeps a real buffer when supersampling downscales into leds', () => {
      const ssOut = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, dataPin: 5, supersample: true })
      const cpp = generateCpp([node('sc', 'SolidColor', 'pattern'), ssOut],
        [edge('e1', 'sc', 'out', 'frame', 'frame')])
      expect(cpp).toContain('CRGB buf_sc[NUM_LEDS];')
    })

    it('does not shadow leds inside a Code node that aliases the output', () => {
      const code = node('cd', 'Code', 'pattern', { code: 'leds[0] = CRGB::Red;' })
      const cpp = generateCpp([code, out], [edge('e1', 'cd', 'out', 'frame', 'frame')])
      expect(cpp).toContain('CRGB* const buf_cd = leds;')
      expect(cpp).not.toContain('CRGB* leds = leds;')
    })
  })

  it('still flags a genuinely unknown node type as unsupported', () => {
    const cpp = generateCpp([node('mystery', 'NotARealNode', 'pattern', {})], [])
    expect(cpp).toContain('NotARealNode — not yet supported in code gen')
  })
})

describe('generated-comment escaping', () => {
  // Node labels reach the sketch as `// Physical wiring map for <label>.` in
  // the multi-output branch. A newline there would end the comment and turn
  // the rest of the label into code.
  it('cannot break out of a // comment via a node label', () => {
    const evil = 'Panel A\n#include <evil.h>\nvoid pwn() { }'
    const a = { ...node('outA', 'MatrixOutput', 'output', { width: 8, height: 8, serpentine: true, dataPin: 5 }) }
    a.data.label = evil
    const b = node('outB', 'MatrixOutput', 'output', { width: 8, height: 8, serpentine: true, dataPin: 6 })
    const src = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp(
      [src, a, b],
      [edge('e1', 'sc', 'frame', 'outA', 'frame'), edge('e2', 'sc', 'frame', 'outB', 'frame')],
    )

    // The label's text may still appear — inside the comment, which is fine.
    // What must never happen is it occupying a line of its own as real code.
    const lines = cpp.split('\n').map((l) => l.trim())
    expect(lines.some((l) => l.startsWith('#include <evil.h>'))).toBe(false)
    expect(lines.some((l) => l.startsWith('void pwn()'))).toBe(false)

    // It is flattened onto the single comment line instead, still readable.
    const commentLines = lines.filter((l) => l.startsWith('// Physical wiring map for'))
    expect(commentLines.some((l) => l.includes('Panel A') && l.includes('void pwn()'))).toBe(true)
  })
})

describe('starter templates', () => {
  it('never generate a sketch claiming a supported node is unsupported', async () => {
    const { STARTER_TEMPLATES } = await import('../../state/starterTemplates')
    const { generateShowSketch, isPatternShow } = await import('../showGenerator')
    for (const template of STARTER_TEMPLATES) {
      const graph = template.build()
      const code = isPatternShow(graph.nodes, graph.edges)
        ? generateShowSketch(graph.nodes, graph.edges, {}, {})
        : generateCpp(graph.nodes, graph.edges, {}, {})
      expect(code, template.id).not.toContain('not yet supported')
    }
  })
})
