import { describe, it, expect } from 'vitest'
import { evaluateGraphFull } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { StudioNode, StudioEdge } from '../graphStore'
import { TRANSPORT_COLORS, nowPlayingGeometry, showStatusGeometry } from '../transportDisplay'
import { getTftPixel, type TftSurface } from '../tftSurface'

const PLAIN = 'st7789-tft-240x240'
const TOUCH = 'st7789v-xpt2046-touch-240x320'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: def?.category ?? 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}

function edge(id: string, s: string, sh: string, t: string, th: string): StudioEdge {
  return { id, source: s, target: t, sourceHandle: sh, targetHandle: th } as unknown as StudioEdge
}

const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4 })

function evaluate(displayProps: Record<string, unknown>, extra: {
  nodes?: StudioNode[]
  edges?: StudioEdge[]
} = {}) {
  const tft = node('tft', 'TransportDisplay', { partId: PLAIN, ...displayProps })
  const result = evaluateGraphFull(
    [output, tft, ...(extra.nodes ?? [])],
    extra.edges ?? [],
    1.5, 8, 8,
  )
  return result.outputs.get('tft') as
    { lit: boolean; layout: string; surface: TftSurface | null } | undefined
}

function litCount(surface: TftSurface): number {
  let n = 0
  for (let y = 0; y < surface.height; y++) {
    for (let x = 0; x < surface.width; x++) {
      if (getTftPixel(surface, x, y) !== TRANSPORT_COLORS.background) n++
    }
  }
  return n
}

describe('the panel the evaluator draws', () => {
  it('renders the selected layout', () => {
    expect(evaluate({ tftLayout: 'Now Playing' })?.layout).toBe('Now Playing')
    expect(evaluate({ tftLayout: 'Show Status' })?.layout).toBe('Show Status')
  })

  it('falls back to Now Playing for a layout it does not have', () => {
    expect(evaluate({ tftLayout: 'Fixed Transport' })?.layout).toBe('Now Playing')
  })

  // Rotation is a fact about how the module was bolted down, not about the
  // part, so a 240x320 panel on its side is a 320x240 surface and the layout
  // has to be told.
  it('sizes the surface for the mounted rotation', () => {
    const upright = evaluate({ partId: TOUCH, tftRotation: '0' })?.surface
    expect([upright?.width, upright?.height]).toEqual([240, 320])
    const sideways = evaluate({ partId: TOUCH, tftRotation: '90' })?.surface
    expect([sideways?.width, sideways?.height]).toEqual([320, 240])
  })

  it('sizes the square panel from its own controller', () => {
    const surface = evaluate({ partId: PLAIN })?.surface
    expect([surface?.width, surface?.height]).toEqual([240, 240])
  })

  // The catalogue is what says which silicon is behind the glass. Resolving
  // ST7789V through a shortest-prefix match would hand it the 240x240
  // descriptor and draw every layout eighty rows short.
  it('resolves each module to its own controller', () => {
    expect(evaluate({ partId: TOUCH })?.surface?.height).toBe(320)
    expect(evaluate({ partId: PLAIN })?.surface?.height).toBe(240)
  })

  it('goes dark and draws nothing when it is switched off', () => {
    const off = evaluate({ enabled: false })
    expect(off?.lit).toBe(false)
    expect(off?.surface).toBeNull()
  })

  it('is lit by default', () => {
    expect(evaluate({})?.lit).toBe(true)
  })
})

describe('what the ports feed', () => {
  it('draws an unwired panel without inventing readings', () => {
    const surface = evaluate({ tftLayout: 'Now Playing' })?.surface
    expect(surface).toBeTruthy()
    expect(litCount(surface!)).toBeGreaterThan(0)
  })

  it('shows a wired title', () => {
    const bare = evaluate({ tftLayout: 'Now Playing' })!.surface!
    const wired = evaluate(
      { tftLayout: 'Now Playing' },
      {
        nodes: [node('text', 'TextValue', { text: 'MIDNIGHT DRIVE' })],
        edges: [edge('e', 'text', 'text', 'tft', 'title')],
      },
    )!.surface!
    const g = nowPlayingGeometry(240, 240)
    const rowPixels = (surface: TftSurface) => {
      let n = 0
      for (let y = g.title.y; y < g.title.y + g.title.h; y++) {
        for (let x = g.title.x; x < g.title.x + g.title.w; x++) {
          if (getTftPixel(surface, x, y) !== TRANSPORT_COLORS.background) n++
        }
      }
      return n
    }
    expect(rowPixels(bare)).toBe(0)
    expect(rowPixels(wired)).toBeGreaterThan(0)
  })

  // A wired progress bar is the case that first exposed the hot-set rule for
  // the OLED: a display outside it crawls at the publish cadence.
  it('follows a wired progress value', () => {
    const g = nowPlayingGeometry(240, 240)
    const filledWidth = (surface: TftSurface) => {
      let n = 0
      const y = g.progress.y + Math.floor(g.progress.h / 2)
      for (let x = g.progress.x + 1; x < g.progress.x + g.progress.w - 1; x++) {
        if (getTftPixel(surface, x, y) === TRANSPORT_COLORS.accent) n++
      }
      return n
    }
    // Driven through the property fallback an unwired-but-configured port
    // uses, so the reading is exact rather than whatever a source node
    // happened to produce at this tick.
    const empty = evaluate({ tftLayout: 'Now Playing', progress: 0 })!.surface!
    const half = evaluate({ tftLayout: 'Now Playing', progress: 0.5 })!.surface!
    const full = evaluate({ tftLayout: 'Now Playing', progress: 1 })!.surface!
    expect(filledWidth(empty)).toBe(0)
    expect(filledWidth(full)).toBe(g.progress.w - 2)
    expect(filledWidth(half)).toBeCloseTo((g.progress.w - 2) / 2, -1)
  })

  // A lone 1/0 on a panel is worse than being told the wire is not carrying a
  // show, so an unwired Show Status says so outright.
  it('says there is no collection when nothing feeds the count', () => {
    const g = showStatusGeometry(240, 240)
    const surface = evaluate({ tftLayout: 'Show Status' })!.surface!
    let lit = 0
    for (let y = g.ordinal.y; y < g.ordinal.y + g.ordinal.h; y++) {
      for (let x = g.ordinal.x; x < g.ordinal.x + g.ordinal.w; x++) {
        if (getTftPixel(surface, x, y) !== TRANSPORT_COLORS.background) lit++
      }
    }
    expect(lit).toBeGreaterThan(0)
  })

  it('colours the output row by what the lights are doing', () => {
    const g = showStatusGeometry(240, 240)
    const seen = (surface: TftSurface) => {
      const colors = new Set<number>()
      for (let y = g.output.y; y < g.output.y + g.output.h; y++) {
        for (let x = g.output.x; x < g.output.x + g.output.w; x++) colors.add(getTftPixel(surface, x, y))
      }
      return colors
    }
    const off = evaluate({ tftLayout: 'Show Status' })!.surface!
    // `Not` with nothing on its input publishes true, which is the cheapest
    // real wire this graph can carry.
    const on = evaluate(
      { tftLayout: 'Show Status' },
      {
        nodes: [node('n', 'Not')],
        edges: [edge('e', 'n', 'result', 'tft', 'outputEnabled')],
      },
    )!.surface!
    expect(seen(off).has(TRANSPORT_COLORS.off)).toBe(true)
    expect(seen(on).has(TRANSPORT_COLORS.on)).toBe(true)
  })
})
