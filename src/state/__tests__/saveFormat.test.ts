import { describe, expect, it } from 'vitest'
import { newerSaveFormat, readableSaves, SAVE_FORMAT_VERSION, withSaveFormat } from '../saveFormat'

describe('save format version', () => {
  it('stamps the current version without changing the rest', () => {
    expect(withSaveFormat({ id: 'a', formatVersion: 0 })).toEqual({ id: 'a', formatVersion: SAVE_FORMAT_VERSION })
  })

  it('reads a file with no version, or a malformed one, as readable', () => {
    expect(newerSaveFormat({ id: 'a' })).toBeNull()
    expect(newerSaveFormat({ formatVersion: '9' })).toBeNull()
    expect(newerSaveFormat({ formatVersion: SAVE_FORMAT_VERSION })).toBeNull()
    expect(newerSaveFormat(null)).toBeNull()
  })

  it('names the version of a file written in a later format', () => {
    expect(newerSaveFormat({ formatVersion: SAVE_FORMAT_VERSION + 1 })).toBe(SAVE_FORMAT_VERSION + 1)
  })

  it('leaves later-format files out of a folder listing and counts them', () => {
    const files = [{ id: 'old' }, { id: 'now', formatVersion: SAVE_FORMAT_VERSION }, { id: 'later', formatVersion: SAVE_FORMAT_VERSION + 1 }]
    const { readable, newer } = readableSaves(files)
    expect(readable.map((file) => file.id)).toEqual(['old', 'now'])
    expect(newer).toBe(1)
  })
})
