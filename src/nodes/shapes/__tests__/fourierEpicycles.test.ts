import { describe, expect, it } from 'vitest'
import { evalFourierEpicycles, type FourierEpicyclesParams } from '../evaluate'
import { isPropertyEnabled } from '../../../state/nodeLibrary'
import type { Frame } from '../../../state/palettes/ledColor'

const defaults: FourierEpicyclesParams = {
  outline: 'heart', customPoints: '', maxHarmonics: 32, harmonics: 32, speed: 0.25, scale: 0.8,
  thickness: 1.25, persistence: 0.995, color: { r: 255, g: 220, b: 80 }, showCircles: true, showPen: true,
}

function lit(frame: Frame): number {
  return frame.flat().filter((px) => px.r || px.g || px.b).length
}

function run(id: string, overrides: Partial<FourierEpicyclesParams> = {}, frames = 30, size = 24, base: Frame | null = null) {
  let frame: Frame = []
  for (let i = 0; i < frames; i++) frame = evalFourierEpicycles(id, base, { ...defaults, ...overrides }, i / 60, size, size)
  return frame
}

describe('Fourier Epicycles evaluator', () => {
  it('renders the same frames for the same history', () => {
    expect(JSON.stringify(run('same-a'))).toBe(JSON.stringify(run('same-b')))
  })

  it('keeps drawing a trail behind the pen', () => {
    const early = lit(run('trail-early', {}, 5))
    const later = lit(run('trail-later', {}, 90))
    expect(later).toBeGreaterThan(early)
    // Persistence 0 leaves only the current pen and the circles.
    expect(lit(run('trail-none', { persistence: 0 }, 90))).toBeLessThan(later)
  })

  it('draws a continuous trail at a low frame rate', () => {
    // Four frames a second: the pen moves several pixels between frames, and
    // the splats between them keep the trail one connected line.
    let frame: Frame = []
    for (let i = 0; i < 4; i++) {
      frame = evalFourierEpicycles('slow', null, { ...defaults, showCircles: false, showPen: false, persistence: 1, speed: 0.5 }, i * 0.25, 24, 24)
    }
    const litAt = (x: number, y: number) => x >= 0 && y >= 0 && x < 24 && y < 24 && frame[y][x].r > 0
    const seen = new Set<number>()
    const start = frame.flat().findIndex((px) => px.r > 0)
    const stack = [start]
    while (stack.length) {
      const i = stack.pop()!
      if (seen.has(i)) continue
      seen.add(i)
      const x = i % 24, y = Math.floor(i / 24)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (litAt(x + dx, y + dy)) stack.push((y + dy) * 24 + x + dx)
      }
    }
    expect(seen.size).toBe(lit(frame))
    expect(seen.size).toBeGreaterThan(20)
  })

  it('responds to every wireable control', () => {
    const base = JSON.stringify(run('controls-base'))
    for (const overrides of [
      { harmonics: 2.5 }, { speed: -0.4 }, { scale: 0.5 }, { thickness: 3 }, { persistence: 0.5 },
      { color: { r: 20, g: 90, b: 255 } }, { showCircles: false }, { showPen: false }, { outline: 'star' },
    ] satisfies Partial<FourierEpicyclesParams>[]) {
      expect(JSON.stringify(run(`controls-${Object.keys(overrides)[0]}`, overrides)), Object.keys(overrides)[0]).not.toBe(base)
    }
  })

  it('draws the guide circles dimmer than the pen colour', () => {
    const frame = run('rings', { persistence: 0, showPen: false }, 1)
    const brightest = Math.max(...frame.flat().map((px) => px.r))
    expect(brightest).toBeGreaterThan(0)
    const circlesOnly = run('rings-only', { persistence: 0, showPen: false, thickness: 0.5 }, 1)
    expect(circlesOnly.flat().filter((px) => px.r > 0 && px.r < 100).length).toBeGreaterThan(20)
  })

  it('draws over the base frame without changing untouched pixels', () => {
    const base: Frame = Array.from({ length: 24 }, () => Array.from({ length: 24 }, () => ({ r: 0, g: 0, b: 40 })))
    const frame = run('over-base', { showCircles: false }, 1, 24, base)
    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 40 })
    expect(frame.flat().some((px) => px.r > 0)).toBe(true)
  })

  it('restarts its trail when the canvas size changes', () => {
    expect(run('resize', {}, 20, 16)).toHaveLength(16)
    const resized = evalFourierEpicycles('resize', null, defaults, 0, 20, 20)
    expect(resized).toHaveLength(20)
    expect(JSON.stringify(resized)).toBe(JSON.stringify(run('resize-fresh', {}, 1, 20)))
  })

  it('offers the custom points text only for the custom outline', () => {
    expect(isPropertyEnabled('FourierEpicycles', 'customPoints', { outline: 'custom' })).toBe(true)
    expect(isPropertyEnabled('FourierEpicycles', 'customPoints', { outline: 'heart' })).toBe(false)
  })
})
