import type { DisplayDocumentRegistry } from '../state/displayDocument'
import { displayDocumentInputPorts, displayDocumentTouchOutputPorts } from '../state/displayRegistry'
import { buttonBankOutputs } from '../state/buttonBank'
import { NODE_LIBRARY } from '../state/nodeLibrary'
import { playerControlInputs } from '../state/playerControlAssignments'

interface WireableNode {
  id: string
  data: {
    nodeType: string
    properties: Record<string, unknown>
  }
}

interface WireableEdge {
  id: string
  source: string
  sourceHandle?: string | null
  target: string
  targetHandle?: string | null
}

const DEFINITIONS = new Map(NODE_LIBRARY.map((definition) => [definition.type, definition]))

function effectivePorts(
  node: WireableNode,
  documents: DisplayDocumentRegistry,
  nodesById: ReadonlyMap<string, WireableNode>,
): { inputs: readonly { id: string }[]; outputs: readonly { id: string }[] } {
  const definition = DEFINITIONS.get(node.data.nodeType)
  const properties = node.data.properties ?? {}
  let inputs = definition?.inputs ?? []
  let outputs = definition?.outputs ?? []

  if (node.data.nodeType === 'ControlMap') {
    inputs = playerControlInputs(properties.controls)
  }
  if (node.data.nodeType === 'ButtonBank') {
    outputs = buttonBankOutputs(properties.buttons)
  }
  if (node.data.nodeType === 'TransportDisplay') {
    const displayId = String(properties.displayId ?? '')
    const document = displayId ? documents[displayId] : undefined
    inputs = [...inputs, ...(document ? displayDocumentInputPorts(document) : [])]
  }
  if (node.data.nodeType === 'TouchInput') {
    const panelId = String(properties.panelId ?? '')
    const panel = panelId ? nodesById.get(panelId) : undefined
    const displayId = panel?.data.nodeType === 'TransportDisplay'
      ? String(panel.data.properties.displayId ?? '')
      : ''
    const document = displayId ? documents[displayId] : undefined
    outputs = [...outputs, ...(document ? displayDocumentTouchOutputPorts(document) : [])]
  }

  return { inputs, outputs }
}

function describePorts(ports: readonly { id: string }[]): string {
  return ports.length > 0 ? ports.map((port) => port.id).join(', ') : '(none)'
}

/**
 * Assert that a test graph contains only cables the editor can create.
 *
 * Static sockets come from NODE_LIBRARY. Runtime-minted sockets are resolved
 * through the same helpers as production: a panel's display document, a
 * Control Map's assigned controls, and a Button Bank's button rows. Stored
 * `data.inputs`/`data.outputs` are deliberately ignored so stale fixture
 * metadata cannot make an impossible cable look valid.
 */
export function assertWireable(
  nodes: readonly WireableNode[],
  edges: readonly WireableEdge[],
  displayDocuments: DisplayDocumentRegistry = {},
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const issues: string[] = []

  for (const edge of edges) {
    const source = byId.get(edge.source)
    if (!source) {
      issues.push(`Edge "${edge.id}" names missing source node "${edge.source}".`)
    } else {
      const ports = effectivePorts(source, displayDocuments, byId).outputs
      const handle = edge.sourceHandle ?? ''
      if (!ports.some((port) => port.id === handle)) {
        issues.push(
          `Edge "${edge.id}" cannot leave ${source.data.nodeType} "${source.id}" through output `
          + `"${handle || '(missing)'}"; available outputs: ${describePorts(ports)}.`,
        )
      }
    }

    const target = byId.get(edge.target)
    if (!target) {
      issues.push(`Edge "${edge.id}" names missing target node "${edge.target}".`)
    } else {
      const ports = effectivePorts(target, displayDocuments, byId).inputs
      const handle = edge.targetHandle ?? ''
      if (!ports.some((port) => port.id === handle)) {
        issues.push(
          `Edge "${edge.id}" cannot enter ${target.data.nodeType} "${target.id}" through input `
          + `"${handle || '(missing)'}"; available inputs: ${describePorts(ports)}.`,
        )
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(`Test graph contains impossible wiring:\n${issues.map((issue) => `- ${issue}`).join('\n')}`)
  }
}
