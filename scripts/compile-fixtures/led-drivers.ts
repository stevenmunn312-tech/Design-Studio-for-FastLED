/**
 * HW-32 step 7 fixtures: one sketch per LED driver the Board can choose and
 * family that offers it, plus the S3's LCD_CAM driver through the show and
 * player generators, so every generator's `withLedDriver` pass is compiled.
 * Each sketch drives three clockless outputs, so the parallel drivers have
 * lanes to send at once.
 *
 *   npm run gen:compile-fixtures -- led-drivers [output-dir]
 *   python scripts/compile-fixtures/compile-matrix.py --only led-drivers/
 *
 * The manifest records each sketch's FQBN for the matrix legs. The classic
 * ESP32's I2S driver has a player fixture too: since FastLED 3.10.8 it sends
 * on I2S1 and the player's amplifier keeps I2S0.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateCpp } from '../../src/codegen/cppGenerator'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import { findDeployBlockingErrors } from '../../src/utils/validateGraph'
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

interface Target { profileId: string; fqbn: string; pins: [number, number, number] }
const TARGETS: Record<string, Target> = {
  esp32: { profileId: 'esp32-generic-devkit-38pin', fqbn: 'esp32:esp32:esp32', pins: [16, 17, 18] },
  s3: { profileId: 'espressif-esp32-s3-devkitc-1', fqbn: 'esp32:esp32:esp32s3', pins: [4, 5, 6] },
  c6: { profileId: 'esp32-c6-devkitc-1', fqbn: 'esp32:esp32:esp32c6', pins: [4, 5, 6] },
  h2: { profileId: 'esp32-h2-devkitm-1', fqbn: 'esp32:esp32:esp32h2', pins: [4, 5, 10] },
}

function strips(target: Target): StudioNode[] {
  return target.pins.map((dataPin, index) =>
    node(`out${index}`, 'MatrixOutput', { form: 'strip', ledCount: 120, dataPin, chipset: 'WS2812B', colorOrder: 'GRB' }))
}

function board(target: Target, ledDriver: string): StudioNode {
  return node('board', 'Board', { profileId: target.profileId, ledDriver })
}

function checked(name: string, nodes: StudioNode[], edges: StudioEdge[], source: string): string {
  const errors = findDeployBlockingErrors(nodes, edges)
  if (errors.length > 0) throw new Error(`${name}: the graph is blocked: ${errors.join('; ')}`)
  const selected = /setExclusiveDriver<fl::Bus::\w+, \d+>\(\);/.test(source)
  if (!selected) throw new Error(`${name}: no LED driver selection in the sketch`)
  return source
}

function normal(name: string, target: Target, ledDriver: string): string {
  const outputs = strips(target)
  const nodes = [board(target, ledDriver), node('fill', 'SolidColor', { r: 255, g: 80, b: 0 }), ...outputs]
  const edges = outputs.map((output) => edge(`f-${output.id}`, 'fill', 'frame', output.id, 'frame'))
  return checked(name, nodes, edges, generateCpp(nodes, edges))
}

function pattern(body: StudioNode): GroupRegistry[string] {
  const output = node('go', 'GroupOutput')
  output.data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
  return { nodes: [body, output], edges: [edge('frame', body.id, 'frame', 'go', 'frame')] }
}

function show(name: string, target: Target, ledDriver: string): string {
  const groups = {
    solid: pattern(node('color', 'SolidColor', { r: 0, g: 0, b: 255 })),
    noise: pattern(node('nz', 'Noise', { palette: 'ocean' })),
  } as unknown as GroupRegistry
  const out = node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: target.pins[0], chipset: 'WS2812B', colorOrder: 'GRB' })
  const nodes = [
    board(target, ledDriver),
    node('pc', 'PatternCollection', { patternIds: ['solid', 'noise'] }),
    node('pm', 'PatternSlideshow'),
    out,
  ]
  const edges = [edge('set', 'pc', 'patternset', 'pm', 'patternset'), edge('frame', 'pm', 'frame', 'out', 'frame')]
  return checked(name, nodes, edges, generateShowSketch(nodes, edges, groups))
}

function player(name: string, target: Target, ledDriver: string): string {
  const groups = {
    calm: pattern(node('color', 'SolidColor', { r: 0, g: 40, b: 80 })),
    peak: pattern(node('color', 'SolidColor', { r: 255, g: 40, b: 0 })),
  } as unknown as GroupRegistry
  const out = node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: target.pins[0], chipset: 'WS2812B', colorOrder: 'GRB' })
  const nodes = [
    board(target, ledDriver), node('sd', 'SDCard'), node('amp', 'Amplifier'),
    node('master', 'PatternMaster'), out,
    node('collection', 'PatternCollection', { patternIds: ['calm', 'peak'] }),
  ]
  const edges = [edge('frame', 'master', 'frame', 'out', 'frame'), edge('set', 'collection', 'patternset', 'master', 'patternset')]
  return checked(name, nodes, edges, buildShowPlayer(nodes, edges, groups, {
    patternSet: ['calm', 'peak'], bakedAudio: false, preferredTrack: '', genericPlayer: true,
  }))
}

const fixtures: Record<string, { fqbn: string; build: () => string }> = {
  'esp32-i2s': { fqbn: TARGETS.esp32.fqbn, build: () => normal('esp32-i2s', TARGETS.esp32, 'I2S') },
  'esp32-i2s-show': { fqbn: TARGETS.esp32.fqbn, build: () => show('esp32-i2s-show', TARGETS.esp32, 'I2S') },
  'esp32-i2s-player': { fqbn: TARGETS.esp32.fqbn, build: () => player('esp32-i2s-player', TARGETS.esp32, 'I2S') },
  's3-lcd-clockless': { fqbn: TARGETS.s3.fqbn, build: () => normal('s3-lcd-clockless', TARGETS.s3, 'LCD_CLOCKLESS') },
  's3-lcd-clockless-show': { fqbn: TARGETS.s3.fqbn, build: () => show('s3-lcd-clockless-show', TARGETS.s3, 'LCD_CLOCKLESS') },
  's3-lcd-clockless-player': { fqbn: TARGETS.s3.fqbn, build: () => player('s3-lcd-clockless-player', TARGETS.s3, 'LCD_CLOCKLESS') },
  'c6-rmt': { fqbn: TARGETS.c6.fqbn, build: () => normal('c6-rmt', TARGETS.c6, 'RMT') },
  'h2-rmt': { fqbn: TARGETS.h2.fqbn, build: () => normal('h2-rmt', TARGETS.h2, 'RMT') },
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/led-driver-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { fqbn: string; bytes: number; sha256: string }> = {}
for (const [name, fixture] of Object.entries(fixtures)) {
  const source = fixture.build()
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { fqbn: fixture.fqbn, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(manifest).length} LED driver compile fixtures to ${outputDir}`)
