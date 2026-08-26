import { describe, it, expect } from 'vitest'
import {
  LED_OUTPUT_RUNTIME_PORTS, LED_OUTPUT_RUNTIME_DEFAULT,
  resolveLedOutputRuntime, isLedOutputPassThrough, applyLedOutputRuntime,
} from '../ledOutputRuntime'
import { NODE_LIBRARY } from '../nodeLibrary'
import { evaluateGraphFull } from '../graphEvaluator'
import { findOutputRuntimeIssues, selectedGenerator } from '../../utils/validateGraph'
import { generateCpp } from '../../codegen/cppGenerator'
import type { Frame } from '../ledColor'
import type { StudioNode, StudioEdge } from '../graphStore'

function node(id: string, nodeType: string, props: Record<string, unknown> = {}): StudioNode {
  const def = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: 'output', properties: props,
      inputs: def?.inputs ?? [], outputs: def?.outputs ?? [],
    },
  } as unknown as StudioNode
}
const edge = (id: string, s: string, sh: string, t: string, th: string): StudioEdge =>
  ({ id, source: s, target: t, sourceHandle: sh, targetHandle: th }) as unknown as StudioEdge

const output = (props: Record<string, unknown> = {}) => node('out', 'MatrixOutput', {
  form: 'matrix', width: 4, height: 4, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 5, ...props,
})
const white = node('c', 'SolidColor', { r: 255, g: 255, b: 255 })

const frameEdge = edge('ef', 'c', 'frame', 'out', 'frame')

/** The output's own pixels after a pass, at the composition size. */
function renderedFrame(nodes: StudioNode[], edges: StudioEdge[]): Frame | null {
  const { outputs } = evaluateGraphFull(nodes, edges, 0, 4, 4)
  return (outputs.get('out')?.frame as Frame | null) ?? null
}

describe('resolving the two wires', () => {
  // Adding a port to an output every existing project already has must not
  // turn those projects black.
  it('reads unwired as lit and undimmed', () => {
    expect(resolveLedOutputRuntime(undefined, undefined)).toEqual(LED_OUTPUT_RUNTIME_DEFAULT)
    expect(LED_OUTPUT_RUNTIME_DEFAULT).toEqual({ enabled: true, brightness: 1 })
  })

  it('takes a false as a blackout and anything else as lit', () => {
    expect(resolveLedOutputRuntime(false, 1).enabled).toBe(false)
    expect(resolveLedOutputRuntime(true, 1).enabled).toBe(true)
  })

  it('clamps the knob to its travel', () => {
    expect(resolveLedOutputRuntime(true, -3).brightness).toBe(0)
    expect(resolveLedOutputRuntime(true, 4).brightness).toBe(1)
    expect(resolveLedOutputRuntime(true, 0.25).brightness).toBe(0.25)
  })

  // An analog pin with nothing on it reads NaN. Full rather than zero, because
  // a fixture going dark on a loose wire looks like a blown supply.
  it('reads a nonsense level as full, not as off', () => {
    expect(resolveLedOutputRuntime(true, NaN).brightness).toBe(1)
    expect(resolveLedOutputRuntime(true, 'bright').brightness).toBe(1)
  })

  it('knows when there is nothing to do', () => {
    expect(isLedOutputPassThrough({ enabled: true, brightness: 1 })).toBe(true)
    expect(isLedOutputPassThrough({ enabled: false, brightness: 1 })).toBe(false)
    expect(isLedOutputPassThrough({ enabled: true, brightness: 0.5 })).toBe(false)
  })

  it('names the ports the node carries', () => {
    const def = NODE_LIBRARY.find((entry) => entry.type === 'MatrixOutput')
    for (const port of LED_OUTPUT_RUNTIME_PORTS) {
      expect(def?.inputs?.some((input) => input.id === port.id), port.id).toBe(true)
    }
  })
})

