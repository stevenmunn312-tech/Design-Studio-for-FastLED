// What a library pattern costs to run, as Pattern Insights and the Pattern
// Collection picker show it. Both figures are estimates made in the browser:
//
// - Render weight is measured while the rating render runs (patternRating.ts)
//   and expressed against a plain Plasma pattern timed on the same machine, so
//   it is a relative weight, not microcontroller frame time.
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

/** Evaluation time of each scored frame, in milliseconds. */
export interface RenderTimingSamples { frameMs: number[] }

export interface PatternRenderCost {
  /** Microseconds of browser evaluation per LED per frame at the rating grid. */
  usPerLed: number
  /** `usPerLed` over the reference pattern's, timed in the same session at the
   *  same grid. 1 is "as heavy as a plain Plasma". The bands read this. */
  relative: number
  gridW: number
  gridH: number
  /** Scored frames the figure was averaged over. */
  frames: number
}

/** A pause this long, and this far above the run's typical frame, is the
 *  garbage collector or a busy tab rather than the pattern. */
const STALL_FLOOR_MS = 2
const STALL_FACTOR = 10

/**
 * Mean evaluation time of a frame. A mean on purpose: browsers coarsen
 * `performance.now()` (to 0.1 ms or worse), so a light pattern on a short
 * string reads as mostly zeroes with the odd tick, and a median or a trimmed
 * mean of that is zero. Only outright stalls are set aside, judged against
 * the median so that one stall cannot raise its own limit.
 */
export function meanFrameMs(frameMs: readonly number[]): number {
  if (frameMs.length === 0) return 0
  const sorted = [...frameMs].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const limit = Math.max(STALL_FLOOR_MS, median * STALL_FACTOR)
  const kept = frameMs.filter((ms) => ms <= limit)
  return kept.reduce((sum, ms) => sum + ms, 0) / Math.max(1, kept.length)
}

/** Microseconds per LED per frame: per LED so two grids can be compared. */
export function usPerLed(frameMs: readonly number[], gridW: number, gridH: number): number {
  return (meanFrameMs(frameMs) * 1000) / Math.max(1, gridW * gridH)
}

/** The render cost of one rating run, or undefined when nothing was timed or
 *  the reference could not be (a zero reference would make every pattern
 *  infinitely heavy). */
export function renderCostFromTiming(
  samples: RenderTimingSamples, gridW: number, gridH: number, referenceUsPerLed: number,
): PatternRenderCost | undefined {
  if (samples.frameMs.length === 0 || !(referenceUsPerLed > 0)) return undefined
  const us = usPerLed(samples.frameMs, gridW, gridH)
  if (!Number.isFinite(us)) return undefined
  return { usPerLed: us, relative: us / referenceUsPerLed, gridW, gridH, frames: samples.frameMs.length }
}

// Band edges, as multiples of the reference Plasma pattern on a large grid.
export const RENDER_WEIGHT_MEDIUM = 1.3
export const RENDER_WEIGHT_HEAVY = 3.5
// Part of a pattern's frame does not grow with the LED count: audio analysis,
// signal maths, the walk over the graph. The Plasma reference has almost none
// of it, so on a small grid that fixed work is spread over fewer LEDs and
// every pattern's multiple rises (the bundled library's median is about 2.5x
// at 32x32 and 4.6x on a 64-LED string). The edges rise with it, by this many
// LEDs' worth of reference work, so that a band means the same place in the
// library at any grid. Fitted to the bundled library on 2026-11-11 at 64, 256,
// 512 and 1024 LEDs: about a third of it lands light and one pattern in six
// heavy. Timing varies by around 15% between runs, so a pattern near an edge
// can change band on a rescan.
const FIXED_WORK_ALLOWANCE_MEDIUM = 100
const FIXED_WORK_ALLOWANCE_HEAVY = 330

/** The two band edges for a rating grid, as multiples of the reference. */
export function renderWeightEdges(gridW: number, gridH: number): { medium: number; heavy: number } {
  const leds = Math.max(1, gridW * gridH)
  return {
    medium: RENDER_WEIGHT_MEDIUM + FIXED_WORK_ALLOWANCE_MEDIUM / leds,
    heavy: RENDER_WEIGHT_HEAVY + FIXED_WORK_ALLOWANCE_HEAVY / leds,
  }
}

export function renderWeightBand(cost: Pick<PatternRenderCost, 'relative' | 'gridW' | 'gridH'>): CostBand {
  const edges = renderWeightEdges(cost.gridW, cost.gridH)
  return cost.relative >= edges.heavy ? 'heavy' : cost.relative >= edges.medium ? 'medium' : 'light'
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
