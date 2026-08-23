import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMusicStore } from '../musicStore'
import type { MusicEntry } from '../musicStore'
import { useGraphStore, ROOT_GRAPH_ID } from '../graphStore'
import type { SongAnalysis, ShowFile } from '../../types/showFile'
import { saveMusicFile } from '../musicLibraryPersistence'

// A minimal but valid analysis so revertShow can regenerate a show.
const analysis: SongAnalysis = {
  title: 'Test Song',
  durationMs: 4000,
  beats: { timestamps: [500, 1000, 1500, 2000], bpm: 120, confidence: 0.9 },
  energy: [],
  sections: [
    { startMs: 0, endMs: 2000, type: 'verse', energy: 0.5 },
    { startMs: 2000, endMs: 4000, type: 'drop', energy: 0.9 },
  ],
  mood: { energy: 0.7, valence: 0.6, key: 'C major' },
}

const baseShow: ShowFile = {
  version: 1,
  songTitle: 'Test Song',
  durationMs: 4000,
  bpm: 120,
  events: [{ t: 0, cmd: 'SET_PATTERN', params: { name: 'Plasma' } }],
}

function seedEntry(): MusicEntry {
  const entry: MusicEntry = {
    id: 'e1',
    file: new File(['x'], 'test.mp3', { type: 'audio/mpeg' }),
    analysis,
    show: baseShow,
    status: 'done',
  }
  useMusicStore.setState({ entries: [entry] })
  return entry
}

describe('musicStore manual edits', () => {
  beforeEach(() => useMusicStore.setState({ entries: [] }))

  it('updateShow replaces the show and marks the entry edited', () => {
    seedEntry()
    const edited: ShowFile = {
      ...baseShow,
      events: [
        { t: 0, cmd: 'SET_PATTERN', params: { name: 'Fire' } },
        { t: 1000, cmd: 'SET_BRIGHTNESS', params: { value: 80 } },
      ],
    }
    useMusicStore.getState().updateShow('e1', edited)
    const e = useMusicStore.getState().entries[0]
    expect(e.edited).toBe(true)
    expect(e.show?.events).toHaveLength(2)
    expect(e.show?.events[0].params.name).toBe('Fire')
  })

  it('revertShow regenerates from analysis and clears the edited flag', () => {
    seedEntry()
    useMusicStore.getState().updateShow('e1', { ...baseShow, events: [] })
    expect(useMusicStore.getState().entries[0].edited).toBe(true)

    useMusicStore.getState().revertShow('e1')
    const e = useMusicStore.getState().entries[0]
    expect(e.edited).toBe(false)
    // The generator always emits section-level pattern events, so the reverted
    // show is non-empty again.
    expect(e.show?.events.length).toBeGreaterThan(0)
  })

  it('revertShow is a no-op without an analysis', () => {
    useMusicStore.setState({
      entries: [{ id: 'e2', file: new File(['x'], 'x.mp3'), analysis: null, show: baseShow, status: 'done' }],
    })
    useMusicStore.getState().revertShow('e2')
    expect(useMusicStore.getState().entries[0].show).toBe(baseShow)
  })
})

describe('musicStore — wired TransitionSet', () => {
  beforeEach(() => {
    useMusicStore.setState({ entries: [] })
    useGraphStore.setState({
      nodes: [], edges: [], selectedNodeId: null, clipboard: null,
      activeGraphId: ROOT_GRAPH_ID,
      graphs: { [ROOT_GRAPH_ID]: { id: ROOT_GRAPH_ID, name: 'Main' } },
      graphData: {},
    })
  })

  it('mixes a wired TransitionSet pool into the regenerated show', () => {
    seedEntry()
    useGraphStore.setState({
      nodes: [
        { id: 'gen', type: 'studioNode', position: { x: 0, y: 0 },
          data: { label: 'Performance Generator', nodeType: 'PerformanceGenerator', category: 'hardware', properties: {} } },
        { id: 'ts', type: 'studioNode', position: { x: 0, y: 0 },
          data: { label: 'Transitions', nodeType: 'TransitionSet', category: 'composite', properties: { transitions: ['iris', 'zoom'] } } },
      ] as unknown as ReturnType<typeof useGraphStore.getState>['nodes'],
      edges: [
        { id: 'e1', source: 'ts', sourceHandle: 'transitions', target: 'gen', targetHandle: 'transitions' },
      ] as unknown as ReturnType<typeof useGraphStore.getState>['edges'],
    })

    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      useMusicStore.getState().revertShow('e1')
      const show = useMusicStore.getState().entries[0].show!
      const types = show.events.filter((e) => e.cmd === 'TRANSITION').map((e) => e.params.type)
      expect(types.length).toBeGreaterThan(0)
      expect(types.every((t) => t === 'iris')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('falls back to the rule-based pool when nothing is wired', () => {
    seedEntry()
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      useMusicStore.getState().revertShow('e1')
      const show = useMusicStore.getState().entries[0].show!
      const types = show.events.filter((e) => e.cmd === 'TRANSITION').map((e) => e.params.type)
      expect(types.every((t) => ['crossfade', 'wipe', 'dissolve'].includes(t as string))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('musicStore project persistence', () => {
  beforeEach(() => useMusicStore.setState({ entries: [] }))

  it('restores the analysed entry and its audio file from a workspace manifest', async () => {
    const file = new File(['saved audio'], 'saved.mp3', { type: 'audio/mpeg', lastModified: 456 })
    await saveMusicFile('saved-song', file)

    useGraphStore.getState().loadGraph([], [], {
      musicLibrary: [{
        id: 'saved-song',
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        analysis,
        show: baseShow,
        status: 'done',
      }],
    })

    await vi.waitFor(() => expect(useMusicStore.getState().entries).toHaveLength(1))
    const restored = useMusicStore.getState().entries[0]
    expect(restored.status).toBe('done')
    expect(restored.analysis).toEqual(analysis)
    expect(restored.show).toEqual(baseShow)
    expect(restored.file.name).toBe('saved.mp3')
    expect(await restored.file.text()).toBe('saved audio')
  })

  it('clears the previous library when a workspace has no music manifest', async () => {
    seedEntry()
    useGraphStore.getState().loadGraph([], [])
    await vi.waitFor(() => expect(useMusicStore.getState().entries).toEqual([]))
  })
})
