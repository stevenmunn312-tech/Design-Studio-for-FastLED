import { IS_ROW_STRING_CPP, isRowString } from '../shared/stringCanvas'

/*
 * Which way Fire burns. `auto`, the default, rises up a matrix or ring and
 * burns from the first LED along a string, where `up` left a heat grid one
 * row tall with nothing to rise into. The preview resolves it on its own
 * canvas; the sketch resolves it at generation time, or, when each output
 * renders on its own canvas, from the pass's own WIDTH and HEIGHT
 * (`FIRE_ALONG_CPP`).
 */
export const FIRE_DIRECTIONS = ['auto', 'up', 'down', 'left', 'right'] as const
export type FireDirectionChoice = typeof FIRE_DIRECTIONS[number]
export type FireDirection = Exclude<FireDirectionChoice, 'auto'>

export function fireDirectionChoice(value: unknown): FireDirectionChoice {
  return (FIRE_DIRECTIONS as readonly string[]).includes(String(value)) ? value as FireDirectionChoice : 'auto'
}

/** The direction Fire burns on a W x H canvas. */
export function fireDirection(value: unknown, W: number, H: number): FireDirection {
  const choice = fireDirectionChoice(value)
  return choice === 'auto' ? (isRowString(W, H) ? 'right' : 'up') : choice
}

/** True on a canvas where `auto` burns along the rows; a C++ constant expression. */
export const FIRE_ALONG_CPP = IS_ROW_STRING_CPP
