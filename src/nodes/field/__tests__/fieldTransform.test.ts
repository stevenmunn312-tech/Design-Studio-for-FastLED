import { describe, expect, it } from 'vitest'
import {
  FIELD_EDGE_MODES, type FieldEdgeMode, fieldEdge, fieldEdgeCpp, fieldSamples, fieldTiles, fieldTransformCpp, fieldTransformFrame,
  fieldTransformPixel,
} from '../fieldTransform'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge

/** A field with detail in every pixel, so a misplaced read shows. */
function detail(W: number, H: number, seed = 1): Float32Array {
  const f = new Float32Array(W * H)
  for (let i = 0; i < f.length; i++) f[i] = (Math.sin(i * 12.9898 * seed) * 43758.5453) % 1 * 0.5 + 0.5
  return f
}

describe('Field Transform edges', () => {
  it('resolves an index past the edge the same way on the board', () => {
    for (const mode of FIELD_EDGE_MODES) {
      const run = compileCppSnippet(['int w=v;', fieldEdgeCpp(mode, 'w', 'N')], ['v', 'N'], ['w'])
      for (const n of [1, 5, 8]) {
        for (let i = -20; i <= 20; i++) {
          const board = Number(run(0, { v: i, N: n }).w) + 0
          expect(board, `${mode} ${i} of ${n}`).toBe(fieldEdge(mode, i, n) + 0)
          expect(board).toBeGreaterThanOrEqual(0)
          expect(board).toBeLessThan(n)
        }
      }
    }
    // Mirror repeats the edge pixel, so the reflected copy joins without a seam.
    expect([-2, -1, 0, 4, 5, 6].map((i) => fieldEdge('mirror', i, 5))).toEqual([1, 0, 0, 4, 4, 3])
  })

  it('counts whole tiles and caps the reads a pixel averages', () => {
    expect([0, 0.4, 1, 2.5, 3.49, 99].map(fieldTiles)).toEqual([1, 1, 1, 3, 3, 8])
    expect(fieldSamples(1, 1, 1)).toBe(1)
    expect(fieldSamples(3, 2, 1)).toBe(3)
    expect(fieldSamples(1, 1, 0.5)).toBe(2)
    expect(fieldSamples(8, 8, 0.25)).toBe(4)
  })
})

interface Case {
  W: number; H: number; push: boolean; strength: number; degrees: number | null; runtimeTurn: boolean
  zoom: number | null; tilesX: number | null; tilesY: number | null; runtimeSamples: boolean
  edge: FieldEdgeMode; bilinear: boolean
}

