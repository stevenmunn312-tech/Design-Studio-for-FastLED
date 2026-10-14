/**
 * Frequency Band's slot rule, shared by the preview and the sketch.
 *
 * The audio token carries 32 spectrum slots, two per FastLED equaliser bin,
 * so a slot's centre frequency is its bin's (EQ_MIN_HZ to EQ_MAX_HZ, log
 * spaced). A band averages the slots whose centre lies inside [low, high]
 * and, when no centre does, the slot nearest the band's geometric middle, so
 * a narrow band still reads something rather than silence.
 */
import { EQ_MAX_HZ, EQ_MIN_HZ, EQ_NUM_BINS, logBinToFreq } from './fastledReactive'

export const SPECTRUM_SLOTS = 32

/** Centre frequency of each of the 16 equaliser bins, in Hz. */
export const EQ_BIN_CENTRES_HZ: readonly number[] = Array.from(
  { length: EQ_NUM_BINS },
  (_, i) => logBinToFreq(i, EQ_NUM_BINS, EQ_MIN_HZ, EQ_MAX_HZ),
)

/** The slider's reach: the equaliser's own range. */
export const BAND_HZ = { min: 20, max: 8000 } as const

export function clampBandHz(value: number, fallback: number): number {
  const n = Number.isFinite(value) ? value : fallback
  return Math.max(BAND_HZ.min, Math.min(BAND_HZ.max, n))
}

/** Centre frequency of spectrum slot `i` (0–31). */
export function slotCentreHz(i: number): number {
  return EQ_BIN_CENTRES_HZ[Math.min(EQ_NUM_BINS - 1, i >> 1)]
}

/** Which of the 32 slots a band reads; never empty. */
export function bandSlots(lowHz: number, highHz: number): number[] {
  const low = Math.min(lowHz, highHz), high = Math.max(lowHz, highHz)
  const inside: number[] = []
  for (let i = 0; i < SPECTRUM_SLOTS; i++) {
    const c = slotCentreHz(i)
    if (c >= low && c <= high) inside.push(i)
  }
  if (inside.length > 0) return inside
  const middle = Math.sqrt(low * high)
  let nearest = 0, best = Infinity
  for (let i = 0; i < SPECTRUM_SLOTS; i += 2) {
    const d = Math.abs(Math.log(slotCentreHz(i) / middle))
    if (d < best) { best = d; nearest = i }
  }
  return [nearest, nearest + 1]
}

/** The band's raw level: the mean of its slots, each clamped to 0–1. */
export function bandLevel(spectrum: readonly number[], lowHz: number, highHz: number): number {
  const slots = bandSlots(lowHz, highHz)
  let sum = 0
  for (const i of slots) sum += Math.max(0, Math.min(1, Number(spectrum[i]) || 0))
  return sum / slots.length
}
