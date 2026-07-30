import { describe, it, expect } from 'vitest'
import { buildAdalightPacket, buildAdalightPacketFromRgb } from '../adalight'
import type { Frame, RGB } from '../../state/graphEvaluator'

function solidFrame(w: number, h: number, color: RGB): Frame {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ...color })))
}

describe('buildAdalightPacket', () => {
  it('starts with the "Ada" magic word', () => {
    const packet = buildAdalightPacket(solidFrame(2, 2, { r: 1, g: 2, b: 3 }), { width: 2, height: 2, serpentine: false })
    expect([...packet.slice(0, 3)]).toEqual([0x41, 0x64, 0x61])
  })

  it('encodes numLeds-1 as hi/lo with a matching xor checksum', () => {
    const packet = buildAdalightPacket(solidFrame(4, 4, { r: 0, g: 0, b: 0 }), { width: 4, height: 4, serpentine: false })
    const numLeds = 16
    const hi = ((numLeds - 1) >> 8) & 0xff
    const lo = (numLeds - 1) & 0xff
    expect(packet[3]).toBe(hi)
    expect(packet[4]).toBe(lo)
    expect(packet[5]).toBe((hi ^ lo ^ 0x55) & 0xff)
  })

  it('has a 6-byte header plus 3 bytes per LED', () => {
    const packet = buildAdalightPacket(solidFrame(3, 5, { r: 0, g: 0, b: 0 }), { width: 3, height: 5, serpentine: false })
    expect(packet.length).toBe(6 + 3 * 5 * 3)
  })

  it('writes RGB triples in row-major order when not serpentine', () => {
    const frame: Frame = [
      [{ r: 1, g: 0, b: 0 }, { r: 2, g: 0, b: 0 }],
      [{ r: 3, g: 0, b: 0 }, { r: 4, g: 0, b: 0 }],
    ]
    const packet = buildAdalightPacket(frame, { width: 2, height: 2, serpentine: false })
    const reds = [0, 1, 2, 3].map((i) => packet[6 + i * 3])
    expect(reds).toEqual([1, 2, 3, 4])
  })

  it('reverses odd rows for serpentine wiring, matching the C++ XY() formula', () => {
    const frame: Frame = [
      [{ r: 1, g: 0, b: 0 }, { r: 2, g: 0, b: 0 }],
      [{ r: 3, g: 0, b: 0 }, { r: 4, g: 0, b: 0 }],
    ]
    const packet = buildAdalightPacket(frame, { width: 2, height: 2, serpentine: true })
    // Row 0 (even) stays left-to-right: 1, 2. Row 1 (odd) reverses: 4, 3.
    const reds = [0, 1, 2, 3].map((i) => packet[6 + i * 3])
    expect(reds).toEqual([1, 2, 4, 3])
  })

  it('defaults missing pixels to black rather than throwing', () => {
    const packet = buildAdalightPacket([], { width: 2, height: 2, serpentine: false })
    expect([...packet.slice(6)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('buildAdalightPacketFromRgb', () => {
  function packed(frame: Frame, w: number, h: number): Uint8ClampedArray {
    const bytes = new Uint8ClampedArray(w * h * 3)
    let at = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const px = frame[y]?.[x]
      bytes[at++] = px?.r ?? 0; bytes[at++] = px?.g ?? 0; bytes[at++] = px?.b ?? 0
    }
    return bytes
  }

  // The live-stream path switched to the packed form so it never holds a
  // pooled evaluator frame; it must stay byte-identical to the Frame form.
  it.each([
    ['row-major', false],
    ['serpentine', true],
  ])('matches the Frame overload byte for byte (%s)', (_label, serpentine) => {
    const frame: Frame = [
      [{ r: 1, g: 2, b: 3 }, { r: 4, g: 5, b: 6 }, { r: 7, g: 8, b: 9 }],
      [{ r: 10, g: 11, b: 12 }, { r: 13, g: 14, b: 15 }, { r: 16, g: 17, b: 18 }],
    ]
    const layout = { width: 3, height: 2, serpentine }
    expect([...buildAdalightPacketFromRgb(packed(frame, 3, 2), layout)])
      .toEqual([...buildAdalightPacket(frame, layout)])
  })

  it('zero-fills when the buffer is shorter than the layout', () => {
    const packet = buildAdalightPacketFromRgb(new Uint8ClampedArray(0), { width: 2, height: 2, serpentine: false })
    expect([...packet.slice(6)]).toEqual(new Array(12).fill(0))
  })
})
