import type { StudioNode, StudioEdge } from './graphStore'
import { inputClampRange, resolveNodeScalarExpressions, bypassPort, NODE_LIBRARY } from './nodeLibrary'
import { type Palette, type RGB, type Frame, samplePalette } from './ledColor'
import { getCodeError as getCodeErrorFromSandbox } from './codeSandboxRuntime'
import { DEFAULT_W, DEFAULT_H } from './evaluator/frames'
import { markStateUsed, maybePruneEvaluatorState, advanceFramePool } from './evaluator/memory'
import type { GroupRegistry, PortValue, AudioOverride, EvalContext, NodeEvaluator } from './evaluator/types'
import { AUDIO_EVALUATORS } from '../nodes/audio/evaluate'
import { AUDIO_REACTIVE_EVALUATORS } from '../nodes/audioReactive/evaluate'
import { CODE_EVALUATORS } from '../nodes/code/evaluate'
import { COLOR_EVALUATORS } from '../nodes/color/evaluate'
import { COMPOSITE_EVALUATORS } from '../nodes/composite/evaluate'
import { FIELD_EVALUATORS } from '../nodes/field/evaluate'
import { GENERATIVE_EVALUATORS } from '../nodes/generative/evaluate'
import { GRAPH_EVALUATORS } from '../nodes/graph/evaluate'
import { INPUT_EVALUATORS } from '../nodes/input/evaluate'
import { MATH_EVALUATORS } from '../nodes/math/evaluate'
import { OUTPUT_EVALUATORS } from '../nodes/output/evaluate'
import { SHAPES_EVALUATORS } from '../nodes/shapes/evaluate'
import { SHOW_EVALUATORS } from '../nodes/show/evaluate'
import { SIGNAL_EVALUATORS } from '../nodes/signal/evaluate'
import { SIMULATIONS_EVALUATORS } from '../nodes/simulations/evaluate'
export type { Field, AudioSignal, StorageSignal, PlayerControls, PlayerParticles, PortValue, GroupDef, GroupRegistry, AudioOverride } from './evaluator/types'
export { VOCAL_AURORA_MIN_INPUT_GAIN, VOCAL_AURORA_MAX_INPUT_GAIN, BEAT_FLASH_ATTACK_MAX_SEC } from '../nodes/audioReactive/evaluate'
export { prunePoolBuffers, pruneEvaluatorState, resetEvaluatorState, getEvaluatorMemoryStats } from './evaluator/memory'
export { buildFrame } from './evaluator/frames'
export type { FireDirection, ParticleOpts, FormulaPointsParams } from '../nodes/simulations/evaluate'
export { compositeTransition, getPatternShowSelection, getMusicPlayerControls, PARTICLE_LIFE_MS, PARTICLE_COUNT, renderParticleBurst } from '../nodes/show/evaluate'
export type { PatternShowSelection } from '../nodes/show/evaluate'
export { GOLDEN_RATIO, LISSAJOUS_FIELD_SAMPLES } from '../nodes/field/evaluate'
export type { FormulaFieldParams } from '../nodes/field/evaluate'
export { scheduleTimeOfDay, scheduleWindowProgress } from '../nodes/signal/evaluate'
export { audioHueWeight } from '../nodes/audio/evaluate'

export type { RGB, Palette, Frame }
// ./codeSandboxRuntime owns the Code-node error state (it is the module that
// writes it); the evaluator re-exports it for existing callers.
export { getCodeErrorFromSandbox as getCodeError }


/*
 * Every node type's preview, one table per library category. Each table sits
 * beside the same category's firmware emitters (src/nodes/<category>/), so a
 * node's two implementations are read and changed together. A type belongs to
 * exactly one table; nodeTables.test.ts holds that.
 */
