// Show preview renderer — turns a generated .show event stream + a playback
// position into a rendered LED frame, so a scanned song can be played back and
// watched in sync (the browser mirror of the on-device player).
//
// It reuses the real graph evaluator: each SET_PATTERN maps to a one-node
// synthetic graph (pattern → MatrixOutput), so previewed patterns look exactly
// like the studio's. SET_PALETTE / SET_SPEED / SET_BRIGHTNESS and BEAT_FLASH are
// applied on top. A TRANSITION event crossfades (or wipes/dissolves/…) from the
// outgoing pattern to the incoming one over its `duration`, mirroring the device.

import { evaluateGraph, compositeTransition, renderParticleBurst, PARTICLE_LIFE_MS, type Frame, type GroupRegistry, type PortValue, type AudioOverride } from './graphEvaluator'
import { hsv } from './ledColor'
import { showAudioOverride } from './showAudio'
import { NODE_LIBRARY } from './nodeLibrary'
import { isStudioPalette } from './paletteCatalog'
import type { StudioNode, StudioEdge } from './graphStore'
import type { ShowFile, ShowEvent, SongSection } from '../types/showFile'

// Show pattern name → studio node type (+ fixed props). The performance
// generator emits legacy names (NoiseField/Simplex2D) folded into `Noise`.
const PATTERN_NODE: Record<string, { nodeType: string; props?: Record<string, unknown> }> = {
  SolidColor:   { nodeType: 'SolidColor', props: { r: 0, g: 150, b: 255 } },
  NoiseField:   { nodeType: 'Noise', props: { noiseType: 'field' } },
  Simplex2D:    { nodeType: 'Noise', props: { noiseType: 'simplex' } },
  Plasma:       { nodeType: 'Plasma' },
  Fire:         { nodeType: 'Fire' },
  Fire2012:     { nodeType: 'Fire2012' },
  Noise2D:      { nodeType: 'Noise', props: { noiseType: 'sine' } },
  RadialBurst:  { nodeType: 'RadialBurst' },
  Spiral:       { nodeType: 'Spiral' },
  Kaleidoscope: { nodeType: 'Kaleidoscope' },
  Particles:    { nodeType: 'Particles' },
  GradientFrame:{ nodeType: 'GradientFrame' },
}

export interface ShowState {
  pattern: string
  /** Collection shows (version 2): the active index into `show.patternSet`, else -1. */
  patternIndex: number
  palette: string
  speed: number
  energy: number       // 0–1 section energy — drives the `energy` group-input role
  brightness: number   // 0–255
}

const DEFAULT_SHOW_STATE: ShowState = { pattern: 'NoiseField', patternIndex: -1, palette: 'rainbow', speed: 1, energy: 0, brightness: 200 }

// ── Event index ────────────────────────────────────────────────────────────────
// showStateAt/beatFlashAt/activeTransitionAt/particleOverlayAt are each called
// several times per rendered frame (more during a transition), and a naive scan
// of `show.events` from the start makes every call O(n) — getting slower as
// playback approaches the end of a long, event-dense show. `show.events` is
// time-sorted, so instead we index it once per show object (cached by identity
// — every edit path, e.g. ShowTimeline's onChange, produces a fresh `show`
// object, so the cache never needs to be invalidated) and binary-search it.
interface ShowEventIndex {
  times: number[]              // show.events[i].t, ascending
  states: ShowState[]          // cumulative ShowState immediately after event i
  transitions: ShowEvent[]     // TRANSITION events only, ascending by t
  bursts: ShowEvent[]          // PARTICLE_BURST events only, ascending by t
  beats: ShowEvent[]           // BEAT_FLASH events only, ascending by t
}

const showIndexCache = new WeakMap<ShowFile, ShowEventIndex>()

