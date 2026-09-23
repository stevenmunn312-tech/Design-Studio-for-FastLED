/** Generate real normal/show/player sketches used by the IR compile gate. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../src/codegen/cppGenerator'
import { generateShowSketch } from '../src/codegen/showGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../src/state/graphStore'
import { buildShowPlayer } from '../src/utils/showUpload'

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

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string): StudioEdge {
  return { id, source, sourceHandle, target, targetHandle } as StudioEdge
}

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

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness', 'enabled']
  return result
}

const normalNodes = [...controls(), node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }), output()]
const normalEdges = [edge('frame', 'fill', 'frame', 'out', 'frame'), ...controlEdges()]
const normal = generateCpp(normalNodes, normalEdges)

const noIrNodes = [node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }), output()]
const noIr = generateCpp(noIrNodes, [edge('frame', 'fill', 'frame', 'out', 'frame')])

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('pattern-frame', 'fill', 'frame', 'end', 'frame')],
  },
}
const showNodes = [
  ...controls(),
  node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('show', 'PatternSlideshow'),
  output(),
]
const showEdges = [
  edge('set', 'collection', 'patternset', 'show', 'patternset'),
  edge('frame', 'show', 'frame', 'out', 'frame'),
  ...controlEdges(),
]
const slideshow = generateShowSketch(showNodes, showEdges, groups)

const playerNodes = [
  ...controls(),
  node('map', 'ControlMap', { controls: ['ledToggle', 'brightness'] }),
  node('player', 'PatternMaster'),
  output(),
  node('sd', 'SDCard'),
  node('amp', 'Amplifier', { maxVolume: 6 }),
]
const playerEdges = [
  edge('frame', 'player', 'frame', 'out', 'frame'),
  ...controlEdges().filter((wire) => wire.id !== 'power-enabled' && wire.id !== 'brightness-value'),
  edge('power-map', 'power-toggle', 'out', 'map', 'ledToggle'),
  edge('brightness-map', 'brightness', 'value', 'map', 'brightness'),
  edge('controls', 'map', 'controls', 'player', 'controls'),
]
const player = buildShowPlayer(playerNodes, playerEdges, groups, {
  patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
})

const fixtures = { normal, slideshow, player, 'no-ir': noIr }
for (const [name, source] of Object.entries(fixtures)) {
  const includes = source.match(/#include <IRremote\.hpp>/g)?.length ?? 0
  if ((name === 'no-ir' && includes !== 0) || (name !== 'no-ir' && includes !== 1)) {
    throw new Error(`${name}: expected ${name === 'no-ir' ? 0 : 1} IRremote includes, found ${includes}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/ir-remote-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string; irremote: boolean }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    irremote: source.includes('#include <IRremote.hpp>'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} IR compile fixtures to ${outputDir}`)