export const NODE_EVALUATOR_TABLES = {
  audio: AUDIO_EVALUATORS,
  audioReactive: AUDIO_REACTIVE_EVALUATORS,
  code: CODE_EVALUATORS,
  color: COLOR_EVALUATORS,
  composite: COMPOSITE_EVALUATORS,
  field: FIELD_EVALUATORS,
  generative: GENERATIVE_EVALUATORS,
  graph: GRAPH_EVALUATORS,
  input: INPUT_EVALUATORS,
  math: MATH_EVALUATORS,
  output: OUTPUT_EVALUATORS,
  shapes: SHAPES_EVALUATORS,
  show: SHOW_EVALUATORS,
  signal: SIGNAL_EVALUATORS,
  simulations: SIMULATIONS_EVALUATORS,
} as const
const NODE_EVALUATORS = new Map<string, NodeEvaluator>(
  Object.values(NODE_EVALUATOR_TABLES).flatMap((table) => Object.entries(table)),
)

// Build the memoised evaluator closure for one graph (or group subgraph) at a
// given tick. `instancePrefix` namespaces stateful-node state per group
// instance; `groupStack` breaks group-level recursion; `groupInputs` carries
// the values bound to the current group's exposed parameters.
interface EvalMaps {
  nodeMap: Map<string, StudioNode>
  incoming: Map<string, { srcId: string; srcPort: string }>
}

// The per-evaluator lookup tables: node id → node, and
// "targetNodeId:targetPortId" → upstream {srcId, srcPort}.
function buildEvalMaps(nodes: StudioNode[], edges: StudioEdge[]): EvalMaps {
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const incoming = new Map<string, { srcId: string; srcPort: string }>()
  for (const edge of edges) {
    if (edge.source && edge.target && edge.sourceHandle && edge.targetHandle)
      incoming.set(`${edge.target}:${edge.targetHandle}`, {
        srcId: edge.source,
        srcPort: edge.sourceHandle,
      })
  }
  return { nodeMap, incoming }
}

