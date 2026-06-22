import { useCallback, useRef, useState } from 'react'
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
  type OnConnectEnd,
  type OnConnect,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { NODE_LIBRARY, CATEGORY_COLOR } from '../../state/nodeLibrary'
import StudioNode from './StudioNode'
import GlowEdge from './GlowEdge'
import NodeContextMenu from './NodeContextMenu'
import CanvasContextMenu from './CanvasContextMenu'
import GroupControls from './GroupControls'
import styles from './NodeGraphCanvas.module.css'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: NodeTypes = { studioNode: StudioNode as any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const edgeTypes: EdgeTypes = { glowEdge: GlowEdge as any }

const minimapNodeColor = (n: Node) =>
  CATEGORY_COLOR[(n.data as { category?: string }).category ?? ''] ?? '#444'

const SNAP_GRID: [number, number] = [20, 20]

function portsCompatible(srcType: string, dstType: string): boolean {
  if (srcType === dstType) return true
  if ((srcType === 'bool' || srcType === 'float') && (dstType === 'bool' || dstType === 'float')) return true
  return false
}

function NodeGraphCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, selectNode, addNode, enterGraph } =
    useGraphStore()
  const { screenToFlowPosition, getNode } = useReactFlow()
  const { setStatus, setSparkPort } = useUiStore()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<{ x: number; y: number; fx: number; fy: number } | null>(null)

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

  const handleConnect: OnConnect = useCallback(
    (connection) => {
      onConnect(connection)
      if (connection.target && connection.targetHandle) {
        setSparkPort({ nodeId: connection.target, portId: connection.targetHandle })
        setTimeout(() => setSparkPort(null), 150)
      }
    },
    [onConnect, setSparkPort]
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (_e, state) => {
      if (state && !state.isValid) {
        setStatus('Incompatible port types — connection blocked', 'error')
      }
    },
    [setStatus]
  )

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => selectNode(node.id),
    [selectNode]
  )

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      const d = node.data as { nodeType?: string; properties?: { groupId?: string } }
      if (d.nodeType === 'Group' && d.properties?.groupId) enterGraph(d.properties.groupId)
    },
    [enterGraph]
  )

  const onNodeContextMenu: NodeMouseHandler = useCallback(
    (e, node) => {
      e.preventDefault()
      setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY })
    },
    []
  )

  const onPaneContextMenu = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      e.preventDefault()
      const evt = e as React.MouseEvent
      const fp = screenToFlowPosition({ x: evt.clientX, y: evt.clientY })
      setCanvasMenu({ x: evt.clientX, y: evt.clientY, fx: fp.x, fy: fp.y })
    },
    [screenToFlowPosition]
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
    setContextMenu(null)
    setCanvasMenu(null)
  }, [selectNode])

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
      <GroupControls />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
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
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={0}
          maskColor="rgba(0,0,0,0.55)"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-glow)' }}
          className={styles.minimap}
        />
      </ReactFlow>
      {contextMenu && (
        <NodeContextMenu
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
      {canvasMenu && (
        <CanvasContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          flowPosition={{ x: canvasMenu.fx, y: canvasMenu.fy }}
          onClose={() => setCanvasMenu(null)}
        />
      )}
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
