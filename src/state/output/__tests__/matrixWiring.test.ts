import { describe, it, expect } from 'vitest'
import {
  buildXYTable,
  chainEntry,
  matrixLedIndex,
  matrixWiringApplies,
  matrixWiringFromProps,
  MATRIX_FIRST_RUNS,
  MATRIX_START_CORNERS,
  type MatrixWiring,
} from '../xyLayout'
import { dataLaneUnit, offeredDataLaneCounts } from '../dataLanes'

// A non-square grid, so a rule that confused rows with columns cannot pass.
const W = 5
const H = 3

const COMBINATIONS: MatrixWiring[] = [false, true].flatMap((serpentine) =>
  MATRIX_START_CORNERS.flatMap((startCorner) =>
    MATRIX_FIRST_RUNS.map((firstRun) => ({ serpentine, startCorner, firstRun }))))

const name = (w: MatrixWiring) => `${w.serpentine ? 'serpentine' : 'progressive'}, ${w.startCorner}, ${w.firstRun}`

function cornerCell(corner: MatrixWiring['startCorner']): { x: number; y: number } {
  return { x: corner.endsWith('right') ? W - 1 : 0, y: corner.startsWith('bottom') ? H - 1 : 0 }
}

/** The grid cell holding each LED, by inverting the helper. */
function cellsInChainOrder(wiring: MatrixWiring): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells[matrixLedIndex(x, y, W, H, wiring)] = { x, y }
  return cells
}

describe('matrixLedIndex', () => {
  it('covers all sixteen combinations', () => {
    expect(COMBINATIONS).toHaveLength(16)
  })

  for (const wiring of COMBINATIONS) {
    describe(name(wiring), () => {
      const cells = cellsInChainOrder(wiring)

      it('is a bijection onto 0..n-1', () => {
        const seen = new Set<number>()
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const led = matrixLedIndex(x, y, W, H, wiring)
          expect(Number.isInteger(led)).toBe(true)
          expect(led).toBeGreaterThanOrEqual(0)
          expect(led).toBeLessThan(W * H)
          seen.add(led)
        }
        expect(seen.size).toBe(W * H)
      })

      it('puts LED 0 in the chosen corner', () => {
        expect(cells[0]).toEqual(cornerCell(wiring.startCorner))
      })

      it('puts LED 1 next to it along the first run', () => {
        const corner = cornerCell(wiring.startCorner)
        const expected = wiring.firstRun === 'horizontal'
          ? { x: corner.x === 0 ? 1 : W - 2, y: corner.y }
          : { x: corner.x, y: corner.y === 0 ? 1 : H - 2 }
        expect(cells[1]).toEqual(expected)
      })

      it('steps one cell at a time through a zig-zag, and restarts each run otherwise', () => {
        const runLength = wiring.firstRun === 'horizontal' ? W : H
        for (let led = 1; led < W * H; led++) {
          const step = Math.abs(cells[led].x - cells[led - 1].x) + Math.abs(cells[led].y - cells[led - 1].y)
          const newRun = led % runLength === 0
          // Inside a run, and across a zig-zag fold, the next LED is adjacent.
          if (!newRun || wiring.serpentine) expect(step).toBe(1)
          // A progressive run jumps back to the start edge.
          else expect(step).toBe(runLength)
        }
      })

      it('is what buildXYTable bakes for a plain matrix', () => {
        const table = buildXYTable(W, H, { form: 'matrix', layout: 'matrix', ...wiring })
        const expected = Array.from({ length: W * H }, (_, cell) => matrixLedIndex(cell % W, Math.floor(cell / W), W, H, wiring))
        const identity = expected.every((led, cell) => led === cell)
        // The row-major identity is the memmove fast path: no table at all.
        if (identity) expect(table).toBeNull()
        else expect(table).toEqual(expected)
      })

      it('reports the same data-in corner and direction to the Build Diagram', () => {
        const entry = chainEntry(W, H, { form: 'matrix', ...wiring })!
        const corner = cornerCell(wiring.startCorner)
        expect({ x: entry.x * (W - 1), y: entry.y * (H - 1) }).toEqual(corner)
        expect({ dx: entry.dx, dy: entry.dy }).toEqual({ dx: cells[1].x - cells[0].x, dy: cells[1].y - cells[0].y })
      })
    })
  }
})

describe('matrix wiring defaults', () => {
  // The mapping every output had before the corner and direction existed,
  // restated here on purpose rather than read from the helper.
  const legacy = (x: number, y: number, width: number, serpentine: boolean) =>
    serpentine && (y & 1) ? y * width + (width - 1 - x) : y * width + x

  it('reproduces the old row-major and row zig-zag orders exactly', () => {
    for (const serpentine of [false, true]) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        expect(matrixLedIndex(x, y, W, H, { serpentine, startCorner: 'top-left', firstRun: 'horizontal' }))
          .toBe(legacy(x, y, W, serpentine))
      }
    }
  })

  it('reads an output saved without the new properties as top-left by rows', () => {
    expect(matrixWiringFromProps({ serpentine: true })).toEqual({ serpentine: true, startCorner: 'top-left', firstRun: 'horizontal' })
    expect(matrixWiringFromProps({ startCorner: 'middle', firstRun: 'diagonal' }))
      .toEqual({ serpentine: false, startCorner: 'top-left', firstRun: 'horizontal' })
    expect(buildXYTable(W, H, { serpentine: true }))
      .toEqual(buildXYTable(W, H, { serpentine: true, startCorner: 'top-left', firstRun: 'horizontal' }))
    expect(buildXYTable(W, H, { serpentine: false, startCorner: 'top-left', firstRun: 'horizontal' })).toBeNull()
  })
})

