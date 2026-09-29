// Where an imported clip's bytes live. Frames are megabytes, so they stay out of
// the project JSON (autosave would blow the storage quota) and go in IndexedDB,
// the same arrangement the music library uses for audio. The node keeps only
// the small `SdVideoClip` record.
//
// The preview evaluator is synchronous, so a clip is read through an in-memory
// cache. `loadSdVideo` fills it; until it has, the node previews black.

import { parseSdvHeader } from './evaluator/sdVideo'

const DB_NAME = 'design-studio-for-fastled.sdvideo.v1'
const STORE_NAME = 'clips'

const cache = new Map<string, Uint8Array>()
const listeners = new Set<() => void>()

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

/** The clip's `.sdv` bytes if they are in memory, else null. */
export function getSdVideoBytes(id: string): Uint8Array | null {
  return cache.get(id) ?? null
}

/** Run `fn` whenever a clip becomes available or is removed. */
export function onSdVideoChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function changed() { for (const fn of listeners) fn() }

export async function saveSdVideo(id: string, bytes: Uint8Array): Promise<void> {
  cache.set(id, bytes)
  changed()
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(bytes, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
  db.close()
}

/** Bring a stored clip into memory. Resolves null if there is none, or if what
 *  is stored is not a clip. */
export async function loadSdVideo(id: string): Promise<Uint8Array | null> {
  const cached = cache.get(id)
  if (cached) return cached
  const db = await openDatabase()
  if (!db) return null
  const result = await new Promise<Uint8Array | null>((resolve) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result instanceof Uint8Array ? request.result : null)
    request.onerror = () => resolve(null)
  })
  db.close()
  if (!result || !parseSdvHeader(result)) return null
  cache.set(id, result)
  changed()
  return result
}

export async function deleteSdVideo(id: string): Promise<void> {
  cache.delete(id)
  changed()
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
  db.close()
}
