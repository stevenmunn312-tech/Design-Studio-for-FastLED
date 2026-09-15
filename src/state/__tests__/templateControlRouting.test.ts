/*
 * Which template controls have one unambiguous destination, and why the rest
 * are left alone.
 *
 * The failure this guards against is not a missing wire — it is a *wrong* one.
 * Auto-wiring that guesses produces a graph the user did not draw and cannot
 * easily unpick, so nearly every case below is about declining: no source, an
 * occupied input, a control the source has no equivalent for, a latch driving
 * an action that needs a press. Each refusal carries a reason, because a
 * control that silently stays unconnected is indistinguishable from a bug.
 */

import { describe, expect, it } from 'vitest'
import { addDisplayWidget, createDisplayDocument, updateDisplayWidget } from '../displayEditor'
import { applyDisplayTemplate } from '../displayTemplates'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { templateControlPlan, widgetControlRole } from '../templateControlRouting'
import type { DisplayDocument } from '../displayDocument'
import type { StudioEdge, StudioNode } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, label?: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: label ?? nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id: `${s}-${sh}-${t}-${th}`, source: s, sourceHandle: sh, target: t, targetHandle: th }) as StudioEdge

const panel = node('tft', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', displayId: 'screen' })
const touch = node('tft-touch', 'TouchInput', { panelId: 'tft' })
const player = node('player', 'PatternMaster', {}, 'Music Player')
const slideshow = node('show', 'PatternSlideshow', {}, 'Pattern Slideshow')
const fixture = node('out', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 27 }, 'Stage Wash')

/** A document holding just the named template. */
const templated = (id: Parameters<typeof applyDisplayTemplate>[1]): DisplayDocument =>
  applyDisplayTemplate(createDisplayDocument('screen', 320, 240), id)

/** The plan's wires as `role -> node.port`, which is what a reader cares about. */
const routes = (plan: ReturnType<typeof templateControlPlan>) =>
  Object.fromEntries(plan.wires.map((wire) => [wire.role, `${wire.targetId}.${wire.targetPort}`]))

const reasons = (plan: ReturnType<typeof templateControlPlan>) =>
  Object.fromEntries(plan.unrouted.map((entry) => [entry.role, entry.reason]))

describe('template control roles', () => {
  it('stamps a role on the controls and on nothing else', () => {
    const document = templated('now-playing')
    const stamped = document.widgets
      .filter((widget) => widgetControlRole(widget))
      .map((widget) => `${widget.label}:${widgetControlRole(widget)}`)
    expect(stamped).toEqual([
      'Previous:transportPrevious', 'Play:transportPlayPause', 'Next:transportNext',
    ])
    // Text, Timecode and Progress carry readings, not commands.
    expect(document.widgets.filter((widget) => widget.type === 'Text').every((w) => !widgetControlRole(w))).toBe(true)
  })

  /*
   * The role has to outlive the label. A user renaming "Next" to "Skip" is
   * ordinary, and it must not quietly stop the control being recognised — the
   * same reason widget ports are keyed by id rather than by label.
   */
  it('survives renaming the widget', () => {
    const document = templated('now-playing')
    const next = document.widgets.find((widget) => widget.label === 'Next')!
    const renamed = updateDisplayWidget(document, next.id, (widget) => ({ ...widget, label: 'Skip' }))
    const plan = templateControlPlan(panel, renamed, [panel, touch, player], [edge('player', 'display', 'tft', 'display')])
    expect(routes(plan).transportNext).toBe('player.next')
  })
})

describe('resolving a destination from the wired source', () => {
  it('sends transport to a player', () => {
    const plan = templateControlPlan(
      panel, templated('now-playing'), [panel, touch, player],
      [edge('player', 'display', 'tft', 'display')],
    )
    expect(routes(plan)).toEqual({ transportPrevious: 'player.previous', transportNext: 'player.next' })
  })

  /*
   * The one gesture that means two ports. Previous and Next are the same
   * finger action on both, and the graph decides whether it steps a track or a
   * collection — which is why the role is coarser than the port.
   */
  it('sends the same two controls to a slideshow as pattern steps', () => {
    const plan = templateControlPlan(
      panel, templated('pattern-deck'), [panel, touch, slideshow],
      [edge('show', 'display', 'tft', 'display')],
    )
    expect(routes(plan)).toEqual({
      transportPrevious: 'show.patternPrevious',
      transportNext: 'show.patternNext',
      patternConfirm: 'show.patternConfirm',
    })
  })

  it('sends a fixture panel its own brightness and blackout, inverting the blackout', () => {
    const plan = templateControlPlan(
      panel, templated('led-performance'), [panel, touch, fixture],
      [edge('out', 'display', 'tft', 'display')],
    )
    expect(routes(plan)).toEqual({ outputBrightness: 'out.brightness', outputBlackout: 'out.enabled' })
    // True means dark on the control and true means lit on the port, so this
    // one cannot be a plain edge.
    const blackout = plan.wires.find((wire) => wire.role === 'outputBlackout')!
    expect(blackout.adapter).toBe('invert')
    expect(plan.wires.find((wire) => wire.role === 'outputBrightness')!.adapter).toBe('none')
  })

  it('leaves the LED controls alone when the panel is not showing a fixture', () => {
    // Deliberately not resolved from the single LED output sitting in the
    // graph: the destination comes from the wire into this panel, never from
    // what happens to be nearby.
    const plan = templateControlPlan(
      panel, templated('led-performance'), [panel, touch, player, fixture],
      [edge('player', 'display', 'tft', 'display')],
    )
    expect(plan.wires).toEqual([])
    expect(reasons(plan).outputBrightness).toContain('Music Player')
  })
})

