/** Generate normal/show/player sketches used by the MPR121 touch-pad compile gate. */
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

const PROPS = { partId: 'adafruit-mpr121-touch-sensor', sdaPin: 21, sclPin: 22, i2cAddress: '0x5A', touchThreshold: 12, releaseThreshold: 6 }

function controls(): StudioNode[] {
  return [
    node('pad', 'TouchPadInput', PROPS),
    node('key-map', 'MapRange', { inMin: 0, inMax: 11, outMin: 0.1, outMax: 1, clamp: true }),
  ]
}

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness']
  return result
}

const keyEdge = edge('key', 'pad', 'electrode', 'key-map', 'value')
const normal = generateCpp([
  ...controls(), node('fill', 'SolidColor', { r: 255, g: 200, b: 60 }), output(),
], [
  keyEdge,
  edge('brightness', 'key-map', 'result', 'out', 'brightness'),
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
  keyEdge,
  edge('brightness-control', 'key-map', 'result', 'control-map', 'brightness'),
  edge('show-controls', 'control-map', 'controls', 'show', 'controls'),
  edge('set', 'collection', 'patternset', 'show', 'patternset'),
  edge('frame', 'show', 'frame', 'out', 'frame'),
], groups)

const player = buildShowPlayer([
  ...controls(), node('control-map', 'ControlMap', { controls: ['brightness'] }),
  node('player', 'PatternMaster'), output(), node('sd', 'SDCard'),
  node('amp', 'Amplifier', { maxVolume: 6 }),
], [
  keyEdge,
  edge('brightness-control', 'key-map', 'result', 'control-map', 'brightness'),
  edge('player-controls', 'control-map', 'controls', 'player', 'controls'),
  edge('frame', 'player', 'frame', 'out', 'frame'),
], groups, { patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '' })

const noPad = generateCpp([
  node('fill', 'SolidColor', { r: 255, g: 180, b: 60 }), output(),
], [edge('frame', 'fill', 'frame', 'out', 'frame')])

const fixtures = { normal, slideshow, player, 'no-touchpad': noPad }
for (const [name, source] of Object.entries(fixtures)) {
  const helperCount = source.match(/static bool _mprRead\(/g)?.length ?? 0
  const readCount = source.match(/_mprRead\(0x5A, &_mprBits_pad\)/g)?.length ?? 0
  const beginCount = source.match(/Wire\.begin\(/g)?.length ?? 0
  const expected = name === 'no-touchpad' ? 0 : 1
  // The chip is driven through its registers over Wire: no touch library may be included.
  const hasLibrary = /#include <(Adafruit_MPR121|MPR121)\.h>/.test(source)
  if (helperCount !== expected || readCount !== expected || beginCount !== expected || hasLibrary) {
    throw new Error(`${name}: expected ${expected} MPR121 helper/read/bus start and no library include, found ${helperCount}/${readCount}/${beginCount}/${hasLibrary}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/touchpad-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} touch-pad compile fixtures to ${outputDir}`)
