// ── Shared song-analysis helpers ──────────────────────────────────────────────
// Pieces common to every offline analyzer engine (built-in DSP, Essentia.js):
// decoding the file to mono, and deriving labelled song sections from a
// normalised energy envelope. Keeping these here means each engine only has to
// produce a `SongAnalysis` and the rest stays consistent.

import type { EnergyPoint, SongSection } from '../types/showFile'

export const ENERGY_HOP_MS = 100

export interface DecodedAudio {
  mono:       Float32Array
  sampleRate: number
  durationMs: number
}

/** Decode an audio File to a mono Float32Array at the requested sample rate. */
export async function decodeToMono(file: File, sampleRate = 44100): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = new AudioContext({ sampleRate })
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    ctx.close()
  }

  const mono = new Float32Array(audioBuffer.length)
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channel = audioBuffer.getChannelData(ch)
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i]
  }
  if (audioBuffer.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i++) mono[i] /= audioBuffer.numberOfChannels
  }

  return { mono, sampleRate: audioBuffer.sampleRate, durationMs: audioBuffer.duration * 1000 }
}

/**
 * Segment a song into labelled sections from its normalised `overall` energy
 * envelope: smooth, split at significant energy change-points (≥8 s apart), then
 * label each run by position (intro/outro) and level (drop/chorus/buildup/verse).
 * Engine-agnostic — both the built-in and Essentia analyzers feed it the same
 * `EnergyPoint[]` shape sampled every `ENERGY_HOP_MS`.
 */
export function detectSections(energy: EnergyPoint[], durationMs: number): SongSection[] {
  if (energy.length === 0) return []

  const windowSize = Math.floor(1000 / ENERGY_HOP_MS)
  const smoothed = energy.map((_, i) => {
    const lo = Math.max(0, i - windowSize)
    const hi = Math.min(energy.length - 1, i + windowSize)
    let sum = 0; for (let j = lo; j <= hi; j++) sum += energy[j].overall
    return sum / (hi - lo + 1)
  })

  const minSectionMs = 8000
  const minSectionFrames = Math.floor(minSectionMs / ENERGY_HOP_MS)
  const changePoints: number[] = [0]
  for (let i = windowSize; i < smoothed.length - windowSize; i++) {
    const before = smoothed[i - windowSize]
    const after  = smoothed[Math.min(smoothed.length - 1, i + windowSize)]
    if (Math.abs(after - before) > 0.15 &&
        (i - changePoints[changePoints.length - 1]) >= minSectionFrames) {
      changePoints.push(i)
    }
  }
  changePoints.push(energy.length - 1)

  const sections: SongSection[] = []
  for (let i = 0; i < changePoints.length - 1; i++) {
    const startIdx = changePoints[i]
    const endIdx   = changePoints[i + 1]
    const startMs  = energy[startIdx].t
    const endMs    = energy[Math.min(endIdx, energy.length - 1)].t

    let avgE = 0
    for (let j = startIdx; j < endIdx; j++) avgE += smoothed[j]
    avgE /= (endIdx - startIdx) || 1

    const frac = startMs / durationMs
    let type: SongSection['type']
    if (frac < 0.08)      type = 'intro'
    else if (frac > 0.88) type = 'outro'
    else if (avgE > 0.75) type = 'drop'
    else if (avgE > 0.55) type = 'chorus'
    else {
      const nextE = i + 1 < changePoints.length - 1 ? smoothed[changePoints[i + 1]] : 0
      type = nextE > avgE + 0.15 ? 'buildup' : 'verse'
    }
    sections.push({ startMs, endMs, type, energy: avgE })
  }

  return sections
}

/** Normalise each band of an energy envelope to 0–1 by its own peak (in place). */
export function normalizeEnergy(points: EnergyPoint[]): EnergyPoint[] {
  const maxOf = (sel: (p: EnergyPoint) => number) =>
    points.reduce((m, p) => Math.max(m, sel(p)), 0) || 1
  const maxB = maxOf(p => p.bass), maxM = maxOf(p => p.mids)
  const maxT = maxOf(p => p.treble), maxO = maxOf(p => p.overall)
  for (const p of points) {
    p.bass /= maxB; p.mids /= maxM; p.treble /= maxT; p.overall /= maxO
  }
  return points
}
