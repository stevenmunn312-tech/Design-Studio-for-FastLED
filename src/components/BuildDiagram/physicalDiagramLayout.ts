import type { ElectricalPlanSummary } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import { fuseBlockAllocations } from '../../build/powerDistribution'

export type ItemLayout = {
  item: HardwareManifestItem
  x: number
  y: number
  width: number
  height: number
}

/** Clearance between the last hardware row and the PSU zones, sized for the shared-net callout. */
export const POWER_SECTION_GAP = 120

export const FUSE_BLOCK_CELL_WIDTH = 160
export const FUSE_BLOCK_CELL_HEIGHT = 182
export const FUSE_BLOCK_START_X = 282
export const POWER_BRANCH_ROW_SPACING = 86

/** Vertical pitch of the ground comb that fans out above each fuse block. */
export const GROUND_COMB_STEP = 8
/** Vertical pitch of the feed comb that fans out below the fuse block stack. */
export const FEED_COMB_STEP = 9
/** Clearance kept between a fuse block and the comb lanes stacked above it. */
const GROUND_COMB_CLEARANCE = 16
/** Clearance between the bottom of the block stack and the first feed comb lane. */
const FEED_COMB_CLEARANCE = 22
const PSU_RENDER_HEIGHT = 220

/**
 * Feeds are split across the two screw columns of their block so the harness
 * only ever flows down and to the right: the shallowest feeds take the right
 * column and leave straight out towards their lane, the deepest take the left
 * column and drop around the block into the comb below it.
 */
export function fuseColumnSplit(assignedFeedCount: number) {
  const rightCount = Math.ceil(assignedFeedCount / 2)
  return { rightCount, leftCount: assignedFeedCount - rightCount }
}

/**
 * Which screw a feed lands on, given its index within its own block. Right
 * column screws are the odd slots, left column the even ones, and both run
 * top to bottom in feed order so no two runs out of a column cross.
 */
export function fuseSlotForFeed(localIndex: number, assignedFeedCount: number) {
  const { rightCount } = fuseColumnSplit(assignedFeedCount)
  const isRightColumn = localIndex < rightCount
  const columnRank = isRightColumn ? localIndex : localIndex - rightCount
  return { slot: (columnRank * 2) + (isRightColumn ? 1 : 0), isRightColumn, columnRank }
}

/** Comb lane a feed's ground return takes above its own block. */
export function groundCombLaneY(blockTop: number, localIndex: number, assignedFeedCount: number) {
  return blockTop - GROUND_COMB_CLEARANCE - ((assignedFeedCount - 1 - localIndex) * GROUND_COMB_STEP)
}

/** Comb lane a left-column feed takes below the block stack. */
export function feedCombLaneY(feedCombY: number, leftColumnRank: number) {
  return feedCombY + (leftColumnRank * FEED_COMB_STEP)
}

/** Inverse of {@link fuseSlotForFeed}: which feed sits on a circuit, if any. */
export function feedIndexForFuseSlot(slot: number, assignedFeedCount: number) {
  const { rightCount, leftCount } = fuseColumnSplit(assignedFeedCount)
  const columnRank = Math.floor(slot / 2)
  const localIndex = slot % 2 === 1 ? columnRank : rightCount + columnRank
  const withinColumn = slot % 2 === 1 ? columnRank < rightCount : columnRank < leftCount
  return withinColumn ? localIndex : -1
}

