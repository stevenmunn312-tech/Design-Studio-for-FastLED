/** Generate real normal/show/player sketches used by the presence-sensor compile gate. */
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

function sensorControls(): StudioNode[] {
  return [
    node('radar', 'PresenceInput', { partId: 'hlk-ld2410c-presence-sensor', rxPin: 18 }),
    node('distance-map', 'MapRange', { inMin: 0, inMax: 6, outMin: 0, outMax: 1, clamp: true }),
  ]
}

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness']
  return result
}

const distanceEdge = edge('distance', 'radar', 'distance', 'distance-map', 'value')
const normalNodes = [
  ...sensorControls(),
  node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }),
  output(),
]
const normalEdges = [
  distanceEdge,
  edge('brightness', 'distance-map', 'result', 'out', 'brightness'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
]
const normal = generateCpp(normalNodes, normalEdges)

const noSensorNodes = [node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }), output()]
const noSensor = generateCpp(noSensorNodes, [edge('frame', 'fill', 'frame', 'out', 'frame')])

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('pattern-frame', 'fill', 'frame', 'end', 'frame')],
  },
}
const slideshowNodes = [
  ...sensorControls(),
  node('controls', 'ControlMap', { controls: ['brightness'] }),
  node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('show', 'PatternSlideshow'),
  output(),
]
const slideshowEdges = [
  distanceEdge,
  edge('brightness-control', 'distance-map', 'result', 'controls', 'brightness'),
  edge('show-controls', 'controls', 'controls', 'show', 'controls'),
  edge('set', 'collection', 'patternset', 'show', 'patternset'),
  edge('frame', 'show', 'frame', 'out', 'frame'),
]
const slideshow = generateShowSketch(slideshowNodes, slideshowEdges, groups)

const playerNodes = [
  ...sensorControls(),
  node('controls', 'ControlMap', { controls: ['brightness'] }),
  node('player', 'PatternMaster'),
  output(),
  node('sd', 'SDCard'),
  node('amp', 'Amplifier', { maxVolume: 6 }),
]
const playerEdges = [
  distanceEdge,
  edge('brightness-control', 'distance-map', 'result', 'controls', 'brightness'),
  edge('player-controls', 'controls', 'controls', 'player', 'controls'),
  edge('frame', 'player', 'frame', 'out', 'frame'),
]
const player = buildShowPlayer(playerNodes, playerEdges, groups, {
  patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
})

const fixtures = { normal, slideshow, player, 'no-sensor': noSensor }
for (const [name, source] of Object.entries(fixtures)) {
  const parserCount = source.match(/static void _ldPoll\(\)/g)?.length ?? 0
  const beginCount = source.match(/Serial1\.begin\(256000, SERIAL_8N1, 18, -1\);/g)?.length ?? 0
  const expected = name === 'no-sensor' ? 0 : 1
  if (parserCount !== expected || beginCount !== expected) {
    throw new Error(`${name}: expected ${expected} LD2410 parser/setup pair, found ${parserCount}/${beginCount}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/presence-sensor-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string; ld2410: boolean }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    ld2410: source.includes('static void _ldPoll()'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} presence-sensor compile fixtures to ${outputDir}`)
