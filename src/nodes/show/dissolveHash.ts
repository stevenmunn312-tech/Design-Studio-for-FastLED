/*
 * The per-pixel order in which a dissolve reveals B, shared by the preview
 * (`evalDissolve`), the Transition node's firmware and the show/player
 * `compositeTransition` helper. One integer mixer, written once for each
 * language, so the three agree pixel for pixel. A plain LCG step over the
 * pixel index is not enough: its low bits form a regular lattice, which reads
 * as diagonal stripes rather than a dissolve.
 */

/** 16-bit reveal rank of LED index `i`; the pixel shows B once `rank < threshold`. */
export function dissolveRank(i: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  h = Math.imul(h, 0x85ebca77) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  return h >>> 16
}

/** Reveal threshold for progress `tt`: none at 0, every pixel at 1. */
export function dissolveThreshold(tt: number): number {
  return Math.floor(Math.max(0, Math.min(1, tt)) * 65536)
}

/**
 * C++ statements declaring `uint32_t <rank>` for LED index `index`. The
 * threshold is `(uint32_t)(constrain(tt,0.0f,1.0f)*65536.0f)`.
 */
export function dissolveRankCpp(rank: string, index: string): string {
  return `uint32_t ${rank}=(uint32_t)((${index})+1)*0x9E3779B1u; ${rank}^=${rank}>>15; ${rank}*=0x85EBCA77u; ${rank}^=${rank}>>13; ${rank}>>=16;`
}

export function dissolveThresholdCpp(tt: string): string {
  return `(uint32_t)(constrain(${tt},0.0f,1.0f)*65536.0f)`
}
