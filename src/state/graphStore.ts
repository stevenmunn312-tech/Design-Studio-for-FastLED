import { create, useStore } from 'zustand'
import { temporal } from 'zundo'
import type { TemporalState } from 'zundo'
import {
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  reconnectEdge,
} from '@xyflow/react'
import type { NodeCategory } from '../types'
import { NODE_LIBRARY, portColor } from './nodeLibrary'
import type { GroupRegistry } from './graphEvaluator'
import type { SavedPattern } from './patternLibrary'
import { isPatternContentTrusted, trustPatternContent } from './patternTrust'
import { useNetworkCredentialsStore } from './networkCredentials'
import { retargetedMicPins } from './micPinDefaults'
import { retargetHardwarePins as retargetHardwarePinsFor } from './pinRetarget'
import { useNodeDefaults } from './nodeDefaults'
import { useUiStore } from './uiStore'
import { validateMatrixLayout } from './xyLayout'
import { isLinearForm, outputCanvasDims, outputForm } from './ledOutputForm'
import { emptyBuildProfile, normalizeBuildProfile, type BuildProfile } from '../build/buildProfile'
import { boardProfileById, selectedPhysicalBoardProfile } from '../build/boardProfiles'
import { boardI2cDefault } from '../build/boardI2cDefaults'
import { DEFAULT_BOARD_PROFILE_ID, isHardwareManagedSignalNodeType, isHardwareNodeType, isHardwareOnlyNodeType, ROOT_BOARD_NODE_ID } from './hardware'
import { controllerSettings, DEFAULT_CONTROLLER_SETTINGS } from './controllerSettings'
import {
  type PerformanceDeckConfig,
  type PinnedControl,
  type ParameterScene,
  type MidiBinding,
  type KeyBinding,
  blankDeckConfig,
  normalizeDeckConfig,
  deriveControlShape,
} from './performanceDeck'

export interface StudioNodeData extends Record<string, unknown> {
  label: string
  nodeType: string
  category: NodeCategory
  properties: Record<string, unknown>
}

export type StudioNode = Node<StudioNodeData>
export type StudioEdge = Edge

/** The implicit top-level graph that owns the MatrixOutput. */
export const ROOT_GRAPH_ID = 'root'

export interface GraphMeta {
  id: string
  name: string
  /** Present when this group came from a saved Pattern Library entry. */
  sourcePatternId?: string
}
export interface GraphContent { nodes: StudioNode[]; edges: StudioEdge[] }

/** The pieces of the multi-graph workspace that must survive save/restore on
 *  top of the active `nodes`/`edges` — without these, every group's subgraph
 *  (and thus its preview and codegen) is lost on reload. */
export interface WorkspaceExtras {
  graphData?: Record<string, GraphContent>
  graphs?: Record<string, GraphMeta>
  activeGraphId?: string
  buildProfile?: BuildProfile
  /** See `PersistedWorkspace.trusted` (workspacePersistence.ts). */
  trusted?: boolean
  /** See `PersistedWorkspace.performanceDeck` (workspacePersistence.ts). */
  performanceDeck?: PerformanceDeckConfig
}

interface GraphState {
  // The active graph being edited. Kept at the top level so every existing
  // consumer (`s.nodes`, `s.edges`) and action is unchanged.
  nodes: StudioNode[]
  edges: StudioEdge[]
  selectedNodeId: string | null
  /** Holds one or more copied nodes plus the edges wiring them together
   *  (internal edges only — boundary edges to nodes outside the copy aren't
   *  carried along). */
  clipboard: { nodes: StudioNode[]; edges: StudioEdge[] } | null

  // ── Multi-graph workspace (ADR 0001, Phase 1) ──────────────────────────
  activeGraphId: string
  /** Metadata for every graph: the root plus each pattern group. */
  graphs: Record<string, GraphMeta>
  /** Stored content for every graph EXCEPT the active one (which lives in
   *  `nodes`/`edges` above). */
  graphData: Record<string, GraphContent>

  // ── Trust boundary (todo.md P0) ─────────────────────────────────────────
  /** Whether the active workspace's CustomFormula/FieldFormula/Code nodes may
   *  evaluate their preview logic. `loadGraph` sets this from whatever load
   *  path is calling it; content pulled from outside this browser (share
   *  link, JSON import, project file, pattern drop) is forced `false`
   *  regardless of what it claims about itself — see the callers of
   *  `loadGraph`/`instantiatePattern`/`createCollectionFromPatterns`. */
  trusted: boolean
  /** Explicitly trust the active workspace (the "Trust and run" action). */
  setTrusted: (trusted: boolean) => void

  /** Project-specific physical hardware/build facts for Build Diagram. */
  buildProfile?: BuildProfile
  setBuildProfile: (profile: BuildProfile | undefined) => void
  updateBuildProfile: (updater: (profile: BuildProfile | undefined) => BuildProfile | undefined) => void

  // ── Performance Control Deck ─────────────────────────────────────────────
  /** Pinned controls, parameter scenes, and MIDI/keyboard bindings for the
   *  active project. Kept at the root-graph level only (not stashed per
   *  subgraph in `enterGraph`) — pins reference nodeIds from whichever graph
   *  they were pinned in, and a live performance surface isn't naturally
   *  scoped to a pattern group's subgraph. */
  performanceDeck: PerformanceDeckConfig
  pinProperty: (nodeId: string, propertyKey: string) => void
  unpinProperty: (pinId: string) => void
  renamePin: (pinId: string, label: string) => void
  /** Snapshot every pinned control's current value into a new named scene.
   *  Returns the new scene's id. */
  saveScene: (name: string) => string
  /** Overwrite an existing scene's values with the pins' current values. */
  updateScene: (sceneId: string) => void
  deleteScene: (sceneId: string) => void
  /** Apply every value in a saved scene to its pinned control's node
   *  property, in one atomic, non-undoable step. */
  recallScene: (sceneId: string) => void
  /** Emergency blackout: zero Board.brightness plus every pinned
   *  numeric/boolean control, snapshotting prior values for `restorePanic`.
   *  Excluded from undo history entirely (see `panic`'s implementation). */
  panic: () => void
  restorePanic: () => void
  addMidiBinding: (binding: Omit<MidiBinding, 'id' | 'createdAt'>) => void
  removeMidiBinding: (bindingId: string) => void
  addKeyBinding: (binding: Omit<KeyBinding, 'id' | 'createdAt'>) => void
  removeKeyBinding: (bindingId: string) => void
  /** True while a panic blackout is in effect. Session-only — like
   *  `panicRestoreValues` below, it's a plain top-level field rather than
   *  part of `performanceDeck` so it's automatically excluded from both
   *  `captureWorkspace` (persistence) and zundo's `partialize` (undo, which
   *  tracks graph content only) without any extra bookkeeping. */
  panicActive: boolean
  /** Values captured immediately before the last panic, so `restorePanic`
   *  can put them back. Null when no panic is in effect. */
  panicRestoreValues: { nodeId: string; propertyKey: string; value: unknown }[] | null

  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  /** Add a node. With `centreOnDrop`, the node's `position` is treated as the
   *  point its *centre* should land on once measured (used by click-to-add so
   *  the node appears vertically centred on the drop point rather than hanging
   *  below it). */
  addNode: (node: StudioNode, centreOnDrop?: boolean) => void
  /** Drop-to-splice: insert a node onto an existing edge, rewiring it as
   *  source → node → target (then spread the area so the noodles aren't tiny). */
  insertNodeOnEdge: (node: StudioNode, edgeId: string, inHandle: string, outHandle: string) => void
  /** Splice an unconnected node that already exists on the canvas into an edge. */
  spliceNodeOnEdge: (nodeId: string, edgeId: string, inHandle: string, outHandle: string) => void
  /** Push connected nodes apart so no noodle is uncomfortably short. Only ever
   *  moves nodes rightward, so it tidies a cramped area without disturbing a
   *  layout that already has room. */
  spreadNodes: () => void
  selectNode: (id: string | null) => void
  /** Make `id` the one selected node, setting React Flow's own flags too —
   *  for "take me to this node" actions triggered outside the canvas. */
  focusNode: (id: string) => void
  selectAllNodes: () => void
  /** Deselect every node (Escape) — clears both the marquee/click selection
   *  state on the nodes and the Inspector's `selectedNodeId`. */
  clearSelection: () => void
  updateNodeProperty: (id: string, key: string, value: unknown) => void
  updateNodeProperties: (id: string, updates: Record<string, unknown>) => void
  /** Move every hardware part's app-assigned pins onto `fqbn`'s board,
   *  leaving pins the user has edited exactly where they are. */
  retargetHardwarePins: (fqbn: string, previousBoard?: string) => number
  loadGraph: (nodes: StudioNode[], edges: StudioEdge[], workspace?: WorkspaceExtras) => void
  duplicateNode: (id: string) => void
  /** Duplicate every currently multi-selected node plus the edges wiring them
   *  together — the Ctrl+D counterpart to `copySelection`. Falls back to a
   *  single-node duplicate when fewer than two nodes are selected. */
  duplicateSelection: () => void
  copyNode: (id: string) => void
  /** Copy every currently multi-selected node (`node.selected`) plus the edges
   *  wiring them together, so a selection with internal wiring pastes intact. */
  copySelection: () => void
  pasteNode: (position: { x: number; y: number }) => void
  deleteNode: (id: string) => void
  removeNodeCompletely: (id: string) => void
  deleteSelection: () => void
  disconnectNode: (id: string) => void
  /** Drop `graphData`/`graphs` entries no longer reachable from any Group
   *  node, PatternCollection, clipboard entry, or undo/redo snapshot.
   *  Scheduled automatically after node removals; safe to call any time. */
  pruneOrphanGraphs: () => void
  /** Remove a single edge (a "noodle"), e.g. when unplugged onto empty space. */
  removeEdge: (id: string) => void
  /** Re-route an edge to a new connection when its end is dragged to a port. */
  reconnectNoodle: (oldEdge: StudioEdge, newConnection: Connection) => void

  /** Switch the active graph, stashing the current one. */
  enterGraph: (id: string) => void
  /** Encapsulate the given nodes into a new group, replacing them in the
   *  active graph with a single Group node. Returns the new group id. */
  createGroup: (name: string, nodeIds: string[], options?: CreateGroupOptions) => string
  /** Inline a Group node back into the active graph, deleting its wrapper
   *  subgraph entry once its contents have been restored. */
  ungroupNode: (id: string) => boolean
  /** Drop a copy of a saved library pattern onto the canvas as a Group node,
   *  registering its subgraph under a fresh group id. With `centreOnDrop`, the
   *  Group node settles vertically centred on `position` once measured (see
   *  `addNode`). */
  instantiatePattern: (saved: SavedPattern, position: { x: number; y: number }, centreOnDrop?: boolean) => void
  /** Create a Pattern Collection pre-populated with cloned copies of the given
   *  saved library patterns, registering each as a fresh subgraph in the
   *  workspace so the collection can drive previews/codegen immediately. */
  createCollectionFromPatterns: (
    savedPatterns: SavedPattern[],
    position: { x: number; y: number },
    properties?: Record<string, unknown>,
    centreOnDrop?: boolean,
  ) => void
  /** Absorb a Group node into a PatternCollection: remove it (and its edges)
   *  from the canvas and record its group id in the collection's list. */
  addToCollection: (collectionNodeId: string, groupNodeId: string) => void
  /** Add a saved library pattern directly into a PatternCollection — clones its
   *  subgraph into a fresh group id (like `instantiatePattern`) and appends it to
   *  the collection's list, without ever placing a Group node on the canvas. */
  addPatternToCollection: (collectionNodeId: string, saved: SavedPattern) => void
  /** Add several saved patterns in one collection edit so the picker produces
   *  one coherent graph update instead of a run of per-pattern mutations. */
  addPatternsToCollection: (collectionNodeId: string, saved: SavedPattern[]) => void
  /** Remove a pattern (group id) from a PatternCollection, dropping its subgraph. */
  removeFromCollection: (collectionNodeId: string, groupId: string) => void
  /** Toggle a song-section tag on a collection pattern (section-aware selection).
   *  An empty tag set means the pattern is eligible in any section. */
  togglePatternSection: (collectionNodeId: string, groupId: string, section: string) => void
  /** Replace a collection pattern's whole section-tag set in one go — backs the
   *  "all" chip (selects every section) and its clear-back-to-any toggle. */
  setPatternSections: (collectionNodeId: string, groupId: string, sections: string[]) => void
  /** Add a GroupInput node to the current subgraph so a pattern can expose a role
   *  knob (energy/speed/palette) for show modulation. Only acts inside a group. */
  addGroupInput: () => void
  /** Set a GroupInput's show role: its `paramId` (what the generator drives) plus
   *  its output port dataType (`palette` for the palette role, else `float`). */
  setGroupInputRole: (nodeId: string, role: string) => void
}

