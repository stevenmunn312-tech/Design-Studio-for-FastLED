import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import type { StudioNode, StudioEdge } from '../../state/graphStore'

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

  it('TrebleSparks uses its connected color input in generated C++', () => {
    const color = node('c', 'CHSV', 'color', { hue: 0, sat: 255, val: 255 })
    const sparks = node('ts', 'TrebleSparks', 'pattern', { treble: 1, density: 1 })
    const cpp = generateCpp(
      [color, sparks, outputNode],
      [
        edge('e1', 'c', 'ts', 'rgb', 'color'),
        edge('e2', 'ts', 'out', 'frame', 'frame'),
      ],
    )
    expect(cpp).toContain('CRGB _spark = blend(n_c_rgb, CRGB::White')
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

  it('scales Noise speed per noiseType variant', () => {
    const worley = node('w', 'Noise', 'pattern', { noiseType: 'worley', speed: 1, scale: 1 })
    const simplex = node('s', 'Noise', 'pattern', { noiseType: 'simplex', speed: 1, scale: 1 })
    expect(generateCpp([worley, outputNode], [edge('e', 'w', 'out', 'frame', 'frame')])).toContain('* 5.000f)')
    expect(generateCpp([simplex, outputNode], [edge('e', 's', 'out', 'frame', 'frame')])).toContain('* 3.000f)')
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
    const withMapRange = generateCpp([mr, outputNode], [])
    expect(withMapRange).toContain('float mapFloat(')
  })

  it('emits Math result variable for the selected operation', () => {
    const add = node('a', 'Math', 'math', { mathOp: 'add', a: 1, b: 2 })
    const cpp = generateCpp([add, outputNode], [])
    expect(cpp).toContain('n_a_result')
    expect(cpp).toContain('(1) + (2)')
    const mul = generateCpp([node('a', 'Math', 'math', { mathOp: 'multiply', a: 3, b: 4 }), outputNode], [])
    expect(mul).toContain('(3) * (4)')
  })

  it('chains node output as input to downstream node', () => {
    const timeN = node('t1', 'TimeNode', 'math', {})
    const sin   = node('s1', 'Sin', 'math', {})
    const cpp = generateCpp(
      [timeN, sin, outputNode],
      [edge('e1', 't1', 's1', 'time', 'x')]
    )
    expect(cpp).toContain('n_t1_time')
    expect(cpp).toContain('n_s1_result')
  })

  it('emits CHSV node with 0–255 channel values', () => {
    const chsv = node('c', 'CHSV', 'math', { hue: 128, sat: 255, val: 200 })
    const cpp = generateCpp([chsv, outputNode], [])
    expect(cpp).toContain('CHSV(')
    expect(cpp).toContain('128')
    expect(cpp).toContain('255')
    expect(cpp).toContain('200')
  })

  it('emits BeatSin node with bpm/low/high', () => {
    const bs = node('b', 'BeatSin', 'math', { bpm: 120, low: 0, high: 255 })
    const cpp = generateCpp([bs, outputNode], [])
    expect(cpp).toContain('beatsin8(120, 0, 255)')
  })

  it('emits a sine Wave oscillator', () => {
    const w = node('w', 'Wave', 'math', { amplitude: 2, frequency: 0.5, phase: 0.25, waveform: 'sine' })
    const cpp = generateCpp([w, outputNode], [])
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
      return generateCpp([wa, wb, cw, outputNode], [
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
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
    expect(cpp).not.toContain('CHSV((uint8_t)((_v')  // no longer hardcoded hue
  })

  it('emits blur2d call for Blur2D node', () => {
    const blur = node('bl', 'Blur2D', 'pattern', { amount: 0.5 })
    const cpp = generateCpp([blur, outputNode], [])
    expect(cpp).toContain('blur2d(buf_bl, WIDTH, HEIGHT, 128)')   // 0.5 × 255
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
    expect(cpp).toContain('::memmove(leds, buf_sc, sizeof(CRGB) * NUM_LEDS)')
  })

  it('emits Fire2012 heat simulation', () => {
    const fire = node('f', 'Fire2012', 'pattern', { cooling: 55, sparking: 120 })
    const cpp = generateCpp([fire, outputNode], [])
    expect(cpp).toContain('Fire2012')
    expect(cpp).toContain('HeatColor')
  })

  it('emits a bounded loop for a Span node', () => {
    const span = node('sp', 'Span', 'pattern', { row: 1, start: 2, count: 4, r: 0, g: 0, b: 255 })
    const cpp = generateCpp([span, outputNode], [edge('e1', 'sp', 'out', 'frame', 'frame')])
    expect(cpp).toContain('for (int _x = 2; _x < 6;')
    expect(cpp).toContain('1 * WIDTH + _x')
    expect(cpp).toContain('CRGB(0, 0, 255)')
  })

  it('clips a Span to the matrix width', () => {
    // start=6, count=10 on an 8-wide matrix → clipped to _x < 8.
    const span = node('sp', 'Span', 'pattern', { row: 0, start: 6, count: 10 })
    const cpp = generateCpp([span, outputNode], [edge('e1', 'sp', 'out', 'frame', 'frame')])
    expect(cpp).toContain('for (int _x = 6; _x < 8;')
  })

  it('emits a nested bounded loop for a Rect node', () => {
    const rect = node('r', 'Rect', 'pattern', { x: 1, y: 1, w: 3, h: 2, r: 0, g: 255, b: 0 })
    const cpp = generateCpp([rect, outputNode], [edge('e1', 'r', 'out', 'frame', 'frame')])
    expect(cpp).toContain('for (int _y = 1; _y < 3;')
    expect(cpp).toContain('for (int _x = 1; _x < 4;')
    expect(cpp).toContain('CRGB(0, 255, 0)')
  })

  it('maps a Simplex2D palette property to its FastLED constant', () => {
    const sx = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'lava' })
    const cpp = generateCpp([sx, outputNode], [edge('e1', 'sx', 'out', 'frame', 'frame')])
    expect(cpp).toContain('ColorFromPalette(LavaColors_p')
  })

  it('resolves a connected PaletteSelector into the consuming node', () => {
    const sel = node('sel', 'PaletteSelector', 'color', { palette: 'ocean' })
    const sx  = node('sx', 'Noise', 'pattern', { noiseType: 'simplex', palette: 'rainbow' })
    const cpp = generateCpp([sel, sx, outputNode], [
      edge('e1', 'sel', 'sx', 'palette', 'paletteIn'),
      edge('e2', 'sx', 'out', 'frame', 'frame'),
    ])
    // The connected selector's palette wins over the node's own property.
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
    expect(cpp).not.toContain('ColorFromPalette(RainbowColors_p')
  })

  it('resolves a connected PaletteBlend to its base palette A', () => {
    const blend = node('bl', 'PaletteBlend', 'color', { paletteA: 'forest', paletteB: 'party', amount: 0.5 })
    const samp  = node('s', 'PaletteSampler', 'color', { t: 0.5 })
    const cpp = generateCpp([blend, samp, outputNode], [edge('e1', 'bl', 's', 'palette', 'paletteIn')])
    expect(cpp).toContain('ColorFromPalette(ForestColors_p')
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
    expect(cpp).toContain('blend(ColorFromPalette(HeatColors_p, _p), ColorFromPalette(OceanColors_p, _p), _amt)')
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
    expect(cpp).toContain('CRGBPalette16 pal_cp(n_c1_rgb, n_c2_rgb)')
    expect(cpp).toContain('ColorFromPalette(pal_cp,')
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
    const gol = node('g', 'GameOfLife', 'pattern', { speed: 8, fade: 0.75, r: 0, g: 255, b: 70 })
    const cpp = generateCpp([gol, outputNode], [edge('e', 'g', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static uint8_t _gc_g[NUM_LEDS], _gn_g[NUM_LEDS]')
    expect(cpp).toContain('millis() - _gt_g')
    expect(cpp).toContain('CRGB(0, 255, 70)')
    expect(cpp).toContain('*0.75f')
  })

  it('emits a Gray-Scott reaction-diffusion simulation', () => {
    const rd = node('rd', 'ReactionDiffusion', 'pattern', { feed: 0.055, kill: 0.062, speed: 8, palette: 'ocean' })
    const cpp = generateCpp([rd, outputNode], [edge('e', 'rd', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static float _u_rd[NUM_LEDS]')
    expect(cpp).toContain('::memcpy(_u_rd,_un_rd,sizeof(_u_rd))')
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
  })

  it('emits a Blobs metaball field', () => {
    const b = node('b', 'Blobs', 'pattern', { speed: 0.6, scale: 0.22, count: 3, palette: 'lava' })
    const cpp = generateCpp([b, outputNode], [edge('e', 'b', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _bx[3], _by[3]')
    expect(cpp).toContain('_f/(_f+1.0f)')
    expect(cpp).toContain('ColorFromPalette(LavaColors_p')
  })

  it('emits a stateful FlowField with particle buffers', () => {
    const ff = node('ff', 'FlowField', 'pattern', { speed: 1, scale: 0.08, count: 50, fade: 0.9, palette: 'ocean' })
    const cpp = generateCpp([ff, outputNode], [edge('e', 'ff', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static float _fpx_ff[50], _fpy_ff[50], _ftr_ff[NUM_LEDS]')
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('*=0.9f')
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
  })

  it('emits a stateful Starfield with star buffers and projection', () => {
    const sf = node('sf', 'Starfield', 'pattern', { speed: 2, count: 80, r: 255, g: 255, b: 255 })
    const cpp = generateCpp([sf, outputNode], [edge('e', 'sf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static float _sfx_sf[80], _sfy_sf[80], _sfz_sf[80]')
    expect(cpp).toContain('fill_solid(buf_sf, NUM_LEDS, CRGB::Black)')
    expect(cpp).toContain('.nscale8(')
  })

  it('emits a PlasmaFractal with sin sums and inoise8 octaves', () => {
    const pf = node('pf', 'Noise', 'pattern', { noiseType: 'plasma', speed: 1, scale: 0.15, palette: 'rainbow' })
    const cpp = generateCpp([pf, outputNode], [edge('e', 'pf', 'out', 'frame', 'frame')])
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('ColorFromPalette(RainbowColors_p')
    expect(cpp).toContain('float t = millis()')
  })

  it('emits an AudioFlow with flow advection scaled by bass brightness', () => {
    const af = node('af', 'AudioFlow', 'pattern', { speed: 0.5, scale: 0.5, palette: 'party', bass: 0.5, mids: 0.5, treble: 0.3 })
    const cpp = generateCpp([af, outputNode], [edge('e', 'af', 'out', 'frame', 'frame')])
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('ColorFromPalette(PartyColors_p')
    expect(cpp).toContain('.nscale8(_bright)')
    expect(cpp).toContain('constrain((')
    expect(cpp).toContain('* 0.200f')
  })

  it('emits MidrangeWaves through a FastLED palette with energy-controlled reactivity', () => {
    const mw = node('mw', 'MidrangeWaves', 'pattern', { energy: 1.4, speed: 1, palette: 'ocean', mids: 0.5 })
    const cpp = generateCpp([mw, outputNode], [edge('e', 'mw', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _m =')
    expect(cpp).toContain('float _strength = min(1.0f, max(0.0f, _intensity));')
    expect(cpp).toContain('float _motion = _spd * (1.0f + _mAmt * 1.5f * _strength);')
    expect(cpp).toContain('float _contrast = 0.7f + _mAmt * 1.8f * _strength;')
    expect(cpp).toContain('powf(_mAmt, 0.65f) * 1.25f * _strength')
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
    expect(cpp).toContain('.nscale8((uint8_t)(_v * 255))')
  })

  it('emits BassRings as a radial sine pattern with bass-scaled density and brightness', () => {
    const br = node('br', 'BassRings', 'pattern', { bass: 0.6, energy: 0.75, speed: 1.25, r: 255, g: 120, b: 32 })
    const cpp = generateCpp([br, outputNode], [edge('e', 'br', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _strength = min(1.0f, max(0.0f,')
    expect(cpp).toContain('float _spd = min(1.0f, max(0.0f,')
    expect(cpp).toContain('float _motion = _spd * (0.75f + _b * 1.75f * _strength);')
    expect(cpp).toContain('float _rings = 4.0f + _b * 8.0f * _strength;')
    expect(cpp).toContain('sinf(_dist * _rings * 6.2831853f - _phase)')
    expect(cpp).toContain('powf(max(0.0f, _wave * 0.5f + 0.5f), 2.4f)')
    expect(cpp).toContain('CRGB(255, 120, 32)')
  })

  it('emits MidrangeBloom through a palette with radial bloom modulation', () => {
    const mb = node('mb', 'MidrangeBloom', 'pattern', { mids: 0.7, energy: 0.8, speed: 0.6, palette: 'party' })
    const cpp = generateCpp([mb, outputNode], [edge('e', 'mb', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _motion = min(1.0f, max(0.0f, _spd)) * (0.8f + _mAmt * 2.2f * _strength);')
    expect(cpp).toContain('float _swirl = sinf((_cx * _cx - _cy * _cy) * 6 + t * _motion * 3.2f)')
    expect(cpp).toContain('float _bloom = sinf(_radial * (5.0f + _mAmt * 8.0f * _strength) * 3.14159265f')
    expect(cpp).toContain('ColorFromPalette(PartyColors_p')
    expect(cpp).toContain('.nscale8((uint8_t)(_v * 255))')
  })

  it('emits TreblePrism as sharp diagonal treble-reactive shards', () => {
    const tp = node('tp', 'TreblePrism', 'pattern', { treble: 0.85, energy: 0.9, speed: 0.7, r: 200, g: 120, b: 255 })
    const cpp = generateCpp([tp, outputNode], [edge('e', 'tp', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _motion = _spd * (1.2f + _t * 3.2f * _strength);')
    expect(cpp).toContain('float _prism = max(0.0f, _waveA * 0.55f + _waveB * 0.45f);')
    expect(cpp).toContain('powf(_prism, 3.6f)')
    expect(cpp).toContain('powf(max(0.0f, sinf((_x + _y) * 2.4f - t * _motion * 9.0f) * 0.5f + 0.5f), 10.0f)')
    expect(cpp).toContain('CRGB(200, 120, 255)')
  })

  it('emits AudioCascade as a full-spectrum palette pattern with ribbons and shimmer', () => {
    const ac = node('ac', 'AudioCascade', 'pattern', { bass: 0.8, mids: 0.7, treble: 0.9, energy: 0.85, speed: 0.75, palette: 'rainbow' })
    const cpp = generateCpp([ac, outputNode], [edge('e', 'ac', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _motion = _spd * (0.8f + (_b + _m + _t) * 1.4f * _strength);')
    expect(cpp).toContain('float _ribbon = sinf((_nx * 7.0f + _ny * 2.5f) + t * _motion * (2.0f + _m * 3.0f * _strength));')
    expect(cpp).toContain('float _shimmer = powf(max(0.0f, sinf((_nx + _ny) * 18.0f + t * _motion * (4.0f + _t * 8.0f * _strength)) * 0.5f + 0.5f), 6.0f);')
    expect(cpp).toContain('ColorFromPalette(RainbowColors_p')
    expect(cpp).toContain('.nscale8((uint8_t)(_v * 255));')
  })

  it('emits Gabor noise with its Gaussian-cosine kernel and hash helper', () => {
    const g = node('g', 'GaborNoise', 'pattern', { speed: 0.5, scale: 0.35, frequency: 1.2, orientation: 45, palette: 'ocean' })
    const cpp = generateCpp([g, outputNode], [edge('e', 'g', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _worleyHash(int x, int y)')
    expect(cpp).toContain('expf(')
    expect(cpp).toContain('cosf(')
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
  })

  it('emits an angled palette gradient with projection normalisation', () => {
    const g = node('g', 'PaletteGradient', 'pattern', { angle: 45, repeat: 2, speed: 0, palette: 'rainbow' })
    const cpp = generateCpp([g, outputNode], [edge('e', 'g', 'out', 'frame', 'frame')])
    expect(cpp).toContain('45*0.01745329f')
    expect(cpp).toContain('_pmax-_pmin')
    expect(cpp).toContain('ColorFromPalette(RainbowColors_p')
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

  it('emits fractal noise via summed inoise8 octaves', () => {
    const fn = node('fn', 'FractalNoise', 'pattern', { speed: 0.3, scale: 0.15, octaves: 4, palette: 'forest' })
    const cpp = generateCpp([fn, outputNode], [edge('e', 'fn', 'out', 'frame', 'frame')])
    expect(cpp).toContain('inoise8(')
    expect(cpp).toContain('_o<4')
    expect(cpp).toContain('ColorFromPalette(ForestColors_p')
  })

  it('emits Worley noise with its hash helper', () => {
    const w = node('w', 'Noise', 'pattern', { noiseType: 'worley', speed: 0.5, scale: 0.3, palette: 'forest' })
    const cpp = generateCpp([w, outputNode], [edge('e', 'w', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float _worleyHash(int x, int y)')
    expect(cpp).toContain('_worleyHash(_cx,_cy)')
    expect(cpp).toContain('ColorFromPalette(ForestColors_p')
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
    const t = node('t', 'Temperature', 'color', { kelvin: 3000 })
    const sp = node('sp', 'Span', 'pattern', { row: 0, start: 0, count: 4 })
    const cpp = generateCpp([t, sp, outputNode], [
      edge('e1', 't', 'sp', 'color', 'color'),
      edge('e2', 'sp', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB kelvinToRGB(float kelvin)')
    expect(cpp).toContain('n_t_color = kelvinToRGB(3000)')
  })

  it('emits a Circle distance test', () => {
    const c = node('c', 'Circle', 'pattern', { cx: 4, cy: 4, radius: 3, filled: false, r: 255, g: 0, b: 0 })
    const cpp = generateCpp([c, outputNode], [edge('e', 'c', 'out', 'frame', 'frame')])
    expect(cpp).toContain('sqrtf((_x - 4) * (_x - 4) + (_y - 4) * (_y - 4))')
    expect(cpp).toContain('fabsf(_d - 3) < 0.5f')
    expect(cpp).toContain('CRGB(255, 0, 0)')
  })

  it('emits a Bresenham loop for a Line', () => {
    const l = node('l', 'Line', 'pattern', { x1: 0, y1: 0, x2: 7, y2: 7, r: 0, g: 200, b: 255 })
    const cpp = generateCpp([l, outputNode], [edge('e', 'l', 'out', 'frame', 'frame')])
    expect(cpp).toContain('int _x0 = 0, _y0 = 0, _dx = abs(7 - _x0)')
    expect(cpp).toContain('CRGB(0, 200, 255)')
  })

  it('emits a Text node with embedded font columns', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'HI', x: 1, y: 1, scroll: 0, r: 0, g: 255, b: 0 })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('static const uint8_t _txt_t[] = {')
    expect(cpp).toContain('CRGB(0, 255, 0)')
    expect(cpp).not.toContain('millis()')   // static text → no time variable
  })

  it('Text codegen uses a custom font height', () => {
    const font = { w: 3, h: 7, glyphs: { A: [1, 1, 1, 1, 1, 1, 1] } }
    const txt = node('t', 'Text', 'pattern', { text: 'A', x: 0, y: 0, scroll: 0, font })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('_r < 7;')
  })

  it('emits a scrolling Text node that uses millis()', () => {
    const txt = node('t', 'Text', 'pattern', { text: 'GO', x: 0, y: 1, scroll: 4 })
    const cpp = generateCpp([txt, outputNode], [edge('e', 't', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float t = millis()')
    expect(cpp).toContain('_off =')
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
    expect(cpp).toContain('::memmove(leds, buf_lb, sizeof(CRGB) * NUM_LEDS)')
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

  it('FieldToFrame fills black when no field is wired', () => {
    const f2f = node('f2f', 'FieldToFrame', 'pattern', {})
    const cpp = generateCpp([f2f, outputNode], [edge('e2', 'f2f', 'out', 'frame', 'frame')])
    expect(cpp).toContain('fill_solid(buf_f2f, NUM_LEDS, CRGB::Black)')
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
    expect(cpp).toContain('int _sx=(_x*3)%WIDTH,_sy=(_y*2)%HEIGHT;')
  })
})

describe('generateCpp — Particles modes', () => {
  const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
  const gen = (mode: string, props: Record<string, unknown> = {}) => {
    const pn = node('pp', 'Particles', 'pattern', { particleType: mode, rate: 0.5, ...props })
    return generateCpp([pn, out], [edge('e', 'pp', 'out', 'frame', 'frame')])
  }

  for (const m of ['fountain', 'gravity', 'fireworks', 'sparkle', 'comet', 'snow', 'swarm']) {
    it(`emits a real fixed-pool engine for "${m}"`, () => {
      const cpp = gen(m)
      expect(cpp).toContain(`// Particles: ${m}`)
      expect(cpp).toContain('_PN=')
      // additive render of every live particle at its life brightness
      expect(cpp).toContain('buf_pp[Y*WIDTH+X]+=CRGB(')
    })
  }

  it('swarm uses a smaller pool and a flocking (boids) step', () => {
    const cpp = gen('swarm')
    expect(cpp).toContain('_PN=40')
    expect(cpp).toContain('sqrtf(')
  })

  it('fireworks bursts with a random hue', () => {
    expect(gen('fireworks')).toContain('CHSV(_hue')
  })

  it('comet is time-driven (needs t)', () => {
    const cpp = gen('comet')
    expect(cpp).toContain('float t = millis()')
    expect(cpp).toContain('sin(t*0.9f)')
  })
})

describe('generateCpp — INMP441 audio engine', () => {
  const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
  const micGraph = (channel = 'Left') => {
    const mic = node('mic', 'MicInput', 'hardware', { i2sWs: 39, i2sSck: 40, i2sSd: 41, channel })
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const bp = node('bp', 'BassPulse', 'pattern', {})
    return generateCpp([mic, fft, bp, out], [
      edge('e1', 'mic', 'fft', 'audio', 'audio'),
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
  }

  it('emits the I2S driver, a self-contained FFT, and per-frame update', () => {
    const cpp = micGraph()
    expect(cpp).toContain('#include <driver/i2s.h>')
    expect(cpp).toContain('#define MIC_WS   39')
    expect(cpp).toContain('#define MIC_SCK  40')
    expect(cpp).toContain('#define MIC_SD   41')
    expect(cpp).toContain('#define MIC_GAIN')
    expect(cpp).toContain('#define MIC_AGC   0')
    expect(cpp).toContain('#define MIC_NOISE_THRESHOLD')
    expect(cpp).toContain('float _audioNoiseGate(')
    expect(cpp).toContain('void _audioFFT(')
    expect(cpp).toContain('void setupAudio()')
    expect(cpp).toContain('void updateAudio()')
    expect(cpp).toContain('i2s_driver_install(I2S_NUM_0')
    // wired into the lifecycle
    expect(cpp).toContain('setupAudio();')
    expect(cpp).toContain('updateAudio();')
  })

  it('enables on-device AGC when the MicInput checkbox is set', () => {
    const mic = node('mic', 'MicInput', 'hardware', { agc: true })
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const cpp = generateCpp([mic, fft, out], [edge('e1', 'mic', 'fft', 'audio', 'audio')])
    expect(cpp).toContain('#define MIC_AGC   1')
    expect(cpp).toContain('if (MIC_AGC) {')
    expect(cpp).toContain('float agcGain = MIC_GAIN * (MIC_AGC ? (1.0f / mx) : 1.0f);')
  })

  it('FFTAnalyzer resolves to the live band globals when a mic is present', () => {
    const cpp = micGraph()
    expect(cpp).toContain('n_fft_bass_target = constrain(_audioBass * 1.000f')
    expect(cpp).toContain('_audioMids')
    expect(cpp).toContain('_audioTreble')
    expect(cpp).not.toContain('float n_fft_bass = 0.5f')
  })

  it('applies FFT Analyzer gain and smoothing on-device', () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const fft = node('fft', 'FFTAnalyzer', 'audio', { gain: 1.5, smoothing: 0.8 })
    const cpp = generateCpp([mic, fft, out], [edge('e1', 'mic', 'fft', 'audio', 'audio')])
    expect(cpp).toContain('_audioBass * 1.500f')
    expect(cpp).toContain('_smooth * 0.800f')
    expect(cpp).toContain('* 0.200f')
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
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
    expect(cpp).toContain('WIDTH - 1 - _x')
    expect(cpp).not.toContain('// SpectrumBars')
  })

  it('emits a per-node BeatDetect envelope and BPM estimate', () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const beat = node('bd', 'BeatDetect', 'audio', { threshold: 0.08, attack: 0.3, decay: 0.05 })
    const cpp = generateCpp([mic, beat, out], [
      edge('e1', 'mic', 'bd', 'audio', 'audio'),
      edge('e2', 'bd', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('bool n_bd_beat = false;')
    expect(cpp).toContain('n_bd_detector_fast += (_flux - n_bd_detector_fast) * 0.2540f;')
    expect(cpp).toContain('_flux > 0.0200f')
    expect(cpp).toContain('_audioSpectrum[_i] - n_bd_detector_prevSpectrum[_i]')
  })

  it('emits heuristic PercussionDetect envelopes from the live spectrum', () => {
    const mic = node('mic', 'MicInput', 'hardware', {})
    const perc = node('pd', 'PercussionDetect', 'audio', { sensitivity: 0.65, decay: 0.6, separation: 0.5 })
    const cpp = generateCpp([mic, perc, out], [
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
    const cpp = generateCpp([mic, feat, out], [
      edge('e1', 'mic', 'af', 'audio', 'audio'),
      edge('e2', 'af', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('static float n_af_feat_prevSpectrum[32];')
    expect(cpp).toContain('float n_af_vocals = 0.0f, n_af_energy = 0.0f;')
    expect(cpp).toContain('bool n_af_silence = n_af_energy <')
    expect(cpp).toContain('_presenceFlux')
    expect(cpp).toContain('_energyTarget')
  })

  it('honours the selected I2S channel', () => {
    expect(micGraph('Left')).toContain('I2S_CHANNEL_FMT_ONLY_LEFT')
    expect(micGraph('Right')).toContain('I2S_CHANNEL_FMT_ONLY_RIGHT')
  })

  it('falls back to placeholder constants with no mic node', () => {
    const fft = node('fft', 'FFTAnalyzer', 'audio', {})
    const bp = node('bp', 'BassPulse', 'pattern', {})
    const cpp = generateCpp([fft, bp, out], [
      edge('e2', 'fft', 'bp', 'bass', 'bass'),
      edge('e3', 'bp', 'out', 'frame', 'frame'),
    ])
    expect(cpp).not.toContain('driver/i2s.h')
    expect(cpp).not.toContain('updateAudio()')
    expect(cpp).toContain('constrain(0.5f * 1.000f')
    expect(cpp).toContain('float n_fft_bass = n_fft_bass_smooth')
  })
})
