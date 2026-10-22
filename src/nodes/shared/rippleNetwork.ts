// The Ripple pattern's network kernel: ripples travel along the edges of a
// segment network and choose, at each node, which edge to take next. The
// turning rule runs here once per (edge, end) and is baked into the sketch as
// tables, so the preview and the firmware make the same choice at every node
// by construction and the sketch carries no trigonometry. Only the `random`
// behaviour diverges (the preview's seeded LCG against `random16`), the same
// documented gap as String Particles. See docs/design/segment-networks.md.

import {
  fitNetworkToCanvas, networkLedsPerEdge, networkPositions, parseSegmentNetwork, presetNetwork, type SegmentNetwork,
} from '../../state/output/segmentNetwork'

export const RIPPLE_BEHAVIOURS = ['straight', 'left', 'right', 'angry', 'explode', 'random'] as const
export type RippleBehaviour = (typeof RIPPLE_BEHAVIOURS)[number]

export const RIPPLE_MAX_RIPPLES = 16
export const RIPPLE_WIDTH = { min: 1, max: 8, default: 3 } as const
export const RIPPLE_LIFETIME_SEC = { min: 0.2, max: 10, default: 3 } as const
/** LEDs per second at speed 1. */
export const RIPPLE_SPEED_MAX = 60

/** The behaviour a property names, `straight` for anything else. */
export function rippleBehaviour(value: unknown): RippleBehaviour {
  return (RIPPLE_BEHAVIOURS as readonly string[]).includes(String(value)) ? value as RippleBehaviour : 'straight'
}

/** The network a Ripple node repeats, in its own units, with the LEDs per
 *  edge it can afford: the same choice the LED output makes from the same
 *  properties, so the two agree. An unreadable custom JSON is the hexagons. */
export function rippleShape(props: Record<string, unknown>): { shape: SegmentNetwork; ledsPerEdge: number } {
  const preset = props.networkPreset === 'triangles' ? 'triangles' : props.networkPreset === 'custom' ? 'custom' : 'hexagons'
  const custom = preset === 'custom' ? parseSegmentNetwork(props.network) : null
  const shape = custom ?? presetNetwork(preset === 'custom' ? 'hexagons' : preset)
  return { shape, ledsPerEdge: networkLedsPerEdge(props.ledsPerEdge, shape.edges.length) }
}

/** A ripple head: on edge `edge`, `offset` LEDs along it in its travel
 *  direction (`dir` +1 is from → to), with a palette index and an age. */
export interface Ripple {
  edge: number
  dir: 1 | -1
  offset: number
  hue: number
  ageSec: number
}

/** One end of an edge a ripple can arrive at: `end` 0 is the from node, 1 the to node. */
export interface EdgeEnd {
  /** Edges leaving this node, excluding the one arrived on unless it is the only one. */
  outgoing: Array<{ edge: number; dir: 1 | -1 }>
  /** The outgoing choice each deterministic behaviour makes (index into `outgoing`). */
  straight: number
  left: number
  right: number
  angry: number
}

export interface RippleTables {
  network: SegmentNetwork
  ledsPerEdge: number
  /** LED points in canvas units, edge by edge: `points[edge * ledsPerEdge + i]`. */
  points: Array<[number, number]>
  /** `ends[edge * 2 + end]`. */
  ends: EdgeEnd[]
}

function heading(network: SegmentNetwork, edge: number, dir: 1 | -1): number {
  const [a, b] = network.edges[edge]
  const [fx, fy] = network.nodes[dir === 1 ? a : b]
  const [tx, ty] = network.nodes[dir === 1 ? b : a]
  return Math.atan2(ty - fy, tx - fx)
}

/** Signed turn from heading `from` to heading `to`, in (-π, π]; left is positive
 *  on a y-down canvas when the angle grows clockwise, so `left` here means the
 *  smaller angle, which reads as a left turn on the LED Output pane. */
function turn(from: number, to: number): number {
  let d = to - from
  while (d <= -Math.PI) d += 2 * Math.PI
  while (d > Math.PI) d -= 2 * Math.PI
  return d
}

