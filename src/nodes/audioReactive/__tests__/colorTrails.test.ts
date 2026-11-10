/*
 * Color Trails' Trail length and linked axes. Trail length is a half-life in
 * seconds that replaced Persistence, a share kept per frame; the two must
 * meet exactly at 60 fps so the bundled patterns keep their look, and the
 * sketch must spend the same fade as the preview.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { AUDIO_REACTIVE_EVALUATORS } from '../evaluate'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import { compileCppSnippet } from '../../../test-utils/cppSnippet'
import { trailFade15 } from '../../shared/integerPatterns'
import { COLOR_TRAILS_TRAIL_LENGTH, colorTrailsHalfLife, colorTrailsKeep, colorTrailsKeepCpp } from '../colorTrails'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import colorTrails from '../../../assets/bundled-patterns/Color Trails.json'
import kaleidoBass from '../../../assets/bundled-patterns/Kaleido Bass Singularity.json'
import auroraEcho from '../../../assets/bundled-patterns/Aurora Echo Choir.json'
import neonRiver from '../../../assets/bundled-patterns/Morphing Neon River.json'
import type { Frame } from '../../../state/palettes/ledColor'

/** The fade the old Persistence slider spent over `dtFrames`, as the node ran it. */
const persistenceFade15 = (persistence: number, dtFrames: number) =>
  trailFade15(Math.pow(Math.max(0, Math.min(0.99999, persistence)), dtFrames))

/** dtFrames from a stalled tab's cap down to a fast 240 Hz loop. */
const DT_FRAMES = Array.from({ length: 396 }, (_, i) => 0.05 + i * 0.01)

/** Each bundled Color Trails: its old Persistence and what its X/Y knobs were. */
const BUNDLED = [
  { name: 'Color Trails', pattern: colorTrails, persistence: 0.99922, x: [0.1, 0.6, 0.33], y: [0.1, 0.52, 0.32] },
  { name: 'Kaleido Bass Singularity', pattern: kaleidoBass, persistence: 0.9988, x: [0.13, 0.88, 0.41], y: [-0.11, 0.82, 0.37] },
  { name: 'Aurora Echo Choir', pattern: auroraEcho, persistence: 0.99935, x: [0.06, 0.78, 0.28], y: [-0.08, 0.9, 0.36] },
  { name: 'Morphing Neon River', pattern: neonRiver, persistence: 0.9991, x: [0.08, 0.94, 0.31], y: [0.14, 0.86, 0.44] },
]

function trailsNode(pattern: unknown): Record<string, unknown> {
  const nodes = (pattern as { subgraph: { nodes: { data: { nodeType: string; properties: Record<string, unknown> } }[] } }).subgraph.nodes
  return nodes.find((n) => n.data.nodeType === 'ColorTrails')!.data.properties
}

/** Frames of one Color Trails node, evaluated on its own at 60 fps. */
function render(props: Record<string, unknown>, frames = 40, W = 12, H = 10): Frame[] {
  const out: Frame[] = []
  for (let i = 0; i < frames; i++) {
    const ctx = {
      t: i / 60, W, H,
      stateKey: (id: string) => `trails:${id}`,
      incoming: new Map(),
      input: () => undefined,
      num: (_id: string, _key: string, p: Record<string, unknown>, prop: string, fallback: number) => Number(p[prop] ?? fallback),
      pal: () => 'rainbow',
    }
    const frame = AUDIO_REACTIVE_EVALUATORS.ColorTrails(ctx as never, 'n', props, {} as never, '').frame as Frame
    out.push(frame.map((row) => row.map((px) => ({ ...px }))))
  }
  return out
}

beforeEach(() => resetEvaluatorState())

