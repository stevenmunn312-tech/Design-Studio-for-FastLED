import { describe, it, expect } from 'vitest'
import { generateCpp } from '../cppGenerator'
import { generateWiringDiagnosticSketch } from '../sketches/wiringDiagnosticGenerator'
import { streamLayoutForGraph } from '../sketches/streamReceiverGenerator'
import { buildAdalightPacketFromRgb } from '../../utils/adalight'
import { matrixLedIndex, MATRIX_FIRST_RUNS, MATRIX_START_CORNERS, type MatrixWiring } from '../../state/output/xyLayout'
import type { StudioEdge, StudioNode } from '../../state/graphStore'

// The start corner and first run reach the firmware as the baked XY table, so
// "the preview-side helper and the emitted C++ agree" is checked by reading
// the table back out of the generated sketch and looking every cell up the
// way the sketch's own XY() does.

const W = 5
const H = 3

function output(props: Record<string, unknown>): StudioNode {
  return {
    id: 'out',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: 'MatrixOutput', nodeType: 'MatrixOutput', category: 'output', properties: props, inputs: [], outputs: [] },
  } as unknown as StudioNode
}

/** A one-colour graph into the output: an unwired output draws nothing and so
 *  maps nothing. */
function graphCpp(out: StudioNode): string {
  const source = {
    id: 'sc',
    type: 'studioNode',
    position: { x: 0, y: 0 },
    data: { label: 'SolidColor', nodeType: 'SolidColor', category: 'pattern', properties: { r: 1, g: 2, b: 3 }, inputs: [], outputs: [] },
  } as unknown as StudioNode
  const wire = { id: 'e', source: 'sc', target: 'out', sourceHandle: 'frame', targetHandle: 'frame' } as unknown as StudioEdge
  return generateCpp([source, out], [wire])
}

const COMBINATIONS: MatrixWiring[] = [false, true].flatMap((serpentine) =>
  MATRIX_START_CORNERS.flatMap((startCorner) =>
    MATRIX_FIRST_RUNS.map((firstRun) => ({ serpentine, startCorner, firstRun }))))

/** The sketch's XY(x, y): its PROGMEM table indexed row-major, or the plain
 *  `y * WIDTH + x` the sketch falls back to when it emits no table. */
function emittedXY(cpp: string): (x: number, y: number) => number {
  const match = cpp.match(/const uint16_t _xytable\[(\d+)\] PROGMEM = \{ ([\d,]+) \};/)
  if (!match) return (x, y) => y * W + x
  const table = match[2].split(',').map(Number)
  expect(table).toHaveLength(Number(match[1]))
  expect(cpp).toMatch(/uint16_t XY\(uint8_t x, uint8_t y\) \{ return pgm_read_word\(&_xytable\[\(uint16_t\)y \* \w+ \+ x\]\); \}/)
  return (x, y) => table[y * W + x]
}

describe('matrix start corner and first run in generated firmware', () => {
  for (const wiring of COMBINATIONS) {
    const label = `${wiring.serpentine ? 'serpentine' : 'progressive'}, ${wiring.startCorner}, ${wiring.firstRun}`
    const node = output({ width: W, height: H, dataPin: 5, ...wiring })
    const rowMajor = !wiring.serpentine && wiring.startCorner === 'top-left' && wiring.firstRun === 'horizontal'

    it(`graph sketch maps like the helper: ${label}`, () => {
      const cpp = graphCpp(node)
      const xy = emittedXY(cpp)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        expect(xy(x, y)).toBe(matrixLedIndex(x, y, W, H, wiring))
      }
      // No table, and so no XY(), for the one order that needs no remap.
      expect(cpp.includes('_xytable')).toBe(!rowMajor)
    })

    it(`wiring diagnostic maps like the helper: ${label}`, () => {
      const cpp = generateWiringDiagnosticSketch([node])!
      const xy = emittedXY(cpp)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        expect(xy(x, y)).toBe(matrixLedIndex(x, y, W, H, wiring))
      }
    })

    it(`live stream packet maps like the helper: ${label}`, () => {
      const layout = streamLayoutForGraph([node])!
      // Each cell's red byte is its own row-major number, so the packet shows
      // which cell landed on which LED.
      const rgb = new Uint8ClampedArray(W * H * 3)
      for (let cell = 0; cell < W * H; cell++) rgb[cell * 3] = cell + 1
      const packet = buildAdalightPacketFromRgb(rgb, layout)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        expect(packet[6 + matrixLedIndex(x, y, W, H, wiring) * 3]).toBe(y * W + x + 1)
      }
    })
  }
})

describe('a graph at the default start corner and first run', () => {
  // Saves made before the two properties existed carry neither. They, and a
  // graph that states the defaults outright, must build the sketch they
  // always built.
  for (const serpentine of [true, false]) {
    it(`generates byte-identical C++ with and without the new properties (serpentine ${serpentine})`, () => {
      const saved = output({ width: 8, height: 6, dataPin: 5, serpentine })
      const explicit = output({ width: 8, height: 6, dataPin: 5, serpentine, startCorner: 'top-left', firstRun: 'horizontal' })
      expect(graphCpp(explicit)).toBe(graphCpp(saved))
      expect(generateWiringDiagnosticSketch([explicit])).toBe(generateWiringDiagnosticSketch([saved]))
    })
  }

  it('still bakes the row zig-zag table the old formula produced', () => {
    const cpp = graphCpp(output({ width: 4, height: 3, dataPin: 5, serpentine: true }))
    expect(cpp).toContain('const uint16_t _xytable[12] PROGMEM = { 0,1,2,3,7,6,5,4,8,9,10,11 };')
  })

  it('keeps a tiled layout at defaults on its old table', () => {
    const cpp = graphCpp(output({ width: 4, height: 4, dataPin: 5, serpentine: false, layout: 'panels', tilesX: 2, tilesY: 2 }))
    expect(cpp).toContain('const uint16_t _xytable[16] PROGMEM = { 0,1,4,5,2,3,6,7,8,9,12,13,10,11,14,15 };')
  })

  it('leaves the choice out of a HUB75 panel and a string', () => {
    const chosen = { startCorner: 'bottom-right', firstRun: 'vertical' }
    const hub75 = { form: 'hub75', chipset: 'HUB75', width: 64, height: 32 }
    expect(graphCpp(output({ ...hub75, ...chosen }))).toBe(graphCpp(output(hub75)))
    const strip = { form: 'strip', ledCount: 30, dataPin: 5 }
    expect(graphCpp(output({ ...strip, ...chosen }))).toBe(graphCpp(output(strip)))
  })
})
