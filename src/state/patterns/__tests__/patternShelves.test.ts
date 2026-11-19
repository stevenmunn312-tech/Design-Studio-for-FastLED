import { describe, it, expect, beforeEach } from 'vitest'
import { BUILT_IN_PATTERN_CATEGORIES, usePatternLibrary, withRecoveredShelves } from '../patternLibrary'
import type { SavedPattern } from '../patternLibrary'
import type { StudioEdge } from '../../graphStore'

// A pattern file records only the id of the shelf it sits on; the shelf list
// itself lives in this browser's localStorage. A pattern that arrives from the
// Patterns folder, an import or another browser names a shelf this one has
// never heard of, and the sidebar listed it under no shelf at all.
function pattern(id: string, categoryId?: string): SavedPattern {
  return {
    id, name: id, createdAt: 1, categoryId,
    inputs: [], outputs: [],
    subgraph: { nodes: [], edges: [] as StudioEdge[] },
  }
}

/** Every pattern the sidebar would list: unsorted, plus each shelf's own. */
function listed(patterns: SavedPattern[], categories: { id: string }[]): string[] {
  const shelves = new Set(categories.map((category) => category.id))
  return patterns.filter((entry) => !entry.categoryId || shelves.has(entry.categoryId)).map((entry) => entry.id)
}

describe('custom shelves', () => {
  beforeEach(() => {
    localStorage.clear()
    usePatternLibrary.setState({ patterns: [], categories: [...BUILT_IN_PATTERN_CATEGORIES] })
  })

  it('a pattern arriving on an unknown shelf is still listed under a shelf', () => {
    usePatternLibrary.getState().putPattern(pattern('p1', 'category-from-elsewhere'))
    const { patterns, categories } = usePatternLibrary.getState()
    expect(listed(patterns, categories)).toContain('p1')
    expect(categories.some((category) => category.id === 'category-from-elsewhere')).toBe(true)
    // ...and the recovered shelf is kept across a reload.
    const saved = JSON.parse(localStorage.getItem('design-studio-for-fastled.pattern-library-categories.v1')!)
    expect(saved.map((category: { id: string }) => category.id)).toContain('category-from-elsewhere')
  })

  it('recovers each missing shelf once, with distinct names, and leaves known shelves alone', () => {
    const categories = [...BUILT_IN_PATTERN_CATEGORIES, { id: 'mine', name: 'Mine' }]
    const next = withRecoveredShelves(categories, [pattern('a', 'gone-1'), pattern('b', 'gone-1'), pattern('c', 'gone-2'), pattern('d', 'mine')])
    expect(next.map((category) => category.id)).toEqual([...categories.map((category) => category.id), 'gone-1', 'gone-2'])
    expect(new Set(next.map((category) => category.name.toLowerCase())).size).toBe(next.length)
    expect(withRecoveredShelves(next, [pattern('a', 'gone-1')])).toBe(next)
  })

  it('a deleted shelf still sends its patterns to unsorted rather than recreating it', () => {
    const lib = usePatternLibrary.getState()
    const id = lib.createCategory('Temp')!
    lib.putPattern(pattern('p2', id))
    usePatternLibrary.getState().deleteCategory(id)
    const { patterns, categories } = usePatternLibrary.getState()
    expect(patterns.find((entry) => entry.id === 'p2')?.categoryId).toBeUndefined()
    expect(categories.some((category) => category.id === id)).toBe(false)
  })
})
