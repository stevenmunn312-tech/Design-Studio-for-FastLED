import { describe, expect, it } from 'vitest'
import { fuseBlockAllocations, fuseBlockSummary } from '../powerDistribution'

describe('fuseBlockAllocations', () => {
  it('uses the smallest fixed block that fits a normal PSU zone', () => {
    expect(fuseBlockAllocations(1)).toEqual([{ circuitCount: 2, assignedFeedCount: 1, firstFeedIndex: 0 }])
    expect(fuseBlockAllocations(3)).toEqual([{ circuitCount: 4, assignedFeedCount: 3, firstFeedIndex: 0 }])
    expect(fuseBlockAllocations(6)).toEqual([{ circuitCount: 6, assignedFeedCount: 6, firstFeedIndex: 0 }])
  })

  it('adds another fixed block when a PSU zone exceeds twelve feeds', () => {
    expect(fuseBlockAllocations(13)).toEqual([
      { circuitCount: 12, assignedFeedCount: 12, firstFeedIndex: 0 },
      { circuitCount: 2, assignedFeedCount: 1, firstFeedIndex: 12 },
    ])
    expect(fuseBlockSummary(20)).toBe('12-circuit + 8-circuit')
  })

  it('does not invent hardware for an empty zone', () => {
    expect(fuseBlockAllocations(0)).toEqual([])
  })
})
