import { partById } from '../../build/parts/partCatalogue'
import type { PartSdCardSpec } from '../../build/parts/partCatalogue'
import { partIdOrDefault } from './partSpec'

/**
 * A microSD card on SPI. The firmware and the SPI pins are the same for every
 * module; what a module changes is what may be fed to it, and that comes from
 * the catalogue's `sdCard` block: the rail its power pad takes, and whether it
 * carries a regulator and level shifter or is a bare socket.
 */
export const DEFAULT_SD_CARD_PART_ID = 'microsd-module-5v'

/** The part's sdCard block; `null` for an unknown part (a missing id is the default part). */
export function sdCardSpec(partId: unknown): PartSdCardSpec | null {
  return partById(partIdOrDefault(partId, DEFAULT_SD_CARD_PART_ID))?.sdCard ?? null
}

/** What the Build Diagram subtitle says the module is, from what it may be fed. */
export function sdCardSubtitle(spec: PartSdCardSpec): string {
  return spec.levelShifted
    ? `${spec.supplyVolts} V microSD SPI module with regulator and level shifting`
    : `Bare ${spec.supplyVolts} V microSD SPI breakout`
}