function buildShowIndex(show: ShowFile): ShowEventIndex {
  const n = show.events.length
  const times: number[] = new Array(n)
  const states: ShowState[] = new Array(n)
  const transitions: ShowEvent[] = []
  const bursts: ShowEvent[] = []
  const beats: ShowEvent[] = []
  let st = DEFAULT_SHOW_STATE
  for (let i = 0; i < n; i++) {
    const ev = show.events[i]
    switch (ev.cmd) {
      case 'SET_PATTERN':
        // Enum shows carry a pattern name; collection shows (v2) carry an index.
        st = ev.params.index !== undefined
          ? { ...st, patternIndex: Number(ev.params.index) }
          : { ...st, pattern: String(ev.params.name) }
        break
      case 'SET_PALETTE':    st = { ...st, palette: String(ev.params.name) }; break
      case 'SET_SPEED':      st = { ...st, speed: Number(ev.params.value) }; break
      case 'SET_ENERGY':     st = { ...st, energy: Number(ev.params.value) }; break
      case 'SET_BRIGHTNESS': st = { ...st, brightness: Number(ev.params.value) }; break
      case 'TRANSITION':     transitions.push(ev); break
      case 'PARTICLE_BURST': bursts.push(ev); break
      case 'BEAT_FLASH':     beats.push(ev); break
    }
    times[i] = ev.t
    states[i] = st
  }
  return { times, states, transitions, bursts, beats }
}

function getShowIndex(show: ShowFile): ShowEventIndex {
  let idx = showIndexCache.get(show)
  if (!idx) { idx = buildShowIndex(show); showIndexCache.set(show, idx) }
  return idx
}