describe('declining rather than guessing', () => {
  it('connects nothing when the panel has no source', () => {
    const plan = templateControlPlan(panel, templated('now-playing'), [panel, touch, player], [])
    expect(plan.wires).toEqual([])
    expect(reasons(plan).transportNext).toContain('Nothing is wired to this panel')
  })

  it('connects nothing when the panel has no Touch node', () => {
    const plan = templateControlPlan(
      panel, templated('now-playing'), [panel, player],
      [edge('player', 'display', 'tft', 'display')],
    )
    expect(plan.wires).toEqual([])
    expect(reasons(plan).transportNext).toContain('no Touch node')
  })

  /*
   * A Toggle is a latch and Play / Pause is a press. Wiring them toggles the
   * transport when the switch goes on and does nothing when it goes off, so
   * the switch and the player disagree from the second press onward. No node
   * pulses on both edges, so this is a refusal rather than an adapter.
   */
  it('refuses a latch driving a momentary transport action', () => {
    const plan = templateControlPlan(
      panel, templated('now-playing'), [panel, touch, player],
      [edge('player', 'display', 'tft', 'display')],
    )
    expect(routes(plan).transportPlayPause).toBeUndefined()
    expect(reasons(plan).transportPlayPause).toContain('takes Play / Pause as a press')
  })

  it('refuses a volume slider, which has no direct port to land on', () => {
    const plan = templateControlPlan(
      panel, templated('minimal-transport'), [panel, touch, player],
      [edge('player', 'display', 'tft', 'display')],
    )
    expect(routes(plan).transportVolume).toBeUndefined()
    expect(reasons(plan).transportVolume).toContain('Control Map')
  })

  it('never overwrites an input something else already drives', () => {
    const button = node('btn', 'ButtonInput', { pin: 12 })
    const plan = templateControlPlan(
      panel, templated('now-playing'), [panel, touch, player, button],
      [edge('player', 'display', 'tft', 'display'), edge('btn', 'pressed', 'player', 'next')],
    )
    expect(routes(plan).transportNext).toBeUndefined()
    expect(reasons(plan).transportNext).toContain('already has something wired')
    // The other control is unaffected: one occupied input is not a reason to
    // abandon the rest of the screen.
    expect(routes(plan).transportPrevious).toBe('player.previous')
  })

  /*
   * Repeated use has to be idempotent, which is the same check as the one
   * above seen from the other side: the wire this plan would draw is already
   * there, so there is nothing to do and nothing to report.
   */
  it('plans nothing, and complains about nothing, when its own wires already exist', () => {
    const document = templated('now-playing')
    const nextWidget = document.widgets.find((widget) => widget.label === 'Next')!
    const prevWidget = document.widgets.find((widget) => widget.label === 'Previous')!
    const graphEdges = [
      edge('player', 'display', 'tft', 'display'),
      edge('tft-touch', `widget:${nextWidget.id}:out`, 'player', 'next'),
      edge('tft-touch', `widget:${prevWidget.id}:out`, 'player', 'previous'),
    ]
    const plan = templateControlPlan(panel, document, [panel, touch, player], graphEdges)
    expect(plan.wires).toEqual([])
    expect(plan.unrouted.map((entry) => entry.role)).toEqual(['transportPlayPause'])
  })

  it('ignores a hand-placed control, which has declared no purpose', () => {
    let document = createDisplayDocument('screen', 320, 240)
    document = addDisplayWidget(document, 'Slider')
    const plan = templateControlPlan(
      panel, document, [panel, touch, fixture],
      [edge('out', 'display', 'tft', 'display')],
    )
    expect(plan).toEqual({ wires: [], unrouted: [] })
  })
})
