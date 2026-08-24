/**
 * Node Reference copy keyed by port dataType.
 *
 * Its own module rather than part of NodeReference.tsx so the coverage test can
 * import it without the component file exporting non-components (which turns
 * off fast refresh for the whole file).
 *
 * Every map here is keyed by a live port `dataType`, and
 * `NodeReferenceCoverage.test.ts` keeps that true in both directions. Entries
 * for a type nothing carries any more describe wiring that cannot exist — the
 * reference kept `sdcard` and `shows` long after SD Card and Performance
 * Generator went portless — and a live type with no entry quietly falls back
 * to generic text, which is what `dmx` and `image` were doing.
 */

export const TYPE_GLYPH: Record<string, string> = {
  frame: '▦', palette: '≋', color: '●', audio: '⌁', float: '∿', bool: '◆',
  field: '⌖', music: '♫', image: '▥', dmx: '⎋', datetime: '◷', patternset: '◫', transitionset: '⇄', storage: '▤',
}

/**
 * Bespoke copy per port dataType, keyed the same way as TYPE_GLYPH.
 *
 * Exported only so `NodeReferenceCoverage.test.ts` can hold these in step
 * with NODE_LIBRARY: an entry for a dataType no port carries any more
 * describes wiring that cannot exist, and a live dataType with no entry
 * silently falls back to generic text.
 */
export const OUTPUT_USE_CASES: Record<string, string> = {
  audio: 'It usually sits near the start of the graph and feeds analyzers, beat detectors, or audio-reactive patterns.',
  bool: 'Its output is most useful for gates, pulses, flash triggers, comparisons, and beat-driven state changes.',
  color: 'Its output is typically wired into Solid Color, shapes, text, gradients, or another colour-processing node.',
  field: 'Its output is usually followed by Field → Frame or another field-processing node before it becomes visible pixels.',
  float: 'Its output is typically wired into sliders-as-inputs such as speed, amount, fade, scale, or brightness.',
  frame: 'Its frame can go straight to the LED output, or pass through Blend, Blur 2D, Transform, Fade, or Transition first.',
  palette: 'Its palette is typically sampled by Noise, Spectrum Bars, Field → Frame, or Palette Sampler.',
  patternset: 'Its output is used by Music Player or Performance Generator to run a reusable multi-pattern show.',
  music: 'Its output is used by Performance Generator to create timed show events from analysed tracks.',
  transitionset: 'Its output widens the pool of transitions — for Music Player live, or Performance Generator on export.',
  image: 'Its output is the validated picture itself, ready for Palette from Image or another data-only consumer.',
  dmx: 'Its output is one live DMX universe, which DMX Channel decodes into individual slot values.',
  datetime: 'Its output carries a complete clock reading to Clock Display or other time-aware nodes over one wire.',
  storage: 'Its output identifies the configured storage provider for player and file workflows.',
}

export const PORT_DESCRIPTIONS: Record<string, string> = {
  audio: 'a live microphone, line input, or analysed audio stream',
  bool: 'a true/false gate or one-frame trigger',
  color: 'a single RGB colour',
  field: 'a scalar value for every matrix coordinate',
  float: 'a numeric control signal',
  frame: 'a complete LED matrix frame',
  palette: 'a reusable gradient of colours',
  patternset: 'a collection of saved pattern groups',
  music: 'a library of analysed music tracks',
  transitionset: 'a curated set of transition styles',
  image: 'an uploaded picture as raw pixel data',
  dmx: 'one live DMX universe of 512 channels',
  datetime: 'a complete date, time, and clock-health reading',
  storage: 'a configured storage provider such as SD, onboard flash, or USB',
}
