import type { SongAnalysis, SongSection, ShowFile, ShowEvent, AudioEnvelope, EnergyPoint } from '../types/showFile'
import { encodeSpectrumBytes, spectrumBytes, SPECTRUM_TRACK_BINS, type SpectrumTrack } from '../audio/spectrumTrack'
import {
  DETECTOR_KINDS, DETECTOR_RECORD_BYTES, DETECTOR_TRAILER_FLAG_PITCH, DETECTOR_TRAILER_FLAG_STRUCTURE,
  DETECTOR_TRAILER_FLAG_VIBE, DETECTOR_TRAILER_VERSION, detectorBytes, encodeDetectorBytes,
  resampleDetectorBytes, type DetectorKind, type DetectorTracks,
} from '../audio/detectorTrack'
import { PALETTE_IDS, STUDIO_PALETTES, isStudioPalette } from '../state/palettes/paletteCatalog'
import { BUILTIN_SHOW_PATTERN_NAMES } from '../state/player/builtinShowPatterns'
import {
  clampPatternWeight, energyBandFromIntensity, isEnergyBand, nextPatternIndex, sectionEnergyIntensity,
  type EnergyBand, type PickEntry,
} from '../state/patterns/patternPick'

// Frame rate of the baked audio envelope (see bakeEnvelope). 50 Hz is smooth
// enough for per-frame band reactivity while staying small (21 bytes/frame).
export const ENVELOPE_RATE_HZ = 50

// The live mic path (audioEngine.ts) tracks a single decaying peak across all
// bands (`agcPeak = max(peak, agcPeak * 0.999)` per ~60fps frame — a ~11.5s
// half-life) and scales bass/mids/treble by it, so a quiet verse still swings
// through most of 0–1 relative to whatever was loudest recently. The baked
// envelope's bands are normalised once by the whole song's peak (see
// normalizeEnergy), so anything short of the song's single loudest moment
// reads flat by comparison. agcNormalize reproduces the live engine's rolling
// peak here so a collection pattern's FFTAnalyzer/BeatDetect react with the
// same punch whether driven by Performance Generator's baked track or a live
// mic, keeping a pattern usable in either engine without re-tuning.
const AGC_DECAY_PER_SEC = 0.9417
const AGC_FLOOR = 0.05

/** Rescale bass/mids/treble in place by one shared decaying peak (matching the
 *  live engine's single agcPeak across bands, so relative band balance is kept). */
function agcNormalize(bass: number[], mids: number[], treble: number[], rateHz: number): void {
  const decay = Math.pow(AGC_DECAY_PER_SEC, 1 / rateHz)
  let peak = AGC_FLOOR
  for (let k = 0; k < bass.length; k++) {
    const raw = Math.max(bass[k], mids[k], treble[k])
    peak = Math.max(raw, peak * decay)
    const scale = 1 / Math.max(peak, AGC_FLOOR)
    bass[k]   = Math.min(1, bass[k]   * scale)
    mids[k]   = Math.min(1, mids[k]   * scale)
    treble[k] = Math.min(1, treble[k] * scale)
  }
}

/** Resample a spectrum track to `frameCount` frames at `rateHz` (linear in time).
 *  The equalizer bins are already adaptively normalised, so no AGC applies. */
function resampleSpectrum(track: SpectrumTrack, rateHz: number, frameCount: number): string {
  const src = spectrumBytes(track, track.data)
  const srcFrames = Math.floor(src.length / SPECTRUM_TRACK_BINS)
  const out = new Uint8Array(frameCount * SPECTRUM_TRACK_BINS)
  if (srcFrames === 0) return encodeSpectrumBytes(out)
  for (let k = 0; k < frameCount; k++) {
    const pos = (k / rateHz) * track.rateHz
    const i = Math.min(srcFrames - 1, Math.floor(pos))
    const j = Math.min(srcFrames - 1, i + 1)
    const f = Math.min(1, pos - i)
    for (let b = 0; b < SPECTRUM_TRACK_BINS; b++) {
      const a = src[i * SPECTRUM_TRACK_BINS + b]
      out[k * SPECTRUM_TRACK_BINS + b] = Math.round(a + (src[j * SPECTRUM_TRACK_BINS + b] - a) * f)
    }
  }
  return encodeSpectrumBytes(out)
}

/** The analysis's baked detector tracks at the envelope's frames, nearest
 *  frame with the one-frame events carried over (see resampleDetectorBytes).
 *  A track the analysis lacks stays absent, so the node reads inactive. */
function resampleDetectors(tracks: DetectorTracks | undefined, rateHz: number, frameCount: number): Partial<Record<DetectorKind, string>> {
  const out: Partial<Record<DetectorKind, string>> = {}
  if (!tracks || !(tracks.rateHz > 0)) return out
  for (const kind of DETECTOR_KINDS) {
    const data = tracks[kind]
    if (typeof data !== 'string') continue
    out[kind] = encodeDetectorBytes(resampleDetectorBytes(detectorBytes(tracks, kind, data), kind, tracks.rateHz, rateHz, frameCount))
  }
  return out
}

/**
 * Resample the analysis's ~100 ms energy envelope to a fixed `rateHz` bass/mids/
 * treble track (0–1) so the player can drive a pattern's FFTAnalyzer in perfect
 * sync with the song. Linear interpolation between analysis points, then an
 * AGC-style rolling-peak rescale (see agcNormalize) so the baked track reacts
 * with the same dynamic range as the live mic path.
 */
