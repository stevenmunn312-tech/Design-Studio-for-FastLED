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
  /** One panel per document node, in graph order. */
  mounted: MountedCustomDisplay[]
  /** Documents plugged into more than one panel, with every panel showing them. */
  shared: { document: StudioNode; panels: StudioNode[] }[]
  /** `Display` nodes no panel shows. */
  unmounted: StudioNode[]
}

export function customDisplayMountPlan(
  nodes: readonly StudioNode[],
  edges: readonly StudioEdge[],
): CustomDisplayMountPlan {
  const byDocumentNode = new Map<string, MountedCustomDisplay[]>()
  for (const mount of mountedCustomDisplays(nodes, edges)) {
    const showings = byDocumentNode.get(mount.document.id)
    if (showings) showings.push(mount)
    else byDocumentNode.set(mount.document.id, [mount])
  }
  const showings = [...byDocumentNode.values()]
  return {
    mounted: showings.map((panels) => panels[0]),
    shared: showings.filter((panels) => panels.length > 1)
      .map((panels) => ({ document: panels[0].document, panels: panels.map((mount) => mount.panel) })),
    unmounted: nodes.filter((node) => node.data.nodeType === 'Display' && !byDocumentNode.has(node.id)),
  }
}

/**
 * Why one design cannot drive two panels.
 *
 * Stated once so deploy validation and the two template planners say the same
 * sentence, and so the merge in `findDisplayGeneratorIssues` reports it once
 * rather than twice in slightly different words.
 */
export function sharedDocumentIssue(documentLabel: string, panelLabels: readonly string[]): string {
  return `${documentLabel} is plugged into ${panelLabels.length} panels (${panelLabels.join(', ')}). `
    + 'A screen design drives one panel: copy the Display node and wire a copy to each panel, '
    + 'or disconnect all but one.'
}

/** Why a wire out of an unplugged design leads nowhere. */
export function unmountedDocumentIssue(documentLabel: string, drivenCount: number): string {
  return `${documentLabel} drives ${drivenCount === 1 ? 'a control' : `${drivenCount} controls`}, `
    + 'but it is not plugged into a panel, so its widgets are never built. '
    + "Wire its Custom Display output to a Transport Display's Custom Display input, "
    + 'or disconnect the widget wires.'
}