/**
 * `graphData` is tracked alongside the active graph's `nodes`/`edges` so an
 * edit to a graph that is *not* the active one is still undoable — which is
 * the case for every hardware edit made while a pattern group is open, since
 * hardware lives in the root graph (see `withRootContent`). It also makes the
 * group-shaped edits (create/instantiate/absorb) restore their subgraph on
 * undo instead of leaving it for the orphan sweep.
 */
type HistorySlice = Pick<GraphState, 'nodes' | 'edges' | 'graphData'>

// Legacy node types folded into bundled nodes (Noise / Math / Transition /
// Blend), mapped to the bundle plus the variant property that selects the old
// behaviour. Graphs exported before consolidation still reference the old
// types; upgrade them on import so they keep working and gain the inline
// variant dropdown.
// Scene-level outputs/sources are left behind in the parent graph when
// encapsulating a selection into a group. MatrixOutput can have several root
// routes; scene-wide hardware/time sources remain singletons in the root graph.
// `Board` is here for a slightly different reason than the rest: it is not a
// route or a live source, it is the controller the whole scene targets. A saved
// pattern must stay board-agnostic, so grouping a selection never seals a board
// choice inside it.
const GROUP_EXCLUDED_TYPES = new Set(['MatrixOutput', 'MicInput', 'DMXInput', 'MusicLibrary', 'Board'])

/** Nodes that represent one scene-wide hardware resource. Creation actions use
 *  this set as a final guard, so every UI path (click, drop, paste, duplicate)
 *  preserves the one-per-canvas invariant. */
export const SINGLETON_NODE_TYPES = new Set(['MicInput', 'DMXInput'])

export function canAddNodeType(nodes: StudioNode[], nodeType: string): boolean {
  return !SINGLETON_NODE_TYPES.has(nodeType) || !nodes.some((n) => n.data.nodeType === nodeType)
}

SINGLETON_NODE_TYPES.add('Board')

export interface CreateGroupOptions {
  /** Saved to the pattern library right after creation (the caller still has
   *  to actually save it — this flag is just threaded through from the dialog). */
  saveToLibrary?: boolean
  /** Node ids (within the selection) whose unconnected `paletteIn` port should
   *  be wired to a shared "palette" show-input role, so a PerformanceGenerator
   *  with "use group inputs" on can replace it per-section. */
  exposePaletteNodeIds?: string[]
}

// Library definitions by type, for refreshing saved nodes on load.
const LIBRARY_DEF = new Map(NODE_LIBRARY.map((def) => [def.type, def]))

// Reload library-backed nodes from the current node library so categories,
// labels, and port definitions stay canonical across save/load. Programmatic
// group-family nodes keep their saved shape.
// Legacy node types folded into another node on load. AnimatedImage merged into
// the single Image node (which now handles stills and animations alike) — its
// `animation`/`playbackRate`/`loop` properties carry over unchanged.
// LedStringOutput was a second output node type for the length of one branch
// phase. It is the same object as every other LED output — one `form` of it —
// so it folds back in, which is also how a string finally acquires the codegen
// it never had as its own type.
const LEGACY_TYPE_RENAME: Record<string, string> = { AnimatedImage: 'Image', LedStringOutput: 'MatrixOutput' }

function normalizeLoadedGraph(nodes: StudioNode[], edges: StudioEdge[]): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const savedBoard = nodes.find((node) => node.data.nodeType === 'Board')
  const savedProfileId = (savedBoard?.data.properties as Record<string, unknown> | undefined)?.profileId
  const rtcDefaults = boardI2cDefault(typeof savedProfileId === 'string' ? savedProfileId : undefined)
  const normalizedNodes = nodes.map((n) => {
    const data = n.data as StudioNodeData
    const wasLedString = data.nodeType === 'LedStringOutput'
    const nodeType = LEGACY_TYPE_RENAME[data.nodeType] ?? data.nodeType
    const def = LIBRARY_DEF.get(nodeType)
    const category: NodeCategory = def?.category ?? data.category
    const label = def?.label ?? data.label
    const properties = { ...data.properties }
    // MicInput analysis used to expose a sample-rate field even though neither
    // preview nor firmware honored it. FastLED's INMP441 pipeline owns the
    // 44.1 kHz rate now, so strip the misleading legacy property on load.
    if (nodeType === 'MicInput') delete properties.sampleRate
    // RTC pins became first-class node properties after the RTC hardware node
    // was introduced. Backfill older saves from their exact board so opening a
    // project exposes the same wiring it was already generating.
    if (nodeType === 'RTCInput') {
      properties.sdaPin ??= rtcDefaults?.sda.arduinoPin ?? 21
      properties.sclPin ??= rtcDefaults?.scl.arduinoPin ?? 22
    }
    // AudioHue's bass/mids/treble mix used to be hardcoded in the evaluator and
    // the C++ generator. It is now three editable weights, so backfill saves
    // made before they existed with the old mix — otherwise the node keeps
    // behaving correctly (both runtimes fall back to it) but never shows the
    // new sliders, since inline editors render from the saved property keys.
    if (nodeType === 'AudioHue') {
      properties.bassWeight   ??= 0.5
      properties.midsWeight   ??= 0.3
      properties.trebleWeight ??= 0.2
    }
    // Circle's and ClockDisplay's `radius` used to be a fixed pixel count
    // regardless of matrix size. scaleWithMatrix now lets it scale
    // proportionally instead — default it explicitly to false on load so a
    // save made before the toggle existed keeps its exact original pixel
    // radius rather than silently picking up the new node-creation default.
    if (nodeType === 'Circle' || nodeType === 'ClockDisplay') {
      properties.scaleWithMatrix ??= false
    }
    // An LED output's shape used to be spelled two ways that never quite meant
    // it — `chipset: 'HUB75'` for a scan panel, `layout: 'strip'` for a run of
    // tape, and no way at all to say "ring". Resolve a saved node's form once,
    // on load, so the rest of the app only ever reads the explicit property.
    // `outputForm` performs the same inference defensively, so a node that
    // reaches it unmigrated still opens as the thing it is.
    if (nodeType === 'MatrixOutput') {
      properties.form ??= wasLedString ? 'strip' : outputForm(properties)
      if (properties.form === 'strip' || properties.form === 'ring') properties.ledCount ??= 60
      // `layout: 'strip'` was only ever a second spelling of 'matrix' — same
      // row-major table — and it is no longer offered, so collapse it rather
      // than leave a saved node pointing at a value its dropdown has dropped.
      if (properties.layout === 'strip') properties.layout = 'matrix'
    }
    // Wi-Fi SSID/password used to be ordinary node properties (persisted into
    // project files and share links). They now live browser-local only in
    // networkCredentials.ts — migrate any already-saved values across, then
    // strip them so they never round-trip through storage again.
    if (nodeType === 'DMXInput' || nodeType === 'RTCInput') {
      const ssid = typeof properties.wifiSsid === 'string' ? properties.wifiSsid : ''
      const password = typeof properties.wifiPassword === 'string' ? properties.wifiPassword : ''
      if (ssid || password) useNetworkCredentialsStore.getState().setCredentials(n.id, { ssid, password })
      delete properties.wifiSsid
      delete properties.wifiPassword
    }
    const inputs = def?.inputs ?? (Array.isArray(data.inputs) ? data.inputs : [])
    const outputs = def?.outputs ?? (Array.isArray(data.outputs) ? data.outputs : [])
    // A hardware-only part is hidden wherever it came from — a template, an
    // older save, a share link — rather than relying on every creation path to
    // remember. Board has always been forced this way; the rest join it.
    const hidden = isHardwareOnlyNodeType(nodeType)
      ? { hidden: true, selectable: false, draggable: false }
      : {}
    return { ...n, ...hidden, data: { ...data, nodeType, label, category, properties, inputs, outputs } }
  })
  return { nodes: normalizedNodes, edges: edges.map((e) => ({ ...e })) }
}

/**
 * Wiring a frame into a second LED output puts it on the first one's pin.
 *
 * Two runs showing the same frame are, by default, the same run twice: both
 * data lines on one GPIO, both panels lit identically. That is the setup people
 * actually build, and allocating a fresh GPIO for it made the app disagree with
 * the bench — and raised a pin conflict when the user then wired it truthfully.
 * `outputMirrorLeaders` reads the result back, so the generated sketch emits one
 * controller for the pair.
 *
 * Only a default. Editing the pin afterwards splits them into two independent
 * runs again, which is also a real setup and stays supported.
 */
function withAdoptedMirrorPin(
  nodes: StudioNode[],
  edges: StudioEdge[],
  connection: Connection,
): StudioNode[] {
  if ((connection.targetHandle ?? '') !== 'frame' || !connection.target || !connection.source) return nodes
  const target = nodes.find((n) => n.id === connection.target)
  if (!target || target.data.nodeType !== 'MatrixOutput') return nodes
  // A HUB75 panel has a signal ribbon rather than a data pin to share.
  if (outputForm(target.data.properties as Record<string, unknown>) === 'hub75') return nodes

  const feedKey = `${connection.source}:${connection.sourceHandle ?? 'frame'}`
  const sibling = nodes.find((node) => {
    if (node.id === target.id || node.data.nodeType !== 'MatrixOutput') return false
    if (outputForm(node.data.properties as Record<string, unknown>) === 'hub75') return false
    return edges.some((edge) =>
      edge.target === node.id
      && (edge.targetHandle ?? 'frame') === 'frame'
      && `${edge.source}:${edge.sourceHandle ?? 'frame'}` === feedKey)
  })
  if (!sibling) return nodes

  const pin = (sibling.data.properties as Record<string, unknown>).dataPin
  if (typeof pin !== 'number' || (target.data.properties as Record<string, unknown>).dataPin === pin) return nodes
  return nodes.map((node) => node.id === target.id
    ? { ...node, data: { ...node.data, properties: { ...node.data.properties, dataPin: pin } } }
    : node)
}

function createRootBoardNode(profileId = DEFAULT_BOARD_PROFILE_ID, settings = DEFAULT_CONTROLLER_SETTINGS): StudioNode {
  const profile = boardProfileById(profileId)
  return {
    id: ROOT_BOARD_NODE_ID,
    type: 'studioNode',
    position: { x: -720, y: -360 },
    hidden: true,
    selectable: false,
    draggable: false,
    data: {
      label: 'Board',
      nodeType: 'Board',
      category: 'output',
      properties: { profileId: profile?.id ?? DEFAULT_BOARD_PROFILE_ID, ...settings },
      inputs: [],
      outputs: [],
    },
  } as StudioNode
}

/**
 * `fallbackProfileId` carries a board the workspace already named elsewhere —
 * a project saved before the Board node existed recorded its exact board on
 * the build profile instead. Adopting it here is what stops that project from
 * loading as the generic default and quietly re-describing someone's wiring
 * for a board they did not choose.
 */
function ensureRootBoardNode(nodes: StudioNode[], fallbackProfileId?: string): StudioNode[] {
  const fallback = (fallbackProfileId && boardProfileById(fallbackProfileId)?.id) || DEFAULT_BOARD_PROFILE_ID
  const boardNodes = nodes.filter((node) => node.data.nodeType === 'Board')
  const legacySettings = controllerSettings(nodes.filter((node) => node.data.nodeType !== 'Board'))
  if (boardNodes.length === 0) return [...nodes, createRootBoardNode(fallback, legacySettings)]
  const [primary, ...extras] = boardNodes
  const primaryProps = (primary.data.properties ?? {}) as Record<string, unknown>
  const explicitProfileId = typeof primaryProps.profileId === 'string' && primaryProps.profileId
    ? primaryProps.profileId
    : fallback
  const migratedSettings = Object.fromEntries(
    Object.entries(legacySettings).map(([key, value]) => [key, primaryProps[key] ?? value]),
  )
  return nodes
    .filter((node) => !extras.some((extra) => extra.id === node.id))
    .map((node) => {
      if (node.id !== primary.id) return node
      return {
        ...node,
        hidden: true,
        selectable: false,
        draggable: false,
        data: {
          ...node.data,
          label: 'Board',
          category: 'output',
          properties: { ...DEFAULT_CONTROLLER_SETTINGS, ...migratedSettings, ...node.data.properties, profileId: explicitProfileId },
          inputs: [],
          outputs: [],
        },
      }
    })
}

function removeNodeAndEdges(
  nodes: StudioNode[],
  edges: StudioEdge[],
  selectedNodeId: string | null,
  performanceDeck: PerformanceDeckConfig,
  removedIds: Set<string>,
) {
  return {
    nodes: nodes.filter((node) => !removedIds.has(node.id)),
    edges: edges.filter((edge) => !removedIds.has(edge.source ?? '') && !removedIds.has(edge.target ?? '')),
    selectedNodeId: selectedNodeId && removedIds.has(selectedNodeId) ? null : selectedNodeId,
    performanceDeck: {
      ...performanceDeck,
      pins: performanceDeck.pins.filter((pin) => !removedIds.has(pin.nodeId)),
    },
  }
}

