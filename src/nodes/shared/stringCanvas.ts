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