export function bakeEnvelope(analysis: SongAnalysis, rateHz = ENVELOPE_RATE_HZ): AudioEnvelope {
  const pts = analysis.energy
  const frameCount = Math.max(1, Math.floor((analysis.durationMs / 1000) * rateHz))
  const bass: number[] = new Array(frameCount)
  const mids: number[] = new Array(frameCount)
  const treble: number[] = new Array(frameCount)
  let pi = 0
  for (let k = 0; k < frameCount; k++) {
    const tms = (k / rateHz) * 1000
    while (pi < pts.length - 1 && pts[pi + 1].t <= tms) pi++
    const a = pts[pi]
    const b = pts[Math.min(pts.length - 1, pi + 1)]
    const span = b.t - a.t
    const f = span > 0 ? Math.max(0, Math.min(1, (tms - a.t) / span)) : 0
    bass[k]   = a.bass   + (b.bass   - a.bass)   * f
    mids[k]   = a.mids   + (b.mids   - a.mids)   * f
    treble[k] = a.treble + (b.treble - a.treble) * f
  }
  agcNormalize(bass, mids, treble, rateHz)
  const levels = analysis.channelLevels
  const leftLevel: number[] = new Array(frameCount).fill(0)
  const rightLevel: number[] = new Array(frameCount).fill(0)
  let li = 0
  for (let k = 0; levels.length > 0 && k < frameCount; k++) {
    const tms = (k / rateHz) * 1000
    while (li < levels.length - 1 && levels[li + 1].t <= tms) li++
    const a = levels[li]
    const b = levels[Math.min(levels.length - 1, li + 1)]
    const span = b.t - a.t
    const f = span > 0 ? Math.max(0, Math.min(1, (tms - a.t) / span)) : 0
    leftLevel[k] = Math.max(0, Math.min(1, a.left + (b.left - a.left) * f))
    rightLevel[k] = Math.max(0, Math.min(1, a.right + (b.right - a.right) * f))
  }
  return {
    version: 3,
    rateHz,
    bass,
    mids,
    treble,
    leftLevel,
    rightLevel,
    channelCount: analysis.channelCount === 2 ? 2 : 1,
    spectrum: resampleSpectrum(analysis.spectrum, rateHz, frameCount),
    ...resampleDetectors(analysis.detectors, rateHz, frameCount),
  }
}

/** The `ADET` blocks an envelope carries, in trailer order, with their flag bits. */
function detectorBlocks(env: AudioEnvelope): { kind: DetectorKind; flag: number; bytes: Uint8Array }[] {
  const flags: Record<DetectorKind, number> = {
    vibe: DETECTOR_TRAILER_FLAG_VIBE, structure: DETECTOR_TRAILER_FLAG_STRUCTURE, pitch: DETECTOR_TRAILER_FLAG_PITCH,
  }
  const blocks: { kind: DetectorKind; flag: number; bytes: Uint8Array }[] = []
  for (const kind of DETECTOR_KINDS) {
    const data = env[kind]
    if (typeof data !== 'string' || data.length === 0) continue
    blocks.push({ kind, flag: flags[kind], bytes: detectorBytes(env, kind, data) })
  }
  return blocks
}

// ── Palette map: mood → palette name ─────────────────────────────────────────

const MOOD_PALETTES: Record<string, string[]> = {
  energetic_bright:  ['rainbow', 'party', 'citrus', 'synthwave'],
  energetic_dark:    ['fire', 'lava', 'volcano', 'emberglow'],
  calm_bright:       ['ocean', 'forest', 'laguna', 'opal'],
  calm_dark:         ['ice', 'purple', 'deepsea', 'amethyst', 'aurora'],
}

function choosePalette(energy: number, valence: number): string {
  const energetic = energy > 0.55
  const bright    = valence > 0.5
  const key = `${energetic ? 'energetic' : 'calm'}_${bright ? 'bright' : 'dark'}`
  const opts = MOOD_PALETTES[key]
  return opts[Math.floor(Math.random() * opts.length)]
}

// ── Pattern map: section type → pattern name ──────────────────────────────────

const SECTION_PATTERNS: Record<SongSection['type'], string[]> = {
  intro:   ['NoiseField', 'Simplex2D'],
  verse:   ['Plasma', 'Noise2D'],
  buildup: ['RadialBurst', 'Spiral'],
  drop:    ['Fire2012', 'Fire', 'Particles'],
  chorus:  ['Plasma', 'RadialBurst', 'Kaleidoscope'],
  bridge:  ['GradientFrame', 'Simplex2D'],
  outro:   ['NoiseField', 'GradientFrame'],
}

/** Every palette a freshly generated show can set under these options. */
export function generatedShowPaletteNames(options: Pick<PerformanceOptions, 'paletteMode' | 'fixedPalette'>): string[] {
  return options.paletteMode === 'fixed' && options.fixedPalette
    ? [options.fixedPalette]
    : [...new Set(Object.values(MOOD_PALETTES).flat())]
}

/** The palettes these shows' SET_PALETTE events name, in order. */
export function showPaletteNames(shows: readonly ShowFile[]): string[] {
  return [...new Set(shows.flatMap((show) => show.events
    .filter((event) => event.cmd === 'SET_PALETTE')
    .map((event) => String(event.params.name))))]
}

/** Every built-in a freshly generated show can name, in editor order. */
export function generatedShowPatternNames(): string[] {
  const reachable = new Set(Object.values(SECTION_PATTERNS).flat())
  return BUILTIN_SHOW_PATTERN_NAMES.filter((name) => reachable.has(name))
}

/**
 * The built-ins these shows' SET_PATTERN events name, in editor order: the
 * patterns an SD performance player compiles for shows without a collection,
 * and the slots `showFileToBinary` numbers them by.
 */
