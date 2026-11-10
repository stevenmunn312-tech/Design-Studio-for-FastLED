/*
 * A string renders on a canvas one row tall (src/state/output/ledOutputForm.ts),
 * so a pattern that rises, falls or sizes itself by the shorter side has
 * nothing to work with there. Nodes whose `auto` direction runs along a
 * string, and Blobs' sizing, share this one test so they agree on what a
 * string is. A matrix keeps its usual orientation: a wide panel still has
 * room for a flame to rise.
 */

/** Rows at or under which a wider canvas counts as a string. */
export const STRING_MAX_ROWS = 2

/** Whether a W x H canvas is a string laid along its rows. */
export function isRowString(W: number, H: number): boolean {
  return W > H && H <= STRING_MAX_ROWS
}

/** The same test as a C++ constant expression over the render size. */
export const IS_ROW_STRING_CPP = `(WIDTH>HEIGHT&&HEIGHT<=${STRING_MAX_ROWS})`

/**
 * The side a centred pattern sizes itself by: a matrix's shorter side, or the
 * length of a canvas one pixel across, where the shorter side is that one
 * pixel and a circle sized by it was a speck. Shape Field, Path, Fourier
 * Epicycles and Scale with matrix read it. Only an exact single row or column
 * counts, so every matrix keeps the shorter side it was tuned against.
 */
export function sizingSide(W: number, H: number): number {
  return Math.min(W, H) === 1 ? Math.max(W, H) : Math.min(W, H)
}

/** `sizingSide` as a C++ constant expression over the render size. */
export const SIZING_SIDE_CPP = '(min(WIDTH,HEIGHT)==1?max(WIDTH,HEIGHT):min(WIDTH,HEIGHT))'

/**
 * Whether a point moving round a 2-D path runs flat. A canvas one row tall
 * has no vertical reach to give it: the middle slice of a circle lit only
 * where the curve crossed the row. Path and Fourier Epicycles hold their
 * point (and so their trail) on the row instead, so it sweeps along the
 * strip with the path's horizontal motion. Only an exact single row counts:
 * every canvas two rows and up, a single column included, keeps the full
 * path, so no matrix render moves.
 */
export function flatPathRow(H: number): boolean {
  return H === 1
}

/** `flatPathRow` as a C++ constant expression over the render size. */
export const FLAT_PATH_ROW_CPP = '(HEIGHT==1)'
