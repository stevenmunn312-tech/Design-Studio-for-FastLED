/*
 * Design Studio for FastLED AnimARTrix integration
 * SPDX-License-Identifier: CC-BY-NC-SA-4.0
 *
 * AnimARTrix was created by Stefan Petrick. This adaptation adds a shared,
 * deliberately musical control layer and matching browser/firmware renderers.
 * Source project: https://github.com/StefanPetrick/animartrix
 */

export const ANIMARTRIX_EFFECTS = [
  'Water',
  'Polar Waves',
  'RGB Blobs',
  'Spiralus',
  'Complex Kaleido',
] as const

export type AnimartrixEffect = (typeof ANIMARTRIX_EFFECTS)[number]

export function asAnimartrixEffect(value: unknown): AnimartrixEffect {
  const effect = String(value ?? 'Water')
  return (ANIMARTRIX_EFFECTS as readonly string[]).includes(effect)
    ? effect as AnimartrixEffect
    : 'Water'
}