export function showPatternNames(shows: readonly ShowFile[]): string[] {
  const named = new Set(shows.flatMap((show) => show.events
    .filter((event) => event.cmd === 'SET_PATTERN' && event.params.name !== undefined)
    .map((event) => String(event.params.name))))
  return BUILTIN_SHOW_PATTERN_NAMES.filter((name) => named.has(name))
}

function choosePattern(type: SongSection['type'], exclude?: string): string {
  let opts = SECTION_PATTERNS[type]
  if (exclude !== undefined && opts.length > 1) opts = opts.filter((o) => o !== exclude)
  return opts[Math.floor(Math.random() * opts.length)]
}

/** The seven song-section types, in rough song order — shared with the
 *  collection's per-pattern section tagging UI. */
export const SECTION_TYPES: SongSection['type'][] = [
  'intro', 'verse', 'buildup', 'drop', 'chorus', 'bridge', 'outro',
]

/** Particle-burst overlay styles, indexed by the PARTICLE_BURST `style` param
 *  (the value is the on-wire id). The spark motion for each lives in
 *  showPreview.ts (`particleOverlayAt`) and the firmware player, kept in sync.
 *  Shared with the timeline editor's style dropdown. */
export const PARTICLE_STYLES = [
  'rise', 'rain', 'explode', 'fireworks', 'swirl', 'twinkle',
  'ring', 'fountain', 'helix', 'meteor', 'confetti',
  'sparkle', 'comet', 'snow', 'gravity', 'bubbles', 'vortex',
] as const

// ── Transition map: from section type → transition style ──────────────────────

// `extra` is the pool from a TransitionSet node wired into the Performance
// Generator's `transitions` input (empty when none is wired). When present, it
// has a 50/50 chance of overriding the rule-based pick below, so a show gets a
// taste of the wider 21-style catalogue instead of only ever crossfade/wipe/dissolve.
/**
 * Every style a freshly generated show can name: the three section defaults
 * chooseTransition picks from, plus the wired extras. What a capacity check
 * assumes before any show exists; a real upload compiles the styles its shows
 * actually composite (`showTransitionStyles`), since the timeline editor can
 * hand-place any of them.
 */
export function performanceTransitionStyles(extra: readonly string[]): string[] {
  return [...new Set(['crossfade', 'wipe', 'dissolve', ...extra])]
}

/** The pattern a SET_PATTERN plays: a collection index, or a built-in's name. */
function setPatternKey(event: ShowEvent): string {
  return event.params.index !== undefined ? `#${Number(event.params.index)}` : String(event.params.name)
}

/**
 * The TRANSITION events that blend two different patterns. A transition runs
 * from the pattern playing before it to whichever pattern plays during it,
 * until it ends or the next transition starts, so one that no SET_PATTERN
 * moves off that pattern renders a single pattern and composites nothing. The
 * preview and the performance player decide the same way each frame.
 */
function compositingTransitions(show: ShowFile): ShowEvent[] {
  const { events } = show
  const out: ShowEvent[] = []
  let playing: string | null = null
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.cmd === 'SET_PATTERN') playing = setPatternKey(event)
    if (event.cmd !== 'TRANSITION') continue
    const end = event.t + Number(event.params.duration) * 1000
    for (let j = i + 1; j < events.length && events[j].t < end && events[j].cmd !== 'TRANSITION'; j++) {
      if (events[j].cmd === 'SET_PATTERN' && setPatternKey(events[j]) !== playing) {
        out.push(event)
        break
      }
    }
  }
  return out
}

/** The transition styles these shows composite, in order. */
export function showTransitionStyles(shows: readonly ShowFile[]): string[] {
  return [...new Set(shows.flatMap((show) => compositingTransitions(show)
    .map((event) => String(event.params.type))))]
}

function chooseTransition(from: SongSection['type'], to: SongSection['type'], extra: string[] = []): string {
  const pick = (base: string) =>
    extra.length > 0 && Math.random() < 0.5 ? extra[Math.floor(Math.random() * extra.length)] : base
  if (to === 'drop' || to === 'chorus') return pick('wipe')
  if (to === 'outro')                   return pick('dissolve')
  if (from === 'buildup')               return pick('wipe')
  return pick('crossfade')
}

// ── Speed from BPM ────────────────────────────────────────────────────────────

function speedFromBpm(bpm: number): number {
  // Map 60-200 BPM → 0.3-1.5 speed multiplier
  return 0.3 + ((bpm - 60) / 140) * 1.2
}

// ── Brightness per section ────────────────────────────────────────────────────
// The steady brightness a section renders at (drops/choruses bright, outros dim).
// Factored out so the silence fade-to-black can restore the right level.
function sectionBrightness(section: SongSection): number {
  return section.type === 'outro' ? 120
    : section.type === 'intro'    ? 150
    : Math.round(160 + section.energy * 95)
}

// ── Silence detection ─────────────────────────────────────────────────────────
/** Spans (ms) where the song goes near-silent — overall energy below `threshold`
 *  for at least `minDurMs`. Drives the fade-to-black brightness ramps. */
function detectSilences(
  energy: EnergyPoint[], threshold: number, minDurMs: number,
): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []
  let runStart = -1
  for (let i = 0; i < energy.length; i++) {
    const quiet = energy[i].overall < threshold
    if (quiet && runStart < 0) runStart = energy[i].t
    if ((!quiet || i === energy.length - 1) && runStart >= 0) {
      const end = energy[i].t   // where sound returns (or the track ends)
      if (end - runStart >= minDurMs) spans.push({ start: runStart, end })
      runStart = -1
    }
  }
  return spans
}

