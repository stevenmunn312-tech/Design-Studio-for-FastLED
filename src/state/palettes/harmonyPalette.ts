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

/** Hue in degrees of stop `index` (0–15): the anchors' offsets interpolated
 *  linearly along the palette, then scaled by `spread` (0 is one hue, 1 is the
 *  full harmony). The C++ twin in `nodes/color/codegen.ts` runs this loop. */
export function harmonyStopHue(kind: HarmonyKind, index: number, hue: number, spread: number): number {
  const offsets = HARMONY_OFFSETS[kind]
  const pos = (index / 15) * (offsets.length - 1)
  const j = Math.min(offsets.length - 2, Math.floor(pos))
  const offset = offsets[j] + (offsets[j + 1] - offsets[j]) * (pos - j)
  const h = (hue + offset * spread) % 360
  return h < 0 ? h + 360 : h
}

export function harmonyStops16(kind: HarmonyKind, hue: number, saturation: number, value: number, spread: number): RGB[] {
  const s = Math.max(0, Math.min(1, saturation)), v = Math.max(0, Math.min(1, value))
  const k = Math.max(0, Math.min(1, spread))
  return Array.from({ length: 16 }, (_, i) => hsv(harmonyStopHue(kind, i, hue, k), s, v))
}
