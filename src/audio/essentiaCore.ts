import type { BeatInfo, EnergyPoint, SongAnalysis } from '../types/showFile'
import { ENERGY_HOP_MS, detectSections, normalizeEnergy } from './songAnalysisCommon'

const FRAME_SIZE = 2048
const HOP_SIZE   = 1024
const MAX_RHYTHM_CONFIDENCE = 5.32

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

let essentiaPromise: Promise<EssentiaApi> | null = null

function unwrapCtor(mod: unknown): new (wasm: unknown) => EssentiaApi {
  let cur: unknown = mod
  for (let i = 0; i < 4 && cur && typeof cur !== 'function'; i++) {
    cur = (cur as Record<string, unknown>).default
  }
  if (typeof cur !== 'function') throw new Error('essentia.js: could not resolve Essentia constructor')
  return cur as new (wasm: unknown) => EssentiaApi
}

async function resolveBackend(mod: Record<string, unknown>): Promise<unknown> {
  const hasHeap = (o: unknown) => !!o && typeof o === 'object' && 'HEAPU8' in (o as object)
  const dflt = mod.default as Record<string, unknown> | undefined
  const candidates = [mod.EssentiaWASM, dflt?.EssentiaWASM, dflt, mod]
  for (const candidate of candidates) if (hasHeap(candidate)) return candidate

  let resolved: unknown = mod.EssentiaWASM ?? mod.default ?? mod
  if (typeof resolved === 'function') resolved = await (resolved as () => unknown)()
  else if (resolved && typeof (resolved as PromiseLike<unknown>).then === 'function') resolved = await resolved
  if (resolved && typeof resolved === 'object' && 'EssentiaWASM' in (resolved as object) && !hasHeap(resolved)) {
    resolved = (resolved as Record<string, unknown>).EssentiaWASM
  }
  return resolved
}

export async function getEssentia(): Promise<EssentiaApi> {
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

function extractRhythm(essentia: EssentiaApi, signal: EssentiaVector): BeatInfo {
  const r = essentia.RhythmExtractor2013(signal, 208, 'multifeature', 40)
  try {
    const ticks = essentia.vectorToArray(r.ticks)
    return {
      timestamps: Array.from(ticks, (s) => s * 1000),
      bpm: Math.round(r.bpm),
      confidence: clamp01(r.confidence / MAX_RHYTHM_CONFIDENCE),
    }
  } finally {
    r.ticks.delete()
  }
}

export function extractEnergy(essentia: EssentiaApi, mono: Float32Array, sampleRate: number): EnergyPoint[] {
  const frameMs = (HOP_SIZE / sampleRate) * 1000
  const frames = essentia.FrameGenerator(mono, FRAME_SIZE, HOP_SIZE)
  const nFrames = frames.size()

  interface Acc { b: number; m: number; t: number; o: number; n: number }
  const buckets = new Map<number, Acc>()

  try {
    for (let i = 0; i < nFrames; i++) {
      // Embind returns a newly-owned vector wrapper from vector<vector<float>>
      // `.get()`. It must be deleted independently from the outer collection.
      const inputFrame = frames.get(i)
      let windowedFrame: EssentiaVector | null = null
      let spectrum: EssentiaVector | null = null
      try {
        windowedFrame = essentia.Windowing(inputFrame, false, FRAME_SIZE, 'hann').frame
        spectrum = essentia.Spectrum(windowedFrame, FRAME_SIZE).spectrum
        const bass   = essentia.EnergyBand(spectrum, sampleRate, 20, 250).energyBand
        const mids   = essentia.EnergyBand(spectrum, sampleRate, 250, 4000).energyBand
        const treble = essentia.EnergyBand(spectrum, sampleRate, 4000, 16000).energyBand

        const bucketKey = Math.floor((i * frameMs) / ENERGY_HOP_MS)
        const acc = buckets.get(bucketKey) ?? { b: 0, m: 0, t: 0, o: 0, n: 0 }
        acc.b += Math.sqrt(bass)
        acc.m += Math.sqrt(mids)
        acc.t += Math.sqrt(treble)
        acc.o += Math.sqrt(bass + mids + treble)
        acc.n += 1
        buckets.set(bucketKey, acc)
      } finally {
        spectrum?.delete()
        windowedFrame?.delete()
        inputFrame.delete()
      }
    }
  } finally {
    frames.delete()
  }

  const maxBucketKey = buckets.size ? Math.max(...buckets.keys()) : 0
  const points: EnergyPoint[] = []
  for (let bucketKey = 0; bucketKey <= maxBucketKey; bucketKey++) {
    const acc = buckets.get(bucketKey)
    points.push(acc
      ? { t: bucketKey * ENERGY_HOP_MS, bass: acc.b / acc.n, mids: acc.m / acc.n, treble: acc.t / acc.n, overall: acc.o / acc.n }
      : { t: bucketKey * ENERGY_HOP_MS, bass: 0, mids: 0, treble: 0, overall: 0 })
  }
  return normalizeEnergy(points)
}

function estimateMood(energy: EnergyPoint[], key: string, scale: string, danceability: number): SongAnalysis['mood'] {
  const avg = (sel: (p: EnergyPoint) => number) =>
    energy.length ? energy.reduce((sum, point) => sum + sel(point), 0) / energy.length : 0
  const avgO = avg((p) => p.overall)
  const avgB = avg((p) => p.bass)
  const avgT = avg((p) => p.treble)

  const major = scale.toLowerCase() === 'major'
  const valence = clamp01(0.5 + (major ? 0.15 : -0.15) + (avgT - avgB) * 0.25)
  const moodEnergy = clamp01(0.4 * Math.min(1, avgO * 1.5) + 0.6 * Math.min(1, danceability / 3))

  return { energy: moodEnergy, valence, key: key ? `${key} ${scale}` : 'C major' }
}

export async function analyzeDecodedSong(
  mono: Float32Array,
  sampleRate: number,
  durationMs: number,
  title: string,
): Promise<SongAnalysis> {
  const essentia = await getEssentia()
  const signal = essentia.arrayToVector(mono)
  try {
    const beats = extractRhythm(essentia, signal)
    const energy = extractEnergy(essentia, mono, sampleRate)

    let key = ''
    let scale = 'major'
    let danceability = 0
    try {
      const keyResult = essentia.KeyExtractor(signal)
      key = keyResult.key
      scale = keyResult.scale
    } catch {
      // Key extraction is optional; keep the rest of the analysis.
    }
    try {
      danceability = essentia.Danceability(signal, undefined, undefined, sampleRate).danceability
    } catch {
      // Danceability is optional; keep the rest of the analysis.
    }

    const sections = detectSections(energy, durationMs)
    const mood = estimateMood(energy, key, scale, danceability)
    return { title, durationMs, beats, energy, sections, mood }
  } finally {
    signal.delete()
  }
}

export function formatWorkerError(err: unknown): string {
  if (err instanceof Error) return err.stack || `${err.name}: ${err.message}`
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
