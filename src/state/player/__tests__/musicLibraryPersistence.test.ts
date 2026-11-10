import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isMusicLibraryRestoring,
  registerMusicLibraryPersistence,
  restoreMusicLibrary,
  waitForMusicLibraryRestore,
  type PersistedMusicEntry,
} from '../musicLibraryPersistence'

function entry(id: string): PersistedMusicEntry {
  return {
    id,
    name: `${id}.mp3`,
    type: 'audio/mpeg',
    size: 1,
    lastModified: 0,
    analysis: null,
    show: null,
    status: 'pending',
  }
}

describe('music library restoration barrier', () => {
  it('waits for a newer restore that starts while an older one is pending', async () => {
    const releases = new Map<string, () => void>()
    registerMusicLibraryPersistence(
      () => [],
      ([item]) => new Promise<void>((resolve) => { releases.set(item.id, resolve) }),
    )

    restoreMusicLibrary([entry('first')])
    const settled = waitForMusicLibraryRestore()
    restoreMusicLibrary([entry('second')])

    expect(isMusicLibraryRestoring()).toBe(true)
    releases.get('first')?.()
    await Promise.resolve()
    expect(isMusicLibraryRestoring()).toBe(true)

    releases.get('second')?.()
    await settled
    expect(isMusicLibraryRestoring()).toBe(false)
  })
})

/*
 * The demo track ships with the app. Stored like a dropped song it took a new
 * id, and so another copy of the MP3 in IndexedDB, every time a show starter
 * was opened. It has one id now and is read from the bundle.
 */
describe('the demo track in the music file store', () => {
  const open = vi.fn()
  const track = new Blob([new Uint8Array([0xff, 0xfb, 0x90, 0x00])], { type: 'audio/mpeg' })

  beforeEach(() => {
    // A fresh module, so no earlier test's file is in its memory cache.
    vi.resetModules()
    open.mockReset()
    vi.stubGlobal('indexedDB', { open })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, blob: async () => track }) as Response))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is never written to IndexedDB', async () => {
    const { DEMO_MUSIC_ENTRY_ID, saveMusicFile, loadMusicFile } = await import('../musicLibraryPersistence')
    await saveMusicFile(DEMO_MUSIC_ENTRY_ID, new File([track], 'Ethereal Pulse.mp3'))
    expect(open).not.toHaveBeenCalled()
    // Still there for a project switch in the same session.
    expect((await loadMusicFile(DEMO_MUSIC_ENTRY_ID))?.size).toBe(4)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is read from the bundle when a saved project is reopened', async () => {
    const { DEMO_MUSIC_ENTRY_ID, loadMusicFile } = await import('../musicLibraryPersistence')
    expect(await loadMusicFile(DEMO_MUSIC_ENTRY_ID)).toBe(track)
    expect(await loadMusicFile(DEMO_MUSIC_ENTRY_ID)).toBe(track)
    expect(fetch).toHaveBeenCalledOnce()
    expect(open).not.toHaveBeenCalled()
  })

  it('reads as missing when the bundle cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as Response))
    const { DEMO_MUSIC_ENTRY_ID, loadMusicFile } = await import('../musicLibraryPersistence')
    expect(await loadMusicFile(DEMO_MUSIC_ENTRY_ID)).toBeNull()
  })
})
