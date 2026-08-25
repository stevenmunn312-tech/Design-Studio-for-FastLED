import type { ElectricalPlanSummary } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'
import { fuseBlockAllocations, type FuseBlockCircuitCount } from '../../build/powerDistribution'
import { partById } from '../../state/partCatalogue'

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
export const COMMON_NET_CALLOUT_HEIGHT = 52
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
const PAD_X_RATIOS_RTC_ZS042 = [0.612, 0.543, 0.474, 0.681]
const PAD_X_RATIOS_RTC_XC9044 = [0.165, 0.337, 0.505, 0.843]
const PAD_X_RATIOS_5 = [0.34, 0.4194, 0.4992, 0.5787, 0.658]
/** The pitch both measured tables above share, for parts with no table yet. */
const PAD_PITCH_RATIO = 0.0797
const PAD_X_RATIOS_SD_5V = [0.24, 0.3475, 0.45, 0.55, 0.6525, 0.755]
const PAD_X_RATIOS_SD_3V3 = [0.135, 0.255, 0.3775, 0.5, 0.6225, 0.745, 0.87]

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

export const MODULE_PAD_GEOMETRY: Record<string, readonly PadPoint[]> = {
  'max98357a-i2s-amplifier': padRow([31.5, 87.5, 143.5, 199.5, 255.5, 311.5, 367.5], 400, 545, 568),
  'pam8403-3w-stereo-amplifier':
    padRow([36, 69, 102, 135, 168, 201, 234, 267, 300, 333, 366], 400, 254, 287),
  'pcm5102a-i2s-dac': padRow([55, 113, 171, 229, 287, 345], 400, 837, 883),
  'uda1334a-i2s-dac':
    padRow([128, 159, 190, 221, 252, 283, 314, 345, 376], 504, 468, 504),

  // Displays. The OLED and TFT headers run along the bottom edge; the
  // MAX7219's runs down its left side, which is the IN end of a part built to
  // be daisy-chained.
  'sh1106-oled-128x64':
    padRow([125.5, 155.5, 186.5, 216.5, 247, 277.5, 308], 434, 391.6, 412),
  'ssd1306-oled-128x64':
    padRow([80, 114.3, 148.6, 182.9, 217.1, 251.4, 285.7, 320], 400, 346.2, 366),
  // A Grove part: four contacts inside a keyed connector rather than pads.
  'tm1637-4digit-display': padRow([210, 240, 270, 300], 512, 252, 296),
  'max7219-8digit-7segment': padColumn(17.5, 992, [33, 63, 93.5, 124, 153], 188),
  'st7789-tft-240x240':
    padRow([50.5, 81.5, 111.5, 142.5, 172.5, 203.5, 234, 264.5, 295, 325.5, 355.5, 386], 438, 416.6, 438),
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
const POWER_PAD_LABELS = ['VIN', '+5V', '5V', 'VCC', '3V3', '3V', 'V+']
const GROUND_PAD_LABELS = ['GND', 'G', '0V']

function padIndexByLabel(item: HardwareManifestItem, wanted: readonly string[], fallback: number) {
  const pads = peripheralPads(item).map((label) => label.toUpperCase())
  const index = pads.findIndex((label) => wanted.includes(label))
  return index >= 0 ? index : fallback
}

export function peripheralPowerPadIndex(item: HardwareManifestItem) {
  return padIndexByLabel(item, POWER_PAD_LABELS, 0)
}

export function peripheralGroundPadIndex(item: HardwareManifestItem) {
  return padIndexByLabel(item, GROUND_PAD_LABELS, peripheralPadCount(item) - 1)
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
    // The manifest pushes BCLK, LRC, DOUT (or the two DAC line-in pins); find
    // each on the module by the name it is silkscreened with.
    const pads = audioModulePads(item).map((label) => label.toUpperCase())
    const wanted = item.facts.input === 'analog'
      ? [['LIN'], ['RIN']]
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
  const wanted = SIGNAL_PAD_NAMES[item.kind]?.[signalIndex]
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
  'info-display': [['CS'], ['DC'], ['RES', 'RST', 'RESET'], ['CLK', 'SCK', 'D0'], ['MOSI', 'DATA', 'DIN', 'D1']],
  'segment-display': [['CLK', 'SCK'], ['DIO', 'DIN', 'DATA'], ['CS', 'LOAD']],
  'rtc-input': [['SDA'], ['SCL']],
  'motion-input': [['OUT', 'SIG']],
  'light-input': [['S', 'SIG', 'OUT', 'AO', 'DO']],
  'button-input': [['SIG']],
  'pot-input': [['SIG']],
  'encoder-input': [['A'], ['B'], ['SW']],
}

export function peripheralPowerNet(item: HardwareManifestItem): 'v3v3' | 'v5' {
  // Audio modules take the 5 V rail: a class-D amp's output power comes from
  // its supply, and 3.3 V would make it quiet rather than broken — the kind of
  // wrong that reads as a bad speaker.
  if (item.kind === 'amplifier' || item.kind === 'line-input') return 'v5'
  // A module whose supply pad is printed 3V3 or 3V is asking for that rail;
  // one printed VIN or 5V is asking for the other. The bare 3.3 V microSD
  // breakout is the case that made this matter — feeding it 5 V destroys cards.
  const supply = peripheralPadLabel(item, peripheralPowerPadIndex(item)).toUpperCase()
  if (supply === '3V3' || supply === '3V') return 'v3v3'
  if (supply === 'VIN' || supply === '5V' || supply === '+5V') return 'v5'
  return item.kind === 'sd-card' && !isThreeVoltSd(item) ? 'v5' : 'v3v3'
}

export function peripheralPadPoint(layout: ItemLayout, padIndex: number) {
  // Any module with measured geometry uses it, whatever kind it is. Gating this
  // on the audio kinds is why every other part's wires met its picture wherever
  // an even spread happened to land.
  const measuredPartId = String(layout.item.facts.partId ?? '')
  const measured = MODULE_PAD_GEOMETRY[measuredPartId]
  const measuredEntry = partById(measuredPartId)
  if (measured && measuredEntry?.render) {
    // The image uses `preserveAspectRatio="meet"`; derive the same fitted box
    // before mapping source-space pad measurements into the diagram.
    const sourceAspect = measuredEntry.render.widthPx / measuredEntry.render.heightPx
    const boxAspect = PERIPHERAL_RENDER_W / PERIPHERAL_RENDER_H
    const renderWidth = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W : PERIPHERAL_RENDER_H * sourceAspect
    const renderHeight = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W / sourceAspect : PERIPHERAL_RENDER_H
    const offsetX = (PERIPHERAL_RENDER_W - renderWidth) / 2
    const offsetY = (PERIPHERAL_RENDER_H - renderHeight) / 2
    const [xRatio, yRatio] = measured[Math.min(Math.max(padIndex, 0), measured.length - 1)]
    return {
      x: layout.x + offsetX + (xRatio * renderWidth),
      y: layout.y + offsetY + (yRatio * renderHeight),
    }
  }
  if (layout.item.kind === 'rtc-input') {
    const compact = layout.item.facts.partId === 'jaycar-xc9044-rtc-module'
    const ratios = compact ? PAD_X_RATIOS_RTC_XC9044 : PAD_X_RATIOS_RTC_ZS042
    const sourceAspect = compact ? 1 : 464 / 272
    const sourceYRatio = compact ? 0.855 : 0.886
    const boxAspect = PERIPHERAL_RENDER_W / PERIPHERAL_RENDER_H
    const renderWidth = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W : PERIPHERAL_RENDER_H * sourceAspect
    const renderHeight = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W / sourceAspect : PERIPHERAL_RENDER_H
    const offsetX = (PERIPHERAL_RENDER_W - renderWidth) / 2
    const offsetY = (PERIPHERAL_RENDER_H - renderHeight) / 2
    const ratio = ratios[Math.min(Math.max(padIndex, 0), ratios.length - 1)]
    return {
      x: layout.x + offsetX + (ratio * renderWidth),
      y: layout.y + offsetY + (sourceYRatio * renderHeight),
    }
  }
  if (layout.item.kind === 'sd-card') {
    const ratios = isThreeVoltSd(layout.item) ? PAD_X_RATIOS_SD_3V3 : PAD_X_RATIOS_SD_5V
    const sourceAspect = 400 / 690
    const renderWidth = PERIPHERAL_RENDER_H * sourceAspect
    const offsetX = (PERIPHERAL_RENDER_W - renderWidth) / 2
    const ratio = ratios[Math.min(Math.max(padIndex, 0), ratios.length - 1)]
    return {
      x: layout.x + offsetX + (ratio * renderWidth),
      y: layout.y + (0.948 * PERIPHERAL_RENDER_H),
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
  const peripherals = items.filter((item) => item.kind !== 'matrix-output' && item.kind !== 'mic-input')
  const layouts: ItemLayout[] = outputs.map((item, index) => ({
    item,
    x: 820,
    y: 92 + (index * OUTPUT_CARD_PITCH),
    width: 184,
    height: OUTPUT_CARD_HEIGHT,
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
