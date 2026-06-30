import { describe, it, expect, beforeEach } from 'vitest'
import { useMusicStore } from '../musicStore'
import type { MusicEntry } from '../musicStore'
import type { SongAnalysis, ShowFile } from '../../types/showFile'

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
