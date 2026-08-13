import { describe, expect, it } from 'vitest'
import { fuseBlockAllocations } from '../../../build/powerDistribution'
import {
  feedCombLaneY,
  feedIndexForFuseSlot,
  FUSE_BLOCK_CELL_HEIGHT,
  fuseColumnSplit,
  fuseSlotForFeed,
  groundCombLaneY,
  POWER_BRANCH_ROW_SPACING,
  powerDistributionSectionLayout,
} from '../physicalDiagramLayout'

const FEED_COUNTS = [1, 2, 3, 4, 5, 6, 7, 10, 12, 13, 24, 26]

describe('powerDistributionSectionLayout', () => {
  it('keeps every feed row below the whole block stack so branches only run downward', () => {
    for (const feedCount of FEED_COUNTS) {
      const layout = powerDistributionSectionLayout(feedCount)
      const firstRowY = layout.branchStartY + 38
      expect(layout.blockTops).toHaveLength(layout.blockCount)
      expect(layout.blocksBottom, `${feedCount} feeds`).toBeGreaterThan(layout.fuseBlockY)
      expect(firstRowY, `${feedCount} feeds`).toBeGreaterThan(layout.blocksBottom)
      expect(firstRowY, `${feedCount} feeds`).toBeGreaterThan(layout.psuY + 220)
      const lastRowY = firstRowY + ((feedCount - 1) * POWER_BRANCH_ROW_SPACING)
      expect(layout.sectionHeight, `${feedCount} feeds`).toBeGreaterThan(lastRowY)
    }
  })

  it('reserves a ground comb above each block and a feed comb below the stack', () => {
    const layout = powerDistributionSectionLayout(6)
    const [blockTop] = layout.blockTops
    // Deepest feed hugs the block, shallowest sits at the top of the comb, and
    // the whole comb clears the section heading.
    expect(groundCombLaneY(blockTop, 5, 6)).toBeGreaterThan(groundCombLaneY(blockTop, 0, 6))
    expect(groundCombLaneY(blockTop, 5, 6)).toBeLessThan(blockTop)
    expect(groundCombLaneY(blockTop, 0, 6)).toBeGreaterThan(64)
    expect(layout.feedCombY).toBeGreaterThan(blockTop + FUSE_BLOCK_CELL_HEIGHT)
    expect(feedCombLaneY(layout.feedCombY, 2)).toBeGreaterThan(feedCombLaneY(layout.feedCombY, 0))
    expect(feedCombLaneY(layout.feedCombY, 2)).toBeLessThan(layout.branchStartY + 38)
  })

  it('grows the header rather than the width when a zone needs several blocks', () => {
    const single = powerDistributionSectionLayout(6)
    const many = powerDistributionSectionLayout(26)
    expect(many.blockCount).toBeGreaterThan(single.blockCount)
    expect(many.blockTops.every((top, index) => index === 0 || top > many.blockTops[index - 1])).toBe(true)
    expect(many.branchStartY).toBeGreaterThan(single.branchStartY)
  })
})

describe('fuse slot assignment', () => {
  it('fills the right column with the shallowest feeds, top to bottom in both columns', () => {
    // 6 feeds: right column takes rows 1-3 (slots 1/3/5), left column the rest.
    expect([0, 1, 2, 3, 4, 5].map((index) => fuseSlotForFeed(index, 6).slot)).toEqual([1, 3, 5, 0, 2, 4])
    expect([0, 1, 2, 3, 4, 5].map((index) => fuseSlotForFeed(index, 6).isRightColumn))
      .toEqual([true, true, true, false, false, false])
    // An odd feed count leaves the spare circuit in the left column.
    expect([0, 1, 2].map((index) => fuseSlotForFeed(index, 3).slot)).toEqual([1, 3, 0])
  })

  it('round-trips every feed through its circuit and reports spares', () => {
    for (const feedCount of FEED_COUNTS) {
      for (const block of fuseBlockAllocations(feedCount)) {
        const { assignedFeedCount, circuitCount } = block
        const slots = Array.from({ length: assignedFeedCount }, (_, index) => fuseSlotForFeed(index, assignedFeedCount).slot)
        expect(new Set(slots).size, `${feedCount} feeds`).toBe(assignedFeedCount)
        expect(Math.max(...slots)).toBeLessThan(circuitCount)
        for (const [localIndex, slot] of slots.entries()) {
          expect(feedIndexForFuseSlot(slot, assignedFeedCount)).toBe(localIndex)
        }
        const spares = Array.from({ length: circuitCount }, (_, slot) => feedIndexForFuseSlot(slot, assignedFeedCount))
          .filter((localIndex) => localIndex < 0)
        expect(spares).toHaveLength(circuitCount - assignedFeedCount)
      }
    }
  })

  it('splits a block into two near-equal columns', () => {
    expect(fuseColumnSplit(6)).toEqual({ rightCount: 3, leftCount: 3 })
    expect(fuseColumnSplit(3)).toEqual({ rightCount: 2, leftCount: 1 })
    expect(fuseColumnSplit(1)).toEqual({ rightCount: 1, leftCount: 0 })
  })
})
