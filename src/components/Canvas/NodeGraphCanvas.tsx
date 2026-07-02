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
  type OnNodeDrag,
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
import { anchorPosition } from '../../utils/anchorNode'
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

function hoveredSpliceEdge(eventTarget: EventTarget | null): string | undefined {
  if (!(eventTarget instanceof Element)) return undefined
  return eventTarget.closest('[data-splice-edge-id]')?.getAttribute('data-splice-edge-id') ?? undefined
}

function hoveredSpliceEdgeAt(x: number, y: number): string | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    const edgeId = element.closest('[data-splice-edge-id]')?.getAttribute('data-splice-edge-id')
    if (edgeId) return edgeId
  }
  return undefined
}

function NodeGraphCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, selectNode, addNode, insertNodeOnEdge, spliceNodeOnEdge, spreadNodes, instantiatePattern, addToCollection, enterGraph, removeEdge, reconnectNoodle } =
    useGraphStore()
  // Restore the saved pan/zoom on mount; fit the view only when there's none
  // (first run). Read once so it isn't re-applied on every render.
  const initialViewport = useMemo(() => loadViewport(), [])
  // Tracks whether a dragged noodle end landed on a valid port; if not (dropped
  // on empty space) we treat it as an unplug and delete the edge.
  const reconnectLanded = useRef(true)
  // React Flow also emits connect lifecycle events while an existing noodle is
  // being reconnected. Keep those gestures out of the output drag-to-create
  // path, otherwise unplugging an input can open the add-node picker.
  const reconnecting = useRef(false)
  // Origin of an in-progress connection dragged from an output port; used to
  // offer a type-filtered "add node" picker when the noodle is dropped on
  // empty space, then auto-wire the new node to this output.
  const connectFrom = useRef<{ nodeId: string; handleId: string; dataType: string } | null>(null)
  // Timestamp of the last drag-to-create picker open, so the trailing pane
  // click that React Flow emits right after the drop doesn't close it.
  const menuOpenedAt = useRef(0)
  const { screenToFlowPosition, flowToScreenPosition, getNode, getInternalNode } = useReactFlow()
  const { setStatus, setSparkPort, setViewCenter, draggingNodeType, setDraggingNodeType } = useUiStore()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [spliceCue, setSpliceCue] = useState<{
    edgeId: string
    x: number
    y: number
    label: string
    color: string
  } | null>(null)
  const [canvasDragNodeId, setCanvasDragNodeId] = useState<string | null>(null)

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

  // Grabbing a connected input dot: let the noodle stay visible while it is
  // being reconnected. If the drag ends on empty space we delete it; if it
  // lands on a compatible port, React Flow re-routes it.
  const onConnectStart: OnConnectStart = useCallback(
    (_e, params) => {
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
    },
    [getNode]
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      const origin = connectFrom.current
      connectFrom.current = null
      if (reconnecting.current) return
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

  // After the picker adds + auto-wires a node from a dropped noodle, nudge the
  // node so its *connected* handle sits where the noodle was dropped (rather
  // than the node's top-left). React Flow only knows the handle's offset once
  // the node is measured, so poll a few frames for its handleBounds. When
  // `alignTopWith` names the source node, the new node's top is aligned with
  // that node's top instead of vertically anchoring the handle, so a chain
  // built by dragging noodles reads as a tidy row.
  const anchorHandleToDrop = useCallback(
    (nodeId: string, handleId: string, dropFlow: { x: number; y: number }, alignTopWith?: string) => {
      let tries = 0
      const tryAnchor = () => {
        const bounds = getInternalNode(nodeId)?.internals.handleBounds
        const handle =
          bounds?.target?.find((h) => h.id === handleId) ??
          bounds?.source?.find((h) => h.id === handleId)
        if (handle) {
          const position = anchorPosition(dropFlow, handle)
          const sourceNode = alignTopWith ? getNode(alignTopWith) : undefined
          if (sourceNode) position.y = sourceNode.position.y
          onNodesChange([{ id: nodeId, type: 'position', position }])
        } else if (tries++ < 30) {
          requestAnimationFrame(tryAnchor)
        }
      }
      requestAnimationFrame(tryAnchor)
    },
    [getInternalNode, getNode, onNodesChange]
  )

  // Unplug a noodle: grab its input (target) end and drop it on empty space to
  // disconnect, or onto another compatible port to re-route.
  const onReconnectStart = useCallback(() => {
    reconnecting.current = true
    reconnectLanded.current = false
    connectFrom.current = null
  }, [])

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
      reconnecting.current = false
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

  const findSpliceTarget = useCallback((
    position: Pt,
    def: (typeof NODE_LIBRARY)[number],
    preferredEdgeId?: string,
    excludedNodeId?: string,
  ): { edgeId: string; inHandle: string; outHandle: string; color: string } | null => {
    let best: { edgeId: string; inHandle: string; outHandle: string; color: string } | null = null
    let bestDist = SPLICE_DIST
    for (const edge of edges) {
      if (preferredEdgeId && edge.id !== preferredEdgeId) continue
      if (excludedNodeId && (edge.source === excludedNodeId || edge.target === excludedNodeId)) continue
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
      const distance = distToSegment(position, sPt, tPt)
      if (!preferredEdgeId && distance >= bestDist) continue
      const outType = (sN.data as { outputs?: Array<{ id: string; dataType: string }> }).outputs
        ?.find((p) => p.id === edge.sourceHandle)?.dataType
      const inType = (tN.data as { inputs?: Array<{ id: string; dataType: string }> }).inputs
        ?.find((p) => p.id === edge.targetHandle)?.dataType
      if (!outType || !inType) continue
      const preferredInput = def.spliceInput
        ? def.inputs.find((p) => p.id === def.spliceInput && portsCompatible(outType, p.dataType))
        : undefined
      const inPort = preferredInput ?? def.inputs.find((p) => portsCompatible(outType, p.dataType))
      const outPort = def.outputs.find((p) => portsCompatible(p.dataType, inType))
      if (inPort && outPort) {
        const category = (sN.data as { category?: string }).category ?? 'output'
        best = {
          edgeId: edge.id,
          inHandle: inPort.id,
          outHandle: outPort.id,
          color: (typeof edge.style?.stroke === 'string' && edge.style.stroke) || CATEGORY_COLOR[category] || '#00bfff',
        }
        bestDist = distance
      }
    }
    return best
  }, [edges, getNode])

  const canvasNodeSpliceTarget = useCallback((node: Node) => {
    const def = NODE_LIBRARY.find((entry) => entry.type === (node.data as { nodeType?: string }).nodeType)
    if (!def || edges.some((edge) => edge.source === node.id || edge.target === node.id)) return null
    const centre = {
      x: node.position.x + (node.measured?.width ?? FALLBACK_W) / 2,
      y: node.position.y + (node.measured?.height ?? FALLBACK_H) / 2,
    }
    const screenCentre = flowToScreenPosition(centre)
    const hoveredEdgeId = hoveredSpliceEdgeAt(screenCentre.x, screenCentre.y)
    const target = (hoveredEdgeId ? findSpliceTarget(centre, def, hoveredEdgeId, node.id) : null)
      ?? findSpliceTarget(centre, def, undefined, node.id)
    return target ? { target, def } : null
  }, [edges, findSpliceTarget, flowToScreenPosition])

  const onNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    const unconnected = !edges.some((edge) => edge.source === node.id || edge.target === node.id)
    setCanvasDragNodeId(unconnected ? node.id : null)
  }, [edges])

  const onNodeDrag: OnNodeDrag = useCallback((event, node) => {
    const match = canvasNodeSpliceTarget(node)
    const wrapper = wrapperRef.current
    if (!match || !wrapper) {
      setSpliceCue(null)
      return
    }
    const pointer = 'clientX' in event ? event : event.touches[0] ?? event.changedTouches[0]
    if (!pointer) return
    const rect = wrapper.getBoundingClientRect()
    setSpliceCue({
      edgeId: match.target.edgeId,
      x: pointer.clientX - rect.left,
      y: pointer.clientY - rect.top,
      label: match.def.label,
      color: match.target.color,
    })
  }, [canvasNodeSpliceTarget])

  const onNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    const match = canvasNodeSpliceTarget(node)
    setCanvasDragNodeId(null)
    setSpliceCue(null)
    if (match) {
      spliceNodeOnEdge(node.id, match.target.edgeId, match.target.inHandle, match.target.outHandle)
      setStatus(`Spliced ${match.def.label} into the connection`, 'success')
      return
    }
    // Preserve the existing quiet cleanup for connected nodes and loose drops.
    spreadNodes()
  }, [canvasNodeSpliceTarget, setStatus, spliceNodeOnEdge, spreadNodes])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'

    const def = NODE_LIBRARY.find((node) => node.type === draggingNodeType)
    const wrapper = wrapperRef.current
    if (!def || !wrapper) {
      setSpliceCue(null)
      return
    }
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const hoveredEdgeId = hoveredSpliceEdge(e.target)
    const target = (hoveredEdgeId ? findSpliceTarget(position, def, hoveredEdgeId) : null)
      ?? findSpliceTarget(position, def)
    if (!target) {
      setSpliceCue(null)
      return
    }
    const rect = wrapper.getBoundingClientRect()
    setSpliceCue({
      edgeId: target.edgeId,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      label: def.label,
      color: target.color,
    })
  }, [draggingNodeType, findSpliceTarget, screenToFlowPosition])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!wrapperRef.current?.contains(e.relatedTarget as ChildNode | null)) setSpliceCue(null)
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setSpliceCue(null)
      setDraggingNodeType(null)

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

      // Use the same hit test that drives the live visual cue, so the highlighted
      // noodle is always the one that receives the dropped node.
      const hoveredEdgeId = hoveredSpliceEdge(e.target)
      const best = (hoveredEdgeId ? findSpliceTarget(position, def, hoveredEdgeId) : null)
        ?? findSpliceTarget(position, def)

      if (best) {
        insertNodeOnEdge(newNode, best.edgeId, best.inHandle, best.outHandle)
        // Nudge the spliced node so its wired input handle sits on the drop
        // point, matching the noodle-drop add flow.
        anchorHandleToDrop(newNode.id, best.inHandle, position)
        setStatus(`Spliced ${def.label} into the connection`, 'success')
      } else {
        addNode(newNode)
      }
    },
    [screenToFlowPosition, addNode, insertNodeOnEdge, instantiatePattern, setStatus, anchorHandleToDrop, findSpliceTarget, setDraggingNodeType]
  )

  const spliceEdgeId = spliceCue?.edgeId ?? null
  const displayEdges = useMemo(() => {
    if (!draggingNodeType && !canvasDragNodeId && !spliceEdgeId) return edges
    return edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data,
        spliceArmed: Boolean(draggingNodeType || canvasDragNodeId),
        splicePreview: edge.id === spliceEdgeId,
      },
    }))
  }, [canvasDragNodeId, draggingNodeType, edges, spliceEdgeId])

  return (
    <div ref={wrapperRef} className={styles.canvas} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <GroupControls />
      {spliceCue && (
        <div
          className={styles.spliceCue}
          style={{
            left: spliceCue.x,
            top: spliceCue.y,
            '--cue-color': spliceCue.color,
          } as React.CSSProperties}
          role="status"
        >
          <span className={styles.spliceCueDot} />
          Release to insert {spliceCue.label}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
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
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
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
        minZoom={0.4}
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
          onPlaced={(nodeId, handleId, flow) =>
            anchorHandleToDrop(nodeId, handleId, flow, canvasMenu.connectFrom?.nodeId)
          }
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
