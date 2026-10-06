// Geometry shared by the Wireframe3D node's live evaluator and its C++
// generator, so a rotating wireframe model previews and flashes identically.
//
// A mesh is stored as two flat number arrays — `vertices` as x,y,z triples,
// `edges` as vertex-index pairs — mirroring the flat-array convention used by
// image.ts's pixel data. Built-in presets are plain data (like font.ts's
// FONT); an uploaded custom mesh is validated and capped the same way
// image.ts caps an uploaded picture.

/** Largest custom mesh accepted — caps the baked array size and per-frame cost.
 *  WIREFRAME_MAX_VERTS must stay <= 256: the C++ generator bakes edge vertex
 *  indices as uint8_t (0-255). */
export const WIREFRAME_MAX_VERTS = 256
export const WIREFRAME_MAX_EDGES = 512

// A raw upload past this size isn't worth decimating — sorting/union-find
// over it would noticeably stall the browser for a shape that was never
// going to read as anything but noise on a small LED matrix anyway. Well
// above what any reasonable primitive model needs.
export const WIREFRAME_DECIMATE_INPUT_MAX_VERTS = 20000
export const WIREFRAME_DECIMATE_INPUT_MAX_EDGES = 60000

export interface WireframeMesh {
  vertices: number[] // flat x,y,z triples, length a multiple of 3
  edges: number[] // flat i,j vertex-index pairs, length a multiple of 2
}

export type WireframeModelId = 'cube' | 'pyramid' | 'octahedron' | 'icosahedron' | 'custom'

export const WIREFRAME_MODEL_OPTIONS: WireframeModelId[] = ['cube', 'pyramid', 'octahedron', 'icosahedron', 'custom']

/** Validate an unknown value as a WireframeMesh (flat form), or null if it isn't one. */
export function asWireframeMesh(value: unknown): WireframeMesh | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const vertices = v.vertices, edges = v.edges
  if (!Array.isArray(vertices) || vertices.length === 0 || vertices.length % 3 !== 0) return null
  if (!vertices.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const vertCount = vertices.length / 3
  if (vertCount > WIREFRAME_MAX_VERTS) return null
  if (!Array.isArray(edges) || edges.length % 2 !== 0) return null
  if (edges.length / 2 > WIREFRAME_MAX_EDGES) return null
  if (!edges.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < vertCount)) return null
  return { vertices: vertices as number[], edges: edges as number[] }
}

