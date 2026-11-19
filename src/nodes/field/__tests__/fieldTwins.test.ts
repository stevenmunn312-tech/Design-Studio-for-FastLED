/*
 * Pattern nodes and their field-chain twins draw the same thing: Field Noise
 * offers the Noise node's algorithms through one shared evaluator and one
 * shared C++ emitter, Automaton runs the Game of Life pattern's rules, and
 * Gradient Field scrolls as Palette Gradient does. Every new option defaults
 * to what the node drew before it existed.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../../../state/graphEvaluator'
import { generateCpp } from '../../../codegen/cppGenerator'
import { NODE_LIBRARY, isPropertyEnabled, libraryDefaults } from '../../../state/nodeLibrary'
import { FIELD_NOISE_TYPES, fieldNoiseType, sharedNoiseType } from '../../generative/noiseTypes'
import { golStep } from '../../simulations/evaluate'
import { stepLife } from '../../../state/evaluator/automaton'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition.label, nodeType, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
let edgeCount = 0
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `e${++edgeCount}`, source, sourceHandle, target, targetHandle }) as StudioEdge
const fieldOf = (n: StudioNode, tick: number, W = 12, H = 8) =>
  evaluateGraphFull([n], [], tick, W, H, {}, true, true).outputs.get(n.id)!.field as Float32Array
const cppOf = (n: StudioNode) => generateCpp(
  [n, node('p', 'FieldToFrame'), node('out', 'MatrixOutput', { width: 8, height: 8 })],
  [edge(n.id, 'field', 'p', 'field'), edge('p', 'frame', 'out', 'frame')],
)

beforeEach(() => resetEvaluatorState())

describe('Field Noise type', () => {
  it('defaults to the inoise8 fBm every save drew', () => {
    expect(libraryDefaults('FieldNoise').noiseType).toBe('fbm')
    expect(fieldNoiseType(undefined)).toBe('fbm')
    expect(fieldNoiseType('worley"; evil()')).toBe('fbm')
    const plain = fieldOf(node('n', 'FieldNoise'), 90)
    resetEvaluatorState()
    const saved = fieldOf(node('n', 'FieldNoise', { noiseType: 'nonsense' }), 90)
    expect(Array.from(saved)).toEqual(Array.from(plain))
    expect(cppOf(node('n', 'FieldNoise'))).toContain('Field noise (fBm via inoise8)')
  })

  it('offers every Noise algorithm, and a type of its own for the simplex fBm', () => {
    expect(FIELD_NOISE_TYPES).toEqual(['fbm', 'simplex', 'noise4d', 'worley', 'plasma', 'gabor'])
    expect(sharedNoiseType('fbm')).toBeNull()
    expect(sharedNoiseType('simplex')).toBe('fbm')
    const options = NODE_LIBRARY.find((entry) => entry.type === 'FieldNoise')
    expect(options).toBeDefined()
  })

  for (const type of FIELD_NOISE_TYPES.filter((entry) => entry !== 'fbm')) {
    const shared = sharedNoiseType(type)!
    const props = { speed: 0.4, scale: 0.35, seed: 5, octaves: 3, orientation: 30, frequency: 1.5 }

    it(`${type} draws the Noise node's field`, () => {
      for (const wrapX of [false, true]) {
        for (const tick of [0, 75, 600]) {
          resetEvaluatorState()
          const twin = fieldOf(node('n', 'FieldNoise', { ...props, noiseType: type, wrapX }), tick)
          resetEvaluatorState()
          const pattern = fieldOf(node('n', 'Noise', { ...props, noiseType: shared, wrapX }), tick)
          expect(Array.from(twin), `${type} wrapX=${wrapX} tick=${tick}`).toEqual(Array.from(pattern))
        }
      }
    })

    it(`${type} writes the Noise node's C++ block`, () => {
      const block = (source: string) => {
        const lines = source.split('\n')
        const start = lines.findIndex((line) => /^\s*\{ \/\/ (Noise4D|Worley noise|Plasma fractal|Fractal noise|Gabor noise)/.test(line))
        expect(start, `${type} block`).toBeGreaterThanOrEqual(0)
        const end = lines.findIndex((line, i) => i > start && /;\}\}\s*$/.test(line))
        return lines.slice(start, end + 1).join('\n')
      }
      const twin = block(cppOf(node('n', 'FieldNoise', { ...props, noiseType: type })))
      const pattern = block(generateCpp(
        [node('n', 'Noise', { ...props, noiseType: shared }), node('out', 'MatrixOutput', { width: 8, height: 8 })],
        [edge('n', 'frame', 'out', 'frame')],
      ))
      expect(twin).toBe(pattern)
    })
  }

  it('scales speed and scale by the chosen type, not the fBm range', () => {
    const slow = fieldOf(node('n', 'FieldNoise', { noiseType: 'worley', speed: 0.5, scale: 1 }), 0)
    resetEvaluatorState()
    const noise = fieldOf(node('n', 'Noise', { noiseType: 'worley', speed: 0.5, scale: 1 }), 0)
    expect(Array.from(slow)).toEqual(Array.from(noise))
  })

  it('applies Contrast and leaves it out at rest', () => {
    const plain = fieldOf(node('n', 'FieldNoise', { noiseType: 'simplex' }), 30)
    resetEvaluatorState()
    const hard = fieldOf(node('n', 'FieldNoise', { noiseType: 'simplex', contrast: 3 }), 30)
    const spread = (field: Float32Array) => Math.max(...field) - Math.min(...field)
    expect(spread(hard)).toBeGreaterThan(spread(plain))
    expect(cppOf(node('n', 'FieldNoise'))).not.toContain('-0.5f)*')
    expect(cppOf(node('n', 'FieldNoise', { contrast: 2 }))).toContain('-0.5f)*2.000f')
  })

  it('shows only the knobs of the chosen type', () => {
    const enabled = (key: string, noiseType: string) => isPropertyEnabled('FieldNoise', key, { noiseType })
    expect(enabled('worleyMode', 'worley')).toBe(true)
    expect(enabled('worleyMode', 'fbm')).toBe(false)
    expect(enabled('octaves', 'simplex')).toBe(true)
    expect(enabled('octaves', 'gabor')).toBe(false)
    expect(enabled('frequency', 'gabor')).toBe(true)
    expect(enabled('orientation', 'worley')).toBe(false)
  })

  it('never interpolates a saved type into the sketch', () => {
    const cpp = cppOf(node('n', 'FieldNoise', { noiseType: 'gabor"); system("x"); //', worleyMode: 'f1"); evil(); //' }))
    expect(cpp).not.toContain('system(')
    expect(cpp).not.toContain('evil(')
    expect(cpp).toContain('Field noise (fBm via inoise8)')
  })
})

describe('Automaton life', () => {
  it('is a select option and steps Conway on a torus', () => {
    const W = 5, H = 5
    const cells = new Uint8Array(W * H)
    for (const x of [1, 2, 3]) cells[2 * W + x] = 1
    const next = new Uint8Array(W * H), prev = new Uint8Array(W * H)
    stepLife(cells, next, prev, W, H)
    // A horizontal blinker turns vertical.
    expect(Array.from(next).map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([W + 2, 2 * W + 2, 3 * W + 2])
    expect(golStep).toBe(stepLife)
  })

  it('runs as a 0 or 1 field that keeps itself alive', () => {
    const life = node('a', 'Automaton', { automatonType: 'life', speed: 60, seed: 3 })
    const seen = new Set<number>()
    let alive = 0
    for (let tick = 0; tick < 240; tick++) {
      const field = evaluateGraphFull([life], [], tick, 12, 8, {}, true, true).outputs.get('a')!.field as Float32Array
      field.forEach((v) => seen.add(v))
      if (tick > 3 && field.some((v) => v === 1)) alive++
    }
    expect([...seen].sort()).toEqual([0, 1])
    // A board that dies or freezes reseeds, so it is never empty for long.
    expect(alive).toBeGreaterThan(200)
  })

  it('emits the Game of Life pattern\'s generation, and only for life', () => {
    const life = cppOf(node('a', 'Automaton', { automatonType: 'life' }))
    const pattern = generateCpp(
      [node('g', 'GameOfLife'), node('out', 'MatrixOutput', { width: 8, height: 8 })],
      [edge('g', 'frame', 'out', 'frame')],
    )
    const rule = '?((_n==2||_n==3)?1:0):(_n==3?1:0); _pop+='
    expect(life).toContain(rule)
    expect(pattern).toContain(rule)
    expect(life).toContain('random8()<77?1:0')
    expect(life).toMatch(/_am_a\w*s>3\)\{ _fill\(\); \}/)
    expect(cppOf(node('a', 'Automaton', { automatonType: 'cyclic' }))).not.toContain('_pop')
    expect(cppOf(node('a', 'Automaton'))).not.toContain('_pop')
  })
})

describe('Gradient Field scroll', () => {
  it('holds still and clamps by default, as before', () => {
    expect(libraryDefaults('GradientField').speed).toBe(0)
    const a = fieldOf(node('g', 'GradientField'), 0)
    resetEvaluatorState()
    const b = fieldOf(node('g', 'GradientField'), 600)
    expect(Array.from(b)).toEqual(Array.from(a))
    expect(a[0]).toBeCloseTo(0, 6)
    expect(a[11]).toBeCloseTo(1, 6)
    const cpp = cppOf(node('g', 'GradientField'))
    expect(cpp).not.toContain('_gsc')
    expect(cpp).toContain('constrain(_v,0.0f,1.0f)')
  })

  it('scrolls on its own clock and wraps', () => {
    const still = fieldOf(node('g', 'GradientField', { angle: 0 }), 0)
    resetEvaluatorState()
    const moved = fieldOf(node('g', 'GradientField', { speed: 0.5 }), 60)
    expect(Array.from(moved)).not.toEqual(Array.from(still))
    for (const v of moved) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
    const cpp = cppOf(node('g', 'GradientField', { speed: 0.5 }))
    expect(cpp).toContain('_gsc')
    expect(cpp).toContain('fmodf(_v,1.0f)')
  })

  it('scrolls when a signal drives Scroll', () => {
    const cpp = generateCpp(
      [node('s', 'Wave'), node('g', 'GradientField'), node('p', 'FieldToFrame'), node('out', 'MatrixOutput', { width: 8, height: 8 })],
      [edge('s', 'result', 'g', 'speed'), edge('g', 'field', 'p', 'field'), edge('p', 'frame', 'out', 'frame')],
    )
    expect(cpp).toContain('_gsc')
  })
})
