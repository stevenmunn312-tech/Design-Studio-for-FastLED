/** Generate real normal/show/player sketches used by the light-sensor compile gate. */
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

function sensorControls(partId = 'adafruit-bh1750-light-sensor'): StudioNode[] {
  return [
    node('light', 'LightInput', { partId, pin: 34, sdaPin: 21, sclPin: 22, i2cAddress: '0x23' }),
    node('lux-map', 'MapRange', { inMin: 0, inMax: 1000, outMin: 0, outMax: 1, clamp: true }),
  ]
}

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness']
  return result
}

const luxEdge = edge('lux', 'light', 'lux', 'lux-map', 'value')
const normalNodes = [
  ...sensorControls(),
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }),
  output(),
]
const normalEdges = [
  luxEdge,
  edge('brightness', 'lux-map', 'result', 'out', 'brightness'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
]
const normal = generateCpp(normalNodes, normalEdges)

// The LDR's normal path gained a Lux local, so it is compiled too.
const ldrNodes = [
  node('light', 'LightInput', { pin: 34 }),
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }),
  output(),
]
const ldr = generateCpp(ldrNodes, [
  edge('level', 'light', 'level', 'out', 'brightness'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
])

const noSensorNodes = [node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }), output()]
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
  luxEdge,
  edge('brightness-control', 'lux-map', 'result', 'controls', 'brightness'),
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
  luxEdge,
  edge('brightness-control', 'lux-map', 'result', 'controls', 'brightness'),
  edge('player-controls', 'controls', 'controls', 'player', 'controls'),
  edge('frame', 'player', 'frame', 'out', 'frame'),
]
const player = buildShowPlayer(playerNodes, playerEdges, groups, {
  patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
})

const fixtures = { normal, slideshow, player, ldr, 'no-sensor': noSensor }
for (const [name, source] of Object.entries(fixtures)) {
  const helperCount = source.match(/static void _bh1750Begin\(uint8_t addr\)/g)?.length ?? 0
  const beginCount = source.match(/_bh1750Begin\(0x23\);/g)?.length ?? 0
  const readCount = source.match(/_bh1750Read\(0x23, n_light_lux\);/g)?.length ?? 0
  const expected = name === 'ldr' || name === 'no-sensor' ? 0 : 1
  if (helperCount !== expected || beginCount !== expected || readCount !== expected) {
    throw new Error(`${name}: expected ${expected} BH1750 helper/setup/read, found ${helperCount}/${beginCount}/${readCount}`)
  }
  if (expected && !source.includes('#include <Wire.h>')) throw new Error(`${name}: missing Wire.h`)
}
if (!ldr.includes('analogRead(34) / 4095.0f')) throw new Error('ldr: missing the analog read')

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/light-sensor-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string; bh1750: boolean }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    bh1750: source.includes('static void _bh1750Begin('),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} light-sensor compile fixtures to ${outputDir}`)
