import { describe, expect, it } from 'vitest'
import { WARP_MOTIONS, warpPush, warpPushCpp } from '../frameWarpMotion'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraph } from '../../../state/graphEvaluator'
import { libraryDefaults } from '../../../state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'

const node = (id: string, nodeType: string, category: string, properties: Record<string, unknown> = {}) => ({
  id, type: 'studioNode', position: { x: 0, y: 0 },
  data: { label: nodeType, nodeType, category, properties, inputs: [], outputs: [] },
}) as unknown as StudioNode
const edge = (id: string, source: string, target: string, sourceHandle: string, targetHandle: string) =>
  ({ id, source, target, sourceHandle, targetHandle }) as unknown as StudioEdge

describe("Frame Warp's built-in motion", () => {
  it('pushes the same way on the board as in the preview', () => {
    for (const motion of WARP_MOTIONS) {
      const run = compileCppSnippet(warpPushCpp(motion, 'ph'), ['_fu', '_fv', 'ph'], ['_pdx', '_pdy'])
      for (const [u, v, ph] of [[0, 0, 0], [0.4, -0.7, 0.3], [-1, 1, 2.75], [0.9, 0.1, -0.4]]) {
        const board = run(0, { _fu: u, _fv: v, ph })
        const [px, py] = warpPush(motion, u, v, ph)
        expect(Number(board._pdx), `${motion} x at ${u},${v},${ph}`).toBeCloseTo(px, 6)
        expect(Number(board._pdy), `${motion} y at ${u},${v},${ph}`).toBeCloseTo(py, 6)
      }
    }
  })

  it('moves a lone Frame Warp by default, and wired fields take over', () => {
    const W = 12, H = 12
    const src = node('src', 'Noise', 'pattern', { ...libraryDefaults('Noise'), speed: 0 })
    const warp = node('warp', 'FrameWarp', 'composite', libraryDefaults('FrameWarp'))
    const out = node('out', 'MatrixOutput', 'output', { width: W, height: H })
    const plain = [edge('e1', 'src', 'warp', 'frame', 'frame'), edge('e2', 'warp', 'out', 'frame', 'frame')]
    const at = (tick: number, nodes: StudioNode[], edges: StudioEdge[]) => JSON.stringify(evaluateGraph(nodes, edges, tick, W, H))
    // Still source, moving warp: the default swirl changes the frame over time.
    expect(at(0, [src, warp, out], plain)).not.toBe(at(90, [src, warp, out], plain))
    // A wired field replaces it: a still field over a still source stays still.
    const dx = node('dx', 'FieldFormula', 'field', { formula: 'x / W' })
    const wired = [...plain, edge('e3', 'dx', 'warp', 'field', 'dx')]
    expect(at(0, [src, dx, warp, out], wired)).toBe(at(90, [src, dx, warp, out], wired))
  })

  it('emits the motion only when no field is wired', () => {
    const src = node('src', 'GradientFrame', 'pattern', {})
    const out = node('out', 'MatrixOutput', 'output', { width: 8, height: 8 })
    const cpp = (properties: Record<string, unknown>, wireField: boolean) => generateCpp(
      [src, node('dx', 'FieldFormula', 'field', { formula: 'x / W' }), node('warp', 'FrameWarp', 'composite', properties), out],
      [edge('e1', 'src', 'warp', 'frame', 'frame'), edge('e2', 'warp', 'out', 'frame', 'frame'),
        ...(wireField ? [edge('e3', 'dx', 'warp', 'field', 'dx')] : [])],
    )
    const swirl = cpp({ motion: 'swirl', motionSpeed: 0.5 }, false)
    expect(swirl).toContain('/* FrameWarp: clamp, bilinear, swirl */')
    expect(swirl).toContain('float _fw_ms=0.5;')
    expect(swirl).toContain('float _sx=_fw_cx+_px*_fw_co+_py*_fw_si+_pdx*_fw_st;')
    expect(cpp({ motion: 'swirl' }, true)).not.toContain('_pdx')
    expect(cpp({ motion: 'none' }, false)).not.toContain('_pdx')
  })
})
