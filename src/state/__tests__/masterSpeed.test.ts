import { describe, it, expect } from 'vitest'
import {
  MASTER_SPEED_DEFAULT, MASTER_SPEED_MIN, MASTER_SPEED_MAX,
  clampMasterSpeed, masterSpeedFromOutputs, masterSpeedOriginShift,
} from '../masterSpeed'
import { NODE_LIBRARY } from '../nodeLibrary'
import { evaluateGraphFull } from '../graphEvaluator'
import { generateCpp } from '../../codegen/cppGenerator'
import { findOutputRuntimeIssues } from '../../utils/validateGraph'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const output = node('out', 'MatrixOutput', {
  form: 'matrix', width: 4, height: 4, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5,
})
// Plasma reads `t`, so a sketch containing it needs the clock emitted.
const plasma = node('w', 'Plasma', { speed: 0.4 })
const frameEdge = edge('ef', 'w', 'frame', 'out', 'frame')

describe('the knob itself', () => {
  it('runs from a freeze to a multiple, with normal in between', () => {
    expect(MASTER_SPEED_MIN).toBe(0)
    expect(MASTER_SPEED_DEFAULT).toBe(1)
    expect(MASTER_SPEED_MAX).toBeGreaterThan(1)
  })

  it('clamps to its travel and treats nonsense as normal', () => {
    expect(clampMasterSpeed(-1)).toBe(MASTER_SPEED_MIN)
    expect(clampMasterSpeed(99)).toBe(MASTER_SPEED_MAX)
    expect(clampMasterSpeed(NaN)).toBe(MASTER_SPEED_DEFAULT)
    expect(clampMasterSpeed(undefined)).toBe(MASTER_SPEED_DEFAULT)
    expect(clampMasterSpeed(0.5)).toBe(0.5)
  })

  it('is a sink: the graph feeds it and nothing reads it', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'MasterSpeed')
    expect(def?.outputs).toEqual([])
    expect(def?.inputs.map((input) => input.id)).toEqual(['speed'])
  })
})

/*
 * The arithmetic that makes it a speed control rather than a time jump.
 *
 * `t * speed` looks equivalent and is not: moving the knob from 1 to 2 would
 * double `t` on the spot and every animation in the build would leap. The
 * origin shift changes how fast time runs from here on.
 */
describe('sliding the clock\'s origin', () => {
  it('does nothing at normal speed', () => {
    expect(masterSpeedOriginShift(16, 1)).toBe(0)
  })

  // At zero the origin keeps pace with the wall clock, so elapsed time stands
  // still — a freeze, not a rewind.
  it('freezes time by moving the origin with the clock', () => {
    expect(masterSpeedOriginShift(16, 0)).toBe(16)
  })

  it('runs time long by moving the origin backwards', () => {
    expect(masterSpeedOriginShift(16, 2)).toBe(-16)
  })

  // elapsed' = elapsed + gap - shift, which must be gap * speed.
  it('advances elapsed time by exactly gap times speed', () => {
    for (const speed of [0, 0.25, 1, 2, 4]) {
      expect(16 - masterSpeedOriginShift(16, speed)).toBeCloseTo(16 * speed, 6)
    }
  })
})

describe('reading the knob back out of a pass', () => {
  it('answers normal for a graph with no knob', () => {
    expect(masterSpeedFromOutputs([output], new Map())).toBe(MASTER_SPEED_DEFAULT)
  })

  it('publishes its own slider when nothing is wired', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 0.25 })
    const { outputs } = evaluateGraphFull([plasma, output, knob], [frameEdge], 0, 4, 4)
    expect(masterSpeedFromOutputs([plasma, output, knob], outputs)).toBe(0.25)
  })

  it('prefers a wired source over the slider', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 0.25 })
    const pot = node('p', 'PotInput', { pin: 4, value: 1 })
    const nodes = [plasma, output, knob, pot]
    const { outputs } = evaluateGraphFull(
      nodes, [frameEdge, edge('es', 'p', 'value', 'spd', 'speed')], 0, 4, 4,
    )
    expect(masterSpeedFromOutputs(nodes, outputs)).not.toBe(0.25)
  })

  // A knob evaluated only on publish frames would be read eight times a second
  // while the animation it scales runs at sixty.
  it('is evaluated on a hot-only pass, not just on publish frames', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 0.5 })
    const { outputs } = evaluateGraphFull([plasma, output, knob], [frameEdge], 0, 4, 4, {}, false)
    expect(outputs.has('spd')).toBe(true)
  })
})

