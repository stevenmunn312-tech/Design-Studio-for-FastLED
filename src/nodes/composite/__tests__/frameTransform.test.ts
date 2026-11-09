import { describe, expect, it } from 'vitest'
import {
  exactSource, exactTransformCpp, exactTransformFrame, frameQuarterTurns, smoothSource, smoothTransformCpp, smoothTransformFrame,
  wholeOffset,
} from '../frameTransform'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraph, resetEvaluatorState } from '../../../state/graphEvaluator'
import { buildFrame, sampleFrame, type FrameEdgeMode } from '../../../state/evaluator/frames'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge

/** Run a kernel's C++ over every pixel, writing what `store` names into `out`. */
function runKernel(
  kernel: { frame: string[]; pixel: string[] }, W: number, H: number, inputs: Record<string, number>, store: string[],
): number[][] {
  const outs = store.map(() => new Array<number>(W * H).fill(Number.NaN))
  const names = store.map((_, i) => `out${i}`)
  const run = compileCppSnippet([
    ...kernel.frame,
    'for(int _y=0;_y<HEIGHT;_y++) for(int _x=0;_x<WIDTH;_x++){',
    ...kernel.pixel,
    ...store.map((expr, i) => `${names[i]}[_y*WIDTH+_x]=${expr};`),
    '}',
  ], ['WIDTH', 'HEIGHT', ...Object.keys(inputs), ...names], [])
  const values: Record<string, unknown> = { WIDTH: W, HEIGHT: H, ...inputs }
  names.forEach((name, i) => { values[name] = outs[i] })
  run(0, values as Record<string, number>)
  return outs
}

const SIZES = [[8, 8], [12, 5], [5, 11], [1, 9], [16, 1]] as const

describe('Frame Transform kernels', () => {
  it('Exact picks the same source pixel on the board as in the preview', () => {
    for (const [W, H] of SIZES) {
      for (const [deg, ox, oy, flipX, flipY] of [
        [0, 0, 0, false, false], [90, 3, -2, false, true], [-90, -70.4, 9.5, true, false],
        [180, 0.5, -0.5, true, true], [271, 1234.6, -88, false, false], [44.9, -3, 2, true, false],
      ] as const) {
        const frame = exactTransformFrame(deg, flipX, flipY, ox, oy, W, H)
        for (const turns of [frameQuarterTurns(deg), 'deg'] as const) {
          const [board] = runKernel(
            exactTransformCpp({ turns, flipX, flipY, offsetX: 'ox', offsetY: 'oy' }), W, H, { deg, ox, oy }, ['_sy*WIDTH+_sx'],
          )
          const preview = Array.from({ length: W * H }, (_, i) => exactSource(i % W, Math.trunc(i / W), frame))
          expect(board, `${W}x${H} ${deg}° ${ox},${oy} ${turns}`).toEqual(preview)
        }
      }
    }
  })

  it('Exact leaves out a slide the graph never moves', () => {
    const still = exactTransformCpp({ turns: 1, flipX: false, flipY: false, offsetX: null, offsetY: null })
    expect(still.frame).toEqual([])
    expect(still.pixel[0]).toBe('int _px=_x,_py=_y;')
    const [board] = runKernel(still, 6, 4, {}, ['_sy*WIDTH+_sx'])
    const frame = exactTransformFrame(90, false, false, 0, 0, 6, 4)
    expect(board).toEqual(Array.from({ length: 24 }, (_, i) => exactSource(i % 6, Math.trunc(i / 6), frame)))
  })

  it('rounds and wraps a slide into the matrix', () => {
    expect(wholeOffset(0, 8)).toBe(0)
    expect(wholeOffset(2.5, 8)).toBe(3)
    expect(wholeOffset(-0.5, 8)).toBe(0)
    expect(wholeOffset(-1, 8)).toBe(7)
    expect(wholeOffset(17, 8)).toBe(1)
    expect(Object.is(wholeOffset(-8, 8), 0)).toBe(true)
  })

  it('Smooth reads the same source point on the board as in the preview', () => {
    for (const [W, H] of SIZES) {
      for (const [deg, scale, ox, oy, flipX, flipY] of [
        [0, 1, 0, 0, false, false], [30, 1, 0, 0, false, false], [0, 0.6, 0, 0, true, false],
        [-127.5, 2.3, 1.25, -3.5, false, true], [400, 0.25, -20, 7, true, true], [0, 1, 2.5, 0, false, false],
      ] as const) {
        const frame = smoothTransformFrame(deg, scale, flipX, flipY, ox, oy, W, H)
        // Every step present, and each one the sketch leaves out when it cannot move.
        const specs = [
          { degrees: 'deg', scale: 'scale', offsetX: 'ox', offsetY: 'oy' },
          {
            degrees: deg === 0 ? null : 'deg', scale: scale === 1 ? null : 'scale',
            offsetX: ox === 0 ? null : 'ox', offsetY: oy === 0 ? null : 'oy',
          },
        ]
        for (const spec of specs) {
          const [sx, sy] = runKernel(smoothTransformCpp({ ...spec, flipX, flipY }), W, H, { deg, scale, ox, oy }, ['_sx', '_sy'])
          for (let i = 0; i < W * H; i++) {
            const [px, py] = smoothSource(i % W, Math.trunc(i / W), frame)
            expect(sx[i], `${W}x${H} ${deg}° x at ${i}`).toBeCloseTo(px, 9)
            expect(sy[i], `${W}x${H} ${deg}° y at ${i}`).toBeCloseTo(py, 9)
          }
        }
      }
    }
  })

  it('agrees with Exact on a square matrix at a quarter turn', () => {
    const W = 7
    const exact = exactTransformFrame(90, false, true, 0, 0, W, W)
    const smooth = smoothTransformFrame(90, 1, false, true, 0, 0, W, W)
    for (let i = 0; i < W * W; i++) {
      const [sx, sy] = smoothSource(i % W, Math.trunc(i / W), smooth)
      expect(Math.round(sy) * W + Math.round(sx)).toBe(exactSource(i % W, Math.trunc(i / W), exact))
    }
  })
})