export function powerDistributionSectionLayout(feedCount: number) {
  const blocks = fuseBlockAllocations(feedCount)
  // Blocks stack vertically at one x, which keeps the whole width right of the
  // block clear for the feed lanes no matter how many blocks a zone needs.
  const blockTops: number[] = []
  let cursor = 96
  let leftColumnFeeds = 0
  for (const block of blocks) {
    cursor += (block.assignedFeedCount * GROUND_COMB_STEP) + GROUND_COMB_CLEARANCE
    blockTops.push(cursor)
    cursor += FUSE_BLOCK_CELL_HEIGHT
    leftColumnFeeds += fuseColumnSplit(block.assignedFeedCount).leftCount
  }
  const fuseBlockY = blockTops[0] ?? 96
  const psuY = fuseBlockY
  const blocksBottom = cursor
  const feedCombY = blocksBottom + FEED_COMB_CLEARANCE
  const feedCombBottom = feedCombY + (Math.max(0, leftColumnFeeds - 1) * FEED_COMB_STEP)
  const componentBottom = Math.max(psuY + PSU_RENDER_HEIGHT, blocksBottom)
  // The feed rows start below every source component, so each branch is a
  // single downward-and-right run instead of wrapping back around the block.
  const branchStartY = Math.max(componentBottom, feedCombBottom) + 26
  const firstBranchY = branchStartY + 38
  const branchBottom = firstBranchY + (Math.max(0, feedCount - 1) * POWER_BRANCH_ROW_SPACING) + 64
  return {
    blockCount: blocks.length,
    blockTops,
    blocksBottom,
    feedCombY,
    branchStartY,
    psuY,
    fuseBlockY,
    sectionHeight: Math.max(componentBottom, branchBottom) + 30,
  }
}

/**
 * Control-module renders (button / potentiometer / encoder).
 *
 * All three share one board artwork, cropped to the PCB edge, so a single set
 * of ratios locates every pad. Ratios were measured off the source renders:
 * the pad row sits at 86% of board height, and the pads are evenly spaced
 * about the centreline.
 */
export const PERIPHERAL_RENDER_W = 220
/** 220 x (598/828), the cropped render's own aspect. */
export const PERIPHERAL_RENDER_H = 159
export const PERIPHERAL_GAP = 30

/**
 * Every control signal gets its own horizontal lane beneath the module row.
 * Sharing one lane per module drew an encoder's A/B/SW on top of each other,
 * and packing modules 6px apart made neighbouring runs impossible to trace.
 */
/** Deep enough that the first lane clears the downward VCC/GND stub labels. */
export const PERIPHERAL_LANE_BASE = 42
export const PERIPHERAL_LANE_SPACING = 13
/** Clear of the deepest lane, with room for the downward GND/VCC stub labels. */
export function peripheralClearance(rowSignalCount: number) {
  return PERIPHERAL_LANE_BASE + (Math.max(rowSignalCount, 1) * PERIPHERAL_LANE_SPACING) + 16
}
export const PERIPHERAL_ROW_X = 330
export const PERIPHERAL_ROW_GAP = 34
/**
 * Modules wrap instead of running off the sheet. Three fit between the row's
 * left edge and the 1120-wide canvas; a fourth starts a second row.
 */
export const PERIPHERALS_PER_ROW = 3

/**
 * Measured from the gold pad rings themselves (centroid per hole), not from the
 * densest gold scanline — the corner mounting holes share that band and pulled
 * an earlier estimate ~4px high.
 */
const PAD_Y_RATIO = 0.884
const PAD_X_RATIOS_3 = [0.4196, 0.4995, 0.579]
const PAD_X_RATIOS_5 = [0.34, 0.4194, 0.4992, 0.5787, 0.658]

/**
 * Pads sit ~18px above the board edge at render scale, so a stub needs a lead
 * long enough to put its symbol clear of the artwork rather than on top of it.
 */
export const PERIPHERAL_STUB_LEAD = 26

/** Pads run VCC, [signals...], GND left to right on every module. */
export function peripheralPadCount(kind: HardwareManifestItem['kind']) {
  return kind === 'encoder-input' ? 5 : 3
}

/** Silkscreen names on the module renders, indexed the same as the pads. */
export function peripheralPadLabel(kind: HardwareManifestItem['kind'], padIndex: number) {
  const labels = kind === 'encoder-input'
    ? ['VCC', 'A', 'B', 'SW', 'GND']
    : ['VCC', 'SIG', 'GND']
  return labels[Math.min(Math.max(padIndex, 0), labels.length - 1)]
}