// A simple disjoint-set (union-find) over vertex indices, used to track
// which original vertices have been collapsed into the same merged group.
class VertexUnionFind {
  private readonly parent: number[]
  constructor(n: number) {
    this.parent = new Array(n)
    for (let i = 0; i < n; i++) this.parent[i] = i
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }
  union(a: number, b: number): void {
    const ra = this.find(a), rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

/**
 * Simplify a raw (uncapped) vertex/edge list down to at most `maxVerts`
 * vertices and `maxEdges` edges, so an uploaded model that's too dense for
 * the live preview / firmware budget gets auto-simplified instead of
 * rejected outright.
 *
 * Vertex reduction is a single greedy pass over edges sorted shortest-first:
 * union-find collapses each edge's endpoints into one group (skipping edges
 * that already share a group) until the target vertex count is reached, then
 * every group is replaced by the centroid of its members — the standard
 * "shortest-edge collapse" simplification heuristic. It doesn't preserve
 * surface curvature the way a quadric-error mesh decimator would (there's no
 * face data left by this point to weigh against), but it holds up fine for
 * the simple low-poly primitives this node is meant for. A mesh sparser than
 * its vertex-count target (more isolated points than spare edges) falls back
 * to repeatedly merging the two closest remaining group centroids.
 *
 * Edge reduction (if still needed after vertex merging drops/dedupes some
 * edges naturally) keeps the shortest remaining edges and drops the rest —
 * cheap and deterministic, at the cost of a few vertices going unconnected.
 */
export function decimateWireframeMesh(
  vertices: number[],
  edges: number[],
  maxVerts: number = WIREFRAME_MAX_VERTS,
  maxEdges: number = WIREFRAME_MAX_EDGES,
): WireframeMesh | null {
  const vertCount = vertices.length / 3
  if (vertCount === 0 || vertices.length % 3 !== 0 || edges.length % 2 !== 0) return null
  if (!vertices.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if (!edges.every((n) => Number.isInteger(n) && n >= 0 && n < vertCount)) return null

  const uf = new VertexUnionFind(vertCount)
  let groups = vertCount
  const edgeCount = edges.length / 2

  if (groups > maxVerts && edgeCount > 0) {
    const distSq = (a: number, b: number) => {
      const dx = vertices[a * 3] - vertices[b * 3]
      const dy = vertices[a * 3 + 1] - vertices[b * 3 + 1]
      const dz = vertices[a * 3 + 2] - vertices[b * 3 + 2]
      return dx * dx + dy * dy + dz * dz
    }
    const order = Array.from({ length: edgeCount }, (_, i) => i)
      .sort((i, j) => distSq(edges[i * 2], edges[i * 2 + 1]) - distSq(edges[j * 2], edges[j * 2 + 1]))
    for (const i of order) {
      if (groups <= maxVerts) break
      const a = edges[i * 2], b = edges[i * 2 + 1]
      if (uf.find(a) !== uf.find(b)) { uf.union(a, b); groups-- }
    }
  }

  // Fallback for a mesh too sparse to reach the target via edge collapse
  // alone (isolated points, or fewer usable edges than the required
  // reduction): cluster the remaining group centroids into a 3D grid whose
  // cell count never exceeds maxVerts (cellsPerAxis chosen so
  // cellsPerAxis^3 <= maxVerts), then merge everything sharing a cell. A
  // single pass is then combinatorially guaranteed to reach the target — and
  // it's O(vertCount), not pairwise-nearest, so it stays fast even for a
  // large, nearly edge-less point cloud (unlike repeatedly scanning for the
  // globally closest pair, which is O(vertCount^2) or worse per merge).
  if (groups > maxVerts) {
    const sums = new Map<number, [number, number, number, number]>()
    for (let v = 0; v < vertCount; v++) {
      const r = uf.find(v)
      const s = sums.get(r) ?? [0, 0, 0, 0]
      s[0] += vertices[v * 3]; s[1] += vertices[v * 3 + 1]; s[2] += vertices[v * 3 + 2]; s[3]++
      sums.set(r, s)
    }
    const pts = [...sums.entries()].map(([r, s]) => ({ r, x: s[0] / s[3], y: s[1] / s[3], z: s[2] / s[3] }))
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); minZ = Math.min(minZ, p.z)
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); maxZ = Math.max(maxZ, p.z)
    }
    const cellsPerAxis = Math.max(1, Math.floor(Math.cbrt(maxVerts)))
    const cellW = Math.max(1e-9, maxX - minX) / cellsPerAxis
    const cellH = Math.max(1e-9, maxY - minY) / cellsPerAxis
    const cellD = Math.max(1e-9, maxZ - minZ) / cellsPerAxis
    const buckets = new Map<string, number[]>()
    for (const p of pts) {
      const cx = Math.min(cellsPerAxis - 1, Math.floor((p.x - minX) / cellW))
      const cy = Math.min(cellsPerAxis - 1, Math.floor((p.y - minY) / cellH))
      const cz = Math.min(cellsPerAxis - 1, Math.floor((p.z - minZ) / cellD))
      const key = `${cx},${cy},${cz}`
      const bucket = buckets.get(key)
      if (bucket) bucket.push(p.r); else buckets.set(key, [p.r])
    }
    for (const bucket of buckets.values()) {
      for (let i = 1; i < bucket.length; i++) {
        if (uf.find(bucket[0]) !== uf.find(bucket[i])) { uf.union(bucket[0], bucket[i]); groups-- }
      }
    }
  }

  // Merge each group into a single vertex at its members' centroid.
  const groupSum = new Map<number, [number, number, number, number]>()
  for (let v = 0; v < vertCount; v++) {
    const r = uf.find(v)
    const s = groupSum.get(r) ?? [0, 0, 0, 0]
    s[0] += vertices[v * 3]; s[1] += vertices[v * 3 + 1]; s[2] += vertices[v * 3 + 2]; s[3]++
    groupSum.set(r, s)
  }
  const rootToIndex = new Map<number, number>()
  const newVertices: number[] = []
  for (const [root, s] of groupSum) {
    rootToIndex.set(root, newVertices.length / 3)
    newVertices.push(s[0] / s[3], s[1] / s[3], s[2] / s[3])
  }