describe('Color Trails Trail length', () => {
  it('meets the old Persistence exactly at 60 fps', () => {
    for (const persistence of [0.9, 0.999, 0.9992, 0.9999]) {
      const halfLife = colorTrailsHalfLife(persistence)
      expect(colorTrailsKeep(halfLife, 1)).toBeCloseTo(persistence, 12)
      expect(trailFade15(colorTrailsKeep(halfLife, 1))).toBe(persistenceFade15(persistence, 1))
    }
    // The slider covers the old range.
    expect(COLOR_TRAILS_TRAIL_LENGTH.min).toBeLessThanOrEqual(colorTrailsHalfLife(0.9))
    expect(COLOR_TRAILS_TRAIL_LENGTH.max).toBeGreaterThanOrEqual(colorTrailsHalfLife(0.9999))
    // The default keeps the old default's fade at the 60 fps reference.
    const defaults = NODE_LIBRARY.find((n) => n.type === 'ColorTrails')!.defaultProperties!
    expect(trailFade15(colorTrailsKeep(Number(defaults.trailLength), 1))).toBe(persistenceFade15(0.9992, 1))
  })

  it('keeps nothing at 0 and decays by elapsed time', () => {
    expect(colorTrailsKeep(0, 1)).toBe(0)
    expect(colorTrailsKeep(-3, 1)).toBe(0)
    // Two half-frames keep what one whole frame does.
    expect(colorTrailsKeep(2, 0.5) ** 2).toBeCloseTo(colorTrailsKeep(2, 1), 12)
    // One half-life of 60ths keeps half.
    expect(colorTrailsKeep(2, 120)).toBeCloseTo(0.5, 12)
  })

  it('spends the same fade in the sketch', () => {
    const step = compileCppSnippet([`float _keep=${colorTrailsKeepCpp('_h', '_ctDtf')};`], ['_h', '_ctDtf'], ['_keep'])
    for (const h of [0, 0.1, 9.6213, 14.4, 115.5])
      for (const dt of [0.25, 1, 2.37, 4]) {
        const value = Number(step(0, { _h: h, _ctDtf: dt })._keep)
        expect(value, `${h} s over ${dt}`).toBeCloseTo(colorTrailsKeep(h, dt), 6)
      }
  })

  it('converts every bundled Color Trails to the same fade and its own X and Y', () => {
    for (const { name, pattern, persistence, x, y } of BUNDLED) {
      const props = trailsNode(pattern)
      expect(props, name).not.toHaveProperty('persistence')
      expect(props.independentAxes, name).toBe(true)
      expect([props.xSpeed, props.xStrength, props.xScale], name).toEqual(x)
      expect([props.ySpeed, props.yStrength, props.yScale], name).toEqual(y)
      const halfLife = Number(props.trailLength)
      expect(halfLife, name).toBeCloseTo(colorTrailsHalfLife(persistence), 3)
      for (const dt of DT_FRAMES) {
        expect(trailFade15(colorTrailsKeep(halfLife, dt)), `${name} over ${dt.toFixed(2)} frames`).toBe(persistenceFade15(persistence, dt))
      }
    }
  })
})

describe('Color Trails axes', () => {
  it('drives both axes from the Flow set while linked', () => {
    const linked = render({ flowSpeed: -0.4, flowStrength: 0.7, flowScale: 0.9, trailLength: 3, seed: 7 })
    resetEvaluatorState()
    const apart = render({
      independentAxes: true, trailLength: 3, seed: 7,
      xSpeed: -0.4, xStrength: 0.7, xScale: 0.9, ySpeed: -0.4, yStrength: 0.7, yScale: 0.9,
    })
    expect(JSON.stringify(linked)).toEqual(JSON.stringify(apart))
  })

  it('ignores the X and Y sets while linked, and the Flow set while independent', () => {
    const base = render({ flowSpeed: 0.3, trailLength: 3 })
    resetEvaluatorState()
    const axesSet = render({ flowSpeed: 0.3, trailLength: 3, xSpeed: -1.5, yScale: 3 })
    expect(JSON.stringify(axesSet)).toEqual(JSON.stringify(base))
    resetEvaluatorState()
    const apart = render({ independentAxes: true, ySpeed: -0.2, trailLength: 3 })
    resetEvaluatorState()
    const apartFlowSet = render({ independentAxes: true, ySpeed: -0.2, trailLength: 3, flowSpeed: 1.7, flowScale: 2 })
    expect(JSON.stringify(apartFlowSet)).toEqual(JSON.stringify(apart))
    expect(JSON.stringify(apart)).not.toEqual(JSON.stringify(base))
  })
})