// Minimum horizontal clearance to keep between a node's right edge and the left
// edge of a node it feeds — anything tighter makes for a cramped, stubby noodle.
const MIN_NODE_GAP = 60
const DEFAULT_NODE_W = 180
const DEFAULT_NODE_H = 100

// Nodes added via "click to add" want to settle centred on the drop point, but
// their real height is only known after React Flow measures them. This maps a
// pending node id → the flow-y its *centre* should land on; onNodesChange
// consumes it on the first `dimensions` change (ResizeObserver-driven, so it
// fires even in a background tab, unlike requestAnimationFrame).
const pendingCentreY = new Map<string, number>()

// Walk edges left-to-right and shift any target that crowds its source rightward
// to restore MIN_NODE_GAP. "Crowds" means too close horizontally *and*
// overlapping vertically — so a pair you've deliberately stacked vertically (a
// long noodle dropping down a column) is left alone; only genuinely cramped /
// overlapping connected nodes move. We only ever push right and process sources
// in x order, so one pass cascades down a chain and always terminates. X is
// snapped to the 20px canvas grid.
function spreadNodesByEdges(nodes: StudioNode[], edges: StudioEdge[]): StudioNode[] {
  const x = new Map(nodes.map((n) => [n.id, n.position.x]))
  const y = new Map(nodes.map((n) => [n.id, n.position.y]))
  const w = new Map(nodes.map((n) => [n.id, n.measured?.width ?? DEFAULT_NODE_W]))
  const h = new Map(nodes.map((n) => [n.id, n.measured?.height ?? DEFAULT_NODE_H]))
  const ordered = [...edges].sort((a, b) => (x.get(a.source!) ?? 0) - (x.get(b.source!) ?? 0))
  let changed = false
  for (const e of ordered) {
    const sx = x.get(e.source!)
    const tx = x.get(e.target!)
    if (sx === undefined || tx === undefined) continue
    const sw = w.get(e.source!) ?? DEFAULT_NODE_W
    const gapH = tx - (sx + sw)
    const sCy = (y.get(e.source!) ?? 0) + (h.get(e.source!) ?? DEFAULT_NODE_H) / 2
    const tCy = (y.get(e.target!) ?? 0) + (h.get(e.target!) ?? DEFAULT_NODE_H) / 2
    const vOverlap = Math.abs(sCy - tCy) < ((h.get(e.source!) ?? DEFAULT_NODE_H) + (h.get(e.target!) ?? DEFAULT_NODE_H)) / 2
    if (gapH < MIN_NODE_GAP && vOverlap) {
      x.set(e.target!, Math.round((sx + sw + MIN_NODE_GAP) / 20) * 20)
      changed = true
    }
  }
  if (!changed) return nodes
  return nodes.map((n) => {
    const nx = x.get(n.id)
    return nx !== undefined && nx !== n.position.x ? { ...n, position: { ...n.position, x: nx } } : n
  })
}

function edgeStrokeForPort(node: StudioNode | undefined, handleId: string | undefined): string {
  if (!node || !handleId) return '#00bfff'
  const data = node.data as StudioNodeData & {
    inputs?: { id: string; dataType: string }[]
    outputs?: { id: string; dataType: string }[]
  }
  const port = [...(data.outputs ?? []), ...(data.inputs ?? [])].find((p) => p.id === handleId)
  return portColor(port?.dataType ?? 'float')
}

function studioNodeType(node: StudioNode | undefined): string {
  return String(node?.data.nodeType ?? '')
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base
  let suffix = 1
  while (used.has(candidate)) candidate = `${base}-${suffix++}`
  used.add(candidate)
  return candidate
}

// ── Orphaned-subgraph cleanup ────────────────────────────────────────────────
// Deleting a Group node removes the node but not its stashed subgraph, so
// `graphData` would otherwise accumulate unreachable pattern groups for the
// whole session — and persist them into the project autosave. A subgraph is
// alive while a Group node or PatternCollection references it from the active
// graph, a stashed subgraph, the clipboard, or an undo/redo snapshot (so an
// undoable Group deletion keeps its subgraph restorable).

function collectGraphRefs(nodes: StudioNode[], into: string[]): void {
  for (const node of nodes) {
    const props = node.data?.properties as { groupId?: unknown; patternIds?: unknown } | undefined
    if (typeof props?.groupId === 'string') into.push(props.groupId)
    if (Array.isArray(props?.patternIds)) {
      for (const id of props.patternIds) if (typeof id === 'string') into.push(id)
    }
  }
}

/** Compute the pruned `graphData`/`graphs`, or null when nothing is orphaned.
 *  `extraNodeLists` supplies node arrays outside the workspace itself (undo
 *  snapshots, clipboard) whose references must also be treated as live. */
function pruneOrphanGraphData(
  s: Pick<GraphState, 'nodes' | 'graphData' | 'graphs' | 'activeGraphId'>,
  extraNodeLists: StudioNode[][],
): Pick<GraphState, 'graphData' | 'graphs'> | null {
  const queue: string[] = [ROOT_GRAPH_ID, s.activeGraphId]
  collectGraphRefs(s.nodes, queue)
  for (const nodes of extraNodeLists) collectGraphRefs(nodes, queue)
  const reachable = new Set<string>()
  while (queue.length) {
    const id = queue.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const content = s.graphData[id]
    if (content) collectGraphRefs(content.nodes, queue)
  }
  const orphans = Object.keys(s.graphData).filter((id) => !reachable.has(id))
  if (orphans.length === 0) return null
  const graphData = { ...s.graphData }
  const graphs = { ...s.graphs }
  for (const id of orphans) {
    delete graphData[id]
    delete graphs[id]
  }
  return { graphData, graphs }
}

/** Every group (recursively) reachable from `nodes` via Group/PatternCollection
 *  references, scoped to `graphData` — the registry an export needs to carry
 *  alongside `nodes` so nested Group instances resolve to the right content
 *  instead of being silently unresolvable. Mirrors `pruneOrphanGraphData`'s
 *  traversal but returns the positive registry rather than the orphan set. */
export function reachableGroupRegistry(
  nodes: StudioNode[],
  graphData: Record<string, GraphContent>,
): Record<string, GraphContent> {
  const queue: string[] = []
  collectGraphRefs(nodes, queue)
  const reachable = new Set<string>()
  const result: Record<string, GraphContent> = {}
  while (queue.length) {
    const id = queue.pop()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const content = graphData[id]
    if (content) {
      result[id] = content
      collectGraphRefs(content.nodes, queue)
    }
  }
  return result
}

// The sweep must not run until zundo has pushed the pre-delete snapshot, and
// that push is itself debounced (400 ms after the *last* set in a burst). So
// the prune fires only after the store has been quiet for a full second: any
// state change while it is pending pushes it back (see the subscription below
// the store), which guarantees the snapshot is in `pastStates` first.
// ── Per-graph undo history ───────────────────────────────────────────────────
// zundo tracks only the *active* graph's nodes/edges, so a step recorded in one
// graph must never be applied while another is active. Entering a group used to
// resolve that by clearing history outright — correct, but it meant double-
// clicking into a group to nudge one slider and coming back out silently threw
// away everything the user could previously undo. Instead, each graph's stacks
// are stashed here on the way out and restored on the way back in, so history
// follows the graph it belongs to.
type HistoryStacks = { pastStates: Partial<HistorySlice>[]; futureStates: Partial<HistorySlice>[] }
const stashedHistory = new Map<string, HistoryStacks>()

function stashActiveHistory(graphId: string): void {
  const { pastStates, futureStates } = useGraphStore.temporal.getState()
  if (pastStates.length === 0 && futureStates.length === 0) {
    stashedHistory.delete(graphId)
    return
  }
  stashedHistory.set(graphId, { pastStates: [...pastStates], futureStates: [...futureStates] })
}

/**
 * A stashed snapshot remembers every *other* graph as it stood when this graph
 * was last active, and those graphs can have moved on since — the user stepped
 * out, edited the parent, and came back. Restoring such a snapshot verbatim
 * would roll those edits back, so each one adopts the current `graphData` on
 * the way in: the step still undoes this graph's own `nodes`/`edges`, and
 * leaves every other graph alone. The cost is that a hardware edit made in an
 * earlier visit stops being undoable once you leave and return, which is the
 * safe direction to be wrong in.
 */
function restoreStashedHistory(graphId: string): void {
  const stacks = stashedHistory.get(graphId)
  stashedHistory.delete(graphId)
  const graphData = useGraphStore.getState().graphData
  const rebase = (snapshots: Partial<HistorySlice>[]) =>
    snapshots.map((snapshot) => (snapshot.graphData ? { ...snapshot, graphData } : snapshot))
  useGraphStore.temporal.setState({
    pastStates: rebase(stacks?.pastStates ?? []),
    futureStates: rebase(stacks?.futureStates ?? []),
  })
}

/** Forget every stashed stack — used wherever history is genuinely invalidated
 *  (loading a project, restoring a snapshot), so a stale stack can't come back
 *  when the user next enters a group that happens to reuse an id. */
export function clearStashedGraphHistory(): void {
  stashedHistory.clear()
}

/** Every node array held by the undo/redo history — the live stacks plus the
 *  per-graph stashes above, since a stashed step can still be the only thing
 *  referencing a subgraph and the orphan sweep must not collect it. Annotated
 *  (not inferred) so the store creator can call it without a circular type
 *  dependency on the store's own inferred type. */
function historyNodeLists(): StudioNode[][] {
  const history = useGraphStore.temporal.getState()
  const lists: StudioNode[][] = [
    ...history.pastStates.map((snapshot) => snapshot.nodes ?? []),
    ...history.futureStates.map((snapshot) => snapshot.nodes ?? []),
  ]
  for (const stacks of stashedHistory.values()) {
    for (const snapshot of stacks.pastStates) lists.push(snapshot.nodes ?? [])
    for (const snapshot of stacks.futureStates) lists.push(snapshot.nodes ?? [])
  }
  return lists
}

const ORPHAN_PRUNE_DELAY_MS = 1_000
let orphanPruneTimer: ReturnType<typeof setTimeout> | undefined
function scheduleOrphanGraphPrune(): void {
  if (orphanPruneTimer) clearTimeout(orphanPruneTimer)
  orphanPruneTimer = setTimeout(() => {
    orphanPruneTimer = undefined
    useGraphStore.getState().pruneOrphanGraphs()
  }, ORPHAN_PRUNE_DELAY_MS)
}

// A burst of rapid edits (dragging a slider, typing in a text field) calls
// zundo's handleSet once per tick/keystroke. Debouncing it naively would keep
// only the *last* call's pastState — undoing the burst would then revert just
// the final tiny increment instead of the whole gesture. So pin the pastState
// from the first call in a burst, and only push a snapshot once the burst has
// gone quiet, using the most recent currentState/deltaState by then.
function debounceHandleSet<Fn extends (pastState: never, replace: never, currentState: never, deltaState?: never) => void>(
  fn: Fn,
  ms: number
): Fn {
  type Args = Parameters<Fn>
  let timer: ReturnType<typeof setTimeout> | undefined
  let burstStart: Args[0] | undefined
  return ((...args: Args) => {
    const [pastState, replace, currentState, deltaState] = args
    if (timer === undefined) burstStart = pastState
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      fn(burstStart as Args[0], replace, currentState, deltaState)
    }, ms)
  }) as Fn
}

