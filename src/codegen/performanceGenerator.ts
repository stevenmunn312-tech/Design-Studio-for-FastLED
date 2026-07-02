import type { SongAnalysis, SongSection, ShowFile, ShowEvent, AudioEnvelope, EnergyPoint } from '../types/showFile'
import { PALETTE_IDS, STUDIO_PALETTES, isStudioPalette } from '../state/paletteCatalog'

// Frame rate of the baked audio envelope (see bakeEnvelope). 50 Hz is smooth
// enough for per-frame band reactivity while staying tiny (~3 bytes/frame).
export const ENVELOPE_RATE_HZ = 50

/**
 * Resample the analysis's ~100 ms energy envelope to a fixed `rateHz` bass/mids/
 * treble track (0–1) so the player can drive a pattern's FFTAnalyzer in perfect
 * sync with the song. Linear interpolation between analysis points.
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
  return { rateHz, bass, mids, treble }
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
] as const

// ── Transition map: from section type → transition style ──────────────────────

// `extra` is the pool from a TransitionSet node wired into the Performance
// Generator's `transitions` input (empty when none is wired). When present, it
// has a 50/50 chance of overriding the rule-based pick below, so a show gets a
// taste of the wider 16-style catalogue instead of only ever crossfade/wipe/dissolve.
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

export function generateShow(
  analysis: SongAnalysis,
  options: Partial<PerformanceOptions> = {},
  patternIds: string[] = [],
  // Per-pattern eligible section types, aligned by index with `patternIds`.
  // An empty (or missing) entry means the pattern is eligible in any section.
  sectionTags: string[][] = [],
  // Extra transition styles from a wired TransitionSet node (see chooseTransition).
  extraTransitions: string[] = [],
): ShowFile {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  // When a Pattern Collection is wired, draw from the user's own patterns by
  // index rather than the built-in section→pattern map.
  const useCollection = patternIds.length > 0

  // Section-aware pattern pick (slice 3): a collection pattern is eligible in a
  // section if it is untagged (any) or tagged with that section's type. When no
  // pattern matches the section, fall back to the whole set so a section always
  // renders something.
  const eligibleIndices = (type: SongSection['type']): number[] => {
    const eligible: number[] = []
    for (let i = 0; i < patternIds.length; i++) {
      const tags = sectionTags[i]
      if (!tags || tags.length === 0 || tags.includes(type)) eligible.push(i)
    }
    return eligible.length > 0 ? eligible : patternIds.map((_, i) => i)
  }
  // `exclude` avoids repeating the previous pattern on a within-section switch.
  const chooseCollectionIndex = (type: SongSection['type'], exclude?: number): number => {
    let pool = eligibleIndices(type)
    if (exclude !== undefined && pool.length > 1) pool = pool.filter((i) => i !== exclude)
    return pool[Math.floor(Math.random() * pool.length)]
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

    let prevIdx: number | undefined
    let prevName: string | undefined
    for (let k = 0; k < switchTimes.length; k++) {
      const st = switchTimes[k]
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
      const patternParams: ShowEvent['params'] = useCollection
        ? { index: (prevIdx = chooseCollectionIndex(section.type, prevIdx)) }
        : { name: (prevName = choosePattern(section.type, prevName)) }
      push(st, 'SET_PATTERN', patternParams)
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
        intensity: Math.round(intensity * 255),
        decay: Math.round(decayValue * 255),
      })
    }
  }

  // ── 3. Buildup energy ramps ───────────────────────────────────────────────
  for (const section of analysis.sections) {
    if (section.type !== 'buildup') continue
    const durationMs = section.endMs - section.startMs
    const steps = 4
    for (let s = 1; s <= steps; s++) {
      const t = section.startMs + (s / steps) * durationMs
      const speed = baseSpeed * (1 + (s / steps) * 1.5 * opts.energySensitivity)
      push(t, 'SET_SPEED', { value: Math.min(3, speed) })
      const brightness = Math.round(150 + (s / steps) * 105)
      push(t, 'SET_BRIGHTNESS', { value: brightness })
    }
  }

  // ── 4. Fade to black on silence ────────────────────────────────────────────
  // Where the song goes near-silent, ramp brightness down to 0 and back up when
  // sound returns (a stepped ramp reads as a smooth fade at preview/frame rate).
  const FADE_STEPS = 4
  for (const gap of detectSilences(analysis.energy, 0.05, 350)) {
    const fadeMs = Math.min(400, (gap.end - gap.start) * 0.5)
    const from = sectionAt(gap.start)
    const bFrom = from ? sectionBrightness(from) : 200
    // Fade out over the first part of the gap.
    for (let s = 1; s <= FADE_STEPS; s++) {
      push(gap.start + (s / FADE_STEPS) * fadeMs, 'SET_BRIGHTNESS', {
        value: Math.round(bFrom * (1 - s / FADE_STEPS)),
      })
    }
    // Fade back up to the level of whatever section is playing when sound returns.
    const to = sectionAt(gap.end)
    const bTo = to ? sectionBrightness(to) : 200
    for (let s = 1; s <= FADE_STEPS; s++) {
      push(gap.end + (s / FADE_STEPS) * fadeMs, 'SET_BRIGHTNESS', {
        value: Math.round((bTo * s) / FADE_STEPS),
      })
    }
  }

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
  BEAT_FLASH:     6,
  PARTICLE_BURST: 7,
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

const PATTERN_IDS: Record<string, number> = {
  SolidColor: 0, NoiseField: 1, Plasma: 2, Fire: 3, Fire2012: 4,
  Noise2D: 5, RadialBurst: 6, Spiral: 7, Kaleidoscope: 8, Particles: 9,
  Simplex2D: 10, GradientFrame: 11,
}
// Mirrors the `Transition` node's 16-style catalogue (nodeLibrary.ts
// PROPERTY_META.transitionType) so a style chosen from a wired TransitionSet
// round-trips through the binary export. crossfade/wipe/dissolve keep their
// original ids for backward compatibility with already-exported `.show` files.
const TRANSITION_IDS: Record<string, number> = {
  crossfade: 0, wipe: 1, dissolve: 2, iris: 3, clockwipe: 4, push: 5,
  checkerboard: 6, diagonal: 7, fadeblack: 8, fadewhite: 9, blinds: 10,
  ripple: 11, spiral: 12, curtain: 13, scanlines: 14, zoom: 15,
}
const CMD_IDS: Record<ShowEvent['cmd'], number> = {
  SET_PATTERN: 0, SET_PALETTE: 1, SET_SPEED: 2, SET_BRIGHTNESS: 3,
  BEAT_FLASH: 4, TRANSITION: 5, SET_ENERGY: 6, PARTICLE_BURST: 7,
}

// Option lists the timeline editor offers — derived from the binary-export ID
// maps so every value a user can pick survives the `.show` round-trip.
export const SHOW_PATTERNS = Object.keys(PATTERN_IDS)
export const SHOW_TRANSITIONS = Object.keys(TRANSITION_IDS)

export function showFileToBinary(show: ShowFile): ArrayBuffer {
  const headerBytes = 4 + 1 + 2 + 4 + 4   // magic + version + bpm + duration + count
  const eventBytes  = show.events.length * (4 + 1 + 1 + 4 * 3)  // worst case 3 params (PARTICLE_BURST)
  // Optional trailing audio envelope: rate(1) + frameCount(4) + 3 bytes/frame.
  const env = show.audio
  const envBytes = env ? 1 + 4 + env.bass.length * 3 : 0
  const buf = new ArrayBuffer(headerBytes + eventBytes + envBytes)
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

    const params: number[] = []
    switch (ev.cmd) {
      case 'SET_PATTERN':    params.push(collection ? Number(ev.params.index ?? 0) : (PATTERN_IDS[ev.params.name as string] ?? 0)); break
      case 'SET_PALETTE':    params.push(PALETTE_IDS[ev.params.name as string] ?? 0); break
      case 'SET_SPEED':      params.push(Number(ev.params.value)); break
      case 'SET_BRIGHTNESS': params.push(Number(ev.params.value)); break
      case 'SET_ENERGY':     params.push(Number(ev.params.value)); break
      case 'BEAT_FLASH':     params.push(Number(ev.params.intensity), Number(ev.params.decay)); break
      case 'PARTICLE_BURST': params.push(Number(ev.params.intensity), Number(ev.params.hue), Number(ev.params.style ?? 0)); break
      case 'TRANSITION':     params.push(TRANSITION_IDS[ev.params.type as string] ?? 0, Number(ev.params.duration)); break
    }

    view.setUint8(off++, params.length)
    for (const p of params) { view.setFloat32(off, p, true); off += 4 }
  }

  // Audio envelope block (after all events): rate(1) + frameCount(4) + per frame
  // 3 bytes (bass, mids, treble) as 0–255. Old players simply stop after the
  // events and ignore this trailing data.
  if (env) {
    const n = env.bass.length
    view.setUint8(off++, env.rateHz)
    view.setUint32(off, n, true); off += 4
    const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
    for (let i = 0; i < n; i++) {
      view.setUint8(off++, q(env.bass[i]))
      view.setUint8(off++, q(env.mids[i]))
      view.setUint8(off++, q(env.treble[i]))
    }
  }

  return buf.slice(0, off)
}