describe('applying it to a frame', () => {
  const frame = (): Frame => [[{ r: 200, g: 100, b: 50 }]]

  it('hands back the same frame when nothing is wired', () => {
    const f = frame()
    expect(applyLedOutputRuntime(f, { enabled: true, brightness: 1 })).toBe(f)
  })

  // The frame is the upstream node's pooled buffer, shared with a second output
  // and with every node preview. Dimming in place would dim those too.
  it('copies rather than dimming in place', () => {
    const f = frame()
    const dimmed = applyLedOutputRuntime(f, { enabled: true, brightness: 0.5 })
    expect(dimmed).not.toBe(f)
    expect(f[0][0]).toEqual({ r: 200, g: 100, b: 50 })
    expect(dimmed[0][0]).toEqual({ r: 100, g: 50, b: 25 })
  })

  it('blacks out whatever the level says', () => {
    const dimmed = applyLedOutputRuntime(frame(), { enabled: false, brightness: 1 })
    expect(dimmed[0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('the preview reads the same wires', () => {
  // Applied in the evaluator rather than at the preview so the main matrix,
  // every per-output preview, an offline recording and the live stream cannot
  // disagree about how bright the fixture is.
  it('leaves an untouched output alone', () => {
    const frame = renderedFrame([white, output()], [frameEdge])
    expect(frame?.[0][0]).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('dims from a wired level', () => {
    const level = node('k', 'PotInput', { pin: 4 })
    const frame = renderedFrame(
      [white, level, output()],
      [frameEdge, edge('eb', 'k', 'value', 'out', 'brightness')],
    )
    expect(frame?.[0][0].r).toBeCloseTo(127.5, 1)
  })

  it('blacks out from a wired false', () => {
    const off = node('b', 'ButtonInput', { pin: 4, pullup: true })
    const frame = renderedFrame(
      [white, off, output()],
      [frameEdge, edge('ee', 'b', 'pressed', 'out', 'enabled')],
    )
    expect(frame?.[0][0]).toEqual({ r: 0, g: 0, b: 0 })
  })

  // Two fixtures are two fixtures: a stage wash and a monitor strip do not have
  // to be dark together, which is the whole reason these are per output.
  it('dims one output without touching the other', () => {
    const second = node('out2', 'MatrixOutput', {
      form: 'matrix', width: 4, height: 4, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 6,
    })
    const off = node('b', 'ButtonInput', { pin: 4, pullup: true })
    const { outputs } = evaluateGraphFull(
      [white, off, output(), second],
      [frameEdge, edge('e2', 'c', 'frame', 'out2', 'frame'), edge('ee', 'b', 'pressed', 'out', 'enabled')],
      0, 4, 4,
    )
    expect((outputs.get('out')?.frame as Frame)[0][0]).toEqual({ r: 0, g: 0, b: 0 })
    expect((outputs.get('out2')?.frame as Frame)[0][0]).toEqual({ r: 255, g: 255, b: 255 })
  })
})

describe('the emitted sketch', () => {
  // An output nobody has touched must generate the sketch it always did.
  it('emits nothing for an output with neither wire', () => {
    const src = generateCpp([white, output()], [frameEdge])
    expect(src).not.toContain('_outLevel_out')
    expect(src).not.toContain('LED output run-time controls')
  })

  it('blacks the strip out on a wired enable', () => {
    const off = node('b', 'ButtonInput', { pin: 4 })
    const src = generateCpp([white, off, output()], [frameEdge, edge('ee', 'b', 'pressed', 'out', 'enabled')])
    expect(src).toContain('fill_solid(leds,')
    expect(src).toMatch(/if \(!\(.+\)\) fill_solid\(leds, NUM_LEDS, CRGB::Black\);/)
  })

  /*
   * `nscale8_video`, not `nscale8`: plain scaling drops a dim colour to black
   * well before the bottom of the knob's travel, which reads as a broken
   * potentiometer rather than a dimmer.
   */
  it('dims with the video scale, so a lit pixel stays lit', () => {
    const pot = node('p', 'PotInput', { pin: 34 })
    const src = generateCpp([white, pot, output()], [frameEdge, edge('eb', 'p', 'value', 'out', 'brightness')])
    expect(src).toContain('nscale8_video(_outLevel_out)')
    expect(src).toContain('constrain(')
  })

  // Every geometry branch has converged on the physical array by then, so one
  // emission covers ring maps, crops, downscales and plain copies alike.
  it('applies the controls after the blit and before the show', () => {
    const pot = node('p', 'PotInput', { pin: 34 })
    const src = generateCpp([white, pot, output()], [frameEdge, edge('eb', 'p', 'value', 'out', 'brightness')])
    expect(src.indexOf('_outLevel_out')).toBeLessThan(src.lastIndexOf('FastLED.show();'))
  })

  it('reaches for the panel\'s own register on HUB75', () => {
    const panel = output({ chipset: 'HUB75', form: 'hub75' })
    const pot = node('p', 'PotInput', { pin: 34 })
    const src = generateCpp([white, pot, panel], [frameEdge, edge('eb', 'p', 'value', 'out', 'brightness')])
    expect(src).toContain('dma_display->setBrightness8(_outLevel_out)')
  })
})

describe('what a show or player build cannot honour', () => {
  const master = node('master', 'PatternMaster')
  const collection = node('coll', 'PatternCollection', { patternIds: ['a'] })
  const showGraph = () => ({
    nodes: [master, collection, output(), node('b', 'ButtonInput', { pin: 4 })],
    edges: [
      edge('e1', 'coll', 'patternset', 'master', 'patternset'),
      edge('e2', 'master', 'frame', 'out', 'frame'),
      edge('ee', 'b', 'pressed', 'out', 'enabled'),
    ],
  })

  it('reads the graph the way the upload path does', () => {
    const { nodes, edges } = showGraph()
    expect(selectedGenerator(nodes, edges)).toBe('show')
    expect(selectedGenerator([white, output()], [frameEdge])).toBe('sketch')
  })

  // Flashing firmware that ignores a physical blackout button is the same
  // failure as leaving a display dark: the user's next move is the wiring.
  it('refuses a show that would drop the wire', () => {
    const { nodes, edges } = showGraph()
    const { errors } = findOutputRuntimeIssues(nodes, edges)
    expect(errors.join(' ')).toContain('show controller')
    expect(errors.join(' ')).toContain('Enabled or Brightness')
  })

  // The player has a real route for this, so the message names it rather than
  // just saying no.
  it('points a player build at Player Controls', () => {
    const { nodes, edges } = showGraph()
    const player = [...nodes, node('sd', 'SDCard'), node('amp', 'Amplifier')]
    const { errors } = findOutputRuntimeIssues(player, edges)
    expect(selectedGenerator(player, edges)).toBe('player')
    expect(errors.join(' ')).toContain('Player Controls')
  })

  it('says nothing about a show whose outputs carry no such wire', () => {
    const { nodes, edges } = showGraph()
    expect(findOutputRuntimeIssues(nodes, edges.filter((e) => e.id !== 'ee')).errors).toEqual([])
  })

  it('says nothing about a normal sketch, which emits them', () => {
    const pot = node('p', 'PotInput', { pin: 34 })
    expect(findOutputRuntimeIssues(
      [white, pot, output()],
      [frameEdge, edge('eb', 'p', 'value', 'out', 'brightness')],
    ).errors).toEqual([])
  })
})
