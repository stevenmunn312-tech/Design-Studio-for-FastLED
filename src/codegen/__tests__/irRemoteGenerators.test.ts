// Learned IR keys have to arrive in every sketch the same way a button does.
//
// The three generators build loop() by three different routes. This wires one
// receiver into each and checks the shared poll: one decode, after the control
// snapshot and before a destination is applied, with the key bool a direct
// action can name.

import { describe, expect, it } from 'vitest'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { addDisplayWidget, createDisplayDocument } from '../../state/displays/displayEditor'
import type { DisplayDocument } from '../../state/displays/displayDocument'
import { controlPhaseViolation } from '../../state/player/controlPhases'
import { createControlGraph, controlGraphCpp } from '../controlGraph'
import { generateCpp } from '../cppGenerator'
import { generateShowSketch } from '../showGenerator'
import { playerControlGraph } from '../player/playerControlGraph'
import { buildShowPlayer } from '../../utils/showUpload'
import { IR_RMT_RECEIVER_CPP } from '../peripherals/irRmtReceiverCpp'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

const panel = (id: string) => node(id, 'TransportDisplay', {
  partId: 'st7789v-xpt2046-touch-240x320', tftRotation: '0', tftLayout: 'Custom design', displayId: 'screen',
})
const touch = (panelId = 'tft') => node(`${panelId}-touch`, 'TouchInput', { panelId })

function document(): DisplayDocument {
  let doc = createDisplayDocument('screen', 240, 320)
  for (const type of ['Slider', 'Toggle', 'Text'] as const) doc = addDisplayWidget(doc, type)
  return doc
}
const documents = { screen: document() }
const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('fill', 'frame', 'end', 'frame')],
  },
}

const keys = {
  pin: 4,
  buttons: [
    { id: 'power', label: 'Power', protocol: 'NEC', address: 0, command: 69, repeat: 'once' },
    { id: 'up', label: 'Up', protocol: 'NEC', address: 0, command: 70, repeat: 'held' },
  ],
}

const controlNodes = [
  panel('tft'), touch(), node('math', 'Math', { mathOp: 'multiply', b: 0.5 }), node('format', 'FormatNumber'),
]
const controlEdges = [
  edge('tft-touch', 'widget:slider:out', 'math', 'a'),
  edge('math', 'result', 'tft', 'widget:slider:set'),
  edge('math', 'result', 'format', 'value'),
  edge('format', 'text', 'tft', 'widget:text:value'),
]

function loopBody(source: string): string {
  const at = source.indexOf('void loop() {')
  let depth = 0
  for (let index = source.indexOf('{', at); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(at, index + 1)
    }
  }
  return source.slice(at)
}

