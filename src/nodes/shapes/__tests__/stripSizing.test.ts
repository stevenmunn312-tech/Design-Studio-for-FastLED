import { describe, expect, it } from 'vitest'
import { evaluateGraphFull } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../../state/nodeLibrary'
import { evalFourierEpicycles, type FourierEpicyclesParams } from '../evaluate'
import { SIZING_SIDE_CPP } from '../../shared/stringCanvas'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}

let run = 0
function frame(nodeType: string, props: Record<string, unknown>, W: number, H: number, tick = 0): Frame {
  const id = `${nodeType}-${run++}`
  return evaluateGraphFull([node(id, nodeType, props)], [], tick, W, H, {}, true, true).outputs.get(id)!.frame as Frame
}
const litColumns = (f: Frame) => f[0].flatMap((px, x) => (px.r + px.g + px.b > 0 ? [x] : []))
const centroid = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length

const fourier: FourierEpicyclesParams = {
  outline: 'heart', customPoints: '', maxHarmonics: 32, harmonics: 32, speed: 0.25, scale: 0.8,
  thickness: 1.25, persistence: 1, color: { r: 255, g: 220, b: 80 }, showCircles: true, showPen: true,
}
function fourierFrames(id: string, params: Partial<FourierEpicyclesParams>, frames: number, W: number, H: number): Frame[] {
  const out: Frame[] = []
  for (let i = 0; i < frames; i++) out.push(evalFourierEpicycles(id, null, { ...fourier, ...params }, i / 60, W, H))
  return out
}

/** FNV-1a over a frame's channels. */
function hash(f: Frame): string {
  let h = 0x811c9dc5
  for (const row of f) for (const px of row) for (const byte of [px.r, px.g, px.b]) h = Math.imul(h ^ byte, 0x01000193) >>> 0
  return h.toString(16).padStart(8, '0')
}

describe('sized shapes on a 60-LED strip', () => {
  const W = 60, H = 1

  it('moves Path\'s point along the strip, which had no room to move', () => {
    // A circle crosses the middle row at a turn of 0 and of a half.
    const start = litColumns(frame('Path', { t: 0, speed: 0 }, W, H))
    const half = litColumns(frame('Path', { t: 0.5, speed: 0 }, W, H))
    expect(start.length).toBeGreaterThan(0)
    expect(half.length).toBeGreaterThan(0)
    expect(centroid(start) - centroid(half)).toBeGreaterThan(40)
    // Unwired, Speed carries it round: half a turn in two seconds.
    expect(litColumns(frame('Path', {}, W, H, 120))).toEqual(half)
  })

  it('draws Fourier Epicycles\' circles and trail across the strip, and moves them', () => {
    const frames = fourierFrames('strip-fourier', { persistence: 0 }, 90, W, H)
    const lit = frames.map((f) => litColumns(f))
    expect(lit.every((xs) => xs.length > 0)).toBe(true)
    expect(new Set(lit.map((xs) => xs.join(','))).size).toBeGreaterThan(20)
    // The guide circles reach well past the middle.
    expect(Math.max(...lit.flat()) - Math.min(...lit.flat())).toBeGreaterThan(30)
  })

  it('scales a Shape with the strip\'s length while Scale with matrix is on', () => {
    // Size 6 on the 16-pixel reference is 22.5 LEDs either side on 60.
    const scaled = litColumns(frame('Shape', { shape: 'ellipse', filled: true, thickness: 0 }, W, H))
    expect(scaled.length).toBeGreaterThanOrEqual(44)
    expect(scaled.length).toBeLessThanOrEqual(46)
    expect(litColumns(frame('Shape', { shape: 'ellipse', filled: true, thickness: 0, scaleWithMatrix: false }, W, H)).length).toBe(12)
  })

  it('reaches by the same side in the sketch', () => {
    const cpp = (nodeType: string, props: Record<string, unknown> = {}) => generateCpp([node('s', nodeType, props), node('out', 'MatrixOutput')],
      [{ id: 'e', source: 's', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }] as StudioEdge[])
    expect(cpp('Path')).toContain(`float _ext = max(0.0f, (float)${SIZING_SIDE_CPP} * 0.5f * 0.8 - _rad);`)
    expect(cpp('FourierEpicycles')).toContain(`int32_t _ext=(int32_t)(fmaxf(0.0f,${SIZING_SIDE_CPP}*0.5f*_scale-_rad)*256.0f)`)
    expect(cpp('Shape')).toContain(`float _size=max(0.5f,6)*(${SIZING_SIDE_CPP}/16.0f),`)
  })
})

describe('sized shapes on a matrix', () => {
  // Captured before the strip rule: every matrix renders byte for byte as it
  // did.
  const sizes = [[16, 16], [12, 7], [7, 12], [2, 9], [9, 2], [32, 8]]
  const cases: [string, Record<string, unknown>, number][] = [
    ['Path', {}, 30],
    ['Path', { pathShape: 'heart', t: 0.3, speed: 0, scale: 1, thickness: 2 }, 0],
    ['Path', { pathShape: 'star', speed: 0.6 }, 75],
    ['Shape', { shape: 'ellipse', thickness: 1 }, 0],
    ['Shape', { shape: 'polygon', size: 3.5, rotation: 20 }, 0],
    ['ClockDisplay', { displayMode: 'Analog' }, 0],
  ]

  it('renders Path, Shape and the analog clock as before', () => {
    const hashes = cases.flatMap(([nodeType, props, tick]) => sizes.map(([W, H]) => hash(frame(nodeType, props, W, H, tick))))
    expect(hashes.join(' ')).toBe(MATRIX_HASHES)
  })

  it('renders Fourier Epicycles as before', () => {
    const hashes = sizes.map(([W, H]) => hash(fourierFrames(`matrix-fourier-${W}x${H}`, {}, 40, W, H).at(-1)!))
    expect(hashes.join(' ')).toBe(FOURIER_HASHES)
  })
})

const MATRIX_HASHES = [
  'd5193d7c 4f621d12 54954b56 5e000117 38e0ab73 0697fbf7 3bb6a744 84834cbc e1fc8057 f28a8181 098d7f37 0d690b9b',
  '1a448fff 475a1e02 570d959a c185b784 01b5c6dc 88002ea0 844c9d45 c39d2ecb c6daa46b 7d3c5ca5 7eec4665 e3fee69d',
  '24a43a5d 7b202f33 d7f1e7be cb9eb8ce e7ef6886 64307220 53ad51e0 c6e89842 9f1712d9 09f902b9 8e54150d fa16e5ea',
].join(' ')
const FOURIER_HASHES = '758fad8a 187bb03c 16df84d5 20870954 c68e2c12 9ad2e58a'
