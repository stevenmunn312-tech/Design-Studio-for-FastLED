// Zero-dependency animated GIF (GIF89a) encoder, in the spirit of
// zipExport.ts: no library, just the format. Frames are added one at a time
// as opaque RGBA pixel buffers (a canvas getImageData().data); each frame
// carries its own local colour table. Frames with ≤256 colours stay exact;
// gradient-heavy frames use a balanced 6×7×6 RGB cube. That fixed palette
// keeps quantisation linear in the pixel count instead of making recording
// time grow with both the number of source colours and palette entries.

export interface EncodedGifInfo {
  bytes: Uint8Array
  frameCount: number
}

const MAX_PALETTE = 256

// ── Colour quantisation ──────────────────────────────────────────────────────

interface QuantResult {
  palette: number[]          // packed 0xRRGGBB, length ≤ 256
  indices: Uint8Array        // one palette index per pixel
}

function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b
}

const RED_LEVELS = 6
const GREEN_LEVELS = 7
const BLUE_LEVELS = 6

const quantizedLevel = (value: number, levels: number): number =>
  Math.round((value * (levels - 1)) / 255)

const levelValue = (level: number, levels: number): number =>
  Math.round((level * 255) / (levels - 1))

const cubePalette = Array.from({ length: RED_LEVELS * GREEN_LEVELS * BLUE_LEVELS }, (_, index) => {
  const b = index % BLUE_LEVELS
  const g = Math.floor(index / BLUE_LEVELS) % GREEN_LEVELS
  const r = Math.floor(index / (BLUE_LEVELS * GREEN_LEVELS))
  return packRgb(levelValue(r, RED_LEVELS), levelValue(g, GREEN_LEVELS), levelValue(b, BLUE_LEVELS))
})

function cubeIndex(r: number, g: number, b: number): number {
  return (
    quantizedLevel(r, RED_LEVELS) * GREEN_LEVELS * BLUE_LEVELS
    + quantizedLevel(g, GREEN_LEVELS) * BLUE_LEVELS
    + quantizedLevel(b, BLUE_LEVELS)
  )
}

function quantize(rgba: Uint8ClampedArray, pixelCount: number): QuantResult {
  const exactSlots = new Map<number, number>()
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    const c = packRgb(rgba[o], rgba[o + 1], rgba[o + 2])
    if (!exactSlots.has(c)) {
      exactSlots.set(c, exactSlots.size)
      if (exactSlots.size > MAX_PALETTE) break
    }
  }

  const exact = exactSlots.size <= MAX_PALETTE
  const palette = exact ? [...exactSlots.keys()] : cubePalette
  const indices = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    indices[i] = exact
      ? exactSlots.get(packRgb(rgba[o], rgba[o + 1], rgba[o + 2]))!
      : cubeIndex(rgba[o], rgba[o + 1], rgba[o + 2])
  }
  return { palette, indices }
}

// ── LZW (GIF variable-code-size variant) ─────────────────────────────────────

function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  const out: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  let codeSize = minCodeSize + 1

  const emit = (code: number) => {
    bitBuffer |= code << bitCount
    bitCount += codeSize
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff)
      bitBuffer >>= 8
      bitCount -= 8
    }
  }

  // Dictionary of pixel strings → codes, keyed by (prefixCode << 8) | pixel.
  let dict = new Map<number, number>()
  let nextCode = eoiCode + 1

  emit(clearCode)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const pixel = indices[i]
    const key = (prefix << 8) | pixel
    const found = dict.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    emit(prefix)
    dict.set(key, nextCode)
    // Grow the code width the moment the just-assigned code no longer fits.
    if (nextCode === 1 << codeSize && codeSize < 12) codeSize++
    nextCode++
    if (nextCode >= 4096) {
      emit(clearCode)
      dict = new Map()
      codeSize = minCodeSize + 1
      nextCode = eoiCode + 1
    }
    prefix = pixel
  }
  emit(prefix)
  emit(eoiCode)
  if (bitCount > 0) out.push(bitBuffer & 0xff)

  return Uint8Array.from(out)
}

