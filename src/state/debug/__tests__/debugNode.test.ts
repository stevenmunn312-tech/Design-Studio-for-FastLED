// A Debug node is a workshop instrument: wiring one to a part must change
// nothing the project produces, and no save may carry it
// (docs/development/patterns/debug-node.md).
import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../graphStore'
import { NODE_LIBRARY, libraryDefaults, isSinkDefinition } from '../../nodeLibrary'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraphFull } from '../../graphEvaluator'
import { buildGraphDiagnostics, findDeployBlockingErrors } from '../../../utils/validateGraph'
import { boardPartition } from '../../../build/boardPartition'
import { cloneWorkspace } from '../../workspacePersistence'
import { serializeProject, buildProjectSnapshot } from '../../../utils/projectFileIO'
import { buildShareUrl } from '../../../utils/shareGraph'
import { DEBUG_DATA_TYPE, DEBUG_NODE_TYPE } from '../debugNode'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'pattern',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as unknown as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const debugNode = (id: string) => node(id, DEBUG_NODE_TYPE)
const debugEdge = (partId: string, debugId: string) => edge(partId, DEBUG_DATA_TYPE, debugId, 'part')

/** An LED project with a pot driving brightness and a pot that is not wired. */
function project() {
  const nodes = [
    node('board-root', 'Board'),
    node('knob', 'PotInput', { pin: 34 }),
    node('spare', 'PotInput', { pin: 35 }),
    node('solid', 'SolidColor'),
    node('out', 'MatrixOutput', { width: 8, height: 8, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 }),
  ]
  const edges = [edge('knob', 'value', 'out', 'brightness'), edge('solid', 'frame', 'out', 'frame')]
  return { nodes, edges }
}

/** The same project with Debug nodes wired to a used part and an unused one. */
function withDebug() {
  const { nodes, edges } = project()
  return {
    nodes: [...nodes, debugNode('dbg-knob'), debugNode('dbg-spare')],
    edges: [...edges, debugEdge('knob', 'dbg-knob'), debugEdge('spare', 'dbg-spare')],
  }
}

describe('Debug node definition', () => {
  it('takes one debug input, has no outputs and is a canvas tool', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === DEBUG_NODE_TYPE)!
    expect(definition.inputs).toEqual([{ id: 'part', label: 'Part', dataType: DEBUG_DATA_TYPE }])
    expect(definition.outputs).toEqual([])
    expect(definition.category).toBe('note')
  })

  it('is never a sink, so nothing wired to it is rooted into the build', () => {
    const definition = NODE_LIBRARY.find((entry) => entry.type === DEBUG_NODE_TYPE)!
    expect(isSinkDefinition(definition)).toBe(false)
    // The rule itself is unchanged for real sinks.
    expect(isSinkDefinition(NODE_LIBRARY.find((entry) => entry.type === 'MatrixOutput')!)).toBe(true)
  })
})

describe('Debug wiring changes nothing the project produces', () => {
  it('generates a byte-identical sketch', () => {
    const plain = project(), debug = withDebug()
    expect(generateCpp(debug.nodes, debug.edges)).toBe(generateCpp(plain.nodes, plain.edges))
  })

  it('generates a byte-identical sketch when no LED output prunes the graph', () => {
    const plain = project(), debug = withDebug()
    const noOutput = (graph: { nodes: StudioNode[]; edges: StudioEdge[] }) => ({
      nodes: graph.nodes.filter((entry) => entry.id !== 'out'),
      edges: graph.edges.filter((entry) => entry.target !== 'out'),
    })
    const a = noOutput(debug), b = noOutput(plain)
    expect(generateCpp(a.nodes, a.edges)).toBe(generateCpp(b.nodes, b.edges))
  })

  it('renders the same preview frame', () => {
    const plain = project(), debug = withDebug()
    const frame = (graph: { nodes: StudioNode[]; edges: StudioEdge[] }) =>
      evaluateGraphFull(graph.nodes, graph.edges, 1000, 8, 8).frame
    expect(frame(debug)).toEqual(frame(plain))
  })

  it('reports the same graph diagnostics, so an unwired part still reads as disconnected', () => {
    const plain = project(), debug = withDebug()
    const summary = (graph: { nodes: StudioNode[]; edges: StudioEdge[] }) =>
      buildGraphDiagnostics(graph.nodes, graph.edges).map((entry) => `${entry.severity}:${entry.id}`)
    expect(summary(plain)).toContain('warning:spare-disconnected')
    expect(summary(debug)).toEqual(summary(plain))
    // An unwired Debug node does not report itself either.
    const lone = { nodes: [...plain.nodes, debugNode('dbg-lone')], edges: plain.edges }
    expect(summary(lone)).toEqual(summary(plain))
  })

  it('reports the same deploy-blocking errors', () => {
    const plain = project(), debug = withDebug()
    expect(findDeployBlockingErrors(debug.nodes, debug.edges)).toEqual(findDeployBlockingErrors(plain.nodes, plain.edges))
  })

  it('leaves the board partition unchanged', () => {
    const plain = project(), debug = withDebug()
    const ids = (graph: { nodes: StudioNode[]; edges: StudioEdge[] }) => {
      const partition = boardPartition(graph.nodes, graph.edges, 'board-root')
      return { nodes: partition.nodes.map((entry) => entry.id), edges: partition.edges.map((entry) => entry.id) }
    }
    expect(ids(debug)).toEqual(ids(plain))
  })
})

describe('Debug nodes are never saved', () => {
  it('drops Debug nodes and every edge touching them from a persisted copy', () => {
    const plain = project(), debug = withDebug()
    const copy = cloneWorkspace({ nodes: debug.nodes, edges: debug.edges })
    expect(copy.nodes.map((entry) => entry.id)).toEqual(plain.nodes.map((entry) => entry.id))
    expect(copy.edges.map((entry) => entry.id)).toEqual(plain.edges.map((entry) => entry.id))
  })

  it('leaves the rest of the project unchanged through a save file', () => {
    const plain = project(), debug = withDebug()
    const saved = (graph: { nodes: StudioNode[]; edges: StudioEdge[] }) => {
      const parsed = JSON.parse(serializeProject(buildProjectSnapshot({ nodes: graph.nodes, edges: graph.edges })))
      return { nodes: parsed.workspace.nodes, edges: parsed.workspace.edges }
    }
    const text = JSON.stringify(saved(debug))
    expect(text).not.toContain(DEBUG_NODE_TYPE)
    expect(text).not.toContain('dbg-')
    expect(saved(debug)).toEqual(saved(plain))
  })

  it('keeps Debug nodes out of share links', () => {
    const plain = project(), debug = withDebug()
    expect(buildShareUrl({ nodes: debug.nodes, edges: debug.edges }))
      .toBe(buildShareUrl({ nodes: plain.nodes, edges: plain.edges }))
  })

  it('does not change the live graph it copies', () => {
    const debug = withDebug()
    cloneWorkspace({ nodes: debug.nodes, edges: debug.edges })
    expect(debug.nodes.some((entry) => entry.data.nodeType === DEBUG_NODE_TYPE)).toBe(true)
  })
})
