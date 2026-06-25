import type { BeatInfo, EnergyPoint, SongAnalysis, SongSection } from '../types/showFile'

// ── Constants ─────────────────────────────────────────────────────────────────
const HOP_SIZE    = 512
const SAMPLE_RATE = 44100
const ENERGY_HOP_MS = 100

// ── Low-level helpers ─────────────────────────────────────────────────────────

function rms(buf: Float32Array, start: number, len: number): number {
  let s = 0
  const end = Math.min(start + len, buf.length)
  for (let i = start; i < end; i++) s += buf[i] * buf[i]
  return Math.sqrt(s / (end - start))
}

// Fast approximate band energy — sums squares in a sliding window with a
// simple first-order IIR to emphasise the target frequency band.
function fastBandEnergy(buf: Float32Array, start: number, len: number, loFrac: number, hiFrac: number): number {
  const end = Math.min(start + len, buf.length)
  const n = end - start
  if (n <= 0) return 0
  // Bandpass approximation: difference of two IIR lowpass filters
  let lp1 = 0, lp2 = 0, energy = 0
  const a1 = Math.exp(-2 * Math.PI * hiFrac)
  const a2 = Math.exp(-2 * Math.PI * loFrac)
  for (let i = start; i < end; i++) {
    lp1 = a1 * lp1 + (1 - a1) * buf[i]
    lp2 = a2 * lp2 + (1 - a2) * buf[i]
    const bp = lp1 - lp2
    energy += bp * bp
  }
  return Math.sqrt(energy / n)
}

// ── Beat / BPM detection via onset autocorrelation ───────────────────────────

function detectBeats(mono: Float32Array): BeatInfo {
  const hopSamples = HOP_SIZE
  const frameCount = Math.floor(mono.length / hopSamples)
  const onsets = new Float32Array(frameCount)

  // Compute RMS energy per hop, detect positive flux (onset strength)
  let prevE = 0
  for (let i = 0; i < frameCount; i++) {
    const e = rms(mono, i * hopSamples, hopSamples)
    onsets[i] = Math.max(0, e - prevE)
    prevE = e
  }

  // Autocorrelation of onset signal to find dominant periodicity (= BPM)
  const minBPM = 60, maxBPM = 200
  const minPeriod = Math.floor(SAMPLE_RATE / (maxBPM / 60) / hopSamples)
  const maxPeriod = Math.floor(SAMPLE_RATE / (minBPM / 60) / hopSamples)
  let bestPeriod = minPeriod, bestCorr = -Infinity
  for (let p = minPeriod; p <= maxPeriod; p++) {
    let corr = 0
    for (let i = 0; i + p < frameCount; i++) corr += onsets[i] * onsets[i + p]
    if (corr > bestCorr) { bestCorr = corr; bestPeriod = p }
  }

  const periodMs = bestPeriod * hopSamples / SAMPLE_RATE * 1000
  const bpm = Math.round(60000 / periodMs)

  // Pick beat timestamps: local maxima in onset strength, spaced ~periodMs apart
  const minGap = Math.round(periodMs * 0.8 / hopSamples * SAMPLE_RATE / 1000)
  const timestamps: number[] = []
  let lastPeak = -minGap
  const threshold = onsets.reduce((a, b) => Math.max(a, b)) * 0.35
  for (let i = 1; i < frameCount - 1; i++) {
    if (onsets[i] > onsets[i - 1] && onsets[i] > onsets[i + 1] &&
        onsets[i] > threshold && (i - lastPeak) >= minGap) {
      timestamps.push(i * hopSamples / SAMPLE_RATE * 1000)
      lastPeak = i
    }
  }

  const confidence = Math.min(1, bestCorr / (frameCount * 0.5))
  return { timestamps, bpm: Math.max(60, Math.min(200, bpm)), confidence }
}

// ── Energy envelope ───────────────────────────────────────────────────────────

function extractEnergy(mono: Float32Array): EnergyPoint[] {
  const stepSamples = Math.floor(SAMPLE_RATE * ENERGY_HOP_MS / 1000)
  const count = Math.floor(mono.length / stepSamples)
  const points: EnergyPoint[] = []

  for (let i = 0; i < count; i++) {
    const start = i * stepSamples
    // Frequency fractions relative to Nyquist for 44100Hz sample rate:
    // bass  20–250Hz  → 0.00045–0.0057
    // mids  250–4kHz  → 0.0057–0.091
    // treble 4k–20kHz → 0.091–0.45
    const bass   = fastBandEnergy(mono, start, stepSamples, 0.00045, 0.0057)
    const mids   = fastBandEnergy(mono, start, stepSamples, 0.0057,  0.091)
    const treble = fastBandEnergy(mono, start, stepSamples, 0.091,   0.45)
    const overall = rms(mono, start, stepSamples)
    points.push({ t: i * ENERGY_HOP_MS, bass, mids, treble, overall })
  }

  // Normalise each band to 0-1
  const maxB = points.reduce((m, p) => Math.max(m, p.bass),    0) || 1
  const maxM = points.reduce((m, p) => Math.max(m, p.mids),    0) || 1
  const maxT = points.reduce((m, p) => Math.max(m, p.treble),  0) || 1
  const maxO = points.reduce((m, p) => Math.max(m, p.overall), 0) || 1
  for (const p of points) {
    p.bass    /= maxB
    p.mids    /= maxM
    p.treble  /= maxT
    p.overall /= maxO
  }

  return points
}

