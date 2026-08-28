/**
 * Which LED output a music-sync show plays on.
 *
 * The answer comes off a wire: the Music Player or Performance Generator's `frame` output into
 * an LED output's `frame` input. Nothing renders through that edge — the SD
 * player drives the LEDs itself, from the card — but it is the only place the
 * destination can be *stated*, and stating it is the job.
 *
 * It replaces `nodes.find(n => nodeType === 'MatrixOutput')`, which every
 * consumer used independently. That was first-in-array-order: right by accident
 * on a bench with one output, a silent coin-flip on a bench with two, and on a
 * bench with none it fell through to the player's hardcoded 16x16 WS2812B on
 * GPIO18 — a full sketch, flashed, for hardware nobody had described. There is
 * no fallback here for the same reason there is no fallback in
 * `reachableFromOutputs`: a generator that reaches no output is not a show, and
 * the fix is to say so (`findShowTargetErrors`), not to guess.
 */

/** Minimal structural node, so codegen does not have to import the store. */
export interface ShowTargetNode {
  id: string
  data: { nodeType: string; label?: unknown; properties: Record<string, unknown> }
}

/** Minimal structural edge, matching React Flow's shape. */
export interface ShowTargetEdge {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export type ShowTargetProblem =
  /** The generator's `frame` output reaches no LED output. */
  | 'unconnected'
  /** It reaches more than one. The player drives a single output. */
  | 'ambiguous'

export interface ShowTargetResolution<T> {
  /** The output the show plays on, or null when the graph has not said. */
  target: T | null
  /** Every output the generator's frame reaches — 2+ is the ambiguous case. */
  reached: T[]
  problem: ShowTargetProblem | null
}

/**
 * The LED output a Music Player or Performance Generator sends its show to.
 *
 * One output is the supported shape: the player allocates one `leds` array and
 * one controller. Two is a real thing to want and a real thing to build, but
 * the player cannot do it yet, so it is reported rather than half-honoured by
 * picking one — which is the exact failure this function exists to end.
 */
export function resolveShowTarget<T extends ShowTargetNode>(
  nodes: T[],
  edges: ShowTargetEdge[],
): ShowTargetResolution<T> {
  const generator = nodes.find((node) =>
    node.data.nodeType === 'PatternMaster'
    || node.data.nodeType === 'PatternSlideshow'
    || node.data.nodeType === 'PerformanceGenerator',
  )
  if (!generator) return { target: null, reached: [], problem: 'unconnected' }

  const reached = edges
    .filter((edge) => edge.source === generator.id
      && (edge.sourceHandle ?? '') === 'frame'
      && (edge.targetHandle ?? '') === 'frame')
    .map((edge) => nodes.find((node) => node.id === edge.target))
    .filter((node): node is T => !!node && node.data.nodeType === 'MatrixOutput')

  if (reached.length === 0) return { target: null, reached, problem: 'unconnected' }
  if (reached.length > 1) return { target: null, reached, problem: 'ambiguous' }
  return { target: reached[0], reached, problem: null }
}

/** Human name for an output, e.g. `LED Matrix · 16×16`. */
export function showTargetLabel(node: ShowTargetNode): string {
  const props = node.data.properties
  const label = typeof node.data.label === 'string' && node.data.label ? node.data.label : 'LED output'
  const w = Number(props.width)
  const h = Number(props.height)
  const size = Number.isFinite(w) && Number.isFinite(h) ? ` · ${w}×${h}` : ''
  return `${label}${size}`
}
