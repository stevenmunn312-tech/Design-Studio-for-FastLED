import type { ElectricalPlanSummary } from '../../build/power/electricalPlan'
import { POWER_PATH_KINDS, type HardwareManifestItem } from '../../build/hardwareManifest'
import { fuseBlockAllocations, type FuseBlockCircuitCount } from '../../build/power/powerDistribution'
import { partById, partPinLabelForProperty, sharedPadsAcrossBoards } from '../../build/parts/partCatalogue'
import { keypadSpec } from '../../state/peripherals/keypad'
import { CONVERTER_SHEET_WIDTH } from './controllerGeometry'
import { oledTransportFor, type OledTransport } from '../../state/displays/oledSurface'
import { receiveDividerSource } from '../../build/pins/receiveDivider'

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

/** Vertical pitch of the ground comb that fans out below each fuse block. */
export const GROUND_COMB_STEP = 8
/** Vertical pitch of the feed comb that fans out below the fuse block stack. */
export const FEED_COMB_STEP = 9
/** Clearance kept between a fuse block and the ground comb lanes below it. */
const GROUND_COMB_CLEARANCE = 12
/** How far the +5 V trunk lane sits above the block it drops into. */
const POSITIVE_LANE_CLEARANCE = 12
/** Gap between one block's last ground comb lane and the next block's +5 V lane. */
const BLOCK_STACK_GAP = 22
/**
 * Height of the first block's +5 V trunk lane. It is level with the PSU +V
 * terminal (PSU top at 112, clear of the three header rows), so that run is
 * one straight line before it drops into the block.
 */
const FIRST_POSITIVE_LANE_Y = 112 + 64
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
 * column and drop around the block into the comb below the stack.
 */
export function fuseColumnSplit(assignedFeedCount: number) {
  const rightCount = Math.ceil(assignedFeedCount / 2)
  return { rightCount, leftCount: assignedFeedCount - rightCount }
}

/**
 * Which circuit a feed lands on, given its index within its own block. The
 * block is drawn turned half a turn (+ stud at the top), so the printed odd
 * circuits (1, 3, ...) sit in the right column and the even ones in the left,
 * both numbered bottom to top. Right-column
 * feeds fill from the top down and left-column feeds from the bottom up, so
 * no two runs out of a column cross: each later feed leaves further out.
 */
export function fuseSlotForFeed(localIndex: number, assignedFeedCount: number, circuitCount: FuseBlockCircuitCount) {
  const rows = circuitCount / 2
  const { rightCount } = fuseColumnSplit(assignedFeedCount)
  const isRightColumn = localIndex < rightCount
  const columnRank = isRightColumn ? localIndex : localIndex - rightCount
  const slot = isRightColumn ? (rows - 1 - columnRank) * 2 : (columnRank * 2) + 1
  return { slot, isRightColumn, columnRank }
}

const FUSE_BLOCK_MODEL_WIDTH = 5.8
/**
 * Fuse caps measured off the renders, in model units: centre offset from the
 * block's centre line, drop below the circuit's screw on the unturned render,
 * and a box a little larger than the red cap. The 2-circuit block carries
 * larger fuses that sit slightly below their screws.
 */
const FUSE_CAP_GEOMETRY = {
  wide: { offsetX: 1.25, offsetY: 0.108, width: 0.98, height: 1.4 },
  standard: { offsetX: 1.115, offsetY: 0, width: 0.86, height: 1.2 },
}

/**
 * Map the plan-view Blender model coordinates into the fixed SVG image cell.
 * The Cycles renders use a 15% orthographic perimeter, so these points land on
 * the visible screw heads for every supported fixed block size.
 *
 * The block is drawn turned half a turn about its centre (`FUSE_BLOCK_ROTATION`),
 * so the + stud sits at the top and the negative bus along the bottom. That
 * puts the block's terminals in the same order as the PSU's (+V above -V), so
 * both trunks leave their studs straight out instead of crossing the block.
 */
export const FUSE_BLOCK_ROTATION = 180

export function fuseBlockPoints(circuitCount: FuseBlockCircuitCount, x: number, y: number) {
  const rows = circuitCount / 2
  const modelHeight = 3.45 + (rows * 1.72)
  const scale = Math.min(
    FUSE_BLOCK_CELL_WIDTH / (FUSE_BLOCK_MODEL_WIDTH * 1.15),
    FUSE_BLOCK_CELL_HEIGHT / (modelHeight * 1.15),
  )
  const centreX = x + (FUSE_BLOCK_CELL_WIDTH / 2)
  const centreY = y + (FUSE_BLOCK_CELL_HEIGHT / 2)
  // Offsets are measured on the unturned render; the half turn negates both.
  const at = (dx: number, dy: number) => ({ x: centreX - dx, y: centreY - dy })
  return {
    positive: at(0, (modelHeight / 2 - 0.47) * scale),
    ground: at(0, -(modelHeight / 2 - 0.38) * scale),
    /** Negative bus screws, numbered right to left once the block is turned. */
    groundCircuit(screw: number) {
      const modelX = -2 + ((4 * screw) / (circuitCount - 1))
      const busY = (modelHeight / 2) - 1.05
      return at(modelX * scale, -busY * scale)
    },
    /** Circuit `slot + 1` as printed on the block. */
    circuit(slot: number) {
      const rowFromTop = Math.floor(slot / 2)
      const column = slot % 2
      const modelY = (-modelHeight / 2) + 1.62 + ((rows - rowFromTop - 1) * 1.72)
      return at((column === 0 ? -2.22 : 2.22) * scale, -modelY * scale)
    },
    /**
     * Circuit `slot + 1`'s fuse cap: the box it occupies on the turned block,
     * and where the same cap sits on the unturned render. Drawing the
     * unturned cap into that box keeps its printed number upright.
     */
    fuseCap(slot: number) {
      const cap = circuitCount === 2 ? FUSE_CAP_GEOMETRY.wide : FUSE_CAP_GEOMETRY.standard
      const rowFromTop = Math.floor(slot / 2)
      const side = slot % 2 === 0 ? -1 : 1
      const modelY = (-modelHeight / 2) + 1.62 + ((rows - rowFromTop - 1) * 1.72)
      const dx = side * cap.offsetX * scale
      const dy = (-modelY + cap.offsetY) * scale
      return {
        turned: at(dx, dy),
        unturned: { x: centreX + dx, y: centreY + dy },
        width: cap.width * scale,
        height: cap.height * scale,
      }
    },
  }
}

/**
 * Comb lane a feed's ground return takes below its own block. Feed 0 uses the
 * rightmost bus screw and the top lane; each later feed one screw further
 * left and one lane lower, so the returns never cross one another.
 */
