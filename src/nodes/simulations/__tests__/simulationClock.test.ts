import { beforeEach, describe, expect, it } from 'vitest'
import { SIMULATIONS_EVALUATORS } from '../evaluate'
import { PARTICLE_MODES } from '../particleModes'
import { resetEvaluatorState } from '../../../state/evaluator/memory'
import type { EvalContext } from '../../../state/evaluator/types'

/*
 * Particles, String Particles and Formula Points' logistic map and attractor
 * were written a step per frame. They now run on the 60ths of a second each
 * pass spans (shared/passClock.ts): at 60 fps every step is the one it was,
 * and at 30 fps a pass covers two frames' motion, decay and iterations.
 */
type Frame = { r: number; g: number; b: number }[][]

let run = 0
function runner(type: string, W: number, H: number) {
  const key = `clock-${type}-${run++}`
  return (props: Record<string, unknown>, t: number, trigger = false): Frame => {
    const ctx = {
      num: (_id: string, _port: string, p: Record<string, unknown>, k: string, fallback: number) => Number(p[k] ?? fallback),
      pal: () => 'party',
      input: (_id: string, port: string, fallback: unknown) => port === 'trigger' ? trigger : fallback,
      t, W, H, stateKey: () => key,
    } as unknown as EvalContext
    const out = SIMULATIONS_EVALUATORS[type]!(ctx, 'n', props, { id: 'n', data: { nodeType: type, properties: props } } as never, type) as { frame: Frame }
    return out.frame.map((row) => row.map((px) => ({ ...px })))
  }
}

/** FNV-1a over every frame's bytes. */
function hash(frames: Frame[]): string {
  let h = 0x811c9dc5
  for (const frame of frames) for (const row of frame) for (const px of row) for (const v of [px.r, px.g, px.b]) {
    h ^= v & 255; h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16)
}

/** 120 passes at 60 fps, `trigger` per pass. */
function sixty(type: string, props: Record<string, unknown>, W: number, H: number, trigger: (k: number) => boolean = () => false): string {
  const step = runner(type, W, H)
  const frames: Frame[] = []
  for (let k = 0; k < 120; k++) frames.push(step(props, k / 60, trigger(k)))
  return hash(frames)
}

/** Total light and its brightness-weighted centre. */
function light(frame: Frame) {
  let sum = 0, sx = 0, sy = 0
  frame.forEach((row, y) => row.forEach((px, x) => { const v = px.r + px.g + px.b; sum += v; sx += v * x; sy += v * y }))
  return { sum, x: sx / sum, y: sy / sum }
}

beforeEach(() => resetEvaluatorState())

