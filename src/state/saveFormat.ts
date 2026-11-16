// The format version written into every project and pattern file.
//
// An app that loads a file written in a later format does not know that
// format's nodes and properties, so sanitizing would drop them and the next
// autosave would write the loss back. Every load path therefore refuses a
// newer file instead: Open Project File, a pattern file import, and the
// Projects and Patterns folders the helper lists. The helper also refuses to
// overwrite a file whose version is newer than the save it receives
// (backend/storage.py). Raise the number when a saved shape changes in a way
// an older app cannot read, together with a migration for the older shape.
//
// A file without a version was written before versions existed (0.x) and
// reads as format 1. Display documents keep their own `schemaVersion`, and a
// library bundle its own `version`.

export const SAVE_FORMAT_VERSION = 1

/** The value with this app's format version stamped on it, for writing. */
export function withSaveFormat<T extends object>(value: T): T & { formatVersion: number } {
  return { ...value, formatVersion: SAVE_FORMAT_VERSION }
}

/** The file's format version when it is later than this app reads, else null. */
export function newerSaveFormat(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null
  const version = (value as { formatVersion?: unknown }).formatVersion
  return typeof version === 'number' && version > SAVE_FORMAT_VERSION ? version : null
}

/** Why a newer file was refused, for a status line or an import error. */
export function newerSaveFormatMessage(kind: 'project' | 'pattern', version: number): string {
  return `This ${kind} was saved by a newer Design Studio (format ${version}; this version reads format ${SAVE_FORMAT_VERSION}). Update Design Studio to open it.`
}

/** Thrown by a parser that refuses a newer file, so the caller can show the
 *  reason instead of a generic "invalid file". */
export class NewerSaveFormatError extends Error {
  constructor(kind: 'project' | 'pattern', version: number) {
    super(newerSaveFormatMessage(kind, version))
    this.name = 'NewerSaveFormatError'
  }
}

/** Split a folder listing into what this app can read and how many files it
 *  left alone because a newer version wrote them. */
export function readableSaves<T>(files: T[]): { readable: T[]; newer: number } {
  const readable = files.filter((file) => newerSaveFormat(file) === null)
  return { readable, newer: files.length - readable.length }
}
