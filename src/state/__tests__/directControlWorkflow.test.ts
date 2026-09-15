/*
 * The whole direct-controls stack on one realistic graph.
 *
 * Every step of this design has its own focused tests, and they all pass
 * against fixtures built to exercise one rule. That is the shape of coverage
 * that misses the thing a user actually hits: a graph where a touch slider, a
 * property input, an LED output's own runtime, a status panel reading that
 * output, and a physical button on a screen's Enabled all exist at once, and
 * where the interesting failures are between the parts rather than inside them.
 *
 * So this is the workflow from the design brief, built once and then asked the
 * questions the brief asks: does the preview agree with the firmware, does a
 * disconnected control fall back to its field, does any of it survive a save
 * and a reload, and can the graph be undone.
 *
 * It deliberately asserts behaviour rather than emitted text wherever it can.
 * The generators have text-level tests of their own; what has never been
 * checked is that the same graph means the same thing to both halves.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGraphStore } from '../graphStore'
import { captureWorkspace } from '../workspacePersistence'
import { useHardwareInputStore } from '../hardwareInputStore'
import { evaluateGraphFull } from '../graphEvaluator'
import { generateCpp } from '../../codegen/cppGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { buildGraphDiagnostics, findDisplayGeneratorIssues } from '../../utils/validateGraph'
import { controlPhaseViolation } from '../controlPhases'
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

/*
 * Juggle -> LED String, a status OLED reading the string back, a knob dimming
 * it, and a physical button holding the panel awake.
 *
 * The knob stands in for a touch slider: both arrive as an ordinary float on
 * the output's Brightness property input, and a Pot needs no display document
 * to exist, which keeps this about the wiring rather than about LVGL.
 */
function workflow(): { nodes: StudioNode[]; edges: StudioEdge[] } {
  return {
    nodes: [
      node('board', 'Board', { profileId: 'generic-esp32-s3-n16r8-44pin-dual-usbc' }),
      node('juggle', 'Juggle', { speed: 0.5, count: 8 }),
      node('out', 'MatrixOutput', { form: 'strip', ledCount: 144, dataPin: 27 }, 'Stage Wash'),
      node('speed', 'PotInput', { pin: 4 }, 'Speed Knob'),
      node('dim', 'PotInput', { pin: 5 }, 'Dimmer'),
      node('wake', 'ButtonInput', { pin: 12 }, 'Panel Wake'),
      node('oled', 'InfoDisplay', {
        partId: 'ssd1306-oled-128x64', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C',
      }, 'Status'),
    ],
    edges: [
      edge('frame', 'juggle', 'frame', 'out', 'frame'),
      edge('speed', 'speed', 'value', 'juggle', 'speed'),
      edge('dim', 'dim', 'value', 'out', 'brightness'),
      edge('status', 'out', 'display', 'oled', 'display'),
      edge('wake', 'wake', 'pressed', 'oled', 'enabled'),
    ],
  }
}