describe('simulations at 60 fps', () => {
  /*
   * Recorded from the per-frame code before the move, 120 passes each: at
   * 60 fps a pass is exactly one frame and every step, chance and decay is
   * the one it replaced, byte for byte.
   */
  const RECORDED: Record<string, string> = {
    fountain: 'd8743ad2', drops: '77718b64', fireworks: 'c194bcdb', sparkle: '1edc1c27', comet: 'ff95e799',
    snow: '6e39bcad', rain: '449da14a', embers: '795f91d6', bubbles: '1032c09e', vortex: '4c5260e9',
    fireflies: '72642dd2', meteor: 'f6b384b0', tornado: '59167202', pinwheel: 'd0aac25', bounce: '205cf3b8',
    chase: '283196a4', waterfall: '14d4988c', luminova: '4aad9db2',
  }

  it.each([...PARTICLE_MODES])('draws Particles %s as it did', (mode) => {
    expect(sixty('Particles', { particleType: mode, rate: 0.6, decay: 0.95, count: 12, seed: 7 }, 16, 16)).toBe(RECORDED[mode])
  })

  it('draws String Particles as it did', () => {
    expect(sixty('StringParticles', { mode: 'drift', spawn: 0.4, count: 12, seed: 3, track: 'row' }, 30, 1)).toBe('64729cd7')
    expect(sixty('StringParticles', { mode: 'meteors', spawn: 0.6, count: 16, seed: 5, track: 'row', bed: 0 }, 30, 1, (k) => k % 20 < 3))
      .toBe('63a5f8e2')
  })

  it('draws Formula Points\' logistic map and attractor as they did', () => {
    expect(sixty('FormulaPoints', { formulaType: 'logisticMap', count: 40, chaos: 3.7 }, 16, 16)).toBe('36f8b1e2')
    expect(sixty('FormulaPoints', { formulaType: 'attractor', count: 80, preset: 'swirl', trail: 0.5 }, 16, 16)).toBe('96bbbea7')
  })

  /*
   * Recorded from the per-pass code before String Particles' deposits, Boids,
   * Fire, Reaction Diffusion and Formula Points' Lissajous and rose dot moved
   * onto the clock, 120 passes each.
   */
  it('draws the rest of String Particles as it did', () => {
    expect([
      sixty('StringParticles', { mode: 'drift', spawn: 0.7, count: 24, seed: 9, track: 'column', trail: 0.8, speed: 0.9 }, 6, 24),
      sixty('StringParticles', { mode: 'drift', spawn: 0.2, count: 8, seed: 2, track: 'ring', ringLeds: 24, trail: 0.3 }, 12, 12),
      sixty('StringParticles', { mode: 'meteors', spawn: 0.9, count: 40, seed: 6, track: 'row', bed: 0.4, trail: 0.7 }, 40, 1, (k) => k % 30 < 2),
    ]).toEqual(['dc7ccae9', 'f281eb41', '72f81b49'])
  })

  it.each([
    ['solid', { colorMode: 'solid', r: 200, g: 90, b: 40 }],
    ['heading', { colorMode: 'heading' }],
    ['density', { colorMode: 'density', count: 40, visualRange: 6 }],
    ['cycle', { colorMode: 'cycle', separation: 1, alignment: 0.2, cohesion: 0.9 }],
  ] as const)('draws Boids %s as it did', (name, props) => {
    const RECORDED: Record<string, string> = { solid: '2ebde1bb', heading: '31ed7c8c', density: '2aceb103', cycle: '93718368' }
    expect(sixty('Boids', { count: 24, seed: 5, speed: 0.6, ...props }, 16, 16)).toBe(RECORDED[name])
  })

  it.each([
    ['classic', { fireStyle: 'classic' }],
    ['smoke', { fireStyle: 'smoke', intensity: 0.4 }],
    ['fire2012', { fireStyle: 'fire2012', cooling: 70, sparking: 150 }],
    ['sideways', { fireStyle: 'classic', direction: 'left', turbulence: 2, mirror: true }],
    ['sideways2012', { fireStyle: 'fire2012', direction: 'down', turbulence: 0, mirror: true }],
  ] as const)('draws Fire %s as it did', (name, props) => {
    const RECORDED: Record<string, string> = { classic: 'a71f63f3', smoke: 'e26d35ec', fire2012: '4a2d2b29', sideways: '4140aee5', sideways2012: '4a3007cb' }
    expect(sixty('Fire', { seed: 7, ...props }, 12, 16)).toBe(RECORDED[name])
  })

  it('draws Reaction Diffusion as it did', () => {
    expect([
      sixty('ReactionDiffusion', { seed: 3 }, 16, 16),
      sixty('ReactionDiffusion', { seed: 8, rdPreset: 'custom', feed: 0.03, kill: 0.057, steps: 13 }, 12, 10),
    ]).toEqual(['b1393dc7', 'e64bb879'])
  })

  it('draws Formula Points\' Lissajous and rose as they did', () => {
    expect([
      sixty('FormulaPoints', { formulaType: 'lissajousPath', speed: 0.7, freqA: 5, freqB: 4, trail: 0.6 }, 16, 16),
      sixty('FormulaPoints', { formulaType: 'rosePath', speed: 0.4, petals: 7, trail: 0.9, dotSize: 1.6 }, 16, 16),
      sixty('FormulaPoints', { formulaType: 'lissajousPath', speed: 1, trail: 0 }, 16, 16),
    ]).toEqual(['6259bc67', '278293f2', '47952979'])
  })
})

