import { describe, it, expect } from 'vitest'
import {
  LED_OUTPUT_RUNTIME_PORTS, LED_OUTPUT_RUNTIME_DEFAULT,
  resolveLedOutputRuntime, isLedOutputPassThrough, applyLedOutputRuntime,
  blankLedOutputLatch, applyLedControls, composeLedOutputRuntime,
} from '../ledOutputRuntime'
import { resetEvaluatorState } from '../graphEvaluator'
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
    expect(errors.join(' ')).toContain('Enabled, Brightness or Controls')
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


/*
 * The bundle: a toggle and a delta, which only mean anything against something
 * that remembers the last press.
 */
describe('latching a control bundle', () => {
  const bundle = (over: Partial<Parameters<typeof applyLedControls>[1]> = {}) => ({
    ledToggle: false, brightnessDelta: 0, ...over,
  })

  it('starts lit and undimmed', () => {
    expect(blankLedOutputLatch()).toEqual({ enabled: true, brightness: 1 })
  })

  it('flips blackout on each press', () => {
    const latch = blankLedOutputLatch()
    applyLedControls(latch, bundle({ ledToggle: true }))
    expect(latch.enabled).toBe(false)
    applyLedControls(latch, bundle({ ledToggle: true }))
    expect(latch.enabled).toBe(true)
  })

  it('ignores a frame with nothing pressed', () => {
    const latch = blankLedOutputLatch()
    applyLedControls(latch, bundle())
    expect(latch).toEqual({ enabled: true, brightness: 1 })
  })

  it('nudges the level by a delta and clamps at both ends', () => {
    const latch = blankLedOutputLatch()
    applyLedControls(latch, bundle({ brightnessDelta: -0.25 }))
    expect(latch.brightness).toBeCloseTo(0.75)
    applyLedControls(latch, bundle({ brightnessDelta: -5 }))
    expect(latch.brightness).toBe(0)
    applyLedControls(latch, bundle({ brightnessDelta: 5 }))
    expect(latch.brightness).toBe(1)
  })

  it('takes an absolute level as it is', () => {
    const latch = blankLedOutputLatch()
    applyLedControls(latch, bundle({ brightness: 0.3 }))
    expect(latch.brightness).toBeCloseTo(0.3)
  })

  // Absolute before relative, matching PatternMaster: a wired knob sets the
  // level and the buttons then nudge it, rather than the knob undoing a press.
  it('applies an absolute before the delta in the same frame', () => {
    const latch = blankLedOutputLatch()
    applyLedControls(latch, bundle({ brightness: 0.5, brightnessDelta: 0.25 }))
    expect(latch.brightness).toBeCloseTo(0.75)
  })

  // An unplugged analog pin reads NaN. A fixture must not go dark for it.
  it('ignores a non-finite reading rather than blacking out', () => {
    const latch = blankLedOutputLatch()
    applyLedControls(latch, bundle({ brightness: NaN, brightnessDelta: NaN }))
    expect(latch.brightness).toBe(1)
  })
})

describe('combining the wires with the latch', () => {
  // ANDed and multiplied rather than one overriding the other, so neither port
  // needs a precedence rule to explain and an unwired one simply vanishes.
  it('is the identity when nothing has been pressed', () => {
    expect(composeLedOutputRuntime({ enabled: true, brightness: 0.5 }, blankLedOutputLatch()))
      .toEqual({ enabled: true, brightness: 0.5 })
  })

  it('multiplies the two levels', () => {
    const composed = composeLedOutputRuntime(
      { enabled: true, brightness: 0.5 }, { enabled: true, brightness: 0.5 },
    )
    expect(composed.brightness).toBeCloseTo(0.25)
  })

  // A blackout button a wired Enabled could veto is not a blackout button.
  it('is dark if either side is dark', () => {
    expect(composeLedOutputRuntime({ enabled: false, brightness: 1 }, { enabled: true, brightness: 1 }).enabled)
      .toBe(false)
    expect(composeLedOutputRuntime({ enabled: true, brightness: 1 }, { enabled: false, brightness: 1 }).enabled)
      .toBe(false)
  })
})

/*
 * End to end in the preview: a contact closes, Player Controls edges it, and
 * the fixture goes dark. The bench case ledOutputRuntime.ts was written for —
 * "a build that has no Music Player anywhere" — with the bundle as the route.
 */
