import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import PerformanceGeneratorBody from '../PerformanceGeneratorBody'
import { useMusicStore, type MusicEntry } from '../../../../state/player/musicStore'
import { waitForMusicLibraryRestore } from '../../../../state/player/musicLibraryPersistence'
import { useShowPlayback } from '../../../../state/player/showPlayback'
import { usePlayerTransport } from '../../../../state/player/playerTransport'
import { useGraphStore } from '../../../../state/graphStore'
import type { ShowFile } from '../../../../types/showFile'

const show: ShowFile = {
  version: 1,
  songTitle: 'Song',
  durationMs: 4000,
  bpm: 120,
  events: [{ t: 0, cmd: 'SET_PATTERN', params: { name: 'SolidColor' } }],
}

const entry: MusicEntry = {
  id: 'track-1',
  file: new File([new Uint8Array([0])], 'song.mp3', { type: 'audio/mpeg' }),
  analysis: null,
  show,
  status: 'done',
}

/*
 * The main LED preview is the only place a show is drawn. The body used to
 * carry a "Show in main LED preview" switch and, with it off, a canvas of its
 * own; a show could then play in the node while the LED output it names stayed
 * black.
 */
describe('PerformanceGeneratorBody', () => {
  beforeEach(async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:song', revokeObjectURL: () => undefined }))
    useGraphStore.getState().loadGraph([], [])
    await waitForMusicLibraryRestore()
    useMusicStore.setState({ entries: [entry] })
  })
  afterEach(() => {
    cleanup()
    useMusicStore.setState({ entries: [] })
    vi.unstubAllGlobals()
  })

  it('hands the selected show to the main LED preview, with no switch and no canvas of its own', async () => {
    const { container, unmount } = render(<PerformanceGeneratorBody nodeId="perf" />)

    expect(await screen.findByRole('button', { name: /song\.mp3/ })).toBeTruthy()
    expect(useShowPlayback.getState()).toMatchObject({ nodeId: 'perf', show, posMs: 0, playing: false })
    // Its transport is the player under that preview.
    expect(usePlayerTransport.getState().transport?.nodeId).toBe('perf')

    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.querySelector('canvas')).toBeNull()
    expect(screen.queryByText(/main LED preview/i)).toBeNull()
    expect(screen.queryByText(/under the LED preview/i)).toBeNull()

    unmount()
    expect(useShowPlayback.getState()).toMatchObject({ nodeId: null, show: null })
  })

  it('plays in the main preview for a save that still carries the retired switch turned off', async () => {
    useGraphStore.getState().loadGraph([{
      id: 'perf',
      type: 'studioNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Performance Generator', nodeType: 'PerformanceGenerator', category: 'show',
        properties: { showInMainPreview: false }, inputs: [], outputs: [],
      },
    } as never], [])
    // Loading a graph restores its (empty) music library; the song comes after.
    await waitForMusicLibraryRestore()
    useMusicStore.setState({ entries: [entry] })

    render(<PerformanceGeneratorBody nodeId="perf" />)

    expect(await screen.findByRole('button', { name: /song\.mp3/ })).toBeTruthy()
    expect(useShowPlayback.getState()).toMatchObject({ nodeId: 'perf', show })
  })
})
