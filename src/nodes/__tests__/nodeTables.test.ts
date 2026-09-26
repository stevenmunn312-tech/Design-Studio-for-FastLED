/*
 * Each node's preview lives in src/nodes/<category>/evaluate.ts, beside the
 * same category's firmware. The dispatcher merges every table into one map, so
 * a type listed twice would silently lose one implementation, and a type filed
 * under the wrong category would sit away from its other half. Both are held
 * here, derived from the library rather than listed.
 */
import { describe, expect, it } from 'vitest'
import { NODE_EVALUATOR_TABLES } from '../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../state/nodeLibrary'

/** The directory a library category (and pattern subcategory) is filed under. */
const CATEGORY_DIR: Record<string, string> = {
  'input': 'input',
  'show': 'show',
  'audio': 'audio',
  'pattern/Shapes & Text': 'shapes',
  'pattern/Generative': 'generative',
  'pattern/Simulations': 'simulations',
  'pattern/Audio-Reactive': 'audioReactive',
  'pattern/Code': 'code',
  'composite': 'composite',
  'color/Palettes': 'color',
  'color/Colors': 'color',
  'math': 'math',
  'signal': 'signal',
  'field': 'field',
  'output': 'output',
  'note': 'graph',
}

function directoryOf(type: string): string {
  const definition = NODE_LIBRARY.find((entry) => entry.type === type)
  // Group plumbing is not in the library: it is the graph's own structure.
  if (!definition) return 'graph'
  const key = definition.subcategory ? `${definition.category}/${definition.subcategory}` : definition.category
  return CATEGORY_DIR[key] ?? `unmapped category ${key}`
}

describe('node evaluator tables', () => {
  const entries = Object.entries(NODE_EVALUATOR_TABLES)
    .flatMap(([directory, table]) => Object.keys(table).map((type) => ({ directory, type })))

  it('lists every type in exactly one table', () => {
    const count = new Map<string, number>()
    for (const { type } of entries) count.set(type, (count.get(type) ?? 0) + 1)
    expect([...count].filter(([, n]) => n > 1)).toEqual([])
    expect(entries.length).toBeGreaterThan(170)
  })

  it('files every type under its library category', () => {
    const misfiled = entries
      .filter(({ directory, type }) => directoryOf(type) !== directory)
      .map(({ directory, type }) => `${type} is in ${directory}, belongs in ${directoryOf(type)}`)
    expect(misfiled).toEqual([])
  })
})
