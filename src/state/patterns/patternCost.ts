// What a library pattern costs to run, as Pattern Insights and the Pattern
// Collection picker show it. Both figures are estimates made in the browser:
//
// - Render weight is timed in a short pass of its own (patternRating.ts), on a
//   fixed 32x32 grid whatever grid the pattern is rated on, and expressed
//   against a plain Plasma pattern timed the same way on the same machine. So
//   it is one number per pattern, and a relative weight, not microcontroller
//   frame time.
// - Firmware RAM is not modelled here at all: it is the deploy gate's own
//   per-node model (`estimatePatternFirmwareRam` in validateGraph.ts), asked
//   about one pattern at a stated canvas size.
//
// This module is pure: no stores, so the picker, the popup and tests share it.

import { estimatePatternFirmwareRam, type PatternFirmwareRam } from '../../utils/validateGraph'
import type { SavedPattern } from './patternLibrary'

export type CostBand = 'light' | 'medium' | 'heavy'

export const COST_BANDS: CostBand[] = ['light', 'medium', 'heavy']

export const COST_BAND_LABEL: Record<CostBand, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
}

/** The side of the square grid every render weight is timed on. Fixed, so a
 *  pattern's weight does not depend on the project it was scanned in. */
export const RENDER_WEIGHT_GRID = 32

export interface PatternRenderCost {
  /** Microseconds of browser evaluation per frame on the timing grid. */
  usPerFrame: number
  /** `usPerFrame` over the reference pattern's, timed in the same session.
   *  1 is "as heavy as a plain Plasma". The bands read this. */
  relative: number
}

/**
 * One frame time from a timing pass, given the mean frame time of each of its
 * blocks. The fastest block: a pattern's work is the same every time, and
 * whatever else the machine did during a block (garbage collection, another
 * tab, the UI) can only have added to it. A mean or a median of the blocks
 * carries that noise into the figure, and the weight then changes between
 * scans.
 */
export function steadyFrameMs(blockFrameMs: readonly number[]): number {
  const timed = blockFrameMs.filter((ms) => Number.isFinite(ms) && ms > 0)
  return timed.length === 0 ? 0 : Math.min(...timed)
}

/** The render cost from a pattern's blocks and the reference's frame time, or
 *  undefined when either could not be timed (a zero reference would make
 *  every pattern infinitely heavy). */
export function renderCostFromBlocks(
  blockFrameMs: readonly number[], referenceFrameMs: number,
): PatternRenderCost | undefined {
  const frameMs = steadyFrameMs(blockFrameMs)
  if (!(frameMs > 0) || !(referenceFrameMs > 0)) return undefined
  return { usPerFrame: frameMs * 1000, relative: frameMs / referenceFrameMs }
}

// Band edges, as multiples of the reference Plasma pattern on the timing
// grid. Fitted to the bundled library on 2026-11-11: a third of it lands
// light and one pattern in six heavy (its median is 2.2 and its heaviest
// 9.8). Over four scans of that library a pattern's weight moved by 5% at the
// median and 12% at the ninetieth percentile, so a pattern close to an edge
// can still change band on a rescan.
export const RENDER_WEIGHT_MEDIUM = 1.3
export const RENDER_WEIGHT_HEAVY = 3.7

export function renderWeightBand(cost: Pick<PatternRenderCost, 'relative'>): CostBand {
  return cost.relative >= RENDER_WEIGHT_HEAVY ? 'heavy' : cost.relative >= RENDER_WEIGHT_MEDIUM ? 'medium' : 'light'
}

export interface PatternRamEstimate extends PatternFirmwareRam {
  /** The canvas the estimate was made for. */
  w: number
  h: number
  bytesPerLed: number
}

/** Estimated firmware RAM of one pattern on a `w` by `h` canvas. */
export function patternRamEstimate(pattern: SavedPattern, dims: { w: number; h: number }): PatternRamEstimate {
  const ram = estimatePatternFirmwareRam(pattern.subgraph, dims)
  return { ...ram, w: dims.w, h: dims.h, bytesPerLed: ram.totalBytes / Math.max(1, dims.w * dims.h) }
}

// Band edges in bytes per LED, so the band does not change with the canvas: a
// CRGB frame buffer is 3 bytes per LED and a float field 4. Up to four frame
// buffers is light; past ten frames' worth (a fluid or reaction-diffusion
// simulation, a long Frame Feedback history) is heavy. In the bundled library
// on 2026-11-11 about one pattern in eight is over 30.
export const RAM_MEDIUM_BYTES_PER_LED = 12
export const RAM_HEAVY_BYTES_PER_LED = 30

export function ramBand(ram: Pick<PatternRamEstimate, 'bytesPerLed'>): CostBand {
  return ram.bytesPerLed > RAM_HEAVY_BYTES_PER_LED ? 'heavy' : ram.bytesPerLed > RAM_MEDIUM_BYTES_PER_LED ? 'medium' : 'light'
}

/** The heavier of the two bands. A pattern that has not been judged yet has
 *  no render weight, so it is banded on RAM alone. */
export function patternCostBand(render: PatternRenderCost | undefined, ram: PatternRamEstimate): CostBand {
  const rank = Math.max(
    COST_BANDS.indexOf(ramBand(ram)),
    render ? COST_BANDS.indexOf(renderWeightBand(render)) : 0,
  )
  return COST_BANDS[rank]
}

export function formatRenderWeight(relative: number): string {
  return `${relative >= 10 ? Math.round(relative) : relative.toFixed(1)}×`
}

export function formatRamBytes(bytes: number): string {
  if (bytes < 1000) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`
}

/** One sentence for a tooltip: where the RAM figure goes in a show. */
export function ramBreakdownText(ram: PatternRamEstimate): string {
  return `About ${formatRamBytes(ram.totalBytes)} on a ${ram.w}×${ram.h} canvas: `
    + `${formatRamBytes(ram.keptBytes)} it keeps for as long as it is in the sketch, `
    + `and ${formatRamBytes(ram.scratchBytes)} of render buffers a Pattern Collection shares between its patterns.`
}