// ── Main generator ────────────────────────────────────────────────────────────

export interface PerformanceOptions {
  beatIntensity:      number   // 0-1, how aggressive beat flashes are
  transitionDuration: number   // seconds
  paletteMode:        'mood' | 'fixed' | 'cycle'
  fixedPalette?:      string
  energySensitivity:  number   // 0-1
  patternHold:        number   // minimum seconds to hold a pattern before a beat-aligned switch
}

// ── Beat-aligned switch scheduling ────────────────────────────────────────────

/** The first beat at or after `t`. Falls back to `t` itself when the track has
 *  no beat that late (sparse/absent beat data), so scheduling degrades to plain
 *  time-based rather than never switching. */
function nextBeatAtOrAfter(beats: number[], t: number): number {
  for (let i = 0; i < beats.length; i++) if (beats[i] >= t) return beats[i]
  return t
}

/** Timestamps (ms) of significant energy surges — a rise in overall energy over
 *  a ~500 ms window exceeding `threshold`. These are candidate pattern-switch
 *  points *within* a section (a mid-section build or sub-drop), reported once per
 *  leading edge so a long ramp doesn't register at every sample along it. */
function detectEnergySurges(energy: EnergyPoint[], threshold: number): number[] {
  const out: number[] = []
  const WINDOW = 5   // ~500 ms at the analyzer's ~100 ms sampling
  for (let i = WINDOW; i < energy.length; i++) {
    const rise = energy[i].overall - energy[i - WINDOW].overall
    const prevRise = energy[i - 1].overall - (energy[i - 1 - WINDOW]?.overall ?? 0)
    if (rise >= threshold && !(prevRise >= threshold)) out.push(energy[i].t)
  }
  return out
}

/** Pattern-switch timestamps for one section: the section start, then switches
 *  that hold at least `minHoldMs` and snap forward to the next beat (so a change
 *  lands on the music, even if that means holding a little longer). A significant
 *  energy surge inside the section adds an extra beat-aligned switch, provided it
 *  is at least half the minimum hold away from its neighbours. */
function sectionSwitchTimes(
  section: SongSection, beats: number[], minHoldMs: number, surges: number[],
): number[] {
  const END_MARGIN = 500   // don't switch right before the section ends
  const times = [section.startMs]
  let last = section.startMs
  // Periodic: hold at least minHoldMs, then snap to the next beat.
  for (;;) {
    const beat = nextBeatAtOrAfter(beats, last + minHoldMs)
    if (beat >= section.endMs - END_MARGIN) break
    times.push(beat)
    last = beat
  }
  // Energy surges: a big musical change earns a change mid-hold, but keep a floor
  // so we don't switch twice within a couple of seconds.
  for (const s of surges) {
    if (s <= section.startMs || s >= section.endMs - END_MARGIN) continue
    const beat = nextBeatAtOrAfter(beats, s)
    if (beat >= section.endMs - END_MARGIN) continue
    if (times.some((t) => Math.abs(t - beat) < minHoldMs * 0.5)) continue
    times.push(beat)
  }
  return times.sort((a, b) => a - b)
}

export const SHOW_PALETTES = STUDIO_PALETTES

/** Normalise editable node properties into safe generator options. */
export function performanceOptionsFromProperties(properties: Record<string, unknown>): PerformanceOptions {
  const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    if (value === undefined || value === null || value === '') return fallback
    const n = Number(value)
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
  }
  const rawMode = String(properties.paletteMode ?? 'mood')
  const paletteMode: PerformanceOptions['paletteMode'] =
    rawMode === 'fixed' || rawMode === 'cycle' ? rawMode : 'mood'
  const rawPalette = String(properties.fixedPalette ?? 'rainbow')
  const fixedPalette = isStudioPalette(rawPalette)
    ? rawPalette
    : 'rainbow'
  return {
    beatIntensity: clamp(properties.beatIntensity, 0.8, 0, 1),
    energySensitivity: clamp(properties.energySensitivity, 0.7, 0, 1),
    transitionDuration: clamp(properties.transitionDuration, 0.5, 0.1, 3),
    paletteMode,
    fixedPalette,
    patternHold: clamp(properties.patternHold, 10, 1, 30),
  }
}

const DEFAULT_OPTIONS: PerformanceOptions = {
  beatIntensity:      0.8,
  transitionDuration: 0.5,
  paletteMode:        'mood',
  energySensitivity:  0.7,
  patternHold:        10,
}

// A full-frame white blend reads much brighter than a coloured particle accent
// at the same numeric intensity. Keep flashes punchy without washing the whole
// matrix to white; Beat Intensity still scales both accent types normally.
const WHITE_FLASH_INTENSITY_SCALE = 0.55
const SHOW_BOUNDARY_FADE_MS = 5000

/** Brightness in force at `timeMs` from events pushed so far, ignoring ramps.
 * The boundary ramp samples on top of this, so the step to black has to be
 * pushed after the section value it replaces. */
function brightnessTargetAt(events: ShowEvent[], timeMs: number): number {
  let value = 255
  let at = -1
  for (const event of events) {
    if (event.cmd !== 'SET_BRIGHTNESS') continue
    if (event.t > timeMs) continue
    if (event.t >= at) {
      at = event.t
      value = Number(event.params.value)
    }
  }
  return value
}

/** Black for the first and last five seconds, as one ramp each.
 * The opening step to 0 is pushed before the ramp, and Array.sort is stable,
 * so at t = 0 the sampled brightness is still 0 and the ramp climbs from there.
 * A show shorter than the fade only steps to black at the start and ramps
 * toward the section brightness; it does not plant a second zero in the middle. */
