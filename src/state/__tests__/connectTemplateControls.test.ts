/*
 * Performing the routing plan: edges, the sockets they land on, and the one
 * adapter a conversion needs — all in one undoable step.
 *
 * The plan itself is tested next door; this is about what reaches the store.
 * Three things have to hold or the feature is worse than not having it: the
 * socket a wire lands on must be drawn (an edge into a hidden port is the
 * state `exposedPropertyInputs` exists to prevent), the whole operation must
 * be a single undo, and running it twice must change nothing the second time.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphStore, connectTemplateControls } from '../graphStore'
import { applyDisplayTemplate } from '../displayTemplates'
import { createDisplayDocument } from '../displayEditor'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import type { StudioEdge, StudioNode } from '../graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, label?: string): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: label ?? nodeType, nodeType, category: definition?.category ?? 'output',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, sourceHandle: sh, target: t, targetHandle: th }) as StudioEdge

const panel = () => node('tft', 'TransportDisplay', { partId: 'st7789v-xpt2046-touch-240x320', displayId: 'screen' })
const touch = () => node('tft-touch', 'TouchInput', { panelId: 'tft' })

/** Wires as `target.port <- sourceNodeType`, which is what matters here. */
function routed() {
  const state = useGraphStore.getState()
  const byId = new Map(state.nodes.map((entry) => [entry.id, entry]))
  return state.edges
    .filter((entry) => entry.target !== 'tft')
    .map((entry) => `${entry.target}.${entry.targetHandle} <- ${byId.get(entry.source)?.data.nodeType}`)
    .sort()
}

function setup(source: StudioNode, templateId: Parameters<typeof applyDisplayTemplate>[1]) {
  const document = applyDisplayTemplate(createDisplayDocument('screen', 320, 240), templateId)
  useGraphStore.getState().loadGraph(
    [panel(), touch(), source],
    [edge('src', source.id, 'display', 'tft', 'display')],
  )
  useGraphStore.getState().setDisplayDocument(document)
  return document
}