export function groundCombLaneY(blockTop: number, localIndex: number) {
  return blockTop + FUSE_BLOCK_CELL_HEIGHT + GROUND_COMB_CLEARANCE + (localIndex * GROUND_COMB_STEP)
}

/**
 * Height the ground trunk crosses a block at: the clear band between the
 * + stud and the top fuse row. From there it drops the gutter between the two
 * screw columns onto the - stud, so nothing runs under the block to cross
 * the ground comb or the left-column feeds.
 */
export function groundEntryY(circuitCount: FuseBlockCircuitCount, blockTop: number) {
  const points = fuseBlockPoints(circuitCount, FUSE_BLOCK_START_X, blockTop)
  const topRightCircuit = points.circuit(circuitCount - 2)
  // The band is narrow: the stud's nut ends about 0.3 and the top fuse caps
  // start about 0.6 of the way down to the top screw row. 0.39 keeps the
  // trunk clear of the nut and only grazes the caps on the smallest blocks.
  return Math.round(points.positive.y + ((topRightCircuit.y - points.positive.y) * 0.39))
}

/** Comb lane a left-column feed takes below the block stack. */
export function feedCombLaneY(feedCombY: number, leftColumnRank: number) {
  return feedCombY + (leftColumnRank * FEED_COMB_STEP)
}

/** Inverse of {@link fuseSlotForFeed}: which feed sits on a circuit, if any. */
export function feedIndexForFuseSlot(slot: number, assignedFeedCount: number, circuitCount: FuseBlockCircuitCount) {
  const rows = circuitCount / 2
  const { rightCount, leftCount } = fuseColumnSplit(assignedFeedCount)
  const isRightColumn = slot % 2 === 0
  const columnRank = isRightColumn ? rows - 1 - (slot / 2) : (slot - 1) / 2
  if (isRightColumn) return columnRank < rightCount ? columnRank : -1
  return columnRank < leftCount ? rightCount + columnRank : -1
}

export function powerDistributionSectionLayout(feedCount: number) {
  const blocks = fuseBlockAllocations(feedCount)
  // Blocks stack vertically at one x, which keeps the whole width right of the
  // block clear for the feed lanes no matter how many blocks a zone needs.
  // Each block stacks as: +5 V trunk lane, the block, then its ground comb.
  // The first lane sits clear of the header rows.
  const positiveLaneYs: number[] = []
  const blockTops: number[] = []
  const groundEntryYs: number[] = []
  const groundCombBottoms: number[] = []
  let cursor = FIRST_POSITIVE_LANE_Y
  let leftColumnFeeds = 0
  for (const block of blocks) {
    positiveLaneYs.push(cursor)
    const top = cursor + POSITIVE_LANE_CLEARANCE
    blockTops.push(top)
    groundEntryYs.push(groundEntryY(block.circuitCount, top))
    const combBottom = groundCombLaneY(top, Math.max(0, block.assignedFeedCount - 1))
    groundCombBottoms.push(combBottom)
    cursor = combBottom + BLOCK_STACK_GAP
    leftColumnFeeds += fuseColumnSplit(block.assignedFeedCount).leftCount
  }
  const fuseBlockY = blockTops[0] ?? FIRST_POSITIVE_LANE_Y + POSITIVE_LANE_CLEARANCE
  const blocksBottom = groundCombBottoms[groundCombBottoms.length - 1] ?? fuseBlockY + FUSE_BLOCK_CELL_HEIGHT
  const feedCombY = blocksBottom + FEED_COMB_CLEARANCE
  const feedCombBottom = feedCombY + (Math.max(0, leftColumnFeeds - 1) * FEED_COMB_STEP)

  const firstBlock = blocks[0]
  // The PSU hangs off the first +5 V lane, so that trunk is one straight run.
  const psuY = (positiveLaneYs[0] ?? FIRST_POSITIVE_LANE_Y) - PSU_POSITIVE_TERMINAL_OFFSET
  const componentBottom = Math.max(psuY + PSU_RENDER_HEIGHT, blocksBottom)

  // Rows start below the first block's ground comb, because every ground
  // return drops out of the comb under its block. The floor keeps the first
  // left-column feed below the comb it crosses under the stack in, so no
  // branch ever has to climb back up.
  const firstGroundCombBottom = groundCombBottoms[0] ?? componentBottom
  const leftColumnStart = firstBlock ? fuseColumnSplit(firstBlock.assignedFeedCount).rightCount : 0
  const leftColumnFloor = firstBlock && leftColumnStart < firstBlock.assignedFeedCount
    ? feedCombBottom + 24 - (leftColumnStart * POWER_BRANCH_ROW_SPACING)
    : 0
  const firstBranchY = Math.max(firstGroundCombBottom + 24, leftColumnFloor)
  const branchBottom = firstBranchY + (Math.max(0, feedCount - 1) * POWER_BRANCH_ROW_SPACING) + 64

  // The fuse schedule drops into the space the PSU and combs leave clear on the
  // left, well inside the lane band the feeds start at.
  const scheduleY = Math.max(componentBottom, feedCombBottom) + 34
  const scheduleBottom = scheduleY + (blocks.reduce((lines, block) => lines + Math.ceil(block.circuitCount / 6), 0) * 18)
  return {
    blockCount: blocks.length,
    blockTops,
    positiveLaneYs,
    groundEntryYs,
    blocksBottom,
    feedCombY,
    firstBranchY,
    scheduleY,
    psuY,
    fuseBlockY,
    sectionHeight: Math.max(componentBottom, scheduleBottom, branchBottom) + 30,
  }
}

/**
 * The box every peripheral render is fitted into. The control-module renders
 * (button / potentiometer / encoder) share one board artwork; see
 * `BUNDLED_RENDER_PX` for where its pads are.
 */
export const PERIPHERAL_RENDER_W = 220
/** 220 x (598/828), the aspect of the control-module crop this box was sized for. */
export const PERIPHERAL_RENDER_H = 159
/**
 * Air between part pictures. Wide enough that a two-line title, centred on
 * its picture, still clears the title in the next column. The pictures stay
 * 220 wide; only the slot grows.
 */
export const PERIPHERAL_GAP = 46

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
    + (rowItems.some((item) => hasReceiveDivider(item) || hasDataPullUp(item)) ? RECEIVE_DIVIDER_DROP : 0)
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
 * The bundled button, potentiometer and encoder renders: one 1024 x 1024
 * board artwork whose header is centred along the bottom on a 66.1 px pitch.
 * Hole centres are the centroids of the render's see-through holes. Re-measure
 * if the renders are replaced: the last replacement kept ratios measured on the
 * old 828 x 598 crop, and every wire stopped below the board, off its hole.
 */
