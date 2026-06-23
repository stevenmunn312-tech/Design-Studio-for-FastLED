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

  it('emits fill_solid for SolidColor node', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const cpp = generateCpp([sc, outputNode], [edge('e1', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('fill_solid(buf_sc, NUM_LEDS, CRGB(255, 0, 0))')
  })

  it('includes float t when a time-dependent node is present', () => {
    const plasma = node('p', 'Plasma', 'pattern', { speed: 1 })
    const cpp = generateCpp([plasma, outputNode], [edge('e1', 'p', 'out', 'frame', 'frame')])
    expect(cpp).toContain('float t = millis()')
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

  it('emits MathAdd result variable', () => {
    const add = node('a', 'MathAdd', 'math', { a: 1, b: 2 })
    const cpp = generateCpp([add, outputNode], [])
    expect(cpp).toContain('n_a_result')
    expect(cpp).toContain('(1) + (2)')
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

  it('emits blur2d call for Blur2D node', () => {
    const blur = node('bl', 'Blur2D', 'pattern', { amount: 40 })
    const cpp = generateCpp([blur, outputNode], [])
    expect(cpp).toContain('blur2d(buf_bl, WIDTH, HEIGHT, 40)')
  })

  it('remaps through XY() for a serpentine matrix', () => {
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8, serpentine: true })
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, out], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).toContain('uint16_t XY(uint8_t x, uint8_t y)')
    expect(cpp).toContain('leds[XY(_x, _y)] = buf_sc[_y * WIDTH + _x]')
    expect(cpp).not.toContain('memmove(leds,')
  })

  it('uses a straight memmove (no XY) for a progressive matrix', () => {
    const sc = node('sc', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([sc, outputNode], [edge('e', 'sc', 'out', 'frame', 'frame')])
    expect(cpp).not.toContain('XY(')
    expect(cpp).toContain('memmove(leds, buf_sc, sizeof(CRGB) * NUM_LEDS)')
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
    const sx = node('sx', 'Simplex2D', 'pattern', { palette: 'lava' })
    const cpp = generateCpp([sx, outputNode], [edge('e1', 'sx', 'out', 'frame', 'frame')])
    expect(cpp).toContain('ColorFromPalette(LavaColors_p')
  })

  it('resolves a connected PaletteSelector into the consuming node', () => {
    const sel = node('sel', 'PaletteSelector', 'color', { palette: 'ocean' })
    const sx  = node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' })
    const cpp = generateCpp([sel, sx, outputNode], [
      edge('e1', 'sel', 'sx', 'palette', 'paletteIn'),
      edge('e2', 'sx', 'out', 'frame', 'frame'),
    ])
    // The connected selector's palette wins over the node's own property.
    expect(cpp).toContain('ColorFromPalette(OceanColors_p')
    expect(cpp).not.toContain('ColorFromPalette(RainbowColors_p')
  })

  it('resolves a connected PaletteBlend to its base palette A', () => {
    const blend = node('bl', 'PaletteBlend', 'color', { paletteA: 'forest', paletteB: 'party', amount: 128 })
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
    expect(cpp).toContain('memmove(buf_s, _seq_s[_idx], sizeof(CRGB) * NUM_LEDS)')
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
    expect(cpp).toContain('memmove(buf_s, buf_a, sizeof(CRGB) * NUM_LEDS)')
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
    const pb = node('pb', 'PaletteBlend', 'color', { paletteA: 'heat', paletteB: 'ocean', amount: 128 })
    const sx = node('sx', 'Simplex2D', 'pattern', {})
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
    const sx = node('sx', 'Simplex2D', 'pattern', { palette: 'rainbow' })
    const cpp = generateCpp([c1, c2, cp, sx, outputNode], [
      edge('e1', 'c1', 'cp', 'rgb', 'color0'),
      edge('e2', 'c2', 'cp', 'rgb', 'color1'),
      edge('e3', 'cp', 'sx', 'palette', 'paletteIn'),
      edge('e4', 'sx', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGBPalette16 pal_cp(n_c1_rgb, n_c2_rgb)')
    expect(cpp).toContain('ColorFromPalette(pal_cp,')
  })

  it('composites two layers with nblend and copies the result to leds', () => {
    const a  = node('a', 'SolidColor', 'pattern', { r: 255, g: 0, b: 0 })
    const b  = node('b', 'SolidColor', 'pattern', { r: 0, g: 0, b: 255 })
    const lb = node('lb', 'LayerBlend', 'composite', { amount: 128 })
    const cpp = generateCpp([a, b, lb, outputNode], [
      edge('e1', 'a', 'lb', 'frame', 'a'),
      edge('e2', 'b', 'lb', 'frame', 'b'),
      edge('e3', 'lb', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('CRGB buf_a[NUM_LEDS];')
    expect(cpp).toContain('CRGB buf_b[NUM_LEDS];')
    expect(cpp).toContain('memmove(buf_lb, buf_a, sizeof(CRGB) * NUM_LEDS)')
    expect(cpp).toContain('nblend(buf_lb, buf_b, NUM_LEDS, (uint8_t)(128))')
    expect(cpp).toContain('memmove(leds, buf_lb, sizeof(CRGB) * NUM_LEDS)')
  })

  it('skips an unknown group reference and still emits a valid sketch', () => {
    const grp = node('g1', 'Group', 'composite', { groupId: 'missing' })
    const cpp = generateCpp([grp, outputNode], [edge('e1', 'g1', 'out', 'frame', 'frame')], {})
    expect(cpp).toContain('void loop()')
  })
})
