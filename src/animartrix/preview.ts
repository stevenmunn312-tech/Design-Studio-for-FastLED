/*
 * Design Studio for FastLED AnimARTrix integration
 * SPDX-License-Identifier: CC-BY-NC-SA-4.0
 *
 * Visual mathematics adapted from AnimARTrix by Stefan Petrick.
 * Studio adaptation: audio smoothing, percussion envelopes, normalized matrix
 * coordinates, and a browser renderer paired with the generated C++ renderer.
 * https://github.com/StefanPetrick/animartrix
 */

import type { Frame, RGB } from '../state/ledColor'
import { asAnimartrixEffect, type AnimartrixEffect } from './catalog'

export interface AnimartrixAudio {
  bass: number
  mids: number
  treble: number
  kick: number
  snare: number
  hihat: number
  beat: boolean
}

export interface AnimartrixParams extends AnimartrixAudio {
  effect: AnimartrixEffect | string
  speed: number
  audioAmount: number
}

interface AnimartrixState {
  bass: number
  mids: number
  treble: number
  kick: number
  snare: number
  hihat: number
  beatPulse: number
  phase: number
  lastT: number
}

const states = new Map<string, AnimartrixState>()
const TAU = Math.PI * 2

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
const wave = (v: number) => 0.5 + 0.5 * Math.sin(v)
const screen = (a: number, b: number) => 1 - (1 - clamp01(a)) * (1 - clamp01(b))
const dodge = (a: number, b: number) => clamp01(a / Math.max(0.08, 1 - clamp01(b) * 0.86))
const rgb = (r: number, g: number, b: number): RGB => ({
  r: Math.round(clamp01(r) * 255),
  g: Math.round(clamp01(g) * 255),
  b: Math.round(clamp01(b) * 255),
})

