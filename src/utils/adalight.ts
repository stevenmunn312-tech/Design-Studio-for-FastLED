import type { Frame } from '../state/graphEvaluator'
import type { StreamLayout } from '../codegen/streamReceiverGenerator'

// Row-major grid coordinate → physical strip index, mirroring the XY() the
// C++ generator emits for a serpentine MatrixOutput (cppGenerator.ts). The
// stream receiver sketch has no XY() of its own — it just writes bytes into
// `leds[]` in the order it receives them — so the remap has to happen here,
// client-side, before the bytes go out over serial.
function xyIndex(x: number, y: number, width: number, serpentine: boolean): number {
  if (!serpentine) return y * width + x
  return (y & 1) === 1 ? y * width + (width - 1 - x) : y * width + x
}

/** Build one Adalight-protocol packet — "Ada" + hi/lo LED-count + checksum +
 *  RGB triples in physical strip order — from a rendered `Frame`. This is the
 *  exact byte sequence `/api/stream/frame` writes straight to the serial port. */
export function buildAdalightPacket(frame: Frame, layout: Pick<StreamLayout, 'width' | 'height' | 'serpentine'>): Uint8Array {
  const { width, height, serpentine } = layout
  const numLeds = width * height
  const packet = new Uint8Array(6 + numLeds * 3)
  packet[0] = 0x41 // 'A'
  packet[1] = 0x64 // 'd'
  packet[2] = 0x61 // 'a'
  const hi = ((numLeds - 1) >> 8) & 0xff
  const lo = (numLeds - 1) & 0xff
  packet[3] = hi
  packet[4] = lo
  packet[5] = (hi ^ lo ^ 0x55) & 0xff
  for (let y = 0; y < height; y++) {
    const row = frame[y]
    for (let x = 0; x < width; x++) {
      const idx = xyIndex(x, y, width, serpentine)
      const px = row?.[x]
      const dst = 6 + idx * 3
      packet[dst] = px?.r ?? 0
      packet[dst + 1] = px?.g ?? 0
      packet[dst + 2] = px?.b ?? 0
    }
  }
  return packet
}
