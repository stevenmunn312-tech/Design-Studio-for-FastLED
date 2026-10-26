/** Generate normal/slideshow sketches used by the SR1230 bare-encoder compile gate. */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import { SR1230_ENCODER_PART_ID } from '../../src/state/peripherals/encoder'

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

// A saved `pullup: false` is deliberate: the bare part must still read its
// contacts through INPUT_PULLUP, because nothing else holds them high.
const PINS = { pinA: 13, pinB: 14, pinSW: 16, resetOnPress: true }
const sr1230 = () => node('enc', 'EncoderInput', { ...PINS, partId: SR1230_ENCODER_PART_ID, pullup: false })
const encoderModule = () => node('enc', 'EncoderInput', { ...PINS })

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['brightness', 'enabled']
  return result
}

// Position scaled to brightness (30 clicks, in module units, run 0 to 1) and
// Pressed blanking the output while the shaft is held.
function normalGraph(encoder: StudioNode) {
  return generateCpp([
    encoder, node('map', 'MapRange', { inMin: 0, inMax: 120, outMin: 0.05, outMax: 1, clamp: true }),
    node('not', 'Not'), node('fill', 'SolidColor', { r: 255, g: 96, b: 24 }), output(),
  ], [
    edge('position', 'enc', 'position', 'map', 'value'),
    edge('brightness', 'map', 'result', 'out', 'brightness'),
    edge('pressed', 'enc', 'pressed', 'not', 'x'),
    edge('enabled', 'not', 'result', 'out', 'enabled'),
    edge('frame', 'fill', 'frame', 'out', 'frame'),
  ])
}

// The bench graph: Position into Player Controls' Pattern Selection and
// Pressed onto LED On / Off, driving a Pattern Slideshow.
const groups = {
  first: {
    nodes: [node('fill', 'SolidColor', { r: 255, g: 40, b: 0 }), node('end', 'GroupOutput')],
    edges: [edge('first-frame', 'fill', 'frame', 'end', 'frame')],
  },
  second: {
    nodes: [node('fill', 'SolidColor', { r: 0, g: 80, b: 255 }), node('end', 'GroupOutput')],
    edges: [edge('second-frame', 'fill', 'frame', 'end', 'frame')],
  },
}
const slideshow = generateShowSketch([
  sr1230(), node('control-map', 'ControlMap', { controls: ['patternSelect', 'ledToggle'] }),
  node('collection', 'PatternCollection', { patternIds: ['first', 'second'] }),
  node('show', 'PatternSlideshow'), output(),
], [
  edge('select', 'enc', 'position', 'control-map', 'patternSelect'),
  edge('toggle', 'enc', 'pressed', 'control-map', 'ledToggle'),
  edge('show-controls', 'control-map', 'controls', 'show', 'controls'),
  edge('set', 'collection', 'patternset', 'show', 'patternset'),
  edge('frame', 'show', 'frame', 'out', 'frame'),
], groups)

const fixtures = { normal: normalGraph(sr1230()), slideshow, module: normalGraph(encoderModule()) }
for (const [name, source] of Object.entries(fixtures)) {
  const pullups = ['13', '14', '16'].filter((pin) => source.includes(`pinMode(${pin}, INPUT_PULLUP);`)).length
  const scaled = source.includes('_encPos_enc+=_encTbl_enc[(_encLast_enc<<2)|_s] * 2;')
  const plain = source.includes('_encPos_enc+=_encTbl_enc[(_encLast_enc<<2)|_s];')
  const bare = name !== 'module'
  if (pullups !== 3 || scaled !== bare || plain === bare) {
    throw new Error(`${name}: expected 3 pull-ups and ${bare ? 'scaled' : 'plain'} counting, found ${pullups}/${scaled}/${plain}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/encoder-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} encoder compile fixtures to ${outputDir}`)
