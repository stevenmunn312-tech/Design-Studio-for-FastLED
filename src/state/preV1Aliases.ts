// PRE-1.0 ONLY. Delete this file in todo.md step 6's leftover sweep.
//
// The one place old save shapes are named. Before v1.0.0 a saved shape that
// changes is removed cleanly (CLAUDE.md, Saves), but Steve's saves, share links
// and pattern files made before round eight's renames still have to open until
// the format freezes. Everything that loads a workspace or a pattern passes its
// nodes and edges through `upgradePreV1Content` (or one of the wrappers below),
// so a save written with the old ids reads as if it had been written with the
// new ones. The upgrade is idempotent and returns the same objects when nothing
// needs changing.
//
// Callers (grep `preV1Aliases`): `normalizeLoadedGraph` in graphStore.ts, which
// every open, autosave restore, recovery and project switch ends in;
// `sanitizeWorkspacePayload`, which project files, share links, pattern files
// and library bundles pass; the pattern library's browser and folder loads;
// the remembered-trust and node-preset stores.
//
// Removing it: delete this file, its test, and the call sites above; grep
// `preV1Aliases` finds them all.

import type { StudioEdge, StudioNode } from './graphStore'
import type { ParameterScene, PerformanceDeckConfig, PinnedControl } from './player/performanceDeck'

/** The nine type ids renamed on 2026-11-19 (round eight), old to new. Labels
 *  did not change. */
export const PRE_V1_TYPE_ALIASES: Readonly<Record<string, string>> = {
  Clock: 'TempoClock',
  Temperature: 'ColorTemperature',
  FieldWarp: 'FieldTransform',
  CustomFormula: 'FormulaPattern',
  PrismStorm: 'HiHatShards',
  Sequencer: 'CrossfadeCycle',
  Ripple: 'NetworkRipple',
  Symmetry: 'TileSymmetry',
  TransitionSet: 'TransitionPool',
}

/** Output handles renamed in round eight, by the node's NEW type id. */
const OUTPUT_RENAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Vibe: { mid: 'mids', midAtt: 'midsAtt', midSpike: 'midsSpike' },
  TempoClock: { sub: 'subdivision' },
}

/** Input handles renamed in round eight, by the node's NEW type id. A port id
 *  is also the property key it carries, so `PROPERTY_RENAMES` repeats the ones
 *  that back a property. */
const INPUT_RENAMES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Switch: { sel: 'select' },
  FrameSwitch: { sel: 'select' },
  ScheduleTrigger: { enable: 'enabled' },
  RGBToHSV: { rgb: 'color' },
  FrameTransform: { rotate: 'rotation', rotateRate: 'rotationRate' },
  HueShift: { shift: 'hueShift' },
  BeatKaleidoscope: { hue: 'hueShift' },
}

interface PropertyRename { to: string; scale?: number }

/** Property keys renamed in round eight, by the node's NEW type id. Hue Shift's
 *  `shift` was a 0 to 1 turn; `hueShift` is degrees. */
const PROPERTY_RENAMES: Readonly<Record<string, Readonly<Record<string, PropertyRename>>>> = {
  ScheduleTrigger: { enable: { to: 'enabled' } },
  FrameTransform: { rotate: { to: 'rotation' }, rotateRate: { to: 'rotationRate' } },
  HueShift: { shift: { to: 'hueShift', scale: 360 } },
  BeatKaleidoscope: { hue: { to: 'hueShift' } },
}

/** Input ports whose old wire cannot be carried over, because the value it
 *  carried changed unit. A wire into Hue Shift's old 0 to 1 `shift` input would
 *  now be read as degrees, so it is removed and the converted property stands
 *  in; the person reconnects a degrees source. */
const RETIRED_WIRE_TARGETS: Readonly<Record<string, readonly string[]>> = {
  HueShift: ['shift'],
}

export function upgradePreV1Type(nodeType: string): string {
  return Object.prototype.hasOwnProperty.call(PRE_V1_TYPE_ALIASES, nodeType)
    ? PRE_V1_TYPE_ALIASES[nodeType]
    : nodeType
}

function renamed(table: Readonly<Record<string, string>> | undefined, id: string): string {
  return table && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : id
}

/** Properties with this type's old keys renamed (and rescaled). A key already
 *  in the new shape is never overwritten. Same object when nothing changes. */
export function upgradePreV1Properties(
  nodeType: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const table = PROPERTY_RENAMES[upgradePreV1Type(nodeType)]
  if (!table || !properties || typeof properties !== 'object') return properties
  let next: Record<string, unknown> | null = null
  for (const [from, { to, scale }] of Object.entries(table)) {
    if (!Object.prototype.hasOwnProperty.call(properties, from)) continue
    next ??= { ...properties }
    const value = next[from]
    delete next[from]
    if (Object.prototype.hasOwnProperty.call(properties, to)) continue
    next[to] = scale !== undefined && typeof value === 'number' ? value * scale : value
  }
  return next ?? properties
}

