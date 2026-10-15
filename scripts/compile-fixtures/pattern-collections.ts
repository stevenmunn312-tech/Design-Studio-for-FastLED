/**
 * Write the D-10 render-buffer fixtures: every bundled pattern, compiled as SD
 * Music Player collections on an ESP32-S3 driving a 16x16 matrix. RAM, not
 * flash, is what a large collection runs out of, so these are the sketches
 * whose `dram0_0_seg` usage shows what buffer pooling saves.
 *
 *   npm run gen:compile-fixtures -- pattern-collections [output-dir]
 *   python scripts/compile-fixtures/compile-matrix.py --only pattern-collections/
 *
 * The four slices are the ones the 2026-10-15 measurement used, so a later
 * run compares like with like.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUNDLED_PATTERNS } from '../../src/state/patterns/bundledPatterns'
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

/** First and last bundled pattern, counted from one. */
const SLICES: [number, number][] = [[1, 40], [41, 60], [61, 80], [81, BUNDLED_PATTERNS.length]]

function collectionPlayer(first: number, last: number): string {
  const patterns = BUNDLED_PATTERNS.slice(first - 1, last)
  const ids = patterns.map((pattern) => pattern.id)
  const groups = Object.fromEntries(patterns.map((pattern) => [pattern.id, pattern.subgraph])) as unknown as GroupRegistry
  const nodes = [
    node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' }),
    node('sd', 'SDCard'), node('amp', 'Amplifier'), node('master', 'PatternMaster'),
    node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' }),
    node('collection', 'PatternCollection', { patternIds: ids }),
  ]
  const edges = [
    edge('frame', 'master', 'frame', 'out', 'frame'),
    edge('set', 'collection', 'patternset', 'master', 'patternset'),
  ]
  return buildShowPlayer(nodes, edges, groups, { patternSet: ids, bakedAudio: false, preferredTrack: '', genericPlayer: true })
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/pattern-collections-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [first, last] of SLICES) {
  const name = `bundled-${first}-${last}`
  const source = collectionPlayer(first, last)
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(manifest).length} pattern-collection compile fixtures to ${outputDir}`)
