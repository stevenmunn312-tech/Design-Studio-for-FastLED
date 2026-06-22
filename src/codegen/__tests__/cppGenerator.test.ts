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
    expect(cpp).toContain('fill_solid(leds, NUM_LEDS, CRGB(255, 0, 0))')
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
    expect(cpp).toContain('blur2d(leds, WIDTH, HEIGHT, 40)')
  })

  it('emits Fire2012 heat simulation', () => {
    const fire = node('f', 'Fire2012', 'pattern', { cooling: 55, sparking: 120 })
    const cpp = generateCpp([fire, outputNode], [])
    expect(cpp).toContain('Fire2012')
    expect(cpp).toContain('HeatColor')
  })
})
