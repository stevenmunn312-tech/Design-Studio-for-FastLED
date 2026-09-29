// SD Video: a clip of raw RGB frames on the SD card, played back by the sketch
// and by the browser preview from one set of rules.
//
// FastLED's own `fl::Video` reads headerless `.rgb` files and its MPEG1 path
// needs an encoder the browser does not have, so the Studio decodes the source
// video itself, downsamples every frame to the LED canvas and writes them
// uncompressed. The sketch then only reads bytes off the card: no decoder, no
// frame buffer beyond the node's own.
//
// File layout, little-endian:
//   0..3    magic "SDV1"
//   4..5    width in pixels
//   6..7    height in pixels
//   8..9    frames per second
//   10..13  frame count
//   14..15  reserved, zero
//   16..    frames back to back, each width * height * 3 bytes, R G B

export const SDV_MAGIC = 'SDV1'
export const SDV_HEADER_BYTES = 16
export const SDV_MAX_FPS = 60
export const SDV_MAX_SIDE = 64
export const SDV_MAX_SPEED = 4
/** The longest clip the importer accepts, in seconds. A clip is rendered to
 *  raw bytes in the browser, so this bounds both memory and the card write. */
export const SDV_MAX_SECONDS = 120
/** The most bytes per second the sketch is asked to read. An estimate for an
 *  ESP32 on a 20 MHz SPI bus with a typical card, not a bench measurement:
 *  above it a frame can miss its slot and playback stutters. */
export const SDV_BANDWIDTH_WARN = 400_000

/** What the node stores about an imported clip; the bytes live in IndexedDB. */
export interface SdVideoClip {
  id: string
  name: string
  w: number
  h: number
  fps: number
  frames: number
}

export function sdvFrameBytes(w: number, h: number): number {
  return w * h * 3
}

/** Bytes the sketch reads per second of playback at 1x speed. */
export function sdvBandwidth(w: number, h: number, fps: number): number {
  return sdvFrameBytes(w, h) * fps
}

/** A card path that is safe on FAT and in a C string: letters, digits, `-` and
 *  `_` only, so it never needs escaping in the sketch. */
export function sdvPath(name: string): string {
  const stem = name.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return `/video/${(stem || 'clip').slice(0, 32)}.sdv`
}

/** Validate an unknown stored value as clip metadata. */
export function asSdVideoClip(value: unknown): SdVideoClip | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const w = Number(v.w), h = Number(v.h), fps = Number(v.fps), frames = Number(v.frames)
  if (typeof v.id !== 'string' || !v.id || typeof v.name !== 'string') return null
  if (![w, h, fps, frames].every(Number.isInteger)) return null
  if (w < 1 || w > SDV_MAX_SIDE || h < 1 || h > SDV_MAX_SIDE) return null
  if (fps < 1 || fps > SDV_MAX_FPS || frames < 1) return null
  return { id: v.id, name: v.name, w, h, fps, frames }
}

/** The `.sdv` file for frames laid end to end in `data`. */
export function encodeSdv(w: number, h: number, fps: number, frames: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(SDV_HEADER_BYTES + data.length)
  for (let i = 0; i < 4; i++) out[i] = SDV_MAGIC.charCodeAt(i)
  const view = new DataView(out.buffer)
  view.setUint16(4, w, true)
  view.setUint16(6, h, true)
  view.setUint16(8, fps, true)
  view.setUint32(10, frames, true)
  out.set(data, SDV_HEADER_BYTES)
  return out
}

/** Read a `.sdv` header, or null if the bytes are not one. */
export function parseSdvHeader(bytes: Uint8Array): { w: number; h: number; fps: number; frames: number } | null {
  if (bytes.length < SDV_HEADER_BYTES) return null
  for (let i = 0; i < 4; i++) if (bytes[i] !== SDV_MAGIC.charCodeAt(i)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const w = view.getUint16(4, true), h = view.getUint16(6, true)
  const fps = view.getUint16(8, true), frames = view.getUint32(10, true)
  if (!w || !h || !fps || !frames) return null
  if (bytes.length < SDV_HEADER_BYTES + sdvFrameBytes(w, h) * frames) return null
  return { w, h, fps, frames }
}

export function sdvSpeed(value: unknown): number {
  const n = Number(value ?? 1)
  return Number.isFinite(n) ? Math.max(0, Math.min(SDV_MAX_SPEED, n)) : 1
}

/** Which frame plays at clock time `t` seconds. Looping wraps; otherwise the
 *  last frame holds. */
export function sdvFrameIndex(t: number, fps: number, speed: number, frames: number, loop: boolean): number {
  const raw = Math.floor(Math.max(0, t) * fps * speed)
  return loop ? raw % frames : Math.min(raw, frames - 1)
}

/** The clip pixel a canvas pixel reads along one axis: nearest, so a clip at
 *  another size than the canvas is stretched to it with no blending. */
export function sdvSourceIndex(dst: number, dstSize: number, srcSize: number): number {
  return Math.min(srcSize - 1, Math.floor((dst * srcSize) / dstSize))
}
