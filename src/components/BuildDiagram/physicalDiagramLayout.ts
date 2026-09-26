import type { ElectricalPlanSummary } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import { fuseBlockAllocations, type FuseBlockCircuitCount } from '../../build/powerDistribution'
import { partById, partPinLabelForProperty } from '../../state/partCatalogue'
import { oledTransportFor, type OledTransport } from '../../state/oledSurface'

export type ItemLayout = {
  item: HardwareManifestItem
  x: number
  y: number
  width: number
  height: number
}

/** Clearance between the last hardware row and the PSU zones, sized for the shared-net callout. */
export const POWER_SECTION_GAP = 120

/** Shared-net callout box, and the gap it keeps below the last hardware row. */
export const COMMON_NET_CALLOUT_HEIGHT = 88
export const COMMON_NET_CALLOUT_GAP = 12
/** Strip along the bottom edge that the wire-colour legend owns. */
export const DIAGRAM_LEGEND_BAND = 46

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
export const PSU_RENDER_HEIGHT = 220
/** Terminal offsets measured off the labelled PSU render's screw block. */
export const PSU_POSITIVE_TERMINAL_OFFSET = 64
export const PSU_GROUND_TERMINAL_OFFSET = 87
/** Vertical gap between a feed's +5 V and ground rows, set by the capacitor. */
export const POWER_FEED_PAIR_GAP = 26

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

const FUSE_BLOCK_MODEL_WIDTH = 5.8

/**
 * Map the plan-view Blender model coordinates into the fixed SVG image cell.
 * The Cycles renders use a 15% orthographic perimeter, so these points land on
 * the visible screw heads for every supported fixed block size.
 */
