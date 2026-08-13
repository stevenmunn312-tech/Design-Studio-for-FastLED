import { describe, expect, it } from 'vitest'
import { fuseBlockAllocations } from '../../../build/powerDistribution'
import {
  feedCombLaneY,
  feedIndexForFuseSlot,
  FUSE_BLOCK_CELL_HEIGHT,
  FUSE_BLOCK_START_X,
  fuseBlockPoints,
  fuseColumnSplit,
  fuseSlotForFeed,
  groundCombLaneY,
  POWER_BRANCH_ROW_SPACING,
  powerDistributionSectionLayout,
  PSU_POSITIVE_TERMINAL_OFFSET,
} from '../physicalDiagramLayout'

const FEED_COUNTS = [1, 2, 3, 4, 5, 6, 7, 10, 12, 13, 24, 26]

describe('powerDistributionSectionLayout', () => {
  it('never asks a branch to climb back up towards its row', () => {
    for (const feedCount of FEED_COUNTS) {
      const layout = powerDistributionSectionLayout(feedCount)
      expect(layout.blockTops).toHaveLength(layout.blockCount)
      let leftRank = 0
      let feedIndex = 0
      for (const [blockIndex, block] of fuseBlockAllocations(feedCount).entries()) {
        const points = fuseBlockPoints(block.circuitCount, FUSE_BLOCK_START_X, layout.blockTops[blockIndex])
        for (let localIndex = 0; localIndex < block.assignedFeedCount; localIndex += 1, feedIndex += 1) {
          const rowY = layout.firstBranchY + (feedIndex * POWER_BRANCH_ROW_SPACING)
          const { slot, isRightColumn } = fuseSlotForFeed(localIndex, block.assignedFeedCount)
          const label = `${feedCount} feeds, feed ${feedIndex}`
          // Ground leaves the comb above the block, so its row must be lower.
          expect(rowY, label).toBeGreaterThan(groundCombLaneY(layout.blockTops[blockIndex], localIndex, block.assignedFeedCount))
          if (isRightColumn) {
            // Straight out of the screw, then down: never above the screw.
            expect(rowY, label).toBeGreaterThanOrEqual(Math.round(points.circuit(slot).y))
          } else {
            // Around the block into the comb, then down: never above the comb.
            expect(rowY, label).toBeGreaterThan(feedCombLaneY(layout.feedCombY, leftRank))
            leftRank += 1
          }
        }
      }
      const lastRowY = layout.firstBranchY + ((feedCount - 1) * POWER_BRANCH_ROW_SPACING)
      expect(layout.sectionHeight, `${feedCount} feeds`).toBeGreaterThan(lastRowY)
      expect(layout.sectionHeight, `${feedCount} feeds`).toBeGreaterThan(layout.scheduleY)
    }
  })

  it('hangs the PSU off the height its +5 V trunk enters the block at', () => {
    for (const feedCount of FEED_COUNTS) {
      const layout = powerDistributionSectionLayout(feedCount)
      const points = fuseBlockPoints(fuseBlockAllocations(feedCount)[0].circuitCount, FUSE_BLOCK_START_X, layout.fuseBlockY)
      // A straight trunk means the PSU terminal and the entry share a height,
      // and the entry has to stay in the clear band between bus and first fuse.
      expect(layout.psuY + PSU_POSITIVE_TERMINAL_OFFSET, `${feedCount} feeds`).toBe(layout.trunkEntryY)
      expect(layout.trunkEntryY, `${feedCount} feeds`).toBeGreaterThan(points.groundCircuit(0).y)
      expect(layout.trunkEntryY, `${feedCount} feeds`).toBeLessThan(points.circuit(0).y)
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
  })

  it('grows the header rather than the width when a zone needs several blocks', () => {
    const single = powerDistributionSectionLayout(6)
    const many = powerDistributionSectionLayout(26)
    expect(many.blockCount).toBeGreaterThan(single.blockCount)
    expect(many.blockTops.every((top, index) => index === 0 || top > many.blockTops[index - 1])).toBe(true)
    expect(many.firstBranchY).toBeGreaterThan(single.firstBranchY)
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
