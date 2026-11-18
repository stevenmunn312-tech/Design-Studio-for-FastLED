// Which picture belongs to which hardware part.
//
// One function, read by both views, because they are two views of the same
// object: the hardware pane draws the part at true scale on the bench, and the
// graph node shows a thumbnail of the same asset in its preview slot. Two
// sources would eventually disagree about which photo is which part, which is
// precisely the confusion the picture exists to prevent.
//
// The picture is always the part's own, from its catalogue entry. A node that
// names a part the catalogue does not hold gets nothing, so the caller draws
// its placeholder: another part's picture standing in would be a bundled part
// passing for a downloaded or unknown one.
//
// The one exception is a node with no part to name. The button bank, the
// potentiometer and the encoder module the app has always drawn predate the
// catalogue (no `part.json`, so no verified dimensions either); they are not
// stand-ins for anything, they are those modules, so each keeps its bundled
// picture. Moving them into `Parts/` would delete this table.

import buttonRender from '../../assets/components/button-module.webp'
import encoderRender from '../../assets/components/encoder-module.webp'
import potRender from '../../assets/components/potentiometer-module.webp'
import { partRenderSrc } from './partCatalogue'
import { resolvePartIdentity } from './partOptions'

export interface PartRender {
  /** Displayed name of the exact module, for alt text and captions. */
  label: string
  src: string
}

/** The modules that have no catalogue entry, by the node type that is only ever that module. */
const UNCATALOGUED_MODULE_RENDERS: Readonly<Record<string, PartRender>> = {
  // A Button with several rows is several instances of the same verified
  // momentary-button part; the hardware view uses this render for all of them.
  ButtonBank: { label: 'Button module', src: buttonRender },
  PotInput: { label: 'Potentiometer module', src: potRender },
  EncoderInput: { label: 'Rotary encoder module', src: encoderRender },
}

/**
 * The module picture for a hardware node, or null for a part with no asset
 * (including one this version does not have) — callers draw a placeholder
 * rather than nothing, so the layout does not shift when a render lands.
 */
export function partRenderForNodeType(
  nodeType: string,
  properties: Record<string, unknown> = {},
): PartRender | null {
  const identity = resolvePartIdentity(nodeType, properties)
  if (!identity) return UNCATALOGUED_MODULE_RENDERS[nodeType] ?? null
  const catalogued = identity.entry?.render?.file ? partRenderSrc(identity.entry.partId) : null
  if (!catalogued) return null
  return { label: identity.entry?.label ?? identity.option.label, src: catalogued }
}
