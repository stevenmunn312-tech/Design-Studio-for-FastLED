/**
 * HW-32 step 6 fixtures: one LED output split across data pins.
 *
 * Normal, show and player sketches on the ESP32-S3 (four RMT channels, so four
 * lanes send at once), the classic ESP32 at eight lanes with a multi-output
 * route beside it, its wiring diagnostic, and an Arduino Uno, which has no
 * parallel driver and sends its two lanes one after another.
 *
 *   npm run gen:compile-fixtures -- lanes [output-dir]
 *   python scripts/compile-fixtures/compile-matrix.py --only lanes/
 *
 * Generation only checks the emitted `addLeds` lines; the compile record is
 * the matrix run's.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { generateWiringDiagnosticSketch } from '../../src/codegen/sketches/wiringDiagnosticGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import { resolveDefaultProperties } from '../../src/state/nodeDefaults'
import type { GroupRegistry } from '../../src/state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: resolveDefaultProperties(nodeType, { ...libraryDefaults(nodeType), ...properties }),
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const s3 = node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
const classic = node('board', 'Board', { profileId: 'esp32-generic-devkit-38pin' })
// 16 x 32 serpentine matrix, four lanes of eight rows on the S3.
const s3Matrix = node('out', 'MatrixOutput', {
  form: 'matrix', width: 16, height: 32, dataPin: 4, dataLanes: 4, lanePins: [5, 6, 7], chipset: 'WS2812B', colorOrder: 'GRB',
})
// 32 x 32, eight lanes of four rows on the classic ESP32.
const classicMatrix = node('out', 'MatrixOutput', {
  form: 'matrix', width: 32, height: 32, dataPin: 4, dataLanes: 8, lanePins: [13, 14, 16, 17, 18, 19, 21],
  chipset: 'WS2812B', colorOrder: 'GRB', correction: 'TypicalLEDStrip',
})

function pattern(body: StudioNode): GroupRegistry[string] {
  const output = node('go', 'GroupOutput')
  output.data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
  return { nodes: [body, output], edges: [edge('frame', body.id, 'frame', 'go', 'frame')] }
}

const groups = {
  calm: pattern(node('color', 'SolidColor', { r: 0, g: 40, b: 80 })),
  peak: pattern(node('nz', 'Noise', { palette: 'ocean' })),
} as unknown as GroupRegistry

function normal(board: StudioNode, output: StudioNode): string {
  return generateCpp([board, node('nz', 'Noise', { palette: 'lava' }), output], [edge('frame', 'nz', 'frame', 'out', 'frame')])
}

function show(): string {
  return generateShowSketch([
    s3,
    node('pc', 'PatternCollection', { patternIds: ['calm', 'peak'] }),
    node('pm', 'PatternSlideshow', {}),
    s3Matrix,
  ], [edge('set', 'pc', 'patternset', 'pm', 'patternset'), edge('frame', 'pm', 'frame', 'out', 'frame')], groups)
}

function player(): string {
  return buildShowPlayer([
    s3, node('sd', 'SDCard'), node('amp', 'Amplifier'),
    node('master', 'PatternMaster', { order: 'Random' }),
    s3Matrix,
    node('collection', 'PatternCollection', { patternIds: ['calm', 'peak'] }),
  ], [
    edge('frame', 'master', 'frame', 'out', 'frame'),
    edge('set', 'collection', 'patternset', 'master', 'patternset'),
  ], groups, { patternSet: ['calm', 'peak'], bakedAudio: false, preferredTrack: '', genericPlayer: true })
}

// A split matrix beside a plain strip: each route keeps its own controllers.
function multiOutput(): string {
  const strip = node('strip', 'MatrixOutput', { form: 'strip', ledCount: 60, dataPin: 25 })
  return generateCpp([
    classic, node('nz', 'Noise', { palette: 'lava' }), classicMatrix, strip,
  ], [edge('frame', 'nz', 'frame', 'out', 'frame'), edge('frame2', 'nz', 'frame', 'strip', 'frame')])
}

function diagnostic(): string {
  return generateWiringDiagnosticSketch([classic, classicMatrix], 'out') ?? ''
}

// The Uno: a 120-LED string, two lanes of 60, sent one after the other.
function uno(): string {
  return normal(node('board', 'Board', {}), node('out', 'MatrixOutput', {
    form: 'strip', ledCount: 120, dataPin: 6, dataLanes: 2, lanePins: [7],
  }))
}

const sketches: Record<string, { build: () => string; lanes: number }> = {
  'esp32s3-normal': { build: () => normal(s3, s3Matrix), lanes: 4 },
  'esp32s3-show': { build: show, lanes: 4 },
  'esp32s3-player': { build: player, lanes: 4 },
  'esp32-normal': { build: () => normal(classic, classicMatrix), lanes: 8 },
  'esp32-multi-output': { build: multiOutput, lanes: 9 },
  'esp32-diagnostic': { build: diagnostic, lanes: 8 },
  'uno-normal': { build: uno, lanes: 2 },
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/lanes-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, { build, lanes }] of Object.entries(sketches)) {
  const source = build()
  const found = source.split('FastLED.addLeds<').length - 1
  if (found !== lanes) throw new Error(`${name}: expected ${lanes} addLeds calls, found ${found}`)
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(manifest).length} data-lane compile fixtures to ${outputDir}`)