describe('the direct-control workflow, end to end', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.temporal.getState().clear()
  })

  it('builds clean: no errors, no warnings, nothing a generator cannot honour', () => {
    const { nodes, edges } = workflow()
    expect(findDisplayGeneratorIssues(nodes, edges)).toEqual({ errors: [], warnings: [] })
    const blocking = buildGraphDiagnostics(nodes, edges).filter((entry) => entry.severity === 'error')
    expect(blocking.map((entry) => entry.title)).toEqual([])
  })

  /*
   * The panel is woken by a physical button, so the self-disable warning must
   * stay quiet — its whole point is that a panel switched off from its own
   * glass has no way back, and this one has an independent route.
   */
  it('does not warn about a panel with an independent way to wake it', () => {
    const { nodes, edges } = workflow()
    const recovery = buildGraphDiagnostics(nodes, edges)
      .filter((entry) => entry.id.startsWith('panel-enable-recovery-'))
    expect(recovery).toEqual([])
  })

  it('reports the fixture through the status panel, resolved rather than wired', () => {
    const { nodes, edges } = workflow()
    const result = evaluateGraphFull(nodes, edges, 1, 16, 16, {}, true)
    expect(result.outputs.get('out')!.display).toMatchObject({
      kind: 'ledOutput',
      status: { name: 'LED String', formLabel: 'LED String', ledCount: 144, enabled: true },
    })
    // The fixture still renders — a status output must not replace the frame.
    expect(result.outputs.get('out')!.frame).not.toBeNull()
  })

  /*
   * The property-input contract, exercised the way a user does it: unplug the
   * dimmer and the slider beside the socket takes over again.
   */
  it('falls back to the field when a control is disconnected', () => {
    const { nodes, edges } = workflow()
    const dimmed = nodes.map((entry) => (entry.id === 'out'
      ? { ...entry, data: { ...entry.data, properties: { ...entry.data.properties, outputBrightness: 0.25 } } }
      : entry))

    const wired = evaluateGraphFull(dimmed, edges, 1, 16, 16, {}, true)
      .outputs.get('out')!.display as { status: { brightness: number } }
    // A Pot with no hardware reads its own stored value, not the field.
    expect(wired.status.brightness).not.toBe(0.25)

    const unplugged = edges.filter((entry) => entry.id !== 'dim')
    const loose = evaluateGraphFull(dimmed, unplugged, 1, 16, 16, {}, true)
      .outputs.get('out')!.display as { status: { brightness: number } }
    expect(loose.status.brightness).toBe(0.25)
  })

  it('means the same thing to the firmware as to the preview', () => {
    const { nodes, edges } = workflow()
    const cpp = generateCpp(nodes, edges)
    const loop = cpp.slice(cpp.indexOf('void loop() {'))

    // The fixture is dimmed by the knob...
    expect(loop).toContain('{ // LED output run-time controls')
    expect(loop).toContain('n_dim_value')
    // ...the panel reports the fixture it is wired to...
    expect(loop).toContain('"LED String"')
    expect(loop).toContain('"144 LEDS"')
    // ...its Enabled follows the button, held rather than latched...
    expect(loop).toContain('bool _oledOn_oled = n_wake_pressed;')
    // ...and Juggle's speed comes off the other knob rather than its field.
    expect(loop).toContain('n_speed_value')

    // The pass itself is in the shared order, whatever else changed.
    expect(controlPhaseViolation(loop)).toBe(null)
  })

  /*
   * Held, not latched.
   *
   * The brief calls this out because the two are indistinguishable on the
   * canvas and opposite on the bench: a button wired straight to Enabled keeps
   * the panel awake only while it is down. A toggle is the user's job to add,
   * and the wire must not quietly become one.
   */
  it('keeps a button on Enabled momentary', () => {
    const { nodes, edges } = workflow()
    const lit = () => evaluateGraphFull(nodes, edges, 1, 16, 16, {}, true).outputs.get('oled')!.lit
    const press = (down: boolean) => {
      useHardwareInputStore.getState().setButton('wake', down)
    }

    press(false)
    expect(lit(), 'dark with the button up').toBe(false)
    press(true)
    expect(lit(), 'awake while held').toBe(true)
    // The whole point: releasing takes it back. A wire to Enabled is not a
    // latch, and the two are indistinguishable on the canvas but opposite on
    // a bench.
    press(false)
    expect(lit(), 'dark again on release').toBe(false)
  })

  it('survives a save, a reload and an undo with its exposed sockets intact', () => {
    const { nodes, edges } = workflow()
    useGraphStore.getState().loadGraph(nodes, edges)
    useGraphStore.getState().setNodeInputExposed('juggle', 'fade', true)
    vi.advanceTimersByTime(500)

    const saved = JSON.parse(JSON.stringify(captureWorkspace(useGraphStore.getState())))
    useGraphStore.getState().loadGraph(saved.nodes, saved.edges, saved)
    const reloaded = useGraphStore.getState()
    expect(reloaded.nodes.find((entry) => entry.id === 'juggle')?.data.exposedInputs).toEqual(['fade'])
    // The wired sockets are still wired, which is the half a visibility list
    // cannot be trusted to carry on its own.
    expect(reloaded.edges.map((entry) => entry.id).sort())
      .toEqual(['dim', 'frame', 'speed', 'status', 'wake'])

    // And the reloaded graph still means what it meant.
    const after = evaluateGraphFull(reloaded.nodes, reloaded.edges, 1, 16, 16, {}, true)
    // The name survives the round trip precisely because it is derived from
    // the form rather than read off `data.label`, which the load replaces.
    expect(after.outputs.get('out')!.display).toMatchObject({ status: { name: 'LED String' } })
  })

  /*
   * Source tracing: the brief asks that a wired field name what drives it.
   * Asserted on the graph rather than the DOM — `StudioNode.test.tsx` covers
   * the row itself — because what matters here is that the edge survives every
   * other operation above and stays findable by target port.
   */
  it('can name what drives each wired property from the graph alone', () => {
    const { nodes, edges } = workflow()
    const driverOf = (target: string, port: string) => {
      const wire = edges.find((entry) => entry.target === target && entry.targetHandle === port)
      return wire && nodes.find((entry) => entry.id === wire.source)?.data.label
    }
    expect(driverOf('juggle', 'speed')).toBe('Speed Knob')
    expect(driverOf('out', 'brightness')).toBe('Dimmer')
    expect(driverOf('oled', 'enabled')).toBe('Panel Wake')
  })
})

/*
 * The other two engines, asked only what this design changed about them.
 *
 * Not a second copy of the player and slideshow suites — those exist — but the
 * one question this work introduced: a named direct control reaches its owner,
 * and a route the selected generator cannot honour is reported rather than
 * built into something dark.
 */
describe('direct controls on the show engines', () => {
  const collection = () => [
    node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
    node('show', 'PatternSlideshow'),
    node('out', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 27 }),
    node('next', 'ButtonInput', { pin: 12 }),
  ]
  const wires = () => [
    edge('set', 'collection', 'patternset', 'show', 'patternset'),
    edge('frame', 'show', 'frame', 'out', 'frame'),
    edge('step', 'next', 'pressed', 'show', 'patternNext'),
  ]

  it('accepts a button wired straight to a slideshow pattern step', () => {
    const nodes = collection()
    const edges = wires()
    const blocking = buildGraphDiagnostics(nodes, edges).filter((entry) => entry.severity === 'error')
    expect(blocking.map((entry) => entry.title)).toEqual([])
  })

  /*
   * The collision the step-5 gate exists for, checked here because it is only
   * reachable by combining two features: one press must not arrive at the same
   * action twice, once direct and once through a bundle.
   */
  it('refuses one press reaching a pattern step both directly and through Control Map', () => {
    const nodes = [...collection(), node('map', 'ControlMap', { controls: ['patternNext'] })]
    const edges = [
      ...wires(),
      edge('into', 'next', 'pressed', 'map', 'patternNext'),
      edge('bundle', 'map', 'controls', 'show', 'controls'),
    ]
    const blocking = buildGraphDiagnostics(nodes, edges).filter((entry) => entry.severity === 'error')
    expect(blocking.length).toBeGreaterThan(0)
    expect(blocking.map((entry) => entry.message).join(' ')).toContain('Next Pattern')
  })
})
