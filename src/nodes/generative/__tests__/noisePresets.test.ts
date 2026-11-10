import { describe, expect, it } from 'vitest'
import { GENERATIVE_EVALUATORS } from '../evaluate'
import { NOISE3D_SPEED_AS_FBM, NOISE_PRESETS, SIMPLEX_SPEED_AS_FBM } from '../noiseTypes'
import { _snoise2 } from '../../../state/evaluator/random'
import type { EvalContext } from '../../../state/evaluator/types'
import type { StudioNode } from '../../../state/graphStore'

/*
 * The Simplex and Noise 3D presets stand in for the Noise types the merge
 * removed. These reference fields are those types as they were, before the
 * wrap round the palette was taken out, so the presets stay held to the look
 * they were chosen to keep: the same spread of values (contrast) and the same
 * pace of change (motion).
 */
const W = 32, H = 32
const TIMES = [0.7, 3.1, 9.4]

function oldSimplex(speed: number, scale: number, x: number, y: number, t: number): number {
  const ph = t * speed * 3, sc = scale * 0.5
  let v = 0, amp = 1, f = sc
  for (let o = 0; o < 4; o++) { v += amp * _snoise2(x * f + ph * 0.13, y * f + ph * 0.1); amp *= 0.5; f *= 2 }
  return v * 0.5 + 0.5
}

function oldNoise3d(speed: number, scale: number, x: number, y: number, t: number): number {
  const z = t * speed * 5 * 0.08, sc = scale * 0.5
  let v = 0, amp = 1, f = sc
  for (let o = 0; o < 3; o++) {
    v += amp * (_snoise2(x * f + z * 0.37, y * f) * 0.6 + _snoise2(x * f * 0.9, y * f + z * 0.61) * 0.4)
    amp *= 0.5; f *= 2.1
  }
  return v * 0.5 + 0.5
}

const reference = (gen: (x: number, y: number, t: number) => number, t: number): number[] => {
  const out: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.push(gen(x, y, t))
  return out
}

let run = 0
const presetField = (props: Record<string, unknown>, t: number): number[] => {
  const key = `noise-preset-${run++}`
  const ctx = {
    num: (_id: string, _port: string, p: Record<string, unknown>, k: string, fallback: number) => Number(p[k] ?? fallback),
    pal: () => 'rainbow', W, H, stateKey: () => key, t,
  } as unknown as EvalContext
  const node = { id: 'n', data: { nodeType: 'Noise', properties: props } } as unknown as StudioNode
  return Array.from((GENERATIVE_EVALUATORS.Noise!(ctx, 'n', props, node, 'Noise') as { field: Float32Array }).field)
}

const std = (values: number[]) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
}
const corr = (a: number[], b: number[]) => {
  const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length
  let num = 0, da = 0, db = 0
  for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 }
  return num / Math.sqrt(da * db)
}

function compare(
  gen: (x: number, y: number, t: number) => number, props: Record<string, unknown>, lag: number,
) {
  const spread = (fields: number[][]) => fields.reduce((s, f) => s + std(f), 0) / fields.length
  const pace = (field: (t: number) => number[]) => TIMES.reduce((s, t) => s + corr(field(t), field(t + lag)), 0) / TIMES.length
  return {
    spread: [spread(TIMES.map((t) => reference(gen, t))), spread(TIMES.map((t) => presetField(props, t)))],
    pace: [pace((t) => reference(gen, t)), pace((t) => presetField(props, t))],
  }
}

describe('Noise presets for the removed types', () => {
  const preset = (name: string) => NOISE_PRESETS.find((p) => p.name === name)!.properties

  it('Simplex keeps its contrast and, below fbm\'s top speed, its pace', () => {
    // The Help example's 0.2 converts exactly; the preset is the default 0.5.
    const props = { ...preset('Simplex'), speed: 0.2 * SIMPLEX_SPEED_AS_FBM, scale: 0.42 }
    const { spread, pace } = compare((x, y, t) => oldSimplex(0.2, 0.42, x, y, t), props, 1.5)
    expect(spread[1] / spread[0]).toBeGreaterThan(0.9)
    expect(spread[1] / spread[0]).toBeLessThan(1.1)
    expect(Math.abs(pace[1] - pace[0])).toBeLessThan(0.08)
  })

  it('Noise 3D keeps its contrast and pace', () => {
    const props = preset('Noise 3D')
    expect(props.speed).toBeCloseTo(0.5 * NOISE3D_SPEED_AS_FBM, 5)
    const { spread, pace } = compare((x, y, t) => oldNoise3d(0.5, 0.5, x, y, t), props, 1.5)
    expect(spread[1] / spread[0]).toBeGreaterThan(0.9)
    expect(spread[1] / spread[0]).toBeLessThan(1.1)
    expect(Math.abs(pace[1] - pace[0])).toBeLessThan(0.08)
  })
})