// React Flow's `selected` flag is per-node UI state, not an undoable graph
// edit (see the `partialize` comment below) — compare nodes ignoring it so a
// plain click-to-select doesn't produce its own history entry. `applyChanges`
// (xyflow) always shallow-copies a touched node (`{ ...element }`) and mutates
// only the fields a change actually touches, so every other field keeps its
// prior reference — a per-field reference compare is safe and cheap here.
function nodeEqualIgnoringSelection(a: StudioNode, b: StudioNode): boolean {
  if (a === b) return true
  // A node that has never been selected has no `selected` key at all (xyflow
  // only adds it once a 'select' change lands), so union rather than
  // intersect the two key sets before ignoring `selected`.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof StudioNode>
  keys.delete('selected')
  for (const k of keys) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function nodesEqualIgnoringSelection(a: StudioNode[], b: StudioNode[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((n, i) => nodeEqualIgnoringSelection(n, b[i]))
}

// While a node is mid-drag, the `equality` option below treats every
// per-pointer-move set() as unchanged so history isn't spammed with one
// snapshot per frame. That means the pastState zundo would otherwise hand to
// handleSet once the drag ends is whatever set() ran right before — a
// mid-drag frame, not the state from before the drag started. Stash the real
// pre-drag state the moment dragging begins, and swap it back in for the
// post-drag push (see `handleSet` below) so a single Undo reverts the whole
// gesture instead of landing on an almost-identical mid-drag frame.
let preDragHistoryState: HistorySlice | undefined

export const useGraphStore = create<GraphState>()(
  temporal(
    (set) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      clipboard: null,

      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},

      trusted: true,
      setTrusted: (trusted) =>
        set((s) => {
          if (trusted) {
            // Explicit trust ("Trust and run") also remembers the exact content of
            // any library-sourced patterns currently on the workspace, so dropping
            // the same pattern again later doesn't force this prompt a second time.
            for (const [graphId, meta] of Object.entries(s.graphs)) {
              if (!meta.sourcePatternId) continue
              const sub = s.graphData[graphId]
              if (sub) trustPatternContent(sub)
            }
          }
          return { trusted }
        }),
      buildProfile: undefined,
      setBuildProfile: (buildProfile) => set({ buildProfile: buildProfile ? normalizeBuildProfile(buildProfile) : undefined }),
      updateBuildProfile: (updater) =>
        set((s) => ({
          buildProfile: (() => {
            const next = updater(s.buildProfile)
            return next ? normalizeBuildProfile(next) ?? emptyBuildProfile() : undefined
          })(),
        })),

      performanceDeck: blankDeckConfig(),
      panicActive: false,
      panicRestoreValues: null,

      pinProperty: (nodeId, propertyKey) =>
        set((s) => {
          if (s.performanceDeck.pins.some((p) => p.nodeId === nodeId && p.propertyKey === propertyKey)) return s
          const node = s.nodes.find((n) => n.id === nodeId)
          if (!node) return s
          const value = node.data.properties[propertyKey]
          const shape = deriveControlShape(node.data.nodeType, propertyKey, value)
          const pin: PinnedControl = {
            id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            nodeId,
            propertyKey,
            label: `${node.data.label} · ${propertyKey}`,
            createdAt: Date.now(),
            ...shape,
          }
          return { performanceDeck: { ...s.performanceDeck, pins: [...s.performanceDeck.pins, pin] } }
        }),

      unpinProperty: (pinId) =>
        set((s) => ({
          performanceDeck: { ...s.performanceDeck, pins: s.performanceDeck.pins.filter((p) => p.id !== pinId) },
        })),

      renamePin: (pinId, label) =>
        set((s) => ({
          performanceDeck: {
            ...s.performanceDeck,
            pins: s.performanceDeck.pins.map((p) => (p.id === pinId ? { ...p, label } : p)),
          },
        })),

      saveScene: (name) => {
        const id = `scene-${Date.now()}`
        set((s) => {
          const now = Date.now()
          const values: Record<string, unknown> = {}
          for (const pin of s.performanceDeck.pins) {
            const node = s.nodes.find((n) => n.id === pin.nodeId)
            if (node) values[pin.id] = node.data.properties[pin.propertyKey]
          }
          const scene: ParameterScene = { id, name: name.trim() || 'Untitled scene', values, createdAt: now, updatedAt: now }
          return { performanceDeck: { ...s.performanceDeck, scenes: [...s.performanceDeck.scenes, scene] } }
        })
        return id
      },

      updateScene: (sceneId) =>
        set((s) => {
          const now = Date.now()
          const values: Record<string, unknown> = {}
          for (const pin of s.performanceDeck.pins) {
            const node = s.nodes.find((n) => n.id === pin.nodeId)
            if (node) values[pin.id] = node.data.properties[pin.propertyKey]
          }
          return {
            performanceDeck: {
              ...s.performanceDeck,
              scenes: s.performanceDeck.scenes.map((sc) => (sc.id === sceneId ? { ...sc, values, updatedAt: now } : sc)),
            },
          }
        }),

      deleteScene: (sceneId) =>
        set((s) => ({
          performanceDeck: { ...s.performanceDeck, scenes: s.performanceDeck.scenes.filter((sc) => sc.id !== sceneId) },
        })),

      recallScene: (sceneId) => {
        // A scene jump is one atomic operation, not a gesture — exclude it
        // from undo history entirely (mirrors enterGraph's navigation pause),
        // rather than let it land as an ordinary (if coalesced) undo step.
        const temporalApi = useGraphStore.temporal.getState()
        temporalApi.pause()
        set((s) => {
          const scene = s.performanceDeck.scenes.find((sc) => sc.id === sceneId)
          if (!scene) return s
          const pinsById = new Map(s.performanceDeck.pins.map((p) => [p.id, p]))
          const nodes = s.nodes.map((n) => {
            let changed: Record<string, unknown> | null = null
            for (const [pinId, value] of Object.entries(scene.values)) {
              const pin = pinsById.get(pinId)
              if (!pin || pin.nodeId !== n.id) continue
              changed = changed ?? { ...n.data.properties }
              changed[pin.propertyKey] = value
            }
            return changed ? { ...n, data: { ...n.data, properties: changed } } : n
          })
          return { nodes }
        })
        queueMicrotask(() => temporalApi.resume())
      },

      panic: () => {
        const temporalApi = useGraphStore.temporal.getState()
        temporalApi.pause()
        set((s) => {
          if (s.panicActive) return s
          const restore: { nodeId: string; propertyKey: string; value: unknown }[] = []
          const targets = new Map<string, Set<string>>() // nodeId -> propertyKeys to zero
          const addTarget = (nodeId: string, propertyKey: string) => {
            if (!targets.has(nodeId)) targets.set(nodeId, new Set())
            targets.get(nodeId)!.add(propertyKey)
          }
          for (const pin of s.performanceDeck.pins) {
            const node = s.nodes.find((n) => n.id === pin.nodeId)
            if (!node) continue
            const value = node.data.properties[pin.propertyKey]
            if (typeof value !== 'number' && typeof value !== 'boolean') continue
            addTarget(pin.nodeId, pin.propertyKey)
          }
          // Master brightness always goes dark on panic, whether or not the
          // user pinned it — otherwise "blackout" could do nothing visible.
          const controller = s.nodes.find((n) => n.data.nodeType === 'Board')
            ?? s.nodes.find((n) => n.data.nodeType === 'MatrixOutput')
          if (controller) addTarget(controller.id, 'brightness')

          for (const [nodeId, keys] of targets) {
            const node = s.nodes.find((n) => n.id === nodeId)
            if (!node) continue
            for (const key of keys) restore.push({ nodeId, propertyKey: key, value: node.data.properties[key] })
          }

          const nodes = s.nodes.map((n) => {
            const keys = targets.get(n.id)
            if (!keys) return n
            const properties = { ...n.data.properties }
            for (const key of keys) properties[key] = typeof properties[key] === 'boolean' ? false : 0
            return { ...n, data: { ...n.data, properties } }
          })
          return { nodes, panicActive: true, panicRestoreValues: restore }
        })
        queueMicrotask(() => temporalApi.resume())
      },

      restorePanic: () => {
        const temporalApi = useGraphStore.temporal.getState()
        temporalApi.pause()
        set((s) => {
          if (!s.panicActive || !s.panicRestoreValues) return s
          const byNode = new Map<string, { propertyKey: string; value: unknown }[]>()
          for (const entry of s.panicRestoreValues) {
            if (!byNode.has(entry.nodeId)) byNode.set(entry.nodeId, [])
            byNode.get(entry.nodeId)!.push(entry)
          }
          const nodes = s.nodes.map((n) => {
            const entries = byNode.get(n.id)
            if (!entries) return n
            const properties = { ...n.data.properties }
            for (const e of entries) properties[e.propertyKey] = e.value
            return { ...n, data: { ...n.data, properties } }
          })
          return { nodes, panicActive: false, panicRestoreValues: null }
        })
        queueMicrotask(() => temporalApi.resume())
      },

      addMidiBinding: (binding) =>
        set((s) => {
          // One binding per target — a fresh learn replaces any existing
          // binding for the same pin/action/morph rather than stacking.
          const filtered = s.performanceDeck.midiBindings.filter(
            (b) => JSON.stringify(b.target) !== JSON.stringify(binding.target)
          )
          const next: MidiBinding = { ...binding, id: `midi-${Date.now()}`, createdAt: Date.now() }
          return { performanceDeck: { ...s.performanceDeck, midiBindings: [...filtered, next] } }
        }),

      removeMidiBinding: (bindingId) =>
        set((s) => ({
          performanceDeck: {
            ...s.performanceDeck,
            midiBindings: s.performanceDeck.midiBindings.filter((b) => b.id !== bindingId),
          },
        })),

      addKeyBinding: (binding) =>
        set((s) => {
          const filtered = s.performanceDeck.keyBindings.filter((b) => b.combo !== binding.combo)
          const next: KeyBinding = { ...binding, id: `key-${Date.now()}`, createdAt: Date.now() }
          return { performanceDeck: { ...s.performanceDeck, keyBindings: [...filtered, next] } }
        }),

      removeKeyBinding: (bindingId) =>
        set((s) => ({
          performanceDeck: {
            ...s.performanceDeck,
            keyBindings: s.performanceDeck.keyBindings.filter((b) => b.id !== bindingId),
          },
        })),

      onNodesChange: (changes) => {
        if (changes.some((change) => change.type === 'remove')) scheduleOrphanGraphPrune()
        set((s) => {
          let nodes = applyNodeChanges(changes, s.nodes) as StudioNode[]
          // Once a click-to-add node has been measured, lift it by half its
          // height so it settles centred on the drop point (see pendingCentreY).
          if (pendingCentreY.size) {
            nodes = nodes.map((n) => {
              const centreY = pendingCentreY.get(n.id)
              const h = n.measured?.height
              if (centreY === undefined || !h) return n
              pendingCentreY.delete(n.id)
              return { ...n, position: { ...n.position, y: centreY - h / 2 } }
            })
          }
          const selectedNodeId = s.selectedNodeId && nodes.some((n) => n.id === s.selectedNodeId)
            ? s.selectedNodeId
            : null
          return { nodes, selectedNodeId }
        })
      },

      onEdgesChange: (changes) =>
        set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

      onConnect: (connection) =>
        set((s) => {
          const src = s.nodes.find((n) => n.id === connection.source)
          const color = edgeStrokeForPort(src, connection.sourceHandle ?? undefined)
          const replaced = connection.target && connection.targetHandle
            ? s.edges.filter((e) => !(e.target === connection.target && e.targetHandle === connection.targetHandle))
            : s.edges
          // `reconnectable: 'target'` lets a noodle be unplugged/re-routed from
          // the input (target) end only — grab it at the input port and drag.
          const edges = addEdge({ ...connection, type: 'glowEdge', reconnectable: 'target', style: { stroke: color } }, replaced)
          return { edges, nodes: withAdoptedMirrorPin(s.nodes, edges, connection) }
        }),

      removeEdge: (id) =>
        set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),

      reconnectNoodle: (oldEdge, newConnection) =>
        set((s) => {
          const replaced = newConnection.target && newConnection.targetHandle
            ? s.edges.filter((e) =>
              e.id === oldEdge.id || !(e.target === newConnection.target && e.targetHandle === newConnection.targetHandle))
            : s.edges
          const edges = reconnectEdge(oldEdge, newConnection, replaced)
          const src = s.nodes.find((n) => n.id === newConnection.source)
          const color = edgeStrokeForPort(src, newConnection.sourceHandle ?? undefined)
          return {
            edges: edges.map((edge) => edge.id === oldEdge.id ? { ...edge, style: { ...edge.style, stroke: color } } : edge),
          }
        }),

      addNode: (node, centreOnDrop) => {
        set((s) => {
          // A part added from the hardware view belongs on the bench, which is
          // the root graph — never sealed inside whichever pattern group the
          // canvas happens to be showing.
          const rootScoped = isHardwareNodeType(node.data.nodeType) && s.activeGraphId !== ROOT_GRAPH_ID
          const target = rootScoped ? rootGraphNodes(s) : s.nodes
          if (!canAddNodeType(target, node.data.nodeType)) return s
          if (centreOnDrop) pendingCentreY.set(node.id, node.position.y)
          const next = [
            ...target.map((n) => (n.selected ? { ...n, selected: false } : n)),
            { ...node, selected: !rootScoped },
          ]
          if (rootScoped) return withRootNodes(s, next)
          return { nodes: next, selectedNodeId: node.id }
        })
      },

      insertNodeOnEdge: (node, edgeId, inHandle, outHandle) =>
        set((s) => {
          if (!canAddNodeType(s.nodes, node.data.nodeType)) return s
          const old = s.edges.find((e) => e.id === edgeId)
          if (!old) return { nodes: [...s.nodes, node] }
          const srcNode = s.nodes.find((n) => n.id === old.source)
          const srcColor = edgeStrokeForPort(srcNode, old.sourceHandle ?? undefined)
          const newColor = edgeStrokeForPort(node, outHandle ?? undefined)
          // Two new noodles replace the old one, matching onConnect's style so the
          // MiniMap/reconnect behaviour is identical.
          const e1 = {
            id: `e-${node.id}-in`, source: old.source!, sourceHandle: old.sourceHandle,
            target: node.id, targetHandle: inHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: srcColor },
          } as StudioEdge
          const e2 = {
            id: `e-${node.id}-out`, source: node.id, sourceHandle: outHandle,
            target: old.target!, targetHandle: old.targetHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: newColor },
          } as StudioEdge
          const nodes = [
            ...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
            { ...node, selected: true },
          ]
          const edges = [...s.edges.filter((e) => e.id !== edgeId), e1, e2]
          return { nodes: spreadNodesByEdges(nodes, edges), edges, selectedNodeId: node.id }
        }),

      spliceNodeOnEdge: (nodeId, edgeId, inHandle, outHandle) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === nodeId)
          const old = s.edges.find((e) => e.id === edgeId)
          // Existing-node splicing is deliberately limited to loose nodes; a
          // connected node would otherwise silently tear or duplicate wiring.
          if (!node || !old || s.edges.some((e) => e.source === nodeId || e.target === nodeId)) return s
          const srcNode = s.nodes.find((n) => n.id === old.source)
          const srcColor = edgeStrokeForPort(srcNode, old.sourceHandle ?? undefined)
          const newColor = edgeStrokeForPort(node, outHandle)
          const e1 = {
            id: `e-${node.id}-in`, source: old.source!, sourceHandle: old.sourceHandle,
            target: node.id, targetHandle: inHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: srcColor },
          } as StudioEdge
          const e2 = {
            id: `e-${node.id}-out`, source: node.id, sourceHandle: outHandle,
            target: old.target!, targetHandle: old.targetHandle,
            type: 'glowEdge', reconnectable: 'target', style: { stroke: newColor },
          } as StudioEdge
          const edges = [...s.edges.filter((e) => e.id !== edgeId), e1, e2]
          return { nodes: spreadNodesByEdges(s.nodes, edges), edges }
        }),

      spreadNodes: () =>
        set((s) => ({ nodes: spreadNodesByEdges(s.nodes, s.edges) })),

      selectNode: (id) => set({ selectedNodeId: id }),

      /*
       * "Take me to this node" — an exclusive selection made in code.
       *
       * Distinct from `selectNode`, which deliberately only records our own
       * `selectedNodeId`: React Flow drives its `selected` flags itself on a
       * canvas click, and `onNodeClick` fires for ctrl-click too, so making
       * that action exclusive would collapse a multi-selection every time a
       * node was added to one.
       *
       * Nothing sets those flags for a selection made in code, though, which
       * left the previously-clicked node still React-Flow-selected: it kept
       * RF's own elevation, tied with ours, and won on DOM order — so the
       * hardware view would centre on a node that stayed underneath the one
       * you had selected before. Two nodes also drew as selected at once.
       *
       * Returns the array unchanged when the flags already agree, so this
       * costs nothing when the node was already the lone selection.
       */
      focusNode: (id) => set((s) => {
        // Focusing a hardware part from the hardware view while a group is open
        // has to bring the canvas back to the graph the part is actually in;
        // selecting an id the active graph does not contain shows nothing.
        if (!s.nodes.some((node) => node.id === id) && rootGraphNodes(s).some((node) => node.id === id)) {
          queueMicrotask(() => {
            useGraphStore.getState().enterGraph(ROOT_GRAPH_ID)
            useGraphStore.getState().focusNode(id)
          })
          return { selectedNodeId: id }
        }
        if (!s.nodes.some((node) => (node.selected ?? false) !== (node.id === id))) {
          return { selectedNodeId: id }
        }
        return {
          selectedNodeId: id,
          nodes: s.nodes.map((node) => {
            const selected = node.id === id
            return (node.selected ?? false) === selected ? node : { ...node, selected }
          }),
        }
      }),

      selectAllNodes: () =>
        set((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true })) })),

      clearSelection: () =>
        set((s) => ({
          selectedNodeId: null,
          nodes: s.nodes.some((n) => n.selected)
            ? s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n))
            : s.nodes,
        })),

      copyNode: (id) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === id)
          return node ? { clipboard: { nodes: [node], edges: [] } } : s
        }),

      copySelection: () =>
        set((s) => {
          const selected = s.nodes.filter((n) => n.selected)
          if (selected.length === 0) return s
          const idSet = new Set(selected.map((n) => n.id))
          const internal = s.edges.filter((e) => idSet.has(e.source!) && idSet.has(e.target!))
          return { clipboard: { nodes: selected, edges: internal } }
        }),

      pasteNode: (position) =>
        set((s) => {
          if (!s.clipboard || s.clipboard.nodes.length === 0) return s
          const { nodes: copied, edges: copiedEdges } = s.clipboard
          const pastable = copied.filter((n) => canAddNodeType(s.nodes, n.data.nodeType))
          if (pastable.length === 0) return s
          const pastableIds = new Set(pastable.map((n) => n.id))

          // Anchor the paste on the centroid of the copied nodes so a
          // multi-node selection lands together, centred on `position`.
          const cx = pastable.reduce((sum, n) => sum + n.position.x, 0) / pastable.length
          const cy = pastable.reduce((sum, n) => sum + n.position.y, 0) / pastable.length
          const dx = position.x - cx
          const dy = position.y - cy

          const used = new Set(s.nodes.map((n) => n.id))
          const idMap = new Map<string, string>()
          const newNodes = pastable.map((n) => {
            const newId = uniqueId(`${n.data.nodeType}-${Date.now()}`, used)
            idMap.set(n.id, newId)
            return {
              ...n,
              id: newId,
              position: { x: n.position.x + dx, y: n.position.y + dy },
              selected: true,
            }
          })
          const newEdges = copiedEdges
            .filter((e) => pastableIds.has(e.source!) && pastableIds.has(e.target!))
            .map((e) => ({
              ...e,
              id: `e-${idMap.get(e.source!)}-${idMap.get(e.target!)}-${e.sourceHandle}-${e.targetHandle}`,
              source: idMap.get(e.source!)!,
              target: idMap.get(e.target!)!,
            }))

          return {
            nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes],
            edges: [...s.edges, ...newEdges],
            selectedNodeId: newNodes[0].id,
          }
        }),

      updateNodeProperty: (id, key, value) =>
        set((s) => editNodeIn(s, id, (properties) => ({ ...properties, [key]: value }))),

      updateNodeProperties: (id, updates) =>
        set((s) => editNodeIn(s, id, (current) => {
          const properties = { ...current }
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) delete properties[key]
            else properties[key] = value
          }
          return properties
        })),

      retargetHardwarePins: (fqbn, previousBoard) => {
        let moved = 0
        const saved = useNodeDefaults.getState().micOverridesByFqbn[fqbn]
        set((s) => {
          // Hardware is root-graph content, so retargeting reads and rewrites
          // the root graph even while a pattern group is the active one.
          const hardwareNodes = rootGraphNodes(s)
          // The Board node's profile knows which pads this exact board exposes,
          // where the FQBN only names the chip. Falls back to the FQBN table.
          const profile = selectedPhysicalBoardProfile(hardwareNodes)

          // The user's own per-board microphone wiring outranks everything: a
          // board they have pinned a default for is a board they have already
          // decided about.
          const withSavedMic = saved
            ? hardwareNodes.map((n) => {
              if (n.data.nodeType !== 'MicInput') return n
              const pins = retargetedMicPins(n.data.properties as Record<string, unknown>, fqbn, saved, profile)
              if (!pins) return n
              moved += 1
              return { ...n, data: { ...n.data, properties: { ...n.data.properties, ...pins } } }
            })
            : hardwareNodes

          const result = retargetHardwarePinsFor(withSavedMic, profile, fqbn, previousBoard)
          moved += result.moved
          // No-op when nothing moved, so re-selecting the same effective
          // wiring doesn't push an empty step onto the undo stack.
          return moved > 0 ? withRootNodes(s, result.nodes) : {}
        })
        return moved
      },

      loadGraph: (nodes, edges, workspace) => {
        // Replacing the workspace invalidates every graph's history, stashed
        // stacks included — otherwise entering a group whose id happens to
        // recur in the newly loaded workspace would restore the old project's
        // undo steps. Callers clear the live stacks themselves right after.
        clearStashedGraphHistory()
        set(() => {
          // Restore the active graph plus every stashed pattern-group subgraph.
          const active = normalizeLoadedGraph(nodes, edges)
          const graphData: Record<string, GraphContent> = {}
          for (const [id, content] of Object.entries(workspace?.graphData ?? {})) {
            graphData[id] = normalizeLoadedGraph(content.nodes ?? [], content.edges ?? [])
          }
          const graphs: Record<string, GraphMeta> = {
            [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' },
            ...(workspace?.graphs ?? {}),
          }
          const activeGraphId = workspace?.activeGraphId ?? ROOT_GRAPH_ID
          // Sweep out subgraphs a previous session orphaned — undo history
          // doesn't survive a load, so reachability from the loaded content
          // alone decides what stays.
          const pruned = pruneOrphanGraphData(
            { nodes: active.nodes, graphData, graphs, activeGraphId },
            [],
          )
          const buildProfile = normalizeBuildProfile(workspace?.buildProfile)
          const rootNodes = activeGraphId === ROOT_GRAPH_ID
            ? ensureRootBoardNode(active.nodes, buildProfile?.physicalBoardProfileId)
            : active.nodes
          return {
            ...active,
            nodes: rootNodes,
            graphData: pruned?.graphData ?? graphData,
            graphs: pruned?.graphs ?? graphs,
            activeGraphId,
            buildProfile,
            selectedNodeId: null,
            // Missing/undefined = trusted: this predates the trust field, so
            // it's the user's own prior local work, not imported content.
            trusted: workspace?.trusted ?? true,
            // Missing/malformed = an empty deck — pre-existing saves, share
            // links, and JSON imports created before this field all fall
            // back safely rather than throwing.
            performanceDeck: normalizeDeckConfig(workspace?.performanceDeck),
            panicActive: false,
            panicRestoreValues: null,
          }
        })
      },

      duplicateNode: (id) =>
        set((s) => {
          const node = s.nodes.find((n) => n.id === id)
          if (!node || !canAddNodeType(s.nodes, node.data.nodeType)) return s
          const newId = uniqueId(`${node.data.nodeType}-${Date.now()}`, new Set(s.nodes.map((n) => n.id)))
          return {
            nodes: [
              ...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)),
              {
                ...node,
                id: newId,
                position: { x: node.position.x + 20, y: node.position.y + 20 },
                selected: true,
              },
            ],
            selectedNodeId: newId,
          }
        }),

      duplicateSelection: () =>
        set((s) => {
          const selected = s.nodes.filter((n) => n.selected)
          if (selected.length === 0) return s

          // Scene-level singletons (MatrixOutput, MicInput, …) can't be
          // duplicated; skip them rather than refusing the whole gesture, the
          // same way pasteNode filters its clipboard.
          const used = new Set(s.nodes.map((n) => n.id))
          const duplicable: StudioNode[] = []
          const projected = [...s.nodes]
          for (const node of selected) {
            if (!canAddNodeType(projected, node.data.nodeType)) continue
            duplicable.push(node)
            // Count each accepted duplicate against the singleton budget so two
            // selected copies of a limited type can't both slip through.
            projected.push(node)
          }
          if (duplicable.length === 0) return s

          const sourceIds = new Set(duplicable.map((n) => n.id))
          const idMap = new Map<string, string>()
          const newNodes = duplicable.map((node) => {
            const newId = uniqueId(`${node.data.nodeType}-${Date.now()}`, used)
            idMap.set(node.id, newId)
            return {
              ...node,
              id: newId,
              position: { x: node.position.x + 20, y: node.position.y + 20 },
              selected: true,
            }
          })
          // Edges wholly inside the selection come along, so a duplicated chain
          // stays wired instead of arriving as loose nodes.
          const newEdges = s.edges
            .filter((e) => sourceIds.has(e.source!) && sourceIds.has(e.target!))
            .map((e) => ({
              ...e,
              id: `e-${idMap.get(e.source!)}-${idMap.get(e.target!)}-${e.sourceHandle}-${e.targetHandle}`,
              source: idMap.get(e.source!)!,
              target: idMap.get(e.target!)!,
            }))

          return {
            nodes: [...s.nodes.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes],
            edges: [...s.edges, ...newEdges],
            selectedNodeId: newNodes[0].id,
          }
        }),

      deleteNode: (id) => {
        const node = useGraphStore.getState().nodes.find((entry) => entry.id === id)
        const nodeType = node?.data.nodeType ?? ''
        if (nodeType === 'Board') return
        scheduleOrphanGraphPrune()
        if (isHardwareManagedSignalNodeType(nodeType)) {
          set((s) => ({
            edges: s.edges.filter((edge) => edge.source !== id && edge.target !== id),
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
          }))
          return
        }
        set((s) => removeNodeAndEdges(
          s.nodes,
          s.edges,
          s.selectedNodeId,
          s.performanceDeck,
          new Set([id]),
        ))
      },

      removeNodeCompletely: (id) => {
        const state = useGraphStore.getState()
        // Removing a part is a hardware-view act, so it has to find the part in
        // the root graph even when a pattern group is the active one.
        const inActive = state.nodes.some((entry) => entry.id === id)
        const node = (inActive ? state.nodes : rootGraphNodes(state)).find((entry) => entry.id === id)
        if (!node || node.data.nodeType === 'Board') return
        scheduleOrphanGraphPrune()
        set((s) => {
          if (inActive) {
            return removeNodeAndEdges(s.nodes, s.edges, s.selectedNodeId, s.performanceDeck, new Set([id]))
          }
          const removed = removeNodeAndEdges(
            rootGraphNodes(s), rootGraphEdges(s), s.selectedNodeId, s.performanceDeck, new Set([id]))
          const { nodes, edges, ...rest } = removed
          return { ...rest, ...withRootContent(s, { nodes, edges }) }
        })
      },

      deleteSelection: () => {
        scheduleOrphanGraphPrune()
        set((s) => {
          const selectedIds = new Set(s.nodes.filter((n) => n.selected).map((n) => n.id))
          if (selectedIds.size === 0) return s
          for (const node of s.nodes) {
            if (!selectedIds.has(node.id)) continue
            if (node.data.nodeType === 'Board') selectedIds.delete(node.id)
          }
          if (selectedIds.size === 0) return s
          const disconnectOnlyIds = new Set(
            s.nodes
              .filter((node) => selectedIds.has(node.id) && isHardwareManagedSignalNodeType(node.data.nodeType))
              .map((node) => node.id)
          )
          const removeIds = new Set([...selectedIds].filter((id) => !disconnectOnlyIds.has(id)))
          if (removeIds.size === 0) {
            return {
              edges: s.edges.filter((edge) => !disconnectOnlyIds.has(edge.source ?? '') && !disconnectOnlyIds.has(edge.target ?? '')),
              selectedNodeId: s.selectedNodeId && selectedIds.has(s.selectedNodeId) ? null : s.selectedNodeId,
            }
          }
          const removed = removeNodeAndEdges(
            s.nodes,
            s.edges.filter((edge) => !disconnectOnlyIds.has(edge.source ?? '') && !disconnectOnlyIds.has(edge.target ?? '')),
            s.selectedNodeId,
            s.performanceDeck,
            removeIds,
          )
          return {
            ...removed,
          }
        })
      },

      pruneOrphanGraphs: () => {
        // Collecting unreachable subgraphs is bookkeeping, not something the
        // user did — and now that `graphData` is tracked it would otherwise
        // land its own undo step that appears to do nothing when pressed.
        const temporalApi = useGraphStore.temporal.getState()
        const wasTracking = temporalApi.isTracking
        if (wasTracking) temporalApi.pause()
        set((s) => {
          const extraNodeLists = historyNodeLists()
          if (s.clipboard) extraNodeLists.push(s.clipboard.nodes)
          return pruneOrphanGraphData(s, extraNodeLists) ?? s
        })
        if (wasTracking) useGraphStore.temporal.getState().resume()
      },

      disconnectNode: (id) =>
        set((s) => ({
          edges: s.edges.filter((e) => e.source !== id && e.target !== id),
        })),

      enterGraph: (id) =>
        set((s) => {
          if (id === s.activeGraphId || !s.graphs[id]) return s
          // Stash the current graph, load the target. Graph navigation is not
          // itself an undoable edit, so history stays paused across the swap —
          // but each graph keeps its own stacks rather than everything being
          // thrown away, so stepping into a group to tweak one value no longer
          // costs the user every undo step they had in the parent.
          const temporalApi = useGraphStore.temporal.getState()
          temporalApi.pause()
          const leaving = s.activeGraphId
          stashActiveHistory(leaving)
          const target = s.graphData[id] ?? { nodes: [], edges: [] }
          const nextData = { ...s.graphData, [leaving]: { nodes: s.nodes, edges: s.edges } }
          delete nextData[id]
          queueMicrotask(() => {
            restoreStashedHistory(id)
            temporalApi.resume()
            useUiStore.getState().requestFitView()
            // Stashed stacks count as live references (see historyNodeLists),
            // so this only collects subgraphs nothing can reach any more.
            useGraphStore.getState().pruneOrphanGraphs()
          })
          return {
            graphData: nextData,
            nodes: target.nodes,
            edges: target.edges,
            activeGraphId: id,
            selectedNodeId: null,
          }
        }),

      createGroup: (name, nodeIds, options) => {
        // Every id this action mints (the Group node, its GroupOutput/GroupInput
        // nodes, their edges) is derived from `groupId`, so disambiguating it
        // against the existing subgraphs keeps the whole set collision-free even
        // when two groups are created within the same millisecond.
        let groupId = `group-${Date.now()}`
        set((s) => {
          groupId = uniqueId(groupId, new Set(Object.keys(s.graphs)))
          const idSet = new Set(nodeIds)
          // Scene-level outputs/sources stay in the parent graph rather than being
          // sealed inside a reusable pattern. A surviving MatrixOutput is
          // auto-rewired to the new Group's frame output (it becomes an outgoing
          // boundary edge); a surviving MicInput/MusicLibrary feeding the
          // selection is surfaced as an exposed Group input (an incoming edge).
          // This keeps the "make pattern → group → repeat" loop's sources/output
          // in place for the next pattern.
          for (const n of s.nodes)
            if (idSet.has(n.id) && GROUP_EXCLUDED_TYPES.has(n.data.nodeType as string))
              idSet.delete(n.id)
          const selected = s.nodes.filter((n) => idSet.has(n.id))
          if (selected.length === 0) return s

          const hasFrameOut = (n: StudioNode) =>
            (n.data.outputs as { dataType?: string }[] | undefined)?.some((o) => o.dataType === 'frame')

          const portType = (nodeId: string, portId?: string | null) => {
            const n = selected.find((x) => x.id === nodeId)
            const port = (n?.data.inputs as { id: string; label?: string; dataType?: string }[] | undefined)
              ?.find((pt) => pt.id === portId)
            return { dataType: port?.dataType ?? 'float', label: port?.label ?? portId ?? 'in' }
          }

          // Edges fully inside the selection move into the group.
          const internal = s.edges.filter((e) => idSet.has(e.source!) && idSet.has(e.target!))
          // Edges leaving the selection — their external targets will instead
          // consume the new Group node's frame output.
          const outgoing = s.edges.filter((e) => idSet.has(e.source!) && !idSet.has(e.target!))
          // Edges entering the selection become exposed parameters: an external
          // source feeds a new Group input port, surfaced inside via GroupInput.
          const incoming = s.edges.filter((e) => !idSet.has(e.source!) && idSet.has(e.target!))

          const params = incoming.map((e, i) => {
            const { dataType, label } = portType(e.target!, e.targetHandle)
            return { paramId: `param${i}`, edge: e, dataType, label }
          })

          // The group's terminal frame producer: a selected node feeding an
          // external consumer, else the last selected node with a frame output.
          const terminal =
            selected.find((n) => outgoing.some((e) => e.source === n.id && hasFrameOut(n)))
            ?? [...selected].reverse().find(hasFrameOut)
            ?? selected[selected.length - 1]

          const cx = selected.reduce((a, n) => a + n.position.x, 0) / selected.length
          const cy = selected.reduce((a, n) => a + n.position.y, 0) / selected.length

          const groupOutput: StudioNode = {
            id: `groupout-${groupId}`,
            type: 'studioNode',
            position: { x: 360, y: 160 },
            data: {
              label: 'Group Output', nodeType: 'GroupOutput', category: 'output',
              properties: {}, inputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }], outputs: [],
            },
          } as StudioNode

          // A GroupInput node inside the subgraph for each exposed parameter,
          // wired to the internal consumer the boundary edge used to feed.
          const groupInputNodes = params.map((pm, i) => ({
            id: `groupin-${groupId}-${i}`,
            type: 'studioNode',
            position: { x: 40, y: 80 + i * 80 },
            data: {
              label: pm.label, nodeType: 'GroupInput', category: 'composite',
              properties: { paramId: pm.paramId },
              inputs: [], outputs: [{ id: 'out', label: pm.label, dataType: pm.dataType }],
            },
          } as StudioNode))
          const inputEdges = params.map((pm, i) => ({
            id: `e-${groupId}-in${i}`, source: groupInputNodes[i].id, sourceHandle: 'out',
            target: pm.edge.target!, targetHandle: pm.edge.targetHandle,
          } as StudioEdge))

          // ── Auto-expose speed/energy/palette as show-input roles ──────────
          // A node's `speed`/`energy`/`paletteIn` port already falls back to its
          // own property when unwired (same mechanism the GroupInput role system
          // uses), so wiring one in here is dormant until a PerformanceGenerator
          // with "use group inputs" actually drives it — the pattern behaves
          // exactly as authored otherwise.
          const isPortFree = (nodeId: string, portId: string) =>
            !s.edges.some((e) => e.target === nodeId && e.targetHandle === portId)

          const roleInputNodes: StudioNode[] = []
          const roleEdges: StudioEdge[] = []
          const roleInputId: Partial<Record<'speed' | 'energy' | 'palette', string>> = {}
          let roleY = 40

          const ensureRoleInput = (role: 'speed' | 'energy' | 'palette', dataType: 'float' | 'palette') => {
            const existing = roleInputId[role]
            if (existing) return existing
            const id = `groupin-${groupId}-${role}`
            roleInputNodes.push({
              id,
              type: 'studioNode',
              position: { x: -180, y: roleY },
              data: {
                label: role[0].toUpperCase() + role.slice(1), nodeType: 'GroupInput', category: 'composite',
                properties: { paramId: role },
                inputs: [], outputs: [{ id: 'out', label: role, dataType }],
              },
            } as unknown as StudioNode)
            roleY += 80
            roleInputId[role] = id
            return id
          }

          // speed/energy: unwired ports get a shared per-role GroupInput
          // multiplied against the node's own slider value, so the section's
          // 0–1 signal scales (never overrides) what the pattern already does.
          for (const role of ['speed', 'energy'] as const) {
            selected
              .filter((n) => (n.data.inputs as { id: string }[] | undefined)?.some((p) => p.id === role))
              .filter((n) => isPortFree(n.id, role))
              .forEach((n, i) => {
                const base = Number((n.data.properties as Record<string, unknown>)[role] ?? 0.5)
                const gi = ensureRoleInput(role, 'float')
                const mulId = `groupmul-${groupId}-${role}-${i}`
                roleInputNodes.push({
                  id: mulId,
                  type: 'studioNode',
                  position: { x: -60, y: n.position.y },
                  data: {
                    label: `${role[0].toUpperCase()}${role.slice(1)} ×`, nodeType: 'Math', category: 'math',
                    properties: { mathOp: 'multiply', a: base, b: 1 },
                    inputs: [
                      { id: 'a', label: 'A', dataType: 'float' },
                      { id: 'b', label: 'B', dataType: 'float' },
                    ],
                    outputs: [{ id: 'result', label: 'Result', dataType: 'float' }],
                  },
                } as unknown as StudioNode)
                roleEdges.push(
                  { id: `e-${mulId}-b`, source: gi, sourceHandle: 'out', target: mulId, targetHandle: 'b' } as StudioEdge,
                  { id: `e-${mulId}-out`, source: mulId, sourceHandle: 'result', target: n.id, targetHandle: role } as StudioEdge,
                )
              })
          }

          // palette: only for nodes the caller opted into (checked in the
          // create-group dialog) — replaces the palette outright rather than
          // multiplying, since palettes aren't numeric.
          for (const nodeId of options?.exposePaletteNodeIds ?? []) {
            const target = selected.find((n) => n.id === nodeId)
            if (!target) continue
            const hasPort = (target.data.inputs as { id: string }[] | undefined)?.some((p) => p.id === 'paletteIn')
            if (!hasPort || !isPortFree(nodeId, 'paletteIn')) continue
            const gi = ensureRoleInput('palette', 'palette')
            roleEdges.push({ id: `e-${nodeId}-palette`, source: gi, sourceHandle: 'out', target: nodeId, targetHandle: 'paletteIn' } as StudioEdge)
          }

          const groupSubgraph: GraphContent = {
            nodes: [...selected.map((n) => ({ ...n, selected: false })), ...groupInputNodes, ...roleInputNodes, groupOutput],
            edges: [
              ...internal,
              ...inputEdges,
              ...roleEdges,
              { id: `e-${groupId}-out`, source: terminal.id, sourceHandle: 'frame', target: groupOutput.id, targetHandle: 'frame' } as StudioEdge,
            ],
          }

          const groupNode: StudioNode = {
            id: `groupnode-${groupId}`,
            type: 'studioNode',
            position: { x: cx, y: cy },
            data: {
              label: name, nodeType: 'Group', category: 'composite',
              properties: { groupId },
              inputs: params.map((pm) => ({ id: pm.paramId, label: pm.label, dataType: pm.dataType })),
              outputs: [{ id: 'frame', label: 'Frame', dataType: 'frame' }],
            },
          } as StudioNode

          // Rewire external consumers of the selection to the Group node, and
          // external sources of exposed params to the Group's input ports.
          const rewiredOutgoing = outgoing.map((e) => ({
            ...e, source: groupNode.id, sourceHandle: 'frame',
          }))
          const rewiredIncoming = params.map((pm) => ({
            ...pm.edge, target: groupNode.id, targetHandle: pm.paramId,
          }))
          const survivingEdges = s.edges.filter(
            (e) => !idSet.has(e.source!) && !idSet.has(e.target!),
          )

          return {
            nodes: [...s.nodes.filter((n) => !idSet.has(n.id)), groupNode],
            edges: [...survivingEdges, ...rewiredOutgoing, ...rewiredIncoming],
            graphs: { ...s.graphs, [groupId]: { id: groupId, name } },
            graphData: { ...s.graphData, [groupId]: groupSubgraph },
            selectedNodeId: null,
          }
        })
        return groupId
      },

      ungroupNode: (id) => {
        let ungrouped = false
        set((s) => {
          const groupNode = s.nodes.find((n) => n.id === id)
          const groupId = (groupNode?.data.properties as { groupId?: string } | undefined)?.groupId
          const sub = groupId ? s.graphData[groupId] : undefined
          if (!groupNode || studioNodeType(groupNode) !== 'Group' || !groupId || !sub) return s

          const isRestorableNode = (node: StudioNode) => {
            const type = studioNodeType(node)
            if (type === 'GroupInput' || type === 'GroupOutput') return false
            // Auto-exposed speed/energy group roles synthesize helper Math nodes;
            // strip those back out so ungroup restores the authored graph rather
            // than leaking grouping internals onto the canvas.
            if (type === 'Math' && node.id.startsWith('groupmul-')) return false
            return true
          }

          const restorable = sub.nodes.filter(isRestorableNode)
          const anchor = restorable.length ? restorable : [groupNode]
          const cx = anchor.reduce((sum, node) => sum + node.position.x, 0) / anchor.length
          const cy = anchor.reduce((sum, node) => sum + node.position.y, 0) / anchor.length
          const dx = groupNode.position.x - cx
          const dy = groupNode.position.y - cy

          const usedNodeIds = new Set(s.nodes.filter((n) => n.id !== id).map((n) => n.id))
          const nodeIdMap = new Map<string, string>()
          const restoredNodes = restorable.map((node) => {
            const nextId = uniqueId(node.id, usedNodeIds)
            nodeIdMap.set(node.id, nextId)
            return {
              ...node,
              id: nextId,
              position: { x: node.position.x + dx, y: node.position.y + dy },
              selected: false,
            }
          })

          const survivingEdges = s.edges.filter((e) => e.source !== id && e.target !== id)
          const usedEdgeIds = new Set(survivingEdges.map((e) => e.id))
          const emittedEdges: StudioEdge[] = []
          const pushEdge = (edge: StudioEdge) => {
            emittedEdges.push({ ...edge, id: uniqueId(edge.id, usedEdgeIds) })
          }

          // Restore all internal wiring between ordinary nodes verbatim.
          for (const edge of sub.edges) {
            const source = nodeIdMap.get(edge.source ?? '')
            const target = nodeIdMap.get(edge.target ?? '')
            if (!source || !target) continue
            pushEdge({ ...edge, source, target } as StudioEdge)
          }

          // External sources that previously fed the Group node's exposed inputs
          // are wired straight to the old GroupInput consumers inside.
          const exposedInputs = new Set(((groupNode.data.inputs as { id: string }[] | undefined) ?? []).map((port) => port.id))
          for (const groupInput of sub.nodes.filter((node) => studioNodeType(node) === 'GroupInput')) {
            const paramId = String((groupInput.data.properties as { paramId?: string } | undefined)?.paramId ?? '')
            if (!exposedInputs.has(paramId)) continue
            const inbound = s.edges.filter((edge) => edge.target === id && edge.targetHandle === paramId)
            const consumers = sub.edges.filter((edge) => edge.source === groupInput.id)
            for (const outer of inbound) {
              for (const consumer of consumers) {
                const target = nodeIdMap.get(consumer.target ?? '')
                if (!target) continue
                pushEdge({ ...outer, target, targetHandle: consumer.targetHandle } as StudioEdge)
              }
            }
          }

          // The group's frame output becomes the source that used to feed the
          // primary GroupOutput terminal inside the subgraph.
          const groupOutput = sub.nodes.find((node) => studioNodeType(node) === 'GroupOutput')
          const feeder = groupOutput
            ? sub.edges.find((edge) => edge.target === groupOutput.id && edge.targetHandle === 'frame')
            : undefined
          const feederSource = feeder ? nodeIdMap.get(feeder.source ?? '') : undefined
          const feederNode = feederSource ? restoredNodes.find((node) => node.id === feederSource) : undefined
          const feederColor = feeder ? edgeStrokeForPort(feederNode, feeder.sourceHandle ?? undefined) : '#00bfff'
          if (feeder && feederSource) {
            for (const outer of s.edges.filter((edge) => edge.source === id)) {
              pushEdge({
                ...outer,
                source: feederSource,
                sourceHandle: feeder.sourceHandle,
                style: { ...outer.style, stroke: feederColor },
              } as StudioEdge)
            }
          }

          const graphData = { ...s.graphData }
          delete graphData[groupId]
          const graphs = { ...s.graphs }
          delete graphs[groupId]
          ungrouped = true
          return {
            nodes: [...s.nodes.filter((n) => n.id !== id), ...restoredNodes],
            edges: [...survivingEdges, ...emittedEdges],
            graphData,
            graphs,
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
          }
        })
        return ungrouped
      },

      instantiatePattern: (saved, position, centreOnDrop) =>
        set((s) => {
          // Millisecond stamps collide when several patterns are dropped in one
          // synchronous burst (the library's multi-select "Add to canvas" loops
          // this action), which previously minted duplicate group *and* node
          // ids. Disambiguate against what already exists, like every other
          // group-minting action here does.
          const groupId = uniqueId(`group-${Date.now()}`, new Set(Object.keys(s.graphs)))
          // Clone the saved subgraph so two instances of the same pattern don't
          // share node/edge objects (editing one would otherwise touch both).
          const sub = structuredClone(saved.subgraph)
          const nodeId = uniqueId(`groupnode-${groupId}`, new Set(s.nodes.map((n) => n.id)))
          if (centreOnDrop) pendingCentreY.set(nodeId, position.y)
          const groupNode: StudioNode = {
            id: nodeId,
            type: 'studioNode',
            position,
            data: {
              label: saved.name, nodeType: 'Group', category: 'composite',
              properties: { groupId },
              inputs: saved.inputs, outputs: saved.outputs,
            },
          } as StudioNode
          return {
            graphs: {
              ...s.graphs,
              [groupId]: { id: groupId, name: saved.name, sourcePatternId: saved.id },
            },
            graphData: { ...s.graphData, [groupId]: { nodes: sub.nodes, edges: sub.edges } },
            nodes: [...s.nodes, groupNode],
            // A dropped pattern could itself have been imported/shared from
            // outside this browser, so it forces the whole workspace untrusted
            // unless the user has already explicitly trusted this exact pattern
            // content before (see patternTrust.ts; safe default otherwise — see
            // trustPrompt.ts's doc comment for why this doesn't also pop a
            // confirm modal).
            trusted: isPatternContentTrusted(saved.subgraph) ? s.trusted : false,
          }
        }),

      createCollectionFromPatterns: (savedPatterns, position, properties = {}, centreOnDrop) =>
        set((s) => {
          if (savedPatterns.length === 0) return s

          const def = LIBRARY_DEF.get('PatternCollection')
          if (!def) return s
          const usedGraphIds = new Set(Object.keys(s.graphs))
          const usedNodeIds = new Set(s.nodes.map((n) => n.id))
          const stamp = Date.now()
          const collectionNodeId = uniqueId(`patterncollection-${stamp}`, usedNodeIds)
          if (centreOnDrop) pendingCentreY.set(collectionNodeId, position.y)

          const patternIds: string[] = []
          const graphs = { ...s.graphs }
          const graphData = { ...s.graphData }

          savedPatterns.forEach((saved, index) => {
            const groupId = uniqueId(`group-${stamp + index}`, usedGraphIds)
            const sub = structuredClone(saved.subgraph)
            patternIds.push(groupId)
            graphs[groupId] = { id: groupId, name: saved.name, sourcePatternId: saved.id }
            graphData[groupId] = { nodes: sub.nodes, edges: sub.edges }
          })

          const collectionNode: StudioNode = {
            id: collectionNodeId,
            type: 'studioNode',
            position,
            data: {
              label: def.label,
              nodeType: def.type,
              category: def.category,
              properties: { ...properties, patternIds, patternSections: {} },
              inputs: def.inputs,
              outputs: def.outputs,
            },
          } as StudioNode

          return {
            graphs,
            graphData,
            nodes: [...s.nodes, collectionNode],
            // See instantiatePattern's comment above — untrusted unless every
            // collected pattern's exact content is already explicitly trusted.
            trusted: savedPatterns.every((p) => isPatternContentTrusted(p.subgraph)) ? s.trusted : false,
          }
        }),

      addToCollection: (collectionNodeId, groupNodeId) =>
        set((s) => {
          const group = s.nodes.find((n) => n.id === groupNodeId)
          const groupId = (group?.data.properties as { groupId?: string } | undefined)?.groupId
          if (!group || !groupId) return s
          // Drop the Group node + any edges touching it; its subgraph stays in
          // graphData, now referenced by the collection's patternIds.
          const nodes = s.nodes
            .filter((n) => n.id !== groupNodeId)
            .map((n) => {
              if (n.id !== collectionNodeId) return n
              const ids = ((n.data.properties as { patternIds?: string[] }).patternIds) ?? []
              if (ids.includes(groupId)) return n
              return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: [...ids, groupId] } } }
            })
          const edges = s.edges.filter((e) => e.source !== groupNodeId && e.target !== groupNodeId)
          return { nodes, edges }
        }),

      addPatternToCollection: (collectionNodeId, saved) =>
        set((s) => {
          const collection = s.nodes.find((n) => n.id === collectionNodeId)
          if (!collection) return s
          const usedGraphIds = new Set(Object.keys(s.graphs))
          const groupId = uniqueId(`group-${Date.now()}`, usedGraphIds)
          const sub = structuredClone(saved.subgraph)
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const ids = ((n.data.properties as { patternIds?: string[] }).patternIds) ?? []
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: [...ids, groupId] } } }
          })
          return {
            nodes,
            graphs: { ...s.graphs, [groupId]: { id: groupId, name: saved.name, sourcePatternId: saved.id } },
            graphData: { ...s.graphData, [groupId]: { nodes: sub.nodes, edges: sub.edges } },
            // See instantiatePattern's comment above.
            trusted: isPatternContentTrusted(saved.subgraph) ? s.trusted : false,
          }
        }),

      addPatternsToCollection: (collectionNodeId, savedPatterns) =>
        set((s) => {
          const collection = s.nodes.find((n) => n.id === collectionNodeId)
          if (!collection || savedPatterns.length === 0) return s
          const usedGraphIds = new Set(Object.keys(s.graphs))
          const stamp = Date.now()
          const patternIds: string[] = []
          const graphs = { ...s.graphs }
          const graphData = { ...s.graphData }

          savedPatterns.forEach((saved, index) => {
            const groupId = uniqueId(`group-${stamp + index}`, usedGraphIds)
            const sub = structuredClone(saved.subgraph)
            patternIds.push(groupId)
            graphs[groupId] = { id: groupId, name: saved.name, sourcePatternId: saved.id }
            graphData[groupId] = { nodes: sub.nodes, edges: sub.edges }
          })

          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const ids = ((n.data.properties as { patternIds?: string[] }).patternIds) ?? []
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: [...ids, ...patternIds] } } }
          })
          return {
            nodes,
            graphs,
            graphData,
            // See instantiatePattern's comment above.
            trusted: savedPatterns.every((saved) => isPatternContentTrusted(saved.subgraph)) ? s.trusted : false,
          }
        }),

      removeFromCollection: (collectionNodeId, groupId) =>
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const props = n.data.properties as { patternIds?: string[]; patternSections?: Record<string, string[]> }
            const ids = (props.patternIds ?? []).filter((x) => x !== groupId)
            const patternSections = { ...(props.patternSections ?? {}) }; delete patternSections[groupId]
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternIds: ids, patternSections } } }
          })
          const graphData = { ...s.graphData }; delete graphData[groupId]
          const graphs = { ...s.graphs }; delete graphs[groupId]
          return { nodes, graphData, graphs }
        }),

      togglePatternSection: (collectionNodeId, groupId, section) =>
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const props = n.data.properties as { patternSections?: Record<string, string[]> }
            const map = { ...(props.patternSections ?? {}) }
            const cur = map[groupId] ?? []
            const next = cur.includes(section) ? cur.filter((x) => x !== section) : [...cur, section]
            if (next.length === 0) delete map[groupId]
            else map[groupId] = next
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternSections: map } } }
          })
          return { nodes }
        }),

      setPatternSections: (collectionNodeId, groupId, sections) =>
        set((s) => {
          const nodes = s.nodes.map((n) => {
            if (n.id !== collectionNodeId) return n
            const props = n.data.properties as { patternSections?: Record<string, string[]> }
            const map = { ...(props.patternSections ?? {}) }
            if (sections.length === 0) delete map[groupId]
            else map[groupId] = sections
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, patternSections: map } } }
          })
          return { nodes }
        }),

      addGroupInput: () =>
        set((s) => {
          // Only meaningful inside a group's subgraph (a GroupInput at the root
          // has nothing to expose to).
          if (s.activeGraphId === ROOT_GRAPH_ID) return s
          const node = {
            id: `groupin-${Date.now()}`,
            type: 'studioNode',
            position: { x: 40, y: 40 + s.nodes.length * 16 },
            data: {
              label: 'Input', nodeType: 'GroupInput', category: 'composite',
              properties: { paramId: 'energy' },   // defaults to a role; change via the node's dropdown
              inputs: [], outputs: [{ id: 'out', label: 'Input', dataType: 'float' }],
            },
          } as unknown as StudioNode
          return { nodes: [...s.nodes, node], selectedNodeId: node.id }
        }),

      setGroupInputRole: (nodeId, role) =>
        set((s) => {
          const target = s.nodes.find((n) => n.id === nodeId)
          if (!target) return s
          const nextType = role === 'palette' ? 'palette' : 'float'
          const prevType = (target.data.outputs as { dataType?: string }[])[0]?.dataType ?? 'float'
          const nodes = s.nodes.map((n) => {
            if (n.id !== nodeId) return n
            const outputs = (n.data.outputs as { id: string; label?: string; dataType?: string }[]).map((o) =>
              o.id === 'out' ? { ...o, dataType: nextType } : o)
            return { ...n, data: { ...n.data, properties: { ...n.data.properties, paramId: role || 'param0' }, outputs } }
          })
          // A palette↔float switch changes what the output can wire into, so drop
          // any now-mismatched noodle from this input's port.
          const edges = nextType !== prevType
            ? s.edges.filter((e) => !(e.source === nodeId && e.sourceHandle === 'out'))
            : s.edges
          return { nodes, edges }
        }),
    }),
    {
      limit: 100,
      // Track graph content — the active graph plus every stored one — and not
      // UI selection state
      partialize: (s): HistorySlice => ({ nodes: s.nodes, edges: s.edges, graphData: s.graphData }),
      // Treat states as equal (don't snapshot) while any node is mid-drag —
      // but remember the state from just before the drag started, since the
      // eventual post-drag push needs it (see preDragHistoryState above).
      equality: (past, current) => {
        const wasDragging = past.nodes.some((n) => n.dragging)
        if (current.nodes.some((n) => n.dragging)) {
          // Guard with `=== undefined` (not just `!wasDragging`) so a second
          // drag starting before the first one's debounced push has fired
          // doesn't clobber the first drag's pre-drag snapshot — the pair
          // folds into one undo step instead of losing the first drag's undo.
          if (!wasDragging && preDragHistoryState === undefined) preDragHistoryState = past
          return true
        }
        if (past.graphData !== current.graphData) return false
        if (past.nodes === current.nodes && past.edges === current.edges) return true
        // A pure selection change (no drag, no edit) isn't an undoable graph
        // edit — see the partialize comment above.
        return past.edges === current.edges && nodesEqualIgnoringSelection(past.nodes, current.nodes)
      },
      // A slider drag or a fast typed edit fires updateNodeProperty once per
      // tick/keystroke; debouncing the history-push collapses a whole burst
      // (e.g. one drag gesture) into a single undo step instead of dozens.
      // Wrap handleSet first so a post-drag push swaps in the true pre-drag
      // pastState (captured by `equality` above) instead of the mid-drag
      // frame zundo would otherwise pass.
      handleSet: (handleSet) => {
        const rawHandleSet = handleSet as unknown as
          (pastState: HistorySlice, replace: never, currentState: HistorySlice, deltaState?: never) => void
        const withPreDragCorrection = (
          pastState: HistorySlice, replace: never, currentState: HistorySlice, deltaState?: never
        ): void => {
          const wasDragging = pastState.nodes.some((n) => n.dragging)
          const effectivePastState = wasDragging && preDragHistoryState ? preDragHistoryState : pastState
          preDragHistoryState = undefined
          rawHandleSet(effectivePastState, replace, currentState, deltaState)
        }
        return debounceHandleSet(withPreDragCorrection, 400) as unknown as typeof handleSet
      },
    }
  )
)

