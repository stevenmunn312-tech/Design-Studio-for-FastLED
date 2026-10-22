import { beforeEach, describe, expect, it } from 'vitest'
import { generateCpp } from '../../../codegen/cppGenerator'
import { evaluateGraph as evaluateGraphImpl, resetEvaluatorState } from '../../../state/graphEvaluator'
import type { Frame } from '../../../state/palettes/ledColor'
import type { StudioEdge, StudioNode } from '../../../state/graphStore'
import { NODE_LIBRARY } from '../../../state/nodeLibrary'
import {
  DANCE_FIGURE_COUNT, DANCE_FIGURES, DANCE_FLASH_BEAT_WAIT_MS, DANCE_FLASH_HOLD_MS, DANCE_ROWS, DANCE_SIZE,
  danceFit, danceFlashAdvance, danceFlashStart, danceLit, danceSource,
} from '../danceFlash'

function node(id: string, nodeType: string, category: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category, properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, source: string, sh: string, target: string, th: string): StudioEdge {
  return { id, source, target, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

function evaluate(nodes: StudioNode[], edges: StudioEdge[], tick: number, width: number, height: number): Frame {
  const frame = evaluateGraphImpl(nodes, edges, tick, width, height)
  expect(frame).not.toBeNull()
  return frame!
}

function onsetTick(seed: number): number {
  return Math.ceil(danceFlashStart(seed).nextAt * 60)
}

beforeEach(() => resetEvaluatorState())

describe('Dance Flash artwork', () => {
  it('keeps four distinct 16×16 silhouettes', () => {
    expect(DANCE_FIGURES).toEqual(['dj', 'man', 'woman', 'couple'])
    expect(DANCE_ROWS).toHaveLength(DANCE_FIGURE_COUNT)
    const masks = DANCE_ROWS.map((rows) => rows.join(','))
    expect(new Set(masks).size).toBe(DANCE_FIGURE_COUNT)
    for (const [index, rows] of DANCE_ROWS.entries()) {
      expect(rows, DANCE_FIGURES[index]).toHaveLength(DANCE_SIZE)
      const lit = rows.reduce((sum, row) => sum + (row.toString(2).match(/1/g)?.length ?? 0), 0)
      expect(lit, DANCE_FIGURES[index]).toBeGreaterThan(40)
      expect(lit, DANCE_FIGURES[index]).toBeLessThan(200)
    }
  })

  it('fits 16×16 into the largest centred square and mirrors left to right', () => {
    expect(danceFit(16, 16)).toEqual({ size: 16, offX: 0, offY: 0 })
    expect(danceFit(26, 17)).toEqual({ size: 17, offX: 4, offY: 0 })
    expect(danceFit(8, 32)).toEqual({ size: 8, offX: 0, offY: 12 })
    expect(danceSource(0, 0, 16, 16, false)).toEqual({ sx: 0, sy: 0 })
    expect(danceSource(15, 15, 16, 16, false)).toEqual({ sx: 15, sy: 15 })
    expect(danceSource(0, 0, 32, 32, false)).toEqual({ sx: 0, sy: 0 })
    expect(danceSource(1, 0, 32, 32, false)).toEqual({ sx: 0, sy: 0 })
    expect(danceSource(31, 31, 32, 32, false)).toEqual({ sx: 15, sy: 15 })
    expect(danceSource(0, 7, 8, 8, false)).toEqual({ sx: 0, sy: 14 })
    expect(danceSource(0, 0, 16, 16, true)).toEqual({ sx: 15, sy: 0 })
    expect(danceSource(15, 0, 16, 16, true)).toEqual({ sx: 0, sy: 0 })
    // A wide panel: the picture occupies the middle square, nothing beside it.
    expect(danceSource(3, 0, 26, 17, false)).toBeNull()
    expect(danceSource(4, 0, 26, 17, false)).toEqual({ sx: 0, sy: 0 })
    expect(danceSource(20, 16, 26, 17, false)).toEqual({ sx: 15, sy: 15 })
    expect(danceSource(21, 0, 26, 17, false)).toBeNull()
    for (let y = 0; y < 17; y++) {
      expect(danceLit(0, 3, y, 26, 17, false)).toBe(false)
      expect(danceLit(0, 21, y, 26, 17, false)).toBe(false)
    }
    expect(danceLit(1, 0, 0, 16, 16, false)).toBe(danceLit(1, 15, 0, 16, 16, true))
  })
})

describe('Dance Flash schedule', () => {
  it('flashes briefly, then stays quiet, and mirrors some poses', () => {
    const figures = new Set<number>()
    const mirrors = new Set<boolean>()
    for (let seed = 1; seed <= 48; seed++) {
      const clock = danceFlashStart(seed)
      expect(clock.nextAt).toBeGreaterThanOrEqual(2.5)
      expect(clock.nextAt).toBeLessThan(6)
      const t = clock.nextAt
      expect(danceFlashAdvance(clock, t - 0.01, false, false)).toBe(false)
      expect(danceFlashAdvance(clock, t, false, false)).toBe(true)
      figures.add(clock.figure)
      mirrors.add(clock.mirror)
      expect(danceFlashAdvance(clock, t + DANCE_FLASH_HOLD_MS / 1000 - 0.001, false, false)).toBe(true)
      expect(danceFlashAdvance(clock, clock.until, false, false)).toBe(false)
      expect(clock.nextAt - clock.until).toBeGreaterThanOrEqual(7)
      expect(clock.nextAt - clock.until).toBeLessThan(16)
    }
    expect(figures).toEqual(new Set([0, 1, 2, 3]))
    expect(mirrors).toEqual(new Set([false, true]))
  })

  it('waits for a wired beat, then flashes if none arrives', () => {
    const clock = danceFlashStart(1)
    const due = clock.nextAt
    expect(danceFlashAdvance(clock, due, false, true)).toBe(false)
    expect(danceFlashAdvance(clock, due + 0.05, true, true)).toBe(true)

    const quiet = danceFlashStart(1)
    expect(danceFlashAdvance(quiet, quiet.nextAt, false, true)).toBe(false)
    const late = quiet.nextAt + DANCE_FLASH_BEAT_WAIT_MS / 1000
    expect(danceFlashAdvance(quiet, late - 0.01, false, true)).toBe(false)
    expect(danceFlashAdvance(quiet, late, false, true)).toBe(true)
  })
})

describe('Dance Flash preview', () => {
  const graph = (seed = 1) => {
    const base = node('base', 'SolidColor', 'pattern', { r: 40, g: 0, b: 0 })
    const dance = node('dance', 'DanceFlash', 'pattern', { seed, r: 255, g: 255, b: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    return {
      nodes: [base, dance, out],
      edges: [
        edge('e1', 'base', 'frame', 'dance', 'frame'),
        edge('e2', 'dance', 'frame', 'out', 'frame'),
      ],
    }
  }

  it('stamps the seeded pose, fitted, and then returns the base', () => {
    const { nodes, edges } = graph(1)
    const tick = onsetTick(1)
    const sim = danceFlashStart(1)
    expect(danceFlashAdvance(sim, tick / 60, false, false)).toBe(true)
    const lit = evaluate(nodes, edges, tick, 32, 32)
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const pixel = lit[y][x]
        if (danceLit(sim.figure, x, y, 32, 32, sim.mirror)) expect(pixel).toEqual({ r: 255, g: 255, b: 255 })
        else expect(pixel).toEqual({ r: 40, g: 0, b: 0 })
      }
    }
    const quiet = evaluate(nodes, edges, tick + 30, 32, 32)
    expect(quiet[0][0]).toEqual({ r: 40, g: 0, b: 0 })
    expect(quiet[16][16]).toEqual({ r: 40, g: 0, b: 0 })
  })

  it('holds a wired beat until it rises', () => {
    const beatOff = node('beat', 'Compare', 'math', { a: 0, b: 0.5 })
    const base = node('base', 'SolidColor', 'pattern', { r: 0, g: 20, b: 0 })
    const dance = node('dance', 'DanceFlash', 'pattern', { seed: 1, r: 0, g: 0, b: 255 })
    const out = node('out', 'MatrixOutput', 'output', {})
    const edges = [
      edge('e1', 'base', 'frame', 'dance', 'frame'),
      edge('e2', 'beat', 'result', 'dance', 'beat'),
      edge('e3', 'dance', 'frame', 'out', 'frame'),
    ]
    const tick = onsetTick(1)
    const held = evaluate([beatOff, base, dance, out], edges, tick, 16, 16)
    expect(held[8][8]).toEqual({ r: 0, g: 20, b: 0 })

    const beatOn = node('beat', 'Compare', 'math', { a: 1, b: 0.5 })
    const flashed = evaluate([beatOn, base, dance, out], edges, tick + 1, 16, 16)
    const blues = flashed.flat().filter((pixel) => pixel.b === 255)
    expect(blues.length).toBeGreaterThan(10)
  })
})

describe('Dance Flash firmware', () => {
  const output = node('out', 'MatrixOutput', 'output', { width: 16, height: 16, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5 })

  it('emits the artwork, the centred square fit, and the seeded schedule', () => {
    const dance = node('dance', 'DanceFlash', 'pattern', { seed: 1, r: 255, g: 255, b: 255 })
    const base = node('base', 'SolidColor', 'pattern', { r: 1, g: 2, b: 3 })
    const cpp = generateCpp([base, dance, output], [
      edge('e1', 'base', 'frame', 'dance', 'frame'),
      edge('e2', 'dance', 'frame', 'out', 'frame'),
    ])
    expect(cpp).toContain(`0x${DANCE_ROWS[0][0].toString(16).padStart(4, '0')}`)
    expect(cpp).toContain('int _dfS=max(1,min(WIDTH,HEIGHT)); int _dfOx=(WIDTH-_dfS)/2,_dfOy=(HEIGHT-_dfS)/2;')
    expect(cpp).toContain('(_fx*16)/_dfS')
    expect(cpp).toContain('[(_fy+_dfOy)*WIDTH+_fx+_dfOx]=_dfCol_dance;')
    expect(cpp).toContain('if(_dfMir_dance) _sx=15-_sx;')
    expect(cpp).toContain('_dfRng_dance=_dfRng_dance*1664525u+1013904223u;')
    expect(cpp).toContain('t+180/1000.0f')
    expect(cpp).toContain('CRGB(255, 255, 255)')
    expect(cpp).not.toContain('random16()%3500')
  })

  it('gates on a wired beat and draws freely when the seed is 0', () => {
    const beat = node('beat', 'ButtonInput', 'input', {})
    const dance = node('dance', 'DanceFlash', 'pattern', { seed: 0 })
    const cpp = generateCpp([beat, dance, output], [
      edge('e1', 'beat', 'pressed', 'dance', 'beat'),
      edge('e2', 'dance', 'frame', 'out', 'frame'),
    ])
    expect(cpp).toContain('_dfRise_dance')
    expect(cpp).toContain('random16()%3500')
    expect(cpp).toContain('4000/1000.0f')
    expect(cpp).not.toContain('_dfRng_dance=_dfRng_dance*1664525u')
  })
})
