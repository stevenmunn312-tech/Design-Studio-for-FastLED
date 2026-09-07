import { beforeEach, describe, it, expect } from 'vitest'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { NODE_LIBRARY } from '../nodeLibrary'
import type { StudioNode, StudioEdge } from '../graphStore'
import { TRANSPORT_COLORS, fixedTransportGeometry, transportWaitingGeometry } from '../transportDisplay'
import { getTftPixel, type TftSurface } from '../tftSurface'
import { useTransportDisplayTouchStore } from '../transportDisplayTouchStore'

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

/**
 * Evaluate a panel, optionally with a source plugged into its one content
 * input.
 *
 * `source` is the whole of what decides the screen now, which is why it is a
 * parameter of the harness rather than a property in `displayProps`: a test
 * that sets `tftLayout` without wiring anything is asserting about a panel
 * that draws its waiting screen.
 */
function evaluate(displayProps: Record<string, unknown>, options: {
  source?: string
  nodes?: StudioNode[]
  edges?: StudioEdge[]
} = {}) {
  const tft = node('tft', 'TransportDisplay', { partId: PLAIN, ...displayProps })
  const sourceNodes = options.source ? [node('src', options.source)] : []
  const sourceEdges = options.source ? [edge('feed', 'src', 'display', 'tft', 'display')] : []
  const result = evaluateGraphFull(
    [output, tft, ...sourceNodes, ...(options.nodes ?? [])],
    [...sourceEdges, ...(options.edges ?? [])],
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

describe('what decides the screen', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useTransportDisplayTouchStore.getState().clear()
  })

  // The whole of the model in four assertions: the wire picks the screen, and
  // the property can only choose between the treatments that source offers.
  it('takes its layout from what is plugged in', () => {
    expect(evaluate({}, { source: 'PatternMaster' })?.layout).toBe('Now Playing')
    expect(evaluate({}, { source: 'PatternSlideshow' })?.layout).toBe('Show Status')
  })

  it('lets the property choose between a source\'s own treatments', () => {
    expect(evaluate({ tftLayout: 'Fixed Transport' }, { source: 'PatternMaster' })?.layout)
      .toBe('Fixed Transport')
    expect(evaluate({ tftLayout: 'Now Playing' }, { source: 'PatternMaster' })?.layout)
      .toBe('Now Playing')
  })

  // Switching a panel from a Slideshow to a Music Player leaves the old
  // treatment behind in the property. Falling back to the source's own first
  // treatment is the reading that matches what is actually plugged in.
  it('ignores a treatment belonging to another source', () => {
    expect(evaluate({ tftLayout: 'Show Status' }, { source: 'PatternMaster' })?.layout)
      .toBe('Now Playing')
  })

  it('waits when nothing is plugged in', () => {
    expect(evaluate({})?.layout).toBe('Waiting')
    expect(evaluate({ tftLayout: 'Fixed Transport' })?.layout).toBe('Waiting')
  })

  // There is no colour clock layout yet, so an RTC is not a legal source for
  // this panel. It says so rather than borrowing a screen built for a player.
  it('waits for a source it has no layout for', () => {
    expect(evaluate({}, { source: 'RTCInput' })?.layout).toBe('Waiting')
  })

  // Device lifecycle, not content — so it comes from the property and never
  // asks what is plugged in.
  it('renders the Diagnostics self-test whatever is wired', () => {
    expect(evaluate({ tftLayout: 'Diagnostics' })?.layout).toBe('Diagnostics')
    expect(evaluate({ tftLayout: 'Diagnostics' }, { source: 'PatternMaster' })?.layout)
      .toBe('Diagnostics')
  })

  // A blank panel and a dead panel look identical on a bench, so the waiting
  // screen has to actually put something on the glass.
  it('says it is waiting rather than sitting blank', () => {
    const surface = evaluate({})!.surface!
    const g = transportWaitingGeometry(surface.width, surface.height)
    let lit = 0
    for (let y = g.message.y; y < g.message.y + g.message.h; y++) {
      for (let x = g.message.x; x < g.message.x + g.message.w; x++) {
        if (getTftPixel(surface, x, y) !== TRANSPORT_COLORS.background) lit++
      }
    }
    expect(lit).toBeGreaterThan(0)
  })

  it('is lit by default and dark when disabled', () => {
    expect(evaluate({})?.lit).toBe(true)
    const dark = evaluate({ enabled: false })
    expect(dark?.lit).toBe(false)
    expect(dark?.surface).toBeNull()
  })
})

