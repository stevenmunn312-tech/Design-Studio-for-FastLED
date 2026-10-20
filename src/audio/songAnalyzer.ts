// ── Song analyzer (main-thread client) ────────────────────────────────────────
// Decodes a file to mono PCM here (decodeAudioData is main-thread only), hands
// the samples to `songAnalyzer.worker.ts` and awaits the finished analysis. One
// worker is created on first use and reused; requests are matched to responses
// by id. If the worker cannot start or fails, the analysis runs here instead.

import type { SongAnalysis, SongAnalysisCore } from '../types/showFile'
import { decodeToMono } from './songAnalysisCommon'
import { analyzeSongSamples } from './fastledSongAnalysis'
import type { AnalyzeRequest, AnalyzeResponse } from './songAnalyzer.worker'
import { recordPerfTask } from '../dev/perfMonitor'

const SAMPLE_RATE = 44100

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (a: SongAnalysisCore) => void; reject: (e: Error) => void }>()

function failAll(err: Error): void {
  for (const p of pending.values()) p.reject(err)
  pending.clear()
  worker?.terminate()
  worker = null
}

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./songAnalyzer.worker.ts', import.meta.url), { type: 'module', name: 'song-analyzer' })
  w.onmessage = (e: MessageEvent<AnalyzeResponse>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.analysis)
    else p.reject(new Error(msg.error))
  }
  w.onerror = (e) => failAll(new Error(e.message || 'song analyzer worker error'))
  w.onmessageerror = () => failAll(new Error('song analyzer worker message error'))
  worker = w
  return w
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => failAll(new Error('song analyzer reloaded')))
}

function analyzeViaWorker(mono: Float32Array, sampleRate: number, durationMs: number, title: string): Promise<SongAnalysisCore> {
  const w = getWorker()
  const id = nextId++
  return new Promise<SongAnalysisCore>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    // Transfer a copy, so the main-thread fallback still has the samples.
    const workerMono = mono.slice()
    const req: AnalyzeRequest = { id, mono: workerMono, sampleRate, durationMs, title }
    w.postMessage(req, [workerMono.buffer])
  })
}

export async function analyzeSong(file: File, onProgress?: (p: number) => void): Promise<SongAnalysis> {
  const decodeStart = performance.now()
  const { mono, sampleRate, durationMs, channelLevels, channelCount } = await decodeToMono(file, SAMPLE_RATE)
  recordPerfTask('musicDecode', performance.now() - decodeStart)
  // Decoding is the only stage measured from here; the worker reports once.
  onProgress?.(0.3)
  const title = file.name.replace(/\.[^/.]+$/, '')
  const analyzeStart = performance.now()
  let analysis: SongAnalysisCore
  let mode: 'worker' | 'main-thread' = 'worker'
  try {
    analysis = await analyzeViaWorker(mono, sampleRate, durationMs, title)
  } catch (err) {
    console.warn('Song analyzer worker failed; analysing on the main thread.', err)
    mode = 'main-thread'
    analysis = analyzeSongSamples(mono, sampleRate, durationMs, title)
  }
  recordPerfTask('musicAnalyze', performance.now() - analyzeStart, { mode })
  return { ...analysis, channelLevels, channelCount }
}
