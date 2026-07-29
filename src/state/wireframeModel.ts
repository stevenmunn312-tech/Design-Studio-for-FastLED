// Geometry shared by the Wireframe3D node's live evaluator and its C++
// generator, so a rotating wireframe model previews and flashes identically.
//
// A mesh is stored as two flat number arrays — `vertices` as x,y,z triples,
// `edges` as vertex-index pairs — mirroring the flat-array convention used by
// image.ts's pixel data. Built-in presets are plain data (like font.ts's
// FONT); an uploaded custom mesh is validated and capped the same way
// image.ts caps an uploaded picture.

/** Largest custom mesh accepted — caps the baked array size and per-frame cost. */
export const WIREFRAME_MAX_VERTS = 64
export const WIREFRAME_MAX_EDGES = 128

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

/**
 * Accepts either the flat round-trippable form (`asWireframeMesh`'s own
 * shape) or a hand-authored nested form (`{vertices:[[x,y,z],...],
 * edges:[[i,j],...]}`) — the JSON upload format, same spirit as the Text
 * node's custom-font JSON upload.
 */
export function parseWireframeMeshJson(value: unknown): WireframeMesh | null {
  const flat = asWireframeMesh(value)
  if (flat) return flat
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
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
  return asWireframeMesh({ vertices, edges })
}

/**
 * A minimal, zero-dependency OBJ text parser: reads `v x y z` vertex lines
 * and derives a deduplicated edge list from `f ...` face lines (and `l ...`
 * polylines, if present). Texture/normal indices on a face token (`1/2/3`)
 * are ignored, and only absolute (positive) indices are supported — enough
 * for the simple primitive models people actually paste in here.
 */
export function parseWireframeObj(text: string): WireframeMesh | null {
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
  return asWireframeMesh({ vertices, edges })
}

/** Parse an uploaded mesh file by extension (`.json` or `.obj`). */
export function parseWireframeMeshFile(filename: string, text: string): WireframeMesh | null {
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