describe('touch published from the preview', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useTransportDisplayTouchStore.getState().clear()
  })

  it('publishes an inert player-controls bundle without a preview touch', () => {
    const value = evaluate({}) as unknown as { controls: Record<string, unknown> }
    expect(value.controls).toEqual({
      playPause: false, previous: false, next: false,
      volumeDelta: 0, ledToggle: false, brightnessDelta: 0,
      patternSteps: 0, patternConfirm: false,
    })
  })

  it('publishes a fixed transport button once per browser touch', () => {
    const g = fixedTransportGeometry(240, 320)
    useTransportDisplayTouchStore.getState().setTouch('tft', {
      pressed: true,
      x: g.next.rect.x + 1,
      y: g.next.rect.y + 1,
    })

    const props = { partId: TOUCH, tftLayout: 'Fixed Transport' }
    const first = evaluate(props, { source: 'PatternMaster' }) as unknown as { controls: Record<string, unknown> }
    const held = evaluate(props, { source: 'PatternMaster' }) as unknown as { controls: Record<string, unknown> }
    expect(first.controls.next).toBe(true)
    expect(held.controls.next).toBe(false)
  })

  it('publishes an absolute slider while the touch is held', () => {
    const g = fixedTransportGeometry(240, 320)
    useTransportDisplayTouchStore.getState().setTouch('tft', {
      pressed: true,
      x: g.volume.x + Math.floor((g.volume.w - 1) / 2),
      y: g.volume.y + 1,
    })

    const value = evaluate(
      { partId: TOUCH, tftLayout: 'Fixed Transport' },
      { source: 'PatternMaster' },
    ) as unknown as { controls: Record<string, unknown> }
    expect(value.controls.volume).toBeCloseTo(0.5, 1)
  })

  it('chains browser touch through the Player Controls bundle', () => {
    const g = fixedTransportGeometry(240, 320)
    useTransportDisplayTouchStore.getState().setTouch('tft', {
      pressed: true,
      x: g.playPause.rect.x + 1,
      y: g.playPause.rect.y + 1,
    })
    const tft = node('tft', 'TransportDisplay', { partId: TOUCH, tftLayout: 'Fixed Transport' })
    const player = node('src', 'PatternMaster')
    const playerControls = node('pc', 'PlayerControls')
    const result = evaluateGraphFull(
      [output, tft, player, playerControls],
      [
        edge('feed', 'src', 'display', 'tft', 'display'),
        edge('controls', 'tft', 'controls', 'pc', 'controlsIn'),
      ],
      1.5, 8, 8,
    )

    expect((result.outputs.get('pc')?.controls as Record<string, unknown>).playPause).toBe(true)
  })

  // Show Status lost its LED toggle and brightness bar along with the readings
  // behind them; both moved to the custom-display layer, which can wire an LED
  // output's Controls input directly. A panel that reports without commanding
  // is a legitimate state.
  it('publishes nothing from a Show Status panel', () => {
    useTransportDisplayTouchStore.getState().setTouch('tft', { pressed: true, x: 40, y: 40 })
    const value = evaluate(
      { partId: TOUCH },
      { source: 'PatternSlideshow' },
    ) as unknown as { controls: Record<string, unknown> }
    expect(value.controls.ledToggle).toBe(false)
    expect(value.controls.brightness).toBeUndefined()
  })

  it('keeps a non-touch module inert even if stale browser input exists', () => {
    useTransportDisplayTouchStore.getState().setTouch('tft', { pressed: true, x: 1, y: 1 })
    const value = evaluate(
      { partId: PLAIN, tftLayout: 'Fixed Transport' },
      { source: 'PatternMaster' },
    ) as unknown as { controls: Record<string, unknown> }
    expect(value.controls.playPause).toBe(false)
    expect(value.controls.next).toBe(false)
  })
})

describe('what the panel draws from the envelope', () => {
  beforeEach(() => {
    resetEvaluatorState()
    useTransportDisplayTouchStore.getState().clear()
  })

  // The player owns the track and the selection and publishes them together,
  // so a Now Playing panel needs exactly one wire to have something to say.
  it('draws a player screen from one wire', () => {
    const surface = evaluate({}, { source: 'PatternMaster' })!.surface!
    expect(litCount(surface)).toBeGreaterThan(0)
  })

  it('draws a slideshow screen from one wire', () => {
    const surface = evaluate({}, { source: 'PatternSlideshow' })!.surface!
    expect(litCount(surface)).toBeGreaterThan(0)
  })
})
