export const FUSE_BLOCK_CIRCUIT_COUNTS = [2, 4, 6, 8, 10, 12] as const

export type FuseBlockCircuitCount = typeof FUSE_BLOCK_CIRCUIT_COUNTS[number]

export interface FuseBlockAllocation {
  circuitCount: FuseBlockCircuitCount
  assignedFeedCount: number
  firstFeedIndex: number
}

/**
 * Select real fixed-size fuse blocks for a PSU zone.
 *
 * Blocks are available in even circuit counts from 2 through 12. A zone uses
 * full 12-way blocks first, then the smallest final block that can hold the
 * remainder. At most one circuit is spare because every supported size is even.
 */
export function fuseBlockAllocations(feedCount: number): FuseBlockAllocation[] {
  let remaining = Math.max(0, Math.floor(feedCount))
  let firstFeedIndex = 0
  const blocks: FuseBlockAllocation[] = []

  while (remaining > 0) {
    const assignedFeedCount = Math.min(remaining, 12)
    const circuitCount = Math.min(12, Math.max(2, Math.ceil(assignedFeedCount / 2) * 2)) as FuseBlockCircuitCount
    blocks.push({ circuitCount, assignedFeedCount, firstFeedIndex })
    firstFeedIndex += assignedFeedCount
    remaining -= assignedFeedCount
  }

  return blocks
}

export function fuseBlockSummary(feedCount: number): string {
  return fuseBlockAllocations(feedCount)
    .map((block) => `${block.circuitCount}-circuit`)
    .join(' + ')
}
