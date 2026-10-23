import type { StudioNode, StudioEdge } from '../state/graphStore'
import { touchNodeBundleControls } from '../state/displays/designControlBundle'
import { shownDesignId } from '../state/displays/transportDisplay'
import { TRANSPORT_TOUCH_ACTION_TYPES } from '../state/displays/transportTouch'
import type { BoardLinkWireKind } from './boardLinks'

/**
 * Which fields of a Touch Screen's Controls wire a link sends.
 *
 * The Controls wire carries a `playercontrols` bundle: one pass's presses and
 * levels from a panel's touch regions or its screen design's role-stamped
 * widgets. A link sends the finished bundle as separate values, presses as
 * counted presses and each level with a flag saying a finger has set it, and
 * the receiving board rebuilds the same bundle from them, so a Music Player,
 * Pattern Slideshow, LED output or Player Controls node on another board reads
 * it exactly as it would from a Touch Screen of its own. Only the fields this
 * panel can produce are sent. See "What a link carries" in
 * docs/design/board-links.md.
 *
 * A Controls wire can only start at a Touch Screen: a Player Controls node is
 * computed on the board that reads it, from inputs a link carries, so it never
 * sends a bundle itself.
 */

/** The bundle's one-shot fields, in the order a frame carries them. */
export const BUNDLE_PRESS_FIELDS = ['playPause', 'previous', 'next', 'ledToggle', 'patternPrevious', 'patternNext'] as const
/** The bundle's absolute fields; each travels with a `<field>Set` flag. */
export const BUNDLE_LEVEL_FIELDS = ['volume', 'brightness'] as const

export type BundleLevelField = (typeof BUNDLE_LEVEL_FIELDS)[number]

/** The flag a level travels with: true once a finger has set it. */
export const bundleLevelSetField = (field: BundleLevelField) => `${field}Set`

/** Whether a wire from `node`'s `handle` is a bundle a link can carry. */
export function isLinkedControlsSource(node: StudioNode | undefined, handle: string | null | undefined): boolean {
  return (node?.data as { nodeType?: string } | undefined)?.nodeType === 'TouchInput' && handle === 'controls'
}

/**
 * The fields `touch`'s Controls wire carries, in frame order: the presses and
 * levels its screen design publishes (`touchNodeBundleControls`), or, on a
 * fixed layout, its touch regions. Empty when the panel publishes nothing.
 */
export function touchControlsFields(
  touch: StudioNode,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): { id: string; kind: BoardLinkWireKind }[] {
  const panelId = String((touch.data.properties as { panelId?: unknown } | undefined)?.panelId ?? '')
  const panel = nodes.find((node) => node.id === panelId)
  if (!panel) return []
  const presses = new Set<string>()
  const levels = new Set<string>()
  if (shownDesignId(panel.data.properties)) {
    for (const control of touchNodeBundleControls(touch, panel, nodes, edges)) {
      if (control.edge === 'level') levels.add(control.field)
      else presses.add(control.field)
    }
  } else {
    for (const port of (touch.data.outputs ?? []) as readonly { id: string }[]) {
      const type = (TRANSPORT_TOUCH_ACTION_TYPES as Record<string, 'bool' | 'float' | undefined>)[port.id]
      if (type === 'bool') presses.add(port.id)
      else if (type === 'float') levels.add(port.id)
    }
  }
  return [
    ...BUNDLE_PRESS_FIELDS.filter((field) => presses.has(field)).map((id) => ({ id, kind: 'press' as const })),
    ...BUNDLE_LEVEL_FIELDS.filter((field) => levels.has(field)).flatMap((id) => [
      { id, kind: 'float' as const },
      { id: bundleLevelSetField(id), kind: 'bool' as const },
    ]),
  ]
}
