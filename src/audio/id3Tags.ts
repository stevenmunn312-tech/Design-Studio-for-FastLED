/*
 * The title, artist and album an audio file carries, read in the browser.
 *
 * The SD player reads the same ID3 frames on the device (`audio_id3data` in
 * codegen/playerSongInfoCpp.ts), so a track played from the preview's local
 * playlist reports what the panel will say rather than a filename and a blank
 * artist row. Tags are read, never guessed: a file without them keeps its
 * filename as the title and leaves the artist blank, exactly as on the device.
 *
 * ID3v2.2/2.3/2.4 text frames at the head of the file, then ID3v1 at the tail.
 * Nothing else a file might carry (Vorbis comments, MP4 atoms) is read — the
 * decoder on the board plays MP3 and reads ID3, and preview mirrors that.
 */

export interface AudioTags {
  title?: string
  artist?: string
  album?: string
}

/** v2.3/2.4 frame ids, then the three-character v2.2 ones. */
const FRAMES: Readonly<Record<string, keyof AudioTags>> = {
  TIT2: 'title', TPE1: 'artist', TALB: 'album',
  TT2: 'title', TP1: 'artist', TAL: 'album',
}

const syncsafe = (b: Uint8Array, at: number) =>
  ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f)
const plain32 = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

/** One text frame's payload: an encoding byte, then the text. */
function decodeText(payload: Uint8Array): string {
  if (payload.length === 0) return ''
  const encoding = payload[0]
  const body = payload.subarray(1)
  const label = encoding === 1 ? 'utf-16' : encoding === 2 ? 'utf-16be' : encoding === 3 ? 'utf-8' : 'latin1'
  // A v2.4 frame may hold several values split by NUL; the first is the one a
  // single-line panel row can show.
  return new TextDecoder(label).decode(body).split('\u0000')[0].trim()
}

/** ID3v2 at the head of `bytes`, or nothing. */
export function readId3v2(bytes: Uint8Array): AudioTags {
  const tags: AudioTags = {}
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return tags
  const version = bytes[3]
  const flags = bytes[5]
  const end = Math.min(bytes.length, 10 + syncsafe(bytes, 6))
  // Unsynchronised tags need un-escaping first; rare enough to decline.
  if (flags & 0x80) return tags
  let at = 10
  if (flags & 0x40 && version >= 3) {
    at += version === 4 ? syncsafe(bytes, at) : plain32(bytes, at) + 4
  }
  const short = version === 2
  const header = short ? 6 : 10
  while (at + header <= end) {
    const id = String.fromCharCode(...bytes.subarray(at, at + (short ? 3 : 4)))
    if (!/^[A-Z0-9]+$/.test(id)) break // padding
    const size = short
      ? (bytes[at + 3] << 16) | (bytes[at + 4] << 8) | bytes[at + 5]
      : version === 4 ? syncsafe(bytes, at + 4) : plain32(bytes, at + 4)
    const start = at + header
    if (size <= 0 || start + size > end) break
    const field = FRAMES[id]
    if (field && !tags[field]) {
      const text = decodeText(bytes.subarray(start, start + size))
      if (text) tags[field] = text
    }
    at = start + size
  }
  return tags
}

/** ID3v1 in the last 128 bytes, or nothing. */
export function readId3v1(tail: Uint8Array): AudioTags {
  if (tail.length < 128) return {}
  const block = tail.subarray(tail.length - 128)
  if (block[0] !== 0x54 || block[1] !== 0x41 || block[2] !== 0x47) return {}
  const field = (from: number, to: number) =>
    new TextDecoder('latin1').decode(block.subarray(from, to)).split('\u0000')[0].trim() || undefined
  const tags: AudioTags = {}
  const title = field(3, 33), artist = field(33, 63), album = field(63, 93)
  if (title) tags.title = title
  if (artist) tags.artist = artist
  if (album) tags.album = album
  return tags
}

/** How much of a file's head to read for an ID3v2 tag with embedded art. */
const HEAD_BYTES = 512 * 1024

/** Read a file's tags; v2 wins field by field, v1 fills what it lacks. */
export async function readAudioFileTags(file: Blob): Promise<AudioTags> {
  try {
    const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer())
    const v2 = readId3v2(head)
    if (v2.title && v2.artist && v2.album) return v2
    const tail = new Uint8Array(await file.slice(Math.max(0, file.size - 128)).arrayBuffer())
    return { ...readId3v1(tail), ...v2 }
  } catch {
    return {}
  }
}
