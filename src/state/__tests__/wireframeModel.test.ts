import { describe, it, expect } from 'vitest'
import {
  asWireframeMesh,
  decimateWireframeMesh,
  meshBoundingRadius,
  parseWireframeMeshFile,
  parseWireframeMeshJson,
  parseWireframeObj,
  projectWireframeVertices,
  resolveWireframeMesh,
  WIREFRAME_DECIMATE_INPUT_MAX_VERTS,
  WIREFRAME_MAX_EDGES,
  WIREFRAME_MAX_VERTS,
  WIREFRAME_PRESETS,
} from '../wireframeModel'

// A ring of `n` points (each its own component — no shared edges), used to
// exercise the sparse/edge-less decimation fallback.
function ring(n: number): { vertices: number[]; edges: number[] } {
  const vertices: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    vertices.push(Math.cos(a), Math.sin(a), 0)
  }
  return { vertices, edges: [] }
}

// A densely connected "wheel" (every vertex on a ring plus a centre, edges
// connecting the centre to every rim vertex and each rim vertex to its
// neighbours) — enough edges that decimating vertices alone still leaves an
// edge count over a small cap, exercising the edge-trimming pass.
function wheel(n: number): { vertices: number[]; edges: number[] } {
  const vertices: number[] = [0, 0, 0]
  const edges: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    vertices.push(Math.cos(a), Math.sin(a), 0)
    const v = i + 1
    edges.push(0, v)
    if (i > 0) edges.push(v - 1, v)
  }
  edges.push(n, 1) // close the rim
  return { vertices, edges }
}

describe('asWireframeMesh', () => {
  it('accepts a well-formed flat mesh', () => {
    const mesh = asWireframeMesh({ vertices: [0, 0, 0, 1, 0, 0], edges: [0, 1] })
    expect(mesh).toEqual({ vertices: [0, 0, 0, 1, 0, 0], edges: [0, 1] })
  })

  it('rejects non-objects, empty/misaligned vertex arrays, and out-of-range edge indices', () => {
    expect(asWireframeMesh(null)).toBeNull()
    expect(asWireframeMesh('nope')).toBeNull()
    expect(asWireframeMesh({ vertices: [], edges: [] })).toBeNull()
    expect(asWireframeMesh({ vertices: [0, 0], edges: [] })).toBeNull() // not a multiple of 3
    expect(asWireframeMesh({ vertices: [0, 0, 0], edges: [0, 1] })).toBeNull() // vertex 1 doesn't exist
    expect(asWireframeMesh({ vertices: [0, 0, 0, 1, 0, 0], edges: [0] })).toBeNull() // odd edge length
  })

  it('rejects meshes over the vertex/edge caps', () => {
    const tooManyVerts = { vertices: new Array((WIREFRAME_MAX_VERTS + 1) * 3).fill(0), edges: [] }
    expect(asWireframeMesh(tooManyVerts)).toBeNull()
    const verts = new Array(6).fill(0)
    verts[3] = 1
    const tooManyEdges = { vertices: verts, edges: new Array((WIREFRAME_MAX_EDGES + 1) * 2).fill(0) }
    expect(asWireframeMesh(tooManyEdges)).toBeNull()
  })
})

describe('parseWireframeMeshJson', () => {
  it('accepts the flat round-trippable form', () => {
    expect(parseWireframeMeshJson({ vertices: [0, 0, 0, 1, 1, 1], edges: [0, 1] }))
      .toEqual({ mesh: { vertices: [0, 0, 0, 1, 1, 1], edges: [0, 1] }, decimated: false })
  })

  it('accepts a hand-authored nested form', () => {
    const parsed = parseWireframeMeshJson({
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      edges: [[0, 1], [1, 2]],
    })
    expect(parsed).toEqual({ mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], edges: [0, 1, 1, 2] }, decimated: false })
  })

  it('rejects malformed nested entries', () => {
    expect(parseWireframeMeshJson({ vertices: [[0, 0]], edges: [] })).toBeNull()
    expect(parseWireframeMeshJson({ vertices: [[0, 0, 0]], edges: [[0, 'x']] })).toBeNull()
    expect(parseWireframeMeshJson(42)).toBeNull()
  })

  it('auto-decimates a flat-form mesh over the caps instead of rejecting it', () => {
    const big = ring(WIREFRAME_MAX_VERTS * 2)
    const result = parseWireframeMeshJson(big)
    expect(result).not.toBeNull()
    expect(result!.decimated).toBe(true)
    expect(result!.mesh.vertices.length / 3).toBeLessThanOrEqual(WIREFRAME_MAX_VERTS)
  })

  it('rejects a raw upload past the sanity ceiling even for decimation', () => {
    const huge = ring(WIREFRAME_DECIMATE_INPUT_MAX_VERTS + 1)
    expect(parseWireframeMeshJson(huge)).toBeNull()
  })
})