export function peripheralPadPoint(layout: ItemLayout, padIndex: number) {
  const ratios = peripheralPadCount(layout.item.kind) === 5 ? PAD_X_RATIOS_5 : PAD_X_RATIOS_3
  const ratio = ratios[Math.min(Math.max(padIndex, 0), ratios.length - 1)]
  return {
    x: layout.x + (ratio * PERIPHERAL_RENDER_W),
    y: layout.y + (PAD_Y_RATIO * PERIPHERAL_RENDER_H),
  }
}

export const LEVEL_SHIFTER_X = 430
export const LEVEL_SHIFTER_Y = 276
export const LEVEL_SHIFTER_WIDTH = 180
export const LEVEL_SHIFTER_HEIGHT = 230
/** Clears the four detour lanes that wrap under each chip (deepest is +57). */
export const LEVEL_SHIFTER_GAP = 76

export type LevelShifterTerminalPoint = {
  x: number
  y: number
  side: 'left' | 'right'
}

const LEVEL_SHIFTER_LEFT_PIN_X = 35
const LEVEL_SHIFTER_RIGHT_PIN_X = 147
const LEVEL_SHIFTER_PIN_ROWS = [41, 66, 91, 115, 140, 165, 190] as const
const LEVEL_SHIFTER_CHANNEL_PINS = [
  { a: ['left', 1], y: ['left', 2], oe: ['left', 0] },
  { a: ['left', 4], y: ['left', 5], oe: ['left', 3] },
  { a: ['right', 5], y: ['right', 6], oe: ['right', 4] },
  { a: ['right', 2], y: ['right', 3], oe: ['right', 1] },
] as const

export function levelShifterChipY(outputIndex: number) {
  return LEVEL_SHIFTER_Y + (Math.floor(outputIndex / 4) * (LEVEL_SHIFTER_HEIGHT + LEVEL_SHIFTER_GAP))
}

export function levelShifterTerminalPoint(
  outputIndex: number,
  terminal: 'a' | 'y' | 'oe',
): LevelShifterTerminalPoint {
  const pin = LEVEL_SHIFTER_CHANNEL_PINS[outputIndex % 4][terminal]
  const side = pin[0]
  return {
    x: LEVEL_SHIFTER_X + (side === 'left' ? LEVEL_SHIFTER_LEFT_PIN_X : LEVEL_SHIFTER_RIGHT_PIN_X),
    y: levelShifterChipY(outputIndex) + LEVEL_SHIFTER_PIN_ROWS[pin[1]],
    side,
  }
}

export function levelShifterSupplyPoint(
  chipIndex: number,
  terminal: 'vcc' | 'gnd',
): LevelShifterTerminalPoint {
  return terminal === 'vcc'
    ? { x: LEVEL_SHIFTER_X + LEVEL_SHIFTER_RIGHT_PIN_X, y: levelShifterChipY(chipIndex * 4) + LEVEL_SHIFTER_PIN_ROWS[0], side: 'right' }
    : { x: LEVEL_SHIFTER_X + LEVEL_SHIFTER_LEFT_PIN_X, y: levelShifterChipY(chipIndex * 4) + LEVEL_SHIFTER_PIN_ROWS[6], side: 'left' }
}

