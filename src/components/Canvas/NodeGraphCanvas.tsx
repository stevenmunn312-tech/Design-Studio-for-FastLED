import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  type FitViewOptions,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '../../state/graphStore'
import { useUiStore } from '../../state/uiStore'
import { usePatternLibrary } from '../../state/patternLibrary'
import { NODE_LIBRARY, CATEGORY_COLOR, portsCompatible } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import StudioNode from './StudioNode'
import GlowEdge from './GlowEdge'
import NodeContextMenu from './NodeContextMenu'
import CanvasContextMenu from './CanvasContextMenu'
import GroupControls from './GroupControls'
import { anchorPosition } from '../../utils/anchorNode'
import { signalPathFor } from '../../utils/signalPath'
import { STARTER_TEMPLATES } from '../../state/starterTemplates'
import { startBlankCanvas, startTemplateById } from '../../utils/startFlow'
import { usePreviewStore } from '../../state/previewStore'
import { playNoodleConnectSfx, playNoodleDisconnectSfx } from '../../audio/interactionSfx'
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
const FALLBACK_W = 240
const FALLBACK_H = 70
const DEFAULT_SIDEBAR_W = 280
const DEFAULT_PREVIEW_W = 496
const FIT_VIEW_GUTTER = 32

const fitViewEase = (t: number) => 1 - Math.pow(1 - t, 3)

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

function hoveredNodeId(eventTarget: EventTarget | null): string | undefined {
  if (!(eventTarget instanceof Element)) return undefined
  return eventTarget.closest('.react-flow__node')?.getAttribute('data-id') ?? undefined
}

