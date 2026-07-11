import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadSnapshots, pushSnapshot, clearSnapshots, MAX_SNAPSHOTS } from '../snapshotHistory'
import type { StudioNode } from '../graphStore'

function node(id: string): StudioNode {
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: 'SolidColor', nodeType: 'SolidColor', category: 'pattern', properties: {} },
  } as unknown as StudioNode
}

describe('snapshotHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty', () => {
    expect(loadSnapshots()).toEqual([])
  })

  it('pushes a snapshot and persists it', () => {
    const result = pushSnapshot({ nodes: [node('a')], edges: [] })
    expect(result).toHaveLength(1)
    expect(result[0].nodeCount).toBe(1)
    expect(loadSnapshots()).toHaveLength(1)
  })

  it('prepends newest first', () => {
    pushSnapshot({ nodes: [node('a')], edges: [] })
    pushSnapshot({ nodes: [node('a'), node('b')], edges: [] })
    const snaps = loadSnapshots()
    expect(snaps).toHaveLength(2)
    expect(snaps[0].nodeCount).toBe(2)
    expect(snaps[1].nodeCount).toBe(1)
  })

  it('caps at MAX_SNAPSHOTS, dropping the oldest', () => {
    for (let i = 0; i < MAX_SNAPSHOTS + 3; i++) {
      pushSnapshot({ nodes: Array.from({ length: i + 1 }, (_, k) => node(`n${k}`)), edges: [] })
    }
    const snaps = loadSnapshots()
    expect(snaps).toHaveLength(MAX_SNAPSHOTS)
    // newest push had the most nodes
    expect(snaps[0].nodeCount).toBe(MAX_SNAPSHOTS + 3)
  })

  it('each snapshot gets a unique id', () => {
    pushSnapshot({ nodes: [node('a')], edges: [] })
    pushSnapshot({ nodes: [node('a')], edges: [] })
    const [first, second] = loadSnapshots()
    expect(first.id).not.toBe(second.id)
  })

  it('clearSnapshots empties the store', () => {
    pushSnapshot({ nodes: [node('a')], edges: [] })
    clearSnapshots()
    expect(loadSnapshots()).toEqual([])
  })

  it('degrades gracefully when a snapshot is too large to fit', () => {
    const bigLabel = 'x'.repeat(1024)
    pushSnapshot({ nodes: [node('a')], edges: [] })
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
      // Simulate quota exceeded once the list carries both snapshots, but
      // allow a single (trimmed) snapshot through.
      if (value.length > 1500) throw new DOMException('quota', 'QuotaExceededError')
      localStorage.getItem(key) // no-op read to keep the spy from being flagged unused
    })
    try {
      const result = pushSnapshot({ nodes: [{ ...node('b'), data: { ...node('b').data, label: bigLabel } } as StudioNode], edges: [] })
      // Should have retried with a smaller list rather than throwing.
      expect(spy.mock.calls.length).toBeGreaterThan(1)
      expect(result.length).toBeLessThanOrEqual(2)
    } finally {
      spy.mockRestore()
    }
  })
})
