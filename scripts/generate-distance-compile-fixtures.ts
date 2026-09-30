/** Generate normal/show/player sketches used by the HC-SR04 compile gate. */
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
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: nodeType, nodeType, category: definition?.category ?? 'output',
      properties: { ...libraryDefaults(nodeType), ...properties },
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

function controls(): StudioNode[] {
  return [
    node('ranger', 'DistanceInput', { partId: 'hc-sr04-ultrasonic-module', trigPin: 27, echoPin: 26 }),
    node('distance-map', 'MapRange', { inMin: 100, inMax: 1500, outMin: 1, outMax: 0.1, clamp: true }),
  ]
}

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness']
  return result
}

const distanceEdge = edge('distance', 'ranger', 'distance', 'distance-map', 'value')
const normal = generateCpp([
  ...controls(), node('fill', 'SolidColor', { r: 255, g: 96, b: 24 }), output(),
], [
  distanceEdge,
  edge('brightness', 'distance-map', 'result', 'out', 'brightness'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
])

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('pattern-frame', 'fill', 'frame', 'end', 'frame')],
  },
}
const slideshow = generateShowSketch([
  ...controls(), node('control-map', 'ControlMap', { controls: ['brightness'] }),
  node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('show', 'PatternSlideshow'), output(),
], [
  distanceEdge,
  edge('brightness-control', 'distance-map', 'result', 'control-map', 'brightness'),
  edge('show-controls', 'control-map', 'controls', 'show', 'controls'),
  edge('set', 'collection', 'patternset', 'show', 'patternset'),
  edge('frame', 'show', 'frame', 'out', 'frame'),
], groups)

const player = buildShowPlayer([
  ...controls(), node('control-map', 'ControlMap', { controls: ['brightness'] }),
  node('player', 'PatternMaster'), output(), node('sd', 'SDCard'),
  node('amp', 'Amplifier', { maxVolume: 6 }),
], [
  distanceEdge,
  edge('brightness-control', 'distance-map', 'result', 'control-map', 'brightness'),
  edge('player-controls', 'control-map', 'controls', 'player', 'controls'),
  edge('frame', 'player', 'frame', 'out', 'frame'),
], groups, { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' })

const noSensor = generateCpp([
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }), output(),
], [edge('frame', 'fill', 'frame', 'out', 'frame')])

const fixtures = { normal, slideshow, player, 'no-sensor': noSensor }
for (const [name, source] of Object.entries(fixtures)) {
  const helperCount = source.match(/static bool _sr04Measure\(/g)?.length ?? 0
  const readCount = source.match(/_sr04Measure\(27, 26, 10, 24324, _sr04Value\)/g)?.length ?? 0
  const expected = name === 'no-sensor' ? 0 : 1
  // Pulse ranging needs no library: neither Wire nor a ranging library include may appear.
  const hasLibrary = /#include <(Wire|NewPing|Ultrasonic)\.h>/.test(source)
  if (helperCount !== expected || readCount !== expected || hasLibrary) {
    throw new Error(`${name}: expected ${expected} HC-SR04 helper/read and no library include, found ${helperCount}/${readCount}/${hasLibrary}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/distance-sensor-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} distance-sensor compile fixtures to ${outputDir}`)