function expectOnePoll(source: string, player = false) {
  expect(source.match(/FLS_IR_RECEIVER\.decode\(/g)).toHaveLength(1)
  // Include deduplication must preserve the complete S3 adapter body.
  expect(source).toContain(IR_RMT_RECEIVER_CPP)
  expect(source.indexOf('class FlsIrRmtReceiver')).toBeGreaterThan(source.indexOf('#include <FastLED.h>'))
  expect(source).toContain('#define DECODE_NEC')
  expect(source.indexOf('#define DECODE_NEC')).toBeLessThan(source.indexOf('#include <IRremote.hpp>'))
  if (player) {
    expect(source.indexOf('#include <IRremote.hpp>')).toBeLessThan(source.indexOf('#include <Audio.h>'))
    expect(source.indexOf('#include <Audio.h>')).toBeLessThan(source.indexOf('#include <FastLED.h>'))
  } else {
    expect(source.indexOf('#include <FastLED.h>')).toBeLessThan(source.indexOf('#include <IRremote.hpp>'))
  }
  expect(source).toContain('FLS_IR_RECEIVER.begin(4, DISABLE_LED_FEEDBACK);')
  expect(source).toContain('static bool n_ir_button_power;')
  expect(source).toContain('n_ir_button_power = _irProtocol == NEC && _irAddress == 0u && _irCommand == 69u && !_irRepeat;')
  expect(source).toContain('n_ir_button_up = _irProtocol == NEC && _irAddress == 0u && _irCommand == 70u;')
  const loop = loopBody(source)
  expect(controlPhaseViolation(loop)?.reason ?? null, loop).toBeNull()
  const decodeAt = loop.indexOf('FLS_IR_RECEIVER.decode(')
  expect(decodeAt).toBeGreaterThan(loop.indexOf('_cdBoolOutput('))
  const applyAt = loop.search(/_cdPanelOn_\w+ = _cdOn_\w+;|\{ \/\/ LED output run-time controls/)
  expect(applyAt).toBeGreaterThan(decodeAt)
}

describe('IR polling in the three generators', () => {
  it('includes an unwired, unmapped receiver only when Debug is enabled', () => {
    const nodes = [node('ir', 'IRRemoteInput', { pin: 2, debug: true }), node('fill', 'SolidColor'), node('out', 'MatrixOutput')]
    const edges = [edge('fill', 'frame', 'out', 'frame')]
    expect(generateCpp(nodes, edges)).toContain('FLS_IR_RECEIVER.begin(2, DISABLE_LED_FEEDBACK)')
    expect(controlGraphCpp(createControlGraph(nodes, edges)).irDebug).toBe(true)
    nodes[0].data.properties.debug = false
    expect(generateCpp(nodes, edges)).not.toContain('IRremote.hpp')
    expect(controlGraphCpp(createControlGraph(nodes, edges)).irDebug).toBe(false)
  })
  it.each(['normal', 'slideshow', 'player'] as const)('feeds separate remote On/Off keys through Toggle with optional debug in %s firmware', (mode) => {
    const nodes = [
      node('ir', 'IRRemoteInput', keys),
      node('toggle', 'Trigger', { triggerOp: 'toggle', initialState: true }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
    ]
    const edges = [
      edge('ir', 'button-power', 'toggle', 'on'),
      edge('ir', 'button-up', 'toggle', 'off'),
      edge('toggle', 'out', 'out', 'enabled'),
    ]
    let source: string
    if (mode === 'normal') {
      nodes.push(node('fill', 'SolidColor'))
      edges.push(edge('fill', 'frame', 'out', 'frame'))
      source = generateCpp(nodes, edges)
    } else if (mode === 'slideshow') {
      nodes.push(node('collection', 'PatternCollection', { patternIds: ['pattern'] }), node('show', 'PatternSlideshow'))
      edges.push(edge('collection', 'patternset', 'show', 'patternset'), edge('show', 'frame', 'out', 'frame'))
      source = generateShowSketch(nodes, edges, groups)
    } else {
      // SD players route lighting through their player controls; exercise a
      // supported boolean consumer without changing that existing contract.
      edges.pop()
      nodes.push(node('player', 'PatternMaster'), node('sd', 'SDCard'), panel('tft'))
      edges.push(edge('player', 'frame', 'out', 'frame'), edge('toggle', 'out', 'tft', 'enabled'))
      source = buildShowPlayer(nodes, edges, groups, {
        patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '', displayDocuments: documents,
      })
    }
    expect(source).toContain('static bool n_toggle_out = true;')
    expect(source).toContain('if (n_ir_button_up) n_toggle_out = false; else if (n_ir_button_power) n_toggle_out = true;')
    const loop = loopBody(source)
    expect(loop.indexOf('FLS_IR_RECEIVER.decode(')).toBeLessThan(loop.indexOf('if (n_ir_button_up)'))
    expect(createControlGraph(nodes, edges).resolve('toggle', 'out', 'bool')).toEqual({ nodeId: 'toggle', port: 'out', type: 'bool' })
    expect(source).not.toContain('FLS_IR_DEBUG')
    expect(source).not.toContain('FLS_IR_CAPTURE')
    nodes.find((entry) => entry.id === 'ir')!.data.properties.debug = true
    const debugSource = mode === 'normal' ? generateCpp(nodes, edges)
      : mode === 'slideshow' ? generateShowSketch(nodes, edges, groups)
        : buildShowPlayer(nodes, edges, groups, {
          patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '', displayDocuments: documents,
        })
    expect(debugSource).toContain('FLS_IR_DEBUG protocol=')
    expect(debugSource).toContain('FLS_IR_MATCH output=n_ir_button_up')
    expect(debugSource).toContain('FLS_IR_RAW len=')
    expect(debugSource.match(/Serial.begin\(115200\)/g)).toHaveLength(1)
  })
  it('feeds a learned key through a normal sketch ahead of the graph', () => {
    const nodes = [
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
      node('fill', 'SolidColor'),
      node('step', 'StepValue', { initial: 0.25, minimum: 0, maximum: 1, step: 0.25 }),
      node('ir', 'IRRemoteInput', keys),
      node('btn', 'ButtonInput', { pin: 12 }),
      ...controlNodes,
    ]
    const edges = [
      edge('fill', 'frame', 'out', 'frame'),
      edge('ir', 'button-power', 'step', 'increase'),
      edge('step', 'value', 'fill', 'r'),
      edge('btn', 'pressed', 'tft', 'enabled'),
      edge('tft-touch', 'widget:toggle:out', 'out', 'enabled'),
      ...controlEdges,
    ]
    const source = generateCpp(nodes, edges, {}, { displayDocuments: documents })
    expectOnePoll(source)
    const graph = createControlGraph(nodes, edges)
    expect(graph.resolve('step', 'value', 'float')).toEqual({ nodeId: 'step', port: 'value', type: 'float' })
    const emitted = controlGraphCpp(graph)
    for (const line of [...emitted.includes, ...emitted.globals, ...emitted.setup, ...emitted.loop]) {
      expect(source, line).toContain(line)
    }
  })

  it('resolves a learned key as a slideshow direct action', () => {
    const nodes = [
      node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
      node('show', 'PatternSlideshow'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
      node('ir', 'IRRemoteInput', keys),
      node('btn', 'ButtonInput', { pin: 12 }),
      ...controlNodes,
    ]
    const edges = [
      edge('collection', 'patternset', 'show', 'patternset'),
      edge('show', 'frame', 'out', 'frame'),
      edge('ir', 'button-power', 'show', 'patternNext'),
      edge('btn', 'pressed', 'tft', 'enabled'),
      edge('tft-touch', 'widget:toggle:out', 'out', 'enabled'),
      ...controlEdges,
    ]
    const source = generateShowSketch(nodes, edges, groups, { displayDocuments: documents })
    expectOnePoll(source)
    expect(source).toContain('_pcE_show_direct_patternNext.update(n_ir_button_power,')
  })

  it('resolves a learned key as a player direct action', () => {
    const nodes = [
      node('player', 'PatternMaster'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier', { maxVolume: 6 }),
      node('ir', 'IRRemoteInput', keys),
      node('btn', 'ButtonInput', { pin: 12 }),
      ...controlNodes,
    ]
    const edges = [
      edge('player', 'frame', 'out', 'frame'),
      edge('ir', 'button-power', 'player', 'next'),
      edge('btn', 'pressed', 'tft', 'enabled'),
      ...controlEdges,
    ]
    const source = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '', displayDocuments: documents,
    })
    expectOnePoll(source, true)
    expect(source).toContain('_pcE_player_direct_next.update(n_ir_button_power,')
  })

  it('teaches the performance-player control graph the same dynamic output', () => {
    const nodes = [
      node('perf', 'PerformanceGenerator'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 27 }),
      node('ir', 'IRRemoteInput', keys),
    ]
    const edges = [
      edge('perf', 'frame', 'out', 'frame'),
      edge('ir', 'button-power', 'perf', 'next'),
    ]
    const routing = playerControlGraph(nodes, edges, undefined, 'perf')
    expect(routing.errors).toEqual([])
    expect(routing.controls.some((control) => control.buttons.some((button) =>
      button.port === 'next' && button.expr === 'n_ir_button_power'))).toBe(true)
    const sample = controlGraphCpp(routing.graph).loop.join('\n')
    expect(sample.match(/FLS_IR_RECEIVER\.decode\(/g)).toHaveLength(1)
    expect(sample).toContain('n_ir_button_power =')
  })
})