function createEvalNode(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  W: number,
  H: number,
  groups: GroupRegistry,
  instancePrefix: string,
  groupStack: ReadonlySet<string>,
  groupInputs: Record<string, PortValue>,
  // Recorded/show audio injected at an explicit source or group boundary.
  audioOverride: AudioOverride | null = null,
  // Prebuilt lookup maps for callers that create many evaluators over the same
  // graph (e.g. sampling a scope across a tick series) — see buildEvalMaps.
  shared: EvalMaps | null = null,
  // Whether CustomFormula/FieldFormula/Code nodes may evaluate their preview
  // logic (todo.md's P0 trust-boundary item) — appended last so every existing
  // positional call site keeps working unchanged, defaulting to trusted.
  trusted = true,
  // Root hardware remains authoritative while evaluating nested groups.
  capabilityNodes: readonly StudioNode[] = nodes,
  // Unscaled wall-clock tick. Most nodes intentionally read the animation
  // clock above; Pattern Slideshow alone uses this for dwell and transitions
  // so Master Speed changes motion without changing elapsed durations.
  elapsedTick = tick,
) {
  const t = tick / 60   // seconds at assumed 60 fps
  const elapsedT = elapsedTick / 60

  // State maps are module-level and keyed by node id; prefix with the group
  // instance path so two instances of the same group don't share state.
  const stateKey = (id: string) => markStateUsed(instancePrefix + id)

  const { nodeMap, incoming } = shared ?? buildEvalMaps(nodes, edges)

  const memo = new Map<string, Record<string, PortValue>>()
  // Nodes currently on the evaluation stack — used to break graph cycles.
  const inProgress = new Set<string>()

  // Resolve one input port: walk the edge map, fall back to `fallback`
  function input(nodeId: string, portId: string, fallback: PortValue): PortValue {
    const up = incoming.get(`${nodeId}:${portId}`)
    if (!up) return fallback
    return evalNode(up.srcId)[up.srcPort] ?? fallback
  }

  function num(nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def = 0): number {
    const v = Number(input(nodeId, portId, Number(props[propKey] ?? def)))
    // With the node's `clampInputs` toggle on, clamp a *wired* signal to the
    // control's slider range (an unwired value already comes from a bounded
    // slider) — the inline alternative to a Clamp node on every connection.
    if (props.clampInputs && incoming.has(`${nodeId}:${portId}`)) {
      const r = inputClampRange(nodeMap.get(nodeId)?.data.nodeType as string, propKey)
      if (r) return Math.max(r.min, Math.min(r.max, v))
    }
    return v
  }

  // Resolve a palette: prefer a connected `palette` port (a preset name from
  // PaletteSelector or custom colors from CustomPalette), else the node's
  // property (a preset name).
  function pal(nodeId: string, portId: string, props: Record<string, unknown>, propKey: string, def: string): Palette {
    const fallback = String(props[propKey] ?? def)
    const v = input(nodeId, portId, fallback)
    if (Array.isArray(v)) return v as RGB[]
    return typeof v === 'string' ? v : fallback
  }

  const ctx: EvalContext = {
    nodes, edges, tick, t, elapsedTick, elapsedT, W, H,
    groups, instancePrefix, groupStack, groupInputs, audioOverride, trusted, capabilityNodes,
    nodeMap, incoming, input, num, pal, stateKey, evaluateGraph,
  }

  function evalNode(id: string): Record<string, PortValue> {
    if (memo.has(id)) return memo.get(id)!
    // Re-entering a node still on the stack means the graph has a cycle.
    // Return empty so the upstream input falls back to its default instead
    // of recursing forever and overflowing the stack.
    if (inProgress.has(id)) return {}
    const node = nodeMap.get(id)
    if (!node) return {}
    inProgress.add(id)

    const type  = node.data.nodeType as string
    const props = resolveNodeScalarExpressions(
      type,
      node.data.properties as Record<string, unknown>,
      W,
      H,
    )
    let out: Record<string, PortValue> = {}

    // Bypassed effect-chain nodes pass their matching frame/field input
    // straight to the output, skipping their own logic (and any stateful
    // side effects) entirely — the live A/B toggle for a node in a chain.
    if (props.bypassed) {
      const nodeOutputs = node.data.outputs as { id: string; dataType?: string }[]
      const nodeInputs = node.data.inputs as { id: string; dataType?: string }[]
      const bp = bypassPort(nodeOutputs, nodeInputs)
      if (bp) {
        out = { [bp.outPort]: input(id, bp.inPort, null) }
        memo.set(id, out)
        inProgress.delete(id)
        return out
      }
    }

    // A type with no table entry (Board, the audio sources, power parts…)
    // publishes nothing: it is hardware, read elsewhere through the root graph.
    const evaluate = NODE_EVALUATORS.get(type)
    if (evaluate) out = evaluate(ctx, id, props, node, type)

    memo.set(id, out)
    inProgress.delete(id)
    return out
  }

  return evalNode
}

// ── Public entry points ───────────────────────────────────────────────────────

export function evaluateGraph(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
  groups: GroupRegistry = {},
  // Internal recursion bookkeeping for nested groups — callers leave these defaulted.
  instancePrefix = '',
  groupStack: ReadonlySet<string> = new Set(),
  groupInputs: Record<string, PortValue> = {},
  audioOverride: AudioOverride | null = null,
  // Whether CustomFormula/FieldFormula/Code nodes may evaluate their preview
  // logic — appended last so existing positional callers keep working
  // unchanged, defaulting to trusted (todo.md's P0 trust-boundary item).
  trusted = true,
  // Root physical sources used by Audio capability nodes in nested groups.
  capabilityNodes: readonly StudioNode[] = nodes,
  // Real elapsed time can differ from animation time when Master Speed is
  // active. Appended so existing callers keep the one-clock behaviour.
  elapsedTick = tick,
): Frame | null {
  maybePruneEvaluatorState()
  if (nodes.length === 0) return null
  const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, groups, instancePrefix, groupStack, groupInputs, audioOverride, null, trusted, capabilityNodes, elapsedTick)
  // Render only what reaches an explicit terminal: a GroupOutput inside a group
  // subgraph, or a MatrixOutput at the root, each passing through its `frame`
  // input. A graph with no terminal previews nothing — the canvas falls back to
  // its idle animation — so the preview always matches what would be flashed.
  const outputNode = nodes.find(n => {
    const nt = (n.data as { nodeType?: string }).nodeType
    return nt === 'GroupOutput' || nt === 'MatrixOutput'
  })
  if (outputNode) {
    const frame = evalNode(outputNode.id).frame
    if (frame) return frame as Frame
  }
  return null
}