describe('connectTemplateControls', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.temporal.getState().clear()
  })

  it('wires a player template and draws the sockets it lands on', () => {
    setup(node('player', 'PatternMaster', {}, 'Music Player'), 'now-playing')
    const result = connectTemplateControls('tft')

    expect(result.connected).toBe(2)
    expect(routed()).toEqual([
      'player.next <- TouchInput',
      'player.previous <- TouchInput',
    ])
    // The action inputs are fields until something is wired to them, so the
    // wire has to bring its socket with it.
    const player = useGraphStore.getState().nodes.find((entry) => entry.id === 'player')!
    expect(player.data.exposedInputs).toEqual(expect.arrayContaining(['previous', 'next']))
  })

  it('wires a player volume template control and exposes the hidden property port', () => {
    setup(node('player', 'PatternMaster', {}, 'Music Player'), 'minimal-transport')
    const result = connectTemplateControls('tft')

    expect(result.connected).toBe(3)
    expect(routed()).toEqual([
      'player.next <- TouchInput',
      'player.previous <- TouchInput',
      'player.volume <- TouchInput',
    ])
    const player = useGraphStore.getState().nodes.find((entry) => entry.id === 'player')!
    expect(player.data.exposedInputs).toEqual(expect.arrayContaining(['previous', 'next', 'volume']))
  })

  /*
   * True means dark on the control and true means lit on the port. The
   * conversion is a node on the canvas rather than a reinterpretation inside
   * the wire, so the user can see it, select it and delete it.
   */
  it('places a Not between a Blackout toggle and the fixture it darkens', () => {
    setup(node('out', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 27 }, 'Stage Wash'), 'led-performance')
    const result = connectTemplateControls('tft')

    expect(result.connected).toBe(2)
    const state = useGraphStore.getState()
    const not = state.nodes.find((entry) => entry.data.nodeType === 'Not')
    expect(not, 'a Not adapter was placed').toBeDefined()
    expect(routed()).toEqual([
      `${not!.id}.x <- TouchInput`,
      'out.brightness <- TouchInput',
      'out.enabled <- Not',
    ])
    // Not stacked on the origin: an adapter has to be separately clickable.
    expect(not!.position).not.toEqual({ x: 0, y: 0 })
  })

  it('is one undo, wires and adapter and sockets together', () => {
    setup(node('out', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 27 }), 'led-performance')
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()
    const before = useGraphStore.getState()
    const nodeCount = before.nodes.length
    const edgeCount = before.edges.length

    connectTemplateControls('tft')
    vi.advanceTimersByTime(400)
    expect(useGraphStore.getState().nodes.length).toBe(nodeCount + 1)
    expect(useGraphStore.getState().edges.length).toBe(edgeCount + 3)

    useGraphStore.temporal.getState().undo()
    const after = useGraphStore.getState()
    expect(after.nodes.length).toBe(nodeCount)
    expect(after.edges.length).toBe(edgeCount)
    expect(after.nodes.some((entry) => entry.data.nodeType === 'Not')).toBe(false)
  })

  it('does nothing the second time, and respects a wire the user rerouted', () => {
    setup(node('player', 'PatternMaster'), 'now-playing')
    expect(connectTemplateControls('tft').connected).toBe(2)
    const afterFirst = useGraphStore.getState().edges.length

    const again = connectTemplateControls('tft')
    expect(again.connected).toBe(0)
    expect(useGraphStore.getState().edges.length).toBe(afterFirst)

    // A user reroutes Next to their own button. Running it again must leave
    // that alone rather than restoring the template's own wire over it.
    const state = useGraphStore.getState()
    useGraphStore.setState({
      nodes: [...state.nodes, node('btn', 'ButtonInput', { pin: 12 })],
      edges: [
        ...state.edges.filter((entry) => entry.targetHandle !== 'next'),
        edge('manual', 'btn', 'pressed', 'player', 'next'),
      ],
    })
    const third = connectTemplateControls('tft')
    expect(third.connected).toBe(0)
    expect(third.unrouted.some((entry) => entry.reason.includes('already has something wired'))).toBe(true)
    expect(routed()).toContain('player.next <- ButtonInput')
  })

  it('connects nothing, and says why, when the panel has no source', () => {
    const document = applyDisplayTemplate(createDisplayDocument('screen', 320, 240), 'now-playing')
    useGraphStore.getState().loadGraph([panel(), touch(), node('player', 'PatternMaster')], [])
    useGraphStore.getState().setDisplayDocument(document)

    const result = connectTemplateControls('tft')
    expect(result.connected).toBe(0)
    expect(useGraphStore.getState().edges).toEqual([])
    expect(result.unrouted[0].reason).toContain('Nothing is wired to this panel')
  })

  /*
   * The offer is repeatable for a reason: a panel wired to its player after
   * the screen was drawn has destinations it did not have at placement time.
   */
  it('fills in the connections a later source makes possible', () => {
    const document = applyDisplayTemplate(createDisplayDocument('screen', 320, 240), 'now-playing')
    useGraphStore.getState().loadGraph([panel(), touch(), node('player', 'PatternMaster')], [])
    useGraphStore.getState().setDisplayDocument(document)
    expect(connectTemplateControls('tft').connected).toBe(0)

    const state = useGraphStore.getState()
    useGraphStore.setState({ edges: [...state.edges, edge('src', 'player', 'display', 'tft', 'display')] })
    expect(connectTemplateControls('tft').connected).toBe(2)
  })
})

/*
 * Re-pointing a panel at a different source must not leave its controls
 * driving both.
 *
 * One press is one event. The plan checks the control's own output rather than
 * the destination, because the destination is exactly what just changed — so a
 * button already wired to the old player is not offered to the new slideshow,
 * and the user unplugs it deliberately if that is what they meant.
 */
describe('replacing the panel source', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.temporal.getState().clear()
  })

  it('never retargets wires that already exist, or doubles them onto the new source', () => {
    setup(node('player', 'PatternMaster'), 'now-playing')
    expect(connectTemplateControls('tft').connected).toBe(2)
    const wiredToPlayer = routed()

    // The user re-points the panel at a slideshow.
    const state = useGraphStore.getState()
    useGraphStore.setState({
      nodes: [...state.nodes, node('show', 'PatternSlideshow')],
      edges: [
        ...state.edges.filter((entry) => entry.targetHandle !== 'display'),
        edge('src2', 'show', 'display', 'tft', 'display'),
      ],
    })

    const result = connectTemplateControls('tft')
    expect(result.connected).toBe(0)
    // The old wires are untouched — nothing is silently retargeted.
    expect(routed()).toEqual(wiredToPlayer)
  })
})