// Any store change while an orphan prune is pending pushes it back: zundo's
// debounced history push lands 400 ms after the *last* set, so a prune that
// only fires after a full second of quiet always sees the pre-delete snapshot
// in `pastStates`. The prune's own set is a no-op notify when nothing was
// orphaned, and its orphan-removing set fires before the timer is re-armed
// (the timer is cleared before the action runs), so this cannot self-loop.
useGraphStore.subscribe(() => {
  if (orphanPruneTimer) scheduleOrphanGraphPrune()
})

// Dev-only: expose the store on window so external tooling (e.g. a browser
// automation session building a demo graph) can call actions like `loadGraph`
// directly, without the localStorage round-trip that a `pagehide` flush can
// clobber. No-op in production builds.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { useGraphStore?: typeof useGraphStore }).useGraphStore = useGraphStore
}

// Convenience hook for undo/redo state and actions
export const useTemporalStore = <T>(
  selector: (state: TemporalState<HistorySlice>) => T
): T => useStore(useGraphStore.temporal, selector)

// Single-entry cache for the MatrixOutput dimensions: every node's preview
// aspect-ratio selector (and the LED preview) asks for these on every store
// update, so scan the nodes array once per update instead of once per node.
let matrixDimsNodes: StudioNode[] | null = null
let matrixDimsCache = { w: 16, h: 16 }

