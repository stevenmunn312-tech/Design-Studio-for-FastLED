import type { Frame } from '../state/graphEvaluator'
import type { StreamLayout } from '../codegen/sketches/streamReceiverGenerator'

// Row-major grid cell → physical strip index, by the layout's `xyTable`: the
// same table the C++ generator bakes into XY() for the LED output. The stream
// receiver sketch has no XY() of its own — it just writes bytes into `leds[]`
// in the order it receives them — so the remap has to happen here,
// client-side, before the bytes go out over serial. A layout that names no
// table is plain row-major.
type PacketLayout = Pick<StreamLayout, 'width' | 'height' | 'xyTable'>

/** The table is trusted only at the grid's own length; anything else would
 *  write outside the packet, so it streams row-major instead. */
function packetTable(layout: PacketLayout): number[] | null {
  return layout.xyTable?.length === layout.width * layout.height ? layout.xyTable : null
}

/** "Ada" + hi/lo LED-count + xor checksum. The pixel bytes follow at offset 6. */
function adalightHeader(numLeds: number): Uint8Array {
  const packet = new Uint8Array(6 + numLeds * 3)
  packet[0] = 0x41 // 'A'
  packet[1] = 0x64 // 'd'
  packet[2] = 0x61 // 'a'
  const hi = ((numLeds - 1) >> 8) & 0xff
  const lo = (numLeds - 1) & 0xff
  packet[3] = hi
  packet[4] = lo
  packet[5] = (hi ^ lo ^ 0x55) & 0xff
  return packet
}

/** Build one Adalight-protocol packet — "Ada" + hi/lo LED-count + checksum +
 *  RGB triples in physical strip order — from a rendered `Frame`. This is the
 *  exact byte sequence `/api/stream/frame` writes straight to the serial port. */
export function buildAdalightPacket(frame: Frame, layout: PacketLayout): Uint8Array {
  const { width, height } = layout
  const table = packetTable(layout)
  const packet = adalightHeader(width * height)
  for (let y = 0; y < height; y++) {
    const row = frame[y]
    for (let x = 0; x < width; x++) {
      const cell = y * width + x
      const idx = table ? table[cell] : cell
      const px = row?.[x]
      const dst = 6 + idx * 3
      packet[dst] = px?.r ?? 0
      packet[dst + 1] = px?.g ?? 0
      packet[dst + 2] = px?.b ?? 0
    }
  }
  return packet
}

/** The same packet from an already-packed row-major RGB buffer (3 bytes per
 *  pixel, `width * height * 3` long). The live-stream path uses this so it
 *  never has to hold a reference to a pooled evaluator `Frame` — see
 *  the packed-frame publishers in streamStore.ts. Produces byte-for-byte the same
 *  packet as the `Frame` overload above for equivalent pixels. */
export function buildAdalightPacketFromRgb(rgb: Uint8ClampedArray, layout: PacketLayout): Uint8Array {
  const { width, height } = layout
  const table = packetTable(layout)
  const packet = adalightHeader(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x
      const src = cell * 3
      const dst = 6 + (table ? table[cell] : cell) * 3
      packet[dst] = rgb[src] ?? 0
      packet[dst + 1] = rgb[src + 1] ?? 0
      packet[dst + 2] = rgb[src + 2] ?? 0
    }
  }
  return packet
}