const BUNDLED_RENDER_PX = 1024
const BUNDLED_PAD_Y_PX = 742.7
const BUNDLED_PAD_CENTRE_X_PX = 511.5
const BUNDLED_PAD_PITCH_PX = 66.1
/** Area-equivalent radius of those holes. */
const BUNDLED_PAD_HOLE_RADIUS_PX = 10.4

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
 * The points live on each part's manifest as `pads` (render pixels, in
 * `pinLabelsLeftToRight` order); this file only turns them into fractions.
 *
 * Figures come from scanning each render for its gold plating (or, on the
 * Grove TM1637, its connector body) and were checked by drawing the result back
 * over the picture. Re-measure if a render is replaced.
 */
type PadPoint = readonly [x: number, y: number]

const padPointCache = new WeakMap<object, readonly PadPoint[]>()

/**
 * A part's pad points as fractions of its render, from the pixel points its
 * manifest carries (`pads`), or `undefined` for a part with none.
 */
export function modulePadGeometry(partId: string): readonly PadPoint[] | undefined {
  const entry = partById(partId)
  const render = entry?.render
  if (!entry?.pads?.length || !render) return undefined
  let points = padPointCache.get(entry)
  if (!points) {
    points = entry.pads.map((pad) => [pad.xPx / render.widthPx, pad.yPx / render.heightPx] as PadPoint)
    padPointCache.set(entry, points)
  }
  return points
}

/**
 * Pads sit ~18px above the board edge at render scale, so a stub needs a lead
 * long enough to put its symbol clear of the artwork rather than on top of it.
 */
export const PERIPHERAL_STUB_LEAD = 26

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

/** Resolve the physical line source by identity, including when labels repeat. */
export function amplifierSourceItem(item: HardwareManifestItem, items: HardwareManifestItem[]) {
  if (item.facts.stage !== 'power' || !['dac', 'dfPlayer'].includes(String(item.facts.feed))) return undefined
  if (typeof item.facts.fedByNodeId !== 'string') return undefined
  return items.find((source) => source.sourceNodeId === item.facts.fedByNodeId && source !== item)
}

export function analogAudioPads(item: HardwareManifestItem, direction: 'in' | 'out') {
  const labels = peripheralPads(item).map((label) => label.toUpperCase())
  const names = direction === 'in'
    ? [['LIN', 'INL', 'AUX-L'], ['RIN', 'INR', 'AUX-R'], ['AUX-GND', 'AGND', 'GND']]
    : [['LOUT', 'DAC_L'], ['ROUT', 'DAC_R'], ['AGND', 'GND']]
  const pads = names.map((aliases) => aliases.map((label) => labels.indexOf(label)).find((index) => index >= 0) ?? -1)
  if (pads[2] >= 0 && labels[pads[2]] === 'GND') {
    const signalGround = labels.findIndex((label, index) => label === 'GND'
      && index > Math.min(pads[0], pads[1]) && index < Math.max(pads[0], pads[1]))
    if (signalGround >= 0) pads[2] = signalGround
  }
  return pads.every((index) => index >= 0) ? pads : null
}

/** Supply and ground, found by the name printed beside the pad. */
// `+` and `VS` join the list for the IR receivers: a KY-022 prints its
// supply as a bare plus, and Vishay's datasheet names the pin VS.
// `+12V` is the supply terminal on the large analog power amplifiers, and
// `3V3D` the WIZ850io's digital 3.3 V supply, and `3.3V` the MIDI FeatherWing's.
const POWER_PAD_LABELS = ['VIN', '+5V', '5V', 'VCC', 'VDD', 'VS', '3V3', '3V3D', '3.3V', '3V', 'V+', '+', '+12V']
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
 * takes no supply from the controller. A power switch never does: the
 * LR7843's optocoupler lights from the signal itself, and the Mosfetti runs
 * from the load supply on its own terminal. Its header brings out only the
 * channel inputs and GND, and falling back to pad 0 drew a VCC wire onto the
 * LR7843's GND.
 */
/**
 * Whether the module has a ground pad to draw. A membrane keypad is a passive
 * switch matrix: it has no supply and no ground, only its eight matrix lines.
 */
export function peripheralHasGround(item: HardwareManifestItem): boolean {
  return item.kind !== 'keypad-input'
}

export function peripheralPowerPadIndex(item: HardwareManifestItem): number | null {
  const entry = partById(String(item.facts.partId ?? ''))
  // A part that takes no supply from the controller has no pad to draw: a
  // power switch lights its optocoupler from the signal itself, a buzzer runs
  // from its signal pin, a membrane keypad is a passive matrix, and a bare
  // encoder is three switch contacts.
  if (entry?.supplyRail === 'none') return null
  // The part names its supply pad when the usual names would pick another: the
  // RCWL-0516 prints 3V3 as well as VIN, but 3V3 is its regulator's output.
  if (entry?.powerPadLabel) {
    const named = padIndexByLabel(item, [entry.powerPadLabel.toUpperCase()], -1)
    if (named >= 0) return named
  }
  return padIndexByLabel(item, POWER_PAD_LABELS, 0)
}

/**
 * The ground pad its stub is drawn from. A module printing GND more than once
 * gives the lowest one on its render, because the stub hangs downwards: on the
 * WIZ850io the first GND is on the top header, where the stub and its label
 * would sit under the module's own picture.
 */
export function peripheralGroundPadIndex(item: HardwareManifestItem) {
  const pads = peripheralPads(item)
  const firstGround = pads.findIndex(isGroundPad)
  const first = firstGround >= 0 ? firstGround : peripheralPadCount(item) - 1
  const measured = modulePadGeometry(String(item.facts.partId ?? ''))
  if (!measured) return first
  const grounds = pads
    .map((label, index) => ({ index, ground: isGroundPad(label) }))
    .filter((pad) => pad.ground && measured[pad.index])
  return grounds.reduce((lowest, pad) =>
    measured[pad.index][1] > measured[lowest][1] ? pad.index : lowest, first)
}

/** A numbered ground (GND1) is one channel's own return, not the board's shared ground. */
const CHANNEL_GROUND = /^GND\d+$/

function isGroundPad(label: string) {
  const name = padName(label)
  return GROUND_PAD_LABELS.includes(name) || CHANNEL_GROUND.test(name)
}

