/** Generate real normal/show/player sketches used by the touch-button compile gate. */
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

function touch(): StudioNode {
  return node('touch', 'TouchButtonInput', {
    partId: 'seeed-grove-touch-sensor',
    pin: 21,
  })
}

function output(): StudioNode {
  const result = node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 })
  result.data.exposedInputs = ['enabled']
  return result
}

const normalNodes = [touch(), node('fill', 'SolidColor', { r: 50, g: 180, b: 255 }), output()]
const normalEdges = [
  edge('enabled', 'touch', 'touched', 'out', 'enabled'),
  edge('frame', 'fill', 'frame', 'out', 'frame'),
]
const normal = generateCpp(normalNodes, normalEdges)

const noTouchNodes = [node('fill', 'SolidColor', { r: 50, g: 180, b: 255 }), output()]
const noTouch = generateCpp(noTouchNodes, [edge('frame', 'fill', 'frame', 'out', 'frame')])

const groups = {
  pattern: {
    nodes: [node('fill', 'SolidColor'), node('end', 'GroupOutput')],
    edges: [edge('pattern-frame', 'fill', 'frame', 'end', 'frame')],
  },
}
const slideshowNodes = [
  touch(),
  node('controls', 'ControlMap', { controls: ['ledToggle'] }),
  node('collection', 'PatternCollection', { patternIds: ['pattern'] }),
  node('show', 'PatternSlideshow'),
  output(),
]
const slideshowEdges = [
  edge('touch-control', 'touch', 'touched', 'controls', 'ledToggle'),
  edge('show-controls', 'controls', 'controls', 'show', 'controls'),
  edge('set', 'collection', 'patternset', 'show', 'patternset'),
  edge('frame', 'show', 'frame', 'out', 'frame'),
]
const slideshow = generateShowSketch(slideshowNodes, slideshowEdges, groups)

const playerNodes = [
  touch(),
  node('controls', 'ControlMap', { controls: ['ledToggle'] }),
  node('player', 'PatternMaster'),
  output(),
  node('sd', 'SDCard'),
  node('amp', 'Amplifier', { maxVolume: 6 }),
]
const playerEdges = [
  edge('touch-control', 'touch', 'touched', 'controls', 'ledToggle'),
  edge('player-controls', 'controls', 'controls', 'player', 'controls'),
  edge('frame', 'player', 'frame', 'out', 'frame'),
]
const player = buildShowPlayer(playerNodes, playerEdges, groups, {
  patternSet: ['pattern'], bakedAudio: false, genericPlayer: true, preferredTrack: '',
})

const fixtures = { normal, slideshow, player, 'no-touch': noTouch }
for (const [name, source] of Object.entries(fixtures)) {
  const setupCount = source.match(/pinMode\(21, INPUT\);/g)?.length ?? 0
  const readCount = source.match(/digitalRead\(21\) == HIGH/g)?.length ?? 0
  const pullupCount = source.match(/pinMode\(21, INPUT_PULLUP\);/g)?.length ?? 0
  const expected = name === 'no-touch' ? 0 : 1
  if (setupCount !== expected || readCount !== expected || pullupCount !== 0) {
    throw new Error(`${name}: expected ${expected} plain active-high touch read, found ${setupCount}/${readCount}/${pullupCount}`)
  }
}

const outputDir = resolve(process.argv[2] ?? 'backend/sketches/touch-button-fixtures')
mkdirSync(outputDir, { recursive: true })
const manifest: Record<string, { bytes: number; sha256: string; touchButton: boolean }> = {}
for (const [name, source] of Object.entries(fixtures)) {
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = {
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex'),
    touchButton: source.includes('digitalRead(21) == HIGH'),
  }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(fixtures).length} touch-button compile fixtures to ${outputDir}`)
