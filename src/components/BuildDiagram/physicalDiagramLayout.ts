import type { ElectricalPlanSummary } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'

export type ItemLayout = {
  item: HardwareManifestItem
  x: number
  y: number
  width: number
  height: number
}

/** Clearance between the last hardware row and the PSU zones, sized for the shared-net callout. */
export const POWER_SECTION_GAP = 120

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
export const PERIPHERAL_LANE_BASE = 22
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

const PAD_Y_RATIO = 0.8595
const PAD_X_RATIOS_3 = [0.4215, 0.5, 0.5797]
const PAD_X_RATIOS_5 = [0.3406, 0.4203, 0.5, 0.5785, 0.6582]

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
export const LEVEL_SHIFTER_GAP = 42

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
    height + 204 + (supply.injectionIds.length * 54), 0)
  return powerSectionStartY(items, layers) + powerSectionHeight + 34
}
