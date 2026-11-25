// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { resetEvaluatorState, type Frame } from '../../../state/graphEvaluator'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import { outputRoutes } from '../../../state/output/outputRouting'
import { STARTER_TEMPLATES } from '../../../state/patterns/starterTemplates'
import { evaluatePreviewPasses, selectPreviewRoute } from '../previewEvaluation'
import { createPreviewWorkerHandler, unpackFrame, unpackPorts, type PreviewWorkerRequest } from '../previewWorker'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? '', properties: { ...(def?.defaultProperties ?? {}), ...props },
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id: `${source}->${target}:${targetHandle}`, source, target, sourceHandle, targetHandle } as unknown as StudioEdge
}

function withOutput(nodes: StudioNode[], props: Record<string, unknown>): StudioNode[] {
  return nodes.map((entry) => entry.data.nodeType === 'MatrixOutput'
    ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, ...props } } }
    : entry)
}

interface Step { nodes: StudioNode[]; edges: StudioEdge[]; tick: number; fullPass: boolean }

const copy = (frame: Frame | null) => frame?.map((row) => row.map((p) => ({ ...p }))) ?? null

/** Every step on this thread, as the loop evaluates without the worker. */
function onMainThread(steps: Step[]) {
  resetEvaluatorState()
  const buffers = { selected: null as Frame | null, stream: null as Frame | null }
  return steps.map(({ nodes, edges, tick, fullPass }) => {
    const routes = outputRoutes(nodes)
    const selected = selectPreviewRoute(routes, '')
    const result = evaluatePreviewPasses({
      nodes, edges, groups: {}, trusted: true, groupInputs: undefined,
      tick, elapsedTick: tick, gridW: 16, gridH: 16, fullPass, streamOutputId: undefined,
    }, selected, buffers)
    const shown = selected ? result.routedByOutput.get(selected.id) ?? null : null
    if (shown) buffers.selected = shown
    return {
      shown: copy(shown),
      terminal: copy(result.terminalFrame),
      outputs: fullPass ? [...result.outputs].map(([id, ports]) => [id, Object.fromEntries(
        Object.entries(ports).map(([port, value]) => [port, Array.isArray(value)
          ? copy(value as Frame)
          // A pooled field is reused two passes on: keep its values now.
          : value instanceof Float32Array ? value.slice() : value]),
      )]) : null,
    }
  })
}

/** The same steps through the worker's handler, sending changes as the client does. */
function inWorker(steps: Step[]) {
  resetEvaluatorState()
  const handle = createPreviewWorkerHandler()
  let sentNodes = new Map<string, StudioNode>()
  let lastNodes: StudioNode[] | null = null
  let lastEdges: StudioEdge[] | null = null
  let returned: ArrayBuffer[] = []
  return steps.map(({ nodes, edges, tick, fullPass }) => {
    const request: PreviewWorkerRequest = {
      trusted: true, tick, elapsedTick: tick, gridW: 16, gridH: 16, fullPass,
      selectedRouteId: '', streamOutputId: undefined, returned,
    }
    if (nodes !== lastNodes) {
      request.nodes = { order: nodes.map((n) => n.id), changed: nodes.filter((n) => sentNodes.get(n.id) !== n) }
      sentNodes = new Map(nodes.map((n) => [n.id, n]))
      lastNodes = nodes
    }
    if (edges !== lastEdges) { request.edges = edges; lastEdges = edges }
    // Through structured clone, as postMessage sends it.
    const response = structuredClone(handle(structuredClone(request)))
    expect(response.error).toBeUndefined()
    const selected = selectPreviewRoute(outputRoutes(nodes), '')
    const packed = response.routed.find(([id]) => id === selected?.id)?.[1] ?? null
    returned = response.routed.flatMap(([, p]) => (p ? [p.data.buffer as ArrayBuffer] : []))
    return {
      shown: packed ? unpackFrame(packed, null) : null,
      terminal: response.terminal ? unpackFrame(response.terminal, null) : null,
      outputs: response.outputs ? response.outputs.map(([id, ports]) => [id, unpackPorts(ports)]) : null,
    }
  })
}

beforeEach(() => resetEvaluatorState())

describe('preview worker', () => {
  it('shows what the main thread shows for Field Transform at 2x smooth, through an edit', () => {
    const starter = STARTER_TEMPLATES.find((entry) => entry.id === 'field-warp')!.build()
    const nodes = withOutput(starter.nodes, { width: 16, height: 16, renderResolution: '2x smooth' })
    // A Strength change replaces one node object, as the store does.
    const edited = nodes.map((entry) => entry.data.nodeType === 'FieldTransform'
      ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, strength: 0.4 } } }
      : entry)
    const steps: Step[] = [1, 2, 3, 4, 5, 6].map((tick) => ({
      nodes: tick < 4 ? nodes : edited, edges: starter.edges, tick: tick * 1.5, fullPass: tick % 3 === 0,
    }))
    const main = onMainThread(steps)
    const worker = inWorker(steps)
    expect(main[0].shown?.length).toBeGreaterThan(0)
    expect(worker).toEqual(main)
  })

  it('carries a stateful chain the same way, a pass at a time', () => {
    // A seed, so its sparks are the same on both runs (0 draws from Math.random).
    const nodes = [node('fire', 'Fire', { seed: 7 }), node('trails', 'Trails'), node('out', 'MatrixOutput', { width: 12, height: 10 })]
    const edges = [edge('fire', 'frame', 'trails', 'frame'), edge('trails', 'frame', 'out', 'frame')]
    const steps: Step[] = Array.from({ length: 8 }, (_, i) => ({ nodes, edges, tick: i + 1, fullPass: i === 7 }))
    expect(inWorker(steps)).toEqual(onMainThread(steps))
  })

  it('answers a pass that throws with an error, not a frame', () => {
    const handle = createPreviewWorkerHandler()
    const broken = { ...node('out', 'MatrixOutput'), data: null } as unknown as StudioNode
    const response = handle({
      nodes: { order: ['out'], changed: [broken] }, edges: [], trusted: true, tick: 1, elapsedTick: 1,
      gridW: 16, gridH: 16, fullPass: false, selectedRouteId: '', streamOutputId: undefined, returned: [],
    })
    expect(response.error).toBeTruthy()
    expect(response.storeRead).toBe(false)
  })
})
