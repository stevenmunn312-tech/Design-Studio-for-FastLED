// ── Essentia.js song analyzer ─────────────────────────────────────────────────
// A drop-in alternative to the built-in DSP analyzer (`musicAnalyzer.ts`),
// producing the same `SongAnalysis` shape but using Essentia.js — a WebAssembly
// build of the Essentia C++ MIR library — for materially better results on the
// pre-planned export path: validated BPM/beat tracking (RhythmExtractor2013),
// real key detection (KeyExtractor), and danceability-aware mood.
//
// Essentia is imported lazily so the multi-MB WASM stays in its own code-split
// chunk and never loads in tests or the main bundle. Analysis is CPU-heavy
// (a few seconds/song); productionising this should move it to a Web Worker so
// the UI doesn't block during "Analyse All".

import type { BeatInfo, EnergyPoint, SongAnalysis } from '../types/showFile'
import { ENERGY_HOP_MS, decodeToMono, detectSections, normalizeEnergy } from './songAnalysisCommon'

const SAMPLE_RATE = 44100
const FRAME_SIZE  = 2048
const HOP_SIZE    = 1024
// RhythmExtractor2013 'multifeature' confidence is reported on a 0–5.32 scale.
const MAX_RHYTHM_CONFIDENCE = 5.32

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// ── Lazy WASM backend (one cached instance, reused across songs) ───────────────
let essentiaPromise: Promise<EssentiaApi> | null = null

// The dist files are dual UMD/ESM builds; bundlers (Vite vs esbuild/tsx) wrap
// them differently, so resolve the class and WASM backend defensively rather
// than assuming a fixed export shape.
function unwrapCtor(mod: unknown): new (wasm: unknown) => EssentiaApi {
  let cur: unknown = mod
  for (let i = 0; i < 4 && cur && typeof cur !== 'function'; i++) {
    cur = (cur as Record<string, unknown>).default
  }
  if (typeof cur !== 'function') throw new Error('essentia.js: could not resolve Essentia constructor')
  return cur as new (wasm: unknown) => EssentiaApi
}

async function resolveBackend(mod: Record<string, unknown>): Promise<unknown> {
  // The emscripten Module exposes a `HEAPU8` view once initialised — use that to
  // pick the right object among the various wrapper shapes.
  const hasHeap = (o: unknown) => !!o && typeof o === 'object' && 'HEAPU8' in (o as object)
  const dflt = mod.default as Record<string, unknown> | undefined
  const candidates = [mod.EssentiaWASM, dflt?.EssentiaWASM, dflt, mod]
  for (const c of candidates) if (hasHeap(c)) return c
  // Otherwise treat the most likely candidate as a factory/promise and await it.
  let f: unknown = mod.EssentiaWASM ?? mod.default ?? mod
  if (typeof f === 'function') f = await (f as () => unknown)()
  else if (f && typeof (f as PromiseLike<unknown>).then === 'function') f = await f
  if (f && typeof f === 'object' && 'EssentiaWASM' in (f as object) && !hasHeap(f)) {
    f = (f as Record<string, unknown>).EssentiaWASM
  }
  return f
}

async function getEssentia(): Promise<EssentiaApi> {
  if (!essentiaPromise) {
    essentiaPromise = (async () => {
      const [coreMod, wasmMod] = await Promise.all([
        import('essentia.js/dist/essentia.js-core.es.js'),
        import('essentia.js/dist/essentia-wasm.es.js'),
      ])
      const Essentia = unwrapCtor(coreMod.default ?? coreMod)
      const backend = await resolveBackend(wasmMod as unknown as Record<string, unknown>)
      return new Essentia(backend)
    })()
  }
  return essentiaPromise
}

// ── BPM + beat grid ───────────────────────────────────────────────────────────
function extractRhythm(essentia: EssentiaApi, signal: EssentiaVector): BeatInfo {
  // 'multifeature' is the slower, more accurate beat tracker (vs 'degara').
  const r = essentia.RhythmExtractor2013(signal, 208, 'multifeature', 40)
  const ticks = essentia.vectorToArray(r.ticks)            // beat positions in seconds
  const timestamps = Array.from(ticks, s => s * 1000)
  r.ticks.delete()
  return {
    timestamps,
    bpm: Math.round(r.bpm),
    confidence: clamp01(r.confidence / MAX_RHYTHM_CONFIDENCE),
  }
}