function upgradeNode(node: StudioNode): StudioNode {
  const data = node?.data
  if (!data || typeof data.nodeType !== 'string') return node
  const nodeType = upgradePreV1Type(data.nodeType)
  const inputs = INPUT_RENAMES[nodeType]
  const outputs = OUTPUT_RENAMES[nodeType]
  const properties = data.properties && typeof data.properties === 'object'
    ? upgradePreV1Properties(nodeType, data.properties)
    : data.properties
  const renameIds = (ports: unknown, table: Readonly<Record<string, string>> | undefined) => {
    if (!table || !Array.isArray(ports)) return ports
    let changed = false
    const next = ports.map((port) => {
      const id = (port as { id?: unknown } | null)?.id
      if (typeof id !== 'string' || renamed(table, id) === id) return port
      changed = true
      return { ...(port as object), id: renamed(table, id) }
    })
    return changed ? next : ports
  }
  const savedInputs = renameIds(data.inputs, inputs)
  const savedOutputs = renameIds(data.outputs, outputs)
  const exposed = Array.isArray(data.exposedInputs) && inputs
    ? data.exposedInputs.map((id) => (typeof id === 'string' ? renamed(inputs, id) : id))
    : data.exposedInputs
  const exposedChanged = Array.isArray(exposed)
    && Array.isArray(data.exposedInputs) && exposed.some((id, index) => id !== data.exposedInputs![index])
  if (nodeType === data.nodeType && properties === data.properties
    && savedInputs === data.inputs && savedOutputs === data.outputs && !exposedChanged) return node
  return {
    ...node,
    data: {
      ...data,
      nodeType,
      properties,
      ...(savedInputs !== data.inputs ? { inputs: savedInputs } : {}),
      ...(savedOutputs !== data.outputs ? { outputs: savedOutputs } : {}),
      ...(exposedChanged ? { exposedInputs: exposed } : {}),
    },
  } as StudioNode
}

export interface UpgradedContent {
  nodes: StudioNode[]
  edges: StudioEdge[]
  /** Wires removed because the value they carried changed unit. */
  retiredWires: number
}

/** One graph's nodes and edges in the current shape. Edges follow their nodes:
 *  the node's type (after aliasing) decides which handle ids are renamed. */
export function upgradePreV1Content(nodes: StudioNode[], edges: StudioEdge[]): UpgradedContent {
  const upgradedNodes = nodes.map(upgradeNode)
  const nodesChanged = upgradedNodes.some((node, index) => node !== nodes[index])
  const typeById = new Map<string, string>()
  for (const node of upgradedNodes) {
    if (node?.id && typeof node.data?.nodeType === 'string') typeById.set(node.id, node.data.nodeType)
  }
  let retiredWires = 0
  let edgesChanged = false
  const upgradedEdges: StudioEdge[] = []
  for (const edge of edges) {
    const sourceType = typeById.get(edge?.source)
    const targetType = typeById.get(edge?.target)
    const retired = targetType ? RETIRED_WIRE_TARGETS[targetType] : undefined
    if (retired && typeof edge.targetHandle === 'string' && retired.includes(edge.targetHandle)) {
      retiredWires += 1
      edgesChanged = true
      continue
    }
    const sourceHandle = typeof edge.sourceHandle === 'string' && sourceType
      ? renamed(OUTPUT_RENAMES[sourceType], edge.sourceHandle) : edge.sourceHandle
    const targetHandle = typeof edge.targetHandle === 'string' && targetType
      ? renamed(INPUT_RENAMES[targetType], edge.targetHandle) : edge.targetHandle
    if (sourceHandle === edge.sourceHandle && targetHandle === edge.targetHandle) {
      upgradedEdges.push(edge)
    } else {
      edgesChanged = true
      upgradedEdges.push({ ...edge, sourceHandle, targetHandle })
    }
  }
  return {
    nodes: nodesChanged ? upgradedNodes : nodes,
    edges: edgesChanged ? upgradedEdges : edges,
    retiredWires,
  }
}

interface WorkspaceLike {
  nodes: StudioNode[]
  edges: StudioEdge[]
  graphData?: Record<string, { nodes: StudioNode[]; edges: StudioEdge[] }>
  performanceDeck?: PerformanceDeckConfig
}

/** A workspace in the current shape: the active graph, every stashed group's
 *  graph, and the Performance Deck pins that name a renamed property. */
