/**
 * D-11 show-sequencing fixtures: one weighted and tagged Music Player, the
 * same player paced by Dwells & Bursts alone, one sequenced Slideshow with a
 * Restart pattern and a tag step, one sequenced Music Player
 * whose holds count beats, one performance show with ramps and a named
 * input, and one performance show whose pattern reads the baked spectrum.
 *
 *   npm run gen:compile-fixtures -- show-sequencing [output-dir]
 *   python scripts/compile-fixtures/compile-matrix.py --only show-sequencing/
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateShowSketch } from '../../src/codegen/showGenerator'
import { buildShowPlayer } from '../../src/utils/showUpload'
import { NODE_LIBRARY, libraryDefaults } from '../../src/state/nodeLibrary'
import { resolveDefaultProperties } from '../../src/state/nodeDefaults'
import type { GroupRegistry } from '../../src/state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../src/state/graphStore'
import type { ShowFile } from '../../src/types/showFile'

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}, inputs: unknown[] = [], outputs: unknown[] = []): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: resolveDefaultProperties(nodeType, { ...libraryDefaults(nodeType), ...properties }),
      inputs: inputs.length > 0 ? inputs : (definition?.inputs ?? []),
      outputs: outputs.length > 0 ? outputs : (definition?.outputs ?? []),
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

const board = node('board', 'Board', { profileId: 'espressif-esp32-s3-devkitc-1' })
const led = node('out', 'MatrixOutput', { form: 'matrix', width: 16, height: 16, dataPin: 5, chipset: 'WS2812B', colorOrder: 'GRB' })

function pattern(id: string, body: StudioNode): GroupRegistry[string] {
  const output = node('go', 'GroupOutput')
  output.data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
  return {
    nodes: [body, output],
    edges: [edge('frame', body.id, 'frame', 'go', 'frame')],
  }
}

function weightedPlayer(timing: Record<string, unknown> = {}): string {
  const groups = {
    calm: pattern('calm', node('color', 'SolidColor', { r: 0, g: 40, b: 80 })),
    peak: pattern('peak', node('color', 'SolidColor', { r: 255, g: 40, b: 0 })),
  } as unknown as GroupRegistry
  const nodes = [
    board, node('sd', 'SDCard'), node('amp', 'Amplifier'),
    node('master', 'PatternMaster', { order: 'Random', ...timing }),
    led,
    node('collection', 'PatternCollection', {
      patternIds: ['calm', 'peak'],
      patternWeights: { peak: 4 },
      patternEnergy: { calm: ['calm'], peak: ['peak'] },
    }),
  ]
  const edges = [
    edge('frame', 'master', 'frame', 'out', 'frame'),
    edge('set', 'collection', 'patternset', 'master', 'patternset'),
  ]
  return buildShowPlayer(nodes, edges, groups, {
    patternSet: ['calm', 'peak'], bakedAudio: false, preferredTrack: '', genericPlayer: true,
  })
}

function sequencedSlideshow(): string {
  const solid = pattern('solid', node('color', 'SolidColor', { r: 0, g: 0, b: 255 }))
  const noise = pattern('noise', node('nz', 'Noise', { palette: 'ocean' }))
  const groups = { solid, noise } as unknown as GroupRegistry
  return generateShowSketch(
    [
      board,
      node('pc', 'PatternCollection', {
        patternIds: ['solid', 'noise'],
        patternEntry: { solid: 'resume' },
      }),
      node('pm', 'PatternSlideshow', {
        order: 'Sequence',
        sequence: [
          { patternId: 'solid', hold: 4, transition: 'crossfade', transitionSec: 1 },
          { patternId: 'noise', hold: 6, transition: 'wipe', transitionSec: 0.5 },
          { hold: 3, transition: 'crossfade', transitionSec: 1 },
        ],
      }),
      led,
    ],
    [edge('set', 'pc', 'patternset', 'pm', 'patternset'), edge('frame', 'pm', 'frame', 'out', 'frame')],
    groups,
  )
}

function sequencedPlayer(): string {
  const groups = {
    calm: pattern('calm', node('color', 'SolidColor', { r: 0, g: 40, b: 80 })),
    peak: pattern('peak', node('color', 'SolidColor', { r: 255, g: 40, b: 0 })),
  } as unknown as GroupRegistry
  const nodes = [
    board, node('sd', 'SDCard'), node('amp', 'Amplifier'),
    node('master', 'PatternMaster', {
      order: 'Sequence',
      beatTransitions: true,
      sequence: [
        { patternId: 'calm', hold: 8, transition: 'crossfade', transitionSec: 1 },
        { sections: ['drop'], energy: ['peak'], hold: 16, transition: 'wipe', transitionSec: 0.5 },
      ],
    }),
    led,
    node('collection', 'PatternCollection', {
      patternIds: ['calm', 'peak'],
      patternWeights: { peak: 4 },
      patternEnergy: { calm: ['calm'], peak: ['peak'] },
      patternSections: { peak: ['drop'] },
    }),
  ]
  const edges = [
    edge('frame', 'master', 'frame', 'out', 'frame'),
    edge('set', 'collection', 'patternset', 'master', 'patternset'),
  ]
  return buildShowPlayer(nodes, edges, groups, {
    patternSet: ['calm', 'peak'], bakedAudio: false, preferredTrack: '', genericPlayer: true,
  })
}

function rampedShow(): string {
  const input = node('in', 'GroupInput', { paramId: 'glow' }, [], [{ id: 'out', dataType: 'float' }])
  const pulse = node('bp', 'BassPulse')
  const output = node('go', 'GroupOutput')
  output.data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
  const groups = {
    glow: {
      nodes: [input, pulse, output],
      edges: [
        edge('bass', 'in', 'out', 'bp', 'bass'),
        edge('frame', 'bp', 'frame', 'go', 'frame'),
      ],
    },
  } as unknown as GroupRegistry
  const show: ShowFile = {
    version: 2,
    songTitle: 'Ramp',
    durationMs: 10000,
    bpm: 120,
    patternSet: ['glow'],
    params: ['glow'],
    events: [
      { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
      { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 0 } },
      { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 180, rampMs: 4000 } },
      { t: 500, cmd: 'SET_PARAM', params: { index: 0, value: 0.8, rampMs: 1000 } },
    ],
  }
  const nodes = [
    board, node('sd', 'SDCard'), node('amp', 'Amplifier'),
    node('pg', 'PerformanceGenerator', { useGroupInputs: true }),
    led,
    node('collection', 'PatternCollection', { patternIds: ['glow'] }),
  ]
  const edges = [
    edge('frame', 'pg', 'frame', 'out', 'frame'),
    edge('set', 'collection', 'patternset', 'pg', 'patternset'),
  ]
  return buildShowPlayer(nodes, edges, groups, {
    patternSet: ['glow'], bakedAudio: false, preferredTrack: 'Ramp', genericPlayer: false, shows: [show],
  })
}

// A performance show whose pattern reads FFT bins, so the player loads the
// baked equalizer block from the AENV trailer and fills _audioSpectrum from it.
function bakedSpectrumShow(): string {
  const input = node('in', 'GroupInput', { paramId: 'audio' }, [], [{ id: 'out', dataType: 'audio' }])
  const fft = node('fft', 'FFTAnalyzer', {}, [{ id: 'audio', dataType: 'audio' }], [{ id: 'bass', dataType: 'float' }])
  const pulse = node('bp', 'BassPulse')
  const output = node('go', 'GroupOutput')
  output.data.inputs = [{ id: 'frame', label: 'Frame', dataType: 'frame' }]
  const groups = {
    reactive: {
      nodes: [input, fft, pulse, output],
      edges: [
        edge('audio', 'in', 'out', 'fft', 'audio'),
        edge('bass', 'fft', 'bass', 'bp', 'bass'),
        edge('frame', 'bp', 'frame', 'go', 'frame'),
      ],
    },
  } as unknown as GroupRegistry
  const nodes = [
    board, node('sd', 'SDCard'), node('amp', 'Amplifier'),
    node('pg', 'PerformanceGenerator'),
    led,
    node('collection', 'PatternCollection', { patternIds: ['reactive'] }),
  ]
  const edges = [
    edge('frame', 'pg', 'frame', 'out', 'frame'),
    edge('set', 'collection', 'patternset', 'pg', 'patternset'),
  ]
  return buildShowPlayer(nodes, edges, groups, {
    patternSet: ['reactive'], bakedAudio: true, preferredTrack: 'Song', genericPlayer: false,
  })
}

const sketches: Record<string, () => string> = {
  'weighted-player': () => weightedPlayer(),
  // Energy tags without Energy Pacing need their own tracker.
  'tagged-dwells-player': () => weightedPlayer({ dwellsAndBursts: true, energyPacing: false }),
  'sequenced-slideshow': sequencedSlideshow,
  'sequenced-player': sequencedPlayer,
  'ramped-show': rampedShow,
  'baked-spectrum-show': bakedSpectrumShow,
}

const outputDir = resolve(process.argv[2] ?? 'artifacts/show-sequencing-compile')
mkdirSync(outputDir, { recursive: true })
for (const file of readdirSync(outputDir)) if (file.endsWith('.ino')) rmSync(resolve(outputDir, file))
const manifest: Record<string, { bytes: number; sha256: string }> = {}
for (const [name, build] of Object.entries(sketches)) {
  const source = build()
  writeFileSync(resolve(outputDir, `${name}.ino`), source, 'utf8')
  manifest[name] = { bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }
}
writeFileSync(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`wrote ${Object.keys(manifest).length} show-sequencing compile fixtures to ${outputDir}`)
