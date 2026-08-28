// ── Shared song-analysis helpers ──────────────────────────────────────────────
// Shared utilities for the Essentia.js offline analyzer: decoding a file to
// mono PCM and deriving labelled song sections from a normalised energy envelope.

import type { EnergyPoint, SongSection, StereoLevelPoint } from '../types/showFile'

export const ENERGY_HOP_MS = 100

export interface DecodedAudio {
  mono:       Float32Array
  sampleRate: number
  durationMs: number
  channelLevels: StereoLevelPoint[]
  channelCount: 1 | 2
}

const MIX_CHUNK_SAMPLES = 131_072

function yieldToMainThread(): Promise<void> {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return new Promise((resolve) => window.requestAnimationFrame(() => resolve()))
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Measure short-window channel RMS without running a second FFT analysis. */
export function extractStereoLevelEnvelope(
  left: ArrayLike<number>,
  right: ArrayLike<number>,
  sampleRate: number,
  channelCount: 1 | 2,
): StereoLevelPoint[] {
  const hop = Math.max(1, Math.round(sampleRate * ENERGY_HOP_MS / 1000))
  const length = Math.min(left.length, channelCount === 2 ? right.length : left.length)
  const result: StereoLevelPoint[] = []
  for (let start = 0; start < length; start += hop) {
    const end = Math.min(length, start + hop)
    let leftSquares = 0
    let rightSquares = 0
    for (let i = start; i < end; i++) {
      const l = Math.max(-1, Math.min(1, Number(left[i]) || 0))
      const r = channelCount === 2
        ? Math.max(-1, Math.min(1, Number(right[i]) || 0))
        : l
      leftSquares += l * l
      rightSquares += r * r
    }
    const count = Math.max(1, end - start)
    result.push({
      t: (start / sampleRate) * 1000,
      left: Math.sqrt(leftSquares / count),
      right: Math.sqrt(rightSquares / count),
    })
  }
  return result
}

/** Decode an audio File to mono PCM plus a lightweight channel-level track. */
export async function decodeToMono(file: File, sampleRate = 44100): Promise<DecodedAudio> {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = new AudioContext({ sampleRate })
  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    ctx.close()
  }

  const { length, numberOfChannels } = audioBuffer
  const leftChannel = audioBuffer.getChannelData(0)
  const rightChannel = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel
  const channelCount: 1 | 2 = numberOfChannels > 1 ? 2 : 1
  const channelLevels = extractStereoLevelEnvelope(
    leftChannel, rightChannel, audioBuffer.sampleRate, channelCount,
  )
  if (numberOfChannels === 1) {
    return {
      mono: leftChannel.slice(),
      sampleRate: audioBuffer.sampleRate,
      durationMs: audioBuffer.duration * 1000,
      channelLevels,
      channelCount,
    }
  }
  const mono = new Float32Array(length)

  if (numberOfChannels === 2) {
    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.getChannelData(1)
    for (let offset = 0; offset < length; offset += MIX_CHUNK_SAMPLES) {
      const end = Math.min(length, offset + MIX_CHUNK_SAMPLES)
      for (let i = offset; i < end; i++) mono[i] = (left[i] + right[i]) * 0.5
      if (end < length) await yieldToMainThread()
    }
  } else {
    const channels = Array.from({ length: numberOfChannels }, (_, i) => audioBuffer.getChannelData(i))
    const divisor = 1 / numberOfChannels
    for (let offset = 0; offset < length; offset += MIX_CHUNK_SAMPLES) {
      const end = Math.min(length, offset + MIX_CHUNK_SAMPLES)
      for (let i = offset; i < end; i++) {
        let sum = 0
        for (const channel of channels) sum += channel[i]
        mono[i] = sum * divisor
      }
      if (end < length) await yieldToMainThread()
    }
  }

  return {
    mono,
    sampleRate: audioBuffer.sampleRate,
    durationMs: audioBuffer.duration * 1000,
    channelLevels,
    channelCount,
  }
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
