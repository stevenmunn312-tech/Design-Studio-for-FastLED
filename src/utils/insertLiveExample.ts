import { canAddNodeType, SINGLETON_NODE_TYPES, useGraphStore } from '../state/graphStore'
import type { StudioEdge, StudioNode } from '../state/graphStore'
import { NODE_LIBRARY, portColor } from '../state/nodeLibrary'
import { resolveDefaultProperties } from '../state/nodeDefaults'

const HISTORY_LIMIT = 100
const MEASUREMENT_SETTLE_MS = 600
let resumeHistoryTimer: ReturnType<typeof setTimeout> | null = null

export interface LiveExampleNodeSpec {
  key: string
  type: string
  dx: number
  dy: number
  properties?: Record<string, unknown>
  /** Concrete hardware provider created/reused behind a graph-facing Audio node. */
  sourceProvider?: { type: 'MicInput' | 'LineInput'; properties?: Record<string, unknown> }
}

export interface LiveExampleEdgeSpec {
  source: string
  sourceHandle: string
  target: string
  targetHandle: string
}

export interface LiveExampleSpec {
  title: string
  nodes: LiveExampleNodeSpec[]
  edges: LiveExampleEdgeSpec[]
}

export interface LiveExampleResult {
  nodeIds: string[]
  addedNodeIds: string[]
  reusedNodeTypes: string[]
  skippedConnections: LiveExampleEdgeSpec[]
}

/** Add a help example beside the current work without replacing existing input noodles. */
export function insertLiveExample(
  example: LiveExampleSpec,
  origin: { x: number; y: number },
): LiveExampleResult {
  const state = useGraphStore.getState()
  let existingNodes = state.nodes
  const temporal = useGraphStore.temporal
  const { pastStates } = temporal.getState()
  temporal.setState({
    pastStates: [...pastStates.slice(-(HISTORY_LIMIT - 1)), { nodes: state.nodes, edges: state.edges, graphData: state.graphData }],
    futureStates: [],
  })
  temporal.getState().pause()
  if (resumeHistoryTimer) clearTimeout(resumeHistoryTimer)
  const stamp = Date.now()
  const nodeIdByKey = new Map<string, string>()
  const addedNodes: StudioNode[] = []
  const reusedNodeTypes: string[] = []

  const providerIdByType = new Map<string, string>()
  for (const spec of example.nodes) {
    const provider = spec.sourceProvider
    if (!provider || providerIdByType.has(provider.type)) continue
    const existing = existingNodes.find((node) => node.data.nodeType === provider.type)
    if (existing) {
      providerIdByType.set(provider.type, existing.id)
      reusedNodeTypes.push(provider.type)
      continue
    }
    const definition = NODE_LIBRARY.find((entry) => entry.type === provider.type)
    if (!definition) continue
    const id = `help-${stamp}-${provider.type.toLowerCase()}-hardware`
    providerIdByType.set(provider.type, id)
    addedNodes.push({
      id,
      type: 'studioNode',
      position: origin,
      hidden: true,
      selectable: false,
      draggable: false,
      data: {
        label: definition.label,
        nodeType: definition.type,
        category: definition.category,
        properties: resolveDefaultProperties(definition.type, {
          ...definition.defaultProperties,
          ...provider.properties,
        }),
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    })
  }

  for (const spec of example.nodes) {
    const definition = NODE_LIBRARY.find((entry) => entry.type === spec.type)
    if (!definition) continue

    const providerId = spec.sourceProvider ? providerIdByType.get(spec.sourceProvider.type) : undefined
    const existingSingleton = SINGLETON_NODE_TYPES.has(spec.type)
      ? existingNodes.find((node) => node.data.nodeType === spec.type)
      : undefined
    if (existingSingleton) {
      if (spec.type === 'Audio' && providerId) {
        existingNodes = existingNodes.map((node) => node.id === existingSingleton.id
          ? {
              ...node,
              data: {
                ...node.data,
                properties: { ...node.data.properties, sourceId: providerId },
              },
            }
          : node)
      }
      nodeIdByKey.set(spec.key, existingSingleton.id)
      reusedNodeTypes.push(spec.type)
      continue
    }
    if (!canAddNodeType([...state.nodes, ...addedNodes], spec.type)) continue

    const id = `help-${stamp}-${spec.key}`
    nodeIdByKey.set(spec.key, id)
    addedNodes.push({
      id,
      type: 'studioNode',
      position: { x: origin.x + spec.dx, y: origin.y + spec.dy },
      data: {
        label: definition.label,
        nodeType: definition.type,
        category: definition.category,
        properties: resolveDefaultProperties(definition.type, {
          ...definition.defaultProperties,
          ...spec.properties,
          ...(providerId ? { sourceId: providerId } : {}),
        }),
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    })
  }

  const allNodes = [...existingNodes, ...addedNodes]
  const addedEdges: StudioEdge[] = []
  const skippedConnections: LiveExampleEdgeSpec[] = []

  example.edges.forEach((spec, index) => {
    const source = nodeIdByKey.get(spec.source)
    const target = nodeIdByKey.get(spec.target)
    if (!source || !target) return

    const existingEdges = [...state.edges, ...addedEdges]
    const alreadyConnected = existingEdges.some((edge) =>
      edge.source === source
      && edge.sourceHandle === spec.sourceHandle
      && edge.target === target
      && edge.targetHandle === spec.targetHandle)
    if (alreadyConnected) return

    const occupiedInput = existingEdges.some((edge) =>
      edge.target === target && edge.targetHandle === spec.targetHandle)
    if (occupiedInput) {
      skippedConnections.push(spec)
      return
    }

    const sourceNode = allNodes.find((node) => node.id === source)
    const sourceDefinition = NODE_LIBRARY.find((entry) => entry.type === sourceNode?.data.nodeType)
    const sourcePort = sourceDefinition?.outputs.find((port) => port.id === spec.sourceHandle)
    addedEdges.push({
      id: `e-help-${stamp}-${index}`,
      source,
      sourceHandle: spec.sourceHandle,
      target,
      targetHandle: spec.targetHandle,
      type: 'glowEdge',
      reconnectable: 'target',
      style: { stroke: portColor(sourcePort?.dataType ?? 'float') },
    })
  })

  useGraphStore.setState({
    nodes: allNodes,
    edges: [...state.edges, ...addedEdges],
  })
  resumeHistoryTimer = setTimeout(() => {
    resumeHistoryTimer = null
    useGraphStore.temporal.getState().resume()
  }, MEASUREMENT_SETTLE_MS)

  return {
    nodeIds: [...nodeIdByKey.values()],
    addedNodeIds: addedNodes.filter((node) => !node.hidden).map((node) => node.id),
    reusedNodeTypes,
    skippedConnections,
  }
}