describe('simulations at 30 fps keep the pace of 60', () => {
  /** One particle spawned on the first pass (Rate 1, then 0), seen at `seconds` at `fps`. */
  function lone(mode: string, fps: number, seconds: number, extra: Record<string, unknown> = {}): Frame {
    const step = runner('Particles', 32, 32)
    // Spread 0 starts it mid-width, so it cannot leave by a side.
    const props = { particleType: mode, decay: 0.97, seed: 11, spread: 0, ...extra }
    let frame = step({ ...props, rate: 1 }, 0)
    for (let i = 1; i <= fps * seconds; i++) frame = step({ ...props, rate: 0 }, i / fps)
    return frame
  }

  it.each(['drops', 'rain', 'embers', 'vortex', 'pinwheel', 'chase', 'tornado'])(
    'moves a %s particle as far and fades it as much',
    (mode) => {
      const at60 = light(lone(mode, 60, 0.4)), at30 = light(lone(mode, 30, 0.4))
      expect(at60.sum, mode).toBeGreaterThan(0)
      // Its light: the disc's coverage moves with its fraction of a pixel.
      expect(at30.sum / at60.sum, mode).toBeGreaterThan(0.85)
      expect(at30.sum / at60.sum, mode).toBeLessThan(1.15)
      // A step is still first order, so a falling drop lands within a pixel.
      expect(Math.hypot(at30.x - at60.x, at30.y - at60.y), mode).toBeLessThan(0.75)
      // At 30 fps the old per-frame step moved it barely half as far.
      const still = light(lone(mode, 60, 0.2))
      expect(Math.hypot(at60.x - still.x, at60.y - still.y), mode).toBeGreaterThan(0.5)
    },
  )

  it('keeps a fixed population moving at the same speed', () => {
    for (const mode of ['bounce', 'fireflies']) {
      const at = (fps: number) => {
        const step = runner('Particles', 32, 32)
        let frame = step({ particleType: mode, count: 4, seed: 5 }, 0)
        for (let i = 1; i <= fps * 0.5; i++) frame = step({ particleType: mode, count: 4, seed: 5 }, i / fps)
        return light(frame)
      }
      const at60 = at(60), at30 = at(30)
      expect(Math.hypot(at30.x - at60.x, at30.y - at60.y), mode).toBeLessThan(0.25)
    }
  })

  it('lays a comet, meteor or Luminova trail dot for every frame, at its own moment', () => {
    for (const mode of ['comet', 'meteor', 'luminova']) {
      const at = (fps: number) => {
        const step = runner('Particles', 24, 24)
        let frame: Frame = []
        for (let i = 0; i <= fps; i++) frame = step({ particleType: mode, decay: 0.95, count: 3, seed: 2 }, i / fps)
        return frame
      }
      const at60 = at(60).flat(), at30 = at(30).flat()
      // The same dots with the same lives: equal to the byte but for rounding.
      const worst = Math.max(...at60.map((px, i) => Math.max(
        Math.abs(px.r - at30[i].r), Math.abs(px.g - at30[i].g), Math.abs(px.b - at30[i].b))))
      expect(worst, mode).toBeLessThanOrEqual(2)
    }
  })

  it('moves and fades String Particles by the clock', () => {
    // One drift particle, no trail: each frame shows only where it now is.
    const at = (fps: number) => {
      const step = runner('StringParticles', 60, 1)
      const props = { mode: 'drift', count: 1, seed: 4, track: 'row', trail: 0, speed: 0.8 }
      let frame = step({ ...props, spawn: 1 }, 0)
      for (let i = 1; i <= fps * 0.5; i++) frame = step({ ...props, spawn: 0 }, i / fps)
      return light(frame)
    }
    const at60 = at(60), at30 = at(30)
    expect(at60.sum).toBeGreaterThan(0)
    expect(Math.abs(at30.x - at60.x)).toBeLessThan(0.5)
    expect(at30.sum / at60.sum).toBeGreaterThan(0.9)
    expect(at30.sum / at60.sum).toBeLessThan(1.1)
  })

  it('iterates the logistic map as many times a second', () => {
    // Twice the iterations a pass at 30 fps: the map stands where it does at
    // 60 fps, and the same last `count` iterates are drawn.
    const at = (fps: number) => {
      const step = runner('FormulaPoints', 16, 16)
      let frame: Frame = []
      for (let i = 0; i <= fps; i++) frame = step({ formulaType: 'logisticMap', count: 40, chaos: 3.7 }, i / fps)
      return frame
    }
    expect(at(30)).toEqual(at(60))
  })

  it('splats as many attractor iterations a second', () => {
    // With no trail a frame shows only its own pass: twice the dots at 30 fps.
    const dots = (fps: number) => {
      const step = runner('FormulaPoints', 32, 32)
      let frame: Frame = []
      for (let i = 0; i <= fps * 0.25; i++) frame = step({ formulaType: 'attractor', count: 20, trail: 0 }, i / fps)
      return frame.flat().filter((px) => px.r + px.g + px.b > 0).length
    }
    expect(dots(30)).toBeGreaterThan(dots(60) * 1.4)
  })
})
