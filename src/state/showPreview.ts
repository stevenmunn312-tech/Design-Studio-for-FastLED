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
import { showAudioOverride } from './showAudio'
import { NODE_LIBRARY } from './nodeLibrary'
import { isStudioPalette } from './paletteCatalog'
import type { StudioNode, StudioEdge } from './graphStore'
import type { ShowFile, SongSection } from '../types/showFile'

// Show pattern name → studio node type (+ fixed props). The performance
// generator emits legacy names (NoiseField/Simplex2D) folded into `Noise`.
const PATTERN_NODE: Record<string, { nodeType: string; props?: Record<string, unknown> }> = {
  SolidColor:   { nodeType: 'SolidColor', props: { r: 0, g: 150, b: 255 } },
  NoiseField:   { nodeType: 'Noise', props: { noiseType: 'field' } },
  Simplex2D:    { nodeType: 'Noise', props: { noiseType: 'simplex' } },
  Plasma:       { nodeType: 'Plasma' },
  Fire:         { nodeType: 'Fire' },
  Fire2012:     { nodeType: 'Fire2012' },
  Noise2D:      { nodeType: 'Noise2D' },
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

/** The active pattern/palette/speed/energy/brightness at a playback position (ms). */
export function showStateAt(show: ShowFile, timeMs: number): ShowState {
  const st: ShowState = { pattern: 'NoiseField', patternIndex: -1, palette: 'rainbow', speed: 1, energy: 0, brightness: 200 }
  for (const ev of show.events) {
    if (ev.t > timeMs) break
    switch (ev.cmd) {
      case 'SET_PATTERN':
        // Enum shows carry a pattern name; collection shows (v2) carry an index.
        if (ev.params.index !== undefined) st.patternIndex = Number(ev.params.index)
        else st.pattern = String(ev.params.name)
        break
      case 'SET_PALETTE':    st.palette = String(ev.params.name); break
      case 'SET_SPEED':      st.speed = Number(ev.params.value); break
      case 'SET_ENERGY':     st.energy = Number(ev.params.value); break
      case 'SET_BRIGHTNESS': st.brightness = Number(ev.params.value); break
    }
  }
  return st
}

/** Current beat-flash level (0–1) from the most recent BEAT_FLASH, decaying. */
export function beatFlashAt(show: ShowFile, timeMs: number): number {
  let flash = 0
  for (const ev of show.events) {
    if (ev.t > timeMs) break
    if (ev.cmd !== 'BEAT_FLASH') continue
    const age = timeMs - ev.t
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
  audioOverride: AudioOverride | null,
): Frame {
  const def = groups[groupId]
  if (!def) return blank(W, H)
  return evaluateGraph(
    def.nodes, def.edges, timeMs * 0.06, W, H, groups,
    `__show_${groupId}/`, new Set([groupId]), groupInputs, audioOverride,
  ) ?? blank(W, H)
}

// Render the pattern active in a given ShowState (enum name or collection index),
// before brightness/flash. Shared by the steady-state and transition paths.
function renderStateFrame(
  show: ShowFile, st: ShowState, timeMs: number, W: number, H: number,
  groups: GroupRegistry, useGroupInputs: boolean, audioOverride: AudioOverride | null,
): Frame {
  const groupId = show.patternSet && st.patternIndex >= 0 ? show.patternSet[st.patternIndex] : undefined
  const palette = isStudioPalette(st.palette) ? st.palette : 'rainbow'
  // SET_SPEED is a 0–2 multiplier; the `speed` role wants 0–1, so normalise it
  // (matched by the firmware player's CMD_SET_SPEED → speed normalisation). The
  // palette role passes the same palette id the studio uses.
  const groupInputs: Record<string, PortValue> = useGroupInputs
    ? { energy: st.energy, speed: Math.min(1, st.speed / 2), palette }
    : {}
  return groupId
    ? renderGroupFrame(groupId, timeMs, W, H, groups, groupInputs, audioOverride)
    : renderEnumFrame(st, timeMs, W, H)
}

/** The TRANSITION currently in progress at `timeMs`, if any: its start, style,
 *  and 0–1 progress. A transition runs over [t, t + duration] from the event. */
function activeTransitionAt(
  show: ShowFile, timeMs: number,
): { startMs: number; type: string; progress: number } | null {
  let active: { startMs: number; type: string; progress: number } | null = null
  for (const ev of show.events) {
    if (ev.t > timeMs) break            // events are time-sorted
    if (ev.cmd !== 'TRANSITION') continue
    const durMs = Number(ev.params.duration) * 1000
    if (durMs <= 0) continue
    if (timeMs < ev.t + durMs) {
      active = { startMs: ev.t, type: String(ev.params.type ?? 'crossfade'), progress: (timeMs - ev.t) / durMs }
    }
  }
  return active
}

// ── Particle-burst overlay ────────────────────────────────────────────────────
// The spark motion lives in graphEvaluator (renderParticleBurst), shared with the
// PatternMaster beat-triggered overlay; here we just find the active PARTICLE_BURST
// event and delegate. A single active burst matches the firmware's single slot.
/** Additive spark overlay for the most recent PARTICLE_BURST still within its
 *  lifetime, or null if none is active. */
function particleOverlayAt(show: ShowFile, timeMs: number, W: number, H: number): Frame | null {
  let burst: ShowFile['events'][number] | null = null
  for (const ev of show.events) {
    if (ev.t > timeMs) break
    if (ev.cmd !== 'PARTICLE_BURST') continue
    if (timeMs < ev.t + PARTICLE_LIFE_MS) burst = ev
  }
  if (!burst) return null
  return renderParticleBurst(
    burst.t, timeMs, Number(burst.params.intensity) / 255,
    Number(burst.params.style ?? 0), Number(burst.params.hue), W, H,
  )
}

/** Render the show's LED frame at a playback position (ms). `groups` is the live
 *  group registry (collection shows). When `useGroupInputs` is on, the section
 *  energy, (normalised) speed, and palette are fed to the patterns'
 *  `energy`/`speed`/`palette` group-input roles. */
export function renderShowFrame(
  show: ShowFile, timeMs: number, W: number, H: number,
  groups: GroupRegistry = {}, useGroupInputs = false,
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
    const fromFrame = renderStateFrame(show, fromState, timeMs, W, H, groups, useGroupInputs, audioOverride)
    const toFrame = renderStateFrame(show, toState, timeMs, W, H, groups, useGroupInputs, audioOverride)
    result = compositeTransition(tr.type, fromFrame, toFrame, tr.progress, W, H)
  } else {
    result = renderStateFrame(show, st, timeMs, W, H, groups, useGroupInputs, audioOverride)
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
