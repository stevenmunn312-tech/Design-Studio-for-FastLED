import { describe, it, expect } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { GENERATIVE_EVALUATORS } from '../evaluate'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { _snoise2, worleyHash, seedOffset } from '../../../state/evaluator/random'
import { sin16 } from '../../shared/lib8tion'
import { PLASMA_SCALE_MAX, PLASMA_SPEED_MAX } from '../../shared/speedRange'
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
  const step = compileCppSnippet(block, ['t', 'WIDTH', 'HEIGHT', 'NUM_LEDS', 'field_n', '_snoise2', '_worleyHash'], [])
  const field = new Array<number>(W * H).fill(0)
  return times.map((t) => {
    step(t * 1000, { t, WIDTH: W, HEIGHT: H, NUM_LEDS: W * H, field_n: field as never, _snoise2: _snoise2 as never, _worleyHash: worleyHash as never })
    return [...field]
  })
}

describe('Noise preview/firmware parity', () => {
  const times = [0.5, 0.5 + 1 / 60, 0.5 + 2 / 60, 3.25]
  it.each(['noise4d', 'fbm', 'plasma', 'worley', 'gabor'])('%s draws the same field', (noiseType) => {
    for (const seed of [0, 5]) {
      const props = { noiseType, seed, speed: 0.6, scale: 0.4 }
      const preview = previewFields(props, times)
      const firmware = firmwareFields(props, times)
      preview.forEach((frame, f) => frame.forEach((value, i) => {
        expect(Math.abs(firmware[f][i] - value), `${noiseType} seed ${seed} frame ${f} pixel ${i}`).toBeLessThan(2e-4)
      }))
    }
  })

  it('applies contrast, then shape, on both sides', () => {
    for (const props of [
      { noiseType: 'fbm', contrast: 1.85, speed: 0.6, scale: 0.4 },
      { noiseType: 'fbm', contrast: 0.6, noiseShape: 'ridged', speed: 0.6, scale: 0.4 },
    ]) {
      const preview = previewFields(props, times)
      const firmware = firmwareFields(props, times)
      preview.forEach((frame, f) => frame.forEach((value, i) => {
        expect(Math.abs(firmware[f][i] - value), `${JSON.stringify(props)} frame ${f} pixel ${i}`).toBeLessThan(2e-4)
      }))
    }
  })

  /*
   * Every kept type holds its field at 0 and 1. The ones that wrapped it
   * round the palette (noise4d, plasma) cut seams through palettes that do
   * not join end to end, such as lava; a removed type, read from an old
   * save, draws fbm.
   */
  it('holds every type inside 0..1 and reads a removed type as fbm', () => {
    for (const noiseType of ['noise4d', 'plasma', 'fbm']) {
      for (const frame of previewFields({ noiseType, speed: 1, scale: 1, contrast: 3 }, times)) {
        for (const value of frame) expect(value >= 0 && value <= 1, noiseType).toBe(true)
      }
    }
    expect(previewFields({ noiseType: 'simplex', speed: 0.6, scale: 0.4 }, times))
      .toEqual(previewFields({ noiseType: 'fbm', speed: 0.6, scale: 0.4 }, times))
    expect(firmwareFields({ noiseType: 'noise3d', speed: 0.6, scale: 0.4 }, times))
      .toEqual(firmwareFields({ noiseType: 'fbm', speed: 0.6, scale: 0.4 }, times))
  })
})

/** Plasma's frame in the preview through a black-to-white palette: red is its 0–255 level. */
function previewPlasmaLevels(props: Record<string, unknown>, times: number[]): number[][] {
  const key = `plasma-parity-${run++}`
  const ctx = {
    num: (_id: string, _port: string, p: Record<string, unknown>, k: string, fallback: number) => Number(p[k] ?? fallback),
    pal: () => [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }],
    W, H,
    stateKey: () => key,
  }
  return times.map((t) => {
    const result = GENERATIVE_EVALUATORS.Plasma!({ ...ctx, t } as unknown as EvalContext, 'n', props, node('n', 'Plasma', 'pattern', props), 'Plasma') as unknown as { frame: { r: number }[][] }
    return result.frame.flatMap((row) => row.map((c) => c.r))
  })
}

/** The palette index Plasma's emitted block hands ColorFromPalette for each pixel. */
function firmwarePlasmaLevels(props: Record<string, unknown>, times: number[]): number[][] {
  const cpp = generateCpp([node('n', 'Plasma', 'pattern', props), out], [wire])
  const loop = cpp.slice(cpp.indexOf('void loop() {'))
  const lines = loop.split('\n')
  const start = lines.findIndex((line) => /^ {2}\{/.test(line))
  const end = lines.findIndex((line, i) => i > start && /^ {2}\}/.test(line))
  const step = compileCppSnippet(lines.slice(start, end + 1), ['t', 'WIDTH', 'HEIGHT', 'buf_n', 'sin16', 'ColorFromPalette', 'paldef_rainbow', 'LINEARBLEND_NOWRAP'], [])
  const buf = new Array<number>(W * H).fill(0)
  return times.map((t) => {
    step(t * 1000, {
      t, WIDTH: W, HEIGHT: H, buf_n: buf as never, sin16: sin16 as never,
      ColorFromPalette: ((_pal: unknown, index: number) => index) as never, paldef_rainbow: 0, LINEARBLEND_NOWRAP: 2,
    })
    return [...buf]
  })
}

describe('Plasma sine styles parity', () => {
  const times = [0.5, 0.5 + 1 / 60, 3.25]
  it.each(['sineGrid', 'sine2d'])('%s colours the same level', (plasmaStyle) => {
    const props = { plasmaStyle, speed: 0.6, scale: 0.4 }
    const preview = previewPlasmaLevels(props, times)
    const firmware = firmwarePlasmaLevels(props, times)
    // The preview blends the palette continuously; the sketch truncates to a byte.
    preview.forEach((frame, f) => frame.forEach((level, i) => {
      expect(Math.abs(firmware[f][i] - level), `${plasmaStyle} frame ${f} pixel ${i}`).toBeLessThanOrEqual(1)
    }))
  })

  it('keeps the speed and scale ranges the sine styles had as Noise types', () => {
    expect(PLASMA_SPEED_MAX).toEqual({ classic: 2, sineGrid: 5, sine2d: 1 })
    expect(PLASMA_SCALE_MAX).toEqual({ classic: 2, sineGrid: 2, sine2d: 1 })
  })

  it('draws the classic plasma when the style is missing', () => {
    expect(previewPlasmaLevels({ speed: 0.6 }, times)).toEqual(previewPlasmaLevels({ plasmaStyle: 'classic', speed: 0.6 }, times))
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