// ── Per-band energy envelope (FFT → band energies, bucketed to ENERGY_HOP_MS) ──
function extractEnergy(essentia: EssentiaApi, mono: Float32Array, sampleRate: number): EnergyPoint[] {
  const frameMs = (HOP_SIZE / sampleRate) * 1000
  const frames = essentia.FrameGenerator(mono, FRAME_SIZE, HOP_SIZE)
  const nFrames = frames.size()

  interface Acc { b: number; m: number; t: number; o: number; n: number }
  const buckets = new Map<number, Acc>()

  for (let i = 0; i < nFrames; i++) {
    const win  = essentia.Windowing(frames.get(i), false, FRAME_SIZE, 'hann')
    const spec = essentia.Spectrum(win.frame, FRAME_SIZE)
    const bass   = essentia.EnergyBand(spec.spectrum, sampleRate, 20, 250).energyBand
    const mids   = essentia.EnergyBand(spec.spectrum, sampleRate, 250, 4000).energyBand
    const treble = essentia.EnergyBand(spec.spectrum, sampleRate, 4000, 16000).energyBand
    win.frame.delete()
    spec.spectrum.delete()

    // sqrt(energy) ≈ amplitude, which reads better as an envelope than raw energy
    const bk = Math.floor((i * frameMs) / ENERGY_HOP_MS)
    const acc = buckets.get(bk) ?? { b: 0, m: 0, t: 0, o: 0, n: 0 }
    acc.b += Math.sqrt(bass)
    acc.m += Math.sqrt(mids)
    acc.t += Math.sqrt(treble)
    acc.o += Math.sqrt(bass + mids + treble)
    acc.n += 1
    buckets.set(bk, acc)
  }
  frames.delete()

  const maxBk = buckets.size ? Math.max(...buckets.keys()) : 0
  const points: EnergyPoint[] = []
  for (let bk = 0; bk <= maxBk; bk++) {
    const a = buckets.get(bk)
    points.push(a
      ? { t: bk * ENERGY_HOP_MS, bass: a.b / a.n, mids: a.m / a.n, treble: a.t / a.n, overall: a.o / a.n }
      : { t: bk * ENERGY_HOP_MS, bass: 0, mids: 0, treble: 0, overall: 0 })
  }
  return normalizeEnergy(points)
}

// ── Mood: real key drives valence; danceability + energy drive arousal ─────────
function estimateMood(energy: EnergyPoint[], key: string, scale: string, danceability: number): SongAnalysis['mood'] {
  const avg = (sel: (p: EnergyPoint) => number) =>
    energy.length ? energy.reduce((s, p) => s + sel(p), 0) / energy.length : 0
  const avgO = avg(p => p.overall), avgB = avg(p => p.bass), avgT = avg(p => p.treble)

  const major = scale.toLowerCase() === 'major'
  const valence = clamp01(0.5 + (major ? 0.15 : -0.15) + (avgT - avgB) * 0.25)
  const moodEnergy = clamp01(0.4 * Math.min(1, avgO * 1.5) + 0.6 * Math.min(1, danceability / 3))

  return { energy: moodEnergy, valence, key: key ? `${key} ${scale}` : 'C major' }
}

// ── Public API (mirrors musicAnalyzer.analyzeSong) ────────────────────────────
export async function analyzeSong(file: File): Promise<SongAnalysis> {
  const essentia = await getEssentia()
  const { mono, sampleRate, durationMs } = await decodeToMono(file, SAMPLE_RATE)

  const signal = essentia.arrayToVector(mono)
  try {
    const beats  = extractRhythm(essentia, signal)
    const energy = extractEnergy(essentia, mono, sampleRate)

    let key = '', scale = 'major', danceability = 0
    try { const k = essentia.KeyExtractor(signal); key = k.key; scale = k.scale } catch { /* key optional */ }
    try { danceability = essentia.Danceability(signal, undefined, undefined, sampleRate).danceability } catch { /* optional */ }

    const sections = detectSections(energy, durationMs)
    const mood     = estimateMood(energy, key, scale, danceability)

    return {
      title: file.name.replace(/\.[^/.]+$/, ''),
      durationMs,
      beats,
      energy,
      sections,
      mood,
    }
  } finally {
    signal.delete()
  }
}