/**
 * Ground pads that need a wire of their own beside the one the ground stub
 * hangs from. A board printing GND1 to GND4 returns each channel separately
 * (each YYNMOS-4 input is one optocoupler's LED), so a channel whose GND is
 * left off never switches. A board repeating a plain GND joins them itself,
 * and its one stub is enough.
 */
export function peripheralChannelGroundPadIndexes(item: HardwareManifestItem): number[] {
  if (!peripheralHasGround(item)) return []
  const primary = peripheralGroundPadIndex(item)
  return peripheralPads(item).flatMap((label, index) =>
    index !== primary && CHANNEL_GROUND.test(padName(label)) ? [index] : [])
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
      : item.facts.stage === 'player'
        ? [['TX'], ['RX'], ['BUSY']]
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
  // The generic sensors are catalogue parts: the silkscreen word is whatever the part
  // prints, so match the usual ones. A part that prints another is matched by its
  // catalogue pin labels before this list is read.
  'digital-sensor-input': [['OUT', 'SIG', 'S', 'DO', 'D0', 'DATA', 'SIGNAL']],
  'analog-sensor-input': [['AO', 'AOUT', 'A0', 'SIG', 'S', 'OUT', 'SIGNAL']],
  // A KY-022 prints S, a bare Vishay receiver's datasheet names it OUT.
  'ir-input': [['S', 'OUT', 'SIG', 'DAT']],
  'light-input': [['S', 'SIG', 'OUT', 'AO', 'DO']],
  'button-input': [['SIG']],
  'touch-button-input': [['SIG']],
  'pot-input': [['SIG']],
  'encoder-input': [['A'], ['B'], ['SW']],
  'relay-output': Array.from({ length: 8 }, (_, index) => [`IN${index + 1}`]),
  // The LR7843 board prints PWM for its one input; other builds print IN or
  // SIG. A board with printed channel letters (the Mosfetti's A to D) is
  // matched by those through the catalogue before this list is read.
  'power-switch-output': [['PWM', 'IN', 'SIG']],
  'buzzer-output': [['SIG', 'S', 'SIGNAL']],
  'cooling-fan-output': [['PWM'], ['RPM', 'TACH', 'TACHO']],
  'pwm-driver-output': [['SDA'], ['SCL']],
  'darlington-driver-output': ['1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B'].map((name) => [name]),
  'power-monitor-input': [['SDA'], ['SCL']],
  'environment-input': [['SDI'], ['SCK']],
  'temperature-input': [['DATA']],
  'distance-input': [['Trig', 'TRIG'], ['Echo', 'ECHO']],
  'joystick-input': [['VRX'], ['VRY'], ['SW']],
  'keypad-input': [['R1'], ['R2'], ['R3'], ['R4'], ['C1'], ['C2'], ['C3'], ['C4']],
  'motion-vector-input': [['SDA'], ['SCL']],
  'touch-pad-input': [['SDA'], ['SCL']],
  // The board's RX reads the sensor's TX pad.
  'presence-input': [['TX']],
  // The manifest pushes TX, RX, enable: TX drives the transceiver's DI, RX
  // reads its RO, and the enable line lands on DE (RE is bridged to it).
  'dmx-input': [['DI'], ['RO'], ['DE']],
  // The wing's optocoupler output, named for the Feather RX it feeds.
  'midi-input': [['MIDI_RX']],
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
  // A keypad's pads are the rows then the columns, named as its part prints them.
  if (item.kind === 'keypad-input') {
    const keypad = keypadSpec(item.facts.partId)
    if (keypad) return [...keypad.rowLabels, ...keypad.columnLabels].map((label) => [label])
  }
  if (item.kind === 'info-display') {
    const transport = oledTransportFor(partById(String(item.facts.partId ?? ''))?.display?.interface)
    return OLED_PAD_NAMES[transport]
  }
  // A light sensor is either an LDR's one analog line or a BH1750's I2C pair,
  // and the manifest records which.
  if (item.kind === 'light-input' && item.facts.transport === 'i2c') return [['SDA'], ['SCL']]
  if (item.kind === 'distance-input' && item.facts.transport === 'i2c') {
    const pads: string[][] = [['SDA'], ['SCL']]
    if (item.pins.some((pin) => pin.propertyKey === 'xshutPin')) pads.push(['SHDN', 'XSHUT'])
    return pads
  }
  return SIGNAL_PAD_NAMES[item.kind]
}

const OLED_PAD_NAMES: Record<OledTransport, string[][]> = {
  spi: [['CS'], ['DC'], ['RES', 'RST', 'RESET'], ['CLK', 'SCK', 'D0'], ['MOSI', 'DATA', 'DIN', 'D1']],
  i2c: [['SDA', 'DATA', 'DIN', 'D1'], ['SCL', 'CLK', 'SCK', 'D0']],
}

export function peripheralPowerNet(item: HardwareManifestItem): 'v3v3' | 'v5' | 'v12' | null {
  const powerPad = peripheralPowerPadIndex(item)
  if (powerPad === null) return null
  // The part says which rail feeds it. A module whose supply pad drives bus
  // pull-ups (an INA219, a BH1750, a PCA9685) is held to the logic rail by its
  // own manifest rather than by a rule per kind here.
  const rail = partById(String(item.facts.partId ?? ''))?.supplyRail
  if (rail && rail !== 'none') return rail
  // A part with no rail but a declared supply voltage (a generic sensor): 4.5 V
  // and over takes the 5 V rail; anything lower keeps its signal at logic level.
  const volts = item.facts.supplyVoltage
  if (typeof volts === 'number') return volts >= 4.5 ? 'v5' : 'v3v3'
  // A part that does not say: a supply pad printed 3V3 or 3V is asking for that
  // rail; one printed VIN or 5V is asking for the other. The bare 3.3 V microSD
  // breakout is the case that made this matter - feeding it 5 V destroys cards.
  const supply = peripheralPadLabel(item, powerPad).toUpperCase()
  if (supply === '3V3' || supply === '3V3D' || supply === '3.3V' || supply === '3V') return 'v3v3'
  if (supply === 'VIN' || supply === '5V' || supply === '+5V') return 'v5'
  return 'v3v3'
}

/**
 * Where a part's render actually lands inside its peripheral box. The image
 * uses `preserveAspectRatio="meet"`, so source-space measurements map through
 * this fitted box rather than through the box itself.
 */
function fittedRenderBox(partId: string) {
  const render = partById(partId)?.render
  return render ? fitRenderBox(render.widthPx, render.heightPx) : null
}

