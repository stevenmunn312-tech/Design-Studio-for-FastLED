import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphStore } from '../graphStore'
import type { StudioNode, StudioEdge } from '../graphStore'
import { captureWorkspace, cloneWorkspace } from '../workspacePersistence'
import { buildShareUrl, readSharedWorkspace, clearShareHash } from '../../utils/shareGraph'
import { serializeProject, buildProjectSnapshot } from '../../utils/projectFileIO'
import { stripRuntimeFields } from '../runtimeFields'

const NODE_RUNTIME = ['selected', 'dragging', 'resizing', 'measured', 'width', 'height', 'positionAbsolute', 'internals', 'zIndex']
const EDGE_RUNTIME = ['selected', 'zIndex']

function node(id: string, x: number): StudioNode {
  return {
    id, type: 'studioNode', position: { x, y: 10 },
    data: { nodeType: 'SolidColor', category: 'pattern', label: id, properties: {} },
  } as unknown as StudioNode
}

function leaks(json: string): string[] {
  const found: string[] = []
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((entry, i) => walk(entry, `${path}[${i}]`))
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      const isNode = 'position' in record && 'data' in record
      const isEdge = 'source' in record && 'target' in record
      for (const key of isNode ? NODE_RUNTIME : isEdge ? EDGE_RUNTIME : []) {
        if (key in record) found.push(`${path}.${key}`)
      }
      for (const [key, entry] of Object.entries(record)) walk(entry, `${path}.${key}`)
    }
  }
  walk(JSON.parse(json), '$')
  return found
}

describe('runtime React Flow fields in saved workspaces', () => {
  beforeEach(() => {
    useGraphStore.getState().loadGraph([node('a', 0), node('b', 300)], [], { trusted: true })
    // What the canvas does: measure, select, then drag.
    useGraphStore.getState().onNodesChange([
      { type: 'dimensions', id: 'a', dimensions: { width: 200, height: 80 }, setAttributes: true },
      { type: 'dimensions', id: 'b', dimensions: { width: 200, height: 80 } },
      { type: 'select', id: 'a', selected: true },
      { type: 'position', id: 'a', position: { x: 40, y: 50 }, dragging: true },
    ])
  })

  it('the live store really carries them (the test would otherwise prove nothing)', () => {
    const a = useGraphStore.getState().nodes.find((n) => n.id === 'a')!
    expect(a.selected).toBe(true)
    expect(a.dragging).toBe(true)
    expect(a.measured).toEqual({ width: 200, height: 80 })
  })

  it('keeps position and drops the runtime fields in a captured workspace', () => {
    const workspace = captureWorkspace(useGraphStore.getState())
    expect(workspace.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 40, y: 50 })
    expect(leaks(JSON.stringify(workspace))).toEqual([])
  })

  it('drops them from a project file', () => {
    const project = buildProjectSnapshot(captureWorkspace(useGraphStore.getState()))
    expect(leaks(serializeProject(project))).toEqual([])
    // Even a project object that was never cloned.
    const raw = { ...project, workspace: { ...project.workspace, nodes: useGraphStore.getState().nodes } }
    expect(leaks(serializeProject(raw))).toEqual([])
  })

  it('drops them from a share link without touching the live graph', () => {
    const state = useGraphStore.getState()
    const url = buildShareUrl({ nodes: state.nodes, edges: state.edges })
    window.location.hash = new URL(url).hash
    const read = readSharedWorkspace()!
    clearShareHash()
    expect(leaks(JSON.stringify(read.workspace))).toEqual([])
    expect(read.workspace.nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 40, y: 50 })
    expect(useGraphStore.getState().nodes.find((n) => n.id === 'a')!.selected).toBe(true)
  })

  it('cleans stored sub-graphs, edges, and an old save that already has them', () => {
    const edge = { id: 'e', source: 'a', target: 'b', sourceHandle: 'o', targetHandle: 'i', type: 'glowEdge', reconnectable: 'target', style: { stroke: '#fff' }, selected: true, zIndex: 3 } as StudioEdge
    const dirty = { ...node('g', 0), selected: true, measured: { width: 1, height: 1 }, zIndex: 9 } as StudioNode
    const cleaned = cloneWorkspace({ nodes: [dirty], edges: [edge], graphData: { grp: { nodes: [dirty], edges: [edge] } } })
    expect(leaks(JSON.stringify(cleaned))).toEqual([])
    expect(cleaned.edges[0]).toMatchObject({ reconnectable: 'target', style: { stroke: '#fff' } })
    expect(cleaned.graphData!.grp.nodes[0].position).toEqual({ x: 0, y: 10 })
  })

  it('returns objects without runtime fields as they are', () => {
    const ws = { nodes: [node('a', 0)], edges: [] as StudioEdge[] }
    expect(stripRuntimeFields(ws).nodes[0]).toBe(ws.nodes[0])
  })
})