/**
 * Probe a single node's scalar output port at one tick, reusing the full
 * evaluator so the value matches what the graph actually computes (e.g. a
 * ComplexWave's `result` reflects its real upstream inputs). Stateful upstream
 * nodes run under a reserved state namespace so the probe never disturbs the
 * live render. Returns 0 for missing/non-numeric ports (booleans → 0/1).
 */
export function evaluateScalar(
  nodes: StudioNode[],
  edges: StudioEdge[],
  nodeId: string,
  portId: string,
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
): number {
  return evaluateScalarSeries(nodes, edges, nodeId, portId, [tick], gridW, gridH)[0]
}

/**
 * `evaluateScalar` across a series of ticks in one call: the graph lookup maps
 * are built once and shared by every per-tick evaluator, so sampling a scope
 * window costs one graph walk per tick instead of one full setup per tick.
 */
export function evaluateScalarSeries(
  nodes: StudioNode[],
  edges: StudioEdge[],
  nodeId: string,
  portId: string,
  ticks: readonly number[],
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
): number[] {
  if (nodes.length === 0) return ticks.map(() => 0)
  const shared = buildEvalMaps(nodes, edges)
  return ticks.map((tick) => {
    const evalNode = createEvalNode(nodes, edges, tick, gridW, gridH, {}, '__scope__/', new Set(), {}, null, shared)
    const v = evalNode(nodeId)?.[portId]
    return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0
  })
}

// Node types every frame pass must evaluate even when skipping auxiliary
// nodes: the terminals (they define the rendered frame) and BeatDetect, whose
// one-frame beat pulse triggers the preview loop's early publish — sampling it
// only on publish frames would miss most beats.
const HOT_NODE_TYPES = new Set<string>([
  'BeatDetect',
  /*
   * Every sink: a node the graph feeds and nothing reads.
   *
   * Ports/category say it: ordinary sinks have inputs and no outputs, while an
   * output-category node with inputs remains a terminal even when it publishes
   * touch intent. That covers `GroupOutput`, `MatrixOutput`, every display and
   * Master Speed without naming any of them.
   * The rule used to be narrower (workbench-owned parts only) and each new
   * terminal had to remember to qualify; a sink that is not in this set is
   * skipped on non-publish frames, so a wired progress bar crawled at the
   * ~8 fps preview cadence instead of following its input, and a speed knob
   * would only be read eight times a second.
   *
   * A custom `Display` has instance-minted ports, so it cannot appear in this
   * library-derived set. `hotNodeIds` adds an instance when one of those inputs
   * is wired: Run mode and the mounted panel thumbnail now paint its published
   * role values, so sampling at the full frame cadence is observable work.
   */
  ...NODE_LIBRARY
    .filter((def) => def.inputs.length > 0 && (def.outputs.length === 0 || def.category === 'output'))
    .map((def) => def.type),
])

// Single-entry cache of the "hot" node set — the upstream closure of the
// terminals and beat emitters — recomputed only when the graph arrays change
// (the preview loop asks for it 60×/s with stable references between edits).
let hotIdsNodes: StudioNode[] | null = null
let hotIdsEdges: StudioEdge[] | null = null
let hotIdsCache = new Set<string>()

