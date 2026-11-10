import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIO_SPEED_DEFAULT, AUDIO_SPEED_NODE_TYPES, audioSpeedRate, audioSpeedRateCpp } from '../audioSpeed'
import { NODE_LIBRARY, propertyMeta } from '../../../state/nodeLibrary'
import { evaluateGraph } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: def.label, nodeType, category: def.category,
      properties: { ...def.defaultProperties, ...props }, inputs: def.inputs, outputs: def.outputs,
    },
  } as unknown as StudioNode
}
const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as unknown as StudioEdge
const out = () => node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 })

function render(type: string, props: Record<string, unknown>, tick: number) {
  resetEvaluatorState()
  return JSON.stringify(evaluateGraph([node('p', type, props), out()], [edge('e', 'p', 'frame', 'out', 'frame')], tick, 8, 8))
}

beforeEach(() => resetEvaluatorState())

describe('audio pattern Speed', () => {
  it('puts every remapped pattern\'s tuned look at 0.5 on a 0–1 slider', () => {
    expect(AUDIO_SPEED_NODE_TYPES.size).toBe(14)
    for (const type of AUDIO_SPEED_NODE_TYPES) {
      const def = NODE_LIBRARY.find((entry) => entry.type === type)
      expect(def?.defaultProperties?.speed, type).toBe(AUDIO_SPEED_DEFAULT)
      expect(propertyMeta(type, 'speed'), type).toMatchObject({ control: 'slider', min: 0, max: 1 })
    }
  })

  it('runs at twice the slider, exactly, on both sides', () => {
    expect(audioSpeedRate(0.5)).toBe(1)
    // A saved value halved to fit doubles back to the same number.
    for (const value of [0.85, 0.62, 0.55, 0.9, 0.78, 0.74]) expect(audioSpeedRate(value / 2)).toBe(value)
    // Unwired, the sketch keeps the literal it emitted before the remap.
    expect(audioSpeedRateCpp('0.425')).toBe('0.85')
    expect(audioSpeedRateCpp('0.5')).toBe('1')
    expect(audioSpeedRateCpp('n_rate_result')).toBe('(2.0f * n_rate_result)')
  })

  it('moves at 1 twice as fast as at 0.5', () => {
    // Midrange Waves' phase is its rate times the time, seeded on first sight.
    expect(render('MidrangeWaves', { speed: 1 }, 600)).toBe(render('MidrangeWaves', { speed: 0.5 }, 1200))
    expect(render('MidrangeWaves', { speed: 1 }, 600)).not.toBe(render('MidrangeWaves', { speed: 0.5 }, 600))
  })

  it('no longer clamps a pattern back to its old top speed above 0.5', () => {
    // These patterns clamped the rate to 1, which is now the 0.5 position.
    for (const type of ['BassRings', 'MidrangeBloom', 'TreblePrism', 'AudioCascade', 'KickShock']) {
      expect(render(type, { speed: 1 }, 900), type).not.toBe(render(type, { speed: 0.75 }, 900))
    }
  })

  it('emits the old literal unwired and doubles a wired slider in the sketch', () => {
    const unwired = generateCpp([node('br', 'BassRings', { speed: 0.5 }), out()], [edge('e', 'br', 'frame', 'out', 'frame')])
    expect(unwired).toContain('float _spd = min(2.0f, max(0.0f, 1));')
    const wired = generateCpp(
      [node('lfo', 'Math', { mathOp: 'add', a: 0.2, b: 0.1 }), node('ks', 'KickShock'), out()],
      [edge('w', 'lfo', 'result', 'ks', 'speed'), edge('e', 'ks', 'frame', 'out', 'frame')],
    )
    expect(wired).toContain('_spd=constrain((2.0f * n_lfo_result),0.0f,2.0f)')
  })
})
