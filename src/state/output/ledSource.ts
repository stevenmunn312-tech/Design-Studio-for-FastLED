// The saved "Match LED output" choice on String Particles and Network Ripple.
// Import-free so the node library can read it; the matching itself is in
// ledOutputMatch.ts, which needs the board partition and so the library.

export const LED_SOURCES = ['match', 'custom'] as const
export type LedSource = (typeof LED_SOURCES)[number]

/** The saved choice. Only an explicit `match` follows the output; a missing key is `custom`. */
export function ledSource(value: unknown): LedSource {
  return value === 'match' ? 'match' : 'custom'
}
