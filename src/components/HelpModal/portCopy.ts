/**
 * Node Reference copy keyed by port dataType.
 *
 * Its own module rather than part of NodeReference.tsx so the coverage test can
 * import it without the component file exporting non-components (which turns
 * off fast refresh for the whole file).
 *
 * Both maps here are keyed by a live port `dataType`, and
 * `NodeReferenceCoverage.test.ts` keeps that true in both directions. Entries
 * for a type nothing carries any more describe wiring that cannot exist — the
 * reference kept `sdcard` and `shows` long after SD Card and Performance
 * Generator went portless — and a live type with no entry quietly falls back
 * to generic text, which is what `dmx` and `image` were doing.
 */

export const TYPE_GLYPH: Record<string, string> = {
  frame: '▦', palette: '≋', color: '●', audio: '⌁', float: '∿', bool: '◆',
  field: '⌖', music: '♫', image: '▥', dmx: '⎋', datetime: '◷', patternset: '◫', transitionset: '⇄', storage: '▤',
  playercontrols: '⌘', playerparticles: '✦', display: '▭',
  string: '≡', newcontrol: '+',
}

/**
 * The fallback description for a port, keyed the same way as TYPE_GLYPH. A
 * node's reference entry describes its own ports; this covers the rest.
 */
export const PORT_DESCRIPTIONS: Record<string, string> = {
  audio: 'a live microphone, line input, or analysed audio stream',
  bool: 'a true/false gate or one-frame trigger',
  color: 'a single RGB colour',
  field: 'a scalar value for every matrix coordinate',
  float: 'a numeric control signal',
  frame: 'a complete LED frame',
  palette: 'a reusable gradient of colours',
  patternset: 'a collection of saved pattern groups',
  display: 'everything a simple panel shows, in one wire — the source you plug in picks the layout',
  music: 'a library of analysed music tracks',
  transitionset: 'a curated set of transition styles',
  image: 'an uploaded picture as raw pixel data',
  dmx: 'one live DMX universe of 512 channels',
  datetime: 'a complete date, time, and clock-health reading',
  storage: 'a configured storage provider such as SD, onboard flash, or USB',
  playercontrols: 'a bundle of transport commands and normalized volume/brightness values, read by Music Player or by an LED output',
  playerparticles: 'the beat-particle overlay style and intensity configuration',
  string: 'a bounded line of display text',
  newcontrol: 'an invitation rather than a signal: drag it onto a property row to make a control for that property',
}