function hotNodeIds(nodes: StudioNode[], edges: StudioEdge[]): Set<string> {
  if (nodes === hotIdsNodes && edges === hotIdsEdges) return hotIdsCache
  hotIdsNodes = nodes
  hotIdsEdges = edges
  const byTarget = new Map<string, string[]>()
  for (const e of edges) {
    if (!e.source || !e.target) continue
    const into = byTarget.get(e.target)
    if (into) into.push(e.source)
    else byTarget.set(e.target, [e.source])
  }
  const hot = new Set<string>()
  const pending: string[] = []
  for (const n of nodes) {
    const nodeType = String((n.data as { nodeType?: unknown }).nodeType)
    // A panel with something wired into a widget runs at preview cadence, not
    // on the slow publish frames: a readout that updates twice a second is not
    // a readout. The panel is already a terminal, so this only adds the wired
    // case to what HOT_NODE_TYPES covers.
    const liveCustomDisplay = nodeType === 'TransportDisplay'
      && edges.some((edge) => edge.target === n.id && edge.targetHandle?.startsWith('widget:'))
    if (HOT_NODE_TYPES.has(nodeType) || liveCustomDisplay) {
      hot.add(n.id)
      pending.push(n.id)
    }
  }
  while (pending.length) {
    const id = pending.pop()!
    for (const src of byTarget.get(id) ?? []) {
      if (hot.has(src)) continue
      hot.add(src)
      pending.push(src)
    }
  }
  hotIdsCache = hot
  return hot
}

/**
 * Evaluate the whole graph once, returning the terminal frame (as
 * `evaluateGraph` would) plus every node's output ports — so per-node previews
 * can be driven from the same single pass without double-advancing stateful
 * nodes. Outputs are keyed by node id; each is a `{ portId: value }` record.
 *
 * With `auxNodes` false, only the hot set is evaluated: nodes feeding a
 * terminal, plus beat emitters and their upstream chains. Nodes disconnected
 * from the output only feed previews published at ~8 fps, so the preview loop
 * passes false on non-publish frames and their evaluation cost drops to the
 * publish cadence (their per-call stateful simulations advance at that rate —
 * the same trade-off the hidden-panel throttle already makes graph-wide).
 */
export function evaluateGraphFull(
  nodes: StudioNode[],
  edges: StudioEdge[],
  tick: number,
  gridW = DEFAULT_W,
  gridH = DEFAULT_H,
  groups: GroupRegistry = {},
  auxNodes = true,
  // Whether CustomFormula/FieldFormula/Code nodes may evaluate their preview
  // logic — appended last so existing positional callers keep working
  // unchanged, defaulting to trusted (todo.md's P0 trust-boundary item).
  trusted = true,
  // An offline render needs both of these and needs the outputs map too — it
  // reads Master Speed from the same pass rather than running a second one,
  // which would double-advance every stateful node. Trailing and defaulted, so
  // the live preview's call is unchanged.
  instancePrefix = '',
  audioOverride: AudioOverride | null = null,
  // Separate wall clock for schedulers that must not follow Master Speed.
  // Defaulting to `tick` preserves every non-preview/direct evaluator caller.
  elapsedTick = tick,
): { frame: Frame | null; outputs: Map<string, Record<string, unknown>> } {
  maybePruneEvaluatorState()
  advanceFramePool()
  const outputs = new Map<string, Record<string, unknown>>()
  if (nodes.length === 0) return { frame: null, outputs }
  const evalNode = createEvalNode(
    nodes, edges, tick, gridW, gridH, groups, instancePrefix, new Set(), {}, audioOverride, null, trusted, nodes, elapsedTick,
  )
  const hot = auxNodes ? null : hotNodeIds(nodes, edges)
  for (const n of nodes) {
    if (hot && !hot.has(n.id)) continue
    outputs.set(n.id, evalNode(n.id))
  }
  const outputNode = nodes.find(n => {
    const nt = (n.data as { nodeType?: string }).nodeType
    return nt === 'GroupOutput' || nt === 'MatrixOutput'
  })
  const frame = outputNode ? ((outputs.get(outputNode.id)?.frame as Frame | undefined) ?? null) : null
  return { frame, outputs }
}

/** Sample a palette into `n` evenly-spaced RGB stops (for a gradient strip). */
export function paletteStops(palette: Palette, n: number): RGB[] {
  const out: RGB[] = []
  for (let i = 0; i < n; i++) out.push(samplePalette(palette, n === 1 ? 0 : i / (n - 1)))
  return out
}