function panelInsetPx(cssVar: '--sidebar-width' | '--right-panel-width', fallback: number, open: boolean): number {
  if (!open || typeof window === 'undefined') return 0
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function NodeGraphCanvasInner() {
  const { nodes, edges, selectedNodeId, onNodesChange, onEdgesChange, onConnect, selectNode, addNode, insertNodeOnEdge, spliceNodeOnEdge, spreadNodes, instantiatePattern, addToCollection, addPatternToCollection, enterGraph, removeEdge, reconnectNoodle } =
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
  // Grabbing the input dot itself is easier than hitting React Flow's tiny
  // reconnect anchor. Track that direct-detach gesture so the old edge can be
  // removed up front and the trailing connect-end can report an unplug.
  const detaching = useRef<{ edgeId: string } | null>(null)
  // Origin of an in-progress connection dragged from an output port; used to
  // offer a type-filtered "add node" picker when the noodle is dropped on
  // empty space, then auto-wire the new node to this output.
  const connectFrom = useRef<{ nodeId: string; handleId: string; dataType: string } | null>(null)
  // Timestamp of the last drag-to-create picker open, so the trailing pane
  // click that React Flow emits right after the drop doesn't close it.
  const menuOpenedAt = useRef(0)
  const { screenToFlowPosition, flowToScreenPosition, getNode, getInternalNode, setCenter, getZoom, fitView } = useReactFlow()
  const {
    setStatus,
    setSparkPort,
    setViewCenter,
    draggingNodeType,
    setDraggingNodeType,
    sidebarOpen,
    previewPanelOpen,
    performanceMode,
    reducedMotion,
    fitViewRequest,
    uiEffectsEnabled,
    openTemplates,
    lastStartChoice,
  } = useUiStore()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const leftInset = panelInsetPx('--sidebar-width', DEFAULT_SIDEBAR_W, sidebarOpen)
  const rightInset = panelInsetPx('--right-panel-width', DEFAULT_PREVIEW_W, previewPanelOpen)
  const fitViewOptions = useMemo<FitViewOptions>(() => ({
    padding: {
      top: `${FIT_VIEW_GUTTER}px`,
      right: `${rightInset + FIT_VIEW_GUTTER}px`,
      bottom: `${FIT_VIEW_GUTTER}px`,
      left: `${leftInset + FIT_VIEW_GUTTER}px`,
    },
    duration: reducedMotion ? 0 : 260,
    ease: fitViewEase,
  }), [leftInset, reducedMotion, rightInset])
  const [spliceCue, setSpliceCue] = useState<{
    edgeId: string
    x: number
    y: number
    label: string
    color: string
  } | null>(null)
  // Hovering a dragged Pattern Library card over a PatternCollection node —
  // dropping there absorbs the pattern directly instead of spawning a Group.
  const [collectionDropCue, setCollectionDropCue] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [canvasDragNodeId, setCanvasDragNodeId] = useState<string | null>(null)
  const [connectionPulse, setConnectionPulse] = useState<{
    source: string
    target: string
    sourceHandle: string | null
    targetHandle: string | null
    key: number
  } | null>(null)
  const [connectionRipple, setConnectionRipple] = useState<{
    key: number
    sourceX: number
    sourceY: number
    x: number
    y: number
    color: string
  } | null>(null)
  const pulseTimer = useRef<number | undefined>(undefined)
  const rippleTimer = useRef<number | undefined>(undefined)
  const sparkDelayTimer = useRef<number | undefined>(undefined)
  const sparkClearTimer = useRef<number | undefined>(undefined)
  const beatNow = usePreviewStore((s) => {
    for (const output of s.outputs.values()) if (output.beat === true) return true
    return false
  })
  const selectedNodeLabel = useMemo(() => {
    if (!selectedNodeId) return null
    const node = nodes.find((entry) => entry.id === selectedNodeId)
    return node ? String((node.data as { label?: string }).label ?? 'signal path') : null
  }, [nodes, selectedNodeId])
  const lastBeat = useRef(false)
  const [beatRippleKey, setBeatRippleKey] = useState(0)
  const hasTerminalFrame = useMemo(() => {
    const terminalIds = new Set(nodes
      .filter((node) => ['MatrixOutput', 'GroupOutput'].includes(String((node.data as { nodeType?: string }).nodeType)))
      .map((node) => node.id))
    return edges.some((edge) => terminalIds.has(edge.target) && edge.targetHandle === 'frame')
  }, [edges, nodes])
  const hasAudioGraph = useMemo(() => nodes.some((node) => {
    const data = node.data as { category?: string; nodeType?: string }
    return data.category === 'audio' || data.nodeType === 'MicInput'
  }), [nodes])
  const hasShowGraph = useMemo(() => nodes.some((node) => (node.data as { category?: string }).category === 'show'), [nodes])
  const hasPatternGraph = useMemo(() => nodes.some((node) => (node.data as { category?: string }).category === 'pattern'), [nodes])
  const lastStartLabel = useMemo(() => (
    lastStartChoice === 'blank'
      ? 'Blank canvas'
      : STARTER_TEMPLATES.find((template) => template.id === lastStartChoice)?.name ?? null
  ), [lastStartChoice])

  useEffect(() => {
    if (!uiEffectsEnabled) return
    if (beatNow && !lastBeat.current) setBeatRippleKey((key) => key + 1)
    lastBeat.current = beatNow
  }, [beatNow, uiEffectsEnabled])

  useEffect(() => () => {
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current)
    if (rippleTimer.current) window.clearTimeout(rippleTimer.current)
    if (sparkDelayTimer.current) window.clearTimeout(sparkDelayTimer.current)
    if (sparkClearTimer.current) window.clearTimeout(sparkClearTimer.current)
  }, [])

  useEffect(() => {
    if (!uiEffectsEnabled) return
    let lastUpdate = 0
    return usePreviewStore.subscribe((state) => {
      const now = performance.now()
      if (now - lastUpdate < 100) return
      lastUpdate = now
      const strongest = Array.from(state.signals.values())
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 3)
      const primary = strongest[0]
      const secondary = strongest[1]
      const tertiary = strongest[2]
      let focusEnergy = 0
      if (selectedNodeId) {
        const selectedNode = nodes.find((entry) => entry.id === selectedNodeId)
        const outputs = (selectedNode?.data as { outputs?: Array<{ id: string }> } | undefined)?.outputs ?? []
        for (const output of outputs) {
          const signal = state.signals.get(`${selectedNodeId}:${output.id}`)
          if (signal) focusEnergy = Math.max(focusEnergy, signal.energy)
        }
      }
      const wrapper = wrapperRef.current
      if (!wrapper) return
      wrapper.style.setProperty('--field-color', primary?.emissive ?? 'rgb(0 191 255)')
      wrapper.style.setProperty('--field-color-2', secondary?.emissive ?? 'rgb(255 77 141)')
      wrapper.style.setProperty('--field-color-3', tertiary?.emissive ?? 'rgb(0 224 164)')
      wrapper.style.setProperty('--field-energy', String(0.16 + (primary?.energy ?? 0) * 0.34))
      wrapper.style.setProperty('--field-focus-energy', String(Math.max(focusEnergy, primary?.energy ?? 0)))
    })
  }, [nodes, selectedNodeId, uiEffectsEnabled])

  const fireConnectionCeremony = useCallback((connection: {
    source: string | null
    target: string | null
    sourceHandle?: string | null
    targetHandle?: string | null
  }) => {
    if (!uiEffectsEnabled) return
    if (!connection.source || !connection.target) return
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current)
    if (sparkDelayTimer.current) window.clearTimeout(sparkDelayTimer.current)
    if (sparkClearTimer.current) window.clearTimeout(sparkClearTimer.current)

    setConnectionPulse({
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
      key: Date.now(),
    })
    pulseTimer.current = window.setTimeout(() => setConnectionPulse(null), 720)

    const targetNode = getNode(connection.target)
    const sourceNode = getNode(connection.source)
    const wrapper = wrapperRef.current
    if (targetNode && wrapper) {
      const sourceScreen = flowToScreenPosition({
        x: (sourceNode?.position.x ?? 0) + (sourceNode?.measured?.width ?? FALLBACK_W),
        y: (sourceNode?.position.y ?? 0) + (sourceNode?.measured?.height ?? FALLBACK_H) / 2,
      })
      const screen = flowToScreenPosition({
        x: targetNode.position.x,
        y: targetNode.position.y + (targetNode.measured?.height ?? FALLBACK_H) / 2,
      })
      const rect = wrapper.getBoundingClientRect()
      const category = (sourceNode?.data as { category?: string } | undefined)?.category ?? 'output'
      setConnectionRipple({
        key: Date.now(),
        sourceX: sourceScreen.x - rect.left,
        sourceY: sourceScreen.y - rect.top,
        x: screen.x - rect.left,
        y: screen.y - rect.top,
        color: CATEGORY_COLOR[category] ?? '#00bfff',
      })
      if (rippleTimer.current) window.clearTimeout(rippleTimer.current)
      rippleTimer.current = window.setTimeout(() => setConnectionRipple(null), 900)
    }

    if (connection.targetHandle) {
      setSparkPort(null)
      sparkDelayTimer.current = window.setTimeout(() => {
        setSparkPort({ nodeId: connection.target!, portId: connection.targetHandle! })
      }, 410)
      sparkClearTimer.current = window.setTimeout(() => setSparkPort(null), 790)
    }
  }, [flowToScreenPosition, getNode, setSparkPort, uiEffectsEnabled])

  const updateCursorField = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!uiEffectsEnabled) return
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    wrapper.style.setProperty('--field-x', `${event.clientX - rect.left}px`)
    wrapper.style.setProperty('--field-y', `${event.clientY - rect.top}px`)
    wrapper.style.setProperty('--field-hover', '0.38')
  }, [uiEffectsEnabled])

  const quietCursorField = useCallback(() => {
    wrapperRef.current?.style.setProperty('--field-hover', '0')
  }, [])

  // Publish the click-to-add drop point (in flow coords) so sidebar clicks land
  // on screen wherever the user has panned. Biased to the left third — vertically
  // centred but offset from the left edge — so new nodes have room to wire right.
  const publishCenter = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const insetLeft = panelInsetPx('--sidebar-width', DEFAULT_SIDEBAR_W, sidebarOpen)
    const insetRight = panelInsetPx('--right-panel-width', DEFAULT_PREVIEW_W, previewPanelOpen)
    const usableWidth = Math.max(0, r.width - insetLeft - insetRight)
    setViewCenter(screenToFlowPosition({
      x: r.left + insetLeft + usableWidth * 0.05,
      y: r.top + r.height / 2,
    }))
  }, [screenToFlowPosition, setViewCenter, sidebarOpen, previewPanelOpen])

  useEffect(() => {
    publishCenter()
  }, [publishCenter])

  const lastFitViewNonce = useRef(0)

  useEffect(() => {
    if (fitViewRequest.nonce === 0 || fitViewRequest.nonce === lastFitViewNonce.current) return
    lastFitViewNonce.current = fitViewRequest.nonce
    void fitView({
      ...fitViewOptions,
      nodes: fitViewRequest.nodeIds?.map((id) => ({ id })),
    })
  }, [fitView, fitViewOptions, fitViewRequest])

  // On pan/zoom: remember the viewport (so a reload restores it) and refresh
  // the click-to-add centre.
  const handleMoveEnd = useCallback<OnMove>((_, vp) => { saveViewport(vp); publishCenter() }, [publishCenter])
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<
    {
      x: number
      y: number
      fx: number
      fy: number
      connectFrom?: { nodeId: string; handleId: string; dataType: string }
      picker?: boolean
    } | null
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
        playNoodleConnectSfx()
        setStatus(`Added “${name}” to the collection`, 'success')
        return
      }
      onConnect(connection)
      // Spread the freshly-connected pair apart if the new noodle is too short.
      spreadNodes()
      fireConnectionCeremony(connection)
      playNoodleConnectSfx()
    },
    [onConnect, spreadNodes, fireConnectionCeremony, getNode, setStatus, addToCollection]
  )

  // Grabbing a connected input dot: let the noodle stay visible while it is
  // being reconnected. If the drag ends on empty space we delete it; if it
  // lands on a compatible port, React Flow re-routes it.
  const onConnectStart: OnConnectStart = useCallback(
    (_e, params) => {
      connectFrom.current = null
      detaching.current = null
      // Dragging out of an output port: remember its type so an empty-space
      // drop can offer a compatible-node picker.
      if (params.handleType === 'source' && params.nodeId) {
        const srcNode = getNode(params.nodeId)
        const out = (srcNode?.data as { outputs?: Array<{ id: string; dataType: string }> })?.outputs
          ?.find((p) => p.id === (params.handleId ?? undefined))
        if (out) connectFrom.current = { nodeId: params.nodeId, handleId: out.id, dataType: out.dataType }
        return
      }
      // Dragging from a connected input handle is an unplug/reroute gesture.
      // Remove the old noodle immediately so dropping on empty leaves the input
      // cleanly disconnected; a valid drop on an output will create a new edge.
      if (params.handleType === 'target' && params.nodeId && params.handleId) {
        const edge = edges.find((entry) => entry.target === params.nodeId && entry.targetHandle === params.handleId)
        if (edge) {
          detaching.current = { edgeId: edge.id }
          removeEdge(edge.id)
        }
      }
    },
    [edges, getNode, removeEdge]
  )

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, state) => {
      const origin = connectFrom.current
      const detached = detaching.current
      connectFrom.current = null
      detaching.current = null
      if (reconnecting.current) return
      if (detached && !state?.toHandle) {
        playNoodleDisconnectSfx()
        setStatus('Noodle unplugged', 'info')
        return
      }
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
      fireConnectionCeremony(newConnection)
      playNoodleConnectSfx()
    },
    [reconnectNoodle, fireConnectionCeremony]
  )

  const onReconnectEnd = useCallback(
    (_e: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectLanded.current) {
        removeEdge(edge.id)
        playNoodleDisconnectSfx()
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

  // Double-clicking empty canvas (not a node/edge/control) opens the node
  // search picker at that point, mirroring the "Add Node" picker from the
  // right-click menu — a faster path for power users who'd rather not leave
  // the keyboard/mouse-drag flow. Double-click on a node still enters a group
  // (see `onNodeDoubleClick`); `zoomOnDoubleClick={false}` on <ReactFlow>
  // frees up the gesture on empty background.
  const onPaneDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.classList.contains('react-flow__pane')) return
      const fp = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      menuOpenedAt.current = Date.now()
      setCanvasMenu({ x: e.clientX, y: e.clientY, fx: fp.x, fy: fp.y, picker: true })
    },
    [screenToFlowPosition]
  )

  // Tab opens the same search picker at the current view centre — a
  // keyboard-only path to add a node without touching the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const el = e.target as HTMLElement | null
      const isTyping = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (isTyping) return
      e.preventDefault()
      const { viewCenter } = useUiStore.getState()
      const screen = flowToScreenPosition(viewCenter)
      menuOpenedAt.current = Date.now()
      setCanvasMenu({ x: screen.x, y: screen.y, fx: viewCenter.x, fy: viewCenter.y, picker: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flowToScreenPosition])

  const onPaneClick = useCallback(() => {
    // A noodle dropped on empty space opens the picker in onConnectEnd, but the
    // browser fires a trailing pane `click` right after (connectionInProgress is
    // already cleared by then), which would instantly close it. Ignore that one.
    if (Date.now() - menuOpenedAt.current < 350) return
    selectNode(null)
    setContextMenu(null)
    setCanvasMenu(null)
  }, [selectNode])

  const onMiniMapClick = useCallback((_: React.MouseEvent, position: { x: number; y: number }) => {
    void setCenter(position.x, position.y, {
      zoom: getZoom(),
      duration: 260,
      ease: (t) => 1 - Math.pow(1 - t, 3),
    })
  }, [getZoom, setCenter])

  const handleStartRainbow = useCallback(() => {
    startTemplateById('rainbow')
  }, [])

  const handleStartAudioDemo = useCallback(() => {
    startTemplateById('audio-spectrum')
  }, [])

  const handleBrowseStarters = useCallback(() => {
    openTemplates()
  }, [openTemplates])

  const handleStartBlank = useCallback(() => {
    startBlankCanvas()
  }, [])

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

    // A Pattern Library card being dragged: only look for a PatternCollection
    // node to hover over (no splicing — pattern drags don't touch edges).
    // `getData` isn't readable during dragover, only `types`, so the cue can't
    // show the pattern's name yet — that's filled in at drop time.
    if (e.dataTransfer.types.includes('application/studio-pattern')) {
      setSpliceCue(null)
      const wrapper = wrapperRef.current
      const hoveredId = hoveredNodeId(e.target)
      const hovered = hoveredId ? getNode(hoveredId) : undefined
      const isCollection = (hovered?.data as { nodeType?: string })?.nodeType === 'PatternCollection'
      if (!wrapper || !hovered || !isCollection) {
        setCollectionDropCue(null)
        return
      }
      const rect = wrapper.getBoundingClientRect()
      setCollectionDropCue({ nodeId: hovered.id, x: e.clientX - rect.left, y: e.clientY - rect.top })
      return
    }
    setCollectionDropCue(null)

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
  }, [draggingNodeType, findSpliceTarget, screenToFlowPosition, getNode])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!wrapperRef.current?.contains(e.relatedTarget as ChildNode | null)) {
      setSpliceCue(null)
      setCollectionDropCue(null)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setSpliceCue(null)
      setCollectionDropCue(null)
      setDraggingNodeType(null)

      // A saved library pattern dropped from the sidebar: dropping it directly
      // on a PatternCollection node absorbs it into the collection (no Group
      // node ever touches the canvas); anywhere else, instantiate it as a
      // Group node at the drop point, same as before.
      const patternId = e.dataTransfer.getData('application/studio-pattern')
      if (patternId) {
        const saved = usePatternLibrary.getState().patterns.find((p) => p.id === patternId)
        if (!saved) return
        const hoveredId = hoveredNodeId(e.target)
        const hovered = hoveredId ? getNode(hoveredId) : undefined
        if (hovered && (hovered.data as { nodeType?: string }).nodeType === 'PatternCollection') {
          addPatternToCollection(hovered.id, saved)
          playNoodleConnectSfx()
          setStatus(`Added “${saved.name}” to the collection`, 'success')
          return
        }
        instantiatePattern(saved, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
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
          properties: resolveDefaultProperties(def.type, def.defaultProperties),
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
    [screenToFlowPosition, addNode, insertNodeOnEdge, instantiatePattern, addPatternToCollection, getNode, setStatus, anchorHandleToDrop, findSpliceTarget, setDraggingNodeType]
  )

  const spliceEdgeId = spliceCue?.edgeId ?? null
  const focusedNodes = useMemo(() => signalPathFor(edges, selectedNodeId), [edges, selectedNodeId])
  const displayEdges = useMemo(() => {
    if (!draggingNodeType && !canvasDragNodeId && !spliceEdgeId && !selectedNodeId && !connectionPulse) return edges
    return edges.map((edge) => {
      const focusState = selectedNodeId
        ? focusedNodes.has(edge.source) && focusedNodes.has(edge.target) ? 'active' : 'dim'
        : undefined
      return {
        ...edge,
        // The selected node's glow (.nodeSelected/.nodePath) reads as "front" even
        // when React Flow's own elevateEdgesOnSelect hasn't kicked in (e.g. a
        // freshly-added node is never RF-`.selected`, only tracked via our own
        // `selectedNodeId`) — without this, its noodle stays at the default
        // z-index and dips behind unrelated nodes it happens to cross.
        zIndex: focusState === 'active' ? 1000 : undefined,
        data: {
          ...edge.data,
          spliceArmed: Boolean(draggingNodeType || canvasDragNodeId),
          splicePreview: edge.id === spliceEdgeId,
          focusState,
          connectionPulse:
            connectionPulse
            && edge.source === connectionPulse.source
            && edge.target === connectionPulse.target
            && edge.sourceHandle === connectionPulse.sourceHandle
            && edge.targetHandle === connectionPulse.targetHandle
              ? connectionPulse.key
              : undefined,
        },
      }
    })
  }, [canvasDragNodeId, connectionPulse, draggingNodeType, edges, focusedNodes, selectedNodeId, spliceEdgeId])

  return (
    <div
      ref={wrapperRef}
      className={`${styles.canvas} ${selectedNodeId ? styles.canvasFocused : ''} ${nodes.length === 0 ? styles.canvasIdle : ''} ${hasAudioGraph ? styles.canvasAudioLive : ''} ${hasShowGraph ? styles.canvasShowLive : ''} ${hasPatternGraph ? styles.canvasPatternLive : ''} ${performanceMode ? styles.canvasPerformance : ''}`}
      style={{ '--canvas-left-inset': `${leftInset}px`, '--canvas-right-inset': `${rightInset}px` } as React.CSSProperties}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPointerMove={updateCursorField}
      onPointerLeave={quietCursorField}
      onDoubleClick={onPaneDoubleClick}
    >
      <GroupControls />
      {selectedNodeLabel && (
        <div className={styles.focusBadge} role="status">
          <span aria-hidden="true" />
          Tracing {selectedNodeLabel}
        </div>
      )}
      {nodes.length === 0 && (
        <div className={styles.emptyField} role="region" aria-label="Start screen">
          {uiEffectsEnabled && <div className={styles.emptyFieldFrame} aria-hidden="true" />}
          <div className={styles.emptyPanel}>
            <span className={styles.emptyEyebrow}>Signal lab idle</span>
            {uiEffectsEnabled && <div className={styles.dormantSignal} aria-hidden="true"><span /></div>}
            {uiEffectsEnabled && <div className={styles.emptyBeacon} aria-hidden="true"><span /></div>}
            <strong>Wake the studio with a first patch</strong>
            <span className={styles.emptySummary}>
              Load something animated in one click, browse the full starter gallery, or stay blank and build from scratch.
            </span>
            <div className={styles.emptyActions}>
              <button type="button" className={`${styles.startAction} ${styles.startActionPrimary}`} onClick={handleStartRainbow}>
                Start with Rainbow
              </button>
              <button type="button" className={`${styles.startAction} ${styles.startActionPrimary}`} onClick={handleStartAudioDemo}>
                Audio-reactive demo
              </button>
              <button type="button" className={styles.startAction} onClick={handleBrowseStarters}>
                Browse starter patches
              </button>
              <button type="button" className={styles.startAction} onClick={handleStartBlank}>
                Blank canvas
              </button>
            </div>
            {lastStartLabel && <div className={styles.emptyMeta}>Last start: {lastStartLabel}</div>}
          </div>
        </div>
      )}
      {nodes.length > 0 && !hasTerminalFrame && (
        <div className={styles.unpatchedFlag} role="status">
          <span aria-hidden="true" /> Output waiting for a frame
        </div>
      )}
      {uiEffectsEnabled && connectionRipple && (
        <div
          key={connectionRipple.key}
          className={styles.connectionRipple}
          style={{
            left: connectionRipple.x,
            top: connectionRipple.y,
            '--ripple-color': connectionRipple.color,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          <span /><span />
        </div>
      )}
      {uiEffectsEnabled && connectionRipple && (
        <div
          key={`source-${connectionRipple.key}`}
          className={styles.connectionLaunch}
          style={{
            left: connectionRipple.sourceX,
            top: connectionRipple.sourceY,
            '--ripple-color': connectionRipple.color,
          } as React.CSSProperties}
          aria-hidden="true"
        >
          <span />
          <span />
        </div>
      )}
      {uiEffectsEnabled && beatRippleKey > 0 && (
        <div key={beatRippleKey} className={styles.beatRipple} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
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
      {collectionDropCue && (
        <div
          className={styles.spliceCue}
          style={{
            left: collectionDropCue.x,
            top: collectionDropCue.y,
            '--cue-color': 'var(--accent-show)',
          } as React.CSSProperties}
          role="status"
        >
          <span className={styles.spliceCueDot} />
          Release to add to collection
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
        zoomOnDoubleClick={false}
        snapToGrid
        snapGrid={SNAP_GRID}
        minZoom={0.4}
        maxZoom={2}
        defaultViewport={initialViewport ?? undefined}
        fitView={!initialViewport}
        fitViewOptions={fitViewOptions}
        deleteKeyCode={['Delete', 'Backspace']}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        style={{ background: 'var(--bg-primary)' }}
        defaultEdgeOptions={{ type: 'glowEdge' }}
        proOptions={{ hideAttribution: true }}
      >
        {uiEffectsEnabled && (
          <div className={styles.atmosphere} aria-hidden="true">
            <div className={styles.signalField} />
            <div className={styles.fieldLattice} />
            <div className={styles.fieldOrbits} />
            <div className={styles.cursorWake} />
            <div className={styles.fieldScan} />
            <div className={styles.focusVeil} />
          </div>
        )}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.06)"
        />
        <Controls
          className={styles.controls}
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-glow)' }}
          fitViewOptions={fitViewOptions}
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={0}
          maskColor="rgba(0,0,0,0.55)"
          style={{ width: 200, height: 150, background: 'var(--bg-panel)', border: '1px solid var(--border-glow)' }}
          className={styles.minimap}
          onClick={onMiniMapClick}
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
          startInPicker={canvasMenu.picker}
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
