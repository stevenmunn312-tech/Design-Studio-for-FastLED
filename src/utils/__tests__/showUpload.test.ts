import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioNode } from '../../state/graphStore'
import { buildShowPayload, buildShowPlayer, buildShowPlayerForMeasurement, showPackagingIssues } from '../showUpload'
import type { MusicEntry } from '../../state/musicStore'
import type { ShowFile } from '../../types/showFile'

function node(
  id: string,
  nodeType: string,
  properties: Record<string, unknown> = {},
  inputs: Array<{ id: string; dataType?: string }> = [],
  outputs: Array<{ id: string; dataType?: string }> = [],
): StudioNode {
  return {
    id,
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category: 'pattern', properties, inputs, outputs },
  } as StudioNode
}

describe('buildShowPlayer', () => {
  it('generates from the selected engine in a mixed graph, not the first engine in node order', () => {
    const nodes = [
      node('disconnected-music', 'PatternMaster'),
      node('unrelated-output', 'MatrixOutput', { width: 4, height: 4, dataPin: 5 }),
      node('performance', 'PerformanceGenerator'),
      node('show-output', 'MatrixOutput', { width: 8, height: 8, dataPin: 17 }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier'),
    ]
    const edges = [
      { id: 'show-led', source: 'performance', sourceHandle: 'frame', target: 'show-output', targetHandle: 'frame' },
    ] as Edge[]

    const sketch = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: true, preferredTrack: '', genericPlayer: false,
    })

    expect(sketch).toContain('#define LED_DATA_PIN  17')
    expect(sketch).not.toContain('#define LED_DATA_PIN  5')
  })

  it('takes the selected performance engine collection in a mixed graph', () => {
    const groups = {
      stale: {
        nodes: [node('stale-color', 'SolidColor', { r: 255, g: 0, b: 0 }), node('stale-out', 'GroupOutput')],
        edges: [{ id: 'stale-frame', source: 'stale-color', sourceHandle: 'frame', target: 'stale-out', targetHandle: 'frame' }],
      },
      selected: {
        nodes: [node('selected-color', 'SolidColor', { r: 0, g: 0, b: 255 }), node('selected-out', 'GroupOutput')],
        edges: [{ id: 'selected-frame', source: 'selected-color', sourceHandle: 'frame', target: 'selected-out', targetHandle: 'frame' }],
      },
    } as GroupRegistry
    const nodes = [
      node('stray-player', 'PatternMaster'),
      node('stale-collection', 'PatternCollection', { patternIds: ['stale'] }),
      node('performance', 'PerformanceGenerator'),
      node('selected-collection', 'PatternCollection', { patternIds: ['selected'] }),
      node('show-output', 'MatrixOutput', { width: 8, height: 8, dataPin: 17 }),
      node('sd', 'SDCard'),
    ]
    const edges = [
      { id: 'stale-patterns', source: 'stale-collection', sourceHandle: 'patternset', target: 'stray-player', targetHandle: 'patternset' },
      { id: 'selected-patterns', source: 'selected-collection', sourceHandle: 'patternset', target: 'performance', targetHandle: 'patternset' },
      { id: 'show-led', source: 'performance', sourceHandle: 'frame', target: 'show-output', targetHandle: 'frame' },
    ] as Edge[]

    const sketch = buildShowPlayerForMeasurement(nodes, edges, groups)
    expect(sketch).toContain('CRGB(0, 0, 255)')
    expect(sketch).not.toContain('CRGB(255, 0, 0)')
  })

  it('routes controls from the selected Music Player in a mixed graph', () => {
    const nodes = [
      node('stray-player', 'PatternMaster'),
      node('stray-controls', 'PlayerControls', { controls: ['playPause'] }),
      node('stray-button', 'ButtonInput', { pin: 12, pullup: false }),
      node('selected-player', 'PatternMaster'),
      node('selected-controls', 'PlayerControls', { controls: ['playPause'] }),
      node('selected-button', 'ButtonInput', { pin: 13, pullup: false }),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 17 }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier'),
    ]
    const edges = [
      { id: 'stray-button-controls', source: 'stray-button', sourceHandle: 'pressed', target: 'stray-controls', targetHandle: 'playPause' },
      { id: 'stray-controls-player', source: 'stray-controls', sourceHandle: 'controls', target: 'stray-player', targetHandle: 'controls' },
      { id: 'selected-button-controls', source: 'selected-button', sourceHandle: 'pressed', target: 'selected-controls', targetHandle: 'playPause' },
      { id: 'selected-controls-player', source: 'selected-controls', sourceHandle: 'controls', target: 'selected-player', targetHandle: 'controls' },
      { id: 'selected-frame', source: 'selected-player', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ] as Edge[]

    const sketch = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: false, preferredTrack: '', genericPlayer: true,
    })
    expect(sketch).toContain('pinMode(13, INPUT);')
    expect(sketch).not.toContain('pinMode(12, INPUT);')
  })

  it('passes the Player Controls wiring into the generated SD player', () => {
    const nodes = [
      node('player', 'PatternMaster'),
      node('controls', 'PlayerControls', {
        debounceMs: 55, volumeStep: 0.06, brightnessStep: 0.07,
        repeatDelayMs: 475, repeatIntervalMs: 135,
      }),
      node('pause', 'ButtonInput', { pin: 12, pullup: false }),
    ]
    const edges = [
      { id: 'controls-player', source: 'controls', sourceHandle: 'controls', target: 'player', targetHandle: 'controls' },
      { id: 'pause-controls', source: 'pause', sourceHandle: 'pressed', target: 'controls', targetHandle: 'playPause' },
    ] as Edge[]

    const sketch = buildShowPlayer(nodes, edges, {}, {
      patternSet: [], bakedAudio: false, preferredTrack: '', genericPlayer: true,
    })

    expect(sketch).toContain('pinMode(12, INPUT);')
    expect(sketch).toContain('digitalRead(12) == HIGH')
    expect(sketch).toContain('.update(n_pause_pressed, _pcNow_controls, false, 55u, 475u, 135u)')
    expect(sketch).toContain('audio.pauseResume()')
  })

  it('builds an unpaired-track Music Player for a PatternMaster collection', () => {
    const groups = {
      solid: {
        nodes: [node('color', 'SolidColor', { r: 12, g: 34, b: 56 }), node('out', 'GroupOutput')],
        edges: [{ id: 'color-out', source: 'color', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' }],
      },
    } as GroupRegistry
    const nodes = [
      node('player', 'PatternMaster'),
      node('collection', 'PatternCollection', { patternIds: ['solid'] }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier', { model: 'MAX98357A' }),
      node('led', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
    ]
    const edges = [
      { id: 'collection-player', source: 'collection', sourceHandle: 'patternset', target: 'player', targetHandle: 'patternset' },
      { id: 'player-led', source: 'player', sourceHandle: 'frame', target: 'led', targetHandle: 'frame' },
    ] as Edge[]

    const sketch = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['solid'],
      bakedAudio: false,
      preferredTrack: '',
      genericPlayer: true,
    })

    expect(sketch).toContain('static const bool GENERIC_PLAYER = true;')
    expect(sketch).toContain('Playing (generic)')
    // An unpaired player plays whatever is on the card, so it needs the walk
    // rather than a flat listing, and it has to say so when it finds nothing.
    expect(sketch).toContain('musicTrackAt(')
    expect(sketch).toContain('No playable MP3 found on the card')
    expect(sketch).toContain('musicDumpCard();')
    // Solid Color requests no audio analysis; fading it from missing band
    // levels used to emit uncompilable C++ (or would keep the output black).
    expect(sketch).not.toContain('audioFadeTarget')
    expect(sketch).not.toContain('_audioBass')
    expect(sketch).toContain('void render_p0(uint32_t ms)')
  })

  it('compiles collection audio against the decoder tap even without a baked envelope', () => {
    const groups = {
      reactive: {
        nodes: [
          node('audio-in', 'GroupInput', { paramId: 'audio' }, [], [{ id: 'out', dataType: 'audio' }]),
          node('fft', 'FFTAnalyzer', {}, [{ id: 'audio', dataType: 'audio' }], [{ id: 'bass', dataType: 'float' }]),
          node('pulse', 'BassPulse', {}, [{ id: 'bass', dataType: 'float' }], [{ id: 'frame', dataType: 'frame' }]),
          node('out', 'GroupOutput', {}, [{ id: 'frame', dataType: 'frame' }]),
        ],
        edges: [
          { id: 'audio-fft', source: 'audio-in', sourceHandle: 'out', target: 'fft', targetHandle: 'audio' },
          { id: 'fft-pulse', source: 'fft', sourceHandle: 'bass', target: 'pulse', targetHandle: 'bass' },
          { id: 'pulse-out', source: 'pulse', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
        ],
      },
    } as GroupRegistry
    const nodes = [
      node('performance', 'PerformanceGenerator'),
      node('led', 'MatrixOutput', { width: 8, height: 8, dataPin: 5 }),
      node('sd', 'SDCard'),
    ]
    const edges = [
      { id: 'show-led', source: 'performance', sourceHandle: 'frame', target: 'led', targetHandle: 'frame' },
    ] as Edge[]

    const sketch = buildShowPlayer(nodes, edges, groups, {
      patternSet: ['reactive'],
      bakedAudio: false,
      preferredTrack: 'Decoder Tap',
    })

    expect(sketch).toContain('void audio_process_i2s(int16_t* outBuff, uint16_t validSamples')
    expect(sketch).toContain('_sum += _audioSpectrum[_i];')
    expect(sketch).toContain('_audioBass = _audioMids = _audioTreble = 0.0f;')
    expect(sketch).not.toContain('uint8_t*  audioEnv')
  })

  it('does not link the decoder analyzer for a collection that does not use audio', () => {
    const groups = {
      solid: {
        nodes: [
          node('color', 'SolidColor', { r: 12, g: 34, b: 56 }),
          node('out', 'GroupOutput'),
        ],
        edges: [
          { id: 'color-out', source: 'color', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
        ],
      },
    } as GroupRegistry

    const sketch = buildShowPlayer([], [], groups, {
      patternSet: ['solid'],
      bakedAudio: false,
      preferredTrack: 'No Audio',
    })

    expect(sketch).toContain('void render_p0(uint32_t ms)')
    expect(sketch).not.toContain('void audio_process_i2s(')
    expect(sketch).not.toContain('fl::audio::Processor')
  })
})

/*
 * A show picks its patterns by position in the collection it was generated
 * from, and the player compiles one pattern table from the first ready show.
 * So a collection edited afterwards does not break the export — it writes a
 * card that plays the wrong patterns in perfect time with the music, which
 * reads as a broken feature rather than a stale file.
 */
describe('packaging a drifted show', () => {
  const showFile = (patternSet?: string[]): ShowFile => ({
    version: patternSet ? 2 : 1, songTitle: 'Track', durationMs: 1000, bpm: 120, events: [],
    ...(patternSet ? { patternSet } : {}),
  } as ShowFile)

  const entry = (patternSet?: string[], edited = false): MusicEntry => ({
    id: 'song', file: new File([''], 'track.mp3'), status: 'done',
    analysis: {} as never, show: showFile(patternSet), edited,
  } as unknown as MusicEntry)

  const graph = (patternIds: string[]) => ({
    nodes: [
      node('performance', 'PerformanceGenerator', {}, [{ id: 'patternset', dataType: 'patternset' }]),
      node('collection', 'PatternCollection', { patternIds }, [], [{ id: 'patternset', dataType: 'patternset' }]),
      node('out', 'MatrixOutput', { width: 8, height: 8, dataPin: 17 }),
      node('sd', 'SDCard'),
      node('amp', 'Amplifier'),
    ],
    edges: [
      { id: 'set', source: 'collection', sourceHandle: 'patternset', target: 'performance', targetHandle: 'patternset' },
      { id: 'led', source: 'performance', sourceHandle: 'frame', target: 'out', targetHandle: 'frame' },
    ] as Edge[],
  })

  const groups: GroupRegistry = { a: { nodes: [], edges: [] }, b: { nodes: [], edges: [] } }

  it('packages a show that still matches its collection', () => {
    const { nodes, edges } = graph(['a', 'b'])
    expect(showPackagingIssues(nodes, edges, [entry(['a', 'b'])], groups)).toEqual([])
    expect(buildShowPayload(nodes, edges, [entry(['a', 'b'])], groups)).not.toBeNull()
  })

  it('refuses one whose collection was reordered underneath it', () => {
    const { nodes, edges } = graph(['b', 'a'])
    const issues = showPackagingIssues(nodes, edges, [entry(['a', 'b'])], groups)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('picks patterns by position')
    expect(buildShowPayload(nodes, edges, [entry(['a', 'b'])], groups)).toBeNull()
  })

  it('refuses one built from a pattern group since deleted', () => {
    const { nodes, edges } = graph(['a', 'gone'])
    const issues = showPackagingIssues(nodes, edges, [entry(['a', 'gone'])], groups)
    expect(issues[0].kind).toBe('missing-group')
    expect(buildShowPayload(nodes, edges, [entry(['a', 'gone'])], groups)).toBeNull()
  })
})
