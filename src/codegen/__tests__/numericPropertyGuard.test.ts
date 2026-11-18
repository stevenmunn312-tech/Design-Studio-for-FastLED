import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults, propertyMeta, resolveNodeNumericProperties } from '../../state/nodeLibrary'
import { evaluateGraphFull } from '../../state/graphEvaluator'
import type { Frame } from '../../state/palettes/ledColor'
import { generateCpp } from '../cppGenerator'

const node = (id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode => {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    nodeType, label: definition.label, category: definition.category,
    properties: { ...libraryDefaults(nodeType), ...properties }, inputs: definition.inputs, outputs: definition.outputs,
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

// What an old or hand-edited save can leave in a numeric property.
const CORRUPT = ['abc', '', null, { value: 3 }, [1, 2], Number.NaN, Number.POSITIVE_INFINITY]

/** Every numeric library default of `nodeType` replaced by `value`. */
function corrupted(nodeType: string, value: unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(libraryDefaults(nodeType))
    .map(([key, def]) => [key, typeof def === 'number' ? value : def]))
}

describe('numeric property guard', () => {
  it('resolves every numeric property of every node to a finite number', () => {
    for (const definition of NODE_LIBRARY) {
      for (const value of CORRUPT) {
        const resolved = resolveNodeNumericProperties(definition.type, corrupted(definition.type, value), 16, 16)
        for (const [key, def] of Object.entries(libraryDefaults(definition.type))) {
          if (typeof def === 'number') expect(resolved[key], `${definition.type}.${key}`).toBe(def)
        }
      }
    }
  })

  it('keeps numeric strings and leaves the stored properties untouched', () => {
    const stored = { count: '12', reactivity: 'abc' }
    expect(resolveNodeNumericProperties('KickShock', stored, 16, 16)).toMatchObject({ count: 12, reactivity: 0.7 })
    expect(stored).toEqual({ count: '12', reactivity: 'abc' })
  })

  // The nodes whose array sizes crashed the preview or emitted
  // `const int _PN=NaN;`; FFTAnalyzer rides along wired into Particles.
  it.each([
    ['KickShock', {}],
    ['PercussionBlobs', {}],
    ['RainRipples', {}],
    ['SpectrumVisualizer', {}],
    ['Particles', { particleType: 'fireflies' }],
  ] as const)('%s previews and compiles from a corrupt save the same as from its defaults', (nodeType, extra) => {
    for (const value of CORRUPT) {
      const nodes = [
        node('fx', nodeType, { ...corrupted(nodeType, value), ...extra }),
        node('fft', 'FFTAnalyzer', corrupted('FFTAnalyzer', value)),
        node('out', 'MatrixOutput', { width: 8, height: 8 }),
      ]
      const edges = [edge('fx', 'frame', 'out', 'frame')]
      if (nodeType === 'Particles') edges.push(edge('fft', 'bass', 'fx', 'rate'))
      const clean = [
        node('fx', nodeType, extra),
        node('fft', 'FFTAnalyzer'),
        node('out', 'MatrixOutput', { width: 8, height: 8 }),
      ]

      const frame = evaluateGraphFull(nodes, edges, 30, 8, 8).outputs.get('fx')?.frame as Frame | undefined
      expect(frame?.flat().every(({ r, g, b }) => [r, g, b].every(Number.isFinite)), `${nodeType} preview`).toBe(true)

      const sketch = generateCpp(nodes, edges)
      expect(sketch).not.toMatch(/\bNaN\b|\bInfinity\b/)
      expect(sketch).toBe(generateCpp(clean, edges))
    }
  })
})

// A select holds an option id, but a shared or hand-edited save can hold any
// text there, and these nodes sit outside the trust prompt.
describe('select property guard', () => {
  const HOSTILE = ['*/ INJECTED(); /*', 'x\nINJECTED();', '"; INJECTED(); //', 'a\\']

  /** Every select property of `nodeType` replaced by `value`. */
  function hostile(nodeType: string, value: string): Record<string, unknown> {
    return Object.fromEntries(Object.keys(libraryDefaults(nodeType))
      .filter((key) => propertyMeta(nodeType, key)?.control === 'select')
      .map((key) => [key, value]))
  }

  it('resolves text that is not an option id to an option, a number or nothing', () => {
    for (const definition of NODE_LIBRARY) {
      for (const value of HOSTILE) {
        const resolved = resolveNodeNumericProperties(definition.type, hostile(definition.type, value), 16, 16)
        for (const key of Object.keys(hostile(definition.type, value))) {
          const meta = propertyMeta(definition.type, key)
          if (meta?.control !== 'select') continue
          // A numeric select falls back to its default number, as any number does.
          expect(['', ...meta.options.map(String), String(libraryDefaults(definition.type)[key])], `${definition.type}.${key}`)
            .toContain(String(resolved[key]))
          expect(resolved[key], `${definition.type}.${key}`).not.toBe(value)
        }
      }
    }
  })

  it('keeps an id that is no longer an option, for the node to read as it always has', () => {
    expect(resolveNodeNumericProperties('FieldMath', { fieldOp: 'average' }, 16, 16).fieldOp).toBe('average')
  })

  it('never carries that text into a sketch', () => {
    for (const definition of NODE_LIBRARY) {
      const port = definition.outputs.find((output) => output.id === 'frame' || output.id === 'field')
      if (!port || definition.type === 'MatrixOutput') continue
      for (const value of HOSTILE.slice(0, 2)) {
        const nodes = [node('fx', definition.type, hostile(definition.type, value)), node('out', 'MatrixOutput', { width: 8, height: 8 })]
        const edges = port.id === 'frame'
          ? [edge('fx', 'frame', 'out', 'frame')]
          : [edge('fx', 'field', 'view', 'field'), edge('view', 'frame', 'out', 'frame')]
        if (port.id === 'field') nodes.push(node('view', 'FieldToFrame'))
        expect(generateCpp(nodes, edges), definition.type).not.toContain('INJECTED')
      }
    }
  })
})