describe('Field Transform kernel', () => {
  const cases: Case[] = [
    { W: 8, H: 6, push: true, strength: 2, degrees: null, runtimeTurn: false, zoom: null, tilesX: null, tilesY: null, runtimeSamples: false, edge: 'clamp', bilinear: true },
    { W: 7, H: 7, push: true, strength: 3.5, degrees: null, runtimeTurn: false, zoom: null, tilesX: null, tilesY: null, runtimeSamples: false, edge: 'mirror', bilinear: false },
    { W: 9, H: 5, push: false, strength: 2, degrees: 37, runtimeTurn: false, zoom: null, tilesX: null, tilesY: null, runtimeSamples: false, edge: 'wrap', bilinear: true },
    { W: 10, H: 4, push: false, strength: 2, degrees: -128.5, runtimeTurn: true, zoom: 0.6, tilesX: 2, tilesY: 1, runtimeSamples: true, edge: 'clamp', bilinear: true },
    { W: 12, H: 9, push: false, strength: 2, degrees: null, runtimeTurn: false, zoom: null, tilesX: 3, tilesY: 2, runtimeSamples: false, edge: 'mirror', bilinear: true },
    { W: 6, H: 11, push: true, strength: 1.25, degrees: 200, runtimeTurn: true, zoom: 1.7, tilesX: 2.4, tilesY: 3.6, runtimeSamples: true, edge: 'wrap', bilinear: false },
    { W: 1, H: 9, push: true, strength: 1, degrees: 90, runtimeTurn: false, zoom: 0.4, tilesX: null, tilesY: null, runtimeSamples: false, edge: 'mirror', bilinear: true },
  ]

  it('reads the same values on the board as in the preview', () => {
    for (const c of cases) {
      const { W, H } = c
      const src = detail(W, H), dx = detail(W, H, 2), dy = detail(W, H, 3)
      const frame = fieldTransformFrame(c.strength, c.degrees ?? 0, c.zoom ?? 1, c.tilesX ?? 1, c.tilesY ?? 1, c.edge, c.bilinear, W, H)
      const preview = Array.from({ length: W * H }, (_, i) =>
        fieldTransformPixel(src, c.push ? dx : null, c.push ? dy : null, i % W, Math.trunc(i / W), frame))
      const kernel = fieldTransformCpp({
        src: 'src', out: 'out', dx: c.push ? 'dxf' : null, dy: c.push ? 'dyf' : null, strength: 'st',
        degrees: c.degrees === null ? null : c.runtimeTurn ? 'deg' : String(c.degrees),
        zoom: c.zoom === null ? null : 'zm', tilesX: c.tilesX === null ? null : 'tx', tilesY: c.tilesY === null ? null : 'ty',
        samples: c.runtimeSamples ? null : frame.samples, edge: c.edge, bilinear: c.bilinear,
      })
      const out = new Float32Array(W * H).fill(Number.NaN)
      const run = compileCppSnippet([...kernel.frame, ...kernel.loop], ['WIDTH', 'HEIGHT', 'src', 'out', 'dxf', 'dyf', 'st', 'deg', 'zm', 'tx', 'ty'], [])
      run(0, { WIDTH: W, HEIGHT: H, src, out, dxf: dx, dyf: dy, st: c.strength, deg: c.degrees ?? 0, zm: c.zoom ?? 1, tx: c.tilesX ?? 1, ty: c.tilesY ?? 1 } as unknown as Record<string, number>)
      for (let i = 0; i < W * H; i++) expect(out[i], `${JSON.stringify(c)} at ${i}`).toBeCloseTo(preview[i], 5)
    }
  })

  it('leaves out every step it cannot need', () => {
    const plain = fieldTransformCpp({
      src: 's', out: 'o', dx: 'd', dy: null, strength: '2', degrees: null, zoom: null, tilesX: null, tilesY: null,
      samples: 1, edge: 'clamp', bilinear: true,
    })
    const text = [...plain.frame, ...plain.loop].join('\n')
    expect(text).toContain('float _ftSt=constrain(2,0.0f,8.0f);')
    expect(text).not.toMatch(/_ftCo|_ftZ|_ftTx|_ftN|_oy|_sum/)
  })
})

function transformed(properties: Record<string, unknown>, source: string, W: number, H: number, tick = 0): Float32Array {
  resetEvaluatorState()
  const src = node('src', 'FieldFormula', 'field', { formula: source })
  const ft = node('ft', 'FieldWarp', 'field', properties)
  const paint = node('paint', 'FieldToFrame', 'field', {})
  const out = node('out', 'MatrixOutput', 'output', {})
  const { outputs } = evaluateGraphFull([src, ft, paint, out], [
    edge('a', 'src', 'ft', 'field', 'field'), edge('b', 'ft', 'paint', 'field', 'field'), edge('c', 'paint', 'out', 'frame', 'frame'),
  ], tick, W, H)
  return outputs.get('ft')!.field as Float32Array
}

describe('Field Transform fixes', () => {
  it('averages the pixels a tile squeezes, where Field Tile skipped every other one', () => {
    // Alternate columns of 0 and 1: skipping kept only the 0s.
    const W = 8, H = 4
    const tiled = transformed({ tilesX: 2, edgeMode: 'wrap' }, 'px % 2', W, H)
    for (const v of tiled) expect(v).toBeCloseTo(0.5, 6)
  })

  it('holds the edge by default when turning, instead of wrapping the far side into the corners', () => {
    const W = 9, H = 9
    const ramp = 'px/(W-1)'
    const held = transformed({ angle: 45 }, ramp, W, H)
    const wrapped = transformed({ angle: 45, edgeMode: 'wrap' }, ramp, W, H)
    // The top-left corner reads past the left edge: the ramp's own low end,
    // or, wrapped, its high end from the far side.
    expect(held[0]).toBeLessThan(0.1)
    expect(wrapped[0]).toBeGreaterThan(0.5)
  })

  it('mirrors every other tile', () => {
    const W = 8, H = 2
    const mirrored = transformed({ tilesX: 2, edgeMode: 'mirror' }, 'px/(W-1)', W, H)
    for (let x = 0; x < W; x++) expect(mirrored[x]).toBeCloseTo(mirrored[W - 1 - x], 6)
  })

  it('is the source field at rest and turns with its spin', () => {
    const W = 6, H = 5
    const ramp = 'px/(W-1)'
    const source = transformed({}, ramp, W, H)
    const still = transformed({ strength: 3, edgeMode: 'mirror', sampling: 'nearest' }, ramp, W, H)
    expect([...still]).toEqual([...source])
    expect([...transformed({ spin: 90 }, ramp, W, H, 60)]).not.toEqual([...source])
  })
})