/** The same fit for a render of the given source size. */
function fitRenderBox(widthPx: number, heightPx: number) {
  const sourceAspect = widthPx / heightPx
  const boxAspect = PERIPHERAL_RENDER_W / PERIPHERAL_RENDER_H
  const width = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W : PERIPHERAL_RENDER_H * sourceAspect
  const height = sourceAspect > boxAspect ? PERIPHERAL_RENDER_W / sourceAspect : PERIPHERAL_RENDER_H
  return {
    width,
    height,
    offsetX: (PERIPHERAL_RENDER_W - width) / 2,
    offsetY: (PERIPHERAL_RENDER_H - height) / 2,
    scale: width / widthPx,
  }
}

/** Radius a pad is coloured at when its part has no hole measurement. */
export const DEFAULT_PAD_HOLE_RADIUS = 4

/**
 * A part's drilled-hole radius is `padHoleRadiusPx` on its manifest, in its own
 * render's pixels, measured from the render's transparency (the area-equivalent
 * radius of the see-through hole).
 *
 * A pad is coloured at exactly this size, so the colour fills the hole and the
 * plated ring around it stays visible. One fixed radius for every part painted
 * over the rings of the fine-pitch boards and floated inside the large ones. A
 * part whose header comes fitted (the XC4630 shield) has no open hole, so its
 * figure is the pin tip. Screw terminals take their part's header figure - a
 * marker, not a claim about the screw. Re-measure when a render is replaced.
 */

