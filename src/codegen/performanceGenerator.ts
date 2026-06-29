import type { SongAnalysis, SongSection, ShowFile, ShowEvent } from '../types/showFile'

// ── Palette map: mood → palette name ─────────────────────────────────────────

const MOOD_PALETTES: Record<string, string[]> = {
  energetic_bright:  ['rainbow', 'party'],
  energetic_dark:    ['fire', 'lava'],
  calm_bright:       ['ocean', 'forest'],
  calm_dark:         ['ice', 'purple'],
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

function choosePattern(type: SongSection['type']): string {
  const opts = SECTION_PATTERNS[type]
  return opts[Math.floor(Math.random() * opts.length)]
}

// ── Transition map: from section type → transition style ──────────────────────

function chooseTransition(from: SongSection['type'], to: SongSection['type']): string {
  if (to === 'drop' || to === 'chorus') return 'wipe'
  if (to === 'outro')                   return 'dissolve'
  if (from === 'buildup')               return 'wipe'
  return 'crossfade'
}

// ── Speed from BPM ────────────────────────────────────────────────────────────

function speedFromBpm(bpm: number): number {
  // Map 60-200 BPM → 0.3-1.5 speed multiplier
  return 0.3 + ((bpm - 60) / 140) * 1.2
}

// ── Main generator ────────────────────────────────────────────────────────────

export interface PerformanceOptions {
  beatIntensity:      number   // 0-1, how aggressive beat flashes are
  transitionDuration: number   // seconds
  paletteMode:        'mood' | 'fixed' | 'cycle'
  fixedPalette?:      string
  energySensitivity:  number   // 0-1
}

export const SHOW_PALETTES = ['rainbow', 'ocean', 'fire', 'forest', 'lava', 'party', 'ice', 'purple'] as const

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
  const fixedPalette = SHOW_PALETTES.includes(rawPalette as typeof SHOW_PALETTES[number])
    ? rawPalette
    : 'rainbow'
  return {
    beatIntensity: clamp(properties.beatIntensity, 0.8, 0, 1),
    energySensitivity: clamp(properties.energySensitivity, 0.7, 0, 1),
    transitionDuration: clamp(properties.transitionDuration, 0.5, 0.1, 3),
    paletteMode,
    fixedPalette,
  }
}

const DEFAULT_OPTIONS: PerformanceOptions = {
  beatIntensity:      0.8,
  transitionDuration: 0.5,
  paletteMode:        'mood',
  energySensitivity:  0.7,
}

