// Segment networks: a string laid along the edges of a small planar graph,
// the Chromancer model. Nodes sit at (x, y) in canvas units; each edge is one
// run of `ledsPerEdge` LEDs along the straight line between its two nodes,
// and the string is the edges concatenated in edge order, each in its own
// direction (from → to), so the edge list is the wiring order an installer
// solders. A network is a generator of positions: once its LEDs are placed,
// the string is a positioned string and nothing downstream learns a new
// layout. See docs/design/segment-networks.md.
//
// Import-free on purpose, like stringPositions.ts, which reads it.

export const NETWORK_PRESETS = ['hexagons', 'triangles', 'custom'] as const
export type NetworkPreset = (typeof NETWORK_PRESETS)[number]

export const NETWORK_MAX_NODES = 64
export const NETWORK_MAX_EDGES = 128
export const NETWORK_LEDS_PER_EDGE = { min: 2, max: 100, default: 14 } as const
/** The positioned-string ceiling; `ledsPerEdge` is clamped so a network fits. */
export const NETWORK_MAX_LEDS = 300

export interface SegmentNetwork {
  /** Canvas units. */
  nodes: Array<[number, number]>
  /** Node indices, from → to, in wiring order. */
  edges: Array<[number, number]>
}

const EPSILON = 1e-6

/** Collect polygons into one graph, merging coincident vertices and shared edges. */
function fromPolygons(polygons: Array<Array<[number, number]>>): SegmentNetwork {
  const nodes: Array<[number, number]> = []
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  const nodeIndex = (x: number, y: number): number => {
    const found = nodes.findIndex(([nx, ny]) => Math.abs(nx - x) < EPSILON && Math.abs(ny - y) < EPSILON)
    if (found >= 0) return found
    nodes.push([x, y])
    return nodes.length - 1
  }
  for (const polygon of polygons) {
    const ids = polygon.map(([x, y]) => nodeIndex(x, y))
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b = ids[(i + 1) % ids.length]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      if (seen.has(key)) continue
      seen.add(key)
      edges.push([a, b])
    }
  }
  return { nodes, edges }
}

function hexagon(cx: number, cy: number, r: number): Array<[number, number]> {
  // Pointy-top, so rows of hexagons share slanted edges the way Chromancer's do.
  return Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 6 + (i * Math.PI) / 3
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  })
}

/** Four pointy-top hexagons in two rows: 16 nodes, 19 edges. */
function hexagonsPreset(): SegmentNetwork {
  const r = 1
  const w = Math.sqrt(3) * r
  return fromPolygons([
    hexagon(0, 0, r), hexagon(w, 0, r),
    hexagon(w / 2, 1.5 * r, r), hexagon(1.5 * w, 1.5 * r, r),
  ])
}

/** A triangle of side three, subdivided: 10 nodes, 18 edges. */
function trianglesPreset(): SegmentNetwork {
  const h = Math.sqrt(3) / 2
  const at = (row: number, col: number): [number, number] => [col + row / 2, (3 - row) * h]
  const polygons: Array<Array<[number, number]>> = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3 - row; col++) {
      polygons.push([at(row, col), at(row, col + 1), at(row + 1, col)])
      if (col < 2 - row) polygons.push([at(row, col + 1), at(row + 1, col + 1), at(row + 1, col)])
    }
  }
  return fromPolygons(polygons)
}

const PRESET_SHAPES: Record<Exclude<NetworkPreset, 'custom'>, () => SegmentNetwork> = {
  hexagons: hexagonsPreset,
  triangles: trianglesPreset,
}

/** A preset's graph in its own units, before fitting to a canvas. */
export function presetNetwork(preset: Exclude<NetworkPreset, 'custom'>): SegmentNetwork {
  return PRESET_SHAPES[preset]()
}

/**
 * Parse a custom network from JSON text: `{ "nodes": [[x, y], …], "edges":
 * [[from, to], …] }`. Null when the text is not that shape, an index is out
 * of range, an edge joins a node to itself, or a limit is passed. A duplicate
 * edge (either direction) is dropped so it cannot double a run.
 */
export function parseSegmentNetwork(text: unknown): SegmentNetwork | null {
  let parsed: unknown
  try { parsed = JSON.parse(String(text ?? '')) } catch { return null }
  if (!parsed || typeof parsed !== 'object') return null
  const raw = parsed as { nodes?: unknown; edges?: unknown }
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null
  if (raw.nodes.length < 2 || raw.nodes.length > NETWORK_MAX_NODES) return null
  if (raw.edges.length < 1 || raw.edges.length > NETWORK_MAX_EDGES) return null
  const nodes: Array<[number, number]> = []
  for (const node of raw.nodes) {
    if (!Array.isArray(node) || node.length !== 2) return null
    const x = Number(node[0]), y = Number(node[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    nodes.push([x, y])
  }
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  for (const edge of raw.edges) {
    if (!Array.isArray(edge) || edge.length !== 2) return null
    const a = Number(edge[0]), b = Number(edge[1])
    if (!Number.isInteger(a) || !Number.isInteger(b)) return null
    if (a < 0 || b < 0 || a >= nodes.length || b >= nodes.length || a === b) return null
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push([a, b])
  }
  return { nodes, edges }
}

/** The network scaled and centred so its nodes fit the canvas with half a
 *  pixel of margin, aspect kept, so a pixel centre can sit on every node. */
export function fitNetworkToCanvas(network: SegmentNetwork, w: number, h: number): SegmentNetwork {
  const xs = network.nodes.map(([x]) => x), ys = network.nodes.map(([, y]) => y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = maxX - minX, spanY = maxY - minY
  const innerW = Math.max(0, w - 1), innerH = Math.max(0, h - 1)
  const scale = Math.min(
    spanX > EPSILON ? innerW / spanX : Infinity,
    spanY > EPSILON ? innerH / spanY : Infinity,
  )
  const k = Number.isFinite(scale) ? scale : 1
  const left = 0.5 + (innerW - spanX * k) / 2
  const top = 0.5 + (innerH - spanY * k) / 2
  return {
    nodes: network.nodes.map(([x, y]) => [left + (x - minX) * k, top + (y - minY) * k]),
    edges: network.edges,
  }
}

/** `ledsPerEdge` clamped to its range and to the positioned-string ceiling. */
export function networkLedsPerEdge(value: unknown, edgeCount: number): number {
  const parsed = Math.round(Number(value))
  const wanted = Number.isFinite(parsed) ? parsed : NETWORK_LEDS_PER_EDGE.default
  const ceiling = Math.max(NETWORK_LEDS_PER_EDGE.min, Math.floor(NETWORK_MAX_LEDS / Math.max(1, edgeCount)))
  return Math.max(NETWORK_LEDS_PER_EDGE.min, Math.min(NETWORK_LEDS_PER_EDGE.max, ceiling, wanted))
}

/** One point per LED: each edge's LEDs sit at `from + (i + 0.5) / n × (to − from)`,
 *  edges in order, each in its own direction. */
export function networkPositions(network: SegmentNetwork, ledsPerEdge: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (const [a, b] of network.edges) {
    const [ax, ay] = network.nodes[a], [bx, by] = network.nodes[b]
    for (let i = 0; i < ledsPerEdge; i++) {
      const t = (i + 0.5) / ledsPerEdge
      points.push([ax + (bx - ax) * t, ay + (by - ay) * t])
    }
  }
  return points
}