/** The first LED output's canvas size (16×16 when absent) — the grid a pattern
 *  is rendered on for it, which for a ring is the square its circle is
 *  inscribed in rather than its 1 x N chain. Memoised on the nodes array
 *  identity — safe to call from per-node store selectors. */
export function matrixDims(nodes: StudioNode[]): { w: number; h: number } {
  if (nodes !== matrixDimsNodes) {
    matrixDimsNodes = nodes
    const output = nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    const dims = output ? outputCanvasDims(output.data.properties as Record<string, unknown>) : null
    matrixDimsCache = { w: dims?.width ?? 16, h: dims?.height ?? 16 }
  }
  return matrixDimsCache
}

let matrixTileLayoutNodes: StudioNode[] | null = null
let matrixTileLayoutCache: { tilesX: number; tilesY: number } | null = null

/** The panel-tile grid from MatrixOutput's `layout`/`tilesX`/`tilesY` props —
 *  null unless `layout === 'panels'` and there's more than one tile, so the
 *  live preview can skip drawing panel-boundary gridlines otherwise. Memoised
 *  like `matrixDims`. Physical wiring order (tile rotation/chain direction,
 *  a custom XY map) has no effect on the rendered content, so it's not
 *  reflected here — see src/state/xyLayout.ts. */
export function matrixTileLayout(nodes: StudioNode[]): { tilesX: number; tilesY: number } | null {
  if (nodes !== matrixTileLayoutNodes) {
    matrixTileLayoutNodes = nodes
    const output = nodes.find((n) => (n.data as { nodeType?: string }).nodeType === 'MatrixOutput')
    const p = output?.data.properties as Record<string, unknown> | undefined
    // A tile grid describes a panel; a chain has no tiles to draw boundaries
    // between, whatever `layout` a previous form left behind.
    if (p && p.layout === 'panels' && !isLinearForm(outputForm(p))) {
      const width = Math.max(0, Math.round(Number(p.width ?? 0)))
      const height = Math.max(0, Math.round(Number(p.height ?? 0)))
      const tilesX = Math.max(1, Math.min(16, Math.round(Number(p.tilesX ?? 1)) || 1))
      const tilesY = Math.max(1, Math.min(16, Math.round(Number(p.tilesY ?? 1)) || 1))
      const valid = validateMatrixLayout(width, height, p).length === 0
      matrixTileLayoutCache = valid && (tilesX > 1 || tilesY > 1) ? { tilesX, tilesY } : null
    } else {
      matrixTileLayoutCache = null
    }
  }
  return matrixTileLayoutCache
}

