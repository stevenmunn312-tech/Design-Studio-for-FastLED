import { useCallback, useMemo, useRef, useState } from 'react'
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
  type OnConnectStart,
  type OnConnect,
  type OnReconnect,
  type OnMove,
  type Viewport,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { usePatternLibrary } from '../../state/patternLibrary'
import { NODE_LIBRARY, CATEGORY_COLOR, portsCompatible } from '../../state/nodeLibrary'
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

// Persist the canvas pan/zoom so a reload restores the same view instead of
// re-fitting to the nodes (which reads as the view "jumping").
const VIEWPORT_KEY = 'fastled-studio-viewport'
function loadViewport(): Viewport | null {
  try { const v = localStorage.getItem(VIEWPORT_KEY); return v ? (JSON.parse(v) as Viewport) : null } catch { return null }
}
function saveViewport(vp: Viewport) {
  try { localStorage.setItem(VIEWPORT_KEY, JSON.stringify(vp)) } catch { /* ignore */ }
}

const SNAP_GRID: [number, number] = [20, 20]

// How close (in flow units) a dropped node must land to a noodle to splice into
// it, and fallback node dimensions when a node hasn't been measured yet.
const SPLICE_DIST = 48
const FALLBACK_W = 180
const FALLBACK_H = 70

type Pt = { x: number; y: number }

// Shortest distance from point p to the segment a→b (used to find the noodle a
// node was dropped onto).
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

function NodeGraphCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, selectNode, addNode, insertNodeOnEdge, spreadNodes, instantiatePattern, addToCollection, enterGraph, removeEdge, reconnectNoodle } =
    useGraphStore()
  // Restore the saved pan/zoom on mount; fit the view only when there's none
  // (first run). Read once so it isn't re-applied on every render.
  const initialViewport = useMemo(() => loadViewport(), [])
  // Tracks whether a dragged noodle end landed on a valid port; if not (dropped
  // on empty space) we treat it as an unplug and delete the edge.
  const reconnectLanded = useRef(true)
  // Set when a drag starts on an already-connected input port: we detach the
  // existing noodle so the gesture unplugs (drop on empty) or re-routes (drop
  // on a compatible output) instead of starting an unrelated new connection.
  const detaching = useRef(false)
  // Origin of an in-progress connection dragged from an output port; used to
  // offer a type-filtered "add node" picker when the noodle is dropped on
  // empty space, then auto-wire the new node to this output.
  const connectFrom = useRef<{ nodeId: string; handleId: string; dataType: string } | null>(null)
  // Timestamp of the last drag-to-create picker open, so the trailing pane
  // click that React Flow emits right after the drop doesn't close it.
  const menuOpenedAt = useRef(0)
  const { screenToFlowPosition, getNode } = useReactFlow()
  const { setStatus, setSparkPort, setViewCenter } = useUiStore()
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Publish the click-to-add drop point (in flow coords) so sidebar clicks land
  // on screen wherever the user has panned. Biased to the left third — vertically
  // centred but offset from the left edge — so new nodes have room to wire right.
  const publishCenter = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setViewCenter(screenToFlowPosition({ x: r.left + r.width * 0.05, y: r.top + r.height / 2 }))
  }, [screenToFlowPosition, setViewCenter])

  // On pan/zoom: remember the viewport (so a reload restores it) and refresh
  // the click-to-add centre.
  const handleMoveEnd = useCallback<OnMove>((_, vp) => { saveViewport(vp); publishCenter() }, [publishCenter])
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<
    { x: number; y: number; fx: number; fy: number; connectFrom?: { nodeId: string; handleId: string; dataType: string } } | null
  >(null)

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
      // Absorbing a pattern into a collection: dropping a Group's frame output on
      // a PatternCollection's input internalizes it instead of wiring a noodle.
      const tgt = getNode(connection.target ?? '')
      if ((tgt?.data as { nodeType?: string })?.nodeType === 'PatternCollection' && connection.targetHandle === 'pattern') {
        const src = getNode(connection.source ?? '')
        if ((src?.data as { nodeType?: string })?.nodeType !== 'Group') {
          setStatus('Group your pattern first, then connect it to the collection', 'info')
          return
        }
        const name = (src?.data as { label?: string })?.label ?? 'pattern'
        addToCollection(connection.target!, connection.source!)
        setStatus(`Added “${name}” to the collection`, 'success')
        return
      }
      onConnect(connection)
      // Spread the freshly-connected pair apart if the new noodle is too short.
      spreadNodes()
      if (connection.target && connection.targetHandle) {
        setSparkPort({ nodeId: connection.target, portId: connection.targetHandle })
        setTimeout(() => setSparkPort(null), 150)
      }
    },
    [onConnect, spreadNodes, setSparkPort, getNode, setStatus, addToCollection]
  )

  // After a node is dragged, tidy any connections it left too cramped.
  const onNodeDragStop = useCallback(() => spreadNodes(), [spreadNodes])

  // Grabbing a connected input dot: detach its noodle up-front so the drag
  // becomes an unplug/re-route rather than a fresh (dead-end) connection.
  const onConnectStart: OnConnectStart = useCallback(
    (_e, params) => {
      detaching.current = false
      connectFrom.current = null
      // Dragging out of an output port: remember its type so an empty-space
      // drop can offer a compatible-node picker.
      if (params.handleType === 'source' && params.nodeId) {
        const srcNode = getNode(params.nodeId)
        const out = (srcNode?.data as { outputs?: Array<{ id: string; dataType: string }> })?.outputs
          ?.find((p) => p.id === (params.handleId ?? undefined))
        if (out) connectFrom.current = { nodeId: params.nodeId, handleId: out.id, dataType: out.dataType }
        return
      }
      if (params.handleType !== 'target' || !params.nodeId) return
      const existing = edges.find(
        (ed) => ed.target === params.nodeId && (ed.targetHandle ?? null) === (params.handleId ?? null)
      )
      if (existing) {
        detaching.current = true
        removeEdge(existing.id)
      }
    },
    [edges, removeEdge, getNode]
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      if (detaching.current) {
        // Detached noodle: a valid drop re-routed it (handleConnect ran),
        // otherwise it was dropped on empty space and stays unplugged.
        setStatus(state?.isValid ? 'Noodle re-routed' : 'Noodle unplugged', 'info')
        detaching.current = false
        return
      }
      const origin = connectFrom.current
      connectFrom.current = null
      // Dropped a noodle from an output onto empty canvas (no end handle):
      // offer a picker of nodes that have a compatible input, then auto-wire.
      if (origin && !state?.toHandle) {
        const pt = 'changedTouches' in event ? event.changedTouches[0] : event
        const fp = screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
        menuOpenedAt.current = Date.now()
        setCanvasMenu({ x: pt.clientX, y: pt.clientY, fx: fp.x, fy: fp.y, connectFrom: origin })
        return
      }
      if (state && !state.isValid) {
        setStatus('Incompatible port types — connection blocked', 'error')
      }
    },
    [setStatus, screenToFlowPosition]
  )

  // Unplug a noodle: grab its input (target) end and drop it on empty space to
  // disconnect, or onto another compatible port to re-route.
  const onReconnectStart = useCallback(() => { reconnectLanded.current = false }, [])

  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      reconnectLanded.current = true
      reconnectNoodle(oldEdge, newConnection)
    },
    [reconnectNoodle]
  )

  const onReconnectEnd = useCallback(
    (_e: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectLanded.current) {
        removeEdge(edge.id)
        setStatus('Noodle unplugged', 'info')
      }
    },
    [removeEdge, setStatus]
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
    // A noodle dropped on empty space opens the picker in onConnectEnd, but the
    // browser fires a trailing pane `click` right after (connectionInProgress is
    // already cleared by then), which would instantly close it. Ignore that one.
    if (Date.now() - menuOpenedAt.current < 350) return
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

      // A saved library pattern dropped from the sidebar → instantiate it as a
      // Group node at the drop point.
      const patternId = e.dataTransfer.getData('application/studio-pattern')
      if (patternId) {
        const saved = usePatternLibrary.getState().patterns.find((p) => p.id === patternId)
        if (saved) instantiatePattern(saved, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
        return
      }

      const type = e.dataTransfer.getData('application/studio-node')
      if (!type) return

      const def = NODE_LIBRARY.find((n) => n.type === type)
      if (!def) return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })

      const newNode = {
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
      }

      // Drop-to-splice: if the node landed on a noodle whose endpoints are
      // type-compatible with one of the node's inputs and outputs, wire it in
      // between (source → new → target) instead of leaving it unconnected.
      let best: { edgeId: string; inHandle: string; outHandle: string } | null = null
      let bestDist = SPLICE_DIST
      for (const edge of edges) {
        const sN = getNode(edge.source)
        const tN = getNode(edge.target)
        if (!sN || !tN) continue
        const sPt = {
          x: sN.position.x + (sN.measured?.width ?? FALLBACK_W),
          y: sN.position.y + (sN.measured?.height ?? FALLBACK_H) / 2,
        }
        const tPt = {
          x: tN.position.x,
          y: tN.position.y + (tN.measured?.height ?? FALLBACK_H) / 2,
        }
        if (distToSegment(position, sPt, tPt) >= bestDist) continue
        const outType = (sN.data as { outputs?: Array<{ id: string; dataType: string }> }).outputs
          ?.find((p) => p.id === edge.sourceHandle)?.dataType
        const inType = (tN.data as { inputs?: Array<{ id: string; dataType: string }> }).inputs
          ?.find((p) => p.id === edge.targetHandle)?.dataType
        if (!outType || !inType) continue
        const inPort = def.inputs.find((p) => portsCompatible(outType, p.dataType))
        const outPort = def.outputs.find((p) => portsCompatible(p.dataType, inType))
        if (inPort && outPort) {
          best = { edgeId: edge.id, inHandle: inPort.id, outHandle: outPort.id }
          bestDist = distToSegment(position, sPt, tPt)
        }
      }

      if (best) {
        insertNodeOnEdge(newNode, best.edgeId, best.inHandle, best.outHandle)
        setStatus(`Spliced ${def.label} into the connection`, 'success')
      } else {
        addNode(newNode)
      }
    },
    [screenToFlowPosition, addNode, insertNodeOnEdge, instantiatePattern, edges, getNode, setStatus]
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
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        onMoveEnd={handleMoveEnd}
        onInit={publishCenter}
        isValidConnection={isValidConnection}
        snapToGrid
        snapGrid={SNAP_GRID}
        minZoom={0.5}
        maxZoom={2}
        defaultViewport={initialViewport ?? undefined}
        fitView={!initialViewport}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
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
          className={styles.controls}
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
          connectFrom={canvasMenu.connectFrom}
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
