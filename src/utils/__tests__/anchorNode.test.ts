import { describe, it, expect } from 'vitest'
import { anchorPosition } from '../anchorNode'

describe('anchorPosition', () => {
  it('places the node so the handle centre lands on the drop point', () => {
    // A left input handle measured 220px down the node, 12px box straddling the
    // left edge (x from -6 to +6, centre at x=0).
    const handle = { x: -6, y: 214, width: 12, height: 12 }
    const pos = anchorPosition({ x: 500, y: 300 }, handle)
    // Handle centre offset = (0, 220); node top-left = drop − offset.
    expect(pos).toEqual({ x: 500, y: 80 })
  })

  it('offsets by the handle centre, not its top-left', () => {
    const handle = { x: 0, y: 0, width: 12, height: 12 }
    const pos = anchorPosition({ x: 100, y: 100 }, handle)
    expect(pos).toEqual({ x: 94, y: 94 })
  })
})
