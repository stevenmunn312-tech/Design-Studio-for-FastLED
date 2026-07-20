import { describe, it, expect } from 'vitest'
import { GifEncoder } from '../gifEncoder'

// ── Minimal GIF parser + LZW decoder (test-only) ─────────────────────────────
// Walks the encoder's output structurally and decodes each frame's pixel
// indices back through GIF-variant LZW, so the tests verify a real round-trip
// rather than just checking magic bytes.

interface ParsedFrame {
  delayCs: number
  width: number
  height: number
  palette: number[][]        // [r, g, b] per entry
  pixels: number[][]         // [r, g, b] per pixel, palette-resolved
}

function lzwDecode(data: Uint8Array, minCodeSize: number, pixelCount: number): number[] {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let dict: number[][] = []
  const resetDict = () => {
    dict = []
    for (let i = 0; i < clearCode; i++) dict[i] = [i]
    dict[clearCode] = []
    dict[eoiCode] = []
    codeSize = minCodeSize + 1
  }
  resetDict()

  const out: number[] = []
  let bitPos = 0
  let prev: number[] | null = null
  const readCode = (): number => {
    let code = 0
    for (let i = 0; i < codeSize; i++) {
      const byte = data[bitPos >> 3]
      code |= ((byte >> (bitPos & 7)) & 1) << i
      bitPos++
    }
    return code
  }

  while (out.length < pixelCount) {
    const code = readCode()
    if (code === clearCode) { resetDict(); prev = null; continue }
    if (code === eoiCode) break
    let entry: number[]
    if (code < dict.length && dict[code].length > 0) {
      entry = dict[code]
    } else if (prev) {
      entry = [...prev, prev[0]]
    } else {
      throw new Error('bad LZW stream')
    }
    out.push(...entry)
    if (prev) {
      dict.push([...prev, entry[0]])
      // Mirror the encoder: width grows when the just-added code fills the range.
      if (dict.length === (1 << codeSize) && codeSize < 12) codeSize++
    }
    prev = entry
  }
  return out
}

function parseGif(bytes: Uint8Array) {
  expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
  const screenW = bytes[6] | (bytes[7] << 8)
  const screenH = bytes[8] | (bytes[9] << 8)
  let at = 13   // header + logical screen descriptor (no global colour table)

  let sawNetscapeLoop = false
  const frames: ParsedFrame[] = []
  let delayCs = 0

  while (at < bytes.length) {
    const block = bytes[at++]
    if (block === 0x3b) break   // trailer
    if (block === 0x21) {       // extension
      const label = bytes[at++]
      if (label === 0xff) {
        const appLen = bytes[at]
        const app = String.fromCharCode(...bytes.slice(at + 1, at + 1 + appLen))
        if (app === 'NETSCAPE2.0') sawNetscapeLoop = true
        at += 1 + appLen
        while (bytes[at] !== 0) at += 1 + bytes[at]
        at++
      } else if (label === 0xf9) {
        const len = bytes[at++]
        delayCs = bytes[at + 1] | (bytes[at + 2] << 8)
        at += len
        expect(bytes[at++]).toBe(0)
      } else {
        while (bytes[at] !== 0) at += 1 + bytes[at]
        at++
      }
      continue
    }
    expect(block).toBe(0x2c)    // image descriptor
    at += 4                     // left, top
    const width = bytes[at] | (bytes[at + 1] << 8)
    const height = bytes[at + 2] | (bytes[at + 3] << 8)
    at += 4
    const packed = bytes[at++]
    expect(packed & 0x80).toBe(0x80)   // local colour table present
    const tableSize = 2 << (packed & 0x07)
    const palette: number[][] = []
    for (let i = 0; i < tableSize; i++) {
      palette.push([bytes[at], bytes[at + 1], bytes[at + 2]])
      at += 3
    }
    const minCodeSize = bytes[at++]
    const lzw: number[] = []
    while (bytes[at] !== 0) {
      const len = bytes[at++]
      for (let i = 0; i < len; i++) lzw.push(bytes[at++])
    }
    at++
    const indices = lzwDecode(Uint8Array.from(lzw), minCodeSize, width * height)
    frames.push({
      delayCs,
      width,
      height,
      palette,
      pixels: indices.map((i) => palette[i]),
    })
  }

  return { screenW, screenH, sawNetscapeLoop, frames }
}

function rgbaFrame(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      const [r, g, b] = fill(x, y)
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255
    }
  }
  return data
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GifEncoder', () => {
  it('round-trips exact colours through a multi-frame animation', () => {
    const encoder = new GifEncoder(4, 3, 10)
    encoder.addFrame(rgbaFrame(4, 3, () => [255, 0, 128]))
    encoder.addFrame(rgbaFrame(4, 3, (x) => (x < 2 ? [0, 255, 0] : [0, 0, 255])))
    const parsed = parseGif(encoder.finish())

    expect(parsed.screenW).toBe(4)
    expect(parsed.screenH).toBe(3)
    expect(parsed.sawNetscapeLoop).toBe(true)
    expect(parsed.frames).toHaveLength(2)
    expect(encoder.frameCount).toBe(2)
    expect(parsed.frames[0].delayCs).toBe(10)

    for (const px of parsed.frames[0].pixels) expect(px).toEqual([255, 0, 128])
    expect(parsed.frames[1].pixels[0]).toEqual([0, 255, 0])
    expect(parsed.frames[1].pixels[3]).toEqual([0, 0, 255])
  })

  it('decodes a larger patterned frame pixel-perfectly when under 256 colours', () => {
    const w = 32, h = 32
    // 8 × 8 × 2 = 128 distinct colours — inside the exact-palette fast path.
    const fill = (x: number, y: number): [number, number, number] =>
      [(x % 8) * 32, (y % 8) * 32, ((x + y) % 2) * 200]
    const encoder = new GifEncoder(w, h, 4)
    encoder.addFrame(rgbaFrame(w, h, fill))
    const { frames } = parseGif(encoder.finish())

    expect(frames[0].palette.length).toBeLessThanOrEqual(256)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(frames[0].pixels[y * w + x]).toEqual(fill(x, y))
      }
    }
  })

  it('quantises frames with more than 256 colours to a close palette', () => {
    const w = 64, h = 64   // 4096 distinct colours
    const fill = (x: number, y: number): [number, number, number] => [x * 4, y * 4, (x + y) * 2]
    const encoder = new GifEncoder(w, h, 5)
    encoder.addFrame(rgbaFrame(w, h, fill))
    const { frames } = parseGif(encoder.finish())

    expect(frames[0].palette.length).toBeLessThanOrEqual(256)
    // Every decoded pixel should be within a modest distance of the original.
    let worst = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = fill(x, y)
        const [dr, dg, db] = frames[0].pixels[y * w + x]
        worst = Math.max(worst, Math.abs(r - dr), Math.abs(g - dg), Math.abs(b - db))
      }
    }
    expect(worst).toBeLessThanOrEqual(48)
  })

  it('clamps the delay to the practical browser minimum', () => {
    const encoder = new GifEncoder(2, 2, 1)
    encoder.addFrame(rgbaFrame(2, 2, () => [10, 20, 30]))
    const { frames } = parseGif(encoder.finish())
    expect(frames[0].delayCs).toBe(2)
  })
})