export function upgradePreV1Workspace<T extends WorkspaceLike>(workspace: T): { workspace: T; retiredWires: number } {
  const root = upgradePreV1Content(workspace.nodes, workspace.edges)
  let retiredWires = root.retiredWires
  let graphData = workspace.graphData
  if (graphData) {
    const next: NonNullable<T['graphData']> = {}
    let changed = false
    for (const [id, content] of Object.entries(graphData)) {
      const upgraded = upgradePreV1Content(content.nodes ?? [], content.edges ?? [])
      retiredWires += upgraded.retiredWires
      if (upgraded.nodes === content.nodes && upgraded.edges === content.edges) {
        next[id] = content
      } else {
        changed = true
        next[id] = { ...content, nodes: upgraded.nodes, edges: upgraded.edges }
      }
    }
    if (changed) graphData = next
  }
  const typeById = new Map<string, string>()
  for (const node of [...root.nodes, ...Object.values(graphData ?? {}).flatMap((content) => content.nodes ?? [])]) {
    if (node?.id && typeof node.data?.nodeType === 'string') typeById.set(node.id, node.data.nodeType)
  }
  const performanceDeck = workspace.performanceDeck
    ? upgradePreV1Deck(workspace.performanceDeck, typeById)
    : workspace.performanceDeck
  if (root.nodes === workspace.nodes && root.edges === workspace.edges
    && graphData === workspace.graphData && performanceDeck === workspace.performanceDeck) {
    return { workspace, retiredWires }
  }
  return {
    workspace: {
      ...workspace,
      nodes: root.nodes,
      edges: root.edges,
      ...(graphData !== undefined ? { graphData } : {}),
      ...(performanceDeck !== undefined ? { performanceDeck } : {}),
    },
    retiredWires,
  }
}

/** A saved pattern (patternLibrary.ts `SavedPattern`) in the current shape:
 *  its subgraph and its nested group registry. Same object when unchanged. */
export function upgradePreV1Pattern<T extends {
  subgraph: { nodes: StudioNode[]; edges: StudioEdge[] }
  groups?: Record<string, { nodes: StudioNode[]; edges: StudioEdge[] }>
}>(pattern: T): T {
  if (!pattern?.subgraph || !Array.isArray(pattern.subgraph.nodes) || !Array.isArray(pattern.subgraph.edges)) return pattern
  const { workspace } = upgradePreV1Workspace({
    nodes: pattern.subgraph.nodes,
    edges: pattern.subgraph.edges,
    ...(pattern.groups ? { graphData: pattern.groups } : {}),
  })
  if (workspace.nodes === pattern.subgraph.nodes && workspace.edges === pattern.subgraph.edges
    && workspace.graphData === pattern.groups) return pattern
  return {
    ...pattern,
    subgraph: { ...pattern.subgraph, nodes: workspace.nodes, edges: workspace.edges },
    ...(workspace.graphData ? { groups: workspace.graphData } : {}),
  }
}

/** The deck's pins follow a renamed property (and Hue Shift's new unit: the
 *  pin's range and every scene's value for it are turns converted to degrees).
 *  `typeById` is every node in the workspace, by id. */
function upgradePreV1Deck(deck: PerformanceDeckConfig, typeById: ReadonlyMap<string, string>): PerformanceDeckConfig {
  if (!deck || !Array.isArray(deck.pins)) return deck
  const rescaled = new Set<string>()
  let changed = false
  const pins = deck.pins.map((pin: PinnedControl) => {
    const nodeType = typeById.get(pin?.nodeId)
    const rename = nodeType ? PROPERTY_RENAMES[nodeType]?.[pin.propertyKey] : undefined
    if (!rename) return pin
    changed = true
    const scale = rename.scale
    if (scale !== undefined) rescaled.add(pin.id)
    const scaled = (value: number | undefined) => (scale !== undefined && typeof value === 'number' ? value * scale : value)
    return {
      ...pin,
      propertyKey: rename.to,
      ...(pin.min !== undefined ? { min: scaled(pin.min) } : {}),
      ...(pin.max !== undefined ? { max: scaled(pin.max) } : {}),
      ...(pin.step !== undefined ? { step: scaled(pin.step) } : {}),
    }
  })
  if (!changed) return deck
  const scenes = rescaled.size && Array.isArray(deck.scenes)
    ? deck.scenes.map((scene: ParameterScene) => {
      if (!scene?.values) return scene
      const values = { ...scene.values }
      for (const id of rescaled) if (typeof values[id] === 'number') values[id] = (values[id] as number) * 360
      return { ...scene, values }
    })
    : deck.scenes
  return { ...deck, pins, scenes }
}

/** A remembered-trust entry (patternTrust.ts) in the current shape. Entries
 *  are `{"nodeType":"<id>","properties":{...}}` with keys in sorted order. */
export function upgradePreV1TrustEntry(entry: string): string {
  const match = /^\{"nodeType":"([^"]+)"/.exec(entry)
  if (!match) return entry
  const next = upgradePreV1Type(match[1])
  return next === match[1] ? entry : `{"nodeType":"${next}"${entry.slice(match[0].length)}`
}
