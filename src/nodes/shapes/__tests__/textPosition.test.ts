import { describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults, propertyMetaFor } from '../../../state/nodeLibrary'
import type { Frame } from '../../../state/palettes/ledColor'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import {
  POSITION_UNITS, POSITION_UNIT_KEYS, centerAxis, centerAxisCpp, clockCenterAxis, clockCenterAxisCpp, lineAxis, lineAxisCpp,
  textAxisStart, textAxisStartCpp, type TextAlign,
} from '../positionUnits'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: def.category, properties: { ...libraryDefaults(nodeType), ...props }, inputs: def.inputs, outputs: def.outputs },
  } as unknown as StudioNode
}

const edge = (id: string, source: string, sh: string, target: string, th: string) =>
  ({ id, source, target, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

/** A C++ expression of `v` (and `S`, `L`, `M`) run in JavaScript. */
const cppValue = (expr: string, values: Record<string, number>) =>
  compileCppSnippet([`float __r = ${expr};`], Object.keys(values), ['__r'])(0, values).__r as number

const VALUES = [-0.3, 0, 0.25, 0.5, 0.99, 1, 1.05, 3, 7.4, 12]
const ALIGNS: TextAlign[] = ['start', 'center', 'end']

describe('position units: preview and sketch', () => {
  it.each(POSITION_UNITS)('places Text the same on both sides in %s', (units) => {
    for (const wrap of [false, true]) for (const align of ALIGNS) for (const v of VALUES) {
      const expr = textAxisStartCpp('v', units, 'S', 'L', align, wrap)
      expect(cppValue(expr, { v, S: 16, L: 7 }), `${align} ${wrap} ${v}`).toBe(textAxisStart(v, units, 16, 7, align, wrap))
    }
  })

  it.each(POSITION_UNITS)('places Shape, the clock face and Line the same on both sides in %s', (units) => {
    for (const v of VALUES) {
      expect(cppValue(centerAxisCpp('v', units, 'S', 'M', false), { v, S: 16, M: 3.5 })).toBeCloseTo(centerAxis(v, units, 16, 2.5, false), 9)
      expect(cppValue(centerAxisCpp('v', units, 'S', 'M', true), { v, S: 16, M: 3.5 })).toBeCloseTo(centerAxis(v, units, 16, 2.5, true), 9)
      expect(cppValue(clockCenterAxisCpp('v', units, 'S', 'R'), { v, S: 16, R: 6 })).toBeCloseTo(clockCenterAxis(v, units, 16, 6), 9)
      expect(cppValue(lineAxisCpp('v', units, 'S'), { v, S: 16 })).toBeCloseTo(lineAxis(v, units, 16), 9)
    }
  })

  it('reads a value past 1 as a fraction at 0–1, so an overshoot slides on rather than jumping', () => {
    // A wired LFO at 1.05 used to land on pixel 1.
    expect(textAxisStart(1.05, 'normalized', 16, 7, 'center', false)).toBeGreaterThan(textAxisStart(1, 'normalized', 16, 7, 'center', false))
    expect(centerAxis(1.05, 'normalized', 16, 3, false)).toBeGreaterThan(16)
  })

  it('counts pixels from pixel centres in all four nodes, as Line does', () => {
    // Pixel 5 at the middle of a 7-wide run, at its start, and at its end.
    expect(textAxisStart(5, 'pixels', 16, 7, 'center', false)).toBe(2)
    expect(textAxisStart(5, 'pixels', 16, 7, 'start', false)).toBe(5)
    expect(textAxisStart(5, 'pixels', 16, 7, 'end', false) + 7 - 1).toBe(5)
    expect(centerAxis(5, 'pixels', 16, 3, false)).toBe(5.5)   // Shape's pixel-edge frame
    expect(clockCenterAxis(5, 'pixels', 16, 6)).toBe(5)       // the face's pixel-index frame
    expect(lineAxis(5, 'pixels', 16)).toBe(5)
    expect(lineAxis(1, 'normalized', 16)).toBe(15)
  })
})

describe('Units on Text, Clock Display, Shape and Line', () => {
  const textSketch = (props: Record<string, unknown>, wireY: boolean) => generateCpp([
    node('tx', 'Text', { text: 'HI', ...props }),
    node('w', 'Wave'),
    node('out', 'MatrixOutput', { width: 16, height: 8 }),
  ], [
    edge('e1', 'tx', 'frame', 'out', 'frame'),
    ...(wireY ? [edge('e2', 'w', 'result', 'tx', 'y')] : []),
  ])
  const line = (cpp: string, name: string) => cpp.split('\n').find((l) => l.includes(`int ${name} = (int)`))!

  it('emits no runtime test for a wired position', () => {
    for (const units of POSITION_UNITS) {
      const sy = line(textSketch({ units }, true), '_sy')
      expect(sy).not.toContain('> 1.0f')
    }
  })

  it('puts a literal pixel position where the preview does', () => {
    const sx = line(textSketch({ units: 'pixels', x: 5 }, false), '_sx_0')
    const run = compileCppSnippet([sx], ['WIDTH', '_tn_tx_0'], ['_sx_0'])
    // Centred on pixel 5: a 7-pixel run starts at floor(5.5 - 3.5) = 2.
    expect(run(0, { WIDTH: 16, _tn_tx_0: 7 })._sx_0).toBe(2)
  })

  const frame = (nodes: StudioNode[], W: number, H: number) =>
    evaluateGraphFull(nodes, [], 0, W, H, {}, true, true).outputs.get(nodes[0].id)!.frame as Frame
  const litColumns = (f: Frame) => [...new Set(f.flatMap((row) => row.flatMap((p, x) => (p.r + p.g + p.b > 0 ? [x] : []))))].sort((a, b) => a - b)

  it('draws Text on the pixel it names in Pixels units', () => {
    const f = frame([node('t', 'Text', { text: 'I', units: 'pixels', x: 3, hAlign: 'left' })], 16, 8)
    expect(litColumns(f)[0]).toBe(3)
  })

  it('draws the analogue clock face centred on its pixel in Pixels units', () => {
    const f = frame([node('c', 'ClockDisplay', { displayMode: 'Analog', units: 'pixels', x: 6, y: 6, radius: 3, scaleWithMatrix: false })], 16, 16)
    const cols = litColumns(f)
    expect(cols[0] + cols[cols.length - 1]).toBe(12)  // symmetric about column 6
  })

  it('draws a fresh Line corner to corner on any matrix', () => {
    for (const [W, H] of [[8, 8], [20, 6]]) {
      const f = frame([node('l', 'Line')], W, H)
      expect(f[0][0].b).toBeGreaterThan(0)
      expect(f[H - 1][W - 1].b).toBeGreaterThan(0)
    }
  })

  it('offers the select on all four, a 0–1 slider for each position, and a free number in pixels', () => {
    for (const [nodeType, keys] of Object.entries(POSITION_UNIT_KEYS)) {
      expect(libraryDefaults(nodeType).units, nodeType).toBe('normalized')
      expect(isPropertyEnabled(nodeType, 'units', libraryDefaults(nodeType)), nodeType).toBe(true)
      for (const key of keys) {
        expect(propertyMetaFor(nodeType, key, { units: 'normalized' }), `${nodeType}.${key}`).toMatchObject({ control: 'slider', min: 0, max: 1 })
        expect(propertyMetaFor(nodeType, key, { units: 'pixels' }), `${nodeType}.${key}`).toBeUndefined()
      }
    }
  })
})
