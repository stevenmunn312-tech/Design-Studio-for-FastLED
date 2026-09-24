import { describe, expect, it } from 'vitest'
import { readAudioFileTags, readId3v1, readId3v2 } from '../id3Tags'

const ascii = (text: string) => [...text].map((ch) => ch.charCodeAt(0))
const syncsafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]

/** A v2.3 or v2.4 tag holding the given text frames, UTF-8 or Latin-1. */
function tag(version: 3 | 4, frames: Record<string, string>, encoding = 3): Uint8Array {
  const body: number[] = []
  for (const [id, text] of Object.entries(frames)) {
    const payload = [encoding, ...new TextEncoder().encode(text)]
    body.push(...ascii(id), ...(version === 4 ? syncsafe(payload.length) : be32(payload.length)), 0, 0, ...payload)
  }
  body.push(0, 0, 0, 0) // padding
  return new Uint8Array([...ascii('ID3'), version, 0, 0, ...syncsafe(body.length), ...body])
}

describe('ID3 tags', () => {
  it('reads title, artist and album from a v2.3 tag', () => {
    expect(readId3v2(tag(3, { TIT2: 'Scintalekt', TPE1: 'DigitalDiamonds', TALB: 'Noir' }))).toEqual({
      title: 'Scintalekt', artist: 'DigitalDiamonds', album: 'Noir',
    })
  })

  it('reads syncsafe frame sizes in a v2.4 tag', () => {
    expect(readId3v2(tag(4, { TPE1: 'Artist Name' })).artist).toBe('Artist Name')
  })

  it('decodes UTF-16 with a byte-order mark', () => {
    const text = [0xff, 0xfe, ...[...'Björk'].flatMap((ch) => [ch.charCodeAt(0), 0])]
    const payload = [1, ...text]
    const body = [...ascii('TPE1'), ...be32(payload.length), 0, 0, ...payload]
    const bytes = new Uint8Array([...ascii('ID3'), 3, 0, 0, ...syncsafe(body.length), ...body])
    expect(readId3v2(bytes).artist).toBe('Björk')
  })

  it('reads ID3v1 at the tail', () => {
    const block = new Uint8Array(128)
    block.set(ascii('TAG'), 0)
    block.set(ascii('Old Title'), 3)
    block.set(ascii('Old Artist'), 33)
    expect(readId3v1(block)).toEqual({ title: 'Old Title', artist: 'Old Artist' })
  })

  it('reads nothing from a file without tags', async () => {
    expect(readId3v2(new Uint8Array(64))).toEqual({})
    expect(await readAudioFileTags(new Blob([new Uint8Array(256)]))).toEqual({})
  })

  it('lets v2 win field by field and v1 fill the gaps', async () => {
    const v1 = new Uint8Array(128)
    v1.set(ascii('TAG'), 0)
    v1.set(ascii('V1 Title'), 3)
    v1.set(ascii('V1 Artist'), 33)
    const file = new Blob([tag(3, { TIT2: 'V2 Title' }), new Uint8Array(32), v1])
    expect(await readAudioFileTags(file)).toEqual({ title: 'V2 Title', artist: 'V1 Artist' })
  })
})
