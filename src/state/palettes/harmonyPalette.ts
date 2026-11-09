import { type RGB, hsv } from './ledColor'

/** Colour-wheel offsets, in degrees from the base hue, of each harmony's
 *  anchors, in the order the palette runs through them. Append-only: a saved
 *  graph names a harmony by key. */
export const HARMONY_OFFSETS = {
  complementary: [0, 180],
  analogous: [-30, 0, 30],
  triadic: [0, 120, 240],
  splitComplementary: [0, 150, 210],
  tetradic: [0, 90, 180, 270],
} as const satisfies Record<string, readonly number[]>

export type HarmonyKind = keyof typeof HARMONY_OFFSETS
export const HARMONY_KINDS = Object.keys(HARMONY_OFFSETS) as HarmonyKind[]

export function harmonyKind(value: unknown): HarmonyKind {
  return (HARMONY_KINDS as string[]).includes(String(value)) ? String(value) as HarmonyKind : 'triadic'
}

/**
 * Share of the gap between two neighbouring harmony hues spent blending from
 * one to the other; the rest of the gap holds each hue as a band. The blend
 * is straight through RGB, so it never passes through the hues between: an
 * interpolated hue once swept complementary red through orange, yellow and
 * green on its way to cyan, and made every harmony a rainbow segment.
 */
export const HARMONY_BLEND = 0.4

/**
 * Where stop `index` (0–15) of a palette with `count` harmony hues sits: the
 * hue `band` it starts from and how far (`mix`, 0–1) it has blended toward
 * the next. It depends only on the harmony, so the sketch bakes the same
 * numbers as tables and runs only the colours at run time.
 */
export function harmonyStopPlace(count: number, index: number): { band: number; mix: number } {
  if (count < 2) return { band: 0, mix: 0 }
  const x = (index / 15) * (count - 1)
  const band = Math.min(count - 2, Math.floor(x))
  const hold = (1 - HARMONY_BLEND) / 2
  const mix = Math.max(0, Math.min(1, (x - band - hold) / HARMONY_BLEND))
  return { band, mix }
}

/** Hue in degrees of harmony hue `band`, its offset scaled by `spread` (0 is one hue, 1 the full harmony). */
export function harmonyBandHue(kind: HarmonyKind, band: number, hue: number, spread: number): number {
  const h = (hue + HARMONY_OFFSETS[kind][band] * spread) % 360
  return h < 0 ? h + 360 : h
}

/**
 * How much of the brightness is left at a blend `mix`: 1 within a band, and
 * dipping to `1 − shade` half way between two bands, so Shade 1 puts a black
 * trough between the hues and gives a full-frame pattern its contrast.
 */
export function harmonyShade(mix: number, shade: number): number {
  return 1 - Math.max(0, Math.min(1, shade)) * (1 - Math.abs(2 * mix - 1))
}

/** The 16-entry harmony palette. The C++ twin in `nodes/color/codegen.ts` runs the same steps. */
export function harmonyStops16(kind: HarmonyKind, hue: number, saturation: number, value: number, spread: number, shade = 0): RGB[] {
  const s = Math.max(0, Math.min(1, saturation)), v = Math.max(0, Math.min(1, value))
  const k = Math.max(0, Math.min(1, spread))
  const bands = HARMONY_OFFSETS[kind].map((_, band) => hsv(harmonyBandHue(kind, band, hue, k), s, v))
  return Array.from({ length: 16 }, (_, i) => {
    const { band, mix } = harmonyStopPlace(bands.length, i)
    const a = bands[band], b = bands[Math.min(bands.length - 1, band + 1)]
    const dim = harmonyShade(mix, shade)
    const channel = (from: number, to: number) => Math.floor((from + (to - from) * mix) * dim + 0.5)
    return { r: channel(a.r, b.r), g: channel(a.g, b.g), b: channel(a.b, b.b) }
  })
}