  // Remap edges through the merge, dropping self-loops (both endpoints
  // collapsed into the same group) and duplicates.
  const seen = new Set<string>()
  const mergedEdges: [number, number, number][] = [] // a, b, distSq (for the trim-longest pass below)
  for (let i = 0; i < edgeCount; i++) {
    const a = rootToIndex.get(uf.find(edges[i * 2]))!
    const b = rootToIndex.get(uf.find(edges[i * 2 + 1]))!
    if (a === b) continue
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(key)) continue
    seen.add(key)
    const dx = newVertices[a * 3] - newVertices[b * 3]
    const dy = newVertices[a * 3 + 1] - newVertices[b * 3 + 1]
    const dz = newVertices[a * 3 + 2] - newVertices[b * 3 + 2]
    mergedEdges.push([a, b, dx * dx + dy * dy + dz * dz])
  }

  // If merging still leaves too many edges (a densely triangulated source),
  // keep only the shortest ones — they carry the most local shape detail.
  const trimmed = mergedEdges.length > maxEdges
    ? [...mergedEdges].sort((p, q) => p[2] - q[2]).slice(0, maxEdges)
    : mergedEdges
  const newEdges: number[] = []
  for (const [a, b] of trimmed) newEdges.push(a, b)

  // Already guaranteed valid by construction (capped counts, finite
  // centroids, in-range remapped indices) — no need to re-run asWireframeMesh,
  // which would wrongly check against the module's default caps instead of
  // this call's own maxVerts/maxEdges when they differ.
  return { vertices: newVertices, edges: newEdges }
}

/**
 * Validate raw (uncapped) vertex/edge arrays into a mesh ready to store as a
 * node property — decimating first when the upload is over the live caps, so
 * a too-dense model gets simplified rather than rejected. Returns null for
 * malformed input or one so large that even decimating it isn't worthwhile
 * (see WIREFRAME_DECIMATE_INPUT_MAX_*).
 */
function finalizeUploadedMesh(vertices: number[], edges: number[]): { mesh: WireframeMesh; decimated: boolean } | null {
  if (vertices.length === 0 || vertices.length % 3 !== 0 || edges.length % 2 !== 0) return null
  const vertCount = vertices.length / 3
  const edgeCount = edges.length / 2
  if (vertCount > WIREFRAME_DECIMATE_INPUT_MAX_VERTS || edgeCount > WIREFRAME_DECIMATE_INPUT_MAX_EDGES) return null
  if (vertCount <= WIREFRAME_MAX_VERTS && edgeCount <= WIREFRAME_MAX_EDGES) {
    const mesh = asWireframeMesh({ vertices, edges })
    return mesh ? { mesh, decimated: false } : null
  }
  const mesh = decimateWireframeMesh(vertices, edges)
  return mesh ? { mesh, decimated: true } : null
}

/**
 * Accepts either the flat round-trippable form (`asWireframeMesh`'s own
 * shape) or a hand-authored nested form (`{vertices:[[x,y,z],...],
 * edges:[[i,j],...]}`) — the JSON upload format, same spirit as the Text
 * node's custom-font JSON upload. An oversized model is auto-decimated
 * rather than rejected — see `decimated` on the result.
 */
export function parseWireframeMeshJson(value: unknown): { mesh: WireframeMesh; decimated: boolean } | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (Array.isArray(v.vertices) && v.vertices.every((n) => typeof n === 'number')) {
    // Flat round-trippable form.
    if (!Array.isArray(v.edges)) return null
    return finalizeUploadedMesh(v.vertices as number[], v.edges as number[])
  }
  if (!Array.isArray(v.vertices) || !Array.isArray(v.edges)) return null
  const vertices: number[] = []
  for (const p of v.vertices) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    vertices.push(p[0] as number, p[1] as number, p[2] as number)
  }
  const edges: number[] = []
  for (const e of v.edges) {
    if (!Array.isArray(e) || e.length !== 2 || !e.every((n) => typeof n === 'number' && Number.isInteger(n))) return null
    edges.push(e[0] as number, e[1] as number)
  }
  return finalizeUploadedMesh(vertices, edges)
}

