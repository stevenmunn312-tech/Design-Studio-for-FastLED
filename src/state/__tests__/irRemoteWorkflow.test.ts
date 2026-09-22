/*
 * The first-release IR workflow as one graph, rather than another set of
 * component tests: Power toggles the fixture and held brightness keys drive a
 * bounded Step Value into the output's exposed Brightness property. The
 * focused IR, Trigger, Step Value, persistence, and generator suites still own
 * their individual rules; this file proves the joins between them.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateCpp } from '../../codegen/cppGenerator'
import { generateShowSketch } from '../../codegen/showGenerator'
import { buildShowPlayer } from '../../utils/showUpload'
import { evaluateGraphFull, resetEvaluatorState } from '../graphEvaluator'
import { useGraphStore, type StudioEdge, type StudioNode } from '../graphStore'
import { useHardwareInputStore } from '../hardwareInputStore'
import { NODE_LIBRARY, libraryDefaults } from '../nodeLibrary'
import { captureWorkspace } from '../workspacePersistence'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: {
      label: nodeType,
      nodeType,
      category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [],
      outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const buttons = [
  { id: 'power', label: 'Power', protocol: 'NEC', address: 0, command: 69, repeat: 'once' },
  { id: 'up', label: 'Brightness Up', protocol: 'NEC', address: 0, command: 70, repeat: 'held' },
  { id: 'down', label: 'Brightness Down', protocol: 'NEC', address: 0, command: 71, repeat: 'held' },
  { id: 'reset', label: 'Brightness Reset', protocol: 'NEC', address: 0, command: 72, repeat: 'once' },
]

function controls(): StudioNode[] {
  return [
    node('ir', 'IRRemoteInput', { pin: 12, buttons }),
    node('power-toggle', 'Trigger', { triggerOp: 'toggle', initialState: false }),
    node('brightness', 'StepValue', { initial: 0.5, minimum: 0, maximum: 1, step: 0.25, wrap: false }),
  ]
}

function controlEdges(): StudioEdge[] {
  return [
    edge('power-key', 'ir', 'button-power', 'power-toggle', 'trigger'),
    edge('power-enabled', 'power-toggle', 'out', 'out', 'enabled'),
    edge('brightness-up', 'ir', 'button-up', 'brightness', 'increase'),
    edge('brightness-down', 'ir', 'button-down', 'brightness', 'decrease'),
    edge('brightness-reset', 'ir', 'button-reset', 'brightness', 'reset'),
    edge('brightness-value', 'brightness', 'value', 'out', 'brightness'),
  ]
}

function normalWorkflow(): { nodes: StudioNode[]; edges: StudioEdge[] } {
  const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  output.data.exposedInputs = ['brightness', 'enabled']
  return {
    nodes: [...controls(), node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }), output],
    edges: [edge('frame', 'fill', 'frame', 'out', 'frame'), ...controlEdges()],
  }
}

function keyDown(id: string, down: boolean) {
  useHardwareInputStore.getState().setButton(`ir:${id}`, down)
}

function outputStatus(nodes: StudioNode[], edges: StudioEdge[], tick: number) {
  return (evaluateGraphFull(nodes, edges, tick, 8, 8, {}, true).outputs.get('out')?.display as {
    status: { enabled: boolean; brightness: number }
  }).status
}

describe('IR remote property workflow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetEvaluatorState()
    useGraphStore.getState().loadGraph([], [])
    useGraphStore.temporal.getState().clear()
    for (const button of buttons) keyDown(button.id, false)
  })

  afterEach(() => vi.useRealTimers())

  it('toggles Power once and repeats held brightness steps through their bounds', () => {
    const { nodes, edges } = normalWorkflow()
    expect(outputStatus(nodes, edges, 0)).toMatchObject({ enabled: false, brightness: 0.5 })

    keyDown('power', true)
    expect(outputStatus(nodes, edges, 1).enabled).toBe(true)
    vi.advanceTimersByTime(120)
    expect(outputStatus(nodes, edges, 2).enabled, 'a held once-policy key does not toggle again').toBe(true)
    keyDown('power', false)
    outputStatus(nodes, edges, 3)

    keyDown('up', true)
    expect(outputStatus(nodes, edges, 4).brightness).toBe(0.75)
    vi.advanceTimersByTime(50)
    expect(outputStatus(nodes, edges, 5).brightness).toBe(0.75)
    vi.advanceTimersByTime(50)
    expect(outputStatus(nodes, edges, 6).brightness, 'a separated held repeat creates a new rising edge').toBe(1)
    vi.advanceTimersByTime(50)
    outputStatus(nodes, edges, 7)
    vi.advanceTimersByTime(50)
    expect(outputStatus(nodes, edges, 8).brightness, 'the authored maximum clamps').toBe(1)

    keyDown('up', false)
    outputStatus(nodes, edges, 9)
    keyDown('down', true)
    expect(outputStatus(nodes, edges, 10).brightness).toBe(0.75)
    vi.advanceTimersByTime(50)
    outputStatus(nodes, edges, 11)
    vi.advanceTimersByTime(50)
    expect(outputStatus(nodes, edges, 12).brightness).toBe(0.5)

    keyDown('down', false)
    outputStatus(nodes, edges, 13)
    keyDown('reset', true)
    expect(outputStatus(nodes, edges, 14).brightness).toBe(0.5)

    keyDown('reset', false)
    outputStatus(nodes, edges, 15)
    keyDown('power', true)
    expect(outputStatus(nodes, edges, 16).enabled).toBe(false)
  })

  it('survives save/reload and keeps stable key ports across undo and redo', () => {
    const { nodes, edges } = normalWorkflow()
    useGraphStore.getState().loadGraph(nodes, edges)
    vi.advanceTimersByTime(400)
    useGraphStore.temporal.getState().clear()

    useGraphStore.getState().updateIrRemoteButton('ir', 'up', { label: 'Brighter' })
    vi.advanceTimersByTime(400)
    const remote = () => useGraphStore.getState().nodes.find((entry) => entry.id === 'ir')!
    const label = () => ((remote().data.properties.buttons as typeof buttons)
      .find((button) => button.id === 'up')?.label)
    expect(label()).toBe('Brighter')
    expect(useGraphStore.getState().edges.find((wire) => wire.id === 'brightness-up')?.sourceHandle)
      .toBe('button-up')

    useGraphStore.temporal.getState().undo()
    expect(label()).toBe('Brightness Up')
    expect(useGraphStore.getState().edges.some((wire) => wire.sourceHandle === 'button-up')).toBe(true)
    useGraphStore.temporal.getState().redo()
    expect(label()).toBe('Brighter')

    const saved = JSON.parse(JSON.stringify(captureWorkspace(useGraphStore.getState())))
    useGraphStore.getState().loadGraph(saved.nodes, saved.edges, saved)
    expect(label()).toBe('Brighter')
    expect((remote().data.properties.buttons as typeof buttons).map((button) => button.id))
      .toEqual(['power', 'up', 'down', 'reset'])
    expect(useGraphStore.getState().edges.find((wire) => wire.id === 'brightness-up')?.sourceHandle)
      .toBe('button-up')
  })
})

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('pattern-frame', 'fill', 'frame', 'end', 'frame')],
  },
}

function expectIrPropertyControls(source: string) {
  expect(source).toContain('#define DECODE_NEC')
  expect(source).toContain('n_ir_button_power = _irProtocol == NEC && _irAddress == 0u && _irCommand == 69u && !_irRepeat;')
  expect(source).toContain('n_ir_button_up = _irProtocol == NEC && _irAddress == 0u && _irCommand == 70u;')
  expect(source).toContain('static bool n_power_toggle_out = false;')
  expect(source).toContain('static float n_brightness_value = 0.5f;')
  expect(source).toContain('_svInc_brightness = (n_ir_button_up)')
  expect(source).toContain('_svDec_brightness = (n_ir_button_down)')
  expect(source).toContain('_svReset_brightness = (n_ir_button_reset)')
  expect(source).toContain('n_brightness_value')
  expect(source).toContain('n_power_toggle_out')
}

describe('IR property controls in every firmware mode', () => {
  it('emits the same toggle and bounded Step Value in a normal sketch', () => {
    const { nodes, edges } = normalWorkflow()
    expectIrPropertyControls(generateCpp(nodes, edges))
  })

  it('emits the same toggle and bounded Step Value in a slideshow sketch', () => {
    const output = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
    const nodes = [
      ...controls(),
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('show', 'PatternSlideshow'),
      output,
    ]
    const edges = [
      edge('set', 'collection', 'patternset', 'show', 'patternset'),
      edge('frame', 'show', 'frame', 'out', 'frame'),
      ...controlEdges(),
    ]
    expectIrPropertyControls(generateShowSketch(nodes, edges, groups))
  })

  it('emits the same toggle and bounded Step Value in an SD/player sketch', () => {
    const nodes = [
      ...controls(),
      node('map', 'ControlMap', { controls: ['ledToggle', 'brightness'] }),
      node('player', 'PatternMaster'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier', { maxVolume: 6 }),
    ]
    const edges = [
      edge('frame', 'player', 'frame', 'out', 'frame'),
      ...controlEdges().filter((wire) => wire.id !== 'power-enabled' && wire.id !== 'brightness-value'),
      edge('power-map', 'power-toggle', 'out', 'map', 'ledToggle'),
      edge('brightness-map', 'brightness', 'value', 'map', 'brightness'),
      edge('controls', 'map', 'controls', 'player', 'controls'),
    ]
    const source = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['pattern'],
      bakedAudio: false,
      genericPlayer: true,
      preferredTrack: '',
    })
    expectIrPropertyControls(source)
  })
})