/** A coloured, asymmetric source, so a misplaced pixel shows. */
function gradient(W: number, H: number): Frame {
  return buildFrame(W, H, (x, y) => ({ r: (x * 37) % 256, g: (y * 53) % 256, b: ((x + 2 * y) * 29) % 256 }))
}

/** The frame through a fresh Frame Transform: its rates integrate from this tick. */
function transformed(properties: Record<string, unknown>, tick: number, W: number, H: number): Frame {
  resetEvaluatorState()
  const src = node('src', 'GradientFrame', 'pattern', { rA: 0, gA: 0, bA: 0, rB: 255, gB: 128, bB: 40, angle: 30 })
  const tr = node('tr', 'FrameTransform', 'composite', properties)
  const out = node('out', 'MatrixOutput', 'output', {})
  return evaluateGraph([src, tr, out], [edge('a', 'src', 'tr', 'frame', 'frame'), edge('b', 'tr', 'out', 'frame', 'frame')], tick, W, H)!
}

function source(W: number, H: number): Frame {
  const src = node('src', 'GradientFrame', 'pattern', { rA: 0, gA: 0, bA: 0, rB: 255, gB: 128, bB: 40, angle: 30 })
  const out = node('out', 'MatrixOutput', 'output', {})
  return evaluateGraph([src, out], [edge('b', 'src', 'out', 'frame', 'frame')], 0, W, H)!
}

