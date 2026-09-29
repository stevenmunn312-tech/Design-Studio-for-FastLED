import { describe, expect, it } from 'vitest'
import { evaluateGraph } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import {
  candleColor, classicHash, heartbeatEnvelope, heartbeatPhase, lightningLevel, stepLightning, sunriseColor, sunriseProgress,
  tvLayout, type LightningState,
} from '../evaluator/classics'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties: props, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}
const edge = (id: string, source: string, sh: string, target: string, th: string) =>
  ({ id, source, target, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

let run = 0
function frame(type: string, props: Record<string, unknown>, t: number, W = 8, H = 4) {
  const id = `c-${run++}`
  return evaluateGraph([node(id, type, 'pattern', props), node('out', 'MatrixOutput', 'output', {})], [edge('e', id, 'frame', 'out', 'frame')], t * 60, W, H)!
}
const flat = (f: { r: number; g: number; b: number }[][]) => f.flat()
const total = (f: { r: number; g: number; b: number }[][]) => flat(f).reduce((a, p) => a + p.r + p.g + p.b, 0)

describe('classic hash', () => {
  it('is deterministic, in [0, 1), and spreads', () => {
    const v = Array.from({ length: 200 }, (_, i) => classicHash(i))
    expect(v.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(new Set(v).size).toBeGreaterThan(190)
    expect(classicHash(7)).toBe(classicHash(7))
  })
})

describe('Candle', () => {
  it('single mode lights every pixel the same; perPixel makes them differ', () => {
    const single = flat(frame('Candle', { mode: 'single' }, 1.3))
    expect(new Set(single.map((p) => `${p.r},${p.g},${p.b}`)).size).toBe(1)
    const per = flat(frame('Candle', { mode: 'perPixel' }, 1.3))
    expect(new Set(per.map((p) => `${p.r},${p.g},${p.b}`)).size).toBeGreaterThan(4)
  })
  it('flicker 0 holds a steady flame; flicker moves it over time; warmth shifts green', () => {
    const a = candleColor(0.4, 0, 0, 0.5), b = candleColor(2.9, 0, 0, 0.5)
    expect(a).toEqual(b)
    const moves = new Set(Array.from({ length: 20 }, (_, i) => candleColor(i * 0.13, 0, 1, 0.5).r))
    expect(moves.size).toBeGreaterThan(5)
    expect(candleColor(0, 0, 0, 1).g).toBeGreaterThan(candleColor(0, 0, 0, 0).g)
  })
})

describe('Heartbeat', () => {
  it('peaks at the lub, dips between beats, and follows the rate', () => {
    expect(heartbeatEnvelope(0.05)).toBeGreaterThan(0.95)
    expect(heartbeatEnvelope(0.3)).toBeGreaterThan(0.6)
    expect(heartbeatEnvelope(0.7)).toBeLessThan(0.01)
    expect(heartbeatPhase(1, 60)).toBeCloseTo(0, 9)
    expect(heartbeatPhase(0.5, 120)).toBeCloseTo(0, 9)
  })
  it('strength 0 keeps the level flat; strength 1 goes dark between beats', () => {
    const period = 60 / 60
    expect(total(frame('Heartbeat', { bpm: 60, strength: 1 }, 0.7 * period))).toBeLessThan(total(frame('Heartbeat', { bpm: 60, strength: 1 }, 0.05 * period)))
    expect(total(frame('Heartbeat', { bpm: 60, strength: 1 }, 0.7 * period))).toBe(0)
  })
})

describe('Sunrise', () => {
  it('runs dark to warm white, timed or manual', () => {
    expect(sunriseColor(0)).toEqual({ r: 0, g: 0, b: 0 })
    const end = sunriseColor(1)
    expect(end.r).toBe(255)
    expect(end.b).toBeGreaterThan(100)
    expect(sunriseProgress('timed', 15, 0, 30, 0)).toBe(0.5)
    expect(sunriseProgress('manual', 15, 0, 30, 0.25)).toBe(0.25)
    expect(sunriseProgress('timed', 100, 0, 30, 0)).toBe(1)
  })
  it('gets brighter through the node', () => {
    const a = total(frame('Sunrise', { duration: 10 }, 2)), b = total(frame('Sunrise', { duration: 10 }, 8))
    expect(b).toBeGreaterThan(a)
    expect(total(frame('Sunrise', { mode: 'manual', progress: 0 }, 50))).toBe(0)
  })
})

describe('Lightning', () => {
  const fresh = (): LightningState => ({ nextAt: -1, start: -1e9, id: 0, prev: false, last: -Infinity })
  it('fires two to five flashes, then a dim afterglow', () => {
    for (let id = 1; id < 30; id++) {
      let peaks = 0, prev = 0
      for (let dt = 0; dt < 2; dt += 0.005) {
        const v = lightningLevel(id, dt)
        if (v > 0.3 && prev <= 0.3) peaks++
        prev = v
      }
      expect(peaks).toBeGreaterThanOrEqual(2)
      expect(peaks).toBeLessThanOrEqual(5)
      expect(lightningLevel(id, 1.9)).toBeLessThan(0.05)
    }
  })
  it('strikes on its own schedule and on a rising trigger', () => {
    const s = fresh()
    stepLightning(s, 0, 60, false)
    expect(s.id).toBe(0)
    stepLightning(s, 0.5, 60, false)
    expect(s.id).toBe(0)
    stepLightning(s, 5, 60, false)
    expect(s.id).toBeGreaterThan(0)
    const before = s.id
    stepLightning(s, 5.1, 60, true)
    expect(s.id).toBe(before + 1)
    stepLightning(s, 5.2, 60, true)
    expect(s.id).toBe(before + 1)
  })
  it('restarts when time runs backwards', () => {
    const s = fresh()
    stepLightning(s, 100, 60, false)
    stepLightning(s, 200, 60, false)
    stepLightning(s, 0, 60, false)
    expect(s.id).toBe(0)
  })
  it('intensity 0 stays dark', () => {
    for (let t = 0; t < 30; t += 0.1) expect(total(frame('Lightning', { intensity: 0, rate: 60 }, t))).toBe(0)
  })
})

describe('TV Simulator', () => {
  it('holds a scene between cuts and changes it across them', () => {
    const a = frame('TVSimulator', { cutRate: 0.1 }, 0.3), b = frame('TVSimulator', { cutRate: 0.1 }, 0.4)
    expect(flat(a).map((p) => p.r > 0)).toEqual(flat(b).map((p) => p.r > 0))
    const scenes = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(frame('TVSimulator', { cutRate: 1 }, i + 0.5))))
    expect(scenes.size).toBeGreaterThan(8)
  })
  it('lays out one to three columns and one to two rows', () => {
    for (let s = 0; s < 40; s++) {
      const { cols, rows } = tvLayout(s)
      expect(cols).toBeGreaterThanOrEqual(1); expect(cols).toBeLessThanOrEqual(3)
      expect(rows).toBeGreaterThanOrEqual(1); expect(rows).toBeLessThanOrEqual(2)
    }
  })
  it('brightness 0 is dark', () => {
    expect(total(frame('TVSimulator', { brightness: 0 }, 1))).toBe(0)
  })
})