/**
 * A minimal, zero-dependency OBJ text parser: reads `v x y z` vertex lines
 * and derives a deduplicated edge list from `f ...` face lines (and `l ...`
 * polylines, if present). Texture/normal indices on a face token (`1/2/3`)
 * are ignored, and only absolute (positive) indices are supported — enough
 * for the simple primitive models people actually paste in here.
 */
export function parseWireframeObj(text: string): { mesh: WireframeMesh; decimated: boolean } | null {
  const vertices: number[] = []
  const edgeSet = new Set<string>()
  const edges: number[] = []
  const addEdge = (a: number, b: number) => {
    if (a === b || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (edgeSet.has(key)) return
    edgeSet.add(key)
    edges.push(a, b)
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('v ')) {
      const parts = line.slice(2).trim().split(/\s+/).map(Number)
      if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
        vertices.push(parts[0], parts[1], parts[2])
      }
    } else if (line.startsWith('l ')) {
      const idx = line.slice(2).trim().split(/\s+/).map((tok) => parseInt(tok, 10) - 1)
      for (let i = 0; i < idx.length - 1; i++) addEdge(idx[i], idx[i + 1])
    } else if (line.startsWith('f ')) {
      const idx = line.slice(2).trim().split(/\s+/).map((tok) => parseInt(tok.split('/')[0], 10) - 1)
      for (let i = 0; i < idx.length; i++) addEdge(idx[i], idx[(i + 1) % idx.length])
    }
  }
  if (vertices.length === 0 || edges.length === 0) return null
  return finalizeUploadedMesh(vertices, edges)
}

/**
 * Parse an uploaded mesh file by extension (`.json` or `.obj`). An oversized
 * model is auto-decimated down to the live caps rather than rejected — see
 * `decimated` on the result.
 */
export function parseWireframeMeshFile(filename: string, text: string): { mesh: WireframeMesh; decimated: boolean } | null {
  if (/\.obj$/i.test(filename)) return parseWireframeObj(text)
  try {
    return parseWireframeMeshJson(JSON.parse(text))
  } catch {
    return null
  }
}

const PHI = (1 + Math.sqrt(5)) / 2

export const WIREFRAME_PRESETS: Record<Exclude<WireframeModelId, 'custom'>, WireframeMesh> = {
  cube: {
    vertices: [
      -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
      -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    ],
    edges: [
      0, 1, 1, 2, 2, 3, 3, 0,
      4, 5, 5, 6, 6, 7, 7, 4,
      0, 4, 1, 5, 2, 6, 3, 7,
    ],
  },
  pyramid: {
    vertices: [
      -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
      0, 1, 0,
    ],
    edges: [
      0, 1, 1, 2, 2, 3, 3, 0,
      0, 4, 1, 4, 2, 4, 3, 4,
    ],
  },
  octahedron: {
    vertices: [
      1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1,
    ],
    edges: [
      0, 2, 0, 3, 0, 4, 0, 5,
      1, 2, 1, 3, 1, 4, 1, 5,
      2, 4, 2, 5, 3, 4, 3, 5,
    ],
  },
  icosahedron: {
    vertices: [
      -1, PHI, 0, 1, PHI, 0, -1, -PHI, 0, 1, -PHI, 0,
      0, -1, PHI, 0, 1, PHI, 0, -1, -PHI, 0, 1, -PHI,
      PHI, 0, -1, PHI, 0, 1, -PHI, 0, -1, -PHI, 0, 1,
    ],
    edges: [
      0, 11, 5, 11, 0, 5, 1, 5, 0, 1, 1, 7, 0, 7, 7, 10, 0, 10, 10, 11,
      5, 9, 1, 9, 4, 11, 4, 5, 2, 10, 2, 11, 6, 7, 6, 10, 1, 8, 7, 8,
      3, 9, 4, 9, 3, 4, 2, 4, 2, 3, 2, 6, 3, 6, 6, 8, 3, 8, 8, 9,
    ],
  },
}