export function itemLayouts(items: HardwareManifestItem[]): ItemLayout[] {
  const outputs = items.filter((item) => item.kind === 'matrix-output')
  const peripherals = items.filter((item) => item.kind !== 'matrix-output' && item.kind !== 'mic-input')
  const layouts: ItemLayout[] = outputs.map((item, index) => ({
    item,
    x: 820,
    y: 92 + (index * 212),
    width: 184,
    height: 174,
  }))
  const microphone = items.find((item) => item.kind === 'mic-input')
  if (microphone) layouts.push({ item: microphone, x: 350, y: 62, width: 205, height: 160 })
  const peripheralY = Math.max(500, LEVEL_SHIFTER_Y + (Math.ceil(outputs.length / 4) * (LEVEL_SHIFTER_HEIGHT + LEVEL_SHIFTER_GAP)) + 24)
  // Each row is only as deep as its own lane stack needs, so a lone button
  // does not reserve the space an encoder-heavy row would.
  const rowSignalCounts: number[] = []
  peripherals.forEach((item, index) => {
    const row = Math.floor(index / PERIPHERALS_PER_ROW)
    rowSignalCounts[row] = (rowSignalCounts[row] ?? 0) + item.pins.length
  })
  const rowHeights = rowSignalCounts.map((count) => PERIPHERAL_RENDER_H + peripheralClearance(count))
  const rowTops = rowHeights.map((_, row) =>
    peripheralY + rowHeights.slice(0, row).reduce((sum, height) => sum + height + PERIPHERAL_ROW_GAP, 0))
  peripherals.forEach((item, index) => {
    const column = index % PERIPHERALS_PER_ROW
    const row = Math.floor(index / PERIPHERALS_PER_ROW)
    layouts.push({
      item,
      x: PERIPHERAL_ROW_X + (column * (PERIPHERAL_RENDER_W + PERIPHERAL_GAP)),
      y: rowTops[row],
      width: PERIPHERAL_RENDER_W,
      // Footprint, not just artwork: the pads are on the bottom edge, so the
      // lanes and net stubs below them are part of what each module occupies.
      height: rowHeights[row],
    })
  })
  return layouts
}

/** Layer flags that change how tall the sheet has to be. */
export interface DiagramHeightLayers {
  levelShifter: boolean
  powerDistribution: boolean
}

const ALL_HEIGHT_LAYERS: DiagramHeightLayers = { levelShifter: true, powerDistribution: true }

/**
 * Bottom of everything above the PSU zones. The level shifter is included
 * explicitly because it is taller than the output cards on small builds and it
 * is not part of `itemLayouts`.
 */
export function diagramContentBottom(items: HardwareManifestItem[], layers: DiagramHeightLayers = ALL_HEIGHT_LAYERS) {
  const layouts = itemLayouts(items)
  const outputCount = layouts.filter((layout) => layout.item.kind === 'matrix-output').length
  const shifterBottom = layers.levelShifter && outputCount > 0
    ? LEVEL_SHIFTER_Y + (Math.ceil(outputCount / 4) * (LEVEL_SHIFTER_HEIGHT + LEVEL_SHIFTER_GAP))
    : 0
  return Math.max(0, shifterBottom, ...layouts.map((layout) => layout.y + layout.height))
}

/** Single owner of where the PSU zones start, shared by the renderer and the height. */
export function powerSectionStartY(items: HardwareManifestItem[], layers: DiagramHeightLayers = ALL_HEIGHT_LAYERS) {
  return Math.max(670, diagramContentBottom(items, layers) + POWER_SECTION_GAP)
}

export function physicalAssemblyDiagramHeight(
  items: HardwareManifestItem[],
  plan: ElectricalPlanSummary,
  layers: DiagramHeightLayers = ALL_HEIGHT_LAYERS,
) {
  const layouts = itemLayouts(items)
  const outputCount = layouts.filter((layout) => layout.item.kind === 'matrix-output').length
  // A sheet with no PSU zones ends just past its own hardware instead of
  // reserving the full-build height, so section views fit tighter. The trailing
  // room holds the shared-net callout, which renders on every sheet.
  if (outputCount === 0 || !layers.powerDistribution) {
    return Math.max(400, diagramContentBottom(items, layers) + 80)
  }
  const powerSectionHeight = (plan.totals?.supplies ?? []).reduce((height, supply) =>
    height + powerDistributionSectionLayout(supply.injectionIds.length).sectionHeight + 34, 0)
  return powerSectionStartY(items, layers) + powerSectionHeight + 34
}