/** Build the kernel's tables for a network fitted to a W × H canvas. */
export function buildRippleTables(shape: SegmentNetwork, ledsPerEdge: number, W: number, H: number): RippleTables {
  const network = fitNetworkToCanvas(shape, W, H)
  const points = networkPositions(network, ledsPerEdge)
  const ends: EdgeEnd[] = []
  for (let edge = 0; edge < network.edges.length; edge++) {
    for (const end of [0, 1] as const) {
      const node = network.edges[edge][end]
      const arriving = end === 1 ? heading(network, edge, 1) : heading(network, edge, -1)
      const candidates: Array<{ edge: number; dir: 1 | -1; turn: number }> = []
      network.edges.forEach(([a, b], other) => {
        if (other === edge) return
        if (a === node) candidates.push({ edge: other, dir: 1, turn: turn(arriving, heading(network, other, 1)) })
        else if (b === node) candidates.push({ edge: other, dir: -1, turn: turn(arriving, heading(network, other, -1)) })
      })
      // A dead end bounces back along the edge it came on.
      if (candidates.length === 0) candidates.push({ edge, dir: end === 1 ? -1 : 1, turn: Math.PI })
      // Sorted by signed turn, so ties resolve the same way everywhere.
      candidates.sort((p, q) => p.turn - q.turn || p.edge - q.edge)
      const pick = (score: (c: { turn: number }) => number): number => {
        let best = 0
        for (let i = 1; i < candidates.length; i++) if (score(candidates[i]) < score(candidates[best])) best = i
        return best
      }
      ends.push({
        outgoing: candidates.map(({ edge: e, dir }) => ({ edge: e, dir })),
        straight: pick((c) => Math.abs(c.turn)),
        angry: pick((c) => -Math.abs(c.turn)),
        left: 0,
        right: candidates.length - 1,
      })
    }
  }
  return { network, ledsPerEdge, points, ends }
}

/** The edge end a ripple reaches when it runs off `edge` travelling `dir`. */
export function arrivalEnd(edge: number, dir: 1 | -1): number {
  return edge * 2 + (dir === 1 ? 1 : 0)
}

/** The canvas point of the LED `offset` LEDs along `edge` in direction `dir`;
 *  offsets are clamped to the edge's LEDs. */
export function ripplePoint(tables: RippleTables, edge: number, dir: 1 | -1, offset: number): [number, number] {
  const n = tables.ledsPerEdge
  const i = Math.max(0, Math.min(n - 1, Math.floor(offset)))
  return tables.points[edge * n + (dir === 1 ? i : n - 1 - i)]
}

/**
 * Advance one ripple by `ledsMoved` LEDs, following the behaviour at every
 * node it passes. `random` draws from `rnd` in [0, 1). Returns the ripples
 * that continue: one, or several for `explode`, or none when it ends at a
 * dead end that offers only the way back and the behaviour is explode.
 */
export function advanceRipple(
  tables: RippleTables, ripple: Ripple, ledsMoved: number, behaviour: RippleBehaviour, rnd: () => number,
): Ripple[] {
  const n = tables.ledsPerEdge
  let { edge, dir, offset } = ripple
  offset += ledsMoved
  const out: Ripple[] = []
  let guard = 0
  while (offset >= n && guard++ < 64) {
    const end = tables.ends[arrivalEnd(edge, dir)]
    const carry = offset - n
    if (behaviour === 'explode') {
      for (const next of end.outgoing) out.push({ ...ripple, edge: next.edge, dir: next.dir, offset: 0 })
      // Each branch continues from the node with the leftover distance.
      return out.flatMap((r) => advanceRipple(tables, r, carry, 'straight', rnd))
    }
    const choice = behaviour === 'random'
      ? Math.min(end.outgoing.length - 1, Math.floor(rnd() * end.outgoing.length))
      : end[behaviour]
    const next = end.outgoing[choice]
    edge = next.edge
    dir = next.dir
    offset = carry
  }
  return [{ ...ripple, edge, dir, offset }]
}
