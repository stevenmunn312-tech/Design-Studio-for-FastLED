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

import type { StudioNode } from './graphStore'
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
 * Every panel with a screen design, and the design.
 *
 * A design belongs to the panel it was drawn on. It used to live on a node of
 * its own, wired across — which meant a design could be drawn at a size no
 * panel had, plugged into two panels at once, or plugged into none, and each
 * of those had to be detected and refused. A panel owning its own design makes
 * all three unsayable rather than caught.
 *
 * `document` is the panel itself, so everything downstream that asks a mounted
 * display for its document id keeps working: the id is the panel's, and the
 * symbols keyed by it are as unique as the panel is.
 */
export function mountedCustomDisplays(nodes: readonly StudioNode[]): MountedCustomDisplay[] {
  return nodes.flatMap((panel) => {
    if (panel.data.nodeType !== 'TransportDisplay') return []
    const documentId = String(panel.data.properties.displayId ?? '')
    if (!documentId) return []
    return [{
      panel,
      document: panel,
      documentId,
      geometry: mountedPanelGeometry(panel.data.properties),
    }]
  })
}

/** The panels a given document is mounted on, in graph order. */
export function panelsShowingDocument(
  documentId: string,
  nodes: readonly StudioNode[],
): StudioNode[] {
  return mountedCustomDisplays(nodes)
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

/**
 * The mounted screens a build actually contains, plus the two shapes it cannot
 * build.
 *
 * Everything downstream of the panel/document split has to agree on which
 * documents are real: RAM pricing, asset baking, deploy validation and all
 * three generators. They used to each walk the graph their own way — the
 * estimator priced every `Display` node whether or not anything showed it, the
 * asset bake fetched artwork for designs nobody had plugged in, and normal
 * codegen emitted one document twice when two panels shared it, which the
 * template planner refused as an identifier collision. One walk, one answer.
 *
 * `mounted` holds one panel per document node, so the symbols keyed by that
 * document's id are declared exactly once. A second panel showing the same
 * document is reported in `shared` rather than built: one design drives one
 * panel for now, and a user who wants the same screen twice duplicates the
 * `Display` node — two documents, two sets of widgets, two independent
 * touch surfaces. Documents `unmounted` have no physical existence at all;
 * they cost nothing and block nothing, but anything wired out of one is
 * driving a control that does not exist.
 */
export interface CustomDisplayMountPlan {
  /** Every panel with a screen design, in graph order. */
  mounted: MountedCustomDisplay[]
}

export function customDisplayMountPlan(nodes: readonly StudioNode[]): CustomDisplayMountPlan {
  /*
   * `shared` and `unmounted` are empty, and cannot be otherwise.
   *
   * They were the two ways a design could be wrong when it lived on a node of
   * its own: plugged into two panels, or into none. A design that belongs to
   * its panel can be neither. The fields stay so the callers that report those
   * cases keep compiling while they are removed, and so the shape of this plan
   * does not have to change twice.
   */
  return { mounted: mountedCustomDisplays(nodes) }
}

