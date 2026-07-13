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
  const temporal = useGraphStore.temporal
  const { pastStates } = temporal.getState()
  temporal.setState({
    pastStates: [...pastStates.slice(-(HISTORY_LIMIT - 1)), { nodes: state.nodes, edges: state.edges }],
    futureStates: [],
  })
  temporal.getState().pause()
  if (resumeHistoryTimer) clearTimeout(resumeHistoryTimer)
  const stamp = Date.now()
  const nodeIdByKey = new Map<string, string>()
  const addedNodes: StudioNode[] = []
  const reusedNodeTypes: string[] = []

  for (const spec of example.nodes) {
    const definition = NODE_LIBRARY.find((entry) => entry.type === spec.type)
    if (!definition) continue

    const existingSingleton = SINGLETON_NODE_TYPES.has(spec.type)
      ? state.nodes.find((node) => node.data.nodeType === spec.type)
      : undefined
    if (existingSingleton) {
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
        }),
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    })
  }

  const allNodes = [...state.nodes, ...addedNodes]
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
    addedNodeIds: addedNodes.map((node) => node.id),
    reusedNodeTypes,
    skippedConnections,
  }
}
