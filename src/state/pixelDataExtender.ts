import { outputForm } from './ledOutputForm'
import { partById, type PartPixelDataExtenderSpec } from './partCatalogue'

export const DIRECT_PIXEL_DATA_LINK = 'Direct'
export const NLED_PIXEL_DATA_LINK = 'NLED Pixel Data Extender'
export const PIXEL_DATA_LINK_OPTIONS = [DIRECT_PIXEL_DATA_LINK, NLED_PIXEL_DATA_LINK] as const
export const NLED_PIXEL_DATA_EXTENDER_PART_ID = 'nled-pixel-data-extender-pair'

export function usesNledPixelDataExtender(properties: Record<string, unknown>): boolean {
  return String(properties.dataLink ?? DIRECT_PIXEL_DATA_LINK) === NLED_PIXEL_DATA_LINK
}

/** The NLED set carries one asynchronous data line, not a clocked pair or HUB75 ribbon. */
export function pixelDataExtenderSupports(
  properties: Record<string, unknown>,
  oneWireChipsets: readonly string[],
): boolean {
  if (outputForm(properties) === 'hub75') return false
  return oneWireChipsets.includes(String(properties.chipset ?? 'WS2812B'))
}

export function nledPixelDataExtenderSpec(): PartPixelDataExtenderSpec | null {
  return partById(NLED_PIXEL_DATA_EXTENDER_PART_ID)?.pixelDataExtender ?? null
}