/**
 * The root graph's content, whichever graph is currently active.
 *
 * Hardware lives only in the root graph — the Board node, every LED output,
 * every peripheral — because those types are excluded from grouping in the
 * first place. So a hardware question asked against `nodes` gets the right
 * answer only while the root graph happens to be the active one: step into a
 * pattern group and the bench appears empty, the board unchosen, and the
 * project's brightness and power caps fall back to their defaults. Every
 * surface that asks a project-wide hardware question reads through these.
 */
const NO_NODES: StudioNode[] = []
const NO_EDGES: StudioEdge[] = []

type GraphScope = Pick<GraphState, 'nodes' | 'edges' | 'activeGraphId' | 'graphData'>

export function rootGraphNodes(s: GraphScope): StudioNode[] {
  if (s.activeGraphId === ROOT_GRAPH_ID) return s.nodes
  return s.graphData[ROOT_GRAPH_ID]?.nodes ?? NO_NODES
}

export function rootGraphEdges(s: GraphScope): StudioEdge[] {
  if (s.activeGraphId === ROOT_GRAPH_ID) return s.edges
  return s.graphData[ROOT_GRAPH_ID]?.edges ?? NO_EDGES
}

/** `rootGraphNodes` as a hook. Both branches return a stored array, so the
 *  identity is stable and this cannot loop a subscriber. */
