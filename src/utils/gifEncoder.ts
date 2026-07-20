// Zero-dependency animated GIF (GIF89a) encoder, in the spirit of
// zipExport.ts: no library, just the format. Frames are added one at a time
// as opaque RGBA pixel buffers (a canvas getImageData().data); each frame
// carries its own local colour table, quantised to ≤256 colours with a
// median-cut pass when the frame exceeds the GIF palette limit.

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

// Median-cut over the frame's colour histogram: split the box with the widest
// channel range at its weighted median until we have ≤256 boxes, then average
// each box into one palette entry.
function medianCut(hist: Map<number, number>): number[] {
  interface Box { colors: [number, number][] }
  const boxes: Box[] = [{ colors: [...hist.entries()] }]

  const channelRange = (box: Box, shift: number): number => {
    let min = 255, max = 0
    for (const [c] of box.colors) {
      const v = (c >> shift) & 0xff
      if (v < min) min = v
      if (v > max) max = v
    }
    return max - min
  }

  while (boxes.length < MAX_PALETTE) {
    // Pick the box with the largest single-channel spread that can still split.
    let bestBox = -1, bestRange = 0, bestShift = 16
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].colors.length < 2) continue
      for (const shift of [16, 8, 0]) {
        const range = channelRange(boxes[i], shift)
        if (range > bestRange) { bestRange = range; bestBox = i; bestShift = shift }
      }
    }
    if (bestBox < 0) break

    const box = boxes[bestBox]
    box.colors.sort((a, b) => ((a[0] >> bestShift) & 0xff) - ((b[0] >> bestShift) & 0xff))
    // Split at the weighted median so both halves carry similar pixel counts.
    const totalWeight = box.colors.reduce((sum, [, n]) => sum + n, 0)
    let acc = 0, cut = 0
    while (cut < box.colors.length - 1 && acc + box.colors[cut][1] < totalWeight / 2) {
      acc += box.colors[cut][1]
      cut++
    }
    boxes[bestBox] = { colors: box.colors.slice(0, Math.max(1, cut)) }
    boxes.push({ colors: box.colors.slice(Math.max(1, cut)) })
  }

  return boxes.map(({ colors }) => {
    let r = 0, g = 0, b = 0, n = 0
    for (const [c, count] of colors) {
      r += ((c >> 16) & 0xff) * count
      g += ((c >> 8) & 0xff) * count
      b += (c & 0xff) * count
      n += count
    }
    return packRgb(Math.round(r / n), Math.round(g / n), Math.round(b / n))
  })
}

// Drop each channel to 5 bits — the same quantisation the LED sprite renderer
// applies — collapsing a gradient-heavy frame's histogram by ~512× before the
// (comparatively expensive) median-cut and nearest-colour passes run.
const fold = (c: number): number => c & 0xf8f8f8

function quantize(rgba: Uint8ClampedArray, pixelCount: number): QuantResult {
  let hist = new Map<number, number>()
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    const c = packRgb(rgba[o], rgba[o + 1], rgba[o + 2])
    hist.set(c, (hist.get(c) ?? 0) + 1)
  }

  const exact = hist.size <= MAX_PALETTE
  if (!exact) {
    const folded = new Map<number, number>()
    for (const [c, n] of hist) folded.set(fold(c), (folded.get(fold(c)) ?? 0) + n)
    hist = folded
  }
  const palette = exact ? [...hist.keys()] : medianCut(hist)

  // Map every distinct colour to its palette slot once, then index pixels.
  const slot = new Map<number, number>()
  if (exact) {
    palette.forEach((c, i) => slot.set(c, i))
  } else {
    for (const c of hist.keys()) {
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff
      let best = 0, bestDist = Infinity
      for (let i = 0; i < palette.length; i++) {
        const p = palette[i]
        const dr = r - ((p >> 16) & 0xff), dg = g - ((p >> 8) & 0xff), db = b - (p & 0xff)
        const dist = dr * dr + dg * dg + db * db
        if (dist < bestDist) { bestDist = dist; best = i }
      }
      slot.set(c, best)
    }
  }

  const indices = new Uint8Array(pixelCount)
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    const c = packRgb(rgba[o], rgba[o + 1], rgba[o + 2])
    indices[i] = slot.get(exact ? c : fold(c))!
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
  private readonly parts: Uint8Array[] = []
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

  finish(): Uint8Array {
    this.parts.push(Uint8Array.from([0x3b]))            // trailer
    const total = this.parts.reduce((sum, p) => sum + p.length, 0)
    const bytes = new Uint8Array(total)
    let at = 0
    for (const part of this.parts) {
      bytes.set(part, at)
      at += part.length
    }
    return bytes
  }

  get frameCount(): number {
    return this.frames
  }
}
