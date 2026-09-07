// Which screen documents are actually mounted on a panel, and at what size.
//
// After the panel/document split (see
// docs/development/design/large-displays-and-control-routing.md) a `Display`
// node carries widgets and a design size and nothing physical; a
// `TransportDisplay` panel carries the module, its pins, its rotation and its
// Enabled state. Everything that has to know how large a mounted document is
// — the editor's orientation control, deploy validation, and all three
// generators — asks here rather than reading `tftRotation` off whichever node
// happens to be in hand. Reading it off the document is what let a landscape
// design stay attached to a portrait panel.

import type { StudioNode, StudioEdge } from './graphStore'
import { tftControllerForProps } from './nodeLibrary'
import { asTftRotation, TFT_CONTROLLERS, tftRotatedSize, type TftController, type TftRotation } from './tftSurface'

export interface MountedPanelGeometry {
  controller: TftController
  rotation: TftRotation
  /** The panel's pixels as mounted — the size a document on it must be. */
  width: number
  height: number
}

/** The glass a panel presents at its current rotation. */
export function mountedPanelGeometry(panelProps: Record<string, unknown>): MountedPanelGeometry {
  const controller = tftControllerForProps(panelProps) ?? TFT_CONTROLLERS.ST7789
  const rotation = asTftRotation(panelProps.tftRotation)
  return { controller, rotation, ...tftRotatedSize(controller, rotation) }
}

export interface MountedCustomDisplay {
  panel: StudioNode
  document: StudioNode
  /** The registry key the document's widgets live under. */
  documentId: string
  geometry: MountedPanelGeometry
}

/**
 * Every panel showing an authored document, paired with the document.
 *
 * The walk starts at the panel, not the document: a document nothing is
 * plugged into has no physical existence, so it has no geometry to check, no
 * pins to claim and nothing to emit. Panels are the physical facts.
 */
export function mountedCustomDisplays(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): MountedCustomDisplay[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return nodes.flatMap((panel) => {
    if (panel.data.nodeType !== 'TransportDisplay') return []
    const wire = edges.find((edge) => edge.target === panel.id && edge.targetHandle === 'customDisplay')
    const document = wire && byId.get(wire.source)
    if (!document || document.data.nodeType !== 'Display') return []
    return [{
      panel,
      document,
      documentId: String(document.data.properties.displayId ?? document.id),
      geometry: mountedPanelGeometry(panel.data.properties),
    }]
  })
}

/** The panels a given document is mounted on, in graph order. */
export function panelsShowingDocument(
  documentId: string,
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): StudioNode[] {
  return mountedCustomDisplays(nodes, edges)
    .filter((mounted) => mounted.documentId === documentId)
    .map((mounted) => mounted.panel)
}

/**
 * Why this document cannot be drawn on the panel it is plugged into.
 *
 * One sentence, one owner: the panel states the size and the document is the
 * thing that has to change, because rotation is the panel's property and the
 * design is the user's drawing.
 */
export function mountedSizeIssue(
  label: string,
  geometry: MountedPanelGeometry,
  designSize: { width: number; height: number },
): string | null {
  if (geometry.width === designSize.width && geometry.height === designSize.height) return null
  return `${label}: the screen design is ${designSize.width} x ${designSize.height}, but the panel it is `
    + `plugged into shows ${geometry.width} x ${geometry.height} at ${geometry.rotation}°. `
    + 'Open the display editor and resize it for this module and orientation.'
}
