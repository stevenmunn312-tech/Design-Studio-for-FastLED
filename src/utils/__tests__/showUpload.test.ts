import { describe, expect, it } from 'vitest'
import type { Edge } from '@xyflow/react'
import type { GroupRegistry } from '../../state/graphEvaluator'
import type { StudioNode } from '../../state/graphStore'
import { buildShowPlayer } from '../showUpload'

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