export function useRootNodes(): StudioNode[] {
  return useGraphStore(rootGraphNodes)
}

export function useRootEdges(): StudioEdge[] {
  return useGraphStore(rootGraphEdges)
}

/**
 * The state slice that writes `nodes` back into whichever graph they came
 * from — the write counterpart of `rootGraphNodes`. Editing a hardware part
 * from inside a group would otherwise be a silent no-op, since the node being
 * edited is not in the active graph at all.
 */
function withRootNodes(s: GraphScope, nodes: StudioNode[]): Partial<GraphState> {
  return withRootContent(s, { nodes })
}

/**
 * Undo covers these edits: `graphData` is part of the tracked history slice
 * (see `HistorySlice`), so a hardware change made from inside a group takes
 * its turn in the same stack as the group's own edits, in the order the user
 * made them. Leaving the group and coming back retires those steps — see
 * `restoreStashedHistory` for why.
 */
function withRootContent(
  s: GraphScope,
  content: { nodes?: StudioNode[]; edges?: StudioEdge[] },
): Partial<GraphState> {
  if (s.activeGraphId === ROOT_GRAPH_ID) return content
  const root = s.graphData[ROOT_GRAPH_ID] ?? { nodes: [], edges: [] }
  return { graphData: { ...s.graphData, [ROOT_GRAPH_ID]: { ...root, ...content } } }
}

/**
 * Apply a property edit to `id` wherever it lives: the active graph normally,
 * the root graph when the id belongs to hardware the user is editing from
 * inside a group.
 */
function editNodeIn(
  s: GraphScope,
  id: string,
  edit: (properties: Record<string, unknown>) => Record<string, unknown>,
): Partial<GraphState> {
  const apply = (nodes: StudioNode[]) => nodes.map((n) =>
    n.id === id ? { ...n, data: { ...n.data, properties: edit(n.data.properties) } } : n)
  if (s.nodes.some((n) => n.id === id)) return { nodes: apply(s.nodes) }
  const root = rootGraphNodes(s)
  if (root === s.nodes || !root.some((n) => n.id === id)) return { nodes: s.nodes }
  return withRootNodes(s, apply(root))
}

/**
 * Assemble the group registry the evaluator needs: every non-root graph keyed
 * by id. The active graph lives in `nodes`/`edges`, the rest in `graphData`.
 */
export function getGroupRegistry(): GroupRegistry {
  const s = useGraphStore.getState()
  const reg: GroupRegistry = {}
  for (const [id, data] of Object.entries(s.graphData)) {
    if (id !== ROOT_GRAPH_ID) reg[id] = { nodes: data.nodes, edges: data.edges }
  }
  if (s.activeGraphId !== ROOT_GRAPH_ID) {
    reg[s.activeGraphId] = { nodes: s.nodes, edges: s.edges }
  }
  return reg
}
