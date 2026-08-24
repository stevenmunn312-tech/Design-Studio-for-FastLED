import type { SongAnalysis, ShowFile } from '../types/showFile'

/** JSON-safe half of a Music Library entry. The audio bytes live in
 * IndexedDB: putting multi-megabyte tracks in the project/localStorage JSON
 * would make otherwise-small project autosaves fail their storage quota. */
export interface PersistedMusicEntry {
  id: string
  name: string
  type: string
  size: number
  lastModified: number
  analysis: SongAnalysis | null
  show: ShowFile | null
  status: 'pending' | 'done' | 'error'
  edited?: boolean
  error?: string
}

const DB_NAME = 'design-studio-for-fastled.music.v1'
const STORE_NAME = 'files'

// The cache also makes a just-dropped file immediately restorable if the user
// switches projects before IndexedDB's transaction has finished. It is the
// test/browser-private-mode fallback when IndexedDB is unavailable.
const memoryFiles = new Map<string, Blob>()

let captureHandler: () => PersistedMusicEntry[] = () => []
let restoreHandler: (entries: PersistedMusicEntry[]) => void | Promise<void> = () => undefined
let pendingRestore: Promise<void> = Promise.resolve()
let requestedRestore = 0
let completedRestore = 0

export function registerMusicLibraryPersistence(
  capture: () => PersistedMusicEntry[],
  restore: (entries: PersistedMusicEntry[]) => void | Promise<void>,
): void {
  captureHandler = capture
  restoreHandler = restore
}

export function captureMusicLibrary(): PersistedMusicEntry[] {
  return structuredClone(captureHandler())
}

export function restoreMusicLibrary(entries: PersistedMusicEntry[] | undefined): void {
  const restore = ++requestedRestore
  pendingRestore = Promise.resolve(
    restoreHandler(Array.isArray(entries) ? structuredClone(entries) : []),
  ).then(() => { completedRestore = Math.max(completedRestore, restore) })
}

/** Resolves when the most recently requested project library has finished
 * replacing the live store. Autosave must not capture the temporary empty
 * state used while IndexedDB files are being restored. */
export async function waitForMusicLibraryRestore(): Promise<void> {
  // A second project switch can start while the first IndexedDB read is still
  // resolving. Follow the moving target so callers never resume between the
  // two restores and capture that intermediate library.
  for (;;) {
    const restore = requestedRestore
    await pendingRestore
    if (restore === requestedRestore) return
  }
}

export function isMusicLibraryRestoring(): boolean {
  return completedRestore !== requestedRestore
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

export async function saveMusicFile(id: string, file: File): Promise<void> {
  memoryFiles.set(id, file)
  const db = await openDatabase()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(file, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
  db.close()
}

export async function loadMusicFile(id: string): Promise<Blob | null> {
  const cached = memoryFiles.get(id)
  if (cached) return cached
  const db = await openDatabase()
  if (!db) return null
  const result = await new Promise<Blob | null>((resolve) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null)
    request.onerror = () => resolve(null)
  })
  db.close()
  if (result) memoryFiles.set(id, result)
  return result
}
