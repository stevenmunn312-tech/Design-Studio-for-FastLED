import type { ElectricalPlanSummary } from '../../build/electricalPlan'
import type { HardwareManifestItem } from '../../build/hardwareManifest'

export type ItemLayout = {
  item: HardwareManifestItem
  x: number
  y: number
  width: number
  height: number
}

export const LEVEL_SHIFTER_X = 430
export const LEVEL_SHIFTER_Y = 276
export const LEVEL_SHIFTER_WIDTH = 160
export const LEVEL_SHIFTER_HEIGHT = 154
export const LEVEL_SHIFTER_GAP = 34

export function levelShifterChipY(outputIndex: number) {
  return LEVEL_SHIFTER_Y + (Math.floor(outputIndex / 4) * (LEVEL_SHIFTER_HEIGHT + LEVEL_SHIFTER_GAP))
}

export function levelShifterChannelY(outputIndex: number) {
  return levelShifterChipY(outputIndex) + 42 + ((outputIndex % 4) * 25)
}

export function itemLayouts(items: HardwareManifestItem[]): ItemLayout[] {
  const outputs = items.filter((item) => item.kind === 'matrix-output')
  const peripherals = items.filter((item) => item.kind !== 'matrix-output' && item.kind !== 'mic-input')
  const layouts: ItemLayout[] = outputs.map((item, index) => ({
    item,
    x: 820,
    y: 92 + (index * 212),
    width: 252,
    height: 174,
  }))
  const microphone = items.find((item) => item.kind === 'mic-input')
  if (microphone) layouts.push({ item: microphone, x: 350, y: 62, width: 205, height: 138 })
  const peripheralY = Math.max(500, LEVEL_SHIFTER_Y + (Math.ceil(outputs.length / 4) * (LEVEL_SHIFTER_HEIGHT + LEVEL_SHIFTER_GAP)) + 24)
  peripherals.forEach((item, index) => {
    layouts.push({ item, x: 330 + (index * 190), y: peripheralY, width: 160, height: 104 })
  })
  return layouts
}

export function physicalAssemblyDiagramHeight(items: HardwareManifestItem[], plan: ElectricalPlanSummary) {
  const layouts = itemLayouts(items)
  const outputCount = layouts.filter((layout) => layout.item.kind === 'matrix-output').length
  if (outputCount === 0) return 760
  const hardwareBottom = Math.max(0, ...layouts.map((layout) => layout.y + layout.height))
  const powerSectionY = Math.max(670, hardwareBottom + 54)
  const powerSectionHeight = (plan.totals?.supplies ?? []).reduce((height, supply) =>
    height + 184 + (supply.injectionIds.length * 54), 0)
  return powerSectionY + powerSectionHeight + 34
}