describe('Frame Transform keeps the looks it replaced', () => {
  // The removed Transform node at a constant rate, as it drew: nearest
  // samples about the centre, black outside, and a wrapping slide.
  function oldTransform(src: Frame, mode: string, phase: number, angle: number, W: number, H: number): Frame {
    const cx = (W - 1) / 2, cy = (H - 1) / 2
    const sample = (sx: number, sy: number) => {
      const xi = Math.round(sx), yi = Math.round(sy)
      return xi < 0 || xi >= W || yi < 0 || yi >= H ? { r: 0, g: 0, b: 0 } : { ...src[yi][xi] }
    }
    if (mode === 'translate') {
      const a = (angle * Math.PI) / 180
      const dx = Math.cos(a) * phase, dy = Math.sin(a) * phase
      return buildFrame(W, H, (x, y) => ({ ...src[((Math.round(y - dy) % H) + H) % H][((Math.round(x - dx) % W) + W) % W] }))
    }
    if (mode === 'scale') {
      const w = ((((phase / 100 + 1) % 4) + 4) % 4) - 1
      const s = 2 ** (w < 1 ? w : 2 - w)
      return buildFrame(W, H, (x, y) => sample(cx + (x - cx) / s, cy + (y - cy) / s))
    }
    const a = (phase * Math.PI) / 180
    const co = Math.cos(a), si = Math.sin(a)
    return buildFrame(W, H, (x, y) => sample(cx + (x - cx) * co + (y - cy) * si, cy - (x - cx) * si + (y - cy) * co))
  }

  it('turns, breathes and slides as the Transform node did', () => {
    const W = 13, H = 9
    const src = source(W, H)
    for (const tick of [10, 37, 95]) {
      const t = tick / 60
      expect(transformed({ mode: 'smooth', rotateRate: 30, edgeMode: 'black', sampling: 'nearest' }, tick, W, H), `rotate ${tick}`)
        .toEqual(oldTransform(src, 'rotate', 30 * t, 0, W, H))
      expect(transformed({ mode: 'smooth', scaleRate: 70, edgeMode: 'black', sampling: 'nearest' }, tick, W, H), `scale ${tick}`)
        .toEqual(oldTransform(src, 'scale', 70 * t, 0, W, H))
      expect(transformed({ mode: 'exact', offsetXRate: 7 }, tick, W, H), `translate ${tick}`)
        .toEqual(oldTransform(src, 'translate', 7 * t, 0, W, H))
      expect(transformed({ mode: 'exact', offsetYRate: -5 }, tick, W, H), `translate down ${tick}`)
        .toEqual(oldTransform(src, 'translate', 5 * t, 270, W, H))
    }
  })

  // Frame Warp's removed zoom and rotate, with no push: the inverse read
  // about the centre through the shared sampler.
  function oldWarpView(src: Frame, zoom: number, degrees: number, edge: FrameEdgeMode, W: number, H: number): Frame {
    const a = degrees * Math.PI / 180, co = Math.cos(a), si = Math.sin(a)
    const cx = (W - 1) / 2, cy = (H - 1) / 2
    return buildFrame(W, H, (x, y) => {
      const px = (x - cx) / zoom, py = (y - cy) / zoom
      return sampleFrame(src, cx + px * co + py * si, cy - px * si + py * co, edge, true)
    })
  }

  it('zooms and tilts as Frame Warp did before its zoom and rotate moved here', () => {
    const W = 12, H = 10
    const src = source(W, H)
    for (const [zoom, degrees, edgeMode] of [[1.42, 0, 'wrap'], [1.2, -8, 'wrap'], [1.5, 0, 'clamp'], [0.8, 5.5, 'clamp']] as const) {
      const now = transformed({ mode: 'smooth', scale: zoom, rotate: degrees, edgeMode, sampling: 'bilinear' }, 0, W, H)
      const before = oldWarpView(src, zoom, degrees, edgeMode, W, H)
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          for (const c of ['r', 'g', 'b'] as const) {
            expect(Math.abs(now[y][x][c] - before[y][x][c]), `${zoom} ${degrees} ${x},${y}`).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('stays exactly as Frame Transform drew a fixed turn, flip and slide', () => {
    const W = 9, H = 6
    const src = gradient(W, H)
    const old = (turns: number, flipX: boolean, flipY: boolean, ox: number, oy: number) => buildFrame(W, H, (x, y) => {
      const px = (((x - ox) % W) + W) % W, py = (((y - oy) % H) + H) % H
      let u = px / (W - 1), v = py / (H - 1)
      if (flipX) u = 1 - u
      if (flipY) v = 1 - v
      for (let k = 0; k < turns; k++) { const nu = v; v = 1 - u; u = nu }
      return src[Math.round(v * (H - 1))][Math.round(u * (W - 1))]
    })
    for (const [deg, flipX, flipY, ox, oy] of [[90, false, false, 0, 0], [270, true, false, 4, -2], [180, true, true, -7, 3]] as const) {
      const frame = exactTransformFrame(deg, flipX, flipY, ox, oy, W, H)
      const now = buildFrame(W, H, (x, y) => { const at = exactSource(x, y, frame); return src[Math.trunc(at / W)][at % W] })
      expect(now).toEqual(old(deg / 90, flipX, flipY, ox, oy))
    }
  })
})

describe('Frame Transform firmware', () => {
  const mk = (properties: Record<string, unknown>, wires: StudioEdge[] = [], extra: StudioNode[] = []) => {
    const src = node('src', 'GradientFrame', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
    return generateCpp([src, ...extra, node('ft', 'FrameTransform', 'composite', properties), out], [
      edge('e1', 'src', 'ft', 'frame', 'frame'), edge('e2', 'ft', 'out', 'frame', 'frame'), ...wires,
    ])
  }

  it('copies the frame when nothing can move it', () => {
    for (const mode of ['exact', 'smooth']) {
      const cpp = mk({ mode, scale: 1 })
      expect(cpp, mode).not.toMatch(/Frame Transform: (?:exact|smooth)/)
      expect(cpp, mode).not.toContain('_sampleFrame')
      expect(cpp, mode).not.toContain('_ftCx')
    }
  })

  it('unrolls a fixed quarter turn and integrates only the rates that are set', () => {
    const fixed = mk({ rotate: 90, flipX: true })
    expect(fixed).toContain('// Frame Transform: exact')
    expect(fixed.match(/\{ float _nu=_v; _v=1\.0f-_u; _u=_nu; \}/g)).toHaveLength(1)
    expect(fixed).not.toContain('_phase_')
    expect(fixed).not.toContain('_ftK')
    const spinning = mk({ rotate: 90, rotateRate: 45 })
    expect(spinning).toContain('_ftK=')
    expect(spinning).toContain('_phase_ft_rotate')
    expect(spinning).not.toContain('_phase_ft_x')
    expect(spinning).not.toContain('_phase_ft_scale')
  })

  it('reads a wired value at run time', () => {
    const lfo = node('lfo', 'Wave', 'signal', { frequency: 0.2, amplitude: 180 })
    const wired = mk({ mode: 'exact' }, [edge('e3', 'lfo', 'ft', 'result', 'rotate')], [lfo])
    expect(wired).toContain('_ftK=')
    const zoomed = mk({ mode: 'smooth' }, [edge('e3', 'lfo', 'ft', 'result', 'scale')], [lfo])
    expect(zoomed).toContain('float _ftS=constrain(')
    expect(zoomed).toContain('_sampleFrame(')
  })

  it('samples Smooth through the shared frame sampler with its edge mode', () => {
    // Three in a chain, so no argument is the same at every call and folds away.
    const chain = (['clamp', 'wrap', 'black'] as const).map((edgeMode, i) =>
      node(`f${i}`, 'FrameTransform', 'composite', { mode: 'smooth', rotate: 20, edgeMode, sampling: i ? 'bilinear' : 'nearest' }))
    const cpp = generateCpp([node('src', 'GradientFrame', 'pattern', {}), ...chain, node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })], [
      edge('e1', 'src', 'f0', 'frame', 'frame'), edge('e2', 'f0', 'f1', 'frame', 'frame'),
      edge('e3', 'f1', 'f2', 'frame', 'frame'), edge('e4', 'f2', 'out', 'frame', 'frame'),
    ])
    expect(cpp).toContain('static inline CRGB _sampleFrame(')
    expect(cpp).toMatch(/_sampleFrame\(buf_src, ?_sx, ?_sy, ?0, ?false\)/)
    expect(cpp).toMatch(/_sampleFrame\(buf_f0, ?_sx, ?_sy, ?1, ?true\)/)
    expect(cpp).toMatch(/_sampleFrame\(buf_f1, ?_sx, ?_sy, ?2, ?true\)/)
  })
})