/** Resolve the mesh to render: the selected preset, or a validated custom upload. */
export function resolveWireframeMesh(model: unknown, customMesh: unknown): WireframeMesh {
  if (model === 'custom') {
    const m = asWireframeMesh(customMesh)
    if (m) return m
  }
  const preset = WIREFRAME_PRESETS[model as Exclude<WireframeModelId, 'custom'>]
  return preset ?? WIREFRAME_PRESETS.cube
}

/** Distance from the origin to the farthest vertex — used to normalise a mesh
 *  of any raw scale onto a unit sphere before projecting. */
export function meshBoundingRadius(mesh: WireframeMesh): number {
  let maxR = 0
  const count = mesh.vertices.length / 3
  for (let i = 0; i < count; i++) {
    const x = mesh.vertices[i * 3], y = mesh.vertices[i * 3 + 1], z = mesh.vertices[i * 3 + 2]
    const r = Math.hypot(x, y, z)
    if (r > maxR) maxR = r
  }
  return maxR || 1
}

export interface ProjectedVertex {
  x: number
  y: number
  /** 0 (farthest from camera) – 1 (nearest), for optional depth shading. */
  depth: number
}

export interface WireframeProjectionParams {
  spinX: number // deg/sec
  spinY: number // deg/sec
  spinZ: number // deg/sec
  t: number // seconds
  scale: number // multiplier on the auto-fit-to-matrix baseline
  W: number
  H: number
  projection: 'orthographic' | 'perspective'
  perspectiveStrength: number // 0–1
}

// Margin so the auto-fit wireframe doesn't touch the matrix edge at scale 1.
// Exported so the C++ generator bakes the identical constant rather than a
// hand-copied literal.
export const WIREFRAME_FIT_MARGIN = 0.85
// Camera distance (in unit-sphere radii) at perspectiveStrength 0 / 1 — a
// mild vs. strong perspective. Must stay > 1 so a near vertex (z=1) never
// reaches the camera plane.
export const WIREFRAME_CAM_FAR = 6
export const WIREFRAME_CAM_NEAR = 1.5

/**
 * Rotate (X→Y→Z, degrees/sec × t) and project every vertex of `mesh` to
 * screen space. Kept in lockstep with the Wireframe3D case in
 * cppGenerator.ts — the C++ generator hand-ports this exact formula.
 */
export function projectWireframeVertices(mesh: WireframeMesh, params: WireframeProjectionParams): ProjectedVertex[] {
  const radius = meshBoundingRadius(mesh)
  const ax = (params.spinX * params.t * Math.PI) / 180
  const ay = (params.spinY * params.t * Math.PI) / 180
  const az = (params.spinZ * params.t * Math.PI) / 180
  const cosX = Math.cos(ax), sinX = Math.sin(ax)
  const cosY = Math.cos(ay), sinY = Math.sin(ay)
  const cosZ = Math.cos(az), sinZ = Math.sin(az)
  const cx = (params.W - 1) / 2
  const cy = (params.H - 1) / 2
  const fit = (Math.min(params.W, params.H) / 2) * WIREFRAME_FIT_MARGIN * Math.max(0.05, params.scale)
  const perspective = params.projection === 'perspective'
  const strength = Math.max(0, Math.min(1, params.perspectiveStrength))
  const camDist = WIREFRAME_CAM_FAR - strength * (WIREFRAME_CAM_FAR - WIREFRAME_CAM_NEAR)
  const count = mesh.vertices.length / 3
  const out: ProjectedVertex[] = new Array(count)
  for (let i = 0; i < count; i++) {
    let x = mesh.vertices[i * 3] / radius
    let y = mesh.vertices[i * 3 + 1] / radius
    let z = mesh.vertices[i * 3 + 2] / radius
    // Rotate X
    let ry = y * cosX - z * sinX, rz = y * sinX + z * cosX
    y = ry; z = rz
    // Rotate Y
    let rx = x * cosY + z * sinY
    rz = -x * sinY + z * cosY
    x = rx; z = rz
    // Rotate Z
    rx = x * cosZ - y * sinZ
    ry = x * sinZ + y * cosZ
    x = rx; y = ry
    const factor = perspective ? camDist / (camDist - z) : 1
    out[i] = { x: cx + x * factor * fit, y: cy - y * factor * fit, depth: (z + 1) / 2 }
  }
  return out
}