describe('where the start corner and first run apply', () => {
  const chosen = { startCorner: 'bottom-right', firstRun: 'vertical' }

  it('applies inside every panel of a panels layout, as serpentine does', () => {
    // Two 2x2 panels side by side, each wired from its bottom-left by columns.
    const table = buildXYTable(4, 2, { layout: 'panels', tilesX: 2, tilesY: 1, startCorner: 'bottom-left', firstRun: 'vertical', serpentine: true })
    // Panel 0: (0,1)=0 (0,0)=1 (1,0)=2 (1,1)=3. Panel 1 the same, offset by 4.
    expect(table).toEqual([1, 2, 5, 6, 0, 3, 4, 7])
  })

  it('applies after a panel is rotated, so it describes the panel as bought', () => {
    const wiring = { startCorner: 'top-right', firstRun: 'horizontal', serpentine: false }
    const upright = buildXYTable(2, 2, { layout: 'panels', tilesX: 1, tilesY: 1, ...wiring })!
    const turned = buildXYTable(2, 2, { layout: 'panels', tilesX: 1, tilesY: 1, tileRotations: '180', ...wiring })!
    // A half turn carries the top-right start to the bottom-left.
    expect(upright.indexOf(0)).toBe(1)
    expect(turned.indexOf(0)).toBe(2)
  })

  it('is ignored by a custom map', () => {
    const map = [3, 2, 1, 0, 4, 5]
    expect(buildXYTable(3, 2, { layout: 'custom', customXYMap: JSON.stringify(map), ...chosen })).toEqual(map)
    expect(matrixWiringApplies({ form: 'matrix', layout: 'custom' })).toBe(false)
  })

  it('is ignored by HUB75 panels, strings, rings and corkscrews', () => {
    for (const form of ['hub75', 'strip', 'ring', 'corkscrew']) {
      expect(matrixWiringApplies({ form })).toBe(false)
      expect(matrixWiringFromProps({ form, ...chosen })).toMatchObject({ startCorner: 'top-left', firstRun: 'horizontal' })
      expect(buildXYTable(4, 4, { form, ...chosen })).toEqual(buildXYTable(4, 4, { form }))
    }
    expect(matrixWiringApplies({ form: 'matrix' })).toBe(true)
    expect(matrixWiringApplies({ form: 'matrix', layout: 'panels' })).toBe(true)
  })
})

describe('chainEntry', () => {
  it('is the top-left corner heading right for a plain row-major grid', () => {
    expect(chainEntry(4, 3, {})).toEqual({ x: 0, y: 0, dx: 1, dy: 0 })
  })

  it('finds where a later stretch of the chain starts, for a data lane', () => {
    // 4x4 zig-zag by rows, second half: rows 2 and 3, starting at (0, 2).
    expect(chainEntry(4, 4, { serpentine: true }, 8, 8)).toEqual({ x: 0, y: 0, dx: 1, dy: 0 })
    // One row per lane: lane 2 is row 1, which a zig-zag enters from the right.
    expect(chainEntry(4, 4, { serpentine: true }, 4, 4)).toEqual({ x: 1, y: 0, dx: -1, dy: 0 })
  })

  it('reads a custom map from its table', () => {
    expect(chainEntry(2, 2, { layout: 'custom', customXYMap: '[3,2,1,0]' })).toEqual({ x: 1, y: 1, dx: -1, dy: 0 })
  })

  it('returns null for a degenerate grid', () => {
    expect(chainEntry(0, 4, {})).toBeNull()
  })
})

describe('data lanes on a matrix wired by columns', () => {
  it('cuts lanes on whole columns rather than whole rows', () => {
    const byRows = { form: 'matrix', width: 6, height: 4, chipset: 'WS2812B' }
    const byColumns = { ...byRows, firstRun: 'vertical' }
    expect(dataLaneUnit(byRows)).toBe(6)
    expect(dataLaneUnit(byColumns)).toBe(4)
    // 24 LEDs: rows of 6 split 2 or 4 ways, columns of 4 split 2, 3 or 6 ways.
    expect(offeredDataLaneCounts(byRows)).toEqual([1, 2, 4])
    expect(offeredDataLaneCounts(byColumns)).toEqual([1, 2, 3, 6])
  })

  it('keeps rows for a custom map, which ignores the first run', () => {
    expect(dataLaneUnit({ form: 'matrix', width: 6, height: 4, layout: 'custom', firstRun: 'vertical' })).toBe(6)
  })
})
