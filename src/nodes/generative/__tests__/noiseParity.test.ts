import { describe, it, expect } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { GENERATIVE_EVALUATORS } from '../evaluate'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { _snoise2, worleyHash, seedOffset } from '../../../state/evaluator/random'
import type { StudioNode, StudioEdge } from '../../../state/graphStore'
import type { EvalContext } from '../../../state/evaluator/types'

const W = 12, H = 8
const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const out = node('out', 'MatrixOutput', 'output', { width: W, height: H })
const wire = { id: 'e', source: 'n', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge

let run = 0

/** The Noise node's field in the preview, frame by frame at `times` (seconds). */
function previewFields(props: Record<string, unknown>, times: number[]): number[][] {
  const key = `noise-parity-${run++}`
  const ctx = {
    num: (_id: string, _port: string, p: Record<string, unknown>, k: string, fallback: number) => Number(p[k] ?? fallback),
    pal: () => [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }],
    W, H,
    stateKey: () => key,
  }
  return times.map((t) => {
    const result = GENERATIVE_EVALUATORS.Noise!({ ...ctx, t } as unknown as EvalContext, 'n', props, node('n', 'Noise', 'pattern', props), 'Noise') as { field: Float32Array | number[] }
    return Array.from(result.field)
  })
}

/** The same node's emitted block, run as JavaScript with its helpers bound to their preview twins. */
function firmwareFields(props: Record<string, unknown>, times: number[]): number[][] {
  const cpp = generateCpp([node('n', 'Noise', 'pattern', props), out], [wire])
  const loop = cpp.slice(cpp.indexOf('void loop() {'))
  const lines = loop.split('\n')
  const start = lines.findIndex((line) => /^ {2}\{/.test(line))
  const end = lines.findIndex((line, i) => i > start && line.includes('ColorFromPalette'))
  // The harness reads plain decimal literals; Worley's `1e9f` is the one exponent.
  const block = lines.slice(start, end).map((line) => line.replace(/1e9f/g, '1e9'))
  const step = compileCppSnippet(block, ['t', 'WIDTH', 'HEIGHT', 'field_n', '_snoise2', '_worleyHash'], [])
  const field = new Array<number>(W * H).fill(0)
  return times.map((t) => {
    step(t * 1000, { t, WIDTH: W, HEIGHT: H, field_n: field as never, _snoise2: _snoise2 as never, _worleyHash: worleyHash as never })
    return [...field]
  })
}

describe('Noise preview/firmware parity', () => {
  const times = [0.5, 0.5 + 1 / 60, 0.5 + 2 / 60, 3.25]
  it.each(['simplex', 'noise3d', 'noise4d', 'fbm', 'plasma', 'sine', 'worley'])('%s draws the same field', (noiseType) => {
    for (const seed of [0, 5]) {
      const props = { noiseType, seed, speed: 0.6, scale: 0.4 }
      const preview = previewFields(props, times)
      const firmware = firmwareFields(props, times)
      // Most types wrap the field round 0..1, so compare round the circle.
      preview.forEach((frame, f) => frame.forEach((value, i) => {
        const d = Math.abs(firmware[f][i] - value)
        expect(Math.min(d, 1 - d), `${noiseType} seed ${seed} frame ${f} pixel ${i}`).toBeLessThan(2e-4)
      }))
    }
  })
})

describe('Juggle seed parity', () => {
  it('places each seeded dot at the preview phase', () => {
    const cpp = generateCpp([node('n', 'Juggle', 'pattern', { seed: 5 }), out], [wire])
    const table = /_jph_n\[\d+\]=\{([^}]*)\}/.exec(cpp)![1].split(',').map((v) => Number.parseFloat(v))
    table.forEach((phase, d) => {
      // Only sines read it, so a whole number of turns either way is the same phase.
      expect(Math.sin(phase)).toBeCloseTo(Math.sin(seedOffset(5, d)), 5)
      expect(Math.cos(phase)).toBeCloseTo(Math.cos(seedOffset(5, d)), 5)
    })
    expect(cpp).toContain('float _phase=_jph_n[_d];')
  })
})