export function generateShow(
  analysis: SongAnalysis,
  options: Partial<PerformanceOptions> = {},
): ShowFile {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const events: ShowEvent[] = []
  const push = (t: number, cmd: ShowEvent['cmd'], params: ShowEvent['params']) =>
    events.push({ t: Math.round(t), cmd, params })

  const basePalette = opts.paletteMode === 'fixed' && opts.fixedPalette
    ? opts.fixedPalette
    : choosePalette(analysis.mood.energy, analysis.mood.valence)

  const baseSpeed = speedFromBpm(analysis.beats.bpm)

  // ── 1. Section-level events ───────────────────────────────────────────────
  let prevSectionType: SongSection['type'] | null = null

  for (const section of analysis.sections) {
    const pattern = choosePattern(section.type)
    const palette = opts.paletteMode === 'cycle'
      ? choosePalette(section.energy, analysis.mood.valence)
      : basePalette

    // Pattern change with transition
    if (prevSectionType !== null) {
      const transStyle = chooseTransition(prevSectionType, section.type)
      push(section.startMs - opts.transitionDuration * 1000 * 0.5, 'TRANSITION', {
        type: transStyle,
        duration: opts.transitionDuration,
      })
    }

    push(section.startMs, 'SET_PATTERN', { name: pattern })
    push(section.startMs, 'SET_PALETTE', { name: palette })

    // Speed scales with section energy and BPM
    const sectionSpeed = baseSpeed * (0.5 + section.energy * 0.8)
    push(section.startMs, 'SET_SPEED',   { value: Math.min(2, sectionSpeed) })

    // Brightness: drops and choruses are bright, outros fade
    const brightness = section.type === 'outro' ? 120
      : section.type === 'intro'             ? 150
      : Math.round(160 + section.energy * 95)
    push(section.startMs, 'SET_BRIGHTNESS', { value: brightness })

    prevSectionType = section.type
  }

  // ── 2. Beat flash events ───────────────────────────────────────────────────
  // Skip flashes in intro/outro and on every other beat at lower energies
  const sectionAt = (ms: number): SongSection | undefined =>
    analysis.sections.find(s => ms >= s.startMs && ms < s.endMs)

  const decayValue = 1 - opts.beatIntensity * 0.5   // 0.5-1

  for (let i = 0; i < analysis.beats.timestamps.length; i++) {
    const t = analysis.beats.timestamps[i]
    const sec = sectionAt(t)
    if (!sec) continue
    if (sec.type === 'intro' || sec.type === 'outro') continue

    // Only flash every beat in high-energy sections; every 2 beats in verses
    const isHigh = sec.type === 'drop' || sec.type === 'chorus'
    if (!isHigh && i % 2 !== 0) continue

    const intensity = Math.min(1, opts.beatIntensity * (0.6 + sec.energy * 0.6))
    push(t, 'BEAT_FLASH', {
      intensity: Math.round(intensity * 255),
      decay: Math.round(decayValue * 255),
    })
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

  // Sort by timestamp, break ties so SET_PATTERN comes before BEAT_FLASH
  const cmdOrder: Record<ShowEvent['cmd'], number> = {
    TRANSITION:     0,
    SET_PATTERN:    1,
    SET_PALETTE:    2,
    SET_SPEED:      3,
    SET_BRIGHTNESS: 4,
    BEAT_FLASH:     5,
  }
  events.sort((a, b) => a.t !== b.t ? a.t - b.t : cmdOrder[a.cmd] - cmdOrder[b.cmd])

  return {
    version: 1,
    songTitle: analysis.title,
    durationMs: analysis.durationMs,
    bpm: analysis.beats.bpm,
    events,
  }
}

// ── Show file → JSON string ───────────────────────────────────────────────────

export function showFileToJson(show: ShowFile): string {
  return JSON.stringify(show, null, 2)
}

// ── Show file → compact binary (for SD card) ──────────────────────────────────
// Format: magic(4) + version(1) + bpm_x10(2) + duration_ms(4) + event_count(4)
// Per event: t_ms(4) + cmd(1) + param_count(1) + params[](4*N float32)
//
// Commands: 0=SET_PATTERN 1=SET_PALETTE 2=SET_SPEED 3=SET_BRIGHTNESS 4=BEAT_FLASH 5=TRANSITION
// Param encoding (all float32):
//   SET_PATTERN:   patternId(float)
//   SET_PALETTE:   paletteId(float)
//   SET_SPEED:     value
//   SET_BRIGHTNESS: value
//   BEAT_FLASH:    intensity, decay
//   TRANSITION:    typeId(float), duration

const PATTERN_IDS: Record<string, number> = {
  SolidColor: 0, NoiseField: 1, Plasma: 2, Fire: 3, Fire2012: 4,
  Noise2D: 5, RadialBurst: 6, Spiral: 7, Kaleidoscope: 8, Particles: 9,
  Simplex2D: 10, GradientFrame: 11,
}
const PALETTE_IDS: Record<string, number> = {
  rainbow: 0, ocean: 1, fire: 2, forest: 3, lava: 4,
  party: 5, ice: 6, purple: 7,
}
const TRANSITION_IDS: Record<string, number> = {
  crossfade: 0, wipe: 1, dissolve: 2,
}
const CMD_IDS: Record<ShowEvent['cmd'], number> = {
  SET_PATTERN: 0, SET_PALETTE: 1, SET_SPEED: 2, SET_BRIGHTNESS: 3,
  BEAT_FLASH: 4, TRANSITION: 5,
}

export function showFileToBinary(show: ShowFile): ArrayBuffer {
  const headerBytes = 4 + 1 + 2 + 4 + 4   // magic + version + bpm + duration + count
  const eventBytes  = show.events.length * (4 + 1 + 1 + 4 * 2)  // worst case 2 params each
  const buf = new ArrayBuffer(headerBytes + eventBytes)
  const view = new DataView(buf)
  let off = 0

  // Magic "SHOW"
  view.setUint8(off++, 0x53); view.setUint8(off++, 0x48)
  view.setUint8(off++, 0x4F); view.setUint8(off++, 0x57)
  view.setUint8(off++, 1)                                    // version
  view.setUint16(off, Math.round(show.bpm * 10), true); off += 2
  view.setUint32(off, Math.round(show.durationMs), true);   off += 4
  view.setUint32(off, show.events.length, true);            off += 4

  for (const ev of show.events) {
    view.setUint32(off, ev.t, true); off += 4
    view.setUint8(off++, CMD_IDS[ev.cmd] ?? 0)

    const params: number[] = []
    switch (ev.cmd) {
      case 'SET_PATTERN':    params.push(PATTERN_IDS[ev.params.name as string] ?? 0); break
      case 'SET_PALETTE':    params.push(PALETTE_IDS[ev.params.name as string] ?? 0); break
      case 'SET_SPEED':      params.push(Number(ev.params.value)); break
      case 'SET_BRIGHTNESS': params.push(Number(ev.params.value)); break
      case 'BEAT_FLASH':     params.push(Number(ev.params.intensity), Number(ev.params.decay)); break
      case 'TRANSITION':     params.push(TRANSITION_IDS[ev.params.type as string] ?? 0, Number(ev.params.duration)); break
    }

    view.setUint8(off++, params.length)
    for (const p of params) { view.setFloat32(off, p, true); off += 4 }
  }

  return buf.slice(0, off)
}
