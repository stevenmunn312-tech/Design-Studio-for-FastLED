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
  peripherals.forEach((item, index) => {
    layouts.push({ item, x: 330 + (index * 190), y: peripheralY, width: 160, height: 104 })
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
