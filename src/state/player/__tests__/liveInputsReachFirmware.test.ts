/*
 * Every port LIVE_PLAYER_SHOW_PROPERTIES calls a verified live input has to
 * be read by the firmware, not only by the preview.
 *
 * The list is a promise: a socket on these nodes works in preview and on the
 * board alike. Player Particles once declared four live ports while both
 * generators baked the node's fields, so on the board the sparks were always
 * on at the slider's intensity. This walks the list, wires each port from a
 * physical control, and asks the show generator and the SD player each
 * engine builds whether the sketch reads that control. A new entry that no
 * generator reads fails here by name.
 */
import { describe, expect, it } from 'vitest'
import { NODE_LIBRARY, libraryDefaults } from '../../nodeLibrary'
import { LIVE_PLAYER_SHOW_PROPERTIES } from '../runtimeControlScope'
import { generateShowSketch } from '../../../codegen/showGenerator'
import { buildShowPlayerForMeasurement } from '../../../utils/showUpload'
import type { StudioEdge, StudioNode } from '../../graphStore'

const FQBN = 'esp32:esp32:esp32'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return { id, type: 'studioNode', position: { x: 0, y: 0 }, data: {
    label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'graph',
    properties: { ...libraryDefaults(nodeType), ...properties },
    inputs: definition?.inputs ?? (nodeType === 'GroupOutput' ? [{ id: 'frame', label: 'Frame', dataType: 'frame' }] : []),
    outputs: definition?.outputs ?? [],
  } } as StudioNode
}
const edge = (source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge =>
  ({ id: `${source}-${sourceHandle}-${target}-${targetHandle}`, source, sourceHandle, target, targetHandle }) as StudioEdge

// Two patterns, so the engines rotate and their timing is emitted at all.
const groups = Object.fromEntries(['a', 'b'].map((id) => [id, {
  nodes: [node(`${id}-fill`, 'SolidColor'), node(`${id}-end`, 'GroupOutput')],
  edges: [edge(`${id}-fill`, 'frame', `${id}-end`, 'frame')],
}]))

type Engine = 'show' | 'player'

/** The engine each node is read by. A node that is not an engine rides on both. */
const ENGINES: Record<string, readonly Engine[]> = {
  PatternMaster: ['player'],
  PatternSlideshow: ['show'],
}

/** A collection on two patterns, played by the engine into one LED output. */
function baseGraph(engine: Engine) {
  const engineId = engine === 'show' ? 'show' : 'player'
  const nodes: StudioNode[] = [
    node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' }),
    node('out', 'MatrixOutput', { form: 'strip', ledCount: 30, dataPin: 13 }),
    node('collection', 'PatternCollection', { patternIds: ['a', 'b'] }),
    engine === 'show'
      ? node('show', 'PatternSlideshow', { minTime: 4, maxTime: 4, transitionSec: 1 })
      : node('player', 'PatternMaster', { minTime: 4, maxTime: 4, transitionSec: 1 }),
  ]
  const edges: StudioEdge[] = [
    edge('collection', 'patternset', engineId, 'patternset'),
    edge(engineId, 'frame', 'out', 'frame'),
  ]
  if (engine === 'player') {
    nodes.push(node('sd', 'SDCard'), node('amp', 'Amplifier', { i2sBclk: 26, i2sLrc: 25, i2sDout: 22 }))
  }
  return { nodes, edges, engineId }
}

/** Put the node under test where its engine reads it, with its port wired. */
function withTarget(engine: Engine, nodeType: string, port: string, wired: boolean) {
  const { nodes, edges, engineId } = baseGraph(engine)
  let target = nodeType === 'PatternMaster' || nodeType === 'PatternSlideshow' ? engineId : nodeType === 'MatrixOutput' ? 'out' : 'target'
  if (nodeType === 'PlayerParticles') {
    nodes.push(node('target', 'PlayerParticles', { enabled: true }))
    edges.push(edge('target', 'particleFx', engineId, 'particleFx'))
    // The SD player bursts on its decoder's beat; a slideshow needs a beat
    // wired, or there is no overlay for the ports to act on.
    if (engine === 'show') {
      nodes.push(node('beat', 'ButtonInput', { pin: 27 }))
      edges.push(edge('beat', 'pressed', engineId, 'beat'))
    }
  } else if (['TransportDisplay', 'InfoDisplay', 'SegmentDisplay'].includes(nodeType)) {
    const parts: Record<string, Record<string, unknown>> = {
      TransportDisplay: { partId: 'st7789-tft-240x240', csPin: 5, dcPin: 16, resetPin: 17, sckPin: 18, mosiPin: 23, backlightPin: 4 },
      InfoDisplay: { partId: 'ssd1306-oled-128x64', sdaPin: 21, sclPin: 22, i2cAddress: '0x3C' },
      SegmentDisplay: { partId: 'tm1637-4digit-display', clkPin: 32, dioPin: 33 },
    }
    nodes.push(node('target', nodeType, parts[nodeType]))
    edges.push(edge(engineId, 'display', 'target', 'display'))
  } else {
    target = target === 'target' ? engineId : target
  }
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  const dataType = definition.inputs.find((input) => input.id === port)?.dataType
  // A bool takes a button, a number a knob: a physical control whose read the
  // sketch can only contain because something wired consumes it.
  if (wired) {
    if (dataType === 'bool') {
      nodes.push(node('src', 'ButtonInput', { pin: 34 }))
      edges.push(edge('src', 'pressed', target, port))
    } else {
      nodes.push(node('src', 'PotInput', { pin: 35 }))
      edges.push(edge('src', 'value', target, port))
    }
  }
  return { nodes, edges, sourceRead: dataType === 'bool' ? /digitalRead\(34\)/ : /analogRead\(35\)/ }
}

function sketch(engine: Engine, nodes: StudioNode[], edges: StudioEdge[]): string {
  if (engine === 'show') return generateShowSketch(nodes, edges, groups)
  const cpp = buildShowPlayerForMeasurement(nodes, edges, groups, FQBN)
  if (!cpp) throw new Error('the graph did not resolve to a player build')
  return cpp
}

const cases = Object.entries(LIVE_PLAYER_SHOW_PROPERTIES).flatMap(([nodeType, keys]) => {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)!
  return keys.flatMap((key) => (ENGINES[nodeType] ?? ['show', 'player'] as const).map((engine) => ({
    nodeType, key, port: definition.propertyInputs![key], engine,
  })))
})

describe('every live player and show input reaches the firmware', () => {
  it('covers every listed port', () => {
    expect(cases.length).toBeGreaterThan(0)
    for (const { nodeType, key, port } of cases) expect(port, `${nodeType}.${key}`).toBeTruthy()
  })

  it.each(cases.map((entry) => [`${entry.engine} reads a wired ${entry.nodeType}.${entry.key}`, entry] as const))('%s', (_name, { nodeType, port, engine }) => {
    const plain = withTarget(engine, nodeType, port, false)
    const wired = withTarget(engine, nodeType, port, true)
    const before = sketch(engine, plain.nodes, plain.edges)
    const after = sketch(engine, wired.nodes, wired.edges)
    expect(after, 'the wire changes nothing in the sketch').not.toBe(before)
    expect(after.slice(after.indexOf('void loop() {')), 'the sketch never reads the wired control')
      .toMatch(wired.sourceRead)
  })
})