/** Index of the last item with `timeOf(item) <= timeMs`, or -1 if none. */
function lastIndexAtOrBefore<T>(items: T[], timeMs: number, timeOf: (item: T) => number): number {
  let lo = 0, hi = items.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (timeOf(items[mid]) <= timeMs) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

/** The active pattern/palette/speed/energy/brightness at a playback position (ms). */
export function showStateAt(show: ShowFile, timeMs: number): ShowState {
  const idx = getShowIndex(show)
  const i = lastIndexAtOrBefore(idx.times, timeMs, (t) => t)
  return i === -1 ? DEFAULT_SHOW_STATE : idx.states[i]
}

// Any BEAT_FLASH older than this cannot move a rendered channel by even one
// 0–255 step (255 * exp(-age/decayMs) rounds to 0 well before this, since
// decayMs is at most 300ms), so it's safe — not just a close approximation —
// to stop the backward scan here instead of walking every earlier flash.
const BEAT_FLASH_HORIZON_MS = 2000

/** Current beat-flash level (0–1) from the most recent BEAT_FLASH, decaying. */
export function beatFlashAt(show: ShowFile, timeMs: number): number {
  const idx = getShowIndex(show)
  let flash = 0
  for (let i = lastIndexAtOrBefore(idx.beats, timeMs, (ev) => ev.t); i >= 0; i--) {
    const ev = idx.beats[i]
    const age = timeMs - ev.t
    if (age > BEAT_FLASH_HORIZON_MS) break
    const decayMs = 60 + (Number(ev.params.decay) / 255) * 240
    const f = (Number(ev.params.intensity) / 255) * Math.exp(-age / decayMs)
    if (f > flash) flash = f
  }
  return Math.min(1, flash)
}

/** The song section covering a playback position, if any. */
export function sectionAt(sections: SongSection[], timeMs: number): SongSection | undefined {
  return sections.find((s) => timeMs >= s.startMs && timeMs < s.endMs)
}

function synthNode(id: string, nodeType: string, category: string, properties: Record<string, unknown>): StudioNode {
  const def = NODE_LIBRARY.find((n) => n.type === nodeType)
  return {
    id, type: 'studioNode', position: { x: 0, y: 0 },
    data: { label: nodeType, nodeType, category, properties, inputs: def?.inputs ?? [], outputs: def?.outputs ?? [] },
  } as unknown as StudioNode
}

const blank = (W: number, H: number): Frame =>
  Array.from({ length: H }, () => Array.from({ length: W }, () => ({ r: 0, g: 0, b: 0 })))

// Enum show: render the active built-in pattern through a synthetic one-node graph.
function renderEnumFrame(st: ShowState, timeMs: number, W: number, H: number): Frame {
  const map = PATTERN_NODE[st.pattern] ?? PATTERN_NODE.NoiseField
  const palette = isStudioPalette(st.palette) ? st.palette : 'rainbow'
  const props = { ...(map.props ?? {}), palette, speed: st.speed }
  // Stable per-pattern id so stateful patterns (Fire…) keep continuity.
  const patId = `__show_${map.nodeType}`
  const pat = synthNode(patId, map.nodeType, 'pattern', props)
  const out = synthNode('__show_out', 'MatrixOutput', 'output', { width: W, height: H })
  const edges = [{ id: '__show_e', source: patId, target: '__show_out', sourceHandle: 'frame', targetHandle: 'frame' }] as unknown as StudioEdge[]
  // t = tick/60 = seconds, so tick = ms * 0.06 keeps animation on the song clock.
  return evaluateGraph([pat, out], edges, timeMs * 0.06, W, H) ?? blank(W, H)
}

// Collection show: render the active pattern group's subgraph directly (its
// GroupOutput is the terminal), feeding role values to any GroupInput nodes. A
// stable per-group state prefix keeps stateful patterns continuous across frames.
function renderGroupFrame(
  groupId: string, timeMs: number, W: number, H: number,
  groups: GroupRegistry, groupInputs: Record<string, PortValue>,
  audioOverride: AudioOverride | null, trusted: boolean,
): Frame {
  const def = groups[groupId]
  if (!def) return blank(W, H)
  return evaluateGraph(
    def.nodes, def.edges, timeMs * 0.06, W, H, groups,
    `__show_${groupId}/`, new Set([groupId]), groupInputs, audioOverride,
    trusted,
  ) ?? blank(W, H)
}

// Render the pattern active in a given ShowState (enum name or collection index),
// before brightness/flash. Shared by the steady-state and transition paths.
function renderStateFrame(
  show: ShowFile, st: ShowState, timeMs: number, W: number, H: number,
  groups: GroupRegistry, useGroupInputs: boolean, audioOverride: AudioOverride | null,
  trusted: boolean,
): Frame {
  const groupId = show.patternSet && st.patternIndex >= 0 ? show.patternSet[st.patternIndex] : undefined
  const palette = isStudioPalette(st.palette) ? st.palette : 'rainbow'
  // Older saved patterns expose semantic audio GroupInputs instead of carrying
  // FFTAnalyzer/BeatDetect nodes inside the group. Once a Group is absorbed by
  // a PatternCollection there is no boundary noodle to drive those inputs, so
  // bind them from the same baked envelope used by the newer analyzer nodes.
  // Keep these aliases in sync with showGenerator's AUDIO_GROUP_INPUTS.
  const audioInputs: Record<string, PortValue> = audioOverride
    ? {
        bass: audioOverride.micBass,
        mids: audioOverride.micMids,
        treble: audioOverride.micTreble,
        kick: audioOverride.micBass,
        snare: audioOverride.micMids,
        hihat: audioOverride.micTreble,
        vocals: audioOverride.micMids,
        energy: (audioOverride.micBass + audioOverride.micMids + audioOverride.micTreble) / 3,
        beat: beatFlashAt(show, timeMs) > 0.01,
        silence: audioOverride.micBass + audioOverride.micMids + audioOverride.micTreble < 0.03,
      }
    : {}
  // SET_SPEED is a 0–2 multiplier; the `speed` role wants 0–1, so normalise it
  // (matched by the firmware player's CMD_SET_SPEED → speed normalisation). The
  // palette role passes the same palette id the studio uses.
  const groupInputs: Record<string, PortValue> = {
    ...audioInputs,
    ...(useGroupInputs ? { energy: st.energy, speed: Math.min(1, st.speed / 2), palette } : {}),
  }
  return groupId
    ? renderGroupFrame(groupId, timeMs, W, H, groups, groupInputs, audioOverride, trusted)
    : renderEnumFrame(st, timeMs, W, H)
}

/** The TRANSITION currently in progress at `timeMs`, if any: its start, style,
 *  and 0–1 progress. A transition runs over [t, t + duration] from the event.
 *  Transitions don't overlap, so the most recent one at-or-before `timeMs` is
 *  the only one that could still be active — no need to scan earlier ones. */
function activeTransitionAt(
  show: ShowFile, timeMs: number,
): { startMs: number; type: string; progress: number } | null {
  const idx = getShowIndex(show)
  const i = lastIndexAtOrBefore(idx.transitions, timeMs, (ev) => ev.t)
  if (i === -1) return null
  const ev = idx.transitions[i]
  const durMs = Number(ev.params.duration) * 1000
  if (durMs <= 0 || timeMs >= ev.t + durMs) return null
  return { startMs: ev.t, type: String(ev.params.type ?? 'crossfade'), progress: (timeMs - ev.t) / durMs }
}

// ── Particle-burst overlay ────────────────────────────────────────────────────
// The spark motion lives in graphEvaluator (renderParticleBurst), shared with the
// PatternMaster beat-triggered overlay; here we just find the active PARTICLE_BURST
// event and delegate. A single active burst matches the firmware's single slot.
/** Additive spark overlay for the most recent PARTICLE_BURST still within its
 *  lifetime, or null if none is active. Bursts don't overlap (the firmware
 *  keeps a single active slot), so if the most recent one at-or-before
 *  `timeMs` has already expired, no earlier one could still be live either. */
function particleOverlayAt(show: ShowFile, timeMs: number, W: number, H: number): Frame | null {
  const idx = getShowIndex(show)
  const i = lastIndexAtOrBefore(idx.bursts, timeMs, (ev) => ev.t)
  if (i === -1) return null
  const burst = idx.bursts[i]
  if (timeMs >= burst.t + PARTICLE_LIFE_MS) return null
  return renderParticleBurst(
    burst.t, timeMs, Number(burst.params.intensity) / 255,
    Number(burst.params.style ?? 0), hsv((Number(burst.params.hue) / 255) * 360, 1, 1), W, H,
  )
}

/** Render the show's LED frame at a playback position (ms). `groups` is the live
 *  group registry (collection shows). When `useGroupInputs` is on, the section
 *  energy, (normalised) speed, and palette are fed to the patterns'
 *  `energy`/`speed`/`palette` group-input roles. `trusted` mirrors the active
 *  workspace trust boundary: untrusted collection patterns may render ordinary
 *  nodes, but their Formula and Code preview logic remains disabled. */
export function renderShowFrame(
  show: ShowFile, timeMs: number, W: number, H: number,
  groups: GroupRegistry = {}, useGroupInputs = false, trusted = true,
): Frame {
  const st = showStateAt(show, timeMs)

  // Feed the song's baked bass/mids/treble to the group's audio-reactive nodes,
  // mirroring the firmware player — so FFTAnalyzer/BeatDetect react to the track
  // in the preview without a live mic. Independent of the group-input roles.
  const audioOverride = showAudioOverride(show.audio, timeMs)

  // Mid-transition: blend the outgoing pattern (state just before the switch)
  // into the incoming one (state at the switch) via the chosen transition style.
  const tr = activeTransitionAt(show, timeMs)
  let result: Frame
  if (tr) {
    const fromState = showStateAt(show, tr.startMs - 1)
    const toState = showStateAt(show, tr.startMs)
    const fromFrame = renderStateFrame(show, fromState, timeMs, W, H, groups, useGroupInputs, audioOverride, trusted)
    const toFrame = renderStateFrame(show, toState, timeMs, W, H, groups, useGroupInputs, audioOverride, trusted)
    result = compositeTransition(tr.type, fromFrame, toFrame, tr.progress, W, H)
  } else {
    result = renderStateFrame(show, st, timeMs, W, H, groups, useGroupInputs, audioOverride, trusted)
  }

  const b = Math.max(0, Math.min(1, st.brightness / 255))
  const flash = beatFlashAt(show, timeMs)
  const ov = particleOverlayAt(show, timeMs, W, H)
  for (let y = 0; y < result.length; y++) {
    for (let x = 0; x < result[y].length; x++) {
      const px = result[y][x]
      // Firmware applies the white flash + additive particle sparks to the raw
      // frame, then FastLED's global brightness scales the result in show().
      // Keep that order so a brightness of zero (silence) is truly dark and the
      // sparks fade with it — and so preview matches the device.
      const sp = ov?.[y][x]
      px.r = Math.round((Math.min(255, px.r + (255 - px.r) * flash + (sp?.r ?? 0))) * b)
      px.g = Math.round((Math.min(255, px.g + (255 - px.g) * flash + (sp?.g ?? 0))) * b)
      px.b = Math.round((Math.min(255, px.b + (255 - px.b) * flash + (sp?.b ?? 0))) * b)
    }
  }
  return result
}
