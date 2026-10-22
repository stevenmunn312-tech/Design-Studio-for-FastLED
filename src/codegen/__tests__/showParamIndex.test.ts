import { describe, expect, it } from 'vitest'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioEdge, StudioNode } from '../../state/graphStore'
import type { ShowFile } from '../../types/showFile'
import { NODE_LIBRARY, libraryDefaults } from '../../state/nodeLibrary'
import { resolveDefaultProperties } from '../../state/nodeDefaults'
import { generatePlayerSketch } from '../playerSketchGenerator'
import { buildShowPlayer } from '../../utils/showUpload'

// A SET_PARAM carries a position in its show's `params` array, invalid names
// included: showStateAt and the binary writer index it that way. The sketch's
// `which` table has to use the same positions, so an invalid name may lose its
// arm but never shift the others. Every fixture reads its named input, as the
// sketch drops a parameter nothing consumes.

function node(id: string, nodeType: string, properties: Record<string, unknown> = {}): StudioNode {
  const definition = NODE_LIBRARY.find((entry) => entry.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: {
      label: definition?.label ?? nodeType, nodeType, category: definition?.category ?? 'output',
      properties: definition ? resolveDefaultProperties(nodeType, { ...libraryDefaults(nodeType), ...properties }) : properties,
      inputs: definition?.inputs ?? [], outputs: definition?.outputs ?? [],
    },
  } as StudioNode
}

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
  ({ id, source, sourceHandle, target, targetHandle }) as StudioEdge

/** A pattern whose brightness is the named float input `name`. */
function gainPattern(name: string) {
  const input = node(name, 'GroupInput', { paramId: name })
  const gain = { ...input, data: { ...input.data, category: 'composite', outputs: [{ id: 'out', label: name, dataType: 'float' }] } } as StudioNode
  return {
    nodes: [gain, node('sc', 'SolidColor', { r: 20, g: 30, b: 40 }), node('bm', 'BrightnessMod'), node('go', 'GroupOutput')],
    edges: [edge('sf', 'sc', 'frame', 'bm', 'frame'), edge('g', name, 'out', 'bm', 'brightness'), edge('bf', 'bm', 'frame', 'go', 'frame')],
  }
}

function renderersReading(...names: string[]) {
  const args = names.map((name) => `, float ${name}`).join('')
  const reads = names.map((name) => `(void)${name};`).join(' ')
  return {
    buffers: [], helpers: [],
    functions: [`void render_p0(uint32_t ms${args}) { (void)ms; ${reads} }`],
    count: 1, params: names,
  }
}

describe('SET_PARAM slot indices', () => {
  it('keeps a valid name at its own index when an earlier name is invalid', () => {
    const ino = generatePlayerSketch({}, renderersReading('gain'), { showParams: ['bad-name', 'gain'] })
    expect(ino).toContain('if (which == 1) { gain = to; }')
    expect(ino).not.toContain('which == 0')
    expect(ino).not.toContain('bad-name')
  })

  it('emits no SET_PARAM arm at all when every name is invalid', () => {
    const ino = generatePlayerSketch({}, renderersReading(), { showParams: ['bad-name'] })
    expect(ino).not.toContain('CMD_SET_PARAM')
  })

  it('scales a slot named speed like SET_SPEED, unless the patterns take the raw multiplier', () => {
    const scaled = generatePlayerSketch({}, renderersReading('speed'), { showParams: ['speed'] })
    expect(scaled).toContain('case CMD_SET_SPEED:      speed = constrain(ev.params[0] * 0.5f, 0.0f, 1.0f); break;')
    expect(scaled).toContain('if (which == 0) { to = constrain(to * 0.5f, 0.0f, 1.0f); speed = to; }')
    const raw = generatePlayerSketch({}, { ...renderersReading('speed'), rawSpeed: true }, { showParams: ['speed'] })
    expect(raw).toContain('case CMD_SET_SPEED:      speed = ev.params[0]; break;')
    expect(raw).toContain('if (which == 0) { speed = to; }')
  })

  it('declares a repeated name once', () => {
    const ino = generatePlayerSketch({}, renderersReading('gain'), { showParams: ['gain', 'gain'], ramps: true })
    expect(ino.match(/float {6}gain = 0\.0f;/g)).toHaveLength(1)
    expect(ino.match(/static ShowRamp rampParam_gain/g)).toHaveLength(1)
    expect(ino).toContain('if (which == 0) {')
    expect(ino).toContain('if (which == 1) {')
  })

  it('threads each uploaded show\'s params through in their original order', () => {
    const groups = { gained: gainPattern('gain'), levelled: gainPattern('level') } as unknown as GroupRegistry
    const nodes = [
      node('library', 'MusicLibrary'),
      node('collection', 'PatternCollection', { patternIds: ['gained', 'levelled'] }),
      node('perf', 'PerformanceGenerator'),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 4, chipset: 'WS2812B', colorOrder: 'GRB' }),
      node('sd', 'SDCard'), node('amp', 'Amplifier'),
    ]
    const edges = [
      edge('music', 'library', 'music', 'perf', 'music'),
      edge('set', 'collection', 'patternset', 'perf', 'patternset'),
      edge('frame', 'perf', 'frame', 'out', 'frame'),
    ]
    const show = (params: string[]): ShowFile => ({
      version: 2, songTitle: 'Track', durationMs: 1000, bpm: 120, params, patternSet: ['gained', 'levelled'],
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
        { t: 0, cmd: 'SET_PARAM', params: { index: params.length - 1, value: 0.5 } },
      ],
    })
    const upload = (shows: ShowFile[]) => buildShowPlayer(nodes, edges, groups, {
      patternSet: ['gained', 'levelled'], bakedAudio: false, preferredTrack: 'Track', shows,
    })

    const sketch = upload([show(['bad-name', 'gain'])])
    expect(sketch).toContain('if (which == 1) { gain = to; }')
    expect(sketch).not.toContain('which == 0')

    // A second show that extends the first keeps the shared slots in place.
    const two = upload([show(['gain']), show(['gain', 'level'])])
    expect(two).toContain('if (which == 0) { gain = to; }')
    expect(two).toContain('if (which == 1) { level = to; }')
  })
})
