import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NODE_LIBRARY, CATEGORIES } from '../nodeLibrary'

// The README advertises a module count in three separate places and lists
// every module by category. That list drifted silently twice — it sat at 151
// while the library had grown to 153 (Formula Points and Formula Field were
// both missing), and the stale figure had been copied into CLAUDE.md and
// todo.md as well. Nothing connected the prose to the library, so adding a
// node never surfaced the docs as needing an edit. These tests are that link:
// add a node, and they fail until the README names it.

const README = readFileSync(resolve(__dirname, '../../../README.md'), 'utf8')

/** README heading → NODE_LIBRARY category id. */
const README_HEADINGS: Record<string, string> = {
  Inputs: 'input',
  Audio: 'audio',
  Signals: 'signal',
  'Math & Logic': 'math',
  Color: 'color',
  Patterns: 'pattern',
  Fields: 'field',
  Effects: 'composite',
  Show: 'show',
  Output: 'output',
  Notes: 'note',
}

function readmeModules(heading: string): string[] {
  const match = README.match(new RegExp(`^- \\*\\*${heading}:\\*\\* (.+)$`, 'm'))
  if (!match) throw new Error(`README has no "${heading}:" module line`)
  return match[1].split(',').map((entry) => entry.trim())
}

describe('README module list', () => {
  it('covers every category in NODE_LIBRARY', () => {
    expect(Object.values(README_HEADINGS).sort()).toEqual(CATEGORIES.map((c) => c.id).sort())
  })

  it.each(Object.entries(README_HEADINGS))('lists exactly the %s modules', (heading, categoryId) => {
    const listed = readmeModules(heading)
    const actual = NODE_LIBRARY.filter((node) => node.category === categoryId).map((node) => node.label)
    // Compare as sets: the README orders for reading, not declaration order.
    expect([...listed].sort()).toEqual([...actual].sort())
  })

  it('states the current module count everywhere it is advertised', () => {
    const total = NODE_LIBRARY.length
    expect(README).toContain(`**Public beta · ${total} modules`)
    expect(README).toContain(`Choose from ${total} modules`)
    expect(README).toContain(`Show all ${total} modules by category`)
  })
})
