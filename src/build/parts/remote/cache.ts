// Byte cache for the parts client. Every operation swallows its own failure and
// degrades to "no cache" (private windows, blocked storage, WebView2 quirks),
// so callers never need a try/catch and a broken cache never breaks the shelf.
// Entries are untrusted on read: the client re-verifies each one.

export interface PartsCache {
  get(key: string): Promise<Uint8Array | null>
  set(key: string, bytes: Uint8Array): Promise<void>
  delete(key: string): Promise<void>
}

export function createMemoryCache(): PartsCache {
  const map = new Map<string, Uint8Array>()
  return {
    async get(key) {
      return map.get(key) ?? null
    },
    async set(key, bytes) {
      map.set(key, bytes)
    },
    async delete(key) {
      map.delete(key)
    },
  }
}

/** A cache that never stores anything. */
export function createNullCache(): PartsCache {
  return {
    async get() {
      return null
    },
    async set() {},
    async delete() {},
  }
}

const STORE = 'entries'

/** IndexedDB-backed cache. Opens lazily on first use, never at import time. */
export function createIndexedDbCache(dbName = 'dsf-parts-cache'): PartsCache {
  let opening: Promise<IDBDatabase | null> | null = null

  const open = (): Promise<IDBDatabase | null> => {
    if (opening) return opening
    opening = new Promise((resolve) => {
      try {
        const factory = globalThis.indexedDB
        if (!factory) return resolve(null)
        const request = factory.open(dbName, 1)
        request.onupgradeneeded = () => {
          try {
            request.result.createObjectStore(STORE)
          } catch {
            // Handled by the error path below.
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
        request.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    return opening
  }

  const run = async <T>(
    mode: IDBTransactionMode,
    fallback: T,
    action: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> => {
    const db = await open()
    if (!db) return fallback
    return new Promise<T>((resolve) => {
      try {
        const request = action(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result === undefined ? fallback : (request.result as T))
        request.onerror = () => resolve(fallback)
      } catch {
        resolve(fallback)
      }
    })
  }

  return {
    async get(key) {
      const value = await run<unknown>('readonly', null, (s) => s.get(key))
      if (value instanceof Uint8Array) return value
      if (value instanceof ArrayBuffer) return new Uint8Array(value)
      return null
    },
    async set(key, bytes) {
      await run('readwrite', null, (s) => s.put(bytes, key))
    },
    async delete(key) {
      await run('readwrite', null, (s) => s.delete(key))
    },
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

export const encodeText = (text: string): Uint8Array => encoder.encode(text)

/** Strict UTF-8 decode; null when the bytes are not valid UTF-8. */
export function decodeText(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes)
  } catch {
    return null
  }
}
