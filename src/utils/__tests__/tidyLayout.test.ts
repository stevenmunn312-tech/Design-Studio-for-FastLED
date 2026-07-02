import { describe, it, expect } from 'vitest'
import { tidyLayout, type TidyItem } from '../tidyLayout'

const box = (id: string, x: number, y: number, width = 200, height = 100): TidyItem =>
  ({ id, x, y, width, height })

describe('tidyLayout', () => {
  it('lays a chain out in left-to-right columns with even gaps', () => {
    const result = tidyLayout(
      [box('a', 0, 0), box('b', 500, 300), box('c', 50, 600)],
      [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
    )
    // Columns: width 200 + gap 80 = 280 apart, anchored at a's x.
    expect(result.get('a')).toEqual({ x: 0, y: 0 })
    expect(result.get('b')).toEqual({ x: 280, y: 0 })
    expect(result.get('c')).toEqual({ x: 560, y: 0 })
  })

  it('anchors the layout to the scope’s current top-left corner', () => {
    const result = tidyLayout(
      [box('a', 100, 200), box('b', 700, 500)],
      [{ source: 'a', target: 'b' }],
    )
    expect(result.get('a')).toEqual({ x: 100, y: 200 })
    expect(result.get('b')).toEqual({ x: 380, y: 200 })
  })

  it('stacks fan-in sources without overlap and centres the target between them', () => {
    const result = tidyLayout(
      [box('s1', 0, 0), box('s2', 0, 300), box('t', 100, 150)],
      [{ source: 's1', target: 't' }, { source: 's2', target: 't' }],
    )
    const s1 = result.get('s1')!
    const s2 = result.get('s2')!
    const t = result.get('t')!
    // Same column, stacked with at least the row gap between them.
    expect(s1.x).toBe(s2.x)
    expect(s2.y - (s1.y + 100)).toBeGreaterThanOrEqual(40 - 20) // gapY, minus grid-snap slack
    // Target sits in the next column, vertically between its two feeds.
    expect(t.x).toBe(s1.x + 280)
    expect(t.y + 50).toBeGreaterThan(s1.y + 50)
    expect(t.y + 50).toBeLessThan(s2.y + 50)
  })

  it('pulls a source up against its consumer instead of leaving it in column 0', () => {
    const result = tidyLayout(
      [box('a', 0, 0), box('b', 300, 0), box('c', 600, 0), box('s', 0, 300)],
      [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
        { source: 's', target: 'c' }, // s feeds column 2 → belongs in column 1
      ],
    )
    expect(result.get('s')!.x).toBe(result.get('b')!.x)
  })

  it('leaves isolated nodes that are clear of the graph untouched', () => {
    const result = tidyLayout(
      [box('a', 0, 0), box('b', 300, 0), box('lone', 900, 900)],
      [{ source: 'a', target: 'b' }],
    )
    expect(result.has('lone')).toBe(false)
    expect(result.size).toBe(2)
  })

  it('parks isolated nodes that obscure the graph in a row beneath it', () => {
    const result = tidyLayout(
      [
        box('a', 0, 0),
        box('b', 300, 0),
        box('stray1', 250, 20),  // sits right on top of the tidied chain
        box('stray2', 100, 40),
      ],
      [{ source: 'a', target: 'b' }],
    )
    const a = result.get('a')!
    const b = result.get('b')!
    const s1 = result.get('stray1')!
    const s2 = result.get('stray2')!
    const graphBottom = Math.max(a.y, b.y) + 100
    // Both strays end up below the graph, side by side, no overlap.
    expect(s1.y).toBeGreaterThanOrEqual(graphBottom + 40)
    expect(s2.y).toBe(s1.y)
    // Sorted by original x: stray2 (x 100) parks left of stray1 (x 250).
    expect(s1.x - s2.x).toBeGreaterThanOrEqual(200)
  })

  it('does not re-park an already-parked stray on the next tidy', () => {
    const items = [box('a', 0, 0), box('b', 300, 0), box('stray', 150, 30)]
    const edges = [{ source: 'a', target: 'b' }]
    const first = tidyLayout(items, edges)
    expect(first.has('stray')).toBe(true)
    const moved = items.map((i) => ({ ...i, ...first.get(i.id)! }))
    const second = tidyLayout(moved, edges)
    expect(second.has('stray')).toBe(false)
  })

  it('survives cycles without hanging and places both nodes', () => {
    const result = tidyLayout(
      [box('a', 0, 0), box('b', 300, 0)],
      [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
    )
    expect(result.size).toBe(2)
    expect(result.get('a')!.x).not.toBe(result.get('b')!.x)
  })

  it('snaps every position to the canvas grid', () => {
    const result = tidyLayout(
      [box('a', 13, 7, 190, 95), box('b', 333, 217, 210, 130), box('c', 641, 99)],
      [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
    )
    for (const { x, y } of result.values()) {
      expect(x % 20).toBe(0)
      expect(y % 20).toBe(0)
    }
  })

  it('is idempotent — tidying an already-tidy layout is a no-op', () => {
    // Fan-out plus a chain: the shapes that drift when column stacking only
    // pushes downward.
    const items = [
      box('s', 0, 0, 200, 100),
      box('a', 100, 300, 200, 450),  // tall node, like MatrixOutput
      box('b', 90, 700, 200, 300),
      box('c', 500, 100, 200, 120),
    ]
    const edges = [
      { source: 's', target: 'a' },
      { source: 's', target: 'b' },
      { source: 'b', target: 'c' },
    ]
    const first = tidyLayout(items, edges)
    const moved = items.map((i) => ({ ...i, ...first.get(i.id)! }))
    const second = tidyLayout(moved, edges)
    for (const m of moved) {
      expect(second.get(m.id)).toEqual({ x: m.x, y: m.y })
    }
  })

  it('ignores self-edges and edges leaving the scope', () => {
    const result = tidyLayout(
      [box('a', 0, 0), box('b', 300, 0)],
      [
        { source: 'a', target: 'a' },        // self-edge
        { source: 'a', target: 'b' },
        { source: 'b', target: 'external' }, // endpoint outside scope
      ],
    )
    expect(result.size).toBe(2)
    expect(result.get('b')!.x).toBeGreaterThan(result.get('a')!.x)
  })
})
