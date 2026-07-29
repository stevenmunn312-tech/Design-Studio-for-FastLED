import { describe, it, expect } from 'vitest'
import {
  asWireframeMesh,
  meshBoundingRadius,
  parseWireframeMeshJson,
  parseWireframeObj,
  projectWireframeVertices,
  resolveWireframeMesh,
  WIREFRAME_MAX_EDGES,
  WIREFRAME_MAX_VERTS,
  WIREFRAME_PRESETS,
} from '../wireframeModel'

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
      .toEqual({ vertices: [0, 0, 0, 1, 1, 1], edges: [0, 1] })
  })

  it('accepts a hand-authored nested form', () => {
    const parsed = parseWireframeMeshJson({
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      edges: [[0, 1], [1, 2]],
    })
    expect(parsed).toEqual({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], edges: [0, 1, 1, 2] })
  })

  it('rejects malformed nested entries', () => {
    expect(parseWireframeMeshJson({ vertices: [[0, 0]], edges: [] })).toBeNull()
    expect(parseWireframeMeshJson({ vertices: [[0, 0, 0]], edges: [[0, 'x']] })).toBeNull()
    expect(parseWireframeMeshJson(42)).toBeNull()
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
    const mesh = parseWireframeObj(obj)
    expect(mesh).not.toBeNull()
    expect(mesh!.vertices.length / 3).toBe(4)
    // Triangle 1: (0,1)(1,2)(2,0); triangle 2 adds (1,3)(3,0), reusing (0,1) — 5 unique edges.
    expect(mesh!.edges.length / 2).toBe(5)
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
    const mesh = parseWireframeObj(obj)
    expect(mesh).toEqual({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], edges: [0, 1, 1, 2, 2, 0] })
  })

  it('returns null for text with no vertices or no faces/lines', () => {
    expect(parseWireframeObj('# empty file')).toBeNull()
    expect(parseWireframeObj('v 0 0 0\nv 1 0 0')).toBeNull() // vertices but no edges
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