function applyShowBoundaryFades(events: ShowEvent[], durationMs: number): void {
  if (durationMs <= 0) return
  const opening = Math.min(SHOW_BOUNDARY_FADE_MS, durationMs)
  const openTarget = brightnessTargetAt(events, opening)
  events.push({ t: 0, cmd: 'SET_BRIGHTNESS', params: { value: 0 } })
  events.push({ t: 0, cmd: 'SET_BRIGHTNESS', params: { value: openTarget, rampMs: opening } })
  if (durationMs > SHOW_BOUNDARY_FADE_MS) {
    const closingStart = durationMs - SHOW_BOUNDARY_FADE_MS
    events.push({
      t: closingStart,
      cmd: 'SET_BRIGHTNESS',
      params: { value: 0, rampMs: SHOW_BOUNDARY_FADE_MS },
    })
  }
}

export function generateShow(
  analysis: SongAnalysis,
  options: Partial<PerformanceOptions> = {},
  patternIds: string[] = [],
  // Per-pattern eligible section types, aligned by index with `patternIds`.
  // An empty (or missing) entry means the pattern is eligible in any section.
  sectionTags: string[][] = [],
  // Extra transition styles from a wired TransitionSet node (see chooseTransition).
  extraTransitions: string[] = [],
  // Weights and energy tags aligned with `patternIds`. Omitted entries weigh 1
  // and match every band, which keeps an unweighted collection on today's draw.
  pick: { weights?: number[]; energy?: (readonly string[])[] } = {},
): ShowFile {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  // When a Pattern Collection is wired, draw from the user's own patterns by
  // index rather than the built-in section→pattern map.
  const useCollection = patternIds.length > 0

  // Section-aware pattern pick (slice 3): a collection pattern is eligible in a
  // section if it is untagged (any) or tagged with that section's type. When no
  // pattern matches the section, fall back to the whole set so a section always
  // renders something.
  const entries: PickEntry[] = patternIds.map((_, index) => ({
    weight: clampPatternWeight(pick.weights?.[index] ?? 1),
    energy: (pick.energy?.[index] ?? []).filter(isEnergyBand) as EnergyBand[],
    sections: sectionTags[index] ?? [],
  }))
  const hasEnergyTags = entries.some((entry) => entry.energy.length > 0)
  const sectionEnergies = analysis.sections.map((section) => section.energy)
  const eligibleIndices = (type: SongSection['type']): number[] => {
    const eligible: number[] = []
    for (let i = 0; i < entries.length; i++) {
      const tags = entries[i].sections
      if (tags.length === 0 || tags.includes(type)) eligible.push(i)
    }
    return eligible.length > 0 ? eligible : patternIds.map((_, i) => i)
  }
  // `exclude` avoids repeating the previous pattern on a within-section switch.
  // The full-collection equal-weight case uses today's formula. A narrower
  // eligible set uses the weighted draw, and a single choice does not draw.
  const chooseCollectionIndex = (type: SongSection['type'], energy: number, exclude?: number): number => {
    const moment = {
      energy: hasEnergyTags ? energyBandFromIntensity(sectionEnergyIntensity(energy, sectionEnergies)) : null,
      section: type,
    }
    return nextPatternIndex(entries, exclude ?? 0, moment, exclude === undefined ? 'first' : 'next', Math.random).index
  }
  const events: ShowEvent[] = []
  const push = (t: number, cmd: ShowEvent['cmd'], params: ShowEvent['params']) =>
    events.push({ t: Math.round(t), cmd, params })

  const basePalette = opts.paletteMode === 'fixed' && opts.fixedPalette
    ? opts.fixedPalette
    : choosePalette(analysis.mood.energy, analysis.mood.valence)

  const baseSpeed = speedFromBpm(analysis.beats.bpm)

  // ── 1. Section-level events ───────────────────────────────────────────────
  const beats = analysis.beats.timestamps
  const minHoldMs = opts.patternHold * 1000
  // Higher energy sensitivity → lower surge threshold → more mid-section switches.
  const surgeThreshold = 0.35 - opts.energySensitivity * 0.15
  const surges = detectEnergySurges(analysis.energy, surgeThreshold)

  let prevSectionType: SongSection['type'] | null = null
  // The very first pattern of the show is a plain cut-in (nothing to fade from);
  // every later switch crossfades from the pattern before it.
  let firstSwitch = true
  // The pattern playing, carried across section boundaries so a new section
  // avoids repeating it the way a within-section switch does.
  let prevIdx: number | undefined
  let prevName: string | undefined

  for (const section of analysis.sections) {
    const palette = opts.paletteMode === 'cycle'
      ? choosePalette(section.energy, analysis.mood.valence)
      : basePalette

    // Pattern switches: hold each pattern at least `patternHold` seconds, then
    // switch on the next beat (holding a little longer to sync with the music),
    // plus an extra switch on any significant energy surge within the section.
    // Section boundaries always switch (drops/choruses are their own sections).
    // Collapses to one switch at the section start when only a single pattern is
    // eligible.
    const poolN = useCollection ? eligibleIndices(section.type).length : SECTION_PATTERNS[section.type].length
    const switchTimes = poolN < 2 ? [section.startMs] : sectionSwitchTimes(section, beats, minHoldMs, surges)

    for (let k = 0; k < switchTimes.length; k++) {
      const st = switchTimes[k]
      const index = useCollection ? chooseCollectionIndex(section.type, section.energy, prevIdx) : undefined
      const name = useCollection ? undefined : choosePattern(section.type, prevName)
      // A section whose only eligible pattern is already playing keeps it: a
      // transition into the same pattern would render it twice a frame.
      if (!firstSwitch && (useCollection ? index === prevIdx : name === prevName)) continue
      // The TRANSITION and the incoming SET_PATTERN share the instant `st`: the
      // transition (ordered first) marks the crossfade's *start*, over which the
      // new pattern blends in across `transitionDuration`.
      if (!firstSwitch) {
        const from = k === 0 ? (prevSectionType ?? section.type) : section.type
        push(st, 'TRANSITION', {
          type: chooseTransition(from, section.type, extraTransitions),
          duration: opts.transitionDuration,
        })
      }
      push(st, 'SET_PATTERN', useCollection ? { index: index! } : { name: name! })
      prevIdx = index
      prevName = name
      firstSwitch = false
    }

    push(section.startMs, 'SET_PALETTE', { name: palette })

    // Speed scales with section energy and BPM
    const sectionSpeed = baseSpeed * (0.5 + section.energy * 0.8)
    push(section.startMs, 'SET_SPEED',   { value: Math.min(2, sectionSpeed) })

    // Brightness: drops and choruses are bright, outros fade
    push(section.startMs, 'SET_BRIGHTNESS', { value: sectionBrightness(section) })

    // Section energy (0–1) — drives the `energy` group-input role when a
    // collection's patterns expose it and "Use group inputs" is on.
    push(section.startMs, 'SET_ENERGY', { value: section.energy })

    prevSectionType = section.type
  }

  // ── 2. Beat accent events (flash / particle burst) ─────────────────────────
  // Skip accents in intro/outro and on every other beat at lower energies. Each
  // eligible beat is either a white BEAT_FLASH or a colored PARTICLE_BURST, so
  // the show isn't just flashing — bursts are favoured in high-energy sections.
  const sectionAt = (ms: number): SongSection | undefined =>
    analysis.sections.find(s => ms >= s.startMs && ms < s.endMs)

  const decayValue = 1 - opts.beatIntensity * 0.5   // 0.5-1

  for (let i = 0; i < analysis.beats.timestamps.length; i++) {
    const t = analysis.beats.timestamps[i]
    const sec = sectionAt(t)
    if (!sec) continue
    if (sec.type === 'intro' || sec.type === 'outro') continue

    // Only accent every beat in high-energy sections; every 2 beats in verses
    const isHigh = sec.type === 'drop' || sec.type === 'chorus'
    if (!isHigh && i % 2 !== 0) continue

    const intensity = Math.min(1, opts.beatIntensity * (0.6 + sec.energy * 0.6))
    // Keep white flashes as an occasional hard accent, but favour the more
    // textured particle overlays so repeated beats do not strobe the matrix.
    const particleChance = isHigh ? 0.8 : 0.6
    if (Math.random() < particleChance) {
      push(t, 'PARTICLE_BURST', {
        intensity: Math.round(intensity * 255),
        hue: Math.round(Math.random() * 255),
        style: Math.floor(Math.random() * PARTICLE_STYLES.length),
      })
    } else {
      push(t, 'BEAT_FLASH', {
        intensity: Math.round(intensity * WHITE_FLASH_INTENSITY_SCALE * 255),
        decay: Math.round(decayValue * 255),
      })
    }
  }

  // ── 3. Buildup energy ramps ───────────────────────────────────────────────
  for (const section of analysis.sections) {
    if (section.type !== 'buildup') continue
    const durationMs = section.endMs - section.startMs
    const speed = Math.min(3, baseSpeed * (1 + 1.5 * opts.energySensitivity))
    push(section.startMs, 'SET_SPEED', { value: speed, rampMs: durationMs })
    push(section.startMs, 'SET_BRIGHTNESS', { value: 255, rampMs: durationMs })
  }

  // ── 4. Fade to black on silence ────────────────────────────────────────────
  // Where the song goes near-silent, ramp brightness down to 0 and back up when
  // sound returns (a stepped ramp reads as a smooth fade at preview/frame rate).
  for (const gap of detectSilences(analysis.energy, 0.05, 350)) {
    const fadeMs = Math.min(400, (gap.end - gap.start) * 0.5)
    const to = sectionAt(gap.end)
    const bTo = to ? sectionBrightness(to) : 200
    push(gap.start, 'SET_BRIGHTNESS', { value: 0, rampMs: fadeMs })
    push(gap.end, 'SET_BRIGHTNESS', { value: bTo, rampMs: fadeMs })
  }

  // Every performance begins and ends in darkness. This runs after all other
  // brightness automation so the boundary envelope remains authoritative.
  applyShowBoundaryFades(events, analysis.durationMs)

  // Bake the per-frame audio envelope so a pattern's FFTAnalyzer reacts to the
  // song on-device (only when the analysis actually carries an energy envelope).
  const audio = analysis.energy.length > 0 ? bakeEnvelope(analysis) : undefined

  return {
    version: useCollection ? 2 : 1,
    songTitle: analysis.title,
    durationMs: analysis.durationMs,
    bpm: analysis.beats.bpm,
    events: sortShowEvents(events),
    ...(useCollection ? { patternSet: patternIds } : {}),
    ...(audio ? { audio } : {}),
  }
}

