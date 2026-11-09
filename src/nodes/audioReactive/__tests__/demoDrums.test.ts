import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraph, resetEvaluatorState } from '../../../state/graphEvaluator'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { DEMO_DRUM_BAR_SEC, demoDrums, demoDrumsCpp } from '../demoDrums'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge

const brightest = (frame: Frame) => Math.max(...frame.flat().map((px) => Math.max(px.r, px.g, px.b)))

beforeEach(() => resetEvaluatorState())

describe('demo drums for unwired drum patterns', () => {
  it('plays a kick at the top of each bar and a snare half a bar later', () => {
    expect(demoDrums(0)).toEqual({ kick: true, snare: false })
    expect(demoDrums(DEMO_DRUM_BAR_SEC * 0.5)).toEqual({ kick: false, snare: true })
    expect(demoDrums(DEMO_DRUM_BAR_SEC * 0.35)).toEqual({ kick: false, snare: false })
    expect(demoDrums(DEMO_DRUM_BAR_SEC * 1.1)).toEqual({ kick: true, snare: false })
  })

  it('matches the sketch at every moment of the bar', () => {
    const lines = ['  float t = millis() / 1000.0f;', ...demoDrumsCpp({ node: node('n', 'KickShock', 'pattern'), incoming: new Map() }, '_d')]
    const step = compileCppSnippet(lines, [], ['_dKick', '_dSnare'])
    for (let ms = 0; ms < DEMO_DRUM_BAR_SEC * 3000; ms += 37.3) {
      const expected = demoDrums(ms / 1000)
      const out = step(ms)
      expect(Boolean(out._dKick), `kick at ${ms}`).toBe(expected.kick)
      expect(Boolean(out._dSnare), `snare at ${ms}`).toBe(expected.snare)
    }
  })

  it.each(['KickShock', 'PercussionBlobs'])('%s shows on drop and stops the demo once a drum is wired', (type) => {
    const pattern = node('p', type, 'pattern')
    const out = node('out', 'MatrixOutput', 'output', { width: 16, height: 16 })
    const toOut = edge('e1', 'p', 'frame', 'out', 'frame')
    const frames = Array.from({ length: 40 }, (_, tick) => evaluateGraph([pattern, out], [toOut], tick, 16, 16)!)
    // Unwired they used to idle near black (about 5 of 255).
    expect(Math.max(...frames.map(brightest))).toBeGreaterThan(40)

    const unwired = generateCpp([pattern, out], [toOut])
    expect(unwired).toMatch(/bool _kickHit=\s*_(ks|pb)DemoKick/)

    resetEvaluatorState()
    const kick = node('k', 'Compare', 'math', { a: 0, b: 0.5 })
    const wired = [edge('e2', 'k', 'result', 'p', 'kick')]
    const quiet = Array.from({ length: 40 }, (_, tick) => evaluateGraph([kick, pattern, out], [...wired, toOut], tick, 16, 16)!)
    expect(Math.max(...quiet.map(brightest))).toBeLessThan(30)
    const wiredCpp = generateCpp([kick, pattern, out], [...wired, toOut])
    expect(wiredCpp).not.toContain('Demo')
  })
})