describe('the emitted sketch', () => {
  it('keeps the plain clock for a graph with no knob', () => {
    const src = generateCpp([plasma, output], [frameEdge])
    expect(src).toContain('float t = millis() / 1000.0f;')
    expect(src).not.toContain('_tAnim')
  })

  /*
   * Accumulated, never multiplied. `millis() * speed` would jump every
   * animation the instant the knob moved, which is the whole reason this is
   * not a one-line change.
   */
  it('accumulates rather than scaling millis', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 0.5 })
    const src = generateCpp([plasma, output, knob], [frameEdge])
    expect(src).toContain('_tAnim += ((_tNowMs - _tLastMs) / 1000.0f) * _tSpeed;')
    expect(src).toContain('float t = _tAnim;')
    expect(src).not.toContain('millis() / 1000.0f * ')
  })

  // An unwired slider is a constant: no static, no feedback, nothing to carry
  // between passes.
  it('emits an unwired slider as a constant', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 0.5 })
    const src = generateCpp([plasma, output, knob], [frameEdge])
    expect(src).toContain('const float _tSpeed = 0.5000f;')
    expect(src).not.toContain('static float _tSpeed')
  })

  /*
   * A wired speed is resolved at the foot of the loop for the next pass. It
   * has to be: the clock is emitted at the top and the source is emitted below
   * it, and the source may itself read `t`. The browser carries the same
   * one-pass lag for the same reason.
   */
  it('carries a wired speed a pass behind, resolved after its source', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 1 })
    const pot = node('p', 'PotInput', { pin: 4 })
    const src = generateCpp([plasma, output, knob, pot], [frameEdge, edge('es', 'p', 'value', 'spd', 'speed')])
    expect(src).toContain('static float _tSpeed = 1.0000f;')
    expect(src).toContain('for the next pass')
    expect(src.indexOf('float t = _tAnim;')).toBeLessThan(src.indexOf('for the next pass'))
  })

  it('clamps the wired speed to the knob\'s own travel', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 1 })
    const pot = node('p', 'PotInput', { pin: 4 })
    const src = generateCpp([plasma, output, knob, pot], [frameEdge, edge('es', 'p', 'value', 'spd', 'speed')])
    expect(src).toContain(`constrain(`)
    expect(src).toContain(`${MASTER_SPEED_MIN.toFixed(1)}f, ${MASTER_SPEED_MAX.toFixed(1)}f`)
  })

  // A sink is never upstream of an LED output, so a walk that started only at
  // MatrixOutput would prune the knob's source clean out of the sketch.
  it('keeps what feeds the knob alive through the prune', () => {
    const knob = node('spd', 'MasterSpeed', { speed: 1 })
    const pot = node('p', 'PotInput', { pin: 4 })
    const src = generateCpp([plasma, output, knob, pot], [frameEdge, edge('es', 'p', 'value', 'spd', 'speed')])
    expect(src).toContain('n_p_value')
  })
})

describe('builds whose clock is not the sketch\'s own', () => {
  const master = node('master', 'PatternMaster')
  const slideshow = node('master', 'PatternSlideshow')
  const collection = node('coll', 'PatternCollection', { patternIds: ['a'] })
  const knob = node('spd', 'MasterSpeed', { speed: 0.5 })
  const showNodes = [slideshow, collection, output, knob]
  const showEdges = [
    edge('e1', 'coll', 'patternset', 'master', 'patternset'),
    edge('e2', 'master', 'frame', 'out', 'frame'),
  ]

  /*
   * Not a missing feature: a player's animation time *is* the track position,
   * so scaling it would slide the LEDs off the music.
   */
  it('refuses a player build, because its time is the music\'s', () => {
    const player = [master, collection, output, knob, node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const { errors } = findOutputRuntimeIssues(player, showEdges)
    expect(errors.join(' ')).toContain('track')
    expect(errors.join(' ')).toContain('music')
  })

  // The show's clock also times how long each pattern holds, which is a
  // duration in seconds and has no business speeding up with the animation.
  it('refuses a show build, and says what its clock also does', () => {
    const { errors } = findOutputRuntimeIssues(showNodes, showEdges)
    expect(errors.join(' ')).toContain('how long each pattern holds')
  })

  it('says nothing about a normal sketch, which honours it', () => {
    expect(findOutputRuntimeIssues([plasma, output, knob], [frameEdge]).errors).toEqual([])
  })

  it('says nothing about a show with no knob in it', () => {
    expect(findOutputRuntimeIssues([slideshow, collection, output], showEdges).errors).toEqual([])
  })
})