// ── Section detection ─────────────────────────────────────────────────────────

function detectSections(energy: EnergyPoint[], _durationMs: number): SongSection[] {
  if (energy.length === 0) return []

  // Smooth energy with a 1-second window
  const windowSize = Math.floor(1000 / ENERGY_HOP_MS)
  const smoothed = energy.map((_, i) => {
    const lo = Math.max(0, i - windowSize)
    const hi = Math.min(energy.length - 1, i + windowSize)
    let sum = 0; for (let j = lo; j <= hi; j++) sum += energy[j].overall
    return sum / (hi - lo + 1)
  })

  // Find change points: places where smoothed energy changes significantly
  const minSectionMs = 8000  // sections must be at least 8s
  const minSectionFrames = Math.floor(minSectionMs / ENERGY_HOP_MS)
  const changePoints: number[] = [0]
  for (let i = windowSize; i < smoothed.length - windowSize; i++) {
    const before = smoothed[i - windowSize]
    const after  = smoothed[Math.min(smoothed.length - 1, i + windowSize)]
    const delta  = Math.abs(after - before)
    if (delta > 0.15 && (i - changePoints[changePoints.length - 1]) >= minSectionFrames) {
      changePoints.push(i)
    }
  }
  changePoints.push(energy.length - 1)

  // Label each section by energy level and position
  const sections: SongSection[] = []
  const totalMs = _durationMs

  for (let i = 0; i < changePoints.length - 1; i++) {
    const startIdx = changePoints[i]
    const endIdx   = changePoints[i + 1]
    const startMs  = energy[startIdx].t
    const endMs    = energy[Math.min(endIdx, energy.length - 1)].t

    let avgE = 0
    for (let j = startIdx; j < endIdx; j++) avgE += smoothed[j]
    avgE /= (endIdx - startIdx) || 1

    const frac = startMs / totalMs
    let type: SongSection['type']
    if (frac < 0.08)        type = 'intro'
    else if (frac > 0.88)   type = 'outro'
    else if (avgE > 0.75)   type = 'drop'
    else if (avgE > 0.55)   type = 'chorus'
    else {
      // Detect buildups: rising energy before a drop
      const nextE = i + 1 < changePoints.length - 1
        ? smoothed[changePoints[i + 1]] : 0
      type = nextE > avgE + 0.15 ? 'buildup' : 'verse'
    }

    sections.push({ startMs, endMs, type, energy: avgE })
  }

  return sections
}

// ── Mood / key estimation ─────────────────────────────────────────────────────

function estimateMood(energy: EnergyPoint[]): SongAnalysis['mood'] {
  if (energy.length === 0) return { energy: 0.5, valence: 0.5, key: 'C major' }

  const avgE = energy.reduce((s, p) => s + p.overall, 0) / energy.length
  const avgB = energy.reduce((s, p) => s + p.bass, 0) / energy.length
  const avgT = energy.reduce((s, p) => s + p.treble, 0) / energy.length

  // High treble relative to bass → brighter/happier valence
  const valence = Math.min(1, Math.max(0, 0.5 + (avgT - avgB) * 0.5))
  const moodEnergy = Math.min(1, avgE * 2)

  return { energy: moodEnergy, valence, key: 'C major' }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function analyzeSong(file: File): Promise<SongAnalysis> {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })

  let audioBuffer: AudioBuffer
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer)
  } finally {
    ctx.close()
  }

  // Downmix to mono
  const mono = new Float32Array(audioBuffer.length)
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channel = audioBuffer.getChannelData(ch)
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i]
  }
  for (let i = 0; i < mono.length; i++) mono[i] /= audioBuffer.numberOfChannels

  const durationMs = audioBuffer.duration * 1000
  const beats      = detectBeats(mono)
  const energy     = extractEnergy(mono)
  const sections   = detectSections(energy, durationMs)
  const mood       = estimateMood(energy)

  return {
    title: file.name.replace(/\.[^/.]+$/, ''),
    durationMs,
    beats,
    energy,
    sections,
    mood,
  }
}