// ── Event ordering ────────────────────────────────────────────────────────────
// Sort by timestamp, breaking ties so a pattern is set before the palette/speed
// that decorate it and before any beat flash that lands on the same instant.
// Shared by the generator and the timeline editor so hand-tweaked shows keep the
// same deterministic order the player and binary exporter expect.

const CMD_ORDER: Record<ShowEvent['cmd'], number> = {
  TRANSITION:     0,
  SET_PATTERN:    1,
  SET_PALETTE:    2,
  SET_SPEED:      3,
  SET_BRIGHTNESS: 4,
  SET_ENERGY:     5,
  SET_PARAM:      6,
  BEAT_FLASH:     7,
  PARTICLE_BURST: 8,
}

export function sortShowEvents(events: ShowEvent[]): ShowEvent[] {
  return [...events].sort((a, b) => (a.t !== b.t ? a.t - b.t : CMD_ORDER[a.cmd] - CMD_ORDER[b.cmd]))
}

/** Commands the editor can author, in their tie-break order. */
export const SHOW_COMMANDS = Object.keys(CMD_ORDER) as ShowEvent['cmd'][]

// ── Show file → JSON string ───────────────────────────────────────────────────

export function showFileToJson(show: ShowFile): string {
  return JSON.stringify(show, null, 2)
}

