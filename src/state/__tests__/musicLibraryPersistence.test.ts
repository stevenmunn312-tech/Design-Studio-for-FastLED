import { describe, expect, it } from 'vitest'
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
