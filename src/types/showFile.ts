// ── Show file types ───────────────────────────────────────────────────────────
// A .show file is a sorted array of timed events that the ESP32 player
// executes in sync with audio playback.

export type ShowCommand =
  | 'SET_PATTERN'      // switch to a named pattern
  | 'SET_PALETTE'      // switch colour palette
  | 'SET_SPEED'        // animation speed multiplier (0-1 → slow-fast)
  | 'SET_BRIGHTNESS'   // global brightness (0-255)
  | 'SET_ENERGY'       // section energy 0-1 — drives the `energy` group-input role
  | 'BEAT_FLASH'       // instantaneous brightness spike + decay
  | 'TRANSITION'       // crossfade/wipe/dissolve to next pattern

export interface ShowEvent {
  t: number            // timestamp in milliseconds from song start
  cmd: ShowCommand
  params: Record<string, number | string>
}

export interface ShowFile {
  version: 1 | 2
  songTitle: string
  durationMs: number
  bpm: number
  events: ShowEvent[]
  /**
   * Collection shows (version 2): the ordered group ids the show draws from,
   * parallel to `PatternCollection.patternIds`. A `SET_PATTERN` event then
   * carries `params.index` (a position in this array) instead of `params.name`,
   * and the player maps that index to its compiled `render_pN()` function.
   * Absent on enum shows (version 1), where `SET_PATTERN` uses `params.name`.
   */
  patternSet?: string[]
}

// ── Song analysis output from musicAnalyzer ───────────────────────────────────

export interface BeatInfo {
  timestamps: number[]   // ms of each detected beat
  bpm: number
  confidence: number     // 0-1
}

export interface EnergyPoint {
  t: number              // ms
  bass: number           // 0-1
  mids: number           // 0-1
  treble: number         // 0-1
  overall: number        // 0-1
}

export interface SongSection {
  startMs: number
  endMs: number
  type: 'intro' | 'verse' | 'buildup' | 'drop' | 'chorus' | 'bridge' | 'outro'
  energy: number         // 0-1, average energy of the section
}

export interface SongAnalysis {
  title: string
  durationMs: number
  beats: BeatInfo
  energy: EnergyPoint[]  // sampled every ~100ms
  sections: SongSection[]
  mood: {
    energy: number       // 0-1 (calm → energetic)
    valence: number      // 0-1 (dark → bright)
    key: string          // e.g. "C major", "A minor"
  }
}