// ── Show file → compact binary (for SD card) ──────────────────────────────────
// Format: magic(4) + version(1) + bpm_x10(2) + duration_ms(4) + event_count(4)
// Per event: t_ms(4) + cmd(1) + param_count(1) + params[](4*N float32)
//
// Commands: 0=SET_PATTERN 1=SET_PALETTE 2=SET_SPEED 3=SET_BRIGHTNESS 4=BEAT_FLASH 5=TRANSITION 6=SET_ENERGY 7=PARTICLE_BURST
// Version 1 (enum show): SET_PATTERN's param is a built-in patternId.
// Version 2 (collection show, `patternSet` present): SET_PATTERN's param is the
// pattern *index* (a position in patternSet), which the player maps to its
// compiled render_pN() function.
// Param encoding (all float32):
//   SET_PATTERN:   patternId | patternIndex (float)
//   SET_PALETTE:   paletteId(float)
//   SET_SPEED:     value
//   SET_BRIGHTNESS: value
//   BEAT_FLASH:    intensity, decay
//   PARTICLE_BURST: intensity, hue, style
//   TRANSITION:    typeId(float), duration

// Mirrors the `Transition` node's 21-style catalogue (nodeLibrary.ts
// PROPERTY_META.transitionType) so a style chosen from a wired TransitionSet
// round-trips through the binary export. crossfade/wipe/dissolve keep their
// original ids for backward compatibility with already-exported `.show` files,
// and the table is append-only for the same reason: a new style takes the next
// free id rather than renumbering the ones a saved show already refers to.
const TRANSITION_IDS: Record<string, number> = {
  crossfade: 0, wipe: 1, dissolve: 2, iris: 3, clockwipe: 4, push: 5,
  checkerboard: 6, diagonal: 7, fadeblack: 8, fadewhite: 9, blinds: 10,
  ripple: 11, spiral: 12, curtain: 13, scanlines: 14, zoom: 15,
  dolly: 16, flip: 17, cube: 18, door: 19, tilt: 20,
}
const CMD_IDS: Record<ShowEvent['cmd'], number> = {
  SET_PATTERN: 0, SET_PALETTE: 1, SET_SPEED: 2, SET_BRIGHTNESS: 3,
  BEAT_FLASH: 4, TRANSITION: 5, SET_ENERGY: 6, PARTICLE_BURST: 7, SET_PARAM: 8,
}

// Option lists the timeline editor offers, so every value a user can pick
// survives the `.show` round-trip.
export const SHOW_PATTERNS = BUILTIN_SHOW_PATTERN_NAMES
export const SHOW_TRANSITIONS = Object.keys(TRANSITION_IDS)

/**
 * Style names to the ids compositeTransition switches on, deduped and in
 * order. Unknown names drop out; an empty pool means crossfade alone, as the
 * preview falls back to.
 */
export function transitionStyleIds(names: readonly string[]): number[] {
  const ids = [...new Set(names.map((name) => TRANSITION_IDS[name]).filter((id) => id !== undefined))]
  return ids.length ? ids : [TRANSITION_IDS.crossfade]
}

/**
 * The binary `.show` file. A show without a collection numbers its built-in
 * patterns by their position in `builtinSlots`, the patterns the player on the
 * same card compiled (`showPatternNames` of every show uploaded with it).
 */
function eventParamNumbers(ev: ShowEvent, collection: boolean, builtinSlots: readonly string[]): number[] {
  const params: number[] = []
  const rampMs = Number(ev.params.rampMs ?? 0)
  const withRamp = (value: number) => {
    params.push(value)
    if (rampMs > 0) params.push(rampMs)
  }
  switch (ev.cmd) {
    case 'SET_PATTERN':    params.push(collection ? Number(ev.params.index ?? 0) : Math.max(0, builtinSlots.indexOf(String(ev.params.name)))); break
    case 'SET_PALETTE':    params.push(PALETTE_IDS[ev.params.name as string] ?? 0); break
    case 'SET_SPEED':      withRamp(Number(ev.params.value)); break
    case 'SET_BRIGHTNESS': withRamp(Number(ev.params.value)); break
    case 'SET_ENERGY':     withRamp(Number(ev.params.value)); break
    case 'SET_PARAM':
      params.push(Number(ev.params.index ?? 0), Number(ev.params.value ?? 0))
      if (rampMs > 0) params.push(rampMs)
      break
    case 'BEAT_FLASH':     params.push(Number(ev.params.intensity), Number(ev.params.decay)); break
    case 'PARTICLE_BURST': params.push(Number(ev.params.intensity), Number(ev.params.hue), Number(ev.params.style ?? 0)); break
    case 'TRANSITION':     params.push(TRANSITION_IDS[ev.params.type as string] ?? 0, Number(ev.params.duration)); break
  }
  return params
}

