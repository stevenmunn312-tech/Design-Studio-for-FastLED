// Where a level shifter's pins are, read from the part's own measured `pads`.
// Pure, so the manifest validator can refuse a block whose labels name no pad
// and the Build Diagram can place the chip from the same answer.
//
// The package is a dual-row part: its pads sit in two columns, left and right
// of the render's centre, on shared rows. A pin is `{ side, row }`, the row
// counted from the top of its column.

import type { PartLevelShifterSpec } from '../partCatalogue'

export type LevelShifterSide = 'left' | 'right'

export interface LevelShifterPin {
  side: LevelShifterSide
  row: number
}

export interface LevelShifterPads {
  /** Pin number (1-based, the package's pin order is the `pads` order) by pad label. */
  pinNumbers: Map<string, number>
  rows: number
  /** Render pixels: the first row, the pitch between rows, and the two columns. */
  firstRowPx: number
  rowPitchPx: number
  leftXPx: number
  rightXPx: number
  channelPins: Array<{ a: LevelShifterPin; y: LevelShifterPin; oe: LevelShifterPin }>
  vcc: LevelShifterPin
  gnd: LevelShifterPin
}

export interface LevelShifterPadPoint {
  label: string
  xPx: number
  yPx: number
}

const ROW_TOLERANCE_PX = 0.01

/** The pin layout the block's labels resolve to, or why they do not. */
export function resolveLevelShifterPads(
  block: PartLevelShifterSpec,
  pads: readonly LevelShifterPadPoint[] | undefined,
  renderWidthPx: number | undefined,
): { layout: LevelShifterPads } | { issue: string } {
  if (!pads || pads.length < 2 || !renderWidthPx) return { issue: 'needs measured pads on a render' }
  if (block.channelPads.length !== block.channels) {
    return { issue: `names pads for ${block.channelPads.length} channels, not ${block.channels}` }
  }
  if (block.supplyMaxV < block.supplyMinV) return { issue: 'supplyMaxV is below supplyMinV' }
  const centre = renderWidthPx / 2
  const ys = [...new Set(pads.map((pad) => pad.yPx))].sort((a, b) => a - b)
  const rows = ys.filter((y, index) => index === 0 || y - ys[index - 1] > ROW_TOLERANCE_PX)
  if (rows.length < 2) return { issue: 'needs pads on at least two rows' }
  const rowPitchPx = (rows[rows.length - 1] - rows[0]) / (rows.length - 1)
  const pins = new Map<string, LevelShifterPin>()
  const pinNumbers = new Map<string, number>()
  const left: number[] = []
  const right: number[] = []
  for (const [index, pad] of pads.entries()) {
    const row = rows.findIndex((candidate) => Math.abs(candidate - pad.yPx) <= ROW_TOLERANCE_PX)
    if (Math.abs((rows[row] - rows[0]) - (row * rowPitchPx)) > ROW_TOLERANCE_PX) return { issue: 'needs evenly spaced rows' }
    const side: LevelShifterSide = pad.xPx < centre ? 'left' : 'right'
    ;(side === 'left' ? left : right).push(pad.xPx)
    if (pins.has(pad.label)) return { issue: `labels pad "${pad.label}" more than once` }
    pins.set(pad.label, { side, row })
    pinNumbers.set(pad.label, index + 1)
  }
  if (left.length === 0 || right.length === 0) return { issue: 'needs pads on both sides of the render' }
  const missing = (labels: string[]) => labels.filter((label) => !pins.has(label))
  const named = [...block.channelPads.flatMap((channel) => [channel.in, channel.out, channel.oe]), block.vccPad, block.gndPad]
  const unmeasured = missing(named)
  if (unmeasured.length > 0) return { issue: `names a pad that is not measured: ${[...new Set(unmeasured)].join(', ')}` }
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    layout: {
      pinNumbers,
      rows: rows.length,
      firstRowPx: rows[0],
      rowPitchPx,
      leftXPx: mean(left),
      rightXPx: mean(right),
      channelPins: block.channelPads.map((channel) => ({
        a: pins.get(channel.in)!,
        y: pins.get(channel.out)!,
        oe: pins.get(channel.oe)!,
      })),
      vcc: pins.get(block.vccPad)!,
      gnd: pins.get(block.gndPad)!,
    },
  }
}

/** Why a level shifter block cannot be drawn from the part's pads, or null when it can. */
export function levelShifterBlockIssue(block: unknown, pads: unknown, render: unknown): string | null {
  if (typeof block !== 'object' || block === null) return null
  const widthPx = typeof render === 'object' && render !== null ? (render as { widthPx?: unknown }).widthPx : undefined
  const resolved = resolveLevelShifterPads(
    block as PartLevelShifterSpec,
    Array.isArray(pads) ? pads as LevelShifterPadPoint[] : undefined,
    typeof widthPx === 'number' ? widthPx : undefined,
  )
  return 'issue' in resolved ? resolved.issue : null
}
