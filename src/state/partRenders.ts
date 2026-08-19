// Which picture belongs to which hardware part.
//
// One map, read by both views, because they are two views of the same object:
// the hardware pane draws the part at true scale on the bench, and the graph
// node shows a thumbnail of the same asset in its preview slot. Two lists would
// eventually disagree about which photo is which part, which is precisely the
// confusion the picture exists to prevent.
//
// Two sources, for now. Parts modelled under `Blender Assets/Parts/` come
// through the generated catalogue and are served from `public/parts/`; the
// button, potentiometer and encoder modules predate that folder, live at the
// asset root, and are still bundled imports. Moving those three into `Parts/`
// with a `part.json` would collapse this to one source — and would give them
// datasheet-checked dimensions, which they currently lack.

import buttonRender from '../assets/components/button-module.webp'
import encoderRender from '../assets/components/encoder-module.webp'
import microphoneRender from '../assets/components/inmp441-i2s-microphone.webp'
import potRender from '../assets/components/potentiometer-module.webp'
import { partRenderSrc } from './partCatalogue'

export interface PartRender {
  /** Displayed name of the exact module, for alt text and captions. */
  label: string
  src: string
}

/**
 * The module picture for a hardware node type, or null for a part with no
 * asset yet — callers draw a placeholder rather than nothing, so the layout
 * does not shift when a render lands.
 */
export const PART_RENDER_BY_NODE_TYPE: Record<string, PartRender> = {
  MicInput: {
    label: 'INMP441 microphone',
    src: partRenderSrc('inmp441-i2s-microphone') ?? microphoneRender,
  },
  ButtonInput: { label: 'Button module', src: buttonRender },
  PotInput: { label: 'Potentiometer module', src: potRender },
  EncoderInput: { label: 'Rotary encoder module', src: encoderRender },
}

export function partRenderForNodeType(nodeType: string): PartRender | null {
  return PART_RENDER_BY_NODE_TYPE[nodeType] ?? null
}
