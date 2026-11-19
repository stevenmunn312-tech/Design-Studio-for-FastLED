import { outputForm } from '../output/ledOutputForm'
import { PART_CATALOGUE, memoByCatalogue, partById, type PartPixelDataExtenderSpec } from '../../build/parts/partCatalogue'

/**
 * The data link an LED output names: the id of a catalogue part carrying a
 * `pixelDataExtender` block, or empty for ordinary short wiring (Direct). No
 * part is known by id here; what a link draws and lists comes from its block.
 */
export function dataLinkPartId(properties: Record<string, unknown>): string {
  const id = properties.dataLinkPartId
  return typeof id === 'string' ? id.trim() : ''
}

/** The facts of the output's data link part, or null when it is Direct or names no known link. */
export function dataLinkSpec(properties: Record<string, unknown>): PartPixelDataExtenderSpec | null {
  const id = dataLinkPartId(properties)
  return id === '' ? null : partById(id)?.pixelDataExtender ?? null
}

/** Whether the output sends its pixel data through a link part rather than straight to the LEDs. */
export function usesDataLink(properties: Record<string, unknown>): boolean {
  return dataLinkPartId(properties) !== ''
}

/** Every part an output may name as its data link, in catalogue order. */
export const dataLinkPartIds: () => readonly string[] = memoByCatalogue(() =>
  Object.values(PART_CATALOGUE).filter((entry) => entry.pixelDataExtender).map((entry) => entry.partId))

/** The link part's name, for messages and lists. */
export function dataLinkLabel(partId: string): string {
  return partById(partId)?.label ?? partId
}

/** A link carries one asynchronous data line, not a clocked pair or HUB75 ribbon. */
export function pixelDataExtenderSupports(
  properties: Record<string, unknown>,
  oneWireChipsets: readonly string[],
): boolean {
  if (outputForm(properties) === 'hub75') return false
  return oneWireChipsets.includes(String(properties.chipset ?? 'WS2812B'))
}

/** "A, B and common ground": the pair's conductors as a sentence, with the reference conductor named. */
export function conductorPhrase(conductors: readonly string[]): string {
  const names = conductors.map((name) => (name.toUpperCase() === 'GND' ? 'common ground' : name))
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

/** The count of conductors in words, as a sentence opens: "Three". */
export function conductorCountWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count)
}