/** The radius a part's pads are coloured at on the sheet: its hole, scaled like its render. */
export function peripheralPadRadius(item: HardwareManifestItem) {
  const partId = String(item.facts.partId ?? '')
  if (!partById(partId)?.render) {
    return BUNDLED_PAD_HOLE_RADIUS_PX * fitRenderBox(BUNDLED_RENDER_PX, BUNDLED_RENDER_PX).scale
  }
  const radius = partById(partId)?.padHoleRadiusPx
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

/**
 * Which 5 V outputs get the divider: the wire's property, and the pad it leaves.
 * A MAX485's RO and an HC-SR04's Echo both swing to 5 V into a 3.3 V pin.
 */
function hasReceiveDivider(item: HardwareManifestItem) {
  return receiveDividerSource(item.kind, item.facts.partId, item.facts.transport) !== null
}

export function receiveDivider(layout: ItemLayout): ReceiveDivider | null {
  const { item } = layout
  if (!hasReceiveDivider(item)) return null
  const source = receiveDividerSource(item.kind, item.facts.partId, item.facts.transport)!
  const signalIndex = item.pins.findIndex((pin) => pin.propertyKey === source.propertyKey)
  const roIndex = padIndexByLabel(item, source.pads, -1)
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
 * The pull-up on a bare 1-Wire probe's DATA line, between its yellow wire and
 * the 3.3 V rail.
 *
 * The probe has no pull-up of its own. The resistor sits under the probe, to
 * the right of the DATA pad (the probe's last wire, so it crosses no supply
 * stub), and DATA's controller wire ends on the junction above it. Its far end
 * takes the 3.3 V symbol.
 */
export interface DataPullUp {
  signalIndex: number
  dataPad: { x: number; y: number }
  /** The height the resistor runs at, just below the probe's box. */
  y: number
  junction: { x: number; y: number }
  /** Left edge of the resistor picture. */
  resistorX: number
  supply: { x: number; y: number }
}

function hasDataPullUp(item: HardwareManifestItem) {
  return item.kind === 'temperature-input'
}

export function dataPullUp(layout: ItemLayout): DataPullUp | null {
  const { item } = layout
  if (!hasDataPullUp(item)) return null
  const signalIndex = item.pins.findIndex((pin) => pin.propertyKey === 'pin')
  const dataIndex = padIndexByLabel(item, ['DATA'], -1)
  if (signalIndex < 0 || dataIndex < 0) return null
  const dataPad = peripheralPadPoint(layout, dataIndex)
  const y = layout.y + PERIPHERAL_RENDER_H + 10
  const resistorX = dataPad.x + DIVIDER_GAP
  return {
    signalIndex,
    dataPad,
    y,
    junction: { x: dataPad.x, y },
    resistorX,
    supply: { x: resistorX + DIVIDER_RESISTOR_W + DIVIDER_GAP, y },
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
  const pullUp = dataPullUp(layout)
  if (pullUp && pullUp.signalIndex === signalIndex) return pullUp.junction
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
 * A leg hidden under the part's body takes `peripheralRearRoute` instead.
 */
export function peripheralApproach(layout: ItemLayout, signalIndex: number): { x: number; jogY: number } | null {
  if (receiveDivider(layout)?.signalIndex === signalIndex) return null
  if (dataPullUp(layout)?.signalIndex === signalIndex) return null
  // A leg under the part's own body is reached around the back instead: the
  // climb runs beside the picture and the jog crosses over its top.
  const rear = peripheralRearRoute(layout, peripheralSignalPadIndex(layout.item, signalIndex))
  if (rear) return { x: rear.x, jogY: rear.overY }
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

/**
 * Bare parts, whose far row of legs sits under their own body: an encoder that
 * carries no pull-ups of its own (`encoder.onboardPullUps` false) is a loose
 * component, not a module with a header. The SR1230's switch legs are just
 * inside its top edge, so a wire climbing straight up to one ran under the
 * whole picture and its ground stub never showed at all.
 */
function hasRearRowLegs(partId: string): boolean {
  return partById(partId)?.encoder?.onboardPullUps === false
}
/** Air between the picture and a wire routed around it. */
const REAR_ROUTE_CLEARANCE = 6

/**
 * How a wire reaches a far-row leg of a part with `hasRearRowLegs`: down the side
 * of the picture nearer the leg (`x`) and across over its top (`overY`), then
 * down into the leg. `null` for every other pad.
 */
export function peripheralRearRoute(layout: ItemLayout, padIndex: number): { x: number; overY: number } | null {
  const partId = String(layout.item.facts.partId ?? '')
  if (!hasRearRowLegs(partId)) return null
  const box = fittedRenderBox(partId)
  if (!box) return null
  const pad = peripheralPadPoint(layout, padIndex)
  const top = layout.y + box.offsetY
  if (pad.y > top + (box.height / 2)) return null
  const left = layout.x + box.offsetX
  const right = left + box.width
  return {
    x: pad.x < (left + right) / 2 ? left - REAR_ROUTE_CLEARANCE : right + REAR_ROUTE_CLEARANCE,
    overY: top - REAR_ROUTE_CLEARANCE,
  }
}

export function peripheralPadPoint(layout: ItemLayout, padIndex: number) {
  // Any module with measured geometry uses it, whatever kind it is. Gating this
  // on the audio kinds is why every other part's wires met its picture wherever
  // an even spread happened to land.
  const measuredPartId = String(layout.item.facts.partId ?? '')
  const measured = modulePadGeometry(measuredPartId)
  const box = fittedRenderBox(measuredPartId)
  if (measured && box) {
    const [xRatio, yRatio] = measured[Math.min(Math.max(padIndex, 0), measured.length - 1)]
    return {
      x: layout.x + box.offsetX + (xRatio * box.width),
      y: layout.y + box.offsetY + (yRatio * box.height),
    }
  }
  // An uncatalogued module is drawn with the bundled artwork, whose header is
  // centred on one pitch, so any pad count lands on its holes. Spread about the
  // centre rather than clamped to a fixed table, which stacked every pad past
  // the last entry onto one point.
  const count = peripheralPadCount(layout.item)
  const bundled = fitRenderBox(BUNDLED_RENDER_PX, BUNDLED_RENDER_PX)
  const index = Math.min(Math.max(padIndex, 0), count - 1)
  const xPx = BUNDLED_PAD_CENTRE_X_PX + ((index - ((count - 1) / 2)) * BUNDLED_PAD_PITCH_PX)
  return {
    x: layout.x + bundled.offsetX + (xPx * bundled.scale),
    y: layout.y + bundled.offsetY + (BUNDLED_PAD_Y_PX * bundled.scale),
  }
}

export const OUTPUT_CARD_HEIGHT = 174

/** A positioned string is pictured in its shape and takes the full card; a
 *  straight run keeps the short one. */
export function outputIsSingleRow(item: HardwareManifestItem): boolean {
  return item.facts?.form === 'strip' && !Array.isArray(item.facts.positions)
}

/** The LEDs of a positioned string, fitted into a box with the canvas aspect
 *  kept, so the card pictures the shape the LED Output pane draws. */
export function positionedStringPoints(
  item: HardwareManifestItem, box: { x: number; y: number; width: number; height: number },
): Array<[number, number]> | null {
  const points = item.facts.positions
  const canvas = item.facts.positionCanvas as { width: number; height: number } | undefined
  if (!Array.isArray(points) || !canvas || canvas.width <= 0 || canvas.height <= 0) return null
  const scale = Math.min(box.width / canvas.width, box.height / canvas.height)
  const left = box.x + (box.width - canvas.width * scale) / 2
  const top = box.y + (box.height - canvas.height * scale) / 2
  return (points as Array<[number, number]>).map(([x, y]) => [left + x * scale, top + y * scale])
}
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
/** Baseline of an output card's title, above the card. The subtitle sits under it. */
export const OUTPUT_TITLE_BASELINE = 32
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
/** Terminal rows are fixed; the corridors and lanes around the chip are cut to them. */
const LEVEL_SHIFTER_FIRST_ROW = 41
const LEVEL_SHIFTER_PIN_PITCH = 25
const LEVEL_SHIFTER_PIN_ROWS = Array.from({ length: 7 }, (_, row) => LEVEL_SHIFTER_FIRST_ROW + (row * LEVEL_SHIFTER_PIN_PITCH))
/**
 * The legs as measured on `sn74ahct125n-dip14.webp` (400x654): the first leg
 * centred at 71.5 px, then one every 85 px. The photograph is scaled and placed
 * from those numbers so each leg lands on its terminal row — a fitted box with
 * a hand-typed pitch drifted a whole leg-width off by pin 7.
 */
const LEVEL_SHIFTER_RENDER_PX = { width: 400, height: 654, firstLeg: 71.5, legPitch: 85 } as const
const LEVEL_SHIFTER_RENDER_SCALE = LEVEL_SHIFTER_PIN_PITCH / LEVEL_SHIFTER_RENDER_PX.legPitch
export const LEVEL_SHIFTER_RENDER_WIDTH = LEVEL_SHIFTER_RENDER_PX.width * LEVEL_SHIFTER_RENDER_SCALE
export const LEVEL_SHIFTER_RENDER_HEIGHT = LEVEL_SHIFTER_RENDER_PX.height * LEVEL_SHIFTER_RENDER_SCALE
export const LEVEL_SHIFTER_RENDER_Y = LEVEL_SHIFTER_FIRST_ROW - (LEVEL_SHIFTER_RENDER_PX.firstLeg * LEVEL_SHIFTER_RENDER_SCALE)
/** Centred on the two pin columns, so both rows of leg tips reach their terminals. */
export const LEVEL_SHIFTER_RENDER_X = ((LEVEL_SHIFTER_LEFT_PIN_X + LEVEL_SHIFTER_RIGHT_PIN_X) - LEVEL_SHIFTER_RENDER_WIDTH) / 2
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

/**
 * Inter 16px weight 700 advances, in hundredths of a pixel. That is the face
 * `.physicalComponentLabel` draws: the diagram inherits Inter, and a request
 * for weight 750 clamps to the variable font's top weight of 700.
 * An unlisted character uses W, the widest measured glyph, so a title never
 * measures narrower than it draws.
 */
const PART_TITLE_ADVANCE: Record<string, number> = {
  ' ': 379, '(': 603, ')': 603, ',': 534, '-': 748, '.': 534, '/': 621,
  '0': 1079, '1': 690, '2': 1007, '3': 1033, '4': 1082, '5': 995, '6': 1039,
  '7': 930, '8': 1041, '9': 1039,
  'A': 1195, 'B': 1059, 'C': 1184, 'D': 1155, 'E': 972, 'F': 939, 'G': 1201,
  'H': 1195, 'I': 449, 'K': 1151, 'L': 905, 'M': 1491, 'N': 1220, 'O': 1233,
  'P': 1037, 'R': 1051, 'S': 1048, 'T': 1068, 'U': 1171, 'V': 1195, 'W': 1660,
  'X': 1181, 'Y': 1170, 'Z': 1062,
  'a': 929, 'b': 1009, 'c': 941, 'd': 1009, 'e': 953, 'f': 637, 'g': 1011,
  'h': 996, 'i': 434, 'j': 434, 'k': 928, 'l': 434, 'm': 1460, 'n': 996,
  'o': 981, 'p': 1009, 'r': 652, 's': 896, 't': 586, 'u': 996, 'v': 959,
  'w': 1360, 'x': 928, 'y': 963, 'z': 916,
  '×': 1086, '—': 1600,
}
const PART_TITLE_FALLBACK_ADVANCE = PART_TITLE_ADVANCE.W
/** Clear space kept between the title boxes of neighbouring columns. */
export const PART_TITLE_GUTTER = 8
export const PART_TITLE_LINE_PITCH = 18
/** Bottom title line above a peripheral picture. */
export const PART_TITLE_BASELINE = 12
export const PART_TITLE_ASCENT = 12
export const PART_TITLE_DESCENT = 4
/** Caption baseline above the top title line. Matches the old single-line y of -30. */
export const PART_CAPTION_GAP = 18
export const PART_CAPTION_ASCENT = 9
/** Air between a row's lane stack and the title ink of the row below. */
export const PART_TITLE_ROW_AIR = 6

export function peripheralTitleBudget(): number {
  return PERIPHERAL_RENDER_W + PERIPHERAL_GAP - PART_TITLE_GUTTER
}

export function partTitleWidth(text: string): number {
  let hundredths = 0
  for (const char of text) hundredths += PART_TITLE_ADVANCE[char] ?? PART_TITLE_FALLBACK_ADVANCE
  return hundredths / 100
}

/** One line when it fits the column; otherwise the two-line split whose longer line is shortest. */
export function fitPartTitle(title: string | undefined, budget: number): string[] {
  const text = (title ?? '').trim()
  if (text.length === 0) return ['']
  if (partTitleWidth(text) <= budget) return [text]
  const words = text.split(/\s+/)
  if (words.length < 2) return [text]
  let bestAt = 1
  let bestScore = Number.POSITIVE_INFINITY
  for (let index = 1; index < words.length; index += 1) {
    const score = Math.max(
      partTitleWidth(words.slice(0, index).join(' ')),
      partTitleWidth(words.slice(index).join(' ')),
    )
    if (score < bestScore) {
      bestScore = score
      bestAt = index
    }
  }
  return [words.slice(0, bestAt).join(' '), words.slice(bestAt).join(' ')]
}

/** Baselines above the anchor, last entry closest to the picture. */
export function stackedBaselineOffsets(bottomOffset: number, lineCount: number): number[] {
  return Array.from({ length: lineCount }, (_, index) =>
    bottomOffset - ((lineCount - 1 - index) * PART_TITLE_LINE_PITCH))
}

export interface PartTitleBox {
  left: number
  right: number
  top: number
  bottom: number
}

export function peripheralTitleBoxes(layout: ItemLayout): PartTitleBox[] {
  const lines = fitPartTitle(layout.item.title, peripheralTitleBudget())
  const offsets = stackedBaselineOffsets(-PART_TITLE_BASELINE, lines.length)
  const center = layout.x + (layout.width / 2)
  return lines.map((line, index) => {
    const half = partTitleWidth(line) / 2
    const baseline = layout.y + offsets[index]
    return {
      left: center - half,
      right: center + half,
      top: baseline - PART_TITLE_ASCENT,
      bottom: baseline + PART_TITLE_DESCENT,
    }
  })
}

function peripheralHasCaption(item: HardwareManifestItem): boolean {
  if (item.kind === 'dmx-input') return true
  if (powerSwitchStripLeads(item) !== null) return true
  if (item.facts.stage === 'power' && (item.facts.feed === 'dac' || item.facts.feed === 'dfPlayer')) return true
  const partId = item.facts.partId
  return typeof partId === 'string' && sharedPadsAcrossBoards(partId).length > 0
}

/**
 * Where an RGB strip's colour leads land on a power switch carrying one, as
 * the manifest names them (R → OUT1- · G → OUT2- · B → OUT3-), or null.
 */
export function powerSwitchStripLeads(item: HardwareManifestItem): string | null {
  return item.kind === 'power-switch-output' && typeof item.facts.stripLeads === 'string' ? item.facts.stripLeads : null
}

/** How far a peripheral's title ink reaches above its picture. */
export function partLabelOverhang(title: string | undefined, hasCaption: boolean): number {
  const lineCount = fitPartTitle(title, peripheralTitleBudget()).length
  const topTitle = -(PART_TITLE_BASELINE + ((lineCount - 1) * PART_TITLE_LINE_PITCH))
  if (!hasCaption) return -topTitle + PART_TITLE_ASCENT
  return -(topTitle - PART_CAPTION_GAP) + PART_CAPTION_ASCENT
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
  // A controller converter sits in the controller's power slot, not a row.
  const peripherals = items.filter((item) => item.kind !== 'matrix-output' && !POWER_PATH_KINDS.has(item.kind))
  // Keep a line source in the first slot of its chain, with its power stage
  // directly below it. Reserve those cells before packing unrelated modules.
  const parents = new Map(peripherals.flatMap((item) => {
    const source = amplifierSourceItem(item, peripherals)
    return source ? [[item.id, source.id] as const] : []
  }))
  const roots = peripherals.filter((item) => !parents.has(item.id))
  const order = (item: HardwareManifestItem) => Math.min(peripherals.indexOf(item),
    ...peripherals.filter((child) => parents.get(child.id) === item.id).map((child) => peripherals.indexOf(child)))
  roots.sort((a, b) => order(a) - order(b))
  const slots: Array<HardwareManifestItem | undefined> = []
  for (const root of roots) {
    let slot = 0
    while (slots[slot]) slot++
    slots[slot] = root
    for (const child of peripherals.filter((item) => parents.get(item.id) === root.id)) {
      slot += PERIPHERALS_PER_ROW
      slots[slot] = child
    }
  }
  let outputY = 92
  const layouts: ItemLayout[] = outputs.map((item) => {
    const baseHeight = outputIsSingleRow(item) ? OUTPUT_STRIP_CARD_HEIGHT : OUTPUT_CARD_HEIGHT
    const height = baseHeight + (outputHasDataExtender(item) ? OUTPUT_DATA_EXTENDER_HEIGHT : 0)
    const layout = { item, x: 820, y: outputY, width: 184, height }
    const titleLines = fitPartTitle(item.title, layout.width).length
    outputY += height + OUTPUT_CARD_LABEL_HEIGHT + ((titleLines - 1) * PART_TITLE_LINE_PITCH) + 14
    return layout
  })
  const shifterBottom = outputs.length > 0
    ? LEVEL_SHIFTER_Y + (Math.ceil(outputs.length / 4) * (LEVEL_SHIFTER_HEIGHT + LEVEL_SHIFTER_GAP))
    : 0
  // Each row is only as deep as its own lane stack needs, so a lone button
  // does not reserve the space an encoder-heavy row would.
  const rowSignalCounts: number[] = []
  const rowItems: HardwareManifestItem[][] = []
  slots.forEach((item, index) => {
    if (!item) return
    const row = Math.floor(index / PERIPHERALS_PER_ROW)
    const lineOutputs = peripherals.some((child) => parents.get(child.id) === item.id) ? 3 : 0
    rowSignalCounts[row] = (rowSignalCounts[row] ?? 0) + item.pins.length + lineOutputs
    rowItems[row] = [...(rowItems[row] ?? []), item]
  })
  const rowHeights = rowSignalCounts.map((count, row) =>
    PERIPHERAL_RENDER_H + peripheralClearance(count, rowItems[row] ?? []))
  const rowOverhang = rowItems.map((row) => Math.max(
    PART_TITLE_BASELINE + PART_TITLE_ASCENT,
    ...row.map((item) => partLabelOverhang(item.title, peripheralHasCaption(item))),
  ))
  const peripheralY = Math.max(500, shifterBottom + (rowOverhang[0] ?? (PART_TITLE_BASELINE + PART_TITLE_ASCENT)))
  const rowTops: number[] = []
  rowHeights.forEach((_, row) => {
    if (row === 0) {
      rowTops.push(peripheralY)
      return
    }
    const gap = Math.max(PERIPHERAL_ROW_GAP, rowOverhang[row] + PART_TITLE_ROW_AIR)
    rowTops.push(rowTops[row - 1] + rowHeights[row - 1] + gap)
  })
  slots.forEach((item, index) => {
    if (!item) return
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

/** Top of the controller's power slot: the USB block, or the converter drawn in its place. */
export const CONTROLLER_POWER_SLOT_Y = 592
/** From a controller converter's render down to its last caption line, plus clearance. */
const CONTROLLER_CONVERTER_CAPTION_DROP = 73 + 14

/**
 * Bottom of the controller converter's drawing, or 0 on a sheet that draws
 * none. Its height follows the module's render, so a squarer module than the
 * LM2596 reaches further down the sheet.
 */
export function controllerConverterBottom(items: HardwareManifestItem[], plan?: ElectricalPlanSummary): number {
  const supply = plan?.controllerSupply
  if (!supply || !items.some((item) => item.id === supply.itemId)) return 0
  const render = partById(supply.partId)?.render
  if (!render) return 0
  return Math.ceil(CONTROLLER_POWER_SLOT_Y + (render.heightPx * (CONVERTER_SHEET_WIDTH / render.widthPx)) + CONTROLLER_CONVERTER_CAPTION_DROP)
}

/**
 * Single owner of where the PSU zones start, shared by the renderer and the
 * height. The zones span the sheet, so they also start below a controller
 * converter, which hangs under the board in the left column.
 */
export function powerSectionStartY(
  items: HardwareManifestItem[],
  layers: DiagramHeightLayers = ALL_HEIGHT_LAYERS,
  plan?: ElectricalPlanSummary,
) {
  return Math.max(670, diagramContentBottom(items, layers) + POWER_SECTION_GAP, controllerConverterBottom(items, plan))
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

export interface BatteryBand {
  y: number
  height: number
}

/** Two pack boards fit in this band. A third row, or a long sense harness, grows it. */
export const BATTERY_BAND_MIN_HEIGHT = 410
export const BATTERY_CONTENT_TOP = 22
/** The assembly frame is this much shorter than the band, and starts at BATTERY_CONTENT_TOP. */
export const BATTERY_FRAME_TRIM = 34
export const BATTERY_PACK_TOP = 126
export const BATTERY_PACK_HEIGHT = 210
export const BATTERY_WIRE_CHANNEL_GAP = 4
export const BATTERY_WIRE_CHANNEL_PITCH = 4
export const BATTERY_MODULE_TOP = 126
// A box, its pin captions, and room for the next row's two-line title.
export const BATTERY_MODULE_ROW_PITCH = 168
export const BATTERY_MODULE_HEIGHT = 120
/** Pin caption below a module box. The terminal sits 12px up; the caption baseline is 14px under that. */
export const BATTERY_MODULE_LABEL_DROP = 16
export const BATTERY_CONTENT_PAD = 16

/** Band height that keeps every module caption and pack wire channel inside the assembly frame. */
export function batteryAssemblyHeight(moduleCount: number, series: number): number {
  const rows = Math.ceil(Math.max(0, moduleCount) / 2)
  const moduleBottom = rows === 0
    ? 0
    : BATTERY_CONTENT_TOP + BATTERY_MODULE_TOP + ((rows - 1) * BATTERY_MODULE_ROW_PITCH) + BATTERY_MODULE_HEIGHT + BATTERY_MODULE_LABEL_DROP
  const channelBottom = BATTERY_CONTENT_TOP + BATTERY_PACK_TOP + BATTERY_PACK_HEIGHT
    + BATTERY_WIRE_CHANNEL_GAP + ((Math.max(0, series) + 1) * BATTERY_WIRE_CHANNEL_PITCH)
  const contentBottom = Math.max(moduleBottom, channelBottom) + BATTERY_CONTENT_PAD
  // The frame ends 12px before the next zone: it starts 22px in and is 34px shorter than the band.
  return Math.max(BATTERY_BAND_MIN_HEIGHT, contentBottom + (BATTERY_FRAME_TRIM - BATTERY_CONTENT_TOP))
}

/** Battery assembly sits ahead of converter/PSU zones on every power sheet. */
export function batteryBand(
  items: HardwareManifestItem[],
  plan: ElectricalPlanSummary,
  layers: DiagramHeightLayers = ALL_HEIGHT_LAYERS,
): BatteryBand | undefined {
  if (!layers.powerDistribution || !plan.battery) return undefined
  if (!items.some((item) => item.id === plan.battery?.packItemId && item.kind === 'battery-pack')) return undefined
  return {
    y: powerSectionStartY(items, layers, plan),
    height: batteryAssemblyHeight(plan.battery.modules?.length ?? 0, plan.battery.pack?.series ?? 1),
  }
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
  const battery = batteryBand(items, plan, layers)
  let y = battery ? battery.y + battery.height : powerSectionStartY(items, layers, plan)
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
  const battery = batteryBand(items, plan, layers)
  if ((outputCount === 0 && !battery) || !layers.powerDistribution) {
    return Math.max(400, diagramContentBottom(items, layers)
      + COMMON_NET_CALLOUT_GAP + COMMON_NET_CALLOUT_HEIGHT + DIAGRAM_LEGEND_BAND)
  }
  const bands = powerZoneBands(items, plan, layers)
  const bottom = bands.length > 0
    ? bands[bands.length - 1].y + bands[bands.length - 1].height
    : battery ? battery.y + battery.height : powerSectionStartY(items, layers, plan)
  return bottom + POWER_SECTION_SPACING
}
