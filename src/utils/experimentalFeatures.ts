// What the app calls experimental, in one place.
//
// `docs/release/beta-support-matrix.md` is the authority: a feature is
// experimental until a dated bench row graduates it. The matrix names them in
// prose, so the surfaces that offer those features (a Music Source option, the
// several-boards sync toggle) read this list to carry the word, rather than
// each deciding for itself what counts.

export const EXPERIMENTAL_LABEL = 'experimental'

export const EXPERIMENTAL_NOTE = 'Present in the product, not yet validated on a bench; see the beta support matrix.'

/**
 * Select options the matrix lists under "Experimental until validated", by
 * node type and property. Bluetooth and Internet Radio music have compiled but
 * never run on a board.
 */
const EXPERIMENTAL_PROPERTY_OPTIONS: Record<string, Record<string, ReadonlySet<string>>> = {
  PatternMaster: { musicSource: new Set(['Bluetooth', 'Internet Radio']) },
}

export function isExperimentalPropertyOption(nodeType: string, key: string, option: string): boolean {
  return EXPERIMENTAL_PROPERTY_OPTIONS[nodeType]?.[key]?.has(option) ?? false
}
