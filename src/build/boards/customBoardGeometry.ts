import type { CustomBoardDefinition, CustomBoardSlot } from './customBoard'

export interface CustomBoardPad {
  slot: CustomBoardSlot
  side: 'left' | 'right'
  row: number
  x: number
  y: number
  labelX: number
  textAnchor: 'start' | 'end'
}

export interface CustomBoardGeometry {
  width: number
  height: number
  viewBox: string
  body: { x: number; y: number; width: number; height: number }
  rowPitch: number
  pads: CustomBoardPad[]
  padsBySlotId: ReadonlyMap<string, CustomBoardPad>
  /** Nominal workbench sizing only. Never use as measured hardware dimensions. */
  nominalDimensionsMm: { width: number; height: number }
}

/** Front/top view, row 1 at the top of each rail, including unequal rails. */
export function customBoardGeometry(definition: Pick<CustomBoardDefinition, 'leftPins' | 'rightPins'>): CustomBoardGeometry {
  const width = 400
  const rowPitch = 24
  const rows = Math.max(1, definition.leftPins.length, definition.rightPins.length)
  const height = 128 + (rows - 1) * rowPitch
  const pads = (['left', 'right'] as const).flatMap((side) => definition[`${side}Pins`].map((slot, index) => ({
    slot, side, row: index + 1, x: side === 'left' ? 24 : width - 24, y: 84 + index * rowPitch,
    labelX: side === 'left' ? 38 : width - 38, textAnchor: side === 'left' ? 'start' as const : 'end' as const,
  })))
  return {
    width, height, viewBox: `0 0 ${width} ${height}`, rowPitch,
    body: { x: 12, y: 12, width: width - 24, height: height - 24 },
    pads, padsBySlotId: new Map(pads.map((pad) => [pad.slot.id, pad])),
    nominalDimensionsMm: { width: 40, height: height / 10 },
  }
}

/** Labels do not stale a physical route. Canvas size does: it changes scaling. */
export function customBoardEndpointFingerprint(geometry: CustomBoardGeometry, slotId: string): string | undefined {
  const pad = geometry.padsBySlotId.get(slotId)
  return pad ? JSON.stringify([slotId, pad.side, pad.x, pad.y, geometry.width, geometry.height]) : undefined
}

export function customBoardLayoutFingerprint(definition: CustomBoardDefinition): string {
  const geometry = customBoardGeometry(definition)
  return JSON.stringify(geometry.pads.map((pad) => [
    customBoardEndpointFingerprint(geometry, pad.slot.id), pad.slot.role,
    pad.slot.role === 'gpio' ? [pad.slot.gpio, pad.slot.enabled]
      : pad.slot.role === 'supply' ? [pad.slot.voltage, pad.slot.direction] : null,
  ]))
}

/** Deterministic rail selection; aliases such as VIN never imply voltage. */
export function customBoardPowerPad(
  geometry: CustomBoardGeometry,
  role: 'ground' | 'supply',
  voltage?: number,
  direction?: 'input' | 'output',
): CustomBoardPad | undefined {
  return geometry.pads.find(({ slot }) => role === 'ground' ? slot.role === 'ground'
    : slot.role === 'supply' && slot.voltage === voltage && slot.direction === direction)
}