describe('parseWireframeObj', () => {
  it('derives a deduplicated edge list from triangle faces', () => {
    const obj = [
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'v 0 0 1',
      'f 1 2 3',
      'f 1 2 4', // shares edge 1-2 with the first face
    ].join('\n')
    const result = parseWireframeObj(obj)
    expect(result).not.toBeNull()
    expect(result!.decimated).toBe(false)
    expect(result!.mesh.vertices.length / 3).toBe(4)
    // Triangle 1: (0,1)(1,2)(2,0); triangle 2 adds (1,3)(3,0), reusing (0,1) — 5 unique edges.
    expect(result!.mesh.edges.length / 2).toBe(5)
  })

  it('handles texture/normal-suffixed face indices and ignores blank/comment lines', () => {
    const obj = [
      '# a comment',
      '',
      'v 0 0 0',
      'v 1 0 0',
      'v 0 1 0',
      'f 1/1/1 2/2/1 3/3/1',
    ].join('\n')
    const result = parseWireframeObj(obj)
    expect(result).toEqual({ mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], edges: [0, 1, 1, 2, 2, 0] }, decimated: false })
  })

  it('returns null for text with no vertices or no faces/lines', () => {
    expect(parseWireframeObj('# empty file')).toBeNull()
    expect(parseWireframeObj('v 0 0 0\nv 1 0 0')).toBeNull() // vertices but no edges
  })

  it('auto-decimates a dense OBJ model down to the caps', () => {
    const lines: string[] = []
    const n = WIREFRAME_MAX_VERTS * 3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      lines.push(`v ${Math.cos(a)} ${Math.sin(a)} 0`)
    }
    for (let i = 0; i < n; i++) lines.push(`f ${i + 1} ${((i + 1) % n) + 1} ${((i + 2) % n) + 1}`)
    const result = parseWireframeObj(lines.join('\n'))
    expect(result).not.toBeNull()
    expect(result!.decimated).toBe(true)
    expect(result!.mesh.vertices.length / 3).toBeLessThanOrEqual(WIREFRAME_MAX_VERTS)
    expect(result!.mesh.edges.length / 2).toBeLessThanOrEqual(WIREFRAME_MAX_EDGES)
  })
})

describe('parseWireframeMeshFile', () => {
  it('dispatches by extension and surfaces the same decimated/mesh shape', () => {
    const json = JSON.stringify({ vertices: [0, 0, 0, 1, 1, 1], edges: [0, 1] })
    expect(parseWireframeMeshFile('shape.json', json)).toEqual({ mesh: { vertices: [0, 0, 0, 1, 1, 1], edges: [0, 1] }, decimated: false })
    expect(parseWireframeMeshFile('shape.obj', 'v 0 0 0\nv 1 0 0\nf 1 2')).not.toBeNull()
    expect(parseWireframeMeshFile('shape.json', 'not json')).toBeNull()
  })
})

