import { describe, expect, it, vi } from 'vitest'
import { applyShowPlaybackSignal } from '../showPlaybackSignal'
import type { ShowFile } from '../../../types/showFile'
import { usePerformanceBakeStore } from '../../../state/performanceBakeStore'

vi.mock('../../../state/audioStore', () => ({
  useAudioStore: { getState: () => ({ active: false, bass: 0, mids: 0, treble: 0, beat: false, bpm: 120, spectrum: Array(16).fill(0) }) },
}))

const litShow: ShowFile = {
  version: 1,
  songTitle: 'Lit',
  durationMs: 1000,
  bpm: 120,
  events: [
    { t: 0, cmd: 'SET_PATTERN', params: { name: 'SolidColor' } },
    { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
  ],
}

// PerformanceGenerator has no graph-wired `frame` port (see nodeLibrary.ts) —
// a playing show is opted into the main preview explicitly via the
// `showInMainPreview` node property (PerformanceGeneratorBody → showPlayback.ts),
// so this only ever depends on the playback state, not the graph.
describe('applyShowPlaybackSignal', () => {
  it('prefers a baked preview frame over live rendering when one exists for the generator', () => {
    usePerformanceBakeStore.getState().startBake('pg', {
      entryId: 'track-1',
      durationMs: 1000,
      width: 1,
      height: 1,
      fps: 1,
    })
    usePerformanceBakeStore.getState().finishBake('pg', [new Uint8Array([9, 8, 7])])

    const frame = applyShowPlaybackSignal(
      [[{ r: 0, g: 0, b: 0 }]],
      { nodeId: 'pg', show: litShow, posMs: 0, useGroupInputs: false },
      1,
      1,
      {},
    )

    expect(frame[0][0]).toEqual({ r: 9, g: 8, b: 7 })
    usePerformanceBakeStore.getState().clearBake('pg')
  })

  it('renders the live show frame when a generator is actively playing', () => {
    const frame = applyShowPlaybackSignal(
      [[{ r: 0, g: 0, b: 0 }]],
      { nodeId: 'pg', show: litShow, posMs: 0, useGroupInputs: false },
      1,
      1,
      {},
    )

    const rendered = frame[0][0]
    expect(rendered.r + rendered.g + rendered.b).toBeGreaterThan(0)
  })

  it('ignores baked collection frames and keeps Formula nodes disabled while untrusted', () => {
    const collectionShow: ShowFile = {
      version: 2,
      songTitle: 'Untrusted collection',
      durationMs: 1000,
      bpm: 120,
      patternSet: ['formulaGroup'],
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { index: 0 } },
        { t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 255 } },
      ],
    }
    const groups = {
      formulaGroup: {
        nodes: [
          {
            id: 'formula', type: 'studioNode', position: { x: 0, y: 0 },
            data: {
              label: 'Custom Formula', nodeType: 'CustomFormula', category: 'pattern',
              properties: { formula: '1', palette: 'rainbow' }, inputs: [],
              outputs: [{ id: 'frame', dataType: 'frame' }],
            },
          },
          {
            id: 'go', type: 'studioNode', position: { x: 0, y: 0 },
            data: {
              label: 'Group Output', nodeType: 'GroupOutput', category: 'pattern',
              properties: {}, inputs: [{ id: 'frame', dataType: 'frame' }], outputs: [],
            },
          },
        ],
        edges: [{ id: 'ie', source: 'formula', sourceHandle: 'frame', target: 'go', targetHandle: 'frame' }],
      },
    } as unknown as Parameters<typeof applyShowPlaybackSignal>[4]

    usePerformanceBakeStore.getState().startBake('pg-untrusted', {
      entryId: 'track-2', durationMs: 1000, width: 1, height: 1, fps: 1,
    })
    usePerformanceBakeStore.getState().finishBake('pg-untrusted', [new Uint8Array([255, 0, 0])])

    const frame = applyShowPlaybackSignal(
      [[{ r: 1, g: 2, b: 3 }]],
      { nodeId: 'pg-untrusted', show: collectionShow, posMs: 0, useGroupInputs: false },
      1,
      1,
      groups,
      false,
    )

    expect(frame[0][0]).toEqual({ r: 0, g: 0, b: 0 })
    usePerformanceBakeStore.getState().clearBake('pg-untrusted')
  })

  it('leaves the original frame untouched when no generator is playing', () => {
    const original = [[{ r: 1, g: 2, b: 3 }]]

    const frame = applyShowPlaybackSignal(
      original,
      { nodeId: null, show: null, posMs: 0, useGroupInputs: false },
      1,
      1,
      {},
    )

    expect(frame).toBe(original)
  })
})