describe('a button reaching the output through Player Controls', () => {
  const controls = node('ctl', 'PlayerControls', {
    debounceMs: 0, brightnessStep: 0.05, repeatDelayMs: 400, repeatIntervalMs: 120,
  })
  const button = node('b', 'ButtonInput', { pin: 4, pullup: true })
  const wires = [
    frameEdge,
    edge('e1', 'b', 'pressed', 'ctl', 'ledToggle'),
    edge('e2', 'ctl', 'controls', 'out', 'controls'),
  ]

  /** One pass at `t`, returning the output's pixels. */
  function pass(nodes: StudioNode[], edges: StudioEdge[], t: number): Frame | null {
    const { outputs } = evaluateGraphFull(nodes, edges, t, 4, 4)
    return (outputs.get('out')?.frame as Frame | null) ?? null
  }

  it('leaves the fixture lit with the contact open', () => {
    resetEvaluatorState()
    // pullup: pressed is digitalRead == LOW, which an unwired preview reads false.
    expect(pass([white, button, controls, output()], wires, 0)?.[0][0])
      .toEqual({ r: 255, g: 255, b: 255 })
  })

  it('carries an absolute level from a knob straight through', () => {
    resetEvaluatorState()
    const knob = node('k', 'PotInput', { pin: 4 })
    const frame = pass(
      [white, knob, controls, output()],
      [frameEdge, edge('e1', 'k', 'value', 'ctl', 'brightness'), edge('e2', 'ctl', 'controls', 'out', 'controls')],
      0,
    )
    // PotInput previews at 0.5, and the latch takes it as the level.
    expect(frame?.[0][0].r).toBeCloseTo(127.5, 1)
  })

  // Two fixtures, one Player Controls: both go dark, and each keeps its own
  // state from there. Node outputs are memoised per pass, so the second output
  // sees the same single press rather than a second one.
  it('gives each output its own latch', () => {
    resetEvaluatorState()
    const second = node('out2', 'MatrixOutput', {
      form: 'matrix', width: 4, height: 4, chipset: 'WS2812B', colorOrder: 'GRB', dataPin: 6,
    })
    const knob = node('k', 'PotInput', { pin: 4 })
    const { outputs } = evaluateGraphFull(
      [white, knob, controls, output(), second],
      [
        frameEdge, edge('e2', 'c', 'frame', 'out2', 'frame'),
        edge('e3', 'k', 'value', 'ctl', 'brightness'),
        edge('e4', 'ctl', 'controls', 'out', 'controls'),
      ],
      0, 4, 4,
    )
    // Only the wired output dims; the other keeps full level.
    expect((outputs.get('out')?.frame as Frame)[0][0].r).toBeCloseTo(127.5, 1)
    expect((outputs.get('out2')?.frame as Frame)[0][0]).toEqual({ r: 255, g: 255, b: 255 })
  })

  // The composition rule, through the graph rather than through the helper.
  it('multiplies a wired Brightness by the latched level', () => {
    resetEvaluatorState()
    const knob = node('k', 'PotInput', { pin: 4 })
    const knob2 = node('k2', 'PotInput', { pin: 5 })
    const frame = pass(
      [white, knob, knob2, controls, output()],
      [
        frameEdge,
        edge('e1', 'k', 'value', 'ctl', 'brightness'),
        edge('e2', 'ctl', 'controls', 'out', 'controls'),
        edge('e3', 'k2', 'value', 'out', 'brightness'),
      ],
      0,
    )
    // 0.5 from the wire times 0.5 from the latch.
    expect(frame?.[0][0].r).toBeCloseTo(63.75, 1)
  })
})

describe('the emitted sketch, for a bundle', () => {
  const controls = node('ctl', 'PlayerControls', {})
  const button = node('b', 'ButtonInput', { pin: 12, pullup: true })
  const wires = [
    frameEdge,
    edge('e1', 'b', 'pressed', 'ctl', 'ledToggle'),
    edge('e2', 'ctl', 'controls', 'out', 'controls'),
  ]

  it('emits the bundle, its debounce, and the output latch', () => {
    const src = generateCpp([white, button, controls, output()], wires)
    expect(src).toContain('struct PlayerControlsValue')
    expect(src).toContain('struct CtlEdge')
    expect(src).toContain('static bool _ledOn_out = true; static float _ledLevel_out = 1.0f;')
    expect(src).toContain('static CtlEdge _pcE_ctl_ledToggle;')
    expect(src).toContain('if (n_ctl_controls.ledToggle) _ledOn_out = !_ledOn_out;')
  })

  // The firmware mirror of composeLedOutputRuntime: the latch is a factor, not
  // an override, so the wired expression is still in there beside it.
  it('reads the latch through the same runtime block the wires use', () => {
    const src = generateCpp([white, button, controls, output()], wires)
    expect(src).toContain('if (!(_ledOn_out))')
    expect(src).toContain('constrain(_ledLevel_out, 0.0f, 1.0f)')
  })

  it('multiplies a wired Brightness by the latched level', () => {
    const knob = node('k', 'PotInput', { pin: 34 })
    const src = generateCpp(
      [white, button, knob, controls, output()],
      [...wires, edge('e3', 'k', 'value', 'out', 'brightness')],
    )
    expect(src).toContain('* _ledLevel_out')
  })

  // An output nobody has wired a bundle to generates the sketch it always did.
  it('emits none of it for an output with no Controls wire', () => {
    const src = generateCpp([white, output()], [frameEdge])
    expect(src).not.toContain('PlayerControlsValue')
    expect(src).not.toContain('_ledOn_out')
    expect(src).not.toContain('CtlEdge')
  })

  // Repeat where the evaluator repeats: an adjustment ramps while held, an
  // action fires once per press. Backwards, a blackout button strobes.
  it('repeats an adjustment button and not an action', () => {
    const up = node('u', 'ButtonInput', { pin: 13, pullup: true })
    const src = generateCpp(
      [white, button, up, controls, output()],
      [...wires, edge('e3', 'u', 'pressed', 'ctl', 'brightnessUp')],
    )
    expect(src).toMatch(/_pcE_ctl_ledToggle\.update\([^)]*, false,/)
    expect(src).toMatch(/_pcE_ctl_brightnessUp\.update\([^)]*, true,/)
  })
})