export function fuseBlockPoints(circuitCount: FuseBlockCircuitCount, x: number, y: number) {
  const rows = circuitCount / 2
  const modelHeight = 3.45 + (rows * 1.72)
  const scale = Math.min(
    FUSE_BLOCK_CELL_WIDTH / (FUSE_BLOCK_MODEL_WIDTH * 1.15),
    FUSE_BLOCK_CELL_HEIGHT / (modelHeight * 1.15),
  )
  const centreX = x + (FUSE_BLOCK_CELL_WIDTH / 2)
  const centreY = y + (FUSE_BLOCK_CELL_HEIGHT / 2)
  return {
    positive: { x: centreX, y: centreY + ((modelHeight / 2 - 0.47) * scale) },
    ground: { x: centreX, y: centreY - ((modelHeight / 2 - 0.38) * scale) },
    groundCircuit(slot: number) {
      const modelX = -2 + ((4 * slot) / (circuitCount - 1))
      const busY = (modelHeight / 2) - 1.05
      return {
        x: centreX + (modelX * scale),
        y: centreY - (busY * scale),
      }
    },
    circuit(slot: number) {
      const rowFromTop = Math.floor(slot / 2)
      const column = slot % 2
      const modelY = (-modelHeight / 2) + 1.62 + ((rows - rowFromTop - 1) * 1.72)
      return {
        x: centreX + ((column === 0 ? -2.22 : 2.22) * scale),
        y: centreY - (modelY * scale),
      }
    },
  }
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
  const blocksBottom = cursor
  const feedCombY = blocksBottom + FEED_COMB_CLEARANCE
  const feedCombBottom = feedCombY + (Math.max(0, leftColumnFeeds - 1) * FEED_COMB_STEP)

  const firstBlock = blocks[0]
  const firstPoints = firstBlock && fuseBlockPoints(firstBlock.circuitCount, FUSE_BLOCK_START_X, fuseBlockY)
  // The +5 V trunk enters the block through the clear band between its negative
  // bus and its first fuse row. Hanging the PSU off that height keeps the trunk
  // a single straight run rather than a jog.
  const trunkEntryY = firstPoints
    ? Math.round((firstPoints.groundCircuit(0).y + firstPoints.circuit(0).y) / 2)
    : fuseBlockY + 54
  const psuY = Math.max(76, trunkEntryY - PSU_POSITIVE_TERMINAL_OFFSET)
  const componentBottom = Math.max(psuY + PSU_RENDER_HEIGHT, blocksBottom)

  // Rows start level with the first branch leaving the block, so the shallowest
  // feed is a dead-straight run. The floor keeps the first left-column feed
  // below the comb it crosses under the block in — otherwise that branch would
  // have to climb back up and the fan would stop being planar.
  const firstRightSlot = firstBlock ? fuseSlotForFeed(0, firstBlock.assignedFeedCount).slot : 0
  const firstBranchAlignedY = firstPoints ? Math.round(firstPoints.circuit(firstRightSlot).y) : componentBottom
  const leftColumnStart = firstBlock ? fuseColumnSplit(firstBlock.assignedFeedCount).rightCount : 0
  const leftColumnFloor = firstBlock && leftColumnStart < firstBlock.assignedFeedCount
    ? feedCombBottom + 24 - (leftColumnStart * POWER_BRANCH_ROW_SPACING)
    : 0
  const firstBranchY = Math.max(firstBranchAlignedY, leftColumnFloor)
  const branchBottom = firstBranchY + (Math.max(0, feedCount - 1) * POWER_BRANCH_ROW_SPACING) + 64

  // The fuse schedule drops into the space the PSU and combs leave clear on the
  // left, well inside the lane band the feeds start at.
  const scheduleY = Math.max(componentBottom, feedCombBottom) + 34
  const scheduleBottom = scheduleY + (blocks.reduce((lines, block) => lines + Math.ceil(block.circuitCount / 6), 0) * 18)
  return {
    blockCount: blocks.length,
    blockTops,
    blocksBottom,
    feedCombY,
    firstBranchY,
    scheduleY,
    psuY,
    fuseBlockY,
    trunkEntryY,
    sectionHeight: Math.max(componentBottom, scheduleBottom, branchBottom) + 30,
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

/**
 * Extra depth for a row holding a module with a channel-select pad.
 *
 * That stub hangs lower than the ordinary VCC/GND ones so its qualifying
 * "GND (LEFT)" caption does not overprint the plain GND caption on the pad
 * beside it — and the lane base above is measured against the ordinary depth,
 * so the deeper caption would otherwise land on the first lane. Charged per
 * row, to the rows that actually carry one.
 */
export const CHANNEL_SELECT_STUB_DROP = 16

function rowHasChannelSelect(rowItems: readonly HardwareManifestItem[]) {
  return rowItems.some((item) => micChannelSelectPadIndex(item) !== null)
}

/**
 * Extra depth for a row holding a receive divider. Its ground symbol hangs
 * from the divider, which sits below the module rather than on a pad, so its
 * caption lands lower than an ordinary pad's would.
 */
export const RECEIVE_DIVIDER_DROP = 16

/** Where a row's first control lane sits below its modules. */
export function peripheralLaneBase(rowItems: readonly HardwareManifestItem[]) {
  return PERIPHERAL_LANE_BASE
    + (rowHasChannelSelect(rowItems) ? CHANNEL_SELECT_STUB_DROP : 0)
    + (rowItems.some(hasReceiveDivider) ? RECEIVE_DIVIDER_DROP : 0)
}

/** Clear of the deepest lane, with room for the downward GND/VCC stub labels. */
export function peripheralClearance(rowSignalCount: number, rowItems: readonly HardwareManifestItem[] = []) {
  return peripheralLaneBase(rowItems) + (Math.max(rowSignalCount, 1) * PERIPHERAL_LANE_SPACING) + 16
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
/** The pitch both measured tables above share, for parts with no table yet. */
const PAD_PITCH_RATIO = 0.0797

/** Header-hole centres measured in each audio render's own pixel space. */
/*
 * Where a module's pads actually sit on its render, as fractions of the source
 * image.
 *
 * Measured off each render rather than assumed, because pads are not evenly
 * spread across a board: a MAX98357A's header sits in the middle of a tall
 * board, an SSD1306's runs the full width of a short one, and a MAX7219's runs
 * *down* the left edge rather than across the bottom. Without a measurement the
 * pads are distributed evenly across the whole picture and the wires meet the
 * board wherever that lands.
 *
 * Points rather than a row of `x`s plus one shared `y`, which is what this
 * held first: that shape cannot describe a vertical header, and the MAX7219 has
 * one at each end.
 *
 * Figures come from scanning each render for its gold plating (or, on the
 * Grove TM1637, its connector body) and were checked by drawing the result back
 * over the picture. Re-measure if a render is replaced.
 */
type PadPoint = readonly [x: number, y: number]

/** A horizontal header: one row of pads sharing a y. */
function padRow(xs: readonly number[], width: number, y: number, height: number): PadPoint[] {
  return xs.map((x) => [x / width, y / height] as PadPoint)
}

/** A vertical header: one column of pads sharing an x. */
function padColumn(x: number, width: number, ys: readonly number[], height: number): PadPoint[] {
  return ys.map((y) => [x / width, y / height] as PadPoint)
}

/**
 * Pads scattered across a board rather than in one header: each point in
 * source pixels, in the catalogue's `pinLabelsLeftToRight` order.
 */
function padPoints(width: number, height: number, points: readonly (readonly [number, number])[]): PadPoint[] {
  return points.map(([x, y]) => [x / width, y / height] as PadPoint)
}

export const MODULE_PAD_GEOMETRY: Record<string, readonly PadPoint[]> = {
  // Microphones. All three are six-pad rows along the bottom edge, in three
  // different silkscreen orders — which is exactly why the pad *point* is
  // measured here and the pad *role* is looked up by name rather than by
  // index. These were the last hand-placed pads on the sheet: the diagram drew
  // a six-pad column down the left margin of every microphone, a shape no
  // microphone render has.
  'inmp441-i2s-microphone': padRow([34, 100.4, 166.8, 233.2, 299.6, 366], 400, 244.8, 282),
  'ics-43434-i2s-microphone': padRow([104.7, 142.4, 180.7, 218.4, 256.6, 294.4], 400, 255.8, 286),
  'generic-i2s-mems-microphone': padRow([41.7, 104.1, 168, 231, 294.8, 357.2], 400, 204.4, 248),
  'sph0645lm4h-i2s-microphone': padRow([55.5, 113.2, 170.4, 228.7, 285.8, 343.6], 400, 268.5, 309),

  // Measured from the drilled holes. The earlier figure sat 9 px low, on the
  // board below the header rather than in it.
  'max98357a-i2s-amplifier': padRow([32, 88, 144, 200, 256, 312, 368], 400, 535.7, 568),
  // Two boards side by side, left then right, seven pads each. The pads are
  // unpopulated silver rings the warm mask cannot see, so they were measured
  // off a ruled crop: the outer rings anchor a 30.55 px pitch on each board.
  'max98357a-stereo-pair': padRow([
    24.2, 54.8, 85.3, 115.9, 146.4, 177, 207.5,
    274.1, 304.7, 335.2, 365.8, 396.3, 426.9, 457.4,
  ], 483, 299.7, 325),
  'pam8403-3w-stereo-amplifier':
    padRow([36.6, 69.4, 102, 134.6, 167.4, 200.1, 232.6, 265.4, 298.1, 330.7, 363.4], 400, 254.3, 287),
  // The logic pair along the bottom edge, measured at each pad's edge-side
  // hole, the one a header pin or wire takes. Computed from the model's own
  // coordinates (23.75 px/mm, 10 px margin) and checked against the render:
  // both points are real, transparent holes.
  'lr7843-mosfet-module': padPoints(400, 851, [[169.8, 771.2], [230.2, 771.2]]),
  // Both RTCs measured from their drilled holes. They had a table of their own
  // with four x-ratios, left from before the catalogue listed six (ZS-042) and
  // five (XC9044) pads, so SDA, VCC and GND clamped onto one point.
  'ds3231-rtc-module': padPoints(464, 272,
    [[155.2, 252.1], [185.8, 252.1], [216.2, 252.1], [246.7, 252.1], [277.1, 252.1], [307.7, 252.1]]),
  // microSD boards, measured from their drilled holes. Until these existed an
  // SD card was placed by a guessed spread over an assumed 400x690 picture,
  // which the 3.3 V breakout (400x424) is nothing like.
  'microsd-module-5v': padRow([96.2, 137.8, 179.2, 220.8, 262.1, 303.8], 400, 669.1, 694),
  'microsd-breakout-3v3': padRow([53, 102, 151, 200, 249, 298, 347], 400, 395.6, 424),
  'jaycar-xc9044-rtc-module': padPoints(400, 400,
    [[67.5, 349.2], [133.5, 349.1], [199.5, 349.2], [265.5, 349.1], [331.6, 349.2]]),
  // Six-pin header VIN, GND, SCL, SDA, VIN-, VIN+, measured from the render's
  // drilled holes. VIN- and VIN+ are the load side and carry no controller wire.
  'adafruit-ina219-current-sensor': padPoints(400, 324,
    [[104.5, 275.5], [142.5, 275.5], [180.5, 275.5], [218.5, 275.5], [256.5, 275.5], [294.5, 275.5]]),
  // VIN, 3Vo, GND, SCL, SDA, ADDR along the bottom, measured from the drilled
  // holes. 3Vo is the regulator's output and ADDR is strapped, so neither
  // carries a controller wire.
  'adafruit-bh1750-light-sensor': padRow([104.5, 142.5, 180.5, 218.5, 256.5, 294.5], 400, 237.5, 286),
  // J1 along the top (GND, GND, MOSI, SCLK, SCNn, INTn) and J2 along the
  // bottom (GND, 3V3D, 3V3D, NC, RSTn, MISO), pin 1 of each at the right-hand
  // end. Computed from WIZnet's board file (13.60 px/mm, 10 px margin) and
  // checked against the render: every point is an open, drilled hole.
  'wiz850io-ethernet-module': padPoints(400, 333, [
    [262.9, 28.4], [228.3, 28.4], [193.8, 28.4], [159.3, 28.4], [124.7, 28.4], [90.2, 28.4],
    [262.9, 304.6], [228.3, 304.6], [193.8, 304.6], [159.3, 304.6], [124.7, 304.6], [90.2, 304.6],
  ]),
  // VCC, GND, OUT, RX, TX along the bottom, measured from the drilled holes.
  'hlk-ld2410c-presence-sensor': padRow([115.2, 159, 202.9, 246.7, 290.6], 400, 264.7, 296),
  // RO, RE, DE, DI along the bottom, then VCC, B, A, GND along the top, the
  // catalogue's one pad list, measured from the render's drilled holes.
  'max485-rs485-module': padPoints(400, 1160, [
    [103, 1094.3], [167.3, 1094.3], [231.7, 1094.3], [296, 1094.3],
    [103, 64.7], [167.3, 64.7], [231.7, 64.7], [296, 64.7],
  ]),
  'pcm5102a-i2s-dac': padRow([55, 113, 171, 229, 287, 345], 400, 837, 883),
  // Power amplifiers: screw terminals along the top for supply and speakers,
  // and the line input somewhere else entirely — mid-board holes on the
  // DX-0809, a bottom header on the PAM8610. Screws are measured at the centre
  // of each screw head, pads at the centre of each plated ring.
  'dx-0809-stereo-amplifier': padPoints(1200, 973, [
    [531.3, 631.3], [599.5, 631.2], [667.5, 631.1],
    [572.5, 86.8], [626.8, 86.6],
    [164, 86.4], [218.3, 86.9], [980.8, 86.6], [1035, 86.6],
  ]),
  'pam8610-stereo-amplifier': padPoints(400, 337, [
    [66.5, 55.6], [119.6, 55.1], [172.7, 55.6], [226.5, 55.2], [279.2, 55.2], [332.7, 55.1],
    [146.2, 304.5], [182, 304.5], [217.3, 304.6], [252.7, 304.6],
  ]),
  // The bottom row of nine; the six along the top edge are uncatalogued
  // configuration pads. Re-measured when the render changed from a 504 px
  // square to 504x324, which the old figure still assumed.
  'uda1334a-i2s-dac':
    padRow([130.2, 160.5, 191.2, 221.5, 251.9, 282.5, 312.9, 343.5, 373.8], 504, 285, 324),

  // Displays. The OLED and TFT headers run along the bottom edge; the
  // MAX7219's runs down its left side, which is the IN end of a part built to
  // be daisy-chained.
  'sh1106-oled-128x64':
    padRow([125.5, 155.5, 186.5, 216.5, 247, 277.5, 308], 434, 391.6, 412),
  'sh1106-oled-096-128x64-spi':
    padRow([92.3, 128.1, 163.5, 199.3, 235.3, 271.7, 306.8], 400, 371.6, 414),
  'sh1106-oled-128x64-i2c': padRow([176.5, 206.6, 237.4, 267.6], 445, 381.5, 422),
  'ssd1306-oled-128x64':
    padRow([80, 114.3, 148.6, 182.9, 217.1, 251.4, 285.7, 320], 400, 346.2, 366),
  'ssd1306-oled-096-128x64-i2c': padRow([145.7, 181.5, 217.5, 253.1], 400, 370.8, 414),
  // A Grove part: four contacts inside a keyed connector rather than pads.
  'tm1637-4digit-display': padRow([210, 240, 271, 301], 512, 259, 296),
  'max7219-8digit-7segment': padColumn(18.3, 992, [33, 63.6, 94, 124.5, 154.9], 188),
  'st7789-tft-240x240':
    padRow([94.5, 125.5, 155.5, 186.5, 216.5, 247.5, 277.5, 308.5], 404, 505, 545),
  // Re-measured when the render became a 651x1169 portrait board: the old
  // figures described a 935x521 landscape picture and put every pad 50 px
  // below the header.
  'st7789v-xpt2046-touch-240x320': padRow(
    [78.1, 116.2, 154.3, 192.3, 230.4, 268.4, 306.5, 344.5, 382.6, 420.6, 458.7, 496.7, 534.8, 572.9],
    651, 1073.2, 1169,
  ),
  'ili9341-xpt2046-touch-320x240': padRow(
    [316.6, 346.2, 376.8, 407.6, 438, 468.3, 498.7, 529.1, 560, 590.4, 621.1, 651.2],
    968, 586.7, 608,
  ),
  /*
   * The one part whose pads are not a single edge row.
   *
   * It is an Arduino shield, so its four headers sit in the UNO arrangement:
   * J2 and J1 along the top edge, J3 and J4 along the bottom. The order below
   * follows `pinLabelsLeftToRight` exactly — the whole top edge left to right,
   * then the whole bottom edge — and skips each header's unlabelled positions
   * (J2's first two, J1's last two, J3's first, and three of J4's), because a
   * pad point exists per *catalogued* pin rather than per physical pin.
   *
   * The bottom row starts on each header's *second* position: the five LCD
   * lines on J3's pads 2-6, the supply pads on J4's 2, 4 and 5 — the shape an
   * UNO power header has, its first position not being one of these signals.
   *
   * Both this table and the render's own silkscreen had them a pad to the left,
   * because the table was measured from labels that were themselves wrong, so
   * every bottom wire attached to its neighbour. The Blender source was fixed
   * and re-rendered with it (`generate_xc4630_shield_part.py`, which places
   * each label by pin index), and the two now agree to within a pixel.
   */
  'ili9341-xc4630-parallel-touch-320x240': [
    ...padRow(
      [219.9, 250.4, 280.8, 311.3, 341.8, 372.3, 430.1, 460.6, 491.1, 521.6, 552, 582.5],
      944, 40, 644,
    ),
    ...padRow([182.7, 213.2, 243.6, 274.1, 304.6, 407.1, 468.1, 498.5], 944, 590.8, 644),
  ],
}

/**
 * Pads sit ~18px above the board edge at render scale, so a stub needs a lead
 * long enough to put its symbol clear of the artwork rather than on top of it.
 */
export const PERIPHERAL_STUB_LEAD = 26

/** SD images have variant-specific pad orders; simpler peripherals use VCC, signals, GND. */
function isThreeVoltSd(item: HardwareManifestItem) {
  return item.kind === 'sd-card' && item.facts.partId === 'microsd-breakout-3v3'
}

/**
 * An audio module's pads come from the part catalogue rather than from another
 * hardcoded array here, because the modules agree on
 * almost nothing: a MAX98357A has seven pads, a PAM8403 eleven, a PCM5102A six,
 * a UDA1334A nine, in four different orders. The catalogue already carries each
 * one's `pinLabelsLeftToRight`, measured off the part rather than guessed (see
 * the hardware render workflow in CLAUDE.md), so swapping the module on the
 * bench redraws the right pads for free.
 */
/*
 * Every module's pads come from the part catalogue, not from arrays written out
 * here.
 *
 * This started as an audio-only rule, for the honest reason that four amplifier
 * modules agree on almost nothing — a MAX98357A has seven pads, a PAM8403
 * eleven, a PCM5102A six, a UDA1334A nine, in four different orders. That is
 * true of every other family too, and the hardcoded arrays left behind were
 * wrong: a DS3231 was drawn with four pads reading 3V3/SDA/SCL/GND when the
 * module has six reading 32K/SQW/SCL/SDA/VCC/GND, so its data lines were
 * labelled the wrong way round and its supply pad was drawn on 32K. An LDR was
 * drawn VCC/SIG/GND when the board is silkscreened S/VCC/GND, putting its
 * signal on the supply pad.
 *
 * The catalogue carries each module's `pinLabelsLeftToRight` measured off the
 * part, so deriving from it fixes those and means a new module draws correctly
 * the day its asset lands.
 */
const UNCATALOGUED_PADS: Record<string, string[]> = {
  // The three modules that predate the catalogue and have no `part.json` yet.
  'button-input': ['VCC', 'SIG', 'GND'],
  // A demodulating receiver's own three legs, in the order every VS1838-form
  // module prints them. Awaiting a verified render like the rest of this list.
  'ir-input': ['OUT', 'GND', 'VCC'],
  'pot-input': ['VCC', 'SIG', 'GND'],
  'encoder-input': ['VCC', 'A', 'B', 'SW', 'GND'],
}

function peripheralPads(item: HardwareManifestItem): string[] {
  const entry = partById(String(item.facts.partId ?? ''))
  if (entry?.pinLabelsLeftToRight?.length) return entry.pinLabelsLeftToRight
  return UNCATALOGUED_PADS[item.kind] ?? ['VCC', 'SIG', 'GND']
}

function audioModulePads(item: HardwareManifestItem): string[] {
  return peripheralPads(item)
}

export function peripheralPadCount(item: HardwareManifestItem) {
  return peripheralPads(item).length
}

/** Silkscreen names on the module renders, indexed the same as the pads. */
export function peripheralPadLabel(item: HardwareManifestItem, padIndex: number) {
  const pads = peripheralPads(item)
  return pads[Math.min(Math.max(padIndex, 0), pads.length - 1)]
}

/** Supply and ground, found by the name printed beside the pad. */
// `+` and `VS` join the list for the IR receivers: a KY-022 prints its
// supply as a bare plus, and Vishay's datasheet names the pin VS.
// `+12V` is the supply terminal on the large analog power amplifiers, and
// `3V3D` the WIZ850io's digital 3.3 V supply.
const POWER_PAD_LABELS = ['VIN', '+5V', '5V', 'VCC', 'VDD', 'VS', '3V3', '3V3D', '3V', 'V+', '+', '+12V']
const GROUND_PAD_LABELS = ['GND', 'G', '0V', '-']

/**
 * The pad that picks which I2S slot a MEMS microphone talks in, tied low for
 * the left channel — the app's default, and the only channel its capture reads.
 *
 * It carries no GPIO, so it is not one of the item's pins and has to be found
 * by name like the supply and ground pads are. The name differs by module:
 * INMP441-style boards print L/R, the Adafruit-form ICS-43434 prints SEL.
 */
const CHANNEL_SELECT_PAD_LABELS = ['L/R', 'LR', 'SEL']

/** Which pad selects the channel, or `null` on a module that has no such pad. */
export function micChannelSelectPadIndex(item: HardwareManifestItem) {
  const index = padIndexByLabel(item, CHANNEL_SELECT_PAD_LABELS, -1)
  return index >= 0 ? index : null
}

/**
 * The RS-485 transceiver's two enable pads, which the build joins with a short
 * jumper so one GPIO drives both: RE is active low and DE active high, so one
 * line held low listens and held high talks. Only the enable GPIO is a pin use,
 * landing on DE; RE has no wire of its own and has to be found by name, like
 * a microphone's channel-select pad. `null` on anything that is not one.
 */
export function transceiverEnableBridgePads(item: HardwareManifestItem): [re: number, de: number] | null {
  if (item.kind !== 'dmx-input') return null
  const re = padIndexByLabel(item, ['RE'], -1)
  const de = padIndexByLabel(item, ['DE'], -1)
  return re >= 0 && de >= 0 ? [re, de] : null
}

/**
 * A pad's name without the board it is on. A part made of two boards (the
 * MAX98357A stereo pair) prints `L:BCLK` and `R:BCLK`; the board's wire goes
 * to the first, left, board, whose pads come first.
 */
function padName(label: string) {
  return label.toUpperCase().replace(/^[LR]:/, '')
}

function padIndexByLabel(item: HardwareManifestItem, wanted: readonly string[], fallback: number) {
  const pads = peripheralPads(item).map(padName)
  const index = pads.findIndex((label) => wanted.includes(label))
  return index >= 0 ? index : fallback
}

/**
 * The pad the controller's supply rail lands on, or `null` for a module that
 * takes no supply from the controller. An opto-isolated switch input lights
 * its optocoupler's LED from the signal itself: the LR7843 board brings out
 * only PWM and GND, and falling back to pad 0 drew a VCC wire onto its GND.
 */
export function peripheralPowerPadIndex(item: HardwareManifestItem): number | null {
  if (item.kind === 'power-switch-output') return null
  return padIndexByLabel(item, POWER_PAD_LABELS, 0)
}

/**
 * The ground pad its stub is drawn from. A module printing GND more than once
 * gives the lowest one on its render, because the stub hangs downwards: on the
 * WIZ850io the first GND is on the top header, where the stub and its label
 * would sit under the module's own picture.
 */
export function peripheralGroundPadIndex(item: HardwareManifestItem) {
  const first = padIndexByLabel(item, GROUND_PAD_LABELS, peripheralPadCount(item) - 1)
  const measured = MODULE_PAD_GEOMETRY[String(item.facts.partId ?? '')]
  if (!measured) return first
  const grounds = peripheralPads(item)
    .map((label, index) => ({ index, ground: GROUND_PAD_LABELS.includes(padName(label)) }))
    .filter((pad) => pad.ground && measured[pad.index])
  return grounds.reduce((lowest, pad) =>
    measured[pad.index][1] > measured[lowest][1] ? pad.index : lowest, first)
}

/** Manifest order for SD is CS, SCK, MOSI, MISO; the two module variants put
 * those pads in different physical orders. */
export function peripheralSignalPadIndex(item: HardwareManifestItem, signalIndex: number) {
  if (item.kind === 'line-input') {
    const pads = audioModulePads(item).map((label) => label.toUpperCase())
    const wanted = [['SCK', 'MCLK'], ['BCK', 'BCLK'], ['LRCK', 'LRCLK'], ['DOUT']]
    const names = wanted[Math.min(Math.max(signalIndex, 0), wanted.length - 1)]
    const index = pads.findIndex((label) => names.includes(label))
    return index >= 0 ? index : Math.min(signalIndex + 1, pads.length - 1)
  }
  if (item.kind === 'amplifier') {
    // The manifest pushes BCLK, LRC, DOUT for an I2S stage, or the two
    // internal-DAC line-in pins for a power amplifier; find each on the module
    // by the name it is silkscreened with.
    const pads = audioModulePads(item).map(padName)
    const wanted = item.facts.stage === 'power'
      ? [['LIN', 'INL', 'AUX-L'], ['RIN', 'INR', 'AUX-R']]
      : [['BCLK', 'BCK', 'SCK'], ['LRC', 'LCK', 'WSEL'], ['DIN']]
    const names = wanted[Math.min(Math.max(signalIndex, 0), wanted.length - 1)]
    const index = pads.findIndex((label) => names.includes(label))
    return index >= 0 ? index : Math.min(signalIndex + 1, pads.length - 1)
  }
  /*
   * Everything else finds its pad by the name printed beside it, using the
   * order the manifest pushed the pins in. A module labels a line with the
   * name its silkscreen uses, and those differ — a microSD breakout prints
   * DO/DI where the module prints MISO/MOSI, an OLED prints CLK where the
   * property is called sckPin.
   */
  const pads = peripheralPads(item).map((label) => label.toUpperCase())
  const partId = String(item.facts.partId ?? '')
  const propertyKey = item.pins[signalIndex]?.propertyKey
  const cataloguedLabel = propertyKey
    ? partPinLabelForProperty(partId, propertyKey)?.toUpperCase()
    : null
  if (cataloguedLabel) {
    const index = pads.indexOf(cataloguedLabel)
    if (index >= 0) return index
  }
  const wanted = signalPadNames(item)?.[signalIndex]
  if (wanted) {
    const index = pads.findIndex((label) => wanted.includes(label))
    if (index >= 0) return index
  }
  // No name matched: step past the supply pad rather than landing on it.
  const power = peripheralPowerPadIndex(item)
  const guess = signalIndex + (power === 0 ? 1 : 0)
  return Math.min(Math.max(guess, 0), pads.length - 1)
}

/**
 * Silkscreen names for each wired role, in the order `collectPinUses` pushes
 * them. Kept beside the layout because it maps a *property* to what a board
 * prints, which is a drawing concern rather than a wiring one.
 */
const SIGNAL_PAD_NAMES: Partial<Record<HardwareManifestItem['kind'], string[][]>> = {
  'sd-card': [['CS'], ['SCK', 'CLK'], ['MOSI', 'DI'], ['MISO', 'DO']],
  'segment-display': [['CLK', 'SCK'], ['DIO', 'DIN', 'DATA'], ['CS', 'LOAD']],
  'rtc-input': [['SDA'], ['SCL']],
  'motion-input': [['OUT', 'SIG']],
  // A KY-022 prints S, a bare Vishay receiver's datasheet names it OUT.
  'ir-input': [['S', 'OUT', 'SIG', 'DAT']],
  'light-input': [['S', 'SIG', 'OUT', 'AO', 'DO']],
  'button-input': [['SIG']],
  'pot-input': [['SIG']],
  'encoder-input': [['A'], ['B'], ['SW']],
  'relay-output': Array.from({ length: 8 }, (_, index) => [`IN${index + 1}`]),
  // The LR7843 board prints PWM for its one input; other builds print IN or SIG.
  'power-switch-output': [['PWM', 'IN', 'SIG']],
  'power-monitor-input': [['SDA'], ['SCL']],
  // The board's RX reads the sensor's TX pad.
  'presence-input': [['TX']],
  // The manifest pushes TX, RX, enable: TX drives the transceiver's DI, RX
  // reads its RO, and the enable line lands on DE (RE is bridged to it).
  'dmx-input': [['DI'], ['RO'], ['DE']],
}

/**
 * An OLED's manifest order is its transport's, so one positional list cannot
 * serve both: `OLED_TRANSPORT_PINS` pushes CS, DC, RESET, CLK, MOSI over SPI
 * and SDA, SCL over I2C. Reading the SPI list for an I2C module drew SDA on the
 * CS pad and SCL on the DC pad. The transport comes from the catalogued
 * interface, the same derivation `oledTransportForProps` makes, rather than
 * from a second list of which part ids are I2C.
 */
function signalPadNames(item: HardwareManifestItem): string[][] | undefined {
  if (item.kind === 'info-display') {
    const transport = oledTransportFor(partById(String(item.facts.partId ?? ''))?.display?.interface)
    return OLED_PAD_NAMES[transport]
  }
  // A light sensor is either an LDR's one analog line or a BH1750's I2C pair,
  // and the manifest records which.
  if (item.kind === 'light-input' && item.facts.transport === 'i2c') return [['SDA'], ['SCL']]
  return SIGNAL_PAD_NAMES[item.kind]
}

const OLED_PAD_NAMES: Record<OledTransport, string[][]> = {
  spi: [['CS'], ['DC'], ['RES', 'RST', 'RESET'], ['CLK', 'SCK', 'D0'], ['MOSI', 'DATA', 'DIN', 'D1']],
  i2c: [['SDA', 'DATA', 'DIN', 'D1'], ['SCL', 'CLK', 'SCK', 'D0']],
}

export function peripheralPowerNet(item: HardwareManifestItem): 'v3v3' | 'v5' | 'v12' | null {
  const powerPad = peripheralPowerPadIndex(item)
  if (powerPad === null) return null
  // A power amplifier printed +12V wants its own supply. Checked before the
  // audio default below, because drawing it on the controller's 5 V rail is
  // advice that is quiet at best and, read the other way, puts twelve volts
  // where the controller expects five.
  if (item.kind === 'amplifier' && peripheralPadLabel(item, powerPad).toUpperCase() === '+12V') return 'v12'
  // Audio modules take the 5 V rail: a class-D amp's output power comes from
  // its supply, and 3.3 V would make it quiet rather than broken — the kind of
  // wrong that reads as a bad speaker.
  if (item.kind === 'amplifier' || item.kind === 'line-input' || item.kind === 'relay-output') return 'v5'
  // The INA219 board prints VIN, but it has no regulator: VIN is what its
  // SDA/SCL pull-ups tie to. On the 5 V rail those pull-ups would hold the
  // controller's I2C pins at 5 V, so it takes the logic rail instead.
  if (item.kind === 'power-monitor-input') return 'v3v3'
  // The BH1750 breakout's level shifter pulls the controller side of SDA/SCL
  // up to VIN, so a 5 V VIN would hold the controller's I2C pins at 5 V.
  if (item.kind === 'light-input' && item.facts.transport === 'i2c') return 'v3v3'
  // The MAX485 is specified for 4.75-5.25 V, so it takes the 5 V rail. Its RO
  // then swings to 5 V, which the receive divider brings down to the ESP32's
  // level (see `receiveDivider`).
  if (item.kind === 'dmx-input') return 'v5'
  // The radar needs 5 V (and more than 200 mA of supply); its UART is 3.3 V,
  // so nothing on the logic side needs shifting.
  if (item.kind === 'presence-input') return 'v5'
  // A module whose supply pad is printed 3V3 or 3V is asking for that rail;
  // one printed VIN or 5V is asking for the other. The bare 3.3 V microSD
  // breakout is the case that made this matter — feeding it 5 V destroys cards.
  const supply = peripheralPadLabel(item, powerPad).toUpperCase()
  if (supply === '3V3' || supply === '3V3D' || supply === '3V') return 'v3v3'
  if (supply === 'VIN' || supply === '5V' || supply === '+5V') return 'v5'
  return item.kind === 'sd-card' && !isThreeVoltSd(item) ? 'v5' : 'v3v3'
}

/**
 * Where a part's render actually lands inside its peripheral box. The image
 * uses `preserveAspectRatio="meet"`, so source-space measurements map through
 * this fitted box rather than through the box itself.
 */
function fittedRenderBox(partId: string) {
  const render = partById(partId)?.render
  if (!render) return null
  const sourceAspect = render.widthPx / render.heightPx
  const boxAspect = PERIPHERAL_RENDER_W / PERIPHERAL_RENDER_H
  const width = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W : PERIPHERAL_RENDER_H * sourceAspect
  const height = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W / sourceAspect : PERIPHERAL_RENDER_H
  return {
    width,
    height,
    offsetX: (PERIPHERAL_RENDER_W - width) / 2,
    offsetY: (PERIPHERAL_RENDER_H - height) / 2,
    scale: width / render.widthPx,
  }
}

/** Radius a pad is coloured at when its part has no hole measurement. */
export const DEFAULT_PAD_HOLE_RADIUS = 4

/**
 * Each part's drilled-hole radius in its own render's pixels, measured from the
 * render's transparency (the area-equivalent radius of the see-through hole).
 *
 * A pad is coloured at exactly this size, so the colour fills the hole and the
 * plated ring around it stays visible. One fixed radius for every part painted
 * over the rings of the fine-pitch boards and floated inside the large ones. A
 * part whose header comes fitted (the XC4630 shield) has no open hole, so its
 * figure is the pin tip. Screw terminals take their part's header figure — a
 * marker, not a claim about the screw. Re-measure when a render is replaced.
 */
export const MODULE_PAD_HOLE_RADIUS: Record<string, number> = {
  'inmp441-i2s-microphone': 13,
  'ics-43434-i2s-microphone': 6.4,
  'generic-i2s-mems-microphone': 10.5,
  'sph0645lm4h-i2s-microphone': 9.6,
  'max98357a-i2s-amplifier': 10.5,
  'max98357a-stereo-pair': 5.1,
  'pam8403-3w-stereo-amplifier': 5.6,
  'lr7843-mosfet-module': 12.3,
  'ds3231-rtc-module': 5.9,
  'jaycar-xc9044-rtc-module': 12.3,
  'adafruit-ina219-current-sensor': 7,
  'adafruit-bh1750-light-sensor': 7,
  'max485-rs485-module': 11.9,
  'wiz850io-ethernet-module': 6.2,
  'hlk-ld2410c-presence-sensor': 7.2,
  'pcm5102a-i2s-dac': 11.5,
  'dx-0809-stereo-amplifier': 6.1,
  'pam8610-stereo-amplifier': 4.9,
  'uda1334a-i2s-dac': 5.1,
  'sh1106-oled-128x64': 5.9,
  'sh1106-oled-096-128x64-spi': 6.6,
  'sh1106-oled-128x64-i2c': 6.1,
  'ssd1306-oled-128x64': 6.7,
  'ssd1306-oled-096-128x64-i2c': 6.6,
  'tm1637-4digit-display': 5.6,
  'max7219-8digit-7segment': 4.7,
  'st7789-tft-240x240': 5.9,
  'st7789v-xpt2046-touch-240x320': 7.2,
  'ili9341-xpt2046-touch-320x240': 6,
  'ili9341-xc4630-parallel-touch-320x240': 3,
  'microsd-module-5v': 8.1,
  'microsd-breakout-3v3': 9.6,
}

/** The radius a part's pads are coloured at on the sheet: its hole, scaled like its render. */
export function peripheralPadRadius(item: HardwareManifestItem) {
  const partId = String(item.facts.partId ?? '')
  const radius = MODULE_PAD_HOLE_RADIUS[partId]
  const box = fittedRenderBox(partId)
  return radius === undefined || !box ? DEFAULT_PAD_HOLE_RADIUS : radius * box.scale
}

/**
 * The divider on a 5 V receiver's output, between its RO pad and the
 * controller's RX pin.
 *
 * The MAX485 runs on 5 V and RO swings rail to rail, above an ESP32's 3.6 V
 * pin limit. RO goes through a 1 kΩ series resistor to a junction the RX wire
 * lands on, and a 2 kΩ resistor holds the junction to ground: 5 V × 2/3 =
 * 3.33 V, and 3.5 V at the chip's 5.25 V ceiling. The divider sits to the left
 * of the module, under its own box, because the other three wires rise
 * straight to their pads and a divider under RO would sit across them.
 */
export const DIVIDER_RESISTOR_W = 32
export const DIVIDER_RESISTOR_H = 20
const DIVIDER_GAP = 6

export interface ReceiveDivider {
  /** Index into the item's pins (and so its connections) of the RX wire. */
  signalIndex: number
  roPad: { x: number; y: number }
  /** The height the divider runs at, just below the module's box. */
  y: number
  /** 1 kΩ, RO side: left edge x. */
  seriesX: number
  junction: { x: number; y: number }
  /** 2 kΩ, ground side: left edge x. */
  shuntX: number
  ground: { x: number; y: number }
}

function hasReceiveDivider(item: HardwareManifestItem) {
  return item.kind === 'dmx-input'
}

export function receiveDivider(layout: ItemLayout): ReceiveDivider | null {
  const { item } = layout
  if (!hasReceiveDivider(item)) return null
  const signalIndex = item.pins.findIndex((pin) => pin.propertyKey === 'dmxRxPin')
  const roIndex = padIndexByLabel(item, ['RO'], -1)
  const box = fittedRenderBox(String(item.facts.partId ?? ''))
  if (signalIndex < 0 || roIndex < 0 || !box) return null
  const y = layout.y + PERIPHERAL_RENDER_H + 10
  const seriesX = layout.x + box.offsetX - DIVIDER_GAP - DIVIDER_RESISTOR_W
  const junctionX = seriesX - DIVIDER_GAP
  const shuntX = junctionX - DIVIDER_GAP - DIVIDER_RESISTOR_W
  return {
    signalIndex,
    roPad: peripheralPadPoint(layout, roIndex),
    y,
    seriesX,
    junction: { x: junctionX, y },
    shuntX,
    ground: { x: shuntX - DIVIDER_GAP, y },
  }
}

/**
 * Where a control wire from the controller ends: on its pad, or, for a
 * receiver's RX line, on the divider's junction. The lane allocator and the
 * router both ask this, so a wire's lane is chosen for the point it actually
 * climbs to.
 */
export function peripheralSignalEndPoint(layout: ItemLayout, signalIndex: number) {
  const divider = receiveDivider(layout)
  if (divider && divider.signalIndex === signalIndex) return divider.junction
  return peripheralPadPoint(layout, peripheralSignalPadIndex(layout.item, signalIndex))
}

/**
 * How a control wire climbs to a pad that has another pad directly beneath it.
 *
 * Wires rise from the lanes below a part straight up to their pad. On a module
 * with a header along each long edge (the WIZ850io), a pad in the top row sits
 * over one in the bottom row, so that straight climb runs through the lower
 * pad and the wire reads as landing there instead. Such a wire climbs half a
 * pitch to the side, between the lower pads, then jogs across to its own pad
 * midway between the rows, where the part's picture covers the jog.
 *
 * `null` for every pad with nothing below it, which is every single-row part.
 */
export function peripheralApproach(layout: ItemLayout, signalIndex: number): { x: number; jogY: number } | null {
  if (receiveDivider(layout)?.signalIndex === signalIndex) return null
  const end = peripheralSignalEndPoint(layout, signalIndex)
  const pads = Array.from({ length: peripheralPadCount(layout.item) }, (_, index) => peripheralPadPoint(layout, index))
  const below = pads
    .filter((pad) => Math.abs(pad.x - end.x) < 1.5 && pad.y > end.y + 1.5)
    .sort((a, b) => a.y - b.y)[0]
  if (!below) return null
  const row = pads.filter((pad) => Math.abs(pad.y - below.y) < 1.5 && Math.abs(pad.x - below.x) > 1.5)
  const pitch = row.length > 0 ? Math.min(...row.map((pad) => Math.abs(pad.x - below.x))) : 10
  return { x: end.x - (pitch / 2), jogY: (end.y + below.y) / 2 }
}

export function peripheralPadPoint(layout: ItemLayout, padIndex: number) {
  // Any module with measured geometry uses it, whatever kind it is. Gating this
  // on the audio kinds is why every other part's wires met its picture wherever
  // an even spread happened to land.
  const measuredPartId = String(layout.item.facts.partId ?? '')
  const measured = MODULE_PAD_GEOMETRY[measuredPartId]
  const box = fittedRenderBox(measuredPartId)
  if (measured && box) {
    const [xRatio, yRatio] = measured[Math.min(Math.max(padIndex, 0), measured.length - 1)]
    return {
      x: layout.x + box.offsetX + (xRatio * box.width),
      y: layout.y + box.offsetY + (yRatio * box.height),
    }
  }
  const count = peripheralPadCount(layout.item)
  // The 3- and 5-pad tables are measured against their artwork and share one
  // pitch; anything else (an audio module has 6, 7, 9 or 11 pads) is spaced on
  // that same pitch about the centre. Falling through to the 3-pad table
  // instead clamped every pad past the third onto the third's position, which
  // stacks four wires on one point.
  const ratios = count === 5 ? PAD_X_RATIOS_5
    : count === 3 ? PAD_X_RATIOS_3
    : Array.from({ length: count }, (_, index) => 0.4995 + ((index - (count - 1) / 2) * PAD_PITCH_RATIO))
  const ratio = ratios[Math.min(Math.max(padIndex, 0), ratios.length - 1)]
  return {
    x: layout.x + (ratio * PERIPHERAL_RENDER_W),
    y: layout.y + (PAD_Y_RATIO * PERIPHERAL_RENDER_H),
  }
}

export const OUTPUT_CARD_HEIGHT = 174
/** Compact card used by one-dimensional LED strings and VU-meter rails. */
export const OUTPUT_STRIP_CARD_HEIGHT = 96
/** Room below an LED fixture for the matched TX/RX boards and their link notes. */
export const OUTPUT_DATA_EXTENDER_HEIGHT = 126

export function outputHasDataExtender(item: HardwareManifestItem) {
  const partId = item.facts?.dataLinkPartId
  return typeof partId === 'string' && partId.length > 0
}
/**
 * Each card carries a title and a subtitle above it, so the pitch has to clear
 * the card body *and* those two lines. At the old 212 the second output's title
 * was drawn on the first card's bottom edge.
 */
export const OUTPUT_CARD_LABEL_HEIGHT = 44
export const OUTPUT_CARD_PITCH = OUTPUT_CARD_HEIGHT + OUTPUT_CARD_LABEL_HEIGHT + 14

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
  /*
   * A microphone is an ordinary peripheral.
   *
   * It used to own a slot of its own at the top of the sheet, which bought it
   * one thing — a pad *column*, so each of its three I2S wires got a distinct y
   * for free. No microphone render has a pad column: all three are six-pad rows
   * along the bottom edge, like every other module in this row. Once the pads
   * are read from the measured geometry the bespoke slot buys nothing and costs
   * a second routing scheme, so the module joins the row and inherits the
   * lanes, corridors and descending net stubs that scheme already solves.
   */
  const peripherals = items.filter((item) => item.kind !== 'matrix-output')
  let outputY = 92
  const layouts: ItemLayout[] = outputs.map((item) => {
    const baseHeight = item.facts?.form === 'strip' ? OUTPUT_STRIP_CARD_HEIGHT : OUTPUT_CARD_HEIGHT
    const height = baseHeight + (outputHasDataExtender(item) ? OUTPUT_DATA_EXTENDER_HEIGHT : 0)
    const layout = { item, x: 820, y: outputY, width: 184, height }
    outputY += height + OUTPUT_CARD_LABEL_HEIGHT + 14
    return layout
  })
  const peripheralY = Math.max(500, LEVEL_SHIFTER_Y + (Math.ceil(outputs.length / 4) * (LEVEL_SHIFTER_HEIGHT + LEVEL_SHIFTER_GAP)) + 24)
  // Each row is only as deep as its own lane stack needs, so a lone button
  // does not reserve the space an encoder-heavy row would.
  const rowSignalCounts: number[] = []
  const rowItems: HardwareManifestItem[][] = []
  peripherals.forEach((item, index) => {
    const row = Math.floor(index / PERIPHERALS_PER_ROW)
    rowSignalCounts[row] = (rowSignalCounts[row] ?? 0) + item.pins.length
    rowItems[row] = [...(rowItems[row] ?? []), item]
  })
  const rowHeights = rowSignalCounts.map((count, row) =>
    PERIPHERAL_RENDER_H + peripheralClearance(count, rowItems[row] ?? []))
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

/** Gap below each PSU zone box, and the strip below the last one. */
export const POWER_SECTION_SPACING = 34

export interface PowerZoneBand {
  supplyId: string
  feedCount: number
  /** Top of the zone's band in diagram units. */
  y: number
  /** Band height, including the gap below the zone box. */
  height: number
}

/**
 * Where each PSU zone sits on the full sheet.
 *
 * Printing crops the sheet to one of these bands per page, so this has to stay
 * the single owner of the offsets the renderer walks and the height the sheet
 * reserves — three independent accumulations of the same `+ spacing` would
 * drift the moment one of them changed.
 */
export function powerZoneBands(
  items: HardwareManifestItem[],
  plan: ElectricalPlanSummary,
  layers: DiagramHeightLayers = ALL_HEIGHT_LAYERS,
): PowerZoneBand[] {
  const injections = plan.outputs.flatMap((output) => output.injections)
  let y = powerSectionStartY(items, layers)
  return (plan.totals?.supplies ?? []).map((supply) => {
    const feedCount = injections.filter((injection) => injection.supplyId === supply.id).length
    const height = powerDistributionSectionLayout(feedCount).sectionHeight + POWER_SECTION_SPACING
    const band = { supplyId: supply.id, feedCount, y, height }
    y += height
    return band
  })
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
  // room holds the shared-net callout, which renders on every sheet, plus the
  // legend strip below it — at the old +80 the legend was drawn on top of the
  // callout's own text.
  if (outputCount === 0 || !layers.powerDistribution) {
    return Math.max(400, diagramContentBottom(items, layers)
      + COMMON_NET_CALLOUT_GAP + COMMON_NET_CALLOUT_HEIGHT + DIAGRAM_LEGEND_BAND)
  }
  const bands = powerZoneBands(items, plan, layers)
  const bottom = bands.length > 0
    ? bands[bands.length - 1].y + bands[bands.length - 1].height
    : powerSectionStartY(items, layers)
  return bottom + POWER_SECTION_SPACING
}
