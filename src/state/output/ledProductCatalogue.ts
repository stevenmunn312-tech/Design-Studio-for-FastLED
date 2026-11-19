// The LED products the catalogue holds, for the places that offer a choice of
// them: the node's picker, the setup wizard and the parts shelf. Reads only
// (docs/design/led-output-parts.md); choosing one is `setLedOutputPart`.

import { PART_CATALOGUE, memoByCatalogue } from '../../build/parts/partCatalogue'
import { ledCountBounds, ledCountEditable, resolveLedProduct, type LedProduct } from './ledProduct'

/** Every LED product, bundled first then downloaded, in catalogue order. */
export const ledProducts: () => readonly LedProduct[] = memoByCatalogue(() =>
  Object.values(PART_CATALOGUE)
    .filter((entry) => entry.ledOutput)
    .map((entry) => resolveLedProduct(entry.partId))
    .filter((product): product is LedProduct => product !== null))

/** The one-line length rule a cuttable strip shows beside its count; null for every other part. */
export function ledCountHint(product: LedProduct): string | null {
  if (!ledCountEditable(product.spec)) return null
  const bounds = ledCountBounds(product.spec)
  if (!bounds) return null
  const metres = product.spec.pitchMm ? ` (${Math.round((bounds.max * product.spec.pitchMm) / 100) / 10} m reel)` : ''
  return bounds.step > 1
    ? `${bounds.min} to ${bounds.max} LEDs, cut every ${bounds.step}${metres}`
    : `${bounds.min} to ${bounds.max} LEDs${metres}`
}