export function showFileToBinary(show: ShowFile, builtinSlots: readonly string[] = SHOW_PATTERNS): ArrayBuffer {
  const headerBytes = 4 + 1 + 2 + 4 + 4   // magic + version + bpm + duration + count
  const eventBytes  = show.events.length * (4 + 1 + 1 + 4 * 3)  // worst case 3 params
  // Envelope: AENV(4) + version(1) + rate(1) + channels(1) + frameCount(4)
  // + bins(1), then 5 bytes/frame (bass, mids, treble, left, right), then the
  // spectrum block of `bins` bytes/frame. The blocks are separate so a player
  // whose patterns never read the spectrum can stop after the first.
  const env = show.audio
  const envFrames = env?.bass.length ?? 0
  const envBytes = env ? 12 + envFrames * (5 + SPECTRUM_TRACK_BINS) : 0
  // Detectors: ADET(4) + version(1) + flags(1) + frameCount(4), then one block
  // per flagged detector of `frames × recordBytes`, in flag order. Written only
  // when the envelope carries one, so other shows keep their bytes.
  const detectors = env ? detectorBlocks(env) : []
  const detBytes = detectors.length
    ? 10 + detectors.reduce((sum, block) => sum + envFrames * DETECTOR_RECORD_BYTES[block.kind], 0)
    : 0
  const paramNames = show.params ?? []
  const parmBytes = paramNames.length
    ? 4 + 1 + paramNames.reduce((sum, name) => sum + 1 + Math.min(255, name.length), 0)
    : 0
  const buf = new ArrayBuffer(headerBytes + eventBytes + parmBytes + envBytes + detBytes)
  const view = new DataView(buf)
  let off = 0

  const collection = !!(show.patternSet && show.patternSet.length > 0)

  // Magic "SHOW"
  view.setUint8(off++, 0x53); view.setUint8(off++, 0x48)
  view.setUint8(off++, 0x4F); view.setUint8(off++, 0x57)
  view.setUint8(off++, collection ? 2 : 1)                  // version
  view.setUint16(off, Math.round(show.bpm * 10), true); off += 2
  view.setUint32(off, Math.round(show.durationMs), true);   off += 4
  view.setUint32(off, show.events.length, true);            off += 4

  for (const ev of show.events) {
    view.setUint32(off, ev.t, true); off += 4
    view.setUint8(off++, CMD_IDS[ev.cmd] ?? 0)

    const params = eventParamNumbers(ev, collection, builtinSlots)

    view.setUint8(off++, params.length)
    for (const p of params) { view.setFloat32(off, p, true); off += 4 }
  }

  // Named inputs, only when this show uses them. PARM then the AENV trailer,
  // so a show with neither (or only AENV) keeps the bytes it has always written.
  if (paramNames.length > 0) {
    view.setUint8(off++, 0x50); view.setUint8(off++, 0x41) // "PARM"
    view.setUint8(off++, 0x52); view.setUint8(off++, 0x4D)
    view.setUint8(off++, paramNames.length)
    for (const name of paramNames) {
      const bytes = name.slice(0, 255)
      view.setUint8(off++, bytes.length)
      for (let i = 0; i < bytes.length; i++) view.setUint8(off++, bytes.charCodeAt(i) & 0xff)
    }
  }

  // Audio envelope block after all events: a tagged, versioned trailer so the
  // frame layout can evolve without the player guessing at untagged bytes.
  if (env) {
    const n = env.bass.length
    view.setUint8(off++, 0x41); view.setUint8(off++, 0x45) // "AENV"
    view.setUint8(off++, 0x4E); view.setUint8(off++, 0x56)
    view.setUint8(off++, 3)
    view.setUint8(off++, env.rateHz)
    view.setUint8(off++, env.channelCount === 2 ? 2 : 1)
    view.setUint32(off, n, true); off += 4
    view.setUint8(off++, SPECTRUM_TRACK_BINS)
    const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
    for (let i = 0; i < n; i++) {
      view.setUint8(off++, q(env.bass[i]))
      view.setUint8(off++, q(env.mids[i]))
      view.setUint8(off++, q(env.treble[i]))
      view.setUint8(off++, q(env.leftLevel[i] ?? 0))
      view.setUint8(off++, q(env.rightLevel[i] ?? 0))
    }
    const spectrum = spectrumBytes(env, env.spectrum)
    for (let i = 0; i < n * SPECTRUM_TRACK_BINS; i++) view.setUint8(off++, spectrum[i] ?? 0)
  }

  // Baked detectors last, after the envelope they share a frame clock with.
  // A player written before the trailer stops at the envelope's end; one that
  // reads it loads only the blocks its patterns read.
  if (env && detectors.length > 0) {
    const n = env.bass.length
    view.setUint8(off++, 0x41); view.setUint8(off++, 0x44) // "ADET"
    view.setUint8(off++, 0x45); view.setUint8(off++, 0x54)
    view.setUint8(off++, DETECTOR_TRAILER_VERSION)
    view.setUint8(off++, detectors.reduce((flags, block) => flags | block.flag, 0))
    view.setUint32(off, n, true); off += 4
    for (const block of detectors) {
      const size = n * DETECTOR_RECORD_BYTES[block.kind]
      for (let i = 0; i < size; i++) view.setUint8(off++, block.bytes[i] ?? 0)
    }
  }

  return buf.slice(0, off)
}