describe('decimateWireframeMesh', () => {
  it('reduces vertex count to the target and produces a valid mesh', () => {
    const { vertices, edges } = wheel(50) // 51 verts, 100 edges
    const result = decimateWireframeMesh(vertices, edges, 10, 40)
    expect(result).not.toBeNull()
    expect(asWireframeMesh({ vertices: result!.vertices, edges: result!.edges })).not.toBeNull()
    expect(result!.vertices.length / 3).toBeLessThanOrEqual(10)
    expect(result!.edges.length / 2).toBeLessThanOrEqual(40)
    // No self-loop or out-of-range edges after remapping.
    const vc = result!.vertices.length / 3
    for (let i = 0; i < result!.edges.length; i += 2) {
      expect(result!.edges[i]).not.toBe(result!.edges[i + 1])
      expect(result!.edges[i]).toBeGreaterThanOrEqual(0)
      expect(result!.edges[i]).toBeLessThan(vc)
      expect(result!.edges[i + 1]).toBeGreaterThanOrEqual(0)
      expect(result!.edges[i + 1]).toBeLessThan(vc)
    }
  })

  it('does not duplicate an edge after two collapsed vertices land on the same pair', () => {
    const { vertices, edges } = wheel(50)
    const result = decimateWireframeMesh(vertices, edges, 10, 40)!
    const seen = new Set<string>()
    for (let i = 0; i < result.edges.length; i += 2) {
      const a = result.edges[i], b = result.edges[i + 1]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('leaves a mesh already within caps untouched', () => {
    const mesh = { vertices: [0, 0, 0, 1, 0, 0], edges: [0, 1] }
    expect(decimateWireframeMesh(mesh.vertices, mesh.edges, 64, 192)).toEqual(mesh)
  })

  it('falls back to spatial clustering for an edge-less point cloud and stays within a fast bound', () => {
    const { vertices, edges } = ring(500)
    const start = performance.now()
    const result = decimateWireframeMesh(vertices, edges, 20, 40)
    const elapsed = performance.now() - start
    expect(result).not.toBeNull()
    expect(result!.vertices.length / 3).toBeLessThanOrEqual(20)
    expect(elapsed).toBeLessThan(1000) // generous — this used to be O(n^2)/O(n^3) and would blow past this
  })

  it('rejects malformed input (misaligned arrays, out-of-range or non-finite values)', () => {
    expect(decimateWireframeMesh([0, 0], [], 10, 10)).toBeNull() // not a multiple of 3
    expect(decimateWireframeMesh([0, 0, 0, 1, 0, 0], [0, 5], 10, 10)).toBeNull() // edge references a nonexistent vertex
    expect(decimateWireframeMesh([0, 0, NaN, 1, 0, 0], [0, 1], 10, 10)).toBeNull()
    expect(decimateWireframeMesh([], [], 10, 10)).toBeNull()
  })
})

describe('resolveWireframeMesh', () => {
  it('resolves a built-in preset by name', () => {
    expect(resolveWireframeMesh('octahedron', undefined)).toBe(WIREFRAME_PRESETS.octahedron)
  })

  it('falls back to cube for an unknown model id', () => {
    expect(resolveWireframeMesh('not-a-model', undefined)).toBe(WIREFRAME_PRESETS.cube)
  })

  it('uses a validated custom mesh, falling back to cube when invalid', () => {
    const custom = { vertices: [0, 0, 0, 2, 0, 0], edges: [0, 1] }
    expect(resolveWireframeMesh('custom', custom)).toEqual(custom)
    expect(resolveWireframeMesh('custom', { bogus: true })).toBe(WIREFRAME_PRESETS.cube)
  })
})

describe('meshBoundingRadius', () => {
  it('finds the farthest vertex from the origin', () => {
    expect(meshBoundingRadius({ vertices: [0, 0, 0, 3, 4, 0], edges: [] })).toBe(5)
  })

  it('never returns 0 (degenerate single-vertex-at-origin mesh)', () => {
    expect(meshBoundingRadius({ vertices: [0, 0, 0], edges: [] })).toBe(1)
  })
})

describe('projectWireframeVertices', () => {
  const baseParams = {
    spinX: 0, spinY: 0, spinZ: 0, t: 0, scale: 1, W: 16, H: 16,
    projection: 'orthographic' as const, perspectiveStrength: 0.4,
  }

  it('centers an unrotated single vertex on the matrix centre', () => {
    const mesh = { vertices: [0, 0, 0], edges: [] }
    const [v] = projectWireframeVertices(mesh, baseParams)
    expect(v.x).toBeCloseTo(7.5, 5)
    expect(v.y).toBeCloseTo(7.5, 5)
  })

  it('rotation about Y moves an off-axis vertex over time', () => {
    const mesh = { vertices: [1, 0, 0], edges: [] }
    const at0 = projectWireframeVertices(mesh, { ...baseParams, spinY: 90, t: 0 })[0]
    const at1 = projectWireframeVertices(mesh, { ...baseParams, spinY: 90, t: 1 })[0]
    expect(at0.x).not.toBeCloseTo(at1.x, 2)
  })

  it('perspective projection makes a near vertex appear larger than a far one', () => {
    const near = { vertices: [1, 0, 1], edges: [] } // toward the camera (+z)
    const far = { vertices: [1, 0, -1], edges: [] } // away from the camera
    const params = { ...baseParams, projection: 'perspective' as const, perspectiveStrength: 1 }
    const pn = projectWireframeVertices(near, params)[0]
    const pf = projectWireframeVertices(far, params)[0]
    const cx = (baseParams.W - 1) / 2
    expect(Math.abs(pn.x - cx)).toBeGreaterThan(Math.abs(pf.x - cx))
    expect(pn.depth).toBeGreaterThan(pf.depth)
  })

  it('scale multiplies the projected spread', () => {
    const mesh = { vertices: [1, 0, 0], edges: [] }
    const small = projectWireframeVertices(mesh, { ...baseParams, scale: 0.5 })[0]
    const large = projectWireframeVertices(mesh, { ...baseParams, scale: 1 })[0]
    const cx = (baseParams.W - 1) / 2
    expect(Math.abs(large.x - cx)).toBeCloseTo(Math.abs(small.x - cx) * 2, 5)
  })
})
