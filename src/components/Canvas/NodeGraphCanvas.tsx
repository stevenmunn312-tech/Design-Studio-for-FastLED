import { useCallback, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeTypes,
  type EdgeTypes,
  type NodeMouseHandler,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../../state/graphStore'
import { NODE_LIBRARY } from '../../state/nodeLibrary'
import StudioNode from './StudioNode'
import GlowEdge from './GlowEdge'
import styles from './NodeGraphCanvas.module.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: NodeTypes = { studioNode: StudioNode as any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: EdgeTypes = { glowEdge: GlowEdge as any }

const SNAP_GRID: [number, number] = [20, 20]

function portsCompatible(srcType: string, dstType: string): boolean {
  if (srcType === dstType) return true
  if ((srcType === 'bool' || srcType === 'float') && (dstType === 'bool' || dstType === 'float')) return true
  return false
}

function NodeGraphCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, selectNode, addNode } =
    useGraphStore()
  const { screenToFlowPosition, getNode } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)

  const isValidConnection: IsValidConnection = useCallback(
    (connection) => {
      const srcNode = getNode(connection.source)
      const dstNode = getNode(connection.target)
      if (!srcNode || !dstNode) return false

      const srcData = srcNode.data as { outputs?: Array<{ id: string; dataType: string }> }
      const dstData = dstNode.data as { inputs?: Array<{ id: string; dataType: string }> }

      const srcPort = srcData.outputs?.find((p) => p.id === connection.sourceHandle)
      const dstPort = dstData.inputs?.find((p) => p.id === connection.targetHandle)

      if (!srcPort || !dstPort) return true
      return portsCompatible(srcPort.dataType, dstPort.dataType)
    },
    [getNode]
  )

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => selectNode(node.id),
    [selectNode]
  )

  const onPaneClick = useCallback(() => selectNode(null), [selectNode])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData('application/studio-node')
      if (!type) return

      const def = NODE_LIBRARY.find((n) => n.type === type)
      if (!def) return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })

      addNode({
        id: `${type}-${Date.now()}`,
        type: 'studioNode',
        position,
        data: {
          label: def.label,
          nodeType: def.type,
          category: def.category,
          properties: def.defaultProperties ?? {},
          inputs: def.inputs,
          outputs: def.outputs,
        },
      })
    },
    [screenToFlowPosition, addNode]
  )

  return (
    <div ref={wrapperRef} className={styles.canvas} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        isValidConnection={isValidConnection}
        snapToGrid
        snapGrid={SNAP_GRID}
        minZoom={0.5}
        maxZoom={2}
        fitView
        deleteKeyCode="Delete"
        style={{ background: 'var(--bg-primary)' }}
        defaultEdgeOptions={{ type: 'glowEdge' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.06)"
        />
        <Controls
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-glow)' }}
        />
        <MiniMap
          style={{ background: 'var(--bg-panel)' }}
          nodeColor={(n) => {
            const cat = (n.data as { category?: string }).category
            const map: Record<string, string> = {
              audio: '#00ffff',
              pattern: '#ff00ff',
              math: '#a8ff00',
              output: '#00bfff',
              hardware: '#ffa500',
            }
            return (cat && map[cat]) || '#888'
          }}
        />
      </ReactFlow>
    </div>
  )
}

export default function NodeGraphCanvas() {
  return (
    <ReactFlowProvider>
      <NodeGraphCanvasInner />
    </ReactFlowProvider>
  )
}
