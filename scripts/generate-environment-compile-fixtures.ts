/** Generate normal/show/player sketches used by the BME280 compile gate. */
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
    node('environment', 'EnvironmentInput', {
      partId: 'adafruit-bme280-environment-sensor', sdaPin: 21, sclPin: 22, i2cAddress: '0x77',
    }),
    node('temperature-map', 'MapRange', { inMin: 10, inMax: 35, outMin: 0.1, outMax: 1, clamp: true }),
  ]
}

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness']
  return result
}

const temperatureEdge = edge('temperature', 'environment', 'temperature', 'temperature-map', 'value')
const normal = generateCpp([
  ...controls(), node('fill', 'SolidColor', { r: 255, g: 96, b: 24 }), output(),
], [
  temperatureEdge,
  edge('brightness', 'temperature-map', 'result', 'out', 'brightness'),
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
  temperatureEdge,
  edge('brightness-control', 'temperature-map', 'result', 'control-map', 'brightness'),
  edge('show-controls', 'control-map', 'controls', 'show', 'controls'),
  edge('set', 'collection', 'patternset', 'show', 'patternset'),
  edge('frame', 'show', 'frame', 'out', 'frame'),
], groups)

const player = buildShowPlayer([
  ...controls(), node('control-map', 'ControlMap', { controls: ['brightness'] }),
  node('player', 'PatternMaster'), output(), node('sd', 'SDCard'),
  node('amp', 'Amplifier', { maxVolume: 6 }),
], [
  temperatureEdge,
  edge('brightness-control', 'temperature-map', 'result', 'control-map', 'brightness'),
  edge('player-controls', 'control-map', 'controls', 'player', 'controls'),
  edge('frame', 'player', 'frame', 'out', 'frame'),
], groups, { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' })

const noSensor = generateCpp([
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }), output(),
], [edge('frame', 'fill', 'frame', 'out', 'frame')])

const fixtures = { normal, slideshow, player, 'no-sensor': noSensor }
for (const [name, source] of Object.entries(fixtures)) {
  const helperCount = source.match(/static bool _bmeMeasure\(/g)?.length ?? 0
  const beginCount = source.match(/_bmeBegin\(0x77, _bmeCal_environment\)/g)?.length ?? 0
  const readCount = source.match(/_bmeMeasure\(0x77, _bmeCal_environment/g)?.length ?? 0
  const expected = name === 'no-sensor' ? 0 : 1
  const hasWire = source.includes('#include <Wire.h>')
  if (helperCount !== expected || beginCount !== expected || readCount !== expected || hasWire !== (expected === 1)) {
    throw new Error(`${name}: expected ${expected} BME280 helper/begin/read and Wire.h, found ${helperCount}/${beginCount}/${readCount}/${hasWire}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/environment-sensor-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} environment-sensor compile fixtures to ${outputDir}`)