describe('Field Transform keeps the looks it replaced', () => {
  it('pushes as Field Warp did', () => {
    const W = 9, H = 7
    const src = detail(W, H), dx = detail(W, H, 2), dy = detail(W, H, 3)
    // The removed Field Warp: clamp the pushed point, then blend.
    const old = (x: number, y: number, strength: number) => {
      const fx = Math.max(0, Math.min(W - 1, x + (2 * dx[y * W + x] - 1) * strength))
      const fy = Math.max(0, Math.min(H - 1, y + (2 * dy[y * W + x] - 1) * strength))
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1)
      const ax = fx - x0, ay = fy - y0
      return (src[y0 * W + x0] * (1 - ax) + src[y0 * W + x1] * ax) * (1 - ay) + (src[y1 * W + x0] * (1 - ax) + src[y1 * W + x1] * ax) * ay
    }
    for (const strength of [0.5, 2, 3.4]) {
      const frame = fieldTransformFrame(strength, 0, 1, 1, 1, 'clamp', true, W, H)
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = Math.trunc(i / W)
        expect(fieldTransformPixel(src, dx, dy, x, y, frame)).toBeCloseTo(old(x, y, strength), 6)
      }
    }
  })

  it('turns as Field Rotate did when read nearest and wrapped', () => {
    const W = 11, H = 8
    const src = detail(W, H)
    // The removed Field Rotate: nearest, always wrapped.
    const old = (x: number, y: number, degrees: number) => {
      const a = (degrees * Math.PI) / 180, ca = Math.cos(-a), sa = Math.sin(-a)
      const dx = x - (W - 1) / 2, dy = y - (H - 1) / 2
      const sx = ((Math.round(dx * ca - dy * sa + (W - 1) / 2) % W) + W) % W
      const sy = ((Math.round(dx * sa + dy * ca + (H - 1) / 2) % H) + H) % H
      return src[sy * W + sx]
    }
    for (const degrees of [17, -63.5, 141]) {
      const frame = fieldTransformFrame(2, degrees, 1, 1, 1, 'wrap', false, W, H)
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = Math.trunc(i / W)
        expect(fieldTransformPixel(src, null, null, x, y, frame), `${degrees}° at ${x},${y}`).toBe(old(x, y, degrees))
      }
    }
  })
})

describe('Field Transform firmware', () => {
  const mk = (properties: Record<string, unknown>, wires: StudioEdge[] = [], extra: StudioNode[] = []) => {
    const src = node('src', 'FieldFormula', 'field', { formula: 'x' })
    const paint = node('paint', 'FieldToFrame', 'field', {})
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
    return generateCpp([src, ...extra, node('ft', 'FieldWarp', 'field', properties), paint, out], [
      edge('e1', 'src', 'ft', 'field', 'field'), edge('e2', 'ft', 'paint', 'field', 'field'),
      edge('e3', 'paint', 'out', 'frame', 'frame'), ...wires,
    ])
  }

  it('copies the field when nothing can move it', () => {
    const cpp = mk({ strength: 3 })
    expect(cpp).not.toContain('/* Field Transform:')
    expect(cpp).not.toContain('_ftSt')
  })

  it('emits only the steps the graph can move', () => {
    const spin = mk({ spin: 20 })
    expect(spin).toContain('/* Field Transform: clamp, bilinear */')
    expect(spin).toContain('_phase_ft')
    expect(spin).toContain('_ftCo=cosf(_ftA)')
    expect(spin).not.toMatch(/_ftZ|_ftTx|_ftN|_ftSt/)
    const tiles = mk({ tilesX: 3, tilesY: 2, edgeMode: 'mirror' })
    expect(tiles).toContain('int _ftN=3;')
    expect(tiles).not.toContain('_phase_')
    const fieldWire = [edge('e4', 'nz', 'ft', 'field', 'dx')]
    const pushed = mk({ strength: 1.5 }, fieldWire, [node('nz', 'FieldNoise', 'field', {})])
    expect(pushed).toContain('_ftSt=constrain(1.5,0.0f,8.0f)')
    expect(pushed).toContain('(2.0f*field_nz[_i]-1.0f)*_ftSt')
  })

  it('works out the read count each frame when Zoom or Tiles is wired', () => {
    const lfo = node('lfo', 'Wave', 'signal', { frequency: 0.2, amplitude: 1, offset: 1.5 })
    const zoomed = mk({}, [edge('e4', 'lfo', 'ft', 'result', 'zoom')], [lfo])
    expect(zoomed).toContain('_ftN=constrain((int)ceilf(')
  })
})
