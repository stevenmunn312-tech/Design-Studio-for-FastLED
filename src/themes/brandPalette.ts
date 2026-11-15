/**
 * The brand palette for canvas drawing, which cannot read CSS variables.
 * Mirrors the --brand-* tokens in tokens.css (a test keeps them equal):
 * white-LED colour temperatures from candle (1900K) to sky (12000K).
 */
export const BRAND_KELVIN = [
  '#ff8912', // candle, 1900K
  '#ff9d3f', // warm white, 2400K
  '#ffb46b', // soft white, 3000K
  '#ffcea6', // neutral, 4000K
  '#ffecdf', // daylight, 5500K
  '#e3e9ff', // cool white, 8000K
  '#bfd3ff', // sky, 12000K
] as const

/** Where Soft white (the UI accent) and Sky sit on the sweep. */
export const KELVIN_SOFT_WHITE = 2 / 6
export const KELVIN_SKY = 1

const RGB = BRAND_KELVIN.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)))

/**
 * CSS colour at `position` along the sweep (0 candle, 1 sky; values outside
 * clamp). `shade` lifts toward white when positive and dims toward black when
 * negative, by that fraction.
 */
export function kelvinColour(position: number, shade = 0, alpha = 1): string {
  const t = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0)) * (RGB.length - 1)
  const low = Math.min(RGB.length - 2, Math.floor(t))
  const mix = t - low
  const target = shade >= 0 ? 255 : 0
  const amount = Math.min(1, Math.abs(shade))
  const [r, g, b] = RGB[low].map((channel, i) => {
    const swept = channel + (RGB[low + 1][i] - channel) * mix
    return Math.round(swept + (target - swept) * amount)
  })
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}