// ── Encoder ──────────────────────────────────────────────────────────────────

export class GifEncoder {
  private parts: Uint8Array[] = []
  private frames = 0

  /** `delayCs` is the per-frame delay in hundredths of a second (GIF's native
   *  unit); most browsers treat values below 2 as "slow", so 2 (50 fps) is the
   *  practical minimum. The animation loops forever. */
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly delayCs: number,
  ) {
    // Header + logical screen descriptor (no global colour table).
    this.parts.push(Uint8Array.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61,               // "GIF89a"
      width & 0xff, width >> 8, height & 0xff, height >> 8,
      0x70,                                             // no GCT, colour res 8-bit
      0x00, 0x00,                                       // bg colour, aspect
    ]))
    // Netscape application extension: loop count 0 = forever.
    this.parts.push(Uint8Array.from([
      0x21, 0xff, 0x0b,
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // NETSCAPE2.0
      0x03, 0x01, 0x00, 0x00, 0x00,
    ]))
  }

  /** Add one opaque frame as RGBA bytes (alpha ignored), width×height pixels. */
  addFrame(rgba: Uint8ClampedArray): void {
    const pixelCount = this.width * this.height
    if (rgba.length < pixelCount * 4) throw new Error('GIF frame buffer too small')
    const { palette, indices } = quantize(rgba, pixelCount)

    // Local colour table padded to a power of two (≥4 — LZW needs minCodeSize ≥2).
    let tableSize = 4
    let tableBits = 2
    while (tableSize < palette.length) { tableSize *= 2; tableBits++ }

    const delay = Math.max(2, Math.round(this.delayCs))
    this.parts.push(Uint8Array.from([
      0x21, 0xf9, 0x04, 0x04,                           // GCE, disposal "do not dispose"
      delay & 0xff, delay >> 8, 0x00, 0x00,
      0x2c, 0x00, 0x00, 0x00, 0x00,                     // image descriptor at 0,0
      this.width & 0xff, this.width >> 8, this.height & 0xff, this.height >> 8,
      0x80 | (tableBits - 1),                           // local colour table flag + size
    ]))

    const table = new Uint8Array(tableSize * 3)
    palette.forEach((c, i) => {
      table[i * 3] = (c >> 16) & 0xff
      table[i * 3 + 1] = (c >> 8) & 0xff
      table[i * 3 + 2] = c & 0xff
    })
    this.parts.push(table)

    const lzw = lzwEncode(indices, tableBits)
    // Split the code stream into ≤255-byte data sub-blocks.
    const blocks = new Uint8Array(1 + lzw.length + Math.ceil(lzw.length / 255) + 1)
    let at = 0
    blocks[at++] = tableBits                            // LZW minimum code size
    for (let off = 0; off < lzw.length; off += 255) {
      const len = Math.min(255, lzw.length - off)
      blocks[at++] = len
      blocks.set(lzw.subarray(off, off + len), at)
      at += len
    }
    blocks[at++] = 0x00                                 // block terminator
    this.parts.push(blocks.subarray(0, at))
    this.frames++
  }

  /** Return and release the encoded chunks accumulated so far. Streaming
   *  callers can drain after every frame to keep memory bounded, then append
   *  the result of `finishParts()`. */
  drainParts(): Uint8Array[] {
    const parts = this.parts
    this.parts = []
    return parts
  }

  finishParts(): Uint8Array[] {
    this.parts.push(Uint8Array.from([0x3b]))            // trailer
    return this.drainParts()
  }

  finish(): Uint8Array {
    const parts = this.finishParts()
    const total = parts.reduce((sum, p) => sum + p.length, 0)
    const bytes = new Uint8Array(total)
    let at = 0
    for (const part of parts) {
      bytes.set(part, at)
      at += part.length
    }
    return bytes
  }

  get frameCount(): number {
    return this.frames
  }
}
