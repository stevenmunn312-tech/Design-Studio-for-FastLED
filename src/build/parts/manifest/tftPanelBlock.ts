// The rule a colour TFT part's `tftPanel` block must meet beyond its shape: the
// glass the `display` block states has to sit inside the chip's frame memory.
// Pure, so the manifest validator can say why a panel cannot be driven rather
// than have the firmware address columns the controller does not have.

import { tftChipFor } from '../../../state/displays/tftSurface'

/** Why a colour panel's `display` and `tftPanel` blocks cannot be used together, or null when they can. */
export function tftPanelBlockIssue(display: unknown, tftPanel: unknown): string | null {
  if (typeof display !== 'object' || display === null || typeof tftPanel !== 'object' || tftPanel === null) {
    return null
  }
  const { controller, resolutionPx } = display as Record<string, unknown>
  const chip = tftChipFor(typeof controller === 'string' ? controller : undefined)
  if (!chip || !Array.isArray(resolutionPx) || resolutionPx.length !== 2) return null
  const [a, b] = resolutionPx as number[]
  // The catalogue states a resolution the way its render faces; the native width is the short side.
  const width = Math.min(a, b)
  const height = Math.max(a, b)
  const { columnOffset = 0, rowOffset = 0 } = tftPanel as { columnOffset?: number; rowOffset?: number }
  if (columnOffset + width > chip.ramWidth || rowOffset + height > chip.ramHeight) {
    return `a ${width}x${height} glass at offset ${columnOffset},${rowOffset} does not fit the ${chip.id}'s ${chip.ramWidth}x${chip.ramHeight} frame memory`
  }
  return null
}