function smooth(current: number, target: number, dt: number): number {
  const rate = target > current ? 18 : 5
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

function updateState(key: string, p: AnimartrixParams, t: number): AnimartrixState {
  let s = states.get(key)
  if (!s) {
    s = { bass: 0, mids: 0, treble: 0, kick: 0, snare: 0, hihat: 0, beatPulse: 0, phase: 0, lastT: t }
    states.set(key, s)
  }
  const dt = Math.max(0, Math.min(0.1, t - s.lastT))
  s.lastT = t
  s.bass = smooth(s.bass, clamp01(p.bass), dt)
  s.mids = smooth(s.mids, clamp01(p.mids), dt)
  s.treble = smooth(s.treble, clamp01(p.treble), dt)
  s.kick = smooth(s.kick, clamp01(p.kick), dt)
  s.snare = smooth(s.snare, clamp01(p.snare), dt)
  s.hihat = smooth(s.hihat, clamp01(p.hihat), dt)
  s.beatPulse = p.beat ? 1 : s.beatPulse * Math.exp(-7.5 * dt)
  const audio = Math.max(0, Math.min(2, p.audioAmount))
  s.phase += dt * Math.max(0, p.speed) * (0.45 + audio * (0.35 * s.mids + 0.2 * s.treble))
  return s
}

function renderPixel(effect: AnimartrixEffect, nx: number, ny: number, s: AnimartrixState, amount: number): RGB {
  const bass = s.bass * amount
  const mids = s.mids * amount
  const treble = s.treble * amount
  const kick = Math.max(s.kick, s.beatPulse) * amount
  const snare = s.snare * amount
  const hihat = s.hihat * amount
  const phase = s.phase * TAU
  const radius = Math.hypot(nx, ny)
  const theta = Math.atan2(ny, nx)
  const vignette = clamp01(1.2 - radius * 0.72)

  switch (effect) {
    case 'Polar Waves': {
      const pressure = radius * (9.5 - bass * 2.4) - phase * (2.2 + mids)
      const twist = theta * (3 + Math.round(snare * 3)) + kick * wave(radius * 18 - phase) * 1.8
      const r = wave(pressure + twist + treble * Math.sin(theta * 11 + phase * 2))
      const g = wave(pressure * 1.07 - twist * 0.72 + mids * 2.2)
      const b = wave(pressure * 1.19 + twist * 0.43 + hihat * Math.sin(radius * 36))
      return rgb(r * vignette, g * vignette, b * vignette)
    }

    case 'RGB Blobs': {
      const wobble = 0.65 * Math.sin(radius * 5 - phase * 0.8) + kick * 0.9 * Math.sin(radius * 14 - phase * 2)
      const width = 2.5 + bass * 1.7
      const r = Math.pow(wave(width * theta + phase * 1.13 + wobble), 1.35)
      const g = Math.pow(wave(width * theta - phase * 0.91 + wobble + 2.1 + mids), 1.35)
      const b = Math.pow(wave(width * theta + phase * 0.67 - wobble + 4.2 + treble * 2), 1.35)
      const edge = clamp01(1.28 - radius * (0.63 - bass * 0.08))
      return rgb(r * edge, g * edge, b * edge)
    }

    case 'Spiralus': {
      const arms = 2 + Math.round(snare * 4)
      const spiral = arms * theta + radius * (10 + bass * 4) - phase * (2.1 + mids)
      const fine = treble * Math.sin(theta * 9 - radius * 22 + phase * 3)
      const a = wave(spiral + fine)
      const b = wave(spiral * 1.07 + 2.1 - kick * 2)
      const c = wave(-spiral * 0.83 + 4.2 + hihat * Math.sin(radius * 40))
      return rgb(screen(a * 0.8, b * 0.42) * vignette, Math.abs(a - b) * vignette, screen(c * 0.8, a * 0.28) * vignette)
    }

    case 'Complex Kaleido': {
      const symmetry = 5 + Math.round(snare * 3)
      const folded = Math.acos(Math.cos(theta * symmetry))
      const a = wave(folded * 3 + radius * (8 - bass * 2) - phase * 2.1)
      const b = wave(folded * -4 + radius * 11 + phase * (1.4 + mids))
      const c = wave(folded * 5 - radius * 15 + phase * 0.73 + treble * Math.sin(radius * 30))
      const pulse = wave(radius * 13 - phase * 3 - kick * 2)
      return rgb(dodge(a, c * 0.64) * vignette, screen(b, pulse * 0.5) * vignette, screen(c, Math.abs(a - b)) * vignette)
    }

    case 'Water':
    default: {
      const wx = nx + 0.18 * Math.sin(ny * 5 + phase * (0.8 + mids))
      const wy = ny + 0.18 * Math.cos(nx * 4.3 - phase * 0.67)
      const dist = Math.hypot(wx, wy) * (8.5 - bass * 1.6)
      const causticA = wave(dist * 1.9 - phase * 2.2 + Math.sin(theta * 4 + phase) * 1.4)
      const causticB = wave(dist * 2.43 + phase * 1.31 + Math.cos(theta * 5 - phase) * 1.1)
      const shock = wave(radius * 18 - phase * 3.4 - kick * 3)
      const shimmer = wave((wx - wy) * (18 + treble * 12) + phase * 4) * hihat
      const water = screen(causticA * 0.7, causticB * 0.55)
      return rgb((water * 0.2 + shock * kick * 0.2) * vignette, (water * 0.62 + shimmer * 0.18) * vignette, (water * 0.95 + shock * kick * 0.35 + shimmer * 0.25) * vignette)
    }
  }
}

export function evalAnimartrix(key: string, params: AnimartrixParams, t: number, width: number, height: number): Frame {
  const s = updateState(key, params, t)
  const effect = asAnimartrixEffect(params.effect)
  const amount = Math.max(0, Math.min(2, params.audioAmount))
  const frame: Frame = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ r: 0, g: 0, b: 0 })))
  const scale = 2 / Math.max(1, Math.min(width, height) - 1)
  const cx = (width - 1) * 0.5
  const cy = (height - 1) * 0.5
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    frame[y][x] = renderPixel(effect, (x - cx) * scale, (y - cy) * scale, s, amount)
  }
  return frame
}

export function disposeAnimartrixState(key: string): void {
  states.delete(key)
}
